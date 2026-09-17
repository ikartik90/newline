import type { MediaAsset } from '@shared/domain/media'

// ---------------------------------------------------------------------------
// The renderer's media client — what kartik.to's `app/actions/media.ts` server
// actions are here. Every call crosses to the main process over
// `window.api.media`, which owns the local files and the R2 credentials.
// ---------------------------------------------------------------------------

export async function listMediaAssets(): Promise<MediaAsset[]> {
  return window.api.media.list()
}

/**
 * Store a file the author picked or pasted. Resolves once it is safe on
 * disk; the returned asset's `url` is the public R2 URL when the upload also
 * landed, or `local://…` when it is queued for later.
 */
export async function uploadMediaFile(
  file: File,
  shape?: { width?: number; height?: number }
): Promise<MediaAsset> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  return window.api.media.upload({
    filename: file.name || 'media',
    contentType: file.type,
    bytes,
    width: shape?.width,
    height: shape?.height
  })
}

export async function updateMediaAlt(input: { key: string; alt: string }): Promise<MediaAsset> {
  return window.api.media.updateAlt(input.key, input.alt)
}

export async function updateMediaFilename(input: {
  key: string
  filename: string
}): Promise<MediaAsset> {
  return window.api.media.rename(input.key, input.filename)
}

export async function deleteMedia(input: { key: string }): Promise<void> {
  return window.api.media.delete(input.key)
}

/** Store a clip's still beside it. Resolves to the poster URL, or null. */
export async function uploadPoster(key: string, still: Blob): Promise<string | null> {
  const bytes = new Uint8Array(await still.arrayBuffer())
  return window.api.media.uploadPoster(key, bytes)
}
