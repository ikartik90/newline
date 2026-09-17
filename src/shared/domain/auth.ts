import { z } from 'zod'

// ---------------------------------------------------------------------------
// Who is signed in, as the Worker reports it (`worker/README.md`, Auth). Main
// stores it beside the session token; the renderer reads it over IPC.
// ---------------------------------------------------------------------------

export const AuthUserSchema = z.object({
  /** Minted by the Worker on first sign-in; stable across the account's life. */
  id: z.string().min(1),
  email: z.string().min(1),
  name: z.string().optional(),
  picture: z.string().optional()
})

export type AuthUser = z.infer<typeof AuthUserSchema>

/**
 * What `POST /auth/google/code` answers with: the session token, its owner
 * and Google's ID token, which the renderer still signs into Firebase with.
 */
export const AuthSessionSchema = z.object({
  token: z.string().min(1),
  user: AuthUserSchema,
  idToken: z.string().min(1)
})

export type AuthSession = z.infer<typeof AuthSessionSchema>

/** What `GET /auth/google/config` answers with: the OAuth client the app signs in as. */
export const GoogleSignInConfigSchema = z.object({
  clientId: z.string().min(1)
})

export type GoogleSignInConfig = z.infer<typeof GoogleSignInConfigSchema>

/**
 * The message a cancelled sign-in rejects with. An error crosses the IPC
 * bridge as text only, wrapped in the bridge's own words, so the renderer
 * tells a cancellation from a failure by this message rather than by class.
 */
export const SIGN_IN_CANCELLED_MESSAGE = 'Sign-in was cancelled'

export function isSignInCancelled(error: unknown): boolean {
  return error instanceof Error && error.message.includes(SIGN_IN_CANCELLED_MESSAGE)
}
