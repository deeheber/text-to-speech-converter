const STORAGE_KEY = 'tts.session';

/* localStorage can throw (storage blocked) or reject writes (storage full), so
   the in-memory copy is authoritative until the page reloads. */
let memorySession = null;

function readRaw() {
  if (memorySession) {
    return JSON.stringify(memorySession);
  }

  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function getSession() {
  const raw = readRaw();

  if (raw === null) {
    return null;
  }

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
