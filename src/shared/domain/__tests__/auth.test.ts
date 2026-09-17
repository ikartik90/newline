import { describe, expect, it } from 'vitest'
import {
  AuthSessionSchema,
  AuthUserSchema,
  GoogleSignInConfigSchema,
  SIGN_IN_CANCELLED_MESSAGE,
  isSignInCancelled
} from '../auth'

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
  const user = { id: 'u-1', email: 'me@example.com' }

  it('parses what a sign-in answers with: the session, its owner and the ID token', () => {
    expect(AuthSessionSchema.parse({ token: 'tok', user, idToken: 'google-id-token' })).toEqual({
      token: 'tok',
      user,
      idToken: 'google-id-token'
    })
  })

  it('refuses an empty token or a missing ID token', () => {
    expect(() => AuthSessionSchema.parse({ token: '', user, idToken: 'x' })).toThrow()
    expect(() => AuthSessionSchema.parse({ token: 'tok', user })).toThrow()
    expect(() => AuthSessionSchema.parse({ token: 'tok', user, idToken: '' })).toThrow()
  })
})

describe('GoogleSignInConfigSchema', () => {
  it('parses the client id the Worker publishes', () => {
    expect(GoogleSignInConfigSchema.parse({ clientId: '123.apps.googleusercontent.com' })).toEqual({
      clientId: '123.apps.googleusercontent.com'
    })
  })

  it('refuses a missing or empty client id', () => {
    expect(() => GoogleSignInConfigSchema.parse({})).toThrow()
    expect(() => GoogleSignInConfigSchema.parse({ clientId: '' })).toThrow()
  })
})

describe('isSignInCancelled', () => {
  it('recognises the cancellation as main raises it', () => {
    expect(isSignInCancelled(new Error(SIGN_IN_CANCELLED_MESSAGE))).toBe(true)
  })

  it('recognises it after the IPC bridge has wrapped it in its own words', () => {
    expect(
      isSignInCancelled(
        new Error(
          `Error invoking remote method 'auth:google': SignInCancelledError: ${SIGN_IN_CANCELLED_MESSAGE}`
        )
      )
    ).toBe(true)
  })

  it('leaves every other failure alone', () => {
    expect(isSignInCancelled(new Error('API request failed: invalid_code (401)'))).toBe(false)
    expect(isSignInCancelled('not even an error')).toBe(false)
    expect(isSignInCancelled(undefined)).toBe(false)
  })
})
