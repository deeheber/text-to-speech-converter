import assert from 'node:assert/strict';
import util from 'node:util';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { DynamoDBDocumentClient, DeleteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { handler } from '../index.js';

let database;
let storage;

const event = {
  pathParameters: { id: 'abc' },
  headers: { authorization: 'SECRET-TOKEN-123' },
  requestContext: { requestId: 'req-1' },
  routeKey: 'DELETE /file/{id}',
};

beforeEach(() => {
  database = mockClient(DynamoDBDocumentClient);
  database.on(GetCommand).resolves({ Item: { id: 'abc' } });
  database.on(DeleteCommand).resolves({});
  storage = mockClient(S3Client);
  storage.on(DeleteObjectCommand).resolves({});
});

afterEach(() => {
  database.restore();
  storage.restore();
  mock.restoreAll();
});

test('does not log the authorization header', async () => {
  const lines = [];
  for (const m of ['log', 'info', 'warn', 'error', 'debug']) {
    mock.method(console, m, (...args) => {
      lines.push(args.map((a) => (typeof a === 'string' ? a : util.inspect(a, { depth: null }))).join(' '));
    });
  }
  await handler(event);
  assert.ok(lines.some((l) => l.includes('req-1')));
  assert.ok(lines.every((l) => !l.includes('SECRET-TOKEN-123')));
});

test('deletes the object and the record for an existing id', async () => {
  mock.method(console, 'log', () => {});
  const response = await handler(event);
  assert.equal(response, JSON.stringify('Success deleting item'));
  assert.equal(storage.commandCalls(DeleteObjectCommand).length, 1);
  assert.equal(database.commandCalls(DeleteCommand).length, 1);
});

test('returns 404 when the id does not exist', async () => {
  mock.method(console, 'log', () => {});
  database.on(GetCommand).resolves({});
  const response = await handler(event);
  assert.equal(response.statusCode, 404);
  assert.equal(storage.commandCalls(DeleteObjectCommand).length, 0);
});
