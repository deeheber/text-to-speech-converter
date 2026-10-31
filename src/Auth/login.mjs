import { getSecret } from './secrets.mjs';
import { passwordMatches, signToken } from './token.mjs';

const respond = (statusCode, payload) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(payload),
});

const readPassword = (event) => {
  if (typeof event.body !== 'string' || !event.body) return undefined;
  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    return typeof parsed.password === 'string' && parsed.password
      ? parsed.password
      : undefined;
  } catch {
    return undefined;
  }
};

export const handler = async (event) => {
  console.log('Login invoked', event.requestContext?.requestId, event.routeKey);

  const given = readPassword(event);
  if (typeof given !== 'string') {
    return respond(400, { message: 'Password is required' });
  }

  try {
    const ttlHours = Number(process.env.TOKEN_TTL_HOURS);
    if (!Number.isInteger(ttlHours) || ttlHours < 1) {
      const configError = new Error('Invalid token lifetime');
      configError.name = 'ConfigError';
      throw configError;
    }
    const expected = await getSecret(process.env.PASSWORD_SECRET_ARN);
    if (!passwordMatches(expected, given)) {
      return respond(401, { message: 'Incorrect password' });
    }
    const signing = await getSecret(process.env.SIGNING_KEY_SECRET_ARN);
    const nowSec = Math.floor(Date.now() / 1000);
    return respond(200, signToken(signing, nowSec, ttlHours * 3600));
  } catch (err) {
    console.error('Login failed', err.name);
    return respond(500, { message: 'Login unavailable' });
  }
};
