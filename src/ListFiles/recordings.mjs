import { GetSpeechSynthesisTaskCommand } from '@aws-sdk/client-polly';
import { HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { setTimeout as sleep } from 'node:timers/promises';

export const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const unfinished = (item) =>
  ['STARTING', 'QUEUED', 'PROCESSING', 'UNKNOWN'].includes(item.status) &&
  !item.deleting;
export const publicRecord = (item) => {
  const { id, text, voice, createdAt, status, message } = item;

  return {
    id,
    text,
    voice,
    createdAt,
    status,
    ...(message ? { message } : {}),
    ...(status === 'COMPLETE' && validKey(item.objectKey, id)
      ? {
          url: `${process.env.AUDIO_BASE_URL}/${encodeURIComponent(item.objectKey)}`,
        }
      : {}),
  };
};
export const validKey = (key, id) =>
  typeof key === 'string' &&
  uuid.test(id) &&
  new RegExp(`^${id}\\.[a-zA-Z0-9_-]+\\.mp3$`).test(key);

function taskKey(uri, id) {
  if (!uri) {
    return undefined;
  }

  const url = new URL(uri);
  const bucket = process.env.BUCKET_NAME;
  const path = decodeURIComponent(url.pathname.slice(1));
  const key = [
    `${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com`,
    `${bucket}.s3.amazonaws.com`,
  ].includes(url.hostname)
    ? path
    : /^s3[.-][a-z0-9-]+\.amazonaws\.com$/.test(url.hostname) &&
        path.startsWith(`${bucket}/`)
      ? path.slice(bucket.length + 1)
      : undefined;

  if (!validKey(key, id)) {
    throw new Error('Unexpected Polly output key');
  }

  return key;
}

const unknown = {
  status: 'UNKNOWN',
  message:
    'Conversion outcome is uncertain. Check status before submitting another attempt.',
};

export async function refresh(
  item,
  { database, polly, storage, deadline, clock },
) {
  const send = (client, command) =>
    client.send(command, {
      abortSignal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
    });

  if (!unfinished(item) || Date.now() >= deadline - 100) {
    return item;
  }

  const recoverOutput = async () => {
    const result = await send(
      storage,
      new ListObjectsV2Command({
        Bucket: process.env.BUCKET_NAME,
        Prefix: `${item.id}.`,
        MaxKeys: 2,
      }),
    );
    const matches = (result.Contents ?? []).filter(({ Key }) =>
      validKey(Key, item.id),
    );

    return !result.IsTruncated && matches.length === 1
      ? { status: 'COMPLETE', objectKey: matches[0].Key }
      : { ...unknown };
  };
  let patch = {};

  try {
    if (item.taskId) {
      while (Date.now() < clock.nextPollyAt) {
        const wait = clock.nextPollyAt - Date.now();

        if (Date.now() + wait >= deadline - 100) {
          return item;
        }

        await sleep(wait);
      }

      clock.nextPollyAt = Date.now() + 500;

      let task;

      try {
        ({ SynthesisTask: task } = await send(
          polly,
          new GetSpeechSynthesisTaskCommand({ TaskId: item.taskId }),
        ));
      } catch (error) {
        if (error.name !== 'SynthesisTaskNotFoundException') {
          throw error;
        }
      }

      if (task) {
        const key = taskKey(task.OutputUri, item.id) ?? item.objectKey;

        if (validKey(key, item.id)) {
          patch.objectKey = key;
        }

        if (task.TaskStatus === 'scheduled') {
          patch.status = 'QUEUED';
        } else if (task.TaskStatus === 'inProgress') {
          patch.status = 'PROCESSING';
        } else if (task.TaskStatus === 'failed') {
          patch = {
            ...patch,
            status: 'FAILED',
            message: 'Polly could not synthesize this recording.',
          };
        } else if (task.TaskStatus === 'completed') {
          patch = validKey(key, item.id)
            ? { ...patch, status: 'COMPLETE' }
            : await recoverOutput();
        } else {
          patch = { ...patch, ...unknown };
        }
      } else {
        patch = { ...unknown };

        if (validKey(item.objectKey, item.id)) {
          try {
            await send(
              storage,
              new HeadObjectCommand({
                Bucket: process.env.BUCKET_NAME,
                Key: item.objectKey,
              }),
            );
            patch = { status: 'COMPLETE' };
          } catch (error) {
            if (
              error.name !== 'NotFound' &&
              error.$metadata?.httpStatusCode !== 404
            ) {
              throw error;
            }
          }
        } else {
          patch = await recoverOutput();
        }
      }
    } else if (
      item.status !== 'STARTING' ||
      Date.now() - item.createdAt >= 30000
    ) {
      patch = await recoverOutput();
    }
  } catch (error) {
    /* A failed lookup establishes neither synthesis failure nor missing output. */
    console.error('Refresh recording failed', error.name);
  }

  if (Date.now() >= deadline - 100) {
    return item;
  }

  const next = {
    ...item,
    ...patch,
    lastCheckedAt: Date.now(),
    revision: item.revision + 1,
  };

  if (patch.status && patch.status !== 'UNKNOWN' && patch.status !== 'FAILED') {
    delete next.message;
  }

  const fields = [
    'status',
    'lastCheckedAt',
    'revision',
    ...(next.objectKey ? ['objectKey'] : []),
    ...(next.message ? ['message'] : []),
  ];

  try {
    const updated = await send(
      database,
      new UpdateCommand({
        TableName: process.env.TABLE_NAME,
        Key: { id: item.id },
        ConditionExpression:
          'attribute_exists(id) AND #revision = :before AND createdAt = :createdAt AND attribute_not_exists(deleting)',
        UpdateExpression: `SET ${fields.map((key) => `#${key} = :${key}`).join(', ')}${next.message ? '' : ' REMOVE #message'}`,
        ExpressionAttributeNames: {
          ...Object.fromEntries(fields.map((key) => [`#${key}`, key])),
          '#message': 'message',
        },
        ExpressionAttributeValues: {
          ...Object.fromEntries(fields.map((key) => [`:${key}`, next[key]])),
          ':before': item.revision,
          ':createdAt': item.createdAt,
        },
        ReturnValues: 'ALL_NEW',
      }),
    );

    return updated.Attributes;
  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') {
      const current = await send(
        database,
        new GetCommand({
          TableName: process.env.TABLE_NAME,
          Key: { id: item.id },
          ConsistentRead: true,
        }),
      );

      return current.Item ?? null;
    }

    console.error('Save refreshed status failed', error.name);

    return item;
  }
}
