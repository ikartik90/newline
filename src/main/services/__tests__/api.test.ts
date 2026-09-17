import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiBaseUrl, apiFetch, apiJson, isApiConfigured } from '../api'
import { getSessionToken } from '../session'

vi.mock('../session', () => ({ getSessionToken: vi.fn((): string | null => null) }))

const fetchMock = vi.fn<typeof fetch>()

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

/** What the last request was made with, the way the Worker would see it. */
function lastRequest(): { url: string; init: RequestInit; headers: Headers } {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit]
  return { url, init, headers: new Headers(init.headers) }
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('MAIN_VITE_API_URL', undefined)
  fetchMock.mockReset()
  vi.mocked(getSessionToken).mockReturnValue(null)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('apiBaseUrl / isApiConfigured', () => {
  it('reads the URL from the environment and trims trailing slashes', () => {
    expect(apiBaseUrl()).toBeNull()
    expect(isApiConfigured()).toBe(false)
    vi.stubEnv('MAIN_VITE_API_URL', 'https://api.example.com///')
    expect(apiBaseUrl()).toBe('https://api.example.com')
    expect(isApiConfigured()).toBe(true)
  })

  it('treats an empty value as unset', () => {
    vi.stubEnv('MAIN_VITE_API_URL', '')
    expect(isApiConfigured()).toBe(false)
  })
})

describe('apiFetch', () => {
  it('refuses to run unconfigured, without touching the network', async () => {
    await expect(apiFetch('/auth/me')).rejects.toThrow(/not configured/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('joins the base URL and the path, passing the init through', async () => {
    vi.stubEnv('MAIN_VITE_API_URL', 'https://api.example.com/')
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    const response = await apiFetch('/auth/signout', { method: 'POST' })
    expect(response.status).toBe(204)
    const { url, init, headers } = lastRequest()
    expect(url).toBe('https://api.example.com/auth/signout')
    expect(init.method).toBe('POST')
    expect(headers.has('Authorization')).toBe(false)
  })

  it('carries the session as a bearer token when there is one, keeping other headers', async () => {
    vi.stubEnv('MAIN_VITE_API_URL', 'https://api.example.com')
    vi.mocked(getSessionToken).mockReturnValue('session-token')
    fetchMock.mockResolvedValue(json({ ok: true }))
    await apiFetch('/media/usage', { headers: { 'Content-Type': 'image/png' } })
    const { headers } = lastRequest()
    expect(headers.get('Authorization')).toBe('Bearer session-token')
    expect(headers.get('Content-Type')).toBe('image/png')
  })

  it('throws an ApiError carrying the JSON error code on a failure', async () => {
    vi.stubEnv('MAIN_VITE_API_URL', 'https://api.example.com')
    fetchMock.mockResolvedValue(json({ error: 'unauthorized' }, 401))
    const error = await apiFetch('/auth/me').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 401, code: 'unauthorized' })
    expect((error as Error).message).toMatch(/unauthorized/)
  })

  it('falls back to a generic code when the failure body is not JSON', async () => {
    vi.stubEnv('MAIN_VITE_API_URL', 'https://api.example.com')
    fetchMock.mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }))
    const error = await apiFetch('/auth/me').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 502, code: 'http_error' })
  })

  it('lets a network failure through as it is', async () => {
    vi.stubEnv('MAIN_VITE_API_URL', 'https://api.example.com')
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))
    await expect(apiFetch('/auth/me')).rejects.toThrow('fetch failed')
  })
})

describe('apiJson', () => {
  it('parses the body of a successful response', async () => {
    vi.stubEnv('MAIN_VITE_API_URL', 'https://api.example.com')
    fetchMock.mockResolvedValue(json({ bytes: 12, quotaBytes: 100 }))
    expect(await apiJson<{ bytes: number }>('/media/usage')).toEqual({ bytes: 12, quotaBytes: 100 })
  })

  it('throws the ApiError of a failure rather than parsing it', async () => {
    vi.stubEnv('MAIN_VITE_API_URL', 'https://api.example.com')
    fetchMock.mockResolvedValue(json({ error: 'not_found' }, 404))
    await expect(apiJson('/media/objects/media/x.png')).rejects.toMatchObject({
      status: 404,
      code: 'not_found'
    })
  })
})
