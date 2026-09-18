import { describe, expect, it } from 'vitest'
import { decodeCursor, encodeCursor } from '../notes/cursor'

const NOTE_ID = '0f8fad5b-d9cb-469f-a165-70867728950e'
const UPDATED_AT = Date.UTC(2026, 8, 17, 12)

/** Plain base64url, to build cursors the Worker would never mint. */
function base64url(text: string): string {
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

describe('encodeCursor', () => {
  it('is base64url of updatedAt:id', () => {
    expect(encodeCursor({ updatedAt: 5, id: 'a' })).toBe('NTph')
    expect(encodeCursor({ updatedAt: UPDATED_AT, id: NOTE_ID })).toBe(
      base64url(`${UPDATED_AT}:${NOTE_ID}`)
    )
  })

  it.each(['a', 'ab', 'abc', 'abcd', NOTE_ID, '-_-_', '__'])(
    'uses only URL-safe characters and no padding for id %s',
    (id) => {
      expect(encodeCursor({ updatedAt: UPDATED_AT, id })).toMatch(/^[A-Za-z0-9_-]+$/)
    }
  )
})

describe('decodeCursor', () => {
  it('round-trips what encodeCursor made', () => {
    const cursor = { updatedAt: UPDATED_AT, id: NOTE_ID }

    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor)
    expect(decodeCursor(encodeCursor({ updatedAt: 0, id: 'a' }))).toEqual({ updatedAt: 0, id: 'a' })
  })

  it.each([
    ['not base64url', '!!!'],
    ['standard base64 with padding', btoa('5:ab')],
    ['an empty string', ''],
    ['no colon', base64url('nocolon')],
    ['a non-integer timestamp', base64url('abc:id')],
    ['a fractional timestamp', base64url('1.5:id')],
    ['a negative timestamp', base64url('-1:id')],
    ['an empty timestamp', base64url(':id')],
    ['an empty id', base64url('5:')],
    ['an id with a space', base64url('5:bad id')],
    ['an id over 64 characters', base64url(`5:${'a'.repeat(65)}`)],
    ['a second colon', base64url('5:a:b')]
  ])('is null for %s', (_, text) => {
    expect(decodeCursor(text)).toBeNull()
  })
})
