import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const post = vi.hoisted(() => vi.fn());

vi.mock('aws-amplify/api', () => ({ post }));

import PasswordForm from '../src/components/PasswordForm.jsx';
import { getSession } from '../src/session.js';

const respondWith = (body) =>
  post.mockReturnValue({
    response: Promise.resolve({ body: { json: async () => body } }),
  });
const failWith = (statusCode) => {
  const err = statusCode
    ? Object.assign(new Error('x'), { response: { statusCode } })
    : new Error('Network error');

  post.mockImplementation(() => ({ response: Promise.reject(err) }));
};

const submit = async (password = 'hunter2') => {
  const user = userEvent.setup();

  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Unlock' }));
};

describe('PasswordForm', () => {
  beforeEach(() => {
    post.mockReset();
    localStorage.clear();
  });
  afterEach(cleanup);

  it('saves the session and calls onUnlocked on success', async () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 600;

    respondWith({ token: 'abc', expiresAt });

    const onUnlocked = vi.fn();

    render(<PasswordForm onUnlocked={onUnlocked} />);
    await submit();
    await waitFor(() => expect(onUnlocked).toHaveBeenCalledTimes(1));

    expect(onUnlocked).toHaveBeenCalledWith();
    expect(getSession()).toEqual({ token: 'abc', expiresAt });
    expect(localStorage.getItem('tts.session')).not.toContain('hunter2');
  });

  it('shows the incorrect-password message on 401', async () => {
    failWith(401);
    render(<PasswordForm onUnlocked={vi.fn()} />);
    await submit();

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Incorrect password.',
    );
  });

  it('shows the too-many-attempts message on 429', async () => {
    failWith(429);
    render(<PasswordForm onUnlocked={vi.fn()} />);
    await submit();

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Too many attempts. Wait a minute and try again.',
    );
  });

  it('shows the connection message on other errors', async () => {
    failWith(undefined);
    render(<PasswordForm onUnlocked={vi.fn()} />);
    await submit();

    expect((await screen.findByRole('alert')).textContent).toBe(
      "Couldn't reach the server. Try again.",
    );
  });

  it('empties the input after every submit', async () => {
    failWith(401);
    render(<PasswordForm onUnlocked={vi.fn()} />);
    await submit();
    await screen.findByRole('alert');

    expect(screen.getByLabelText('Password').value).toBe('');

    respondWith({
      token: 'abc',
      expiresAt: Math.floor(Date.now() / 1000) + 600,
    });
    await submit('another');
    await waitFor(() =>
      expect(screen.getByLabelText('Password').value).toBe(''),
    );
  });

  it('disables Unlock while the request is in flight', async () => {
    let resolve;

    post.mockReturnValue({
      response: new Promise((r) => {
        resolve = r;
      }),
    });
    render(<PasswordForm onUnlocked={vi.fn()} />);
    await submit();

    expect(screen.getByRole('button', { name: 'Unlock' }).disabled).toBe(true);

    resolve({
      body: {
        json: async () => ({
          token: 'abc',
          expiresAt: Math.floor(Date.now() / 1000) + 600,
        }),
      },
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Unlock' }).disabled).toBe(
        false,
      ),
    );
  });

  it('shows the notice prop in the alert', async () => {
    render(
      <PasswordForm
        onUnlocked={vi.fn()}
        notice="Your session expired. Enter the password again."
      />,
    );

    expect(screen.getByRole('alert').textContent).toBe(
      'Your session expired. Enter the password again.',
    );

    failWith(401);
    await submit();

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Incorrect password.',
    );
  });
});
