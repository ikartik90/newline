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

/** What `POST /auth/google` answers with: the session token and its owner. */
export const AuthSessionSchema = z.object({
  token: z.string().min(1),
  user: AuthUserSchema
})

export type AuthSession = z.infer<typeof AuthSessionSchema>
