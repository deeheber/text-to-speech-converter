import assert from 'node:assert/strict';
import util from 'node:util';
import { afterEach, beforeEach, mock, test } from 'node:test';

import { PollyClient, DescribeVoicesCommand } from '@aws-sdk/client-polly';

import { mockClient } from 'aws-sdk-client-mock';

import { handler } from '../index.js';

let polly;

beforeEach(() => {
  mock.method(console, 'log', () => {});
  polly = mockClient(PollyClient);
  polly.rejects(new Error('Unexpected Polly command'));
});
afterEach(() => {
  polly.restore();
  mock.restoreAll();
});

test('returns the successful voice-list response unchanged', async () => {
  const response = { Voices: [{ Id: 'Matthew', Name: 'Matthew' }] };
  polly.on(DescribeVoicesCommand).resolves(response);
  assert.deepEqual(await handler({}), response);
});

test('returns Polly errors without throwing while logging the voice count', async () => {
  for (const [error, expectedStatus] of [
    [new Error('Polly unavailable'), 500],
    [Object.assign(new Error('throttled'), { statusCode: 429 }), 429],
  ]) {
    polly.on(DescribeVoicesCommand).rejects(error);
    const response = await handler({});
    assert.equal(response.statusCode, expectedStatus);
    assert.equal(JSON.parse(response.body), error.message);
  }
});

test('does not log the authorization header', async () => {
  mock.restoreAll();
  const lines = [];
  for (const m of ['log', 'info', 'warn', 'error', 'debug']) {
    mock.method(console, m, (...args) => {
      lines.push(args.map((a) => (typeof a === 'string' ? a : util.inspect(a, { depth: null }))).join(' '));
    });
  }
  polly.on(DescribeVoicesCommand).resolves({ Voices: [] });
  await handler({
    headers: { authorization: 'SECRET-TOKEN-123' },
    requestContext: { requestId: 'req-1' },
    routeKey: 'GET /x',
   
  });
  assert.ok(lines.some((l) => l.includes('req-1')));
  assert.ok(lines.every((l) => !l.includes('SECRET-TOKEN-123')));
});
