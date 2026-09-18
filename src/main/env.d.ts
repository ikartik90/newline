/// <reference types="electron-vite/node" />

/**
 * The Worker's base URL, read from `.env` by electron-vite (only `MAIN_VITE_*`
 * names reach the main process). Optional: without it there is no sign-in
 * and media stays on this machine — see `services/api.ts`.
 */
interface ImportMetaEnv {
  readonly MAIN_VITE_API_URL?: string
}
