import { beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.hoisted(() => vi.fn());
vi.mock('aws-amplify/api', () => ({ post }));

import { isAuthError, login } from '../src/api.js';

const httpError = (statusCode) =>
  Object.assign(new Error('x'), { response: { statusCode } });

describe('api', () => {
  beforeEach(() => {
    post.mockReset();
  });

  it('login posts the password to /login and returns the token', async () => {
    const body = { token: 'abc', expiresAt: 123 };
    post.mockReturnValue({
      response: Promise.resolve({ body: { json: async () => body } }),
    });
    await expect(login('hunter2')).resolves.toEqual(body);
    expect(post).toHaveBeenCalledWith({
      apiName: 'backend',
      path: '/login',
      options: { body: { password: 'hunter2' } },
    });
  });

  it('isAuthError is true for 401 and 403', () => {
    expect(isAuthError(httpError(401))).toBe(true);
    expect(isAuthError(httpError(403))).toBe(true);
  });

  it('isAuthError is false for 500 and network errors', () => {
    expect(isAuthError(httpError(500))).toBe(false);
    expect(isAuthError(new Error('Network error'))).toBe(false);
    expect(isAuthError(undefined)).toBe(false);
  });
});
