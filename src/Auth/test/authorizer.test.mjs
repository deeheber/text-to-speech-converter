import assert from 'node:assert/strict';
import util from 'node:util';
import { afterEach, beforeEach, mock, test } from 'node:test';
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import { mockClient } from 'aws-sdk-client-mock';
import { handler } from '../authorizer.mjs';
import { _resetCache, _setNow } from '../secrets.mjs';
import { signToken } from '../token.mjs';

const SIGNING = 'signing-material';
let secrets;

const nowSec = () => Math.floor(Date.now() / 1000);
const call = (authorization) =>
  handler({ headers: authorization === undefined ? {} : { authorization } });

beforeEach(() => {
  process.env.SIGNING_KEY_SECRET_ARN = 'arn:test:signing';
  _resetCache();
  _setNow();
  secrets = mockClient(SecretsManagerClient);
  secrets.on(GetSecretValueCommand).resolves({ SecretString: SIGNING });
});

afterEach(() => {
  secrets.restore();
  mock.restoreAll();
  _setNow();
  _resetCache();
});

test('authorizes a valid token', async () => {
  const { token } = signToken(SIGNING, nowSec(), 60);

  assert.deepEqual(await call(token), { isAuthorized: true });
});

test('rejects expired, tampered, wrong-key, garbage, empty and missing tokens without throwing', async () => {
  const good = signToken(SIGNING, nowSec(), 60).token;
  const [v, exp, sig] = good.split('.');
  const cases = {
    expired: signToken(SIGNING, nowSec() - 120, 60).token,
    tamperedSignature: `${v}.${exp}.${sig[0] === 'A' ? 'B' : 'A'}${sig.slice(1)}`,
    tamperedExpiresAt: `${v}.${Number(exp) + 1000}.${sig}`,
    wrongKey: signToken('other', nowSec(), 60).token,
    garbage: 'garbage',
    empty: '',
    missing: undefined,
  };

  for (const [name, value] of Object.entries(cases)) {
    assert.deepEqual(await call(value), { isAuthorized: false }, name);
  }
});

test('returns false when Secrets Manager fails', async () => {
  mock.method(console, 'error', () => {});
  mock.method(console, 'log', () => {});
  secrets.on(GetSecretValueCommand).rejects(new Error('boom'));

  const { token } = signToken(SIGNING, nowSec(), 60);

  assert.deepEqual(await call(token), { isAuthorized: false });
});

test('fetches the signing key once within the cache window and again after it', async () => {
  mock.method(console, 'log', () => {});

  const { token } = signToken(SIGNING, nowSec(), 600);
  let t = 1_000_000;

  _setNow(() => t);
  await call(token);
  t += 299_999;
  await call(token);

  assert.equal(secrets.commandCalls(GetSecretValueCommand).length, 1);

  t += 1;
  await call(token);

  assert.equal(secrets.commandCalls(GetSecretValueCommand).length, 2);
});

test('never logs the token', async () => {
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

  const { token } = signToken(SIGNING, nowSec(), 60);

  await call(token);
  secrets.on(GetSecretValueCommand).rejects(new Error(`failed ${token}`));
  _resetCache();
  await call(token);

  assert.ok(lines.length > 0);
  assert.ok(lines.every((l) => !l.includes(token) && !l.includes(SIGNING)));
});
