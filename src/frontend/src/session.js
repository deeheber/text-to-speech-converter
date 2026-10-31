const STORAGE_KEY = 'tts.session';

export function getSession() {
  const raw = localStorage.getItem(STORAGE_KEY);
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
  localStorage.removeItem(STORAGE_KEY);
  return null;
}

export function saveSession({ token, expiresAt }) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, expiresAt }));
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}
