import { createExecutionContext } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { HttpError, json } from '../http'
import { Router } from '../router'

function handle(router: Router<unknown>, path: string, method = 'GET'): Promise<Response> {
  return router.handle(
    new Request(`http://r.test${path}`, { method }),
    {},
    createExecutionContext()
  )
}

describe('Router', () => {
  it('matches literal paths and passes the URL', async () => {
    const router = new Router<unknown>().on('GET', '/ping', ({ url }) =>
      json({ path: url.pathname })
    )

    const response = await handle(router, '/ping')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ path: '/ping' })
  })

  it('captures single-segment params, decoded', async () => {
    const router = new Router<unknown>().on('GET', '/users/:id', ({ params }) => json(params))

    await expect((await handle(router, '/users/a%20b')).json()).resolves.toEqual({ id: 'a b' })
    expect((await handle(router, '/users')).status).toBe(404)
    expect((await handle(router, '/users/a/b')).status).toBe(404)
  })

  it('captures the rest of the path with a star param', async () => {
    const router = new Router<unknown>().on('GET', '/objects/:key*', ({ params }) => json(params))

    await expect((await handle(router, '/objects/media/a.png')).json()).resolves.toEqual({
      key: 'media/a.png'
    })
    expect((await handle(router, '/objects')).status).toBe(404)
    expect((await handle(router, '/objects/')).status).toBe(404)
  })

  it('lets an exact route and a star route share a prefix', async () => {
    const router = new Router<unknown>()
      .on('GET', '/objects', () => json('list'))
      .on('GET', '/objects/:key*', ({ params }) => json(params.key))

    await expect((await handle(router, '/objects')).json()).resolves.toBe('list')
    await expect((await handle(router, '/objects/')).json()).resolves.toBe('list')
    await expect((await handle(router, '/objects/a')).json()).resolves.toBe('a')
  })

  it('is 404 not_found for an unknown path', async () => {
    const router = new Router<unknown>().on('GET', '/ping', () => json(null))

    const response = await handle(router, '/pong')

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'not_found' })
  })

  it('is 405 with Allow for a known path and the wrong method', async () => {
    const router = new Router<unknown>()
      .on('GET', '/thing', () => json(null))
      .on('PUT', '/thing', () => json(null))

    const response = await handle(router, '/thing', 'DELETE')

    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('GET, PUT')
    await expect(response.json()).resolves.toEqual({ error: 'method_not_allowed' })
  })

  it('turns an HttpError into its JSON error', async () => {
    const router = new Router<unknown>().on('GET', '/full', () => {
      throw new HttpError(507, 'quota_exceeded', { bytes: 1, quotaBytes: 1 })
    })

    const response = await handle(router, '/full')

    expect(response.status).toBe(507)
    await expect(response.json()).resolves.toEqual({
      error: 'quota_exceeded',
      bytes: 1,
      quotaBytes: 1
    })
  })

  it('turns any other throw into 500 internal', async () => {
    const router = new Router<unknown>().on('GET', '/boom', () => {
      throw new Error('kaboom')
    })

    const response = await handle(router, '/boom')

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'internal' })
  })

  it('is 400 bad_request for a path that does not decode', async () => {
    const router = new Router<unknown>().on('GET', '/users/:id', ({ params }) => json(params))

    const response = await handle(router, '/users/%E0%A4%A')

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'bad_request' })
  })
})
