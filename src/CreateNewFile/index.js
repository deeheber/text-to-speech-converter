import { createHash } from 'node:crypto';
import {
  PollyClient,
  StartSpeechSynthesisTaskCommand,
} from '@aws-sdk/client-polly';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const rejected = new Set([
  'ValidationException',
  'InvalidParameterValueException',
  'TextLengthExceededException',
  'EngineNotSupportedException',
  'LanguageNotSupportedException',
  'InvalidS3BucketException',
  'InvalidS3KeyException',
  'InvalidSampleRateException',
  'InvalidSsmlException',
  'LexiconNotFoundException',
  'MarksNotSupportedForFormatException',
  'SsmlMarksNotSupportedForTextTypeException',
  'AccessDeniedException',
  'ThrottlingException',
]);
const reply = (statusCode, value) => ({
  statusCode,
  body: JSON.stringify(value),
});

function publicRecord(item) {
  const { id, text, voice, status, createdAt, message } = item;

  return {
    id,
    text,
    voice,
    status,
    createdAt,
    ...(message ? { message } : {}),
    ...(status === 'COMPLETE' && item.objectKey
      ? {
          url: `${process.env.AUDIO_BASE_URL}/${item.objectKey.split('/').map(encodeURIComponent).join('/')}`,
        }
      : {}),
  };
}

function outputKey(uri, id) {
  if (!uri) {
    return undefined;
  }

  const url = new URL(uri);
  const bucket = process.env.BUCKET_NAME;
  const path = decodeURIComponent(url.pathname.slice(1));
  const key =
    url.hostname === `${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com` ||
    url.hostname === `${bucket}.s3.amazonaws.com`
      ? path
      : /^s3[.-][a-z0-9-]+\.amazonaws\.com$/.test(url.hostname) &&
          path.startsWith(`${bucket}/`)
        ? path.slice(bucket.length + 1)
        : undefined;

  if (!key || !new RegExp(`^${id}\\.[a-zA-Z0-9_-]+\\.mp3$`).test(key)) {
    throw new Error('Unexpected Polly output key');
  }

  return key;
}

export const handler = async (event, context = {}) => {
  console.log('CreateNewFile invoked', {
    requestId: event.requestContext?.requestId,
    routeKey: event.routeKey,
  });

  let data;

  try {
    data = JSON.parse(event.body);
  } catch {
    return reply(400, 'Request body must be valid JSON');
  }

  if (!uuid.test(data?.requestId ?? '')) {
    return reply(400, 'requestId must be a UUID v4');
  }

  if (
    typeof data.text !== 'string' ||
    !data.text.trim() ||
    data.text.length > 100000
  ) {
    return reply(400, 'Text must contain 1 to 100,000 UTF-16 code units');
  }

  if (data.voice !== undefined && typeof data.voice !== 'string') {
    return reply(400, 'Voice must be a string');
  }

  const id = data.requestId.toLowerCase();
  const voice = data.voice || 'Matthew';
  const requestHash = createHash('sha256')
    .update(JSON.stringify([data.text, voice]))
    .digest('hex');

  const createdAt = Date.now();
  const item = {
    id,
    text: Array.from(data.text).slice(0, 1500).join(''),
    voice,
    createdAt,
    status: 'STARTING',
    revision: 0,
    requestHash,
    library: 'ALL',
    orderKey: `${String(createdAt).padStart(13, '0')}#${id}`,
  };

  const database = DynamoDBDocumentClient.from(
    new DynamoDBClient({
      region: process.env.AWS_REGION,
      maxAttempts: 2,
      requestHandler: { connectionTimeout: 1000, requestTimeout: 1500 },
    }),
  );

  const deadline =
    Date.now() +
    Math.min(
      14000,
      Math.max(1, (context.getRemainingTimeInMillis?.() ?? 15000) - 500),
    );
  const send = (command) =>
    database.send(command, {
      abortSignal: AbortSignal.timeout(
        Math.max(1, Math.min(2000, deadline - Date.now())),
      ),
    });

  const getExisting = async () =>
    (
      await send(
        new GetCommand({
          TableName: process.env.TABLE_NAME,
          Key: { id },
          ConsistentRead: true,
        }),
      )
    ).Item;

  try {
    await send(
      new PutCommand({
        TableName: process.env.TABLE_NAME,
        Item: item,
        ConditionExpression: 'attribute_not_exists(id)',
      }),
    );
  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') {
      try {
        const existing = await getExisting();

        if (!existing) {
          return reply(409, 'Recording was deleted; start a new submission');
        }

        return existing.requestHash === requestHash
          ? reply(202, publicRecord(existing))
          : reply(409, 'requestId already belongs to different text or voice');
      } catch (readError) {
        console.error('Read submission failed', readError.name);
      }
    } else {
      console.error('Create metadata failed', error.name);
    }

    return reply(
      503,
      'Submission could not be confirmed. Check status or retry with the same requestId.',
    );
  }

  let patch;
  let responseCode = 202;

  try {
    const remaining = deadline - Date.now();
    const timeout = Math.max(1, Math.min(8000, remaining - 3000));
    const polly = new PollyClient({
      region: process.env.AWS_REGION,
      maxAttempts: 1,
      requestHandler: { connectionTimeout: 1000, requestTimeout: timeout },
    });

    const { SynthesisTask: task } = await polly.send(
      new StartSpeechSynthesisTaskCommand({
        Engine: 'standard',
        OutputFormat: 'mp3',
        TextType: 'text',
        Text: data.text,
        VoiceId: voice,
        OutputS3BucketName: process.env.BUCKET_NAME,
        OutputS3KeyPrefix: id,
      }),
      { abortSignal: AbortSignal.timeout(timeout) },
    );

    if (!task?.TaskId) {
      throw new Error('Missing Polly task ID');
    }

    patch = {
      taskId: task.TaskId,
      status: task.TaskStatus === 'inProgress' ? 'PROCESSING' : 'QUEUED',
    };

    const key = outputKey(task.OutputUri, id);

    if (key) {
      patch.objectKey = key;
    }

    if (task.TaskStatus === 'failed') {
      patch = {
        ...patch,
        status: 'FAILED',
        message: 'Polly could not synthesize this recording.',
      };
    }

    if (task.TaskStatus === 'completed' && key) {
      patch.status = 'COMPLETE';
    }
  } catch (error) {
    console.error('Start synthesis failed', error.name);

    const definite = rejected.has(error.name);

    patch = {
      status: definite ? 'FAILED' : 'UNKNOWN',
      message: definite
        ? 'Polly rejected this submission. Check the text, voice, or service configuration.'
        : 'Start outcome is uncertain. Check status before submitting another attempt.',
    };

    if (definite) {
      responseCode =
        error.name === 'ThrottlingException'
          ? 429
          : error.name === 'AccessDeniedException'
            ? 503
            : 400;
    }
  }

  try {
    const names = Object.fromEntries(
      Object.keys(patch).map((key, i) => [`#p${i}`, key]),
    );
    const values = Object.fromEntries(
      Object.values(patch).map((value, i) => [`:p${i}`, value]),
    );

    await send(
      new UpdateCommand({
        TableName: process.env.TABLE_NAME,
        Key: { id },
        ConditionExpression:
          '#status = :starting AND createdAt = :createdAt AND attribute_exists(id)',
        UpdateExpression: `SET ${Object.keys(patch)
          .map((_, i) => `#p${i} = :p${i}`)
          .join(', ')} ADD revision :one`,
        ExpressionAttributeNames: { ...names, '#status': 'status' },
        ExpressionAttributeValues: {
          ...values,
          ':starting': 'STARTING',
          ':createdAt': createdAt,
          ':one': 1,
        },
      }),
    );
  } catch (error) {
    console.error('Save synthesis status failed', error.name);
    /* A lost write response must not cause a second synthesis attempt. */
    return reply(
      202,
      publicRecord({
        ...item,
        status: 'UNKNOWN',
        message:
          'Status could not be saved. Check status before submitting another attempt.',
      }),
    );
  }

  const record = publicRecord({ ...item, ...patch });

  return responseCode === 202
    ? reply(202, record)
    : reply(responseCode, record);
};
