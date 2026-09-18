import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { MediaAsset } from '@shared/domain/media'
import { useImageInsert } from '../use-image-insert'

const mockListMediaAssets = vi.fn()
const mockUploadMediaFile = vi.fn()
const mockUpdateMediaAlt = vi.fn()
const mockUpdateMediaFilename = vi.fn()
const mockDeleteMedia = vi.fn()
const mockUploadPoster = vi.fn()

vi.mock('@/lib/media', () => ({
  listMediaAssets: (...args: unknown[]) => mockListMediaAssets(...args),
  uploadMediaFile: (...args: unknown[]) => mockUploadMediaFile(...args),
  updateMediaAlt: (...args: unknown[]) => mockUpdateMediaAlt(...args),
  updateMediaFilename: (...args: unknown[]) => mockUpdateMediaFilename(...args),
  deleteMedia: (...args: unknown[]) => mockDeleteMedia(...args),
  uploadPoster: (...args: unknown[]) => mockUploadPoster(...args)
}))

// Choosing a poster frame needs a video decoder, and jsdom has none. What the
// frames are scored on is covered in `utils/__tests__/poster-frame.test.ts`;
// this file cares only that a clip is offered to it and a picture is not.
const mockCapturePoster = vi.fn()
vi.mock('@/utils/capture-poster', () => ({
  capturePoster: (...args: unknown[]) => mockCapturePoster(...args)
}))

// The measurement is the DOM's answer about a real file, and jsdom loads
// nothing — the real one would sit out its whole timeout on every upload.
const mockMeasureMediaFile = vi.fn()
vi.mock('@/utils/measure-media', () => ({
  measureMediaFile: (...args: unknown[]) => mockMeasureMediaFile(...args)
}))

const asset = (name: string, over: Partial<MediaAsset> = {}): MediaAsset => ({
  key: `media/${name}.png`,
  url: `https://cdn/${name}.png`,
  filename: `${name}.png`,
  contentType: 'image/png',
  size: 100,
  ...over
})

/** What the main process hands back for a file it has just stored. */
const stored = (file: File): MediaAsset => ({
  key: `media/uuid-${file.name}`,
  url: `https://cdn/${file.name}`,
  filename: file.name,
  contentType: file.type,
  size: file.size
})

/** A file of `size` bytes without allocating any of them. */
const fileOf = (name: string, type = 'image/png', size = 100) => {
  const file = new File(['x'], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

const settle = () =>
  act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })

describe('useImageInsert', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListMediaAssets.mockResolvedValue([])
    mockMeasureMediaFile.mockResolvedValue(null)
  })

  it('loads library when open', async () => {
    mockListMediaAssets.mockResolvedValue([asset('a')])
    const { result } = renderHook(() => useImageInsert({ open: true }))
    await settle()
    expect(mockListMediaAssets).toHaveBeenCalled()
    expect(result.current.hasLibraryImages).toBe(true)
  })

  it('opens directly in library phase when requested', async () => {
    mockListMediaAssets.mockResolvedValue([asset('a')])
    const { result } = renderHook(() => useImageInsert({ open: true, initialPhase: 'library' }))
    await settle()
    expect(result.current.phase).toBe('library')
    expect(result.current.selectedKey).toBe('media/a.png')
  })

  it('resets when closed', async () => {
    const { result, rerender } = renderHook(({ open }) => useImageInsert({ open }), {
      initialProps: { open: true }
    })
    await settle()
    rerender({ open: false })
    expect(result.current.phase).toBe('upload')
    expect(result.current.assets).toEqual([])
  })

  it('deleteSelectedAsset removes the current image and selects the next one', async () => {
    mockListMediaAssets.mockResolvedValue([asset('a'), asset('b', { size: 200 })])
    mockDeleteMedia.mockResolvedValue(undefined)

    const { result } = renderHook(() => useImageInsert({ open: true }))
    await settle()

    act(() => result.current.selectAsset('media/a.png'))
    await act(async () => {
      await result.current.deleteSelectedAsset()
    })

    expect(mockDeleteMedia).toHaveBeenCalledWith({ key: 'media/a.png' })
    expect(result.current.assets).toHaveLength(1)
    expect(result.current.selectedKey).toBe('media/b.png')
  })

  it('goes back to the drop zone once the last file is deleted', async () => {
    mockListMediaAssets.mockResolvedValue([asset('a')])
    mockDeleteMedia.mockResolvedValue(undefined)
    const { result } = renderHook(() => useImageInsert({ open: true, initialPhase: 'library' }))
    await settle()
    await act(async () => {
      await result.current.deleteSelectedAsset()
    })
    expect(result.current.phase).toBe('upload')
  })

  // The urls below carry NO extension on purpose: a bare key reads as a
  // picture whatever it holds, so it proves the answer came from the content
  // type rather than the name.
  it('hands the insert its kind, read from the stored content type', async () => {
    mockListMediaAssets.mockResolvedValue([
      asset('demo', { key: 'media/demo', url: 'https://cdn/demo', contentType: 'video/mp4' }),
      asset('shot', { key: 'media/shot', url: 'https://cdn/shot' })
    ])
    const { result } = renderHook(() => useImageInsert({ open: true }))
    await settle()

    act(() => result.current.selectAsset('media/demo'))
    expect(result.current.getInsertPayload()).toEqual({
      src: 'https://cdn/demo',
      alt: undefined,
      kind: 'video'
    })

    act(() => result.current.selectAsset('media/shot'))
    expect(result.current.getInsertPayload()?.kind).toBe('image')
  })

  it('has nothing to insert when nothing is selected', async () => {
    const { result } = renderHook(() => useImageInsert({ open: true }))
    await settle()
    expect(result.current.getInsertPayload()).toBeNull()
  })

  it('lists only the half of the library the dialog is for', async () => {
    mockListMediaAssets.mockResolvedValue([
      asset('cv', { contentType: 'application/pdf' }),
      asset('shot')
    ])
    const media = renderHook(() => useImageInsert({ open: true }))
    await settle()
    expect(media.result.current.assets.map((a) => a.filename)).toEqual(['shot.png'])

    const documents = renderHook(() => useImageInsert({ open: true, accepts: 'document' }))
    await settle()
    expect(documents.result.current.assets.map((a) => a.filename)).toEqual(['cv.png'])
  })

  it('saves alt text after a pause, and folds the answer back into the list', async () => {
    vi.useFakeTimers()
    try {
      mockListMediaAssets.mockResolvedValue([asset('a')])
      mockUpdateMediaAlt.mockResolvedValue(asset('a', { alt: 'Saved' }))
      const { result } = renderHook(() => useImageInsert({ open: true, initialPhase: 'library' }))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      act(() => result.current.updateAltText('Saved'))
      expect(mockUpdateMediaAlt).not.toHaveBeenCalled()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(400)
      })
      expect(mockUpdateMediaAlt).toHaveBeenCalledWith({ key: 'media/a.png', alt: 'Saved' })
      expect(result.current.assets[0].alt).toBe('Saved')
    } finally {
      vi.useRealTimers()
    }
  })

  it('renames for display only, and never to a blank', async () => {
    vi.useFakeTimers()
    try {
      mockListMediaAssets.mockResolvedValue([asset('a')])
      mockUpdateMediaFilename.mockResolvedValue(asset('a', { filename: 'better.png' }))
      const { result } = renderHook(() => useImageInsert({ open: true, initialPhase: 'library' }))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      act(() => result.current.updateFilename('   '))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(400)
      })
      expect(mockUpdateMediaFilename).not.toHaveBeenCalled()

      act(() => result.current.updateFilename('better.png'))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(400)
      })
      expect(mockUpdateMediaFilename).toHaveBeenCalledWith({
        key: 'media/a.png',
        filename: 'better.png'
      })
    } finally {
      vi.useRealTimers()
    }
  })
})

// ---------------------------------------------------------------------------
// What the drop zone will take — the same allow-list and the same per-format
// ceilings the main process enforces, answered here without the round trip.
// ---------------------------------------------------------------------------

describe('useImageInsert file validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListMediaAssets.mockResolvedValue([])
    mockMeasureMediaFile.mockResolvedValue(null)
    mockUploadMediaFile.mockImplementation(async (file: File) => stored(file))
  })

  const drop = async (file: File) => {
    const { result } = renderHook(() => useImageInsert({ open: true }))
    await act(async () => {
      await result.current.processFiles([file])
    })
    return result
  }

  it('refuses a format the library does not take', async () => {
    const result = await drop(fileOf('clip.mov', 'video/quicktime', 1024))
    expect(result.current.error).toBe('Unsupported file type')
    expect(mockUploadMediaFile).not.toHaveBeenCalled()
  })

  it('takes an mp4', async () => {
    const file = fileOf('clip.mp4', 'video/mp4', 1024)
    await drop(file)
    expect(mockUploadMediaFile).toHaveBeenCalledWith(file, undefined)
  })

  it('refuses a document where media is wanted, and the reverse', async () => {
    const result = await drop(fileOf('cv.pdf', 'application/pdf', 1024))
    expect(result.current.error).toBe('Unsupported file type')

    const { result: documents } = renderHook(() =>
      useImageInsert({ open: true, accepts: 'document' })
    )
    await act(async () => {
      await documents.current.processFiles([fileOf('shot.png', 'image/png', 1024)])
    })
    expect(documents.current.error).toBe('Unsupported file type')
    expect(mockUploadMediaFile).not.toHaveBeenCalled()
  })

  // The ceiling follows the FORMAT. A clip is allowed to be an order larger
  // than a picture.
  it('holds each format to its own ceiling', async () => {
    const size = 20 * 1024 * 1024

    const picture = await drop(fileOf('huge.png', 'image/png', size))
    expect(picture.current.error).toBe('File is too large')
    expect(mockUploadMediaFile).not.toHaveBeenCalled()

    const clip = await drop(fileOf('clip.mp4', 'video/mp4', size))
    expect(clip.current.error).not.toBe('File is too large')
    expect(mockUploadMediaFile).toHaveBeenCalledOnce()
  })
})

// ---------------------------------------------------------------------------
// Multi-selection — the collection block picks several images at once
// ---------------------------------------------------------------------------

describe('useImageInsert (selectionMode: multiple)', () => {
  const LIBRARY = [asset('a'), asset('b'), asset('c')]

  beforeEach(() => {
    vi.clearAllMocks()
    mockListMediaAssets.mockResolvedValue(LIBRARY)
    mockMeasureMediaFile.mockResolvedValue(null)
  })

  async function openMultiple(maxSelection = 6) {
    const view = renderHook(() =>
      useImageInsert({ open: true, selectionMode: 'multiple', maxSelection })
    )
    await settle()
    return view
  }

  it('starts with nothing selected', async () => {
    const { result } = await openMultiple()
    expect(result.current.selectedKeys).toEqual([])
  })

  it('replaces the whole selection on a plain select', async () => {
    const { result } = await openMultiple()
    act(() => result.current.toggleAsset('media/a.png'))
    act(() => result.current.toggleAsset('media/b.png'))
    act(() => result.current.selectAsset('media/c.png'))
    expect(result.current.selectedKeys).toEqual(['media/c.png'])
  })

  it('adds then removes on toggle, and moves the anchor with it', async () => {
    const { result } = await openMultiple()
    act(() => result.current.toggleAsset('media/a.png'))
    act(() => result.current.toggleAsset('media/b.png'))
    expect(result.current.selectedKeys).toEqual(['media/a.png', 'media/b.png'])
    expect(result.current.selectedKey).toBe('media/b.png')

    act(() => result.current.toggleAsset('media/a.png'))
    expect(result.current.selectedKeys).toEqual(['media/b.png'])
  })

  it('refuses to select past maxSelection and says why', async () => {
    const { result } = await openMultiple(2)
    act(() => result.current.toggleAsset('media/a.png'))
    act(() => result.current.toggleAsset('media/b.png'))
    act(() => result.current.toggleAsset('media/c.png'))

    expect(result.current.selectedKeys).toEqual(['media/a.png', 'media/b.png'])
    expect(result.current.error).toMatch(/2/)
  })

  it('still lets you deselect when full', async () => {
    const { result } = await openMultiple(2)
    act(() => result.current.toggleAsset('media/a.png'))
    act(() => result.current.toggleAsset('media/b.png'))
    act(() => result.current.toggleAsset('media/b.png'))
    expect(result.current.selectedKeys).toEqual(['media/a.png'])
  })

  // Click order IS collection order — the first image picked becomes the
  // featured one, so the payloads must not fall back to library order.
  it('returns payloads in selection order', async () => {
    const { result } = await openMultiple()
    act(() => result.current.toggleAsset('media/c.png'))
    act(() => result.current.toggleAsset('media/a.png'))

    expect(result.current.getInsertPayloads()).toEqual([
      { src: 'https://cdn/c.png', alt: undefined, kind: 'image' },
      { src: 'https://cdn/a.png', alt: undefined, kind: 'image' }
    ])
  })

  it("carries each asset's recorded shape into its payload", async () => {
    mockListMediaAssets.mockResolvedValue([asset('a', { width: 1600, height: 900 }), asset('b')])
    const { result } = await openMultiple()
    act(() => result.current.toggleAsset('media/a.png'))
    act(() => result.current.toggleAsset('media/b.png'))
    expect(result.current.getInsertPayloads()).toMatchObject([
      { src: 'https://cdn/a.png', width: 1600, height: 900 },
      { src: 'https://cdn/b.png', width: undefined, height: undefined }
    ])
  })

  it("carries each asset's kind through the batch, in selection order", async () => {
    mockListMediaAssets.mockResolvedValue([
      asset('a'),
      asset('demo', { key: 'media/demo', url: 'https://cdn/demo', contentType: 'video/mp4' })
    ])
    const { result } = await openMultiple()
    act(() => result.current.toggleAsset('media/demo'))
    act(() => result.current.toggleAsset('media/a.png'))
    expect(result.current.getInsertPayloads().map((p) => p.kind)).toEqual(['video', 'image'])
  })

  it("carries each asset's stored alt text", async () => {
    mockListMediaAssets.mockResolvedValue([asset('a', { alt: 'An A' }), asset('b')])
    const { result } = await openMultiple()
    act(() => result.current.toggleAsset('media/a.png'))
    act(() => result.current.toggleAsset('media/b.png'))
    expect(result.current.getInsertPayloads()).toEqual([
      { src: 'https://cdn/a.png', alt: 'An A', kind: 'image' },
      { src: 'https://cdn/b.png', alt: undefined, kind: 'image' }
    ])
  })

  // The alt field debounces its save, so the asset in state can still be
  // stale at the moment Insert is pressed — the anchor's live draft wins.
  it("prefers the anchor's in-flight alt draft over the stored value", async () => {
    const { result } = await openMultiple()
    act(() => result.current.toggleAsset('media/a.png'))
    act(() => result.current.updateAltText('Just typed'))
    expect(result.current.getInsertPayloads()[0].alt).toBe('Just typed')
  })

  it('drops a deleted image from the selection', async () => {
    mockDeleteMedia.mockResolvedValue(undefined)
    const { result } = await openMultiple()
    act(() => result.current.toggleAsset('media/a.png'))
    act(() => result.current.toggleAsset('media/b.png'))

    await act(async () => {
      await result.current.deleteSelectedAsset()
    })

    expect(mockDeleteMedia).toHaveBeenCalledWith({ key: 'media/b.png' })
    expect(result.current.selectedKeys).toEqual(['media/a.png'])
  })
})

// ---------------------------------------------------------------------------
// The upload itself: the file is measured while the bytes are in hand, then
// handed to the main process, which stores it locally and mirrors it to R2.
// ---------------------------------------------------------------------------

describe('useImageInsert upload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListMediaAssets.mockResolvedValue([])
    mockMeasureMediaFile.mockResolvedValue(null)
    mockUploadMediaFile.mockImplementation(async (file: File) => stored(file))
  })

  const upload = async (file: File) => {
    const { result } = renderHook(() => useImageInsert({ open: true }))
    await act(async () => {
      await result.current.processFiles([file])
    })
    return result
  }

  it('hands the measured shape to the upload', async () => {
    mockMeasureMediaFile.mockResolvedValue({ width: 1600, height: 900 })
    const file = fileOf('shot.png')
    await upload(file)
    expect(mockUploadMediaFile).toHaveBeenCalledWith(file, { width: 1600, height: 900 })
  })

  it('uploads a file it could not measure with no shape at all', async () => {
    const file = fileOf('odd.svg', 'image/svg+xml')
    await upload(file)
    expect(mockUploadMediaFile).toHaveBeenCalledWith(file, undefined)
  })

  it('lands in the library on the file it just stored', async () => {
    const file = fileOf('shot.png')
    mockListMediaAssets.mockResolvedValue([asset('old'), stored(file)])
    const result = await upload(file)
    expect(result.current.phase).toBe('library')
    expect(result.current.selectedKey).toBe('media/uuid-shot.png')
  })

  it('stays on the drop zone and says so when the upload fails', async () => {
    mockUploadMediaFile.mockRejectedValue(new Error('Disk full'))
    const result = await upload(fileOf('shot.png'))
    expect(result.current.phase).toBe('upload')
    expect(result.current.error).toBe('Disk full')
  })
})

describe('the still taken from a clip', () => {
  const clip = () => fileOf('demo.mp4', 'video/mp4')
  const still = () => new Blob(['still'], { type: 'image/jpeg' })

  beforeEach(() => {
    vi.clearAllMocks()
    mockListMediaAssets.mockResolvedValue([])
    mockMeasureMediaFile.mockResolvedValue(null)
    mockUploadMediaFile.mockImplementation(async (file: File) => stored(file))
    mockCapturePoster.mockResolvedValue({ blob: still(), time: 4.2 })
    mockUploadPoster.mockResolvedValue('https://cdn/posters/uuid-demo.jpg')
  })

  const drop = async (file: File) => {
    const { result } = renderHook(() => useImageInsert({ open: true }))
    await act(async () => {
      await result.current.processFiles([file])
    })
    return result
  }

  it('is taken from a clip and stored beside it', async () => {
    await drop(clip())
    expect(mockCapturePoster).toHaveBeenCalledWith(expect.any(File))
    expect(mockUploadPoster).toHaveBeenCalledWith('media/uuid-demo.mp4', expect.any(Blob))
  })

  it('is never asked of a picture, which is already its own still', async () => {
    await drop(fileOf('shot.png'))
    expect(mockCapturePoster).not.toHaveBeenCalled()
    expect(mockUploadPoster).not.toHaveBeenCalled()
  })

  it('does not cost the upload when the frame cannot be had', async () => {
    mockCapturePoster.mockResolvedValue(null)
    const result = await drop(clip())
    expect(result.current.error).toBeNull()
    expect(mockUploadPoster).not.toHaveBeenCalled()
    expect(result.current.phase).toBe('library')
  })

  it('does not cost the upload when storing the still fails', async () => {
    mockUploadPoster.mockRejectedValue(new Error('offline'))
    const result = await drop(clip())
    expect(result.current.error).toBeNull()
    expect(result.current.phase).toBe('library')
  })
})

describe('what an insert carries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockMeasureMediaFile.mockResolvedValue(null)
  })

  it("hands a clip's still on to the document", async () => {
    mockListMediaAssets.mockResolvedValue([
      asset('demo', {
        key: 'media/uuid-demo.mp4',
        url: 'https://cdn/demo.mp4',
        contentType: 'video/mp4',
        poster: 'https://cdn/posters/uuid-demo.jpg'
      })
    ])
    const { result } = renderHook(() => useImageInsert({ open: true, initialPhase: 'library' }))
    await settle()
    act(() => result.current.selectAsset('media/uuid-demo.mp4'))
    expect(result.current.getInsertPayload()?.poster).toBe('https://cdn/posters/uuid-demo.jpg')
  })

  it('carries no still for a clip that has none', async () => {
    mockListMediaAssets.mockResolvedValue([
      asset('old', { key: 'media/old.mp4', url: 'https://cdn/old.mp4', contentType: 'video/mp4' })
    ])
    const { result } = renderHook(() => useImageInsert({ open: true, initialPhase: 'library' }))
    await settle()
    act(() => result.current.selectAsset('media/old.mp4'))
    expect(result.current.getInsertPayload()?.poster).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// A drop is a BATCH — one file is just the shortest one
// ---------------------------------------------------------------------------

describe('uploading several files at once', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListMediaAssets.mockResolvedValue([])
    mockMeasureMediaFile.mockResolvedValue(null)
    mockUploadMediaFile.mockImplementation(async (file: File) => stored(file))
  })

  const dropAll = async (
    files: File[],
    options: { selectionMode?: 'single' | 'multiple'; maxSelection?: number } = {}
  ) => {
    const { result } = renderHook(() => useImageInsert({ open: true, ...options }))
    await act(async () => {
      await result.current.processFiles(files)
    })
    return result
  }

  it('uploads every file it was handed, in order', async () => {
    await dropAll([fileOf('a.png'), fileOf('b.png'), fileOf('c.png')])
    expect(mockUploadMediaFile).toHaveBeenCalledTimes(3)
    expect(mockUploadMediaFile.mock.calls.map(([file]) => (file as File).name)).toEqual([
      'a.png',
      'b.png',
      'c.png'
    ])
  })

  // Which file of the drop is on the wire — the only question worth asking
  // of a batch that is part way up.
  it('counts the files as they go', async () => {
    const landings: Array<() => void> = []
    mockUploadMediaFile.mockImplementation(
      (file: File) =>
        new Promise<MediaAsset>((resolve) => {
          landings.push(() => resolve(stored(file)))
        })
    )
    const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
    const { result } = renderHook(() => useImageInsert({ open: true }))
    let batch: Promise<void>

    await act(async () => {
      batch = result.current.processFiles([fileOf('a.png'), fileOf('b.png')])
      await flush()
    })
    expect(result.current.phase).toBe('uploading')
    expect(result.current.uploadIndex).toBe(1)
    expect(result.current.uploadTotal).toBe(2)

    await act(async () => {
      landings.shift()?.()
      await flush()
    })
    expect(result.current.uploadIndex).toBe(2)

    await act(async () => {
      landings.shift()?.()
      await batch
    })
    expect(result.current.phase).toBe('library')
  })

  // A drop is whatever the finder handed over — one bad file in it is a file
  // to skip, not a reason to refuse the other four.
  it('carries on past a file it cannot take, and names the one it skipped', async () => {
    const result = await dropAll([
      fileOf('a.png'),
      fileOf('clip.mov', 'video/quicktime'),
      fileOf('b.png')
    ])
    expect(mockUploadMediaFile).toHaveBeenCalledTimes(2)
    expect(result.current.phase).toBe('library')
    expect(result.current.error).toContain('clip.mov')
  })

  it('carries on past a file the store refused', async () => {
    mockUploadMediaFile.mockImplementation(async (file: File) => {
      if (file.name === 'b.png') throw new Error('Disk full')
      return stored(file)
    })
    const result = await dropAll([fileOf('a.png'), fileOf('b.png'), fileOf('c.png')])
    expect(result.current.phase).toBe('library')
    expect(result.current.error).toBe('b.png: Disk full')
  })

  it('still refuses a lone file the plain way', async () => {
    const result = await dropAll([fileOf('clip.mov', 'video/quicktime')])
    expect(result.current.error).toBe('Unsupported file type')
    expect(result.current.phase).toBe('upload')
    expect(mockUploadMediaFile).not.toHaveBeenCalled()
  })

  // Uploading into a batch picker adds to the batch — the whole point of
  // dropping five files on a collection is inserting five.
  it('joins the whole upload to a multiple selection, in the order dropped', async () => {
    mockListMediaAssets.mockResolvedValue([stored(fileOf('b.png')), stored(fileOf('a.png'))])
    const result = await dropAll([fileOf('a.png'), fileOf('b.png')], {
      selectionMode: 'multiple',
      maxSelection: 6
    })
    expect(result.current.selectedKeys).toEqual(['media/uuid-a.png', 'media/uuid-b.png'])
  })

  it('stops joining at the cap, and keeps what fits', async () => {
    mockListMediaAssets.mockResolvedValue([stored(fileOf('b.png')), stored(fileOf('a.png'))])
    const result = await dropAll([fileOf('a.png'), fileOf('b.png')], {
      selectionMode: 'multiple',
      maxSelection: 1
    })
    expect(result.current.selectedKeys).toEqual(['media/uuid-a.png'])
  })

  // Single-select takes the batch too: uploading five and inserting one is an
  // ordinary thing to want. The first arrival is what the panel opens on.
  it('uploads a batch into a single-select dialog and anchors on the first', async () => {
    mockListMediaAssets.mockResolvedValue([stored(fileOf('b.png')), stored(fileOf('a.png'))])
    const result = await dropAll([fileOf('a.png'), fileOf('b.png')])
    expect(mockUploadMediaFile).toHaveBeenCalledTimes(2)
    expect(result.current.selectedKey).toBe('media/uuid-a.png')
    expect(result.current.selectedKeys).toEqual([])
  })
})
