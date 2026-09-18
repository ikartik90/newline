import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { bytesOf, call, signedInUser, testApp } from './helpers'

// Its own file: storage is isolated per file, and this one breaks the catalogue on purpose.
describe('PUT /media/objects/<key> when the catalogue write fails', () => {
  it('removes the object again and is 500', async () => {
    const who = await signedInUser()
    await env.DB.exec('DROP TABLE media_objects')

    const response = await call(testApp(), '/media/objects/media/photo.png', {
      method: 'PUT',
      headers: { ...who.auth, 'content-type': 'image/png', 'content-length': '9' },
      body: bytesOf('png-bytes')
    })

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'internal' })
    await expect(env.MEDIA.get(`u/${who.user.id}/media/photo.png`)).resolves.toBeNull()
  })
})
