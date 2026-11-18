import { clearTokens, getTokens, setTokens, type Tokens } from "./auth";
import type { Paginated } from "./types";

export const API_URL = import.meta.env.VITE_API_URL ?? "/api";

export interface ApiErrorDetail {
  path: string;
  message: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: ApiErrorDetail[];

  constructor(
    status: number,
    code: string,
    message: string,
    details: ApiErrorDetail[] = [],
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** Field errors keyed by request path, for showing next to form inputs. */
  get fieldErrors(): Record<string, string> {
    return Object.fromEntries(this.details.map((d) => [d.path, d.message]));
  }
}

type QueryValue = string | number | boolean | string[] | undefined | null;
export type Query = Record<string, QueryValue>;

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Query;
  /** Skip the Authorization header (login, register, refresh). */
  anonymous?: boolean;
  signal?: AbortSignal;
}

const buildUrl = (path: string, query: Query = {}) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) value.forEach((item) => params.append(key, item));
    else params.set(key, String(value));
  }
  const search = params.toString();
  return `${API_URL}${path}${search ? `?${search}` : ""}`;
};

const toError = (status: number, payload: unknown) => {
  const error = (payload as { error?: Record<string, unknown> } | null)?.error;
  return new ApiError(
    status,
    typeof error?.code === "string" ? error.code : "UNKNOWN",
    typeof error?.message === "string"
      ? error.message
      : `Request failed with ${status}`,
    Array.isArray(error?.details) ? (error.details as ApiErrorDetail[]) : [],
  );
};

// One refresh at a time: concurrent 401s all wait on the same rotation, since
// the API rejects a refresh token once it has been used.
let refreshing: Promise<boolean> | null = null;

const refreshSession = async () => {
  const refreshToken = getTokens()?.refreshToken;
  if (!refreshToken) return false;
  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  const payload = (await response.json().catch(() => null)) as {
    tokens?: Tokens;
  } | null;
  if (!response.ok || !payload?.tokens) {
    clearTokens();
    return false;
  }
  setTokens(payload.tokens);
  return true;
};

export async function api<T>(
  path: string,
  options: RequestOptions = {},
  retried = false,
): Promise<T> {
  const headers = new Headers();
  if (options.body !== undefined) headers.set("content-type", "application/json");
  const token = options.anonymous ? null : getTokens()?.accessToken;
  if (token) headers.set("authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (error) {
    // A cancelled request stays a cancellation; anything else means the
    // server could not be reached (offline, DNS, CORS, server down).
    if (options.signal?.aborted) throw error;
    throw new ApiError(0, "NETWORK", "Can’t reach TaskFlow. Check your connection, then try again.");
  }

  if (response.status === 204) return undefined as T;
  const payload: unknown = await response.json().catch(() => null);

  if (response.status === 401 && !options.anonymous && !retried) {
    refreshing ??= refreshSession().finally(() => {
      refreshing = null;
    });
    // A failed refresh clears the tokens; the router's session listener then
    // sends the user to the login page.
    if (await refreshing) return api<T>(path, options, true);
  }

  if (!response.ok) throw toError(response.status, payload);
  return payload as T;
}

/** Fetches every page of a paginated endpoint, 100 rows per request. */
export async function apiAll<T>(
  path: string,
  query: Query = {},
  signal?: AbortSignal,
): Promise<T[]> {
  const first = await api<Paginated<T>>(path, {
    query: { ...query, pageSize: 100 },
    signal,
  });
  if (first.meta.totalPages <= 1) return first.data;
  // Remaining pages load in parallel rather than one after another.
  const rest = await Promise.all(
    Array.from({ length: first.meta.totalPages - 1 }, (_, i) =>
      api<Paginated<T>>(path, {
        query: { ...query, pageSize: 100, page: i + 2 },
        signal,
      }),
    ),
  );
  return [first.data, ...rest.map((page) => page.data)].flat();
}
