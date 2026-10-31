import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { handler } from '../index.js';
let database;
beforeEach(() => {
  mock.method(console, 'log', () => {});
  process.env.AUDIO_BASE_URL = 'https://audio.example.com';
  database = mockClient(DynamoDBDocumentClient);
});

afterEach(() => { database.restore(); mock.restoreAll(); delete process.env.AUDIO_BASE_URL; });
test('replaces legacy links, keeps ordering and hides unfinished links without rewriting records', async () => {
  const items = [
    { id: 'old id', status: 'COMPLETE', createdAt: 1, url: 'https://old.s3.amazonaws.com/old.mp3', text: 'hello' },
    { id: 'new', status: 'COMPLETE', createdAt: 4, url: 'https://stale.example.com/new.mp3' },
    { id: 'failed', status: 'FAILED', createdAt: 3, url: 'https://stale.example.com/failed.mp3' },
    { id: 'processing', status: 'PROCESSING', createdAt: 2 },
  ];
  const original = structuredClone(items);
  database.on(ScanCommand).resolves({ Items: items });
  const { Items } = JSON.parse(await handler({}));
  assert.deepEqual(Items.map(item => item.id), ['new', 'failed', 'processing', 'old id']);
  assert.equal(Items[0].url, 'https://audio.example.com/new.mp3');
  assert.equal(Items[3].url, 'https://audio.example.com/old%20id.mp3');
  assert.equal(Items[3].text, 'hello');
  assert.ok(!('url' in Items[1]));
  assert.ok(!('url' in Items[2]));
  assert.deepEqual(items, original);
  assert.equal(database.calls().length, 1);
});
test('preserves empty lists and scan error responses', async () => {
  database.on(ScanCommand).resolves({ Items: [] });
  assert.deepEqual(JSON.parse(await handler({})), { Items: [] });
  database.on(ScanCommand).rejects(Object.assign(new Error('scan unavailable'), { statusCode: 503 }));
  const response = await handler({});
  assert.equal(response.statusCode, 503);
  assert.equal(JSON.parse(response.body), 'scan unavailable');
});
