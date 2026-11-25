/**
 * Access and refresh tokens live in localStorage, matching the API's Bearer
 * token design. Subscribers are notified on change so the router can react to
 * sign-in and sign-out, including from other tabs.
 */
const ACCESS_KEY = "bt_access";
const REFRESH_KEY = "bt_refresh";

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

/**
 * True only while this tab signs out on purpose. Session listeners run
 * synchronously inside `clearTokens`, so they can tell a deliberate sign-out
 * (start fresh) from an expired session (return to the page afterwards).
 */
let signingOut = false;
export const isDeliberateSignOut = () => signingOut;
export const clearTokensDeliberately = () => {
  signingOut = true;
  try {
    clearTokens();
  } finally {
    signingOut = false;
  }
};

/**
 * The page to return to after sign-in belongs to whoever was signed in when it
 * was recorded. Stored per tab with the path, so a different account signing
 * in next does not land on a workspace it cannot open.
 */
const RETURN_KEY = "bt_return_to";

export const rememberReturnOwner = (next: string, userId: string) => {
  try {
    sessionStorage.setItem(RETURN_KEY, JSON.stringify({ next, userId }));
  } catch {
    // Without storage the path is simply followed, as before.
  }
};

/** Whether `next` may be followed by `userId`; also forgets the record. */
export const mayReturnTo = (next: string, userId: string) => {
  try {
    const raw = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    const owner = raw ? (JSON.parse(raw) as { next?: string; userId?: string }) : null;
    // A path recorded for another user is theirs; any other path (a link
    // opened while signed out) belongs to nobody in particular.
    return !(owner?.next === next && owner.userId !== userId);
  } catch {
    return true;
  }
};

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
