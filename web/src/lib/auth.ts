/**
 * Access and refresh tokens live in localStorage, matching the API's Bearer
 * token design. Subscribers are notified on change so the router can react to
 * sign-in and sign-out, including from other tabs.
 */
const ACCESS_KEY = "tf_access";
const REFRESH_KEY = "tf_refresh";

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

export const getTokens = (): Tokens | null => {
  const accessToken = read(ACCESS_KEY);
  const refreshToken = read(REFRESH_KEY);
  return accessToken && refreshToken ? { accessToken, refreshToken } : null;
};

export const setTokens = (tokens: Tokens) => {
  localStorage.setItem(ACCESS_KEY, tokens.accessToken);
  localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
  notify();
};

export const clearTokens = () => {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  notify();
};

export const hasSession = () => getTokens() !== null;

export const onSessionChange = (listener: () => void) => {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === ACCESS_KEY || event.key === REFRESH_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
};
