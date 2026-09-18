import { errorResponse, HttpError } from './http'

export type RouteParams = Record<string, string>

export interface RouteContext<E> {
  request: Request
  env: E
  ctx: ExecutionContext
  url: URL
  params: RouteParams
}

export type RouteHandler<E> = (context: RouteContext<E>) => Response | Promise<Response>

type Segment =
  | { kind: 'literal'; value: string }
  | { kind: 'param'; name: string }
  | { kind: 'rest'; name: string }

interface Route<E> {
  method: string
  segments: Segment[]
  handler: RouteHandler<E>
}

function splitPath(path: string): string[] {
  return path.split('/').filter((part) => part.length > 0)
}

/** `/a/:b/:c*` — literals, one-segment params, and a trailing param that takes the rest. */
function compile(pattern: string): Segment[] {
  return splitPath(pattern).map((part): Segment => {
    if (part.startsWith(':') && part.endsWith('*')) return { kind: 'rest', name: part.slice(1, -1) }
    if (part.startsWith(':')) return { kind: 'param', name: part.slice(1) }
    return { kind: 'literal', value: part }
  })
}

function match(segments: Segment[], parts: string[]): RouteParams | null {
  const params: RouteParams = {}
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    if (segment.kind === 'rest') {
      if (i >= parts.length) return null
      params[segment.name] = parts.slice(i).join('/')
      return params
    }
    const part = parts[i]
    if (part === undefined) return null
    if (segment.kind === 'literal') {
      if (segment.value !== part) return null
    } else {
      params[segment.name] = part
    }
  }
  return parts.length === segments.length ? params : null
}

function responseFor(error: unknown): Response {
  if (error instanceof HttpError) return errorResponse(error.status, error.code, error.details)
  console.error(error)
  return errorResponse(500, 'internal')
}

/**
 * Method + path-pattern dispatch. Every miss is JSON: `404 not_found` for an
 * unknown path, `405 method_not_allowed` (with `Allow`) for a known one.
 */
export class Router<E> {
  private readonly routes: Route<E>[] = []

  on(method: string, pattern: string, handler: RouteHandler<E>): this {
    this.routes.push({ method: method.toUpperCase(), segments: compile(pattern), handler })
    return this
  }

  async handle(request: Request, env: E, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    let parts: string[]
    try {
      parts = splitPath(url.pathname).map(decodeURIComponent)
    } catch {
      return errorResponse(400, 'bad_request')
    }

    const allowed: string[] = []
    for (const route of this.routes) {
      const params = match(route.segments, parts)
      if (params === null) continue
      if (route.method !== request.method) {
        allowed.push(route.method)
        continue
      }
      try {
        return await route.handler({ request, env, ctx, url, params })
      } catch (error) {
        return responseFor(error)
      }
    }

    if (allowed.length > 0) {
      return errorResponse(405, 'method_not_allowed', {}, { allow: allowed.join(', ') })
    }
    return errorResponse(404, 'not_found')
  }
}
