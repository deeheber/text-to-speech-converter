import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), del: vi.fn() }));

vi.mock('aws-amplify/api', () => api);
import Form from '../src/components/Form.jsx';
import App from '../src/components/App.jsx';
import { clearSession, saveSession } from '../src/session.js';

const id = '12345678-1234-4123-8123-123456789abc';
const row = {
  id,
  text: 'new recording',
  status: 'QUEUED',
  voice: 'Matthew',
  createdAt: 1000,
};
const ok = (body) => ({
  response: Promise.resolve({ body: { json: async () => body } }),
});
const failed = (status, body) => ({
  response: Promise.reject(
    Object.assign(new Error('Request failed'), {
      response: { statusCode: status, body: JSON.stringify(body) },
    }),
  ),
});
let file;

beforeEach(() => {
  localStorage.clear();
  saveSession({
    token: 'token',
    expiresAt: Math.floor(Date.now() / 1000) + 600,
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(window, 'alert').mockImplementation(() => {});
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  file = vi.fn(() => ok({ Items: [], nextCursor: null }));
  api.get.mockImplementation(({ path, options }) =>
    path === '/voices'
      ? ok({ Voices: [] })
      : path === '/file'
        ? file(options)
        : ok(row),
  );
  api.post.mockImplementation(() => ok(row));
  api.del.mockImplementation(() => ok({}));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  Object.values(api).forEach((fn) => fn.mockReset());
});

it('keeps one UUID and exact text through an uncertain response and blocks double submission', async () => {
  let resolve;

  api.post.mockImplementationOnce(() => ({
    response: new Promise((done) => {
      resolve = done;
    }),
  }));
  render(<Form onAccepted={vi.fn()} onLocked={vi.fn()} />);

  const user = userEvent.setup();

  await user.type(screen.getByLabelText('Text to convert'), 'Keep this text');
  fireEvent.submit(document.querySelector('form'));
  fireEvent.submit(document.querySelector('form'));

  expect(api.post).toHaveBeenCalledTimes(1);

  const first = api.post.mock.calls[0][0].options.body;

  expect(first.text).toBe('Keep this text');

  await act(async () =>
    resolve({
      body: { json: async () => ({ id: first.requestId, status: 'UNKNOWN' }) },
    }),
  );

  expect(screen.getByLabelText('Text to convert').value).toBe('Keep this text');
  expect(screen.getByLabelText('Text to convert').disabled).toBe(true);

  await user.click(
    screen.getByRole('button', { name: 'Retry same submission' }),
  );

  expect(api.post.mock.calls[1][0].options.body).toEqual(first);
});

it('requires confirmation before a new attempt and generates a fresh UUID', async () => {
  api.post.mockImplementation(({ options }) =>
    ok({ id: options.body.requestId, status: 'UNKNOWN' }),
  );
  render(<Form onAccepted={vi.fn()} onLocked={vi.fn()} />);

  const user = userEvent.setup();

  await user.type(screen.getByLabelText('Text to convert'), 'hello');
  await user.click(screen.getByRole('button', { name: 'Submit', exact: true }));

  const first = api.post.mock.calls[0][0].options.body;

  window.confirm.mockReturnValueOnce(false);
  await user.click(screen.getByRole('button', { name: 'Submit new attempt' }));

  expect(api.post).toHaveBeenCalledTimes(1);

  await user.click(screen.getByRole('button', { name: 'Submit new attempt' }));

  expect(window.confirm).toHaveBeenCalledWith(
    expect.stringContaining('duplicate audio'),
  );
  expect(api.post.mock.calls[1][0].options.body.requestId).not.toBe(
    first.requestId,
  );
  expect(api.post.mock.calls[1][0].options.body.text).toBe('hello');
});

it('recovers a network failure through Check status without starting another conversion', async () => {
  api.post.mockImplementation(() => ({
    response: Promise.reject(new Error('Network error')),
  }));

  const checked = vi.fn();

  render(<Form onAccepted={vi.fn()} onChecked={checked} onLocked={vi.fn()} />);

  const user = userEvent.setup();

  await user.type(screen.getByLabelText('Text to convert'), 'hello');
  await user.click(screen.getByRole('button', { name: 'Submit', exact: true }));

  const requestId = api.post.mock.calls[0][0].options.body.requestId;

  await user.click(screen.getByRole('button', { name: 'Check status' }));

  expect(api.get).toHaveBeenCalledWith(
    expect.objectContaining({ path: `/file/${requestId}` }),
  );
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(checked).toHaveBeenCalledWith(row);
  expect(screen.getByLabelText('Text to convert').value).toBe('');
});

it('keeps rejected text editable, and enforces the same UTF-16 length at submission', async () => {
  api.post.mockImplementation(() =>
    failed(400, { ...row, status: 'FAILED', message: 'Voice rejected' }),
  );
  render(<Form onAccepted={vi.fn()} onLocked={vi.fn()} />);

  const user = userEvent.setup();

  await user.type(screen.getByLabelText('Text to convert'), 'hello');
  await user.click(screen.getByRole('button', { name: 'Submit', exact: true }));

  expect(screen.getByRole('status').textContent).toBe('Voice rejected');

  const text = screen.getByLabelText('Text to convert');

  expect(text.value).toBe('hello');
  expect(text.disabled).toBe(false);
  expect(text.maxLength).toBe(100000);

  fireEvent.change(text, { target: { value: '😀'.repeat(50000) + 'x' } });
  fireEvent.submit(document.querySelector('form'));

  expect(api.post).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('status').textContent).toContain('100,000');
});

it('navigates with server cursors, preserves rows on failure, and supports Previous', async () => {
  file.mockImplementation(({ queryParams }) =>
    !queryParams.cursor
      ? ok({
          Items: [{ ...row, status: 'COMPLETE', text: 'first' }],
          nextCursor: 'page2',
        })
      : ok({
          Items: [{ ...row, status: 'COMPLETE', text: 'second' }],
          nextCursor: null,
        }),
  );
  render(<App onLocked={vi.fn()} />);

  const user = userEvent.setup();

  await screen.findByText('first');
  file.mockImplementationOnce(() => failed(503, 'unavailable'));
  await user.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByRole('alert');

  expect(screen.getByText('first')).toBeTruthy();
  expect(screen.getByText('Page 1')).toBeTruthy();

  await user.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByText('second');

  expect(screen.getByText('Page 2')).toBeTruthy();
  expect(file).toHaveBeenCalledWith({
    queryParams: { limit: '10', cursor: 'page2' },
  });
  expect(screen.getByRole('button', { name: 'Next' }).disabled).toBe(true);

  await user.click(screen.getByRole('button', { name: 'Previous' }));
  await screen.findByText('first');

  expect(screen.getByText('Page 1')).toBeTruthy();
});

it('returns to page one after deletion and confirms UNKNOWN cleanup explicitly', async () => {
  file.mockImplementation(({ queryParams }) =>
    !queryParams.cursor
      ? ok({
          Items: [{ ...row, status: 'COMPLETE', text: 'first' }],
          nextCursor: 'page2',
        })
      : ok({
          Items: [{ ...row, status: 'UNKNOWN', text: 'second' }],
          nextCursor: null,
        }),
  );
  render(<App onLocked={vi.fn()} />);

  const user = userEvent.setup();

  await screen.findByText('first');
  await user.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByText('second');
  window.confirm.mockReturnValueOnce(false);
  await user.click(screen.getByRole('button', { name: 'X' }));

  expect(api.del).not.toHaveBeenCalled();
  expect(screen.getByText('second')).toBeTruthy();

  await user.click(screen.getByRole('button', { name: 'X' }));
  await screen.findByText('first');

  expect(api.del).toHaveBeenCalledWith({
    apiName: 'backend',
    path: `/file/${id}`,
    options: { queryParams: { allowUnknown: 'true' } },
  });
  expect(window.confirm).toHaveBeenCalledWith(
    expect.stringContaining('Late audio'),
  );
  expect(screen.getByText('Page 1')).toBeTruthy();
});

it('polls only while needed, pauses hidden tabs, and clears the timer after completion', async () => {
  vi.useFakeTimers();
  file.mockImplementation(() => ok({ Items: [row] }));

  const hidden = vi.spyOn(document, 'hidden', 'get');

  hidden.mockReturnValue(false);

  const view = render(<App onLocked={vi.fn()} />);

  await act(async () => {});

  expect(file).toHaveBeenCalledTimes(1);

  await act(async () => vi.advanceTimersByTimeAsync(9999));

  expect(file).toHaveBeenCalledTimes(1);

  hidden.mockReturnValue(true);
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  await act(async () => vi.advanceTimersByTimeAsync(30000));

  expect(file).toHaveBeenCalledTimes(1);

  hidden.mockReturnValue(false);
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  await act(async () => {});

  expect(file).toHaveBeenCalledTimes(2);

  file.mockImplementation(() =>
    ok({ Items: [{ ...row, status: 'COMPLETE' }] }),
  );
  await act(async () => vi.advanceTimersByTimeAsync(10000));

  expect(file).toHaveBeenCalledTimes(3);

  await act(async () => vi.advanceTimersByTimeAsync(30000));

  expect(file).toHaveBeenCalledTimes(3);

  file.mockImplementation(() => ok({ Items: [row] }));
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' })),
  );

  expect(vi.getTimerCount()).toBe(1);

  view.unmount();

  expect(vi.getTimerCount()).toBe(0);

  await act(async () => vi.advanceTimersByTimeAsync(30000));

  expect(file).toHaveBeenCalledTimes(4);
});

it('backs off polling errors and stops before issuing a request after session expiry', async () => {
  vi.useFakeTimers();
  file
    .mockImplementationOnce(() => failed(429, 'throttled'))
    .mockImplementation(() => ok({ Items: [row] }));

  const locked = vi.fn();

  render(<App onLocked={locked} />);
  await act(async () => {});
  await act(async () => vi.advanceTimersByTimeAsync(19999));

  expect(file).toHaveBeenCalledTimes(1);

  await act(async () => vi.advanceTimersByTimeAsync(1));

  expect(file).toHaveBeenCalledTimes(2);

  clearSession();
  await act(async () => vi.advanceTimersByTimeAsync(10000));

  expect(locked).toHaveBeenCalledWith(
    'Your session expired. Enter the password again.',
  );
  expect(file).toHaveBeenCalledTimes(2);
});

it('continues polling until an accepted recording appears, and disables deleting active jobs', async () => {
  vi.useFakeTimers();
  render(<App onLocked={vi.fn()} />);
  await act(async () => {});
  fireEvent.change(screen.getByLabelText('Text to convert'), {
    target: { value: 'hello' },
  });
  await act(async () => fireEvent.submit(document.querySelector('form')));

  expect(file).toHaveBeenCalledTimes(2);

  file.mockImplementation(() => ok({ Items: [row] }));
  await act(async () => vi.advanceTimersByTimeAsync(10000));

  expect(screen.getByText('new recording')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'X' }).disabled).toBe(true);

  file.mockImplementation(() =>
    ok({ Items: [{ ...row, status: 'COMPLETE' }] }),
  );
  await act(async () => vi.advanceTimersByTimeAsync(10000));

  expect(screen.getByRole('button', { name: 'X' }).disabled).toBe(false);

  await act(async () => vi.advanceTimersByTimeAsync(20000));

  expect(file).toHaveBeenCalledTimes(4);
});

it('keeps the current page when the form checks a submission status', async () => {
  const older = {
    ...row,
    id: 'older',
    status: 'COMPLETE',
    text: 'older recording',
  };

  file.mockImplementation(({ queryParams }) =>
    ok({ Items: [older], nextCursor: queryParams.cursor ? null : 'page2' }),
  );
  api.post.mockImplementation(() => ok({ ...row, status: 'UNKNOWN' }));
  render(<App onLocked={vi.fn()} />);

  const user = userEvent.setup();

  await screen.findByText('older recording');
  await user.type(screen.getByLabelText('Text to convert'), 'hello');
  await user.click(screen.getByRole('button', { name: 'Submit', exact: true }));
  await user.click(screen.getByRole('button', { name: 'Next' }));

  expect(screen.getByText('Page 2')).toBeTruthy();

  await user.click(screen.getByRole('button', { name: 'Check status' }));

  expect(screen.getByText('Page 2')).toBeTruthy();
  expect(file.mock.lastCall[0].queryParams.cursor).toBe('page2');
  expect(screen.getByRole('status').textContent).toContain('queued');
});

it('pauses waiting for an unlisted submission on later pages and resumes on page one', async () => {
  vi.useFakeTimers();
  const older = {
    ...row,
    id: 'older',
    status: 'COMPLETE',
    text: 'older recording',
  };

  file.mockImplementation(() => ok({ Items: [older], nextCursor: 'page2' }));
  render(<App onLocked={vi.fn()} />);
  await act(async () => {});
  fireEvent.change(screen.getByLabelText('Text to convert'), {
    target: { value: 'hello' },
  });
  await act(async () => fireEvent.submit(document.querySelector('form')));
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Next' })),
  );

  const calls = file.mock.calls.length;

  expect(screen.getByText('Page 2')).toBeTruthy();

  await act(async () => vi.advanceTimersByTimeAsync(30000));

  expect(file).toHaveBeenCalledTimes(calls);

  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Previous' })),
  );
  file.mockImplementation(() =>
    ok({ Items: [{ ...row, status: 'COMPLETE' }] }),
  );
  await act(async () => vi.advanceTimersByTimeAsync(10000));

  expect(screen.getByText('new recording')).toBeTruthy();

  await act(async () => vi.advanceTimersByTimeAsync(20000));

  expect(file).toHaveBeenCalledTimes(calls + 2);
});

it('ignores a response from a previous page load after a submission resets the page', async () => {
  let resolve;

  file
    .mockImplementationOnce(() => ({
      response: new Promise((done) => {
        resolve = done;
      }),
    }))
    .mockImplementation(() => ok({ Items: [{ ...row, status: 'COMPLETE' }] }));
  render(<App onLocked={vi.fn()} />);

  const user = userEvent.setup();

  await user.type(screen.getByLabelText('Text to convert'), 'hello');
  await user.click(screen.getByRole('button', { name: 'Submit', exact: true }));
  await screen.findByText('new recording');
  await act(async () =>
    resolve({
      body: {
        json: async () => ({ Items: [{ ...row, text: 'stale response' }] }),
      },
    }),
  );

  expect(screen.queryByText('stale response')).toBeNull();
  expect(screen.getByText('new recording')).toBeTruthy();
});
