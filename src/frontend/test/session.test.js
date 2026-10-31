import { beforeEach, describe, expect, it } from 'vitest';
import { clearSession, getSession, saveSession } from '../src/session.js';

const future = () => Math.floor(Date.now() / 1000) + 3600;

describe('session', () => {
  beforeEach(() => {
    localStorage.clear();
  });

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

  it('treats a malformed entry as null and removes it', () => {
    for (const raw of [
      '{',
      'null',
      '"text"',
      JSON.stringify({ token: 5, expiresAt: future() }),
      JSON.stringify({ token: 'abc', expiresAt: 'soon' }),
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
});
