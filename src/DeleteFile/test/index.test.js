import assert from 'node:assert/strict';
import util from 'node:util';
import { afterEach, beforeEach, mock, test } from 'node:test';
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { handler } from '../index.js';

const id = '12345678-1234-4123-8123-123456789abc';
const key = `${id}.task-1.mp3`;
const event = { pathParameters: { id } };
let database, storage, item, logs;

beforeEach(() => {
  process.env.BUCKET_NAME = 'audio';
  item = {
    id,
    status: 'COMPLETE',
    objectKey: key,
    revision: 2,
    createdAt: 1000,
  };
  database = mockClient(DynamoDBDocumentClient);
  database.on(GetCommand).callsFake(() => ({ Item: item }));
  database.on(UpdateCommand).callsFake((input) => {
    item.deleting = input.ExpressionAttributeValues[':yes'];

    return {};
  });
  database.on(DeleteCommand).resolves({});
  storage = mockClient(S3Client);
  storage.on(DeleteObjectCommand).resolves({});
  storage.on(ListObjectsV2Command).resolves({ Contents: [] });
  logs = [];

  for (const method of ['log', 'info', 'warn', 'error', 'debug']) {
    mock.method(console, method, (...args) => logs.push(util.inspect(args)));
  }
});
afterEach(() => {
  database.restore();
  storage.restore();
  mock.restoreAll();
});

test('deletion locks a terminal record, removes its actual key, and conditionally deletes its metadata', async () => {
  storage.on(DeleteObjectCommand).callsFake(() => {
    assert.equal(item.deleting, true);

    return {};
  });

  const response = await handler(event);

  assert.equal(response.statusCode, 200);

  const lock = database.commandCalls(UpdateCommand)[0].args[0].input;

  assert.equal(lock.UpdateExpression, 'SET deleting = :yes');
  assert.equal(lock.ExpressionAttributeValues[':status'], 'COMPLETE');
  assert.equal(lock.ExpressionAttributeValues[':revision'], 2);
  assert.match(lock.ConditionExpression, /attribute_exists\(id\)/);
  assert.equal(
    storage.commandCalls(DeleteObjectCommand)[0].args[0].input.Key,
    key,
  );
  assert.match(
    database.commandCalls(DeleteCommand)[0].args[0].input.ConditionExpression,
    /deleting = :yes/,
  );
});

test('rejects malformed or missing ids without AWS calls and missing recordings without S3 calls', async () => {
  assert.equal((await handler({})).statusCode, 400);
  assert.equal(
    (await handler({ pathParameters: { id: 'bad' } })).statusCode,
    400,
  );
  assert.equal(database.calls().length, 0);

  item = undefined;

  assert.equal((await handler(event)).statusCode, 404);
  assert.equal(storage.calls().length, 0);
});

test('confirmed active jobs and unconfirmed UNKNOWN deletions never touch storage', async () => {
  for (const status of ['STARTING', 'QUEUED', 'PROCESSING', 'UNKNOWN']) {
    item.status = status;

    assert.equal((await handler(event)).statusCode, 409);
  }

  assert.equal(database.commandCalls(UpdateCommand).length, 0);
  assert.equal(storage.calls().length, 0);
});

test('confirmed UNKNOWN cleanup follows S3 continuation tokens and only deletes this job’s audio', async () => {
  item.status = 'UNKNOWN';
  storage
    .on(ListObjectsV2Command)
    .resolvesOnce({
      Contents: [{ Key: key }, { Key: 'unrelated.mp3' }],
      IsTruncated: true,
      NextContinuationToken: 'next',
    })
    .resolvesOnce({ Contents: [{ Key: `${id}.task-2.mp3` }] });

  assert.equal(
    (
      await handler({
        ...event,
        queryStringParameters: { allowUnknown: 'true' },
      })
    ).statusCode,
    200,
  );
  assert.deepEqual(
    storage
      .commandCalls(DeleteObjectCommand)
      .map((call) => call.args[0].input.Key),
    [key, `${id}.task-2.mp3`],
  );
  assert.equal(
    storage.commandCalls(ListObjectsV2Command)[1].args[0].input
      .ContinuationToken,
    'next',
  );
});

test('storage failures retain the deletion lock and metadata for a safe retry', async () => {
  storage.on(DeleteObjectCommand).rejects(new Error('PRIVATE-TEXT'));

  assert.equal((await handler(event)).statusCode, 503);
  assert.equal(database.commandCalls(DeleteCommand).length, 0);
  assert.equal(item.deleting, true);

  storage.on(DeleteObjectCommand).resolves({});
  database.resetHistory();

  assert.equal((await handler(event)).statusCode, 200);
  assert.equal(database.commandCalls(UpdateCommand).length, 0);
});

test('a concurrent status change prevents object deletion', async () => {
  database
    .on(UpdateCommand)
    .rejects({ name: 'ConditionalCheckFailedException' });

  assert.equal((await handler(event)).statusCode, 409);
  assert.equal(storage.calls().length, 0);
});

test('deletes a failed submission without inventing an object key and refuses an unrelated stored key', async () => {
  item.status = 'FAILED';
  delete item.objectKey;

  assert.equal((await handler(event)).statusCode, 200);
  assert.equal(storage.calls().length, 0);

  item = {
    id,
    status: 'COMPLETE',
    objectKey: 'unrelated.mp3',
    revision: 2,
    createdAt: 1000,
  };
  database.resetHistory();

  assert.equal((await handler(event)).statusCode, 503);
  assert.equal(database.commandCalls(DeleteCommand).length, 0);
});

test('logs request IDs without credentials, text or service details', async () => {
  storage.on(DeleteObjectCommand).rejects(new Error('PRIVATE-TEXT'));

  const response = await handler({
    ...event,
    headers: { authorization: 'PRIVATE-TOKEN' },
    requestContext: { requestId: 'req-1' },
    routeKey: 'DELETE /file/{id}',
  });

  assert.ok(!response.body.includes('PRIVATE-TEXT'));
  assert.ok(logs.some((line) => line.includes('req-1')));
  assert.ok(
    logs.every(
      (line) =>
        !line.includes('PRIVATE-TEXT') && !line.includes('PRIVATE-TOKEN'),
    ),
  );
});
