import { isAllowedUploadContentType, maxUploadBytesFor } from '@shared/domain/media'
import { requireSession } from '../auth/bearer'
import { mediaPublicBaseUrl, mediaQuotaBytes, type AppEnv } from '../env'
import { HttpError, json, noContent, readJsonObject } from '../http'
import {
  deleteObject,
  getObject,
  listObjects,
  patchObject,
  toMediaObject,
  upsertObject,
  usageBytes
} from '../media/catalogue'
import { bucketKeyFor, filenameOfKey, isValidMediaKey } from '../media/keys'
import { parseMetadataHeader, parseMetadataPatch, type MediaMetadata } from '../media/metadata'
import type { RouteContext, Router } from '../router'

/** Objects are content-addressed by the app (uuid keys), so they never change under a URL. */
export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable'

export interface MediaRouteDeps {
  now: () => number
}

function validKey(key: string | undefined): string {
  if (!key || !isValidMediaKey(key)) throw new HttpError(400, 'invalid_key')
  return key
}

/** The media type of a `Content-Type` header, without its parameters. */
function mediaTypeOf(header: string | null): string {
  return (header ?? '').split(';')[0].trim().toLowerCase()
}

function declaredLength(request: Request): number {
  const header = request.headers.get('content-length')
  if (header === null) throw new HttpError(411, 'length_required')
  const length = Number(header)
  if (!Number.isSafeInteger(length) || length < 1) throw new HttpError(400, 'bad_request')
  return length
}

async function putObject({ request, env, params }: RouteContext<AppEnv>, deps: MediaRouteDeps) {
  const { user } = await requireSession(env.DB, request, deps.now())
  const key = validKey(params.key)

  const contentType = mediaTypeOf(request.headers.get('content-type'))
  if (!isAllowedUploadContentType(contentType)) throw new HttpError(400, 'invalid_content_type')

  const size = declaredLength(request)
  if (size > maxUploadBytesFor(contentType)) throw new HttpError(413, 'too_large')

  const header = request.headers.get('x-media-metadata')
  const patch = header === null ? {} : parseMetadataHeader(header)
  const metadata: MediaMetadata = { ...patch, filename: patch.filename ?? filenameOfKey(key) }

  const existing = await getObject(env.DB, user.id, key)
  const used = await usageBytes(env.DB, user.id)
  const quota = mediaQuotaBytes(env)
  if (used - (existing?.size ?? 0) + size > quota) {
    throw new HttpError(507, 'quota_exceeded', { bytes: used, quotaBytes: quota })
  }

  const bytes = await request.arrayBuffer()
  if (bytes.byteLength !== size) throw new HttpError(400, 'bad_request')

  const bucketKey = bucketKeyFor(user.id, key)
  await env.MEDIA.put(bucketKey, bytes, {
    httpMetadata: { contentType, cacheControl: IMMUTABLE_CACHE_CONTROL }
  })

  let row
  try {
    row = await upsertObject(env.DB, {
      userId: user.id,
      key,
      size,
      contentType,
      metadata,
      now: deps.now()
    })
  } catch (error) {
    // Bytes without a record would be invisible to the quota; take them back.
    await env.MEDIA.delete(bucketKey)
    throw error
  }

  return json(toMediaObject(row, mediaPublicBaseUrl(env, request)))
}

export function registerMediaRoutes(router: Router<AppEnv>, deps: MediaRouteDeps): void {
  router.on('GET', '/media/usage', async ({ request, env }) => {
    const { user } = await requireSession(env.DB, request, deps.now())
    return json({ bytes: await usageBytes(env.DB, user.id), quotaBytes: mediaQuotaBytes(env) })
  })

  router.on('GET', '/media/objects', async ({ request, env, url }) => {
    const { user } = await requireSession(env.DB, request, deps.now())
    const prefix = url.searchParams.get('prefix') ?? 'media/'
    const rows = await listObjects(env.DB, user.id, prefix)
    const base = mediaPublicBaseUrl(env, request)
    return json({ objects: rows.map((row) => toMediaObject(row, base)) })
  })

  router.on('PUT', '/media/objects/:key*', (context) => putObject(context, deps))

  router.on('GET', '/media/objects/:key*', async ({ request, env, params }) => {
    const { user } = await requireSession(env.DB, request, deps.now())
    const key = validKey(params.key)
    const row = await getObject(env.DB, user.id, key)
    if (!row) throw new HttpError(404, 'not_found')
    return json(toMediaObject(row, mediaPublicBaseUrl(env, request)))
  })

  router.on('PATCH', '/media/objects/:key*', async ({ request, env, params }) => {
    const { user } = await requireSession(env.DB, request, deps.now())
    const key = validKey(params.key)
    const body = await readJsonObject(request)
    const patch = parseMetadataPatch(body.metadata)
    const row = await patchObject(env.DB, user.id, key, patch)
    if (!row) throw new HttpError(404, 'not_found')
    return json(toMediaObject(row, mediaPublicBaseUrl(env, request)))
  })

  router.on('DELETE', '/media/objects/:key*', async ({ request, env, params }) => {
    const { user } = await requireSession(env.DB, request, deps.now())
    const key = validKey(params.key)
    await env.MEDIA.delete(bucketKeyFor(user.id, key))
    await deleteObject(env.DB, user.id, key)
    return noContent()
  })
}
