import { ERROR_CODES, type ApiErrorBody, type ErrorCode } from '@xenospace/shared';

/**
 * HTTP client.
 *
 * Two responsibilities beyond fetch: the access token lives in memory only
 * (never localStorage, so an XSS cannot read it), and a 401 triggers exactly
 * one refresh attempt which all concurrent callers await, rather than a stampede
 * of parallel refreshes that would trip the server's rotation-reuse detection.
 */

const BASE = '/api/v1';

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: Record<string, string[]>;
  readonly requestId?: string;

  constructor(status: number, body: ApiErrorBody['error']) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = (body.code as ErrorCode) ?? ERROR_CODES.INTERNAL;
    this.details = body.details;
    this.requestId = body.requestId;
  }

  /** Field-level message for a form input, if the server supplied one. */
  fieldError(field: string): string | undefined {
    return this.details?.[field]?.[0];
  }
}

/* --------------------------------------------------------------- token state */

let accessToken: string | null = null;
let onUnauthenticated: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/** Registered by the auth provider so a dead session can clear app state. */
export function setUnauthenticatedHandler(handler: (() => void) | null): void {
  onUnauthenticated = handler;
}

/** Reads the CSRF cookie the server issues, for the double-submit header. */
function csrfToken(): string | null {
  const match = /(?:^|;\s*)xs_csrf=([^;]*)/.exec(document.cookie);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

/* ------------------------------------------------------------------ refresh */

/**
 * In-flight refresh, shared by every caller.
 *
 * Without this, five parallel requests hitting 401 would each rotate the
 * refresh token; four would present an already-rotated token and the server
 * would correctly treat that as theft and revoke the whole family.
 */
let refreshInFlight: Promise<boolean> | null = null;

export async function refreshSession(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const csrf = csrfToken();
      // The CSRF cookie outlives every refresh token, so its absence means
      // this browser holds no session; the request would only fail.
      if (!csrf) {
        accessToken = null;
        return false;
      }
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: csrf ? { 'X-CSRF-Token': csrf } : {},
      });
      if (!res.ok) {
        accessToken = null;
        return false;
      }
      const data = (await res.json()) as { accessToken: string };
      accessToken = data.accessToken;
      return true;
    } catch {
      accessToken = null;
      return false;
    } finally {
      // Cleared in a microtask so callers awaiting this promise all observe
      // the same result before a new attempt can begin.
      queueMicrotask(() => {
        refreshInFlight = null;
      });
    }
  })();
  return refreshInFlight;
}

/* -------------------------------------------------------------- the request */

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Query parameters; undefined and null entries are dropped. */
  query?: Record<string, string | number | boolean | undefined | null | string[]>;
  /** Internal: prevents a refreshed request from recursing forever. */
  _retried?: boolean;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = `${BASE}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    // Arrays go over as a comma-separated list, matching the API's csvEnum.
    params.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, query, _retried, headers, ...init } = options;
  const isFormData = body instanceof FormData;

  const res = await fetch(buildUrl(path, query), {
    ...init,
    credentials: 'same-origin',
    headers: {
      ...(isFormData ? {} : body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(headers as Record<string, string> | undefined),
    },
    body: isFormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  if (!res.ok) {
    let errorBody: ApiErrorBody['error'];
    try {
      errorBody = ((await res.json()) as ApiErrorBody).error;
    } catch {
      // A non-JSON error body means the API itself never answered: the proxy or
      // load balancer replied for it. Say that, rather than a bare status code.
      errorBody =
        res.status === 502 || res.status === 503 || res.status === 504
          ? {
              code: ERROR_CODES.SERVICE_UNAVAILABLE,
              message: 'The server is not responding. It may be restarting — try again in a moment.',
            }
          : { code: ERROR_CODES.INTERNAL, message: `Something went wrong (error ${res.status}). Please try again.` };
    }

    /*
     * An expired access token is recoverable: refresh once and replay. Only
     * TOKEN_EXPIRED is retried — retrying TOKEN_INVALID would hammer a session
     * the server has deliberately revoked.
     */
    const recoverable =
      res.status === 401 && errorBody.code === ERROR_CODES.TOKEN_EXPIRED && !_retried;

    if (recoverable && (await refreshSession())) {
      return request<T>(path, { ...options, _retried: true });
    }

    if (res.status === 401) {
      accessToken = null;
      onUnauthenticated?.();
    }

    throw new ApiError(res.status, errorBody);
  }

  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string, query?: RequestOptions['query']) => request<T>(path, { method: 'GET', query }),
  post: <T>(path: string, body?: unknown, query?: RequestOptions['query']) =>
    request<T>(path, { method: 'POST', body, query }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  /** Multipart upload; the browser sets the boundary, so no Content-Type here. */
  upload: <T>(path: string, form: FormData) => request<T>(path, { method: 'POST', body: form }),
};

/** Copy for a caught error, falling back to something useful for a network drop. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof TypeError) return 'Could not reach the server. Check your connection.';
  if (error instanceof Error) return error.message;
  return 'Something went wrong.';
}
