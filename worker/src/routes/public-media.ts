import type { AppEnv } from '../env'
import { HttpError } from '../http'
import { bucketKeyFor, isValidMediaKey } from '../media/keys'
import type { RouteContext, Router } from '../router'
import { IMMUTABLE_CACHE_CONTROL } from './media'

interface ByteRange {
  start: number
  end: number
}

/**
 * The bytes R2 actually returned for a `Range` request, as inclusive offsets.
 * The fields are checked by type: the runtime hands back every key of the
 * union, the unused ones undefined.
 */
function resolveRange(range: R2Range, size: number): ByteRange {
  if ('suffix' in range && typeof range.suffix === 'number') {
    const length = Math.min(range.suffix, size)
    return { start: size - length, end: size - 1 }
  }
  const offset = 'offset' in range && typeof range.offset === 'number' ? range.offset : 0
  const length = 'length' in range && typeof range.length === 'number' ? range.length : undefined
  const end = length === undefined ? size - 1 : Math.min(offset + length, size) - 1
  return { start: offset, end }
}

function hasBody(object: R2Object | R2ObjectBody): object is R2ObjectBody {
  return 'body' in object
}

async function serve(
  { request, env, params }: RouteContext<AppEnv>,
  withBody: boolean
): Promise<Response> {
  const { userId, key } = params
  if (!userId || !key || !isValidMediaKey(key)) throw new HttpError(404, 'not_found')

  const object = await env.MEDIA.get(bucketKeyFor(userId, key), {
    range: request.headers,
    onlyIf: request.headers
  })
  if (!object) throw new HttpError(404, 'not_found')

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  if (!headers.has('cache-control')) headers.set('cache-control', IMMUTABLE_CACHE_CONTROL)
  headers.set('etag', object.httpEtag)
  headers.set('accept-ranges', 'bytes')

  // A precondition (If-None-Match, If-Modified-Since) held: R2 sent no body.
  if (!hasBody(object)) return new Response(null, { status: 304, headers })

  let status = 200
  if (object.range && request.headers.has('range')) {
    const { start, end } = resolveRange(object.range, object.size)
    headers.set('content-range', `bytes ${start}-${end}/${object.size}`)
    headers.set('content-length', String(end - start + 1))
    status = 206
  } else {
    headers.set('content-length', String(object.size))
  }

  return new Response(withBody ? object.body : null, { status, headers })
}

/** Public, unauthenticated serving of the bytes straight from the binding. */
export function registerPublicMediaRoutes(router: Router<AppEnv>): void {
  router.on('GET', '/m/u/:userId/:key*', (context) => serve(context, true))
  router.on('HEAD', '/m/u/:userId/:key*', (context) => serve(context, false))
}
