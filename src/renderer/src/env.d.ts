/// <reference types="vite/client" />

import type { AuthUser } from '@shared/domain/auth'
import type { MediaAsset } from '@shared/domain/media'
import type { SyncResult } from '@shared/domain/sync'

declare global {
  /** `showPopover`'s options, which lib.dom does not know yet: `source` is the popover's implicit anchor. */
  interface ShowPopoverOptions {
    source?: Element
  }

  interface HTMLElement {
    showPopover(options?: ShowPopoverOptions): void
  }

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

  /** What the command menu offers depends on: what the note window holds. */
  interface CommandMenuState {
    sidebarCollapsed: boolean
    noteOpen: boolean
    theme: 'light' | 'dark'
  }

  interface Window {
    api: {
      platform: NodeJS.Platform
      /** Whether the window is the OS's own blur under a clear page: macOS, or Windows 11's acrylic. */
      frosted: boolean
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
      /**
       * The window's own materials (macOS's frosted sidebar) follow the OS
       * appearance; this hands them the app's theme choice so they follow it.
       */
      theme: {
        setSource: (source: 'light' | 'dark' | 'system') => Promise<void>
      }
      /** The window itself: whether it fills the screen, where macOS hides its buttons. */
      window: {
        isFullScreen: () => Promise<boolean>
        /** The sidebar's width in CSS pixels, for the macOS glass laid under it. */
        setSidebarWidth: (width: number) => void
        /** Hear the window enter or leave full screen. Returns the unsubscribe. */
        onFullScreenChange: (listener: (fullScreen: boolean) => void) => () => void
        /**
         * Lays AppKit's glass over the whole window, or lifts it, for a dialog
         * to stand on (macOS 27 and later). Absent where there is no such glass.
         */
        setGlass?: (on: boolean) => void
      }
      /**
       * The glass command palette (macOS 27 and later): the command menu in a
       * window of its own over the note window, on AppKit's glass. Absent, or
       * not `native`, the menu is the in-page dialog.
       */
      palette?: {
        native: boolean
        /** The note window: show the palette for what it holds. */
        open: (state: CommandMenuState) => void
        /** The note window: hear an action picked in the palette, by its id. */
        onCommand: (listener: (id: string) => void) => () => void
        /** The note window: hear a note picked in the palette. */
        onOpenNote: (listener: (note: Note) => void) => () => void
        /** The note window: hear the palette show over it and go. */
        onVisible: (listener: (visible: boolean) => void) => () => void
        /** The palette: hear main show it, and the most it may stand, in CSS pixels. */
        onShow: (listener: (state: CommandMenuState, maxHeight: number) => void) => () => void
        /** The palette: hear the window under it resized, and the most it may now stand. */
        onFit: (listener: (maxHeight: number) => void) => () => void
        /** The palette: an action was picked; main closes it and tells the note window. */
        run: (id: string) => void
        /** The palette: a note was picked. */
        openNote: (note: Note) => void
        close: () => void
        /** The palette: how tall it stands, in CSS pixels. */
        setHeight: (height: number) => void
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
