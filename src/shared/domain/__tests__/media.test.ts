import { describe, expect, it } from 'vitest'
import {
  ALLOWED_MEDIA_CONTENT_TYPES,
  CreateMediaUploadInputSchema,
  FinalizeMediaUploadInputSchema,
  MAX_DOCUMENT_UPLOAD_BYTES,
  MAX_IMAGE_UPLOAD_BYTES,
  MAX_VIDEO_UPLOAD_BYTES,
  MediaAssetSchema,
  extensionForContentType,
  filenameFromMediaKey,
  filenameFromMediaUrl,
  isAllowedMediaContentType,
  isAllowedUploadContentType,
  isDocumentContentType,
  isVideoContentType,
  maxUploadBytesFor,
  mediaKindOf,
  sanitizeMediaDisplayName,
  sanitizeMediaFilename
} from '../media'

describe('MediaAssetSchema', () => {
  it('parses a valid asset', () => {
    const asset = MediaAssetSchema.parse({
      key: 'media/abc-photo.png',
      url: 'https://cdn.example.com/media/abc-photo.png',
      filename: 'photo.png',
      contentType: 'image/png',
      size: 1024,
      alt: 'A photo'
    })
    expect(asset.filename).toBe('photo.png')
  })

  it('rejects oversize upload input', () => {
    expect(() =>
      CreateMediaUploadInputSchema.parse({
        filename: 'big.png',
        contentType: 'image/png',
        size: MAX_IMAGE_UPLOAD_BYTES + 1
      })
    ).toThrow()
  })

  it('holds a clip to the video cap, not the image one', () => {
    expect(() =>
      CreateMediaUploadInputSchema.parse({
        filename: 'demo.mp4',
        contentType: 'video/mp4',
        size: MAX_IMAGE_UPLOAD_BYTES + 1
      })
    ).not.toThrow()
    expect(() =>
      CreateMediaUploadInputSchema.parse({
        filename: 'demo.mp4',
        contentType: 'video/mp4',
        size: MAX_VIDEO_UPLOAD_BYTES + 1
      })
    ).toThrow()
  })

  it("carries the source's measured shape, and does without it", () => {
    expect(
      FinalizeMediaUploadInputSchema.parse({ key: 'media/abc-photo.png', width: 1600, height: 900 })
    ).toMatchObject({ width: 1600, height: 900 })
    expect(
      FinalizeMediaUploadInputSchema.parse({ key: 'media/abc-photo.png' }).width
    ).toBeUndefined()
  })

  it('refuses a dimension no source could have', () => {
    expect(() =>
      FinalizeMediaUploadInputSchema.parse({ key: 'media/abc-photo.png', width: 0, height: 900 })
    ).toThrow()
  })
})

describe('content types', () => {
  it('accepts allowed media types and rejects unknown ones', () => {
    for (const type of ALLOWED_MEDIA_CONTENT_TYPES) {
      expect(isAllowedMediaContentType(type)).toBe(true)
    }
    expect(isAllowedMediaContentType('image/bmp')).toBe(false)
    expect(isAllowedMediaContentType('video/quicktime')).toBe(false)
  })

  it('tells a clip from a picture', () => {
    expect(isVideoContentType('video/mp4')).toBe(true)
    expect(isVideoContentType('image/gif')).toBe(false)
  })

  it('gives each format its own ceiling', () => {
    expect(maxUploadBytesFor('video/mp4')).toBe(MAX_VIDEO_UPLOAD_BYTES)
    expect(maxUploadBytesFor('image/png')).toBe(MAX_IMAGE_UPLOAD_BYTES)
    expect(maxUploadBytesFor('application/pdf')).toBe(MAX_DOCUMENT_UPLOAD_BYTES)
  })

  it('names the element an upload of this type should be rendered with', () => {
    expect(mediaKindOf('video/mp4')).toBe('video')
    expect(mediaKindOf('image/png')).toBe('image')
    expect(mediaKindOf('application/octet-stream')).toBe('image')
  })

  it('takes a PDF as a document, not as media', () => {
    expect(isDocumentContentType('application/pdf')).toBe(true)
    expect(isDocumentContentType('image/png')).toBe(false)
    expect(isAllowedMediaContentType('application/pdf')).toBe(false)
    expect(isAllowedUploadContentType('application/pdf')).toBe(true)
    expect(isAllowedUploadContentType('application/zip')).toBe(false)
  })

  it('knows the extension a local file of each type is saved under', () => {
    expect(extensionForContentType('image/png')).toBe('png')
    expect(extensionForContentType('image/jpeg')).toBe('jpg')
    expect(extensionForContentType('image/svg+xml')).toBe('svg')
    expect(extensionForContentType('video/mp4')).toBe('mp4')
    expect(extensionForContentType('application/pdf')).toBe('pdf')
    expect(extensionForContentType('application/octet-stream')).toBe('bin')
  })
})

describe('sanitizeMediaFilename', () => {
  it('strips path segments and unsafe characters', () => {
    expect(sanitizeMediaFilename('../../weird name!.png')).toBe('weird-name-.png')
  })
})

describe('sanitizeMediaDisplayName', () => {
  it('keeps a name a person would actually type', () => {
    expect(sanitizeMediaDisplayName('Old shift form (v2).mp4')).toBe('Old shift form (v2).mp4')
  })

  it('folds an accent rather than dropping the letter under it', () => {
    expect(sanitizeMediaDisplayName('Résumé.pdf')).toBe('Resume.pdf')
  })

  it('collapses whitespace and drops control characters', () => {
    expect(sanitizeMediaDisplayName('  two\n\tnames  ')).toBe('two names')
  })

  it('caps a name at the length the store will take', () => {
    expect(sanitizeMediaDisplayName('a'.repeat(200))).toHaveLength(120)
  })
})

describe('filenameFromMediaKey', () => {
  it('recovers the original filename from a uuid-prefixed key', () => {
    expect(filenameFromMediaKey('media/550e8400-e29b-41d4-a716-446655440000-favicon.png')).toBe(
      'favicon.png'
    )
  })

  it('keeps dashes that belong to the original filename', () => {
    expect(
      filenameFromMediaKey('media/550e8400-e29b-41d4-a716-446655440000-my-holiday-photo.png')
    ).toBe('my-holiday-photo.png')
  })

  it('falls back to the whole segment when there is no uuid prefix', () => {
    expect(filenameFromMediaKey('media/legacy.png')).toBe('legacy.png')
  })
})

describe('filenameFromMediaUrl', () => {
  it("recovers the name a node's src was uploaded under", () => {
    expect(
      filenameFromMediaUrl(
        'https://cdn.example.com/media/123e4567-e89b-12d3-a456-426614174000-cv.pdf'
      )
    ).toBe('cv.pdf')
  })

  it('ignores a query and a fragment', () => {
    expect(filenameFromMediaUrl('https://cdn.example.com/media/photo.png?sig=abc#x')).toBe(
      'photo.png'
    )
  })

  it('falls back to whatever the last segment is', () => {
    expect(filenameFromMediaUrl('https://cdn.example.com/abc123')).toBe('abc123')
  })
})
