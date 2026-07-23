/** ftrack credential persistence — keep keys out of React state after login. */

const AUTH_KEY = 'ftrack_auth';
const LLM_KEY = 'llm_settings';

/**
 * @param {{ server: string, user: string, apiKey: string }} creds
 * @param {{ remember?: boolean }} [opts] remember=true → localStorage; false → session only
 */
export function saveAuth(creds, { remember = true } = {}) {
  if (!creds?.server || !creds?.user || !creds?.apiKey) return;
  const payload = JSON.stringify({
    server: creds.server,
    user: creds.user,
    apiKey: creds.apiKey,
    remember: !!remember,
  });
  try {
    localStorage.removeItem(AUTH_KEY);
    sessionStorage.removeItem(AUTH_KEY);
    if (remember) localStorage.setItem(AUTH_KEY, payload);
    else sessionStorage.setItem(AUTH_KEY, payload);
  } catch {
    /* private mode / quota */
  }
}

/** @returns {{ server: string, user: string, apiKey: string, remember?: boolean } | null} */
export function loadAuth() {
  try {
    const raw = sessionStorage.getItem(AUTH_KEY) || localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.server || !data?.user || !data?.apiKey) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearAuth() {
  try {
    localStorage.removeItem(AUTH_KEY);
    sessionStorage.removeItem(AUTH_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * LLM provider settings — same remember/session pattern as ftrack auth.
 */
export function saveLlmSettingsSecure(settings, { remember = true } = {}) {
  if (!settings?.provider || !settings?.apiKey) return;
  const payload = JSON.stringify({ ...settings, remember: !!remember });
  try {
    localStorage.removeItem(LLM_KEY);
    sessionStorage.removeItem(LLM_KEY);
    if (remember) localStorage.setItem(LLM_KEY, payload);
    else sessionStorage.setItem(LLM_KEY, payload);
  } catch { /* ignore */ }
}

export function loadLlmSettingsSecure() {
  try {
    const raw = sessionStorage.getItem(LLM_KEY) || localStorage.getItem(LLM_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.provider || !data?.apiKey) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearLlmSettingsSecure() {
  try {
    localStorage.removeItem(LLM_KEY);
    sessionStorage.removeItem(LLM_KEY);
  } catch { /* ignore */ }
}

/** Strip credential query params before logging / toasts. */
export function redactUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(String(url));
    for (const key of [...u.searchParams.keys()]) {
      if (/key|token|password|secret|api|auth|sig/i.test(key)) {
        u.searchParams.set(key, '***');
      }
    }
    return u.toString();
  } catch {
    return String(url).replace(
      /([?&](?:api[_-]?key|apiKey|token|password|signature)=)[^&]*/gi,
      '$1***',
    );
  }
}
