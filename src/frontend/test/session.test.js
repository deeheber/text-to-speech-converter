import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, getSession, saveSession } from '../src/session.js';

const future = () => Math.floor(Date.now() / 1000) + 3600;

describe('session', () => {
  beforeEach(() => {
    clearSession();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const blockStorage = () => {
    for (const method of ['getItem', 'setItem', 'removeItem']) {
      vi.spyOn(Storage.prototype, method).mockImplementation(() => {
        throw new DOMException('Storage blocked', 'SecurityError');
      });
    }
  };

  it('saves, reads and clears a session', () => {
    const expiresAt = future();
    saveSession({ token: 'abc', expiresAt });
    expect(getSession()).toEqual({ token: 'abc', expiresAt });
    clearSession();
    expect(getSession()).toBeNull();
    expect(localStorage.getItem('tts.session')).toBeNull();
  });

  it('treats an expired session as null and removes it', () => {
    const expiresAt = Math.floor(Date.now() / 1000) - 1;
    saveSession({ token: 'abc', expiresAt });
    expect(getSession()).toBeNull();
    expect(localStorage.getItem('tts.session')).toBeNull();
  });

  it('treats a session expiring exactly now as expired', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
    const expiresAt = Math.floor(Date.now() / 1000);
    saveSession({ token: 'abc', expiresAt });
    expect(getSession()).toBeNull();
    expect(localStorage.getItem('tts.session')).toBeNull();
  });

  it('treats a malformed entry as null and removes it', () => {
    for (const raw of [
      '{',
      'null',
      '"text"',
      JSON.stringify({ token: 5, expiresAt: future() }),
      JSON.stringify({ token: 'abc', expiresAt: 'soon' }),
      JSON.stringify({ token: 'abc', expiresAt: '9999999999' }),
      JSON.stringify({ token: 'abc' }),
    ]) {
      localStorage.setItem('tts.session', raw);
      expect(getSession()).toBeNull();
      expect(localStorage.getItem('tts.session')).toBeNull();
    }
  });

  it('never writes a password to localStorage', () => {
    saveSession({ token: 'abc', expiresAt: future(), password: 'hunter2' });
    expect(localStorage.length).toBe(1);
    expect(localStorage.key(0)).toBe('tts.session');
    expect(localStorage.getItem('tts.session')).not.toContain('hunter2');
  });

  it('returns null instead of throwing when storage is blocked', () => {
    blockStorage();
    expect(getSession()).toBeNull();
    expect(() => clearSession()).not.toThrow();
  });

  it('keeps the session in memory when storage is blocked', () => {
    blockStorage();
    const expiresAt = future();
    saveSession({ token: 'abc', expiresAt });
    expect(getSession()).toEqual({ token: 'abc', expiresAt });
    clearSession();
    expect(getSession()).toBeNull();
  });
});
