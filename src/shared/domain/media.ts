import { z } from 'zod'
import type { MediaKind } from './media-node'

// ---------------------------------------------------------------------------
// Allowed upload types — validated in the renderer and in the main process
// ---------------------------------------------------------------------------

export const ALLOWED_IMAGE_CONTENT_TYPES = [
  'image/png',
  'image/svg+xml',
  'image/webp',
  'image/jpeg',
  'image/gif'
] as const

export const ALLOWED_VIDEO_CONTENT_TYPES = ['video/mp4'] as const

/** Files the bucket holds that are NOT media — a document is fetched, not rendered. */
export const ALLOWED_DOCUMENT_CONTENT_TYPES = ['application/pdf'] as const

export const ALLOWED_MEDIA_CONTENT_TYPES = [
  ...ALLOWED_IMAGE_CONTENT_TYPES,
  ...ALLOWED_VIDEO_CONTENT_TYPES
] as const

/** Everything that may be PUT into the bucket — media and documents alike. */
export const ALLOWED_UPLOAD_CONTENT_TYPES = [
  ...ALLOWED_MEDIA_CONTENT_TYPES,
  ...ALLOWED_DOCUMENT_CONTENT_TYPES
] as const

export type AllowedImageContentType = (typeof ALLOWED_IMAGE_CONTENT_TYPES)[number]
export type AllowedVideoContentType = (typeof ALLOWED_VIDEO_CONTENT_TYPES)[number]
export type AllowedDocumentContentType = (typeof ALLOWED_DOCUMENT_CONTENT_TYPES)[number]
export type AllowedMediaContentType = (typeof ALLOWED_MEDIA_CONTENT_TYPES)[number]
export type AllowedUploadContentType = (typeof ALLOWED_UPLOAD_CONTENT_TYPES)[number]

export const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024
/** Five times the image ceiling: a clip is a different order of file. */
export const MAX_VIDEO_UPLOAD_BYTES = 50 * 1024 * 1024
/** Between the two. */
export const MAX_DOCUMENT_UPLOAD_BYTES = 25 * 1024 * 1024

export function isVideoContentType(value: string): value is AllowedVideoContentType {
  return (ALLOWED_VIDEO_CONTENT_TYPES as readonly string[]).includes(value)
}

export function isDocumentContentType(value: string): value is AllowedDocumentContentType {
  return (ALLOWED_DOCUMENT_CONTENT_TYPES as readonly string[]).includes(value)
}

export function isAllowedMediaContentType(value: string): value is AllowedMediaContentType {
  return (ALLOWED_MEDIA_CONTENT_TYPES as readonly string[]).includes(value)
}

export function isAllowedUploadContentType(value: string): value is AllowedUploadContentType {
  return (ALLOWED_UPLOAD_CONTENT_TYPES as readonly string[]).includes(value)
}

/** The ceiling this format is held to. */
export function maxUploadBytesFor(contentType: string): number {
  if (isVideoContentType(contentType)) return MAX_VIDEO_UPLOAD_BYTES
  if (isDocumentContentType(contentType)) return MAX_DOCUMENT_UPLOAD_BYTES
  return MAX_IMAGE_UPLOAD_BYTES
}

/**
 * The `kind` an upload of this content type becomes once it is in a document.
 * The ONE place a `MediaKind` is derived. Falls through to a picture.
 */
export function mediaKindOf(contentType: string): MediaKind {
  return isVideoContentType(contentType) ? 'video' : 'image'
}

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'application/pdf': 'pdf'
}

/** The extension a local copy of a file of this type is saved under. */
export function extensionForContentType(contentType: string): string {
  return EXTENSION_BY_CONTENT_TYPE[contentType] ?? 'bin'
}

const mediaDimensionFields = {
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional()
}

/** A stored object as the library lists it. */
export const MediaAssetSchema = z.object({
  key: z.string(),
  url: z.string(),
  filename: z.string(),
  contentType: z.string(),
  size: z.number(),
  alt: z.string().optional(),
  ...mediaDimensionFields,
  /** A clip's still, where one was taken. */
  poster: z.string().optional()
})

export type MediaAsset = z.infer<typeof MediaAssetSchema>

export const CreateMediaUploadInputSchema = z
  .object({
    filename: z.string().min(1),
    contentType: z.enum(ALLOWED_UPLOAD_CONTENT_TYPES),
    size: z.number().int().positive()
  })
  .refine(({ contentType, size }) => size <= maxUploadBytesFor(contentType), {
    message: 'File is too large',
    path: ['size']
  })

export type CreateMediaUploadInput = z.infer<typeof CreateMediaUploadInputSchema>

/** What the renderer reports about a file once it is stored. */
export const FinalizeMediaUploadInputSchema = z.object({
  key: z.string().min(1),
  ...mediaDimensionFields,
  poster: z.boolean().optional()
})

export type FinalizeMediaUploadInput = z.infer<typeof FinalizeMediaUploadInputSchema>

const MAX_MEDIA_NAME_LENGTH = 120

/**
 * A name the author typed, made storable — and NOTHING more. Object metadata
 * travels in a US-ASCII header, so accents fold to their letters.
 */
export function sanitizeMediaDisplayName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\s+/g, ' ')
    .replace(/[^\x20-\x7e]/g, '')
    .trim()
    .slice(0, MAX_MEDIA_NAME_LENGTH)
}

export function sanitizeMediaFilename(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? 'media'
  const cleaned = base.replace(/[^\w.\-()+]/g, '-').replace(/-+/g, '-')
  return cleaned.length > 0 ? cleaned.slice(0, MAX_MEDIA_NAME_LENGTH) : 'media'
}

/** The `<uuid>-` stamp every object key is prefixed with. */
const MEDIA_KEY_UUID_PREFIX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i

export function filenameFromMediaKey(key: string, prefix = 'media/'): string {
  const segment = key.startsWith(prefix) ? key.slice(prefix.length) : key
  return segment.replace(MEDIA_KEY_UUID_PREFIX, '')
}

/** The same recovery, from the public URL a document node actually stores. */
export function filenameFromMediaUrl(url: string): string {
  const path = url.split(/[?#]/)[0]
  const segment = path.split('/').pop() ?? ''
  return filenameFromMediaKey(decodeURIComponent(segment), '')
}
