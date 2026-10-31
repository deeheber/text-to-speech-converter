import { beforeEach, describe, expect, it, vi } from 'vitest';

const configure = vi.hoisted(() => vi.fn());

vi.mock('aws-amplify', () => ({ Amplify: { configure } }));

import { configureAmplify } from '../src/amplifyConfig.js';
import { clearSession, saveSession } from '../src/session.js';

describe('configureAmplify', () => {
  beforeEach(() => {
    configure.mockReset();
    clearSession();
    localStorage.clear();
  });

  it('configures the backend endpoint', () => {
    configureAmplify({ backendAPI: 'https://api.example.com' });

    expect(configure).toHaveBeenCalledTimes(1);
    expect(configure.mock.calls[0][0]).toEqual({
      API: { REST: { backend: { endpoint: 'https://api.example.com' } } },
    });
  });

  it('headers() returns the token when a session exists', async () => {
    saveSession({
      token: 'abc',
      expiresAt: Math.floor(Date.now() / 1000) + 600,
    });
    configureAmplify({ backendAPI: 'https://api.example.com' });

    const headers = configure.mock.calls[0][1].API.REST.headers;

    await expect(headers()).resolves.toEqual({ Authorization: 'abc' });
  });

  it('headers() returns {} without a session', async () => {
    configureAmplify({ backendAPI: 'https://api.example.com' });

    const headers = configure.mock.calls[0][1].API.REST.headers;

    await expect(headers()).resolves.toEqual({});
  });
});
