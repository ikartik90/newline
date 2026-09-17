import { describe, it, expect } from 'vitest'
import { formatFileSize, formatMediaType } from '../format-file-size'

describe('formatFileSize', () => {
  it('formats bytes', () => {
    expect(formatFileSize(500)).toBe('500 B')
  })

  it('formats kilobytes', () => {
    expect(formatFileSize(269 * 1024)).toBe('269 KB')
  })

  it('formats megabytes to one decimal', () => {
    expect(formatFileSize(2.5 * 1024 * 1024)).toBe('2.5 MB')
  })
})

describe('formatMediaType', () => {
  it('labels gif types', () => {
    expect(formatMediaType('image/gif')).toBe('GIF Image')
  })

  it('names a clip as a video, not an image', () => {
    expect(formatMediaType('video/mp4')).toBe('MP4 Video')
  })

  it('falls back to a generic label for a type it does not know', () => {
    expect(formatMediaType('application/octet-stream')).toBe('File')
  })
})
