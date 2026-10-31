import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), del: vi.fn() }));
vi.mock('aws-amplify/api', () => api);

import PasswordGate from '../src/components/PasswordGate.jsx';
import { saveSession } from '../src/session.js';

const future = () => Math.floor(Date.now() / 1000) + 600;
const ok = (body) => ({
  response: Promise.resolve({ body: { json: async () => body } }),
});
const httpError = (statusCode) =>
  Object.assign(new Error('x'), { response: { statusCode } });

const row = { id: 'abc', text: 'hello row', status: 'COMPLETE', voice: 'Joanna', createdAt: 1 };

let routes;

const unlock = async (password = 'hunter2') => {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Unlock' }));
};

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  localStorage.clear();
  routes = {
    '/file': () => ok({ Items: [row] }),
    '/voices': () => ok({ Voices: [{ Id: 'Joanna', Name: 'Joanna' }] }),
  };
  api.get.mockImplementation(({ path }) => routes[path]());
  api.post.mockImplementation(() => ok({ token: 'abc', expiresAt: future() }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Object.values(api).forEach((fn) => fn.mockReset());
});

describe('PasswordGate', () => {
  it('shows the form without a session', () => {
    render(<PasswordGate />);
    expect(screen.getByLabelText('Password')).toBeTruthy();
    expect(api.get).not.toHaveBeenCalled();
  });

  it('shows the app when a valid session exists', async () => {
    saveSession({ token: 'abc', expiresAt: future() });
    render(<PasswordGate />);
    expect(await screen.findByText('hello row')).toBeTruthy();
    expect(screen.queryByLabelText('Password')).toBeNull();
  });

  it('unlocks with the correct password', async () => {
    render(<PasswordGate />);
    await unlock();
    expect(await screen.findByText('hello row')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('tts.session')).token).toBe('abc');
  });

  it('shows the 401 and 429 messages', async () => {
    api.post.mockImplementation(() => ({ response: Promise.reject(httpError(401)) }));
    render(<PasswordGate />);
    await unlock();
    expect((await screen.findByRole('alert')).textContent).toBe('Incorrect password.');
    api.post.mockImplementation(() => ({ response: Promise.reject(httpError(429)) }));
    await unlock();
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        'Too many attempts. Wait a minute and try again.',
      ),
    );
  });

  it('empties the input after submit', async () => {
    api.post.mockImplementation(() => ({ response: Promise.reject(httpError(401)) }));
    render(<PasswordGate />);
    await unlock();
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Password').value).toBe('');
  });

  it('Lock removes the table rows and clears the session', async () => {
    saveSession({ token: 'abc', expiresAt: future() });
    render(<PasswordGate />);
    await screen.findByText('hello row');
    await userEvent.click(screen.getByRole('button', { name: 'Lock' }));
    expect(screen.queryByText('hello row')).toBeNull();
    expect(document.body.textContent).not.toContain('hello row');
    expect(localStorage.getItem('tts.session')).toBeNull();
    expect(screen.getByLabelText('Password')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('an auth error in the app returns to the form with the expired message', async () => {
    saveSession({ token: 'abc', expiresAt: future() });
    routes['/file'] = () => ({ response: Promise.reject(httpError(401)) });
    render(<PasswordGate />);
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Your session expired. Enter the password again.',
    );
    expect(localStorage.getItem('tts.session')).toBeNull();
  });
});
