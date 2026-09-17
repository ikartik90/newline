import { describe, expect, it } from 'vitest'
import { sanitizeMediaFilename } from '@shared/domain/media'
import { bucketKeyFor, filenameOfKey, isValidMediaKey, publicUrlFor } from '../media/keys'

describe('isValidMediaKey', () => {
  it.each([
    'media/0f8fad5b-d9cb-469f-a165-70867728950e-photo.png',
    'posters/0f8fad5b-d9cb-469f-a165-70867728950e-clip.jpg',
    'media/Screen_Shot-(1)+copy.PNG',
    `media/${sanitizeMediaFilename('Été à la plage (1).jpg')}`,
    `media/${sanitizeMediaFilename('a..b.png')}`,
    `media/${'a'.repeat(200)}`
  ])('accepts %s', (key) => {
    expect(isValidMediaKey(key)).toBe(true)
  })

  it.each([
    '',
    'media',
    'media/',
    'photo.png',
    'other/photo.png',
    'media/a/b.png',
    'media/.env',
    'media/..',
    'media/with space.png',
    'media/ünïcode.png',
    'media/semi;colon.png',
    'media/query?.png',
    'media/hash#.png',
    'media/percent%20.png',
    `media/${'a'.repeat(201)}`,
    '/media/photo.png',
    'Media/photo.png'
  ])('rejects %j', (key) => {
    expect(isValidMediaKey(key)).toBe(false)
  })
})

describe('bucketKeyFor', () => {
  it('scopes the key to the user', () => {
    expect(bucketKeyFor('user-1', 'media/a.png')).toBe('u/user-1/media/a.png')
  })
})

describe('publicUrlFor', () => {
  it('joins the base with the bucket key', () => {
    expect(publicUrlFor('https://api.example/m', 'user-1', 'media/a.png')).toBe(
      'https://api.example/m/u/user-1/media/a.png'
    )
  })
})

describe('filenameOfKey', () => {
  it('drops the prefix and the uuid stamp', () => {
    expect(filenameOfKey('media/0f8fad5b-d9cb-469f-a165-70867728950e-photo.png')).toBe('photo.png')
  })

  it('keeps a name without a stamp', () => {
    expect(filenameOfKey('posters/clip.jpg')).toBe('clip.jpg')
  })
})
