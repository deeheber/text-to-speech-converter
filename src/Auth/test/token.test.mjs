import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { passwordMatches, signToken, verifyToken } from '../token.mjs';

const KEY = 'test-key';
const NOW = 1_700_000_000;

test('signToken returns v1.<expiresAt>.<sig> with expiresAt = nowSec + ttlSec', () => {
  const { token, expiresAt } = signToken(KEY, NOW, 3600);

  assert.equal(expiresAt, NOW + 3600);
  assert.match(token, new RegExp(`^v1\\.${NOW + 3600}\\.[A-Za-z0-9_-]+$`));
});

test('the signature is unpadded base64url HMAC-SHA256 of v1.<expiresAt>', () => {
  const { token, expiresAt } = signToken(KEY, NOW, 60);
  const expected = createHmac('sha256', KEY)
    .update(`v1.${expiresAt}`)
    .digest('base64url');

  assert.equal(token.split('.')[2], expected);
  assert.ok(!token.includes('='));
});

test('verifyToken accepts a fresh token', () => {
  const { token } = signToken(KEY, NOW, 60);

  assert.equal(verifyToken(KEY, token, NOW), true);
  assert.equal(verifyToken(KEY, token, NOW + 59), true);
});

test('verifyToken rejects an expired token', () => {
  const { token } = signToken(KEY, NOW, 60);

  assert.equal(verifyToken(KEY, token, NOW + 60), false);
  assert.equal(verifyToken(KEY, token, NOW + 61), false);
});

test('verifyToken rejects a tampered signature', () => {
  const { token } = signToken(KEY, NOW, 60);
  const [v, exp, sig] = token.split('.');
  const flipped = `${sig[0] === 'A' ? 'B' : 'A'}${sig.slice(1)}`;

  assert.equal(verifyToken(KEY, `${v}.${exp}.${flipped}`, NOW), false);
});

test('verifyToken rejects a tampered expiresAt', () => {
  const { token } = signToken(KEY, NOW, 60);
  const [v, exp, sig] = token.split('.');

  assert.equal(
    verifyToken(KEY, `${v}.${Number(exp) + 1000}.${sig}`, NOW),
    false,
  );
});

test('verifyToken rejects a token signed with another key', () => {
  const { token } = signToken('other-key', NOW, 60);

  assert.equal(verifyToken(KEY, token, NOW), false);
});

test('verifyToken rejects malformed input without throwing', () => {
  const { token } = signToken(KEY, NOW, 60);
  const [, exp, sig] = token.split('.');

  for (const bad of [
    undefined,
    null,
    '',
    'garbage',
    'v1.1',
    'v1.1.a.b',
    `v2.${exp}.${sig}`,
    `v1.1e10.${sig}`,
    `v1.-5.${sig}`,
    `v1.${exp}.${sig.slice(0, -1)}`,
  ]) {
    assert.equal(verifyToken(KEY, bad, NOW), false, String(bad));
  }
});

test('verifyToken rejects correctly signed but non-canonical tokens', () => {
  const sign = (payload) =>
    `${payload}.${createHmac('sha256', KEY).update(payload).digest('base64url')}`;
  const { token, expiresAt } = signToken(KEY, NOW, 60);

  assert.equal(verifyToken(KEY, token, NOW), true);

  for (const bad of [
    `${token}.extra`,
    sign('v1.1e10'),
    sign(`v1. ${expiresAt}`),
    sign(`v1.+${expiresAt}`),
    sign('v1.99999999999999999999'),
  ]) {
    assert.equal(verifyToken(KEY, bad, NOW), false, bad);
  }
});

test('passwordMatches is true only for the same password', () => {
  assert.equal(passwordMatches('hunter2', 'hunter2'), true);
  assert.equal(passwordMatches('hunter2', 'hunter3'), false);
});

test('passwordMatches handles different lengths and non-strings without throwing', () => {
  assert.equal(passwordMatches('hunter2', 'h'), false);
  assert.equal(passwordMatches('hunter2', ''), false);

  for (const bad of [undefined, null, 5, {}]) {
    assert.equal(passwordMatches('hunter2', bad), false);
    assert.equal(passwordMatches(bad, 'hunter2'), false);
  }
});
