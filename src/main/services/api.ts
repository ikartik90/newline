import { getSessionToken } from './session'

// ---------------------------------------------------------------------------
// The Worker (`worker/README.md`), as the main process calls it: one base
// URL from the environment, the session token as a bearer on every request,
// and every non-2xx answer raised as an `ApiError` carrying the Worker's
// error code. Nothing here knows what a route means; `auth.ts` and
// `media-api.ts` do.
// ---------------------------------------------------------------------------

/**
 * electron-vite inlines `import.meta.env.MAIN_VITE_*` at build time;
 * `process.env` carries the same name in a dev shell and under vitest.
 * Read on every call so a test can change its mind.
 */
export function apiBaseUrl(): string | null {
  const url = import.meta.env.MAIN_VITE_API_URL || process.env.MAIN_VITE_API_URL
  return url ? url.replace(/\/+$/, '') : null
}

export function isApiConfigured(): boolean {
  return apiBaseUrl() !== null
}

/** The Worker said no. `code` is its `{ error }`, or `http_error` when the body was not JSON. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string
  ) {
    super(`API request failed: ${code} (${status})`)
    this.name = 'ApiError'
  }
}

async function errorFrom(response: Response): Promise<ApiError> {
  let code = 'http_error'
  try {
    const body = (await response.json()) as { error?: unknown }
    if (typeof body?.error === 'string') code = body.error
  } catch {
    // Not JSON: a gateway page, an empty body. The status is all we know.
  }
  return new ApiError(response.status, code)
}

/**
 * `fetch` against the Worker. `path` is the route with its leading slash.
 * Resolves to a 2xx response; rejects with an `ApiError` for anything else,
 * and with whatever `fetch` threw when the Worker could not be reached.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const base = apiBaseUrl()
  if (!base) throw new Error('API is not configured')
  const headers = new Headers(init.headers)
  const token = getSessionToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(`${base}${path}`, { ...init, headers })
  if (!response.ok) throw await errorFrom(response)
  return response
}

/** `apiFetch`, with the response body parsed as JSON. */
export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, init)
  return (await response.json()) as T
}
