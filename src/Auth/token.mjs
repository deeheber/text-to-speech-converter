import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const VERSION = 'v1';

const mac = (key, payload) =>
  createHmac('sha256', key).update(payload).digest('base64url');

export const signToken = (key, nowSec, ttlSec) => {
  const expiresAt = Math.floor(nowSec + ttlSec);
  const payload = `${VERSION}.${expiresAt}`;
  return { token: `${payload}.${mac(key, payload)}`, expiresAt };
};

export const verifyToken = (key, token, nowSec) => {
  if (typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [version, expPart, sig] = parts;
  if (version !== VERSION) return false;
  if (!/^[0-9]+$/.test(expPart)) return false;
  const expiresAt = Number(expPart);
  if (!Number.isSafeInteger(expiresAt)) return false;
  if (expiresAt <= nowSec) return false;
  const expectedSig = Buffer.from(mac(key, `${VERSION}.${expPart}`));
  const givenSig = Buffer.from(sig);
  if (givenSig.length !== expectedSig.length) return false;
  return timingSafeEqual(givenSig, expectedSig);
};

const sha256 = (value) => createHash('sha256').update(value).digest();

export const passwordMatches = (expected, given) => {
  if (typeof expected !== 'string' || typeof given !== 'string') return false;
  return timingSafeEqual(sha256(expected), sha256(given));
};
