/** An error a handler throws to answer with a JSON `{ error }` body and a status. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details: Record<string, unknown> = {}
  ) {
    super(code)
    this.name = 'HttpError'
  }
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers }
  })
}

export function errorResponse(
  status: number,
  code: string,
  details: Record<string, unknown> = {},
  headers: Record<string, string> = {}
): Response {
  return json({ error: code, ...details }, status, headers)
}

export function noContent(): Response {
  return new Response(null, { status: 204 })
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The request body as a JSON object, or `400 bad_request`. */
export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  let parsed: unknown
  try {
    parsed = await request.json()
  } catch {
    throw new HttpError(400, 'bad_request')
  }
  if (!isRecord(parsed)) throw new HttpError(400, 'bad_request')
  return parsed
}
