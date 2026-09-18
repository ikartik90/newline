/// <reference types="vite/client" />

import type { AuthUser } from '@shared/domain/auth'
import type { MediaAsset } from '@shared/domain/media'
import type { SyncResult } from '@shared/domain/sync'

declare global {
  /**
   * A note as the renderer sees it. `body` is the JSON-serialised Document
   * (see `@shared/domain/document`); parse it with `parseDocument`. The main
   * process derives `plainText` from the body for search and previews.
   */
  interface Note {
    id: string
    title: string
    body: string
    plainText: string
    tags: string[]
    createdAt: number
    updatedAt: number
    lastSyncedAt: number | null
    isDeleted: boolean
  }

  interface SyncStatus {
    pendingCount: number
    failedCount: number
    lastSyncedAt: number | null
  }

  /** What the renderer hands main to store a file the author picked or pasted. */
  interface MediaUploadInput {
    filename: string
    contentType: string
    bytes: Uint8Array
    width?: number
    height?: number
  }

  interface Window {
    api: {
      platform: NodeJS.Platform
      notes: {
        create: (title?: string, body?: string) => Promise<Note>
        update: (
          id: string,
          fields: { title?: string; body?: string; tags?: string[] }
        ) => Promise<Note | null>
        delete: (id: string) => Promise<void>
        get: (id: string) => Promise<Note | null>
        list: () => Promise<Note[]>
        search: (query: string) => Promise<Note[]>
      }
      /**
       * Sync with the Worker runs in the main process, on a timer and on
       * every save. The renderer asks for a cycle when it comes up and when
       * the machine comes back online, pushes the note it just saved, and
       * reloads its list when main says a pull changed something.
       */
      sync: {
        /** One cycle: push, send pending media, pull. Shares a cycle already running. */
        now: () => Promise<SyncResult>
        /** Send one note now; false leaves it queued for the next cycle. */
        pushNote: (id: string) => Promise<boolean>
        status: () => Promise<SyncStatus>
        /** Hear about a pull that changed notes. Resolves to the unsubscribe. */
        onChanged: (listener: () => void) => () => void
      }
      meta: {
        set: (key: string, value: string) => Promise<void>
        get: (key: string) => Promise<string | null>
      }
      /**
       * The media library. Every file is saved on this machine first, under
       * `userData/media/`, and served back as `local://<file>`. When the app
       * is signed in and the machine is online the same call uploads it to
       * the Worker and returns the public URL instead; otherwise the upload
       * is queued and the sync service rewrites `local://` sources in notes
       * once it lands.
       */
      media: {
        list: () => Promise<MediaAsset[]>
        upload: (input: MediaUploadInput) => Promise<MediaAsset>
        updateAlt: (key: string, alt: string) => Promise<MediaAsset>
        rename: (key: string, filename: string) => Promise<MediaAsset>
        delete: (key: string) => Promise<void>
        /** Store a clip's still beside it; resolves to the poster URL. */
        uploadPoster: (key: string, bytes: Uint8Array) => Promise<string | null>
        /** Upload anything still local-only. Resolves to how many landed. */
        flushPending: () => Promise<number>
      }
      /**
       * Sign-in lives in the main process: it sends the user's browser to
       * Google's consent screen, receives the authorization code on a
       * loopback port, trades it with the Worker for a session and keeps
       * that session; the renderer only ever learns who the user is.
       * `googleSignIn` rejects with a message containing
       * `SIGN_IN_CANCELLED_MESSAGE` (`@shared/domain/auth`) when the user
       * declines in the browser or `cancelSignIn` ends the attempt.
       */
      auth: {
        googleSignIn: () => Promise<{ user: AuthUser }>
        cancelSignIn: () => Promise<void>
        current: () => Promise<AuthUser | null>
        signOut: () => Promise<void>
      }
    }
  }
}

export {}
