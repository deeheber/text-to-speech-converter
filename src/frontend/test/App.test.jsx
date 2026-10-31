import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), del: vi.fn() }));
vi.mock('aws-amplify/api', () => api);

import App from '../src/components/App.jsx';
import { clearSession, saveSession } from '../src/session.js';

const EXPIRED = 'Your session expired. Enter the password again.';

const httpError = (statusCode) =>
  Object.assign(new Error('x'), { response: { statusCode } });
const ok = (body) => ({
  response: Promise.resolve({ body: { json: async () => body } }),
});
const fail = (err) => ({ response: Promise.reject(err) });

const row = {
  id: 'abc',
  text: 'hello',
  status: 'COMPLETE',
  voice: 'Joanna',
  createdAt: 1,
};

let routes;

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  localStorage.clear();
  saveSession({ token: 'abc', expiresAt: Math.floor(Date.now() / 1000) + 600 });
  routes = {
    '/file': () => ok({ Items: [row] }),
    '/voices': () => ok({ Voices: [{ Id: 'Joanna', Name: 'Joanna' }] }),
  };
  api.get.mockImplementation(({ path }) => routes[path]());
  api.post.mockImplementation(() => ok(row));
  api.del.mockImplementation(() => ok({}));
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(window, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Object.values(api).forEach((fn) => fn.mockReset());
});

describe('App auth handling', () => {
  it('calls onLocked when GET /file returns 401', async () => {
    routes['/file'] = () => fail(httpError(401));
    const onLocked = vi.fn();
    render(<App onLocked={onLocked} />);
    await waitFor(() => expect(onLocked).toHaveBeenCalledWith(EXPIRED));
  });

  it('calls onLocked when GET /file returns 403', async () => {
    routes['/file'] = () => fail(httpError(403));
    const onLocked = vi.fn();
    render(<App onLocked={onLocked} />);
    await waitFor(() => expect(onLocked).toHaveBeenCalledWith(EXPIRED));
  });

  it('calls onLocked when a request fails and there is no session', async () => {
    clearSession();
    routes['/voices'] = () => fail(new Error('Network error'));
    const onLocked = vi.fn();
    render(<App onLocked={onLocked} />);
    await waitFor(() => expect(onLocked).toHaveBeenCalledWith(EXPIRED));
  });

  it('does not call onLocked for a network error while the session is valid', async () => {
    routes['/file'] = () => fail(new Error('Network error'));
    routes['/voices'] = () => fail(new Error('Network error'));
    const onLocked = vi.fn();
    render(<App onLocked={onLocked} />);
    await waitFor(() => expect(console.error).toHaveBeenCalled());
    await screen.findByText(/No converted text to speech records found/);
    expect(onLocked).not.toHaveBeenCalled();
  });

  it('calls onLocked when DELETE returns 403', async () => {
    api.del.mockImplementation(() => fail(httpError(403)));
    const onLocked = vi.fn();
    render(<App onLocked={onLocked} />);
    await userEvent.click(await screen.findByRole('button', { name: 'X' }));
    await waitFor(() => expect(onLocked).toHaveBeenCalledWith(EXPIRED));
    expect(window.alert).not.toHaveBeenCalled();
  });

  it('calls onLocked when POST /file returns 401', async () => {
    api.post.mockImplementation(() => fail(httpError(401)));
    const onLocked = vi.fn();
    render(<App onLocked={onLocked} />);
    const user = userEvent.setup();
    await screen.findByText('hello');
    await user.type(document.querySelector('textarea'), 'some text');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(onLocked).toHaveBeenCalledWith(EXPIRED));
  });

  it('the Lock button calls onLocked', async () => {
    const onLocked = vi.fn();
    render(<App onLocked={onLocked} />);
    await screen.findByText('hello');
    await userEvent.click(screen.getByRole('button', { name: 'Lock' }));
    expect(onLocked).toHaveBeenCalledTimes(1);
    expect(onLocked).toHaveBeenCalledWith();
  });
});
