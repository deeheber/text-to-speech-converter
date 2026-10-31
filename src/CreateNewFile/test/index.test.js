import assert from 'node:assert/strict';
import { unlink } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { afterEach, beforeEach, mock, test } from 'node:test';

import {
  DynamoDBDocumentClient,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { PollyClient, SynthesizeSpeechCommand } from '@aws-sdk/client-polly';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

import { mockClient } from 'aws-sdk-client-mock';

import { handler } from '../index.js';

let database;
let polly;
let storage;
let createdIds;

beforeEach(() => {
  createdIds = [];
  mock.method(console, 'log', () => {});
  database = mockClient(DynamoDBDocumentClient);
  database.rejects(new Error('Unexpected DynamoDB command'));
  database.on(PutCommand).callsFake((input) => {
    createdIds.push(input.Item.id);
    return {};
  });
  database
    .on(UpdateCommand, {
      ExpressionAttributeValues: { ':status': 'COMPLETE' },
    })
    .callsFake((input) => ({
      Attributes: {
        id: input.Key.id,
        status: 'COMPLETE',
        url: 'https://example.com/audio.mp3',
      },
    }));
  database
    .on(UpdateCommand, {
      ExpressionAttributeValues: { ':status': 'FAILED' },
    })
    .resolves({});

  polly = mockClient(PollyClient);
  polly.rejects(new Error('Unexpected Polly command'));
  polly.on(SynthesizeSpeechCommand).callsFake((input) => ({
    AudioStream: Readable.from([`audio:${input.Text}`]),
  }));

  storage = mockClient(S3Client);
  storage.rejects(new Error('Unexpected S3 command'));
  storage.on(PutObjectCommand).callsFake(async (input) => {
    for await (const chunk of input.Body) {
      // Consume the upload stream before the test removes the temporary file.
    }
    return {};
  });
});

afterEach(async () => {
  for (const call of storage.commandCalls(PutObjectCommand)) {
    const stream = call.args[0].input.Body;
    stream.destroy();
    await finished(stream, { cleanup: true }).catch((error) => {
      if (error.code !== 'ERR_STREAM_PREMATURE_CLOSE') throw error;
    });
  }
  database.restore();
  polly.restore();
  storage.restore();
  mock.restoreAll();
  for (const id of createdIds) {
    await unlink(`/tmp/${id}.mp3`).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
});

test('rejects invalid requests before AWS calls', async () => {
  for (const body of [
    '{',
    'null',
    '{}',
    JSON.stringify({ text: 1 }),
    JSON.stringify({ text: '' }),
    JSON.stringify({ text: ' \n\t' }),
    JSON.stringify({ text: 'hello', voice: null }),
    JSON.stringify({ text: 'hello', voice: 1 }),
  ]) {
    const response = await handler({ body });
    assert.equal(response.statusCode, 400, body);
    assert.equal(typeof JSON.parse(response.body), 'string');
  }
  assert.equal(database.calls().length, 0);
  assert.equal(polly.calls().length, 0);
  assert.equal(storage.calls().length, 0);
});

test('keeps default and selected voices and the successful response format', async () => {
  for (const [voice, expectedVoice] of [
    [undefined, 'Matthew'],
    ['', 'Matthew'],
    ['Joanna', 'Joanna'],
  ]) {
    const response = JSON.parse(
      await handler({ body: JSON.stringify({ text: 'hello', voice }) }),
    );
    assert.equal(response.status, 'COMPLETE');
    assert.equal(response.id, createdIds.at(-1));
    assert.equal(response.url, 'https://example.com/audio.mp3');
    const input = polly.commandCalls(SynthesizeSpeechCommand).at(-1)
      .args[0].input;
    assert.equal(input.VoiceId, expectedVoice);
    assert.equal(input.Text, 'hello');
  }
});

test('sends bounded chunks to Polly and uploads the complete audio', async () => {
  const text = 'a'.repeat(2501);
  let uploaded;
  storage.on(PutObjectCommand).callsFake(async (input) => {
    uploaded = '';
    for await (const chunk of input.Body) uploaded += chunk.toString();
    return {};
  });

  const response = JSON.parse(
    await handler({ body: JSON.stringify({ text }) }),
  );
  assert.equal(response.status, 'COMPLETE');
  assert.deepEqual(
    polly
      .commandCalls(SynthesizeSpeechCommand)
      .map((call) => call.args[0].input.Text),
    ['a'.repeat(2500), 'a'],
  );
  assert.equal(uploaded, `audio:${'a'.repeat(2500)}audio:a`);
  assert.equal(
    database.commandCalls(PutCommand)[0].args[0].input.Item.text,
    text.substring(0, 1500),
  );
});

test('does not create a FAILED record when the initial write fails', async () => {
  database.on(PutCommand).rejects(new Error('metadata unavailable'));
  const response = await handler({ body: JSON.stringify({ text: 'hello' }) });
  assert.equal(response.statusCode, 500);
  assert.equal(JSON.parse(response.body), 'metadata unavailable');
  assert.equal(database.calls().length, 1);
  assert.equal(polly.calls().length, 0);
  assert.equal(storage.calls().length, 0);
});

for (const [service, Command] of [
  ['Polly', SynthesizeSpeechCommand],
  ['S3', PutObjectCommand],
]) {
  test(`marks an existing record FAILED after a ${service} failure`, async () => {
    const client = service === 'Polly' ? polly : storage;
    client.on(Command).rejects(new Error('conversion failed'));
    const response = await handler({ body: JSON.stringify({ text: 'hello' }) });
    assert.equal(response.statusCode, 500);
    assert.equal(JSON.parse(response.body), 'conversion failed');
    const failed = database.commandCalls(UpdateCommand).at(-1).args[0].input;
    assert.equal(failed.Key.id, createdIds.at(-1));
    assert.deepEqual(failed.ExpressionAttributeValues, { ':status': 'FAILED' });
  });
}

test('preserves the original error when marking FAILED also fails', async () => {
  polly
    .on(SynthesizeSpeechCommand)
    .rejects(
      Object.assign(new Error('Polly unavailable'), { statusCode: 503 }),
    );
  database
    .on(UpdateCommand, {
      ExpressionAttributeValues: { ':status': 'FAILED' },
    })
    .rejects(new Error('status update unavailable'));
  const response = await handler({ body: JSON.stringify({ text: 'hello' }) });
  assert.equal(response.statusCode, 503);
  assert.equal(JSON.parse(response.body), 'Polly unavailable');
  assert.equal(database.calls().length, 2);
});

test('marks the record FAILED if recording the completed upload fails', async () => {
  database
    .on(UpdateCommand, {
      ExpressionAttributeValues: { ':status': 'COMPLETE' },
    })
    .rejects(new Error('completion update failed'));

  const response = await handler({ body: JSON.stringify({ text: 'hello' }) });
  assert.equal(response.statusCode, 500);
  assert.equal(JSON.parse(response.body), 'completion update failed');
  const updates = database
    .commandCalls(UpdateCommand)
    .map((call) => call.args[0].input);
  assert.deepEqual(
    updates.map((input) => input.ExpressionAttributeValues[':status']),
    ['COMPLETE', 'FAILED'],
  );
  assert.ok(updates.every((input) => input.Key.id === createdIds[0]));
});
