import { post } from 'aws-amplify/api';

export async function login(password) {
  const { response } = post({
    apiName: 'backend',
    path: '/login',
    options: { body: { password } },
  });
  const result = await response;
  return await result.body.json();
}

export function isAuthError(err) {
  const status = err?.response?.statusCode;
  return status === 401 || status === 403;
}
