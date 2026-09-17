/// <reference types="electron-vite/node" />

/**
 * The R2 settings, read from `.env` by electron-vite (only `MAIN_VITE_*`
 * names reach the main process). All optional: with any missing, media stays
 * on this machine — see `services/r2.ts`.
 */
interface ImportMetaEnv {
  readonly MAIN_VITE_R2_ACCOUNT_ID?: string
  readonly MAIN_VITE_R2_ACCESS_KEY_ID?: string
  readonly MAIN_VITE_R2_SECRET_ACCESS_KEY?: string
  readonly MAIN_VITE_R2_BUCKET_NAME?: string
  readonly MAIN_VITE_R2_PUBLIC_BASE_URL?: string
}
