import { useCallback, useEffect, useRef, useState } from 'react'
import {
  deleteMedia,
  listMediaAssets,
  updateMediaAlt,
  updateMediaFilename,
  uploadMediaFile,
  uploadPoster
} from '@/lib/media'
import {
  isAllowedMediaContentType,
  isDocumentContentType,
  maxUploadBytesFor,
  mediaKindOf,
  type MediaAsset
} from '@shared/domain/media'
import type { MediaKind } from '@shared/domain/nodes'
import { capturePoster } from '@/utils/capture-poster'
import { measureMediaFile } from '@/utils/measure-media'

// ---------------------------------------------------------------------------
// The insert dialog's state: the drop zone, the upload, and the library.
//
// Ported from kartik.to, where the bytes went straight from the browser to R2
// under a presigned URL and the shape and the still were stamped on
// afterwards. Here every file crosses to the main process once
// (`uploadMediaFile`), which stores it locally, records it, and mirrors it to
// R2 when it can — so there is no signing step, no PUT to watch, and no
// progress to report beyond which file of the batch is on the wire.
// ---------------------------------------------------------------------------

export type ImageInsertPhase = 'upload' | 'uploading' | 'library'

export type ImageSelectionMode = 'single' | 'multiple'

/**
 * Which half of the bucket this dialog is opening. No surface wants pictures
 * and documents at once: a block wants something it can DRAW, and the link
 * card's document picker wants a file to point at. The filter is the
 * dialog's, not the library's — it decides what is shown, what may be dropped
 * and which formats the hint names.
 */
export type ImageInsertAccepts = 'media' | 'document'

export interface UseImageInsertOptions {
  open: boolean
  initialPhase?: ImageInsertPhase
  /**
   * `multiple` turns the library into a batch picker. `selectedKey` keeps its
   * meaning either way, but in `multiple` it becomes the ANCHOR: the last row
   * touched, and so the one the metadata panel edits and the delete acts on.
   */
  selectionMode?: ImageSelectionMode
  /** Hard cap on a multiple selection. */
  maxSelection?: number
  /** Pictures and clips (the default), or documents. */
  accepts?: ImageInsertAccepts
  onReset?: () => void
}

export interface ImageInsertPayload {
  src: string
  alt?: string
  /**
   * Which element the inserted node should render with — read off the
   * asset's validated content type at the moment Insert is pressed, so no
   * node inserted from here ever has to be guessed at from its URL.
   */
  kind: MediaKind
  /**
   * The source's own pixel size, when the library knows it — measured at
   * upload and stored on the object ever since. Absent for anything the
   * browser declined to decode; those reserve their box at the house ratio.
   */
  width?: number
  height?: number
  /** A clip's still, for the surfaces that cannot play one. */
  poster?: string
}

/**
 * Take the still from a clip and store it beside the clip — the optional
 * half of a clip's upload. `false` for every way it can fail, and it never
 * throws: a browser that would not decode the clip or a store that refused
 * the still are not worth losing an uploaded clip over.
 */
async function storePoster(file: File, key: string): Promise<boolean> {
  try {
    const poster = await capturePoster(file)
    if (!poster) return false
    return (await uploadPoster(key, poster.blob)) !== null
  } catch {
    return false
  }
}

export function useImageInsert({
  open,
  initialPhase = 'upload',
  selectionMode = 'single',
  maxSelection = Number.POSITIVE_INFINITY,
  accepts = 'media',
  onReset
}: UseImageInsertOptions) {
  const isMultiple = selectionMode === 'multiple'
  const [phase, setPhase] = useState<ImageInsertPhase>('upload')
  const [assets, setAssets] = useState<MediaAsset[]>([])
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  // ORDERED, not a Set: the order images are picked in is the order they are
  // inserted in.
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [altText, setAltText] = useState('')
  const [filenameText, setFilenameText] = useState('')
  // Which file of the drop is on the wire, and how many there are.
  const [uploadIndex, setUploadIndex] = useState(0)
  const [uploadTotal, setUploadTotal] = useState(0)
  const [isDragOver, setIsDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const altSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nameSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const selectedAsset = assets.find((asset) => asset.key === selectedKey) ?? null

  /**
   * Whether this dialog will show, take or insert a file of this type. One
   * predicate for the library filter AND the drop zone, so the two cannot
   * give different answers to one question.
   */
  const allows = useCallback(
    (contentType: string) =>
      accepts === 'document'
        ? isDocumentContentType(contentType)
        : isAllowedMediaContentType(contentType),
    [accepts]
  )

  /** The half of the library this dialog is for. */
  const loadLibrary = useCallback(
    async () => (await listMediaAssets()).filter((a) => allows(a.contentType)),
    [allows]
  )

  const reset = useCallback(() => {
    setPhase('upload')
    setAssets([])
    setSelectedKey(null)
    setSelectedKeys([])
    setAltText('')
    setFilenameText('')
    setUploadIndex(0)
    setUploadTotal(0)
    setIsDragOver(false)
    setError(null)
    setIsDeleting(false)
    if (altSaveTimer.current) {
      clearTimeout(altSaveTimer.current)
      altSaveTimer.current = null
    }
    if (nameSaveTimer.current) {
      clearTimeout(nameSaveTimer.current)
      nameSaveTimer.current = null
    }
    onReset?.()
  }, [onReset])

  const refreshLibrary = useCallback(
    async (arrivals: string[] = []) => {
      const list = await loadLibrary()
      setAssets(list)
      // The anchor lands on the FIRST of an arrival: a drop of five reads top
      // down, so the panel opens on the one you would check first.
      const key = arrivals[0] ?? list[0]?.key ?? null
      setSelectedKey(key)
      // Files uploaded mid-batch JOIN the batch rather than replacing it. Only
      // an arrival does this; the bare refresh that opens the library is just
      // parking the anchor.
      if (isMultiple && arrivals.length > 0) {
        setSelectedKeys((prev) => {
          const next = [...prev]
          for (const arrival of arrivals) {
            if (next.length >= maxSelection) break
            if (!next.includes(arrival)) next.push(arrival)
          }
          return next
        })
      }
      const asset = list.find((item) => item.key === key)
      setAltText(asset?.alt ?? '')
      setFilenameText(asset?.filename ?? '')
      return list
    },
    [isMultiple, maxSelection, loadLibrary]
  )

  useEffect(() => {
    if (!open) return
    let ignore = false
    ;(async () => {
      try {
        const list = await loadLibrary()
        if (ignore) return
        setAssets(list)
      } catch (err) {
        if (ignore) return
        setError(err instanceof Error ? err.message : 'Failed to load library')
      }
    })()
    return () => {
      ignore = true
    }
  }, [open, loadLibrary])

  // Reset the form when the (externally controlled) dialog closes so it
  // reopens clean.
  useEffect(() => {
    if (!open) reset()
  }, [open, reset])

  useEffect(() => {
    if (!open || initialPhase !== 'library') return
    let ignore = false
    ;(async () => {
      try {
        await refreshLibrary()
        if (!ignore) setPhase('library')
      } catch (err) {
        if (!ignore) setError(err instanceof Error ? err.message : 'Failed to load library')
      }
    })()
    return () => {
      ignore = true
    }
  }, [open, initialPhase, refreshLibrary])

  /** Why the library will not take this file, or `null` if it will. */
  const refusalFor = useCallback(
    (file: File): string | null => {
      if (!allows(file.type)) return 'Unsupported file type'
      // The ceiling depends on the format — a clip is allowed to be an order
      // larger than a picture. Same check main makes; this one answers first.
      if (file.size > maxUploadBytesFor(file.type)) return 'File is too large'
      return null
    },
    [allows]
  )

  /**
   * Upload everything that was dropped or picked — a drop is a BATCH, and one
   * file is only the shortest one. Sequential, so the counter can say which
   * file it is describing. A refusal is per FILE: one `.mov` among four
   * screenshots is a file to skip and name, never a reason to throw the other
   * four away. Same for a store that refuses one mid-batch.
   */
  const processFiles = useCallback(
    async (files: File[]) => {
      setError(null)
      if (files.length === 0) return

      // A lone file is refused in its own words — naming it would be telling
      // somebody the name of the one file they just dropped.
      const describe = (file: File, reason: string) =>
        files.length === 1 ? reason : `${file.name}: ${reason}`

      const accepted: File[] = []
      const skipped: string[] = []
      for (const file of files) {
        const refusal = refusalFor(file)
        if (refusal) skipped.push(describe(file, refusal))
        else accepted.push(file)
      }

      if (accepted.length === 0) {
        setError(skipped.join(', '))
        return
      }

      setPhase('uploading')
      setUploadTotal(accepted.length)
      setUploadIndex(1)

      const arrivals: string[] = []

      for (const [index, file] of accepted.entries()) {
        setUploadIndex(index + 1)
        try {
          // Measured HERE, from the file in hand, and never again: this is
          // the only moment anything holds the bytes and the answer at once.
          // `null` when the browser will not decode the file.
          const shape = await measureMediaFile(file)
          const asset = await uploadMediaFile(file, shape ?? undefined)
          // A clip gets a still taken from it; a picture already IS its own
          // still. Asked here because this is the last moment the bytes are
          // local, and it costs the upload nothing if it fails.
          if (mediaKindOf(file.type) === 'video') await storePoster(file, asset.key)
          arrivals.push(asset.key)
        } catch (err) {
          skipped.push(describe(file, err instanceof Error ? err.message : 'Upload failed'))
        }
      }

      // Nothing landed: stay on the drop zone, where the file can be tried
      // again, rather than showing an empty-handed library.
      if (arrivals.length === 0) {
        setError(skipped.join(', ') || 'Upload failed')
        setPhase('upload')
        return
      }

      setError(skipped.length > 0 ? skipped.join(', ') : null)
      await refreshLibrary(arrivals)
      setPhase('library')
    },
    [refreshLibrary, refusalFor]
  )

  const openLibrary = useCallback(async () => {
    setError(null)
    try {
      await refreshLibrary(selectedKey ? [selectedKey] : [])
      setPhase('library')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load library')
    }
  }, [refreshLibrary, selectedKey])

  const goToUpload = useCallback(() => {
    setPhase('upload')
    setError(null)
  }, [])

  /** Move the anchor to `key` and load its metadata into the editable fields. */
  const anchorOn = useCallback(
    (key: string | null) => {
      setSelectedKey(key)
      const asset = assets.find((item) => item.key === key)
      setAltText(asset?.alt ?? '')
      setFilenameText(asset?.filename ?? '')
    },
    [assets]
  )

  /** A plain click: this image, and only this image. */
  const selectAsset = useCallback(
    (key: string) => {
      anchorOn(key)
      if (isMultiple) setSelectedKeys([key])
    },
    [anchorOn, isMultiple]
  )

  /**
   * A modified click: add or drop one image, leaving the rest of the batch
   * alone. Deselecting always works — only ADDING can hit the cap.
   */
  const toggleAsset = useCallback(
    (key: string) => {
      if (selectedKeys.includes(key)) {
        const next = selectedKeys.filter((item) => item !== key)
        setSelectedKeys(next)
        // Park the anchor on what's left.
        anchorOn(next.at(-1) ?? key)
        return
      }
      // The anchor moves even on a refused click — you pointed at the row.
      anchorOn(key)
      if (selectedKeys.length >= maxSelection) {
        setError(`You can select up to ${maxSelection} image${maxSelection === 1 ? '' : 's'}`)
        return
      }
      setError(null)
      setSelectedKeys([...selectedKeys, key])
    },
    [anchorOn, maxSelection, selectedKeys]
  )

  const updateAltText = useCallback(
    (value: string) => {
      setAltText(value)
      if (!selectedKey) return

      if (altSaveTimer.current) clearTimeout(altSaveTimer.current)
      altSaveTimer.current = setTimeout(async () => {
        try {
          const updated = await updateMediaAlt({ key: selectedKey, alt: value })
          setAssets((prev) => prev.map((item) => (item.key === updated.key ? updated : item)))
        } catch {
          // Non-blocking — alt stays in local state until retry.
        }
      }, 400)
    },
    [selectedKey]
  )

  /**
   * Rename for display only — the object key never changes, so URLs already
   * embedded in notes keep working. Debounced like the alt text, and a blank
   * field is left unsaved rather than writing an empty name.
   */
  const updateFilename = useCallback(
    (value: string) => {
      setFilenameText(value)
      if (!selectedKey || !value.trim()) return

      if (nameSaveTimer.current) clearTimeout(nameSaveTimer.current)
      nameSaveTimer.current = setTimeout(async () => {
        try {
          const updated = await updateMediaFilename({ key: selectedKey, filename: value.trim() })
          setAssets((prev) => prev.map((item) => (item.key === updated.key ? updated : item)))
        } catch {
          // Non-blocking — the name stays in local state until retry.
        }
      }, 400)
    },
    [selectedKey]
  )

  const deleteSelectedAsset = useCallback(async () => {
    if (!selectedKey) return

    setError(null)
    setIsDeleting(true)
    const keyToDelete = selectedKey

    if (altSaveTimer.current) {
      clearTimeout(altSaveTimer.current)
      altSaveTimer.current = null
    }
    if (nameSaveTimer.current) {
      clearTimeout(nameSaveTimer.current)
      nameSaveTimer.current = null
    }

    try {
      await deleteMedia({ key: keyToDelete })
      const remaining = assets.filter((item) => item.key !== keyToDelete)
      setAssets(remaining)
      // A deleted object can't stay in a batch that's about to be inserted.
      setSelectedKeys((prev) => prev.filter((key) => key !== keyToDelete))

      const nextKey = remaining[0]?.key ?? null
      setSelectedKey(nextKey)
      const nextAsset = remaining.find((item) => item.key === nextKey)
      setAltText(nextAsset?.alt ?? '')
      setFilenameText(nextAsset?.filename ?? '')

      if (remaining.length === 0) setPhase('upload')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete image')
    } finally {
      setIsDeleting(false)
    }
  }, [assets, selectedKey])

  const getInsertPayload = useCallback((): ImageInsertPayload | null => {
    if (!selectedAsset) return null
    return {
      src: selectedAsset.url,
      alt: altText.trim() || undefined,
      kind: mediaKindOf(selectedAsset.contentType),
      width: selectedAsset.width,
      height: selectedAsset.height,
      poster: selectedAsset.poster
    }
  }, [selectedAsset, altText])

  /**
   * The whole batch, in the order it was picked. Alt text comes from each
   * stored asset — except the ANCHOR, whose alt field may still be
   * mid-debounce and therefore newer in local state than in `assets`.
   */
  const getInsertPayloads = useCallback((): ImageInsertPayload[] => {
    return selectedKeys.flatMap((key) => {
      const asset = assets.find((item) => item.key === key)
      if (!asset) return []
      const alt = key === selectedKey ? altText : (asset.alt ?? '')
      return [
        {
          src: asset.url,
          alt: alt.trim() || undefined,
          kind: mediaKindOf(asset.contentType),
          width: asset.width,
          height: asset.height,
          poster: asset.poster
        }
      ]
    })
  }, [selectedKeys, assets, selectedKey, altText])

  const isBusy = phase === 'uploading' || isDeleting

  return {
    phase,
    assets,
    hasLibraryImages: assets.length > 0,
    selectedKey,
    selectedKeys,
    selectedAsset,
    altText,
    filenameText,
    uploadIndex,
    uploadTotal,
    isDragOver,
    setIsDragOver,
    error,
    isBusy,
    processFiles,
    openLibrary,
    goToUpload,
    selectAsset,
    toggleAsset,
    updateAltText,
    updateFilename,
    deleteSelectedAsset,
    getInsertPayload,
    getInsertPayloads,
    reset
  }
}
