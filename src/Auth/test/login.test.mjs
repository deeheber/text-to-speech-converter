import assert from 'node:assert/strict';
import util from 'node:util';
import { afterEach, beforeEach, mock, test } from 'node:test';
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import { mockClient } from 'aws-sdk-client-mock';
import { handler } from '../login.mjs';
import { _resetCache, _setNow } from '../secrets.mjs';
import { verifyToken } from '../token.mjs';

const PASSWORD = 'correct horse';
const SIGNING = 'signing-material';
let secrets;

const post = (payload, extra = {}) =>
  handler({ body: JSON.stringify(payload), ...extra });

beforeEach(() => {
  process.env.PASSWORD_SECRET_ARN = 'arn:test:password';
  process.env.SIGNING_KEY_SECRET_ARN = 'arn:test:signing';
  process.env.TOKEN_TTL_HOURS = '2';
  _resetCache();
  _setNow();
  secrets = mockClient(SecretsManagerClient);
  secrets
    .on(GetSecretValueCommand, { SecretId: 'arn:test:password' })
    .resolves({ SecretString: PASSWORD });
  secrets
    .on(GetSecretValueCommand, { SecretId: 'arn:test:signing' })
    .resolves({ SecretString: SIGNING });
  mock.method(console, 'log', () => {});
  mock.method(console, 'error', () => {});
});

afterEach(() => {
  secrets.restore();
  mock.restoreAll();
  _resetCache();
});

const assertCommon = (response) => {
  assert.equal(response.headers['Content-Type'], 'application/json');
  assert.equal(response.headers['Cache-Control'], 'no-store');
};

test('returns 200 with a token that verifyToken accepts', async () => {
  const response = await post({ password: PASSWORD });
  const nowSec = Math.floor(Date.now() / 1000);

  assert.equal(response.statusCode, 200);

  const { token, expiresAt } = JSON.parse(response.body);

  assert.ok(Math.abs(expiresAt - (nowSec + 2 * 3600)) <= 1);
  assert.equal(verifyToken(SIGNING, token, nowSec), true);
});

test('returns 401 for a wrong password', async () => {
  const response = await post({ password: 'nope' });

  assert.equal(response.statusCode, 401);
  assert.deepEqual(JSON.parse(response.body), {
    message: 'Incorrect password',
  });
});

test('returns 400 for missing, non-string or empty passwords and bad JSON', async () => {
  const events = [
    {},
    { body: '' },
    { body: '{' },
    { body: 'null' },
    { body: '5' },
    { body: '[]' },
    { body: '{}' },
    { body: JSON.stringify({ password: 5 }) },
    { body: JSON.stringify({ password: '' }) },
  ];

  for (const event of events) {
    const response = await handler(event);

    assert.equal(response.statusCode, 400, JSON.stringify(event));
    assert.deepEqual(JSON.parse(response.body), {
      message: 'Password is required',
    });
  }
});

test('accepts a base64-encoded body', async () => {
  const body = Buffer.from(JSON.stringify({ password: PASSWORD })).toString(
    'base64',
  );
  const response = await handler({ body, isBase64Encoded: true });

  assert.equal(response.statusCode, 200);
});

test('returns 500 when Secrets Manager fails', async () => {
  secrets.on(GetSecretValueCommand).rejects(new Error('boom'));

  const response = await post({ password: PASSWORD });

  assert.equal(response.statusCode, 500);
  assert.deepEqual(JSON.parse(response.body), { message: 'Login unavailable' });
});

test('returns 500 when the token lifetime is not a positive integer', async () => {
  for (const bad of ['', 'abc', '0', '-1', '1.5']) {
    process.env.TOKEN_TTL_HOURS = bad;

    const response = await post({ password: PASSWORD });

    assert.equal(response.statusCode, 500, bad);
  }
});

test('sets Cache-Control no-store on every response', async () => {
  secrets
    .on(GetSecretValueCommand, { SecretId: 'arn:test:password' })
    .resolves({ SecretString: PASSWORD });
  assertCommon(await post({ password: PASSWORD }));
  assertCommon(await post({ password: 'nope' }));
  assertCommon(await handler({}));
  secrets.on(GetSecretValueCommand).rejects(new Error('boom'));
  _resetCache();
  assertCommon(await post({ password: PASSWORD }));
});

test('never logs the password or the token', async () => {
  mock.restoreAll();

  const lines = [];

  for (const m of ['log', 'info', 'warn', 'error', 'debug']) {
    mock.method(console, m, (...args) => {
      lines.push(
        args
          .map((a) =>
            typeof a === 'string' ? a : util.inspect(a, { depth: null }),
          )
          .join(' '),
      );
    });
  }

  const ok = await post(
    { password: PASSWORD },
    { requestContext: { requestId: 'req-1' } },
  );
  const { token } = JSON.parse(ok.body);

  await post({ password: 'wrong-guess' });
  secrets
    .on(GetSecretValueCommand)
    .rejects(new Error(`failed ${PASSWORD} ${token}`));
  _resetCache();
  await post({ password: PASSWORD });

  assert.ok(lines.length > 0);

  for (const secret of [PASSWORD, 'wrong-guess', token, SIGNING]) {
    assert.ok(lines.every((l) => !l.includes(secret)));
  }
});
