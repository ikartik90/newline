import { HttpError, isRecord } from '../http'

/** Strings throughout, as R2 custom metadata would be, so the app's reading code applies. */
export interface MediaMetadata {
  filename: string
  alt?: string
  width?: string
  height?: string
  poster?: string
}

export type MediaMetadataPatch = Partial<MediaMetadata>

const STRING_FIELDS = ['filename', 'alt', 'poster'] as const
const DIMENSION_FIELDS = ['width', 'height'] as const

/**
 * The metadata fields a client sent, validated: strings, and dimensions as
 * digit strings (a JSON number is accepted and stringified). Anything else is
 * `400 bad_request`. Absent and null fields are left out.
 */
export function parseMetadataPatch(input: unknown): MediaMetadataPatch {
  if (!isRecord(input)) throw new HttpError(400, 'bad_request')
  const patch: MediaMetadataPatch = {}

  for (const field of STRING_FIELDS) {
    const value = input[field]
    if (value === undefined || value === null) continue
    if (typeof value !== 'string') throw new HttpError(400, 'bad_request')
    patch[field] = value
  }

  for (const field of DIMENSION_FIELDS) {
    const value = input[field]
    if (value === undefined || value === null) continue
    const text = typeof value === 'number' ? String(value) : value
    if (typeof text !== 'string' || !/^\d+$/.test(text)) throw new HttpError(400, 'bad_request')
    patch[field] = text
  }

  return patch
}

/** The `X-Media-Metadata` header: a JSON object, or `400 bad_request`. */
export function parseMetadataHeader(header: string): MediaMetadataPatch {
  let parsed: unknown
  try {
    parsed = JSON.parse(header)
  } catch {
    throw new HttpError(400, 'bad_request')
  }
  return parseMetadataPatch(parsed)
}
