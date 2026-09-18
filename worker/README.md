# newline-api

Newline's only backend: one Cloudflare Worker with three bindings. D1 `DB` holds users, sessions and the media catalogue; R2 `MEDIA` holds bytes; secrets carry the Google OAuth client, vars the quota. Everything runs inside the Workers Free plan and the D1 and R2 free allowances, and the Worker enforces a storage quota below R2's free allowance so the account never bills.

- Local: `npm run dev` in `worker/` serves `http://127.0.0.1:8787` against local D1 and R2 emulations.
- Tests: `npm test` in `worker/` runs vitest inside workerd with real bindings.
- Deploy: `npm run deploy` in `worker/` (needs a Cloudflare login).

The desktop app calls the deployed Worker by default and honours `MAIN_VITE_API_URL` in `.env` as an override (`src/main/services/api.ts`).

## Auth

Google is the identity provider, through the OAuth 2.0 flow for native apps. The app opens the user's default browser at Google's consent screen with PKCE and a loopback redirect (`http://127.0.0.1:<port>/callback`, a fresh port per sign-in), receives the authorization code on that loopback, and hands the code to the Worker. The Worker exchanges it with Google using the client secret only it holds, verifies the ID token Google returns (signature against Google's JWKS at `https://www.googleapis.com/oauth2/v3/certs`, `iss` in `https://accounts.google.com` / `accounts.google.com`, `aud` equal to `GOOGLE_CLIENT_ID`, unexpired, `email_verified` true) and mints a session. The OAuth client is of type **Desktop app**, the type Google allows any loopback port for.

| Route                     | Auth   | Body                                  | Response                                                                                          |
| ------------------------- | ------ | ------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `GET /auth/google/config` | none   |                                       | `200 { clientId }`, the public client id the app builds the consent URL with; `500 misconfigured` |
| `POST /auth/google/code`  | none   | `{ code, codeVerifier, redirectUri }` | `200 { token, user }`, `401 invalid_code`, `500 misconfigured`                                    |
| `GET /auth/me`            | Bearer |                                       | `200 { user }`, `401 unauthorized`                                                                |
| `POST /auth/signout`      | Bearer |                                       | `204` (an unknown token is also `204`)                                                            |

- The exchange is `POST https://oauth2.googleapis.com/token`, form-encoded: `client_id`, `client_secret`, `code`, `code_verifier`, `redirect_uri` (the loopback URL the code was issued for, verbatim) and `grant_type=authorization_code`. Google refusing the exchange, an answer without an `id_token`, or a token that fails verification is `401 invalid_code`. An unset `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` is `500 misconfigured`.
- `user = { id, email, name?, picture? }`. `id` is a uuid minted on first sign-in; users are keyed by Google `sub`, and `email`, `name`, `picture` are refreshed on every sign-in.
- The session token is 32 random bytes, base64url. D1 stores only its SHA-256 hex. Sessions expire 180 days after last use; `last_used_at` and `expires_at` move forward at most once a day.
- Every `/notes` and `/media` route requires `Authorization: Bearer <token>`. A missing, unknown or expired token is `401 { error: 'unauthorized' }`.

## Notes

The store behind sync. Every note belongs to one user; the app is the source of truth for its own edits, the Worker stamps the order. Shapes and limits are the zod schemas in `src/shared/domain/sync.ts`, which both sides import.

| Route                             | Auth   | Body / query                                  | Response                                                                                    |
| --------------------------------- | ------ | --------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `PUT /notes/<id>`                 | Bearer | `{ title, body, tags, createdAt, isDeleted }` | `200 { id, updatedAt }`, `400 bad_request` / `invalid_id` / `invalid_body`, `413 too_large` |
| `GET /notes?cursor=<c>&limit=<n>` | Bearer | both optional                                 | `200 { notes: NoteRecord[], cursor: string \| null, hasMore: boolean }`                     |

```ts
type NoteRecord = {
  id: string // the app's uuid
  title: string
  body: string // the Document as JSON text, exactly as the app stores it
  tags: string[]
  createdAt: number // ms, the app's
  updatedAt: number // ms, stamped by the Worker on every PUT
  isDeleted: boolean // a tombstone; deletions are PUTs with this set
}
```

- A PUT creates or replaces the note and stamps `updatedAt` with the Worker's clock. `body` must parse as a `Document` (`DocumentSchema`), otherwise `400 invalid_body`; a body over the limit is `413 too_large`. `id` must match `NOTE_ID_PATTERN`.
- `GET /notes` lists the user's notes changed after the cursor, tombstones included, ordered by `updatedAt` then `id`, at most `limit` (default 500, max 1000). The answer's `cursor` is the position after the last note returned, which the app stores and sends next time; on an empty page it is the cursor that was sent, or null when none was. `hasMore` is true when a further page exists now, and the app keeps requesting until it is false. A cursor is opaque (`base64url(updatedAt:id)`) and keyset-based, so two notes stamped in the same millisecond are never skipped; one that does not decode is `400 bad_request`. No cursor means from the beginning.
- There is no delete route: a deletion is a PUT with `isDeleted: true`, so it reaches every device.
- The Worker must be deployed before an app version that writes a new block type, since it validates bodies with the same schema.

## Media

Keys are the app's own: `media/<uuid>-<safe-name>` for library objects and `posters/<name>.jpg` for the stills taken from clips. The bucket key is `u/<userId>/<key>`, which the app never sees; a URL is opaque to it.

The public URL of an object is `${MEDIA_PUBLIC_BASE_URL}/u/<userId>/<key>`, and `MEDIA_PUBLIC_BASE_URL` defaults to the Worker's own origin plus `/m`, so bytes are served by the Worker straight from the binding and the bucket needs no public access of its own.

| Route                              | Body / query                                                   | Response                                                                                             |
| ---------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `PUT /media/objects/<key>`         | bytes; `Content-Type`; optional `X-Media-Metadata` JSON object | `200 MediaObject`, `400 invalid_key` / `invalid_content_type`, `413 too_large`, `507 quota_exceeded` |
| `GET /media/objects/<key>`         |                                                                | `200 MediaObject`, `404 not_found`                                                                   |
| `PATCH /media/objects/<key>`       | `{ metadata: { filename?, alt?, width?, height?, poster? } }`  | `200 MediaObject` (merged), `404 not_found`                                                          |
| `DELETE /media/objects/<key>`      |                                                                | `204`, also when missing                                                                             |
| `GET /media/objects?prefix=media/` | `prefix` optional, default `media/`                            | `200 { objects: MediaObject[] }`, newest first                                                       |
| `GET /media/usage`                 |                                                                | `200 { bytes, quotaBytes }`                                                                          |
| `GET /m/u/<userId>/<key>`          | public, no auth; `Range` honoured with `206`                   | the bytes with `Content-Type` and `Cache-Control: public, max-age=31536000, immutable`; `404`        |

```ts
type MediaObject = {
  key: string // the app's key
  url: string // public URL
  size: number
  contentType: string
  metadata: { filename: string; alt?: string; width?: string; height?: string; poster?: string }
}
```

- Metadata values are strings, as R2 custom metadata would be, so the app's existing reading code applies. `filename` defaults to the key's own file name when the PUT carries none.
- A PUT to an existing key of the same user overwrites bytes and metadata and adjusts the usage.
- Per-file caps and the allowed content types come from `src/shared/domain/media.ts` (images 10 MB, documents 25 MB, video 50 MB). A body above its cap is `413`.
- Quota: `MEDIA_QUOTA_BYTES` (default 8 GiB) over the sum of a user's object sizes, tracked in D1. A PUT that would cross it is `507 { error: 'quota_exceeded', bytes, quotaBytes }` and stores nothing.
- The bytes and the catalogue row are written together: R2 first, then D1; a failed D1 write deletes the object again.

## Errors

Every error is JSON `{ error: string }` with the status. Wrong method is `405`; an unknown route is `404 { error: 'not_found' }`. Bodies that fail to parse are `400 { error: 'bad_request' }`.

## Bindings and vars

| Name                    | Kind   | Purpose                                                           |
| ----------------------- | ------ | ----------------------------------------------------------------- |
| `DB`                    | D1     | `users`, `sessions`, `media_objects`, `notes` (see `migrations/`) |
| `MEDIA`                 | R2     | object bytes under `u/<userId>/…`                                 |
| `GOOGLE_CLIENT_ID`      | secret | the Desktop-app OAuth client the app signs in with                |
| `GOOGLE_CLIENT_SECRET`  | secret | that client's secret; only the Worker ever holds it               |
| `MEDIA_QUOTA_BYTES`     | var    | optional, default `8589934592`                                    |
| `MEDIA_PUBLIC_BASE_URL` | var    | optional, default the Worker origin + `/m`                        |

## Schema

```sql
CREATE TABLE users (
  id           TEXT PRIMARY KEY,
  google_sub   TEXT NOT NULL UNIQUE,
  email        TEXT NOT NULL,
  name         TEXT,
  picture      TEXT,
  created_at   INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash   TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id),
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE notes (
  user_id    TEXT NOT NULL REFERENCES users(id),
  id         TEXT NOT NULL,
  title      TEXT NOT NULL DEFAULT '',
  body       TEXT NOT NULL,
  tags       TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX notes_user_updated ON notes(user_id, updated_at, id);

CREATE TABLE media_objects (
  user_id      TEXT NOT NULL REFERENCES users(id),
  key          TEXT NOT NULL,
  size         INTEGER NOT NULL,
  content_type TEXT NOT NULL,
  filename     TEXT NOT NULL,
  alt          TEXT,
  width        INTEGER,
  height       INTEGER,
  poster       TEXT,
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (user_id, key)
);
```
