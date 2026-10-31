import assert from 'node:assert/strict';
import util from 'node:util';
import { afterEach, beforeEach, mock, test } from 'node:test';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  PollyClient,
  StartSpeechSynthesisTaskCommand,
} from '@aws-sdk/client-polly';
import { mockClient } from 'aws-sdk-client-mock';
import { handler } from '../index.js';

const id = '12345678-1234-4123-8123-123456789abc';
const body = (extra = {}) => ({
  body: JSON.stringify({ requestId: id, text: 'hello', ...extra }),
});
const error = (name) => Object.assign(new Error('PRIVATE-TEXT'), { name });
let database, polly, records, logs;

beforeEach(() => {
  process.env.BUCKET_NAME = 'audio';
  process.env.AWS_REGION = 'us-west-2';
  process.env.AUDIO_BASE_URL = 'https://audio.example.com';
  records = new Map();
  logs = [];

  for (const method of ['log', 'info', 'warn', 'error', 'debug']) {
    mock.method(console, method, (...args) => logs.push(util.inspect(args)));
  }

  database = mockClient(DynamoDBDocumentClient);
  database.rejects(new Error('Unexpected database command'));
  database.on(PutCommand).callsFake((input) => {
    if (records.has(input.Item.id)) {
      throw error('ConditionalCheckFailedException');
    }

    records.set(input.Item.id, structuredClone(input.Item));

    return {};
  });
  database
    .on(GetCommand)
    .callsFake((input) => ({ Item: records.get(input.Key.id) }));
  database.on(UpdateCommand).callsFake((input) => {
    const record = records.get(input.Key.id);

    for (const [name, key] of Object.entries(input.ExpressionAttributeNames)) {
      if (name.startsWith('#p')) {
        record[key] = input.ExpressionAttributeValues[name.replace('#', ':')];
      }
    }

    record.revision++;

    return {};
  });
  polly = mockClient(PollyClient);
  polly.on(StartSpeechSynthesisTaskCommand).resolves({
    SynthesisTask: {
      TaskId: 'task-1',
      TaskStatus: 'scheduled',
      OutputUri: `https://s3.us-west-2.amazonaws.com/audio/${id}.task-1.mp3`,
    },
  });
});
afterEach(() => {
  database.restore();
  polly.restore();
  mock.restoreAll();
});

test('rejects malformed UUID, JSON, text and voice before creating or starting a job', async () => {
  for (const event of [
    { body: '{' },
    { body: 'null' },
    body({ requestId: 'bad' }),
    body({ requestId: 12 }),
    body({ text: '' }),
    body({ text: ' \n' }),
    body({ text: null }),
    body({ text: 'a'.repeat(100001) }),
    body({ voice: null }),
  ]) {
    assert.equal((await handler(event)).statusCode, 400);
  }

  assert.equal(database.calls().length, 0);
  assert.equal(polly.calls().length, 0);
});

test('returns 202 with public metadata, starts native Polly and saves its actual output key', async () => {
  const response = await handler(body());

  assert.equal(response.statusCode, 202);

  const row = JSON.parse(response.body);

  assert.equal(row.status, 'QUEUED');
  assert.equal(row.id, id);
  assert.equal(row.voice, 'Matthew');
  assert.deepEqual(Object.keys(row).sort(), [
    'createdAt',
    'id',
    'status',
    'text',
    'voice',
  ]);

  const saved = records.get(id);

  assert.equal(saved.objectKey, `${id}.task-1.mp3`);
  assert.equal(saved.taskId, 'task-1');
  assert.equal(saved.library, 'ALL');
  assert.equal(saved.orderKey, `${saved.createdAt}#${id}`);

  const command = polly.commandCalls(StartSpeechSynthesisTaskCommand)[0];

  assert.equal(command.args[0].input.OutputS3KeyPrefix, id);
  assert.equal(command.args[0].input.Text, 'hello');
  assert.equal(command.args[0].input.Engine, 'standard');
  assert.equal(await command.thisValue.config.maxAttempts(), 1);
  assert.ok(command.args[1].abortSignal instanceof AbortSignal);
  assert.equal(
    database.commandCalls(PutCommand)[0].args[0].input.ConditionExpression,
    'attribute_not_exists(id)',
  );
});

test('keeps an accepted task ID when its output URI is missing or unrecognized', async () => {
  for (const OutputUri of [
    undefined,
    'not a URL',
    `https://other.example.com/${id}.task-1.mp3`,
    `https://s3.us-west-2.amazonaws.com/audio/%broken`,
    `https://s3.us-west-2.amazonaws.com/other-bucket/${id}.task-1.mp3`,
    'https://audio.s3.us-west-2.amazonaws.com/other-recording.mp3',
  ]) {
    records.clear();
    polly.on(StartSpeechSynthesisTaskCommand).resolves({
      SynthesisTask: { TaskId: 'task-1', TaskStatus: 'scheduled', OutputUri },
    });

    const response = await handler(body());

    assert.equal(response.statusCode, 202);
    assert.equal(JSON.parse(response.body).status, 'QUEUED');
    assert.equal(records.get(id).taskId, 'task-1');
    assert.equal(records.get(id).objectKey, undefined);
  }
});

test('accepts global path-style and virtual-hosted S3 output URIs for the configured bucket', async () => {
  for (const host of [
    's3.amazonaws.com/audio',
    'audio.s3.amazonaws.com',
    'audio.s3.us-west-2.amazonaws.com',
  ]) {
    records.clear();
    polly.on(StartSpeechSynthesisTaskCommand).resolves({
      SynthesisTask: {
        TaskId: 'task-1',
        TaskStatus: 'completed',
        OutputUri: `https://${host}/${id}.task-1.mp3`,
      },
    });

    const response = await handler(body());

    assert.equal(
      JSON.parse(response.body).url,
      `https://audio.example.com/${id}.task-1.mp3`,
    );
    assert.equal(records.get(id).status, 'COMPLETE');
  }
});

test('accepts the UTF-16 boundary and truncates previews without splitting a surrogate pair', async () => {
  const text = '😀'.repeat(50000);

  assert.equal(
    (await handler(body({ text, voice: 'Joanna' }))).statusCode,
    202,
  );
  assert.equal(records.get(id).text, '😀'.repeat(1500));
  assert.equal(records.get(id).voice, 'Joanna');
  assert.equal(
    polly.commandCalls(StartSpeechSynthesisTaskCommand)[0].args[0].input.Text,
    text,
  );
});

test('concurrent matching retries share one job; changed text or effective voice conflicts', async () => {
  const results = await Promise.all([handler(body()), handler(body())]);

  assert.ok(results.every((r) => r.statusCode === 202));
  assert.equal((await handler(body({ voice: 'Matthew' }))).statusCode, 202);
  assert.equal((await handler(body({ text: 'different' }))).statusCode, 409);
  assert.equal((await handler(body({ voice: 'Joanna' }))).statusCode, 409);
  assert.equal(polly.commandCalls(StartSpeechSynthesisTaskCommand).length, 1);
});

test('an ambiguous metadata write never starts Polly and a retry can find the existing claim', async () => {
  database.on(PutCommand).callsFake((input) => {
    records.set(id, input.Item);
    throw error('TimeoutError');
  });

  assert.equal((await handler(body())).statusCode, 503);

  database.on(PutCommand).rejects(error('ConditionalCheckFailedException'));

  const retry = await handler(body());

  assert.equal(JSON.parse(retry.body).status, 'STARTING');
  assert.equal(polly.calls().length, 0);
});

for (const [name, status, code] of [
  ['TextLengthExceededException', 'FAILED', 400],
  ['ThrottlingException', 'FAILED', 429],
  ['TimeoutError', 'UNKNOWN', 202],
  ['ServiceFailureException', 'UNKNOWN', 202],
]) {
  test(`${name} becomes ${status} without resynthesis or leaking service details`, async () => {
    polly.on(StartSpeechSynthesisTaskCommand).rejects(error(name));

    const response = await handler(body());

    assert.equal(response.statusCode, code);
    assert.equal(JSON.parse(response.body).status, status);
    assert.equal(records.get(id).status, status);
    assert.equal((await handler(body())).statusCode, 202);
    assert.equal(polly.calls().length, 1);
    assert.ok(!response.body.includes('PRIVATE-TEXT'));
  });
}

test('an accepted task with a failed metadata update remains uncertain and cannot start twice', async () => {
  database.on(UpdateCommand).rejects(error('ServiceUnavailable'));

  assert.equal(JSON.parse((await handler(body())).body).status, 'UNKNOWN');
  assert.equal(JSON.parse((await handler(body())).body).status, 'STARTING');
  assert.equal(polly.calls().length, 1);
});

test('logs request identifiers without headers, text, or raw service errors', async () => {
  polly.on(StartSpeechSynthesisTaskCommand).rejects(error('TimeoutError'));
  await handler({
    ...body({ text: 'PRIVATE-TEXT' }),
    headers: { authorization: 'PRIVATE-TOKEN' },
    requestContext: { requestId: 'req-1' },
    routeKey: 'POST /file',
  });

  assert.ok(logs.some((line) => line.includes('req-1')));
  assert.ok(
    logs.every(
      (line) =>
        !line.includes('PRIVATE-TEXT') && !line.includes('PRIVATE-TOKEN'),
    ),
  );
});
