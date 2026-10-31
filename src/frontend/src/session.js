const STORAGE_KEY = 'tts.session';

/* Browsers that block site storage throw on every localStorage call. The
   in-memory copy keeps the app usable until the page reloads. */
let memorySession = null;

function readRaw() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return memorySession && JSON.stringify(memorySession);
  }
}

export function getSession() {
  const raw = readRaw();
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.token === 'string' &&
      typeof parsed.expiresAt === 'number' &&
      parsed.expiresAt > Math.floor(Date.now() / 1000)
    ) {
      return { token: parsed.token, expiresAt: parsed.expiresAt };
    }
  } catch {
    // fall through to clearing the entry
  }
  clearSession();
  return null;
}

export function saveSession({ token, expiresAt }) {
  memorySession = { token, expiresAt };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memorySession));
  } catch {
    // storage blocked: memorySession is used instead
  }
}

export function clearSession() {
  memorySession = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage blocked: nothing persisted to remove
  }
}
