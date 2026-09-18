import { HttpError } from '../http'
import { lookupSession, type SessionUser } from './session'

/** The token from `Authorization: Bearer <token>`, or null for anything else. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (!header) return null
  const [scheme, token, ...rest] = header.trim().split(/\s+/)
  if (rest.length > 0 || !token || scheme?.toLowerCase() !== 'bearer') return null
  return token
}

/** The session behind the request's bearer token, or `401 unauthorized`. */
export async function requireSession(
  db: D1Database,
  request: Request,
  now: number
): Promise<SessionUser> {
  const token = bearerToken(request)
  const session = token ? await lookupSession(db, token, now) : null
  if (!session) throw new HttpError(401, 'unauthorized')
  return session
}
