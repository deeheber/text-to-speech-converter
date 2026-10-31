import { getSecret } from './secrets.mjs';
import { verifyToken } from './token.mjs';

export const handler = async (event) => {
  console.log('Authorizer invoked', event.requestContext?.requestId, event.routeKey);
  try {
    const signing = await getSecret(process.env.SIGNING_KEY_SECRET_ARN);
    const nowSec = Math.floor(Date.now() / 1000);
    return { isAuthorized: verifyToken(signing, event.headers?.authorization, nowSec) };
  } catch (err) {
    console.error('Authorizer failed', err.name);
    return { isAuthorized: false };
  }
};
