import assert from 'node:assert/strict';
import util from 'node:util';
import { afterEach, beforeEach, mock, test } from 'node:test';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  PollyClient,
  GetSpeechSynthesisTaskCommand,
} from '@aws-sdk/client-polly';
import {
  S3Client,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { handler } from '../index.js';

const id = '12345678-1234-4123-8123-123456789abc';
const key = `${id}.task-1.mp3`;
const row = (extra = {}) => ({
  id,
  text: 'hello',
  voice: 'Matthew',
  createdAt: 1000000000000,
  status: 'QUEUED',
  taskId: 'task-1',
  objectKey: key,
  revision: 1,
  library: 'ALL',
  orderKey: `1000000000000#${id}`,
  requestHash: 'private-hash',
  ...extra,
});
let database, polly, storage, items, logs;

beforeEach(() => {
  process.env.AWS_REGION = 'us-west-2';
  process.env.BUCKET_NAME = 'audio';
  process.env.AUDIO_BASE_URL = 'https://audio.example.com';
  items = [row()];
  logs = [];

  for (const method of ['log', 'info', 'warn', 'error', 'debug']) {
    mock.method(console, method, (...args) => logs.push(util.inspect(args)));
  }

  database = mockClient(DynamoDBDocumentClient);
  database.rejects(new Error('Unexpected database command'));
  database
    .on(QueryCommand)
    .callsFake(() => ({ Items: structuredClone(items) }));
  database.on(GetCommand).callsFake((input) => ({
    Item: structuredClone(items.find((r) => r.id === input.Key.id)),
  }));
  database.on(UpdateCommand).callsFake((input) => {
    const item = items.find((r) => r.id === input.Key.id);

    for (const [name, field] of Object.entries(
      input.ExpressionAttributeNames,
    )) {
      if (
        Object.hasOwn(input.ExpressionAttributeValues, name.replace('#', ':'))
      ) {
        item[field] = input.ExpressionAttributeValues[name.replace('#', ':')];
      }
    }

    if (!Object.hasOwn(input.ExpressionAttributeValues, ':message')) {
      delete item.message;
    }

    return { Attributes: structuredClone(item) };
  });
  polly = mockClient(PollyClient);
  polly.on(GetSpeechSynthesisTaskCommand).resolves({
    SynthesisTask: {
      TaskStatus: 'completed',
      OutputUri: `https://s3.us-west-2.amazonaws.com/audio/${key}`,
    },
  });
  storage = mockClient(S3Client);
  storage.rejects(new Error('Unexpected storage command'));
});
afterEach(() => {
  database.restore();
  polly.restore();
  storage.restore();
  mock.restoreAll();
});

const parse = async (event = {}) => JSON.parse((await handler(event)).body);

test('uses bounded descending index queries and returns opaque continuation keys with no internals', async () => {
  items = [
    row({ status: 'COMPLETE' }),
    row({
      id: '22345678-1234-4123-8123-123456789abc',
      status: 'FAILED',
      message: 'Failed',
    }),
  ];

  const continuation = { id, library: 'ALL', orderKey: `1000000000000#${id}` };

  database
    .on(QueryCommand)
    .resolvesOnce({ Items: items, LastEvaluatedKey: continuation })
    .resolves({ Items: [] });

  const page = await parse();

  assert.equal(page.Items.length, 2);
  assert.equal(page.Items[0].url, `https://audio.example.com/${key}`);
  assert.ok(!('url' in page.Items[1]));
  assert.deepEqual(Object.keys(page.Items[0]).sort(), [
    'createdAt',
    'id',
    'status',
    'text',
    'url',
    'voice',
  ]);

  const query = database.commandCalls(QueryCommand)[0].args[0].input;

  assert.equal(query.IndexName, 'RecordingsByCreatedAt');
  assert.equal(query.ScanIndexForward, false);
  assert.equal(query.Limit, 10);
  assert.deepEqual(
    await parse({
      queryStringParameters: { cursor: page.nextCursor, limit: '50' },
    }),
    { Items: [], nextCursor: null },
  );
  assert.deepEqual(
    database.commandCalls(QueryCommand)[1].args[0].input.ExclusiveStartKey,
    continuation,
  );
  assert.equal(database.commandCalls(QueryCommand)[1].args[0].input.Limit, 50);
});

test('rejects invalid pagination keys and IDs without AWS calls', async () => {
  const cursor = (value) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');

  for (const queryStringParameters of [
    { limit: '0' },
    { limit: '51' },
    { limit: '1.5' },
    { limit: '01' },
    { cursor: 'bad!' },
    { cursor: cursor(null) },
    {
      cursor: cursor({ id, library: 'OTHER', orderKey: `1000000000000#${id}` }),
    },
    { cursor: cursor({ id, library: 'ALL', orderKey: `1000000000000#wrong` }) },
  ]) {
    assert.equal((await handler({ queryStringParameters })).statusCode, 400);
  }

  assert.equal(
    (await handler({ pathParameters: { id: 'bad' } })).statusCode,
    400,
  );
  assert.equal(database.calls().length, 0);
});

for (const [taskStatus, status] of [
  ['scheduled', 'QUEUED'],
  ['inProgress', 'PROCESSING'],
  ['completed', 'COMPLETE'],
  ['failed', 'FAILED'],
]) {
  test(`refreshes ${taskStatus} with a guarded write and only exposes a complete download`, async () => {
    polly
      .on(GetSpeechSynthesisTaskCommand)
      .resolves({ SynthesisTask: { TaskStatus: taskStatus } });

    const page = await parse();

    assert.equal(page.Items[0].status, status);
    assert.equal('url' in page.Items[0], status === 'COMPLETE');

    const update = database.commandCalls(UpdateCommand)[0].args[0].input;

    assert.match(update.ConditionExpression, /attribute_exists\(id\)/);
    assert.match(
      update.ConditionExpression,
      /attribute_not_exists\(deleting\)/,
    );
    assert.equal(update.ExpressionAttributeValues[':before'], 1);
    assert.equal(update.ExpressionAttributeValues[':revision'], 2);
  });
}

test('expired task history recovers a stored object, but missing output stays UNKNOWN', async () => {
  polly
    .on(GetSpeechSynthesisTaskCommand)
    .rejects({ name: 'SynthesisTaskNotFoundException' });
  storage.on(HeadObjectCommand).resolves({});

  assert.equal((await parse()).Items[0].status, 'COMPLETE');

  items = [row()];
  storage
    .on(HeadObjectCommand)
    .rejects({ name: 'NotFound', $metadata: { httpStatusCode: 404 } });

  const page = await parse();

  assert.equal(page.Items[0].status, 'UNKNOWN');
  assert.ok(!('url' in page.Items[0]));
});

test('lost task IDs recover exactly one matching output and never infer failure from absence or ambiguity', async () => {
  for (const [Contents, IsTruncated, status] of [
    [[{ Key: key }], false, 'COMPLETE'],
    [[], false, 'UNKNOWN'],
    [[{ Key: key }, { Key: `${id}.other.mp3` }], false, 'UNKNOWN'],
    [[{ Key: key }], true, 'UNKNOWN'],
    [[{ Key: 'another-job.mp3' }], false, 'UNKNOWN'],
  ]) {
    items = [
      row({ taskId: undefined, objectKey: undefined, status: 'STARTING' }),
    ];
    storage.on(ListObjectsV2Command).resolves({ Contents, IsTruncated });

    assert.equal((await parse()).Items[0].status, status);
  }

  assert.equal(polly.calls().length, 0);
  assert.equal(
    storage.commandCalls(ListObjectsV2Command)[0].args[0].input.Prefix,
    `${id}.`,
  );
});

test('gives a STARTING submission time to persist its task before attempting S3 recovery', async () => {
  let now = Date.now();

  mock.method(Date, 'now', () => now);
  items = [
    row({
      status: 'STARTING',
      taskId: undefined,
      objectKey: undefined,
      createdAt: now,
    }),
  ];

  assert.equal((await parse()).Items[0].status, 'STARTING');
  assert.equal(storage.calls().length, 0);

  now += 31000;
  storage.on(ListObjectsV2Command).resolves({ Contents: [] });

  assert.equal((await parse()).Items[0].status, 'UNKNOWN');
});

test('recovers completed output when Polly omitted the output URI, including after task expiry', async () => {
  storage.on(ListObjectsV2Command).resolves({ Contents: [{ Key: key }] });
  items = [row({ objectKey: undefined })];
  polly
    .on(GetSpeechSynthesisTaskCommand)
    .resolves({ SynthesisTask: { TaskStatus: 'completed' } });

  assert.equal(
    (await parse()).Items[0].url,
    `https://audio.example.com/${key}`,
  );

  items = [row({ objectKey: undefined })];
  polly
    .on(GetSpeechSynthesisTaskCommand)
    .rejects({ name: 'SynthesisTaskNotFoundException' });

  assert.equal(
    (await parse()).Items[0].url,
    `https://audio.example.com/${key}`,
  );
});

test('does not classify lookup permission/network errors as a failed or missing conversion', async () => {
  polly
    .on(GetSpeechSynthesisTaskCommand)
    .rejects({ name: 'AccessDeniedException' });

  assert.equal((await parse()).Items[0].status, 'QUEUED');
  assert.equal(storage.calls().length, 0);
});

test('refresh selects the five least recently checked rows, then gives later rows their turn', async () => {
  items = Array.from({ length: 6 }, (_, n) =>
    row({
      id: `${n + 1}2345678-1234-4123-8123-123456789abc`,
      taskId: undefined,
      objectKey: undefined,
      status: 'UNKNOWN',
      lastCheckedAt: n,
    }),
  );
  storage.on(ListObjectsV2Command).resolves({ Contents: [] });
  await parse();

  assert.equal(database.commandCalls(UpdateCommand).length, 5);
  assert.ok(
    !database
      .commandCalls(UpdateCommand)
      .some((call) => call.args[0].input.Key.id === items[5].id),
  );

  database.resetHistory();
  await parse();

  assert.equal(
    database.commandCalls(UpdateCommand)[0].args[0].input.Key.id,
    items[5].id,
  );
});

test('refresh enforces its shared Polly rate and stops once the request budget is spent', async () => {
  items = [
    row(),
    row({
      id: '22345678-1234-4123-8123-123456789abc',
      taskId: 'task-2',
      objectKey: undefined,
    }),
  ];

  const starts = [];

  polly.on(GetSpeechSynthesisTaskCommand).callsFake(() => {
    starts.push(Date.now());

    return { SynthesisTask: { TaskStatus: 'inProgress' } };
  });
  await parse();

  assert.ok(starts[1] - starts[0] >= 490);

  let now = 1000000000000;

  mock.method(Date, 'now', () => now);
  database.on(QueryCommand).callsFake(() => {
    now += 8000;

    return { Items: items };
  });
  polly.resetHistory();
  await parse();

  assert.equal(polly.calls().length, 0);
});

test('conditional refresh conflicts read the current record and never recreate deleted records', async () => {
  database
    .on(UpdateCommand)
    .rejects({ name: 'ConditionalCheckFailedException' });
  database.on(GetCommand).resolves({});

  assert.deepEqual((await parse()).Items, []);
  assert.equal((await handler({ pathParameters: { id } })).statusCode, 404);

  database.on(GetCommand).resolves({ Item: row({ status: 'COMPLETE' }) });

  assert.equal((await parse()).Items[0].status, 'COMPLETE');
});

test('single-record lookup returns public metadata and uses a consistent read', async () => {
  const record = await parse({ pathParameters: { id } });

  assert.equal(record.status, 'COMPLETE');
  assert.ok(!('revision' in record));
  assert.equal(
    database.commandCalls(GetCommand)[0].args[0].input.ConsistentRead,
    true,
  );
  assert.equal(database.commandCalls(QueryCommand).length, 0);
});

test('does not leak tokens, recording text, or raw AWS errors into logs or errors', async () => {
  database.on(QueryCommand).rejects(new Error('PRIVATE-TEXT'));

  const response = await handler({
    headers: { authorization: 'PRIVATE-TOKEN' },
    requestContext: { requestId: 'req-1' },
    routeKey: 'GET /file',
  });

  assert.equal(response.statusCode, 503);
  assert.ok(!response.body.includes('PRIVATE-TEXT'));
  assert.ok(logs.some((line) => line.includes('req-1')));
  assert.ok(
    logs.every(
      (line) =>
        !line.includes('PRIVATE-TEXT') && !line.includes('PRIVATE-TOKEN'),
    ),
  );
});
