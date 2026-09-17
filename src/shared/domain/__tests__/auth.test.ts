import { describe, expect, it } from 'vitest'
import { AuthSessionSchema, AuthUserSchema } from '../auth'

describe('AuthUserSchema', () => {
  it('parses a user as the Worker reports one', () => {
    const user = AuthUserSchema.parse({
      id: 'u-1',
      email: 'me@example.com',
      name: 'Me',
      picture: 'https://lh3.googleusercontent.com/a/photo'
    })
    expect(user).toEqual({
      id: 'u-1',
      email: 'me@example.com',
      name: 'Me',
      picture: 'https://lh3.googleusercontent.com/a/photo'
    })
  })

  it('does without a name and a picture', () => {
    expect(AuthUserSchema.parse({ id: 'u-1', email: 'me@example.com' })).toEqual({
      id: 'u-1',
      email: 'me@example.com'
    })
  })

  it('refuses a user without an id or an email', () => {
    expect(() => AuthUserSchema.parse({ email: 'me@example.com' })).toThrow()
    expect(() => AuthUserSchema.parse({ id: '', email: 'me@example.com' })).toThrow()
    expect(() => AuthUserSchema.parse({ id: 'u-1' })).toThrow()
  })

  it('drops what it does not know', () => {
    expect(AuthUserSchema.parse({ id: 'u-1', email: 'me@example.com', google_sub: '123' })).toEqual(
      { id: 'u-1', email: 'me@example.com' }
    )
  })
})

describe('AuthSessionSchema', () => {
  it('parses what a sign-in answers with', () => {
    expect(
      AuthSessionSchema.parse({ token: 'tok', user: { id: 'u-1', email: 'me@example.com' } })
    ).toEqual({ token: 'tok', user: { id: 'u-1', email: 'me@example.com' } })
    expect(() =>
      AuthSessionSchema.parse({ token: '', user: { id: 'u-1', email: 'me@example.com' } })
    ).toThrow()
  })
})
