import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ImageInsertDialog } from '../image-insert-dialog'

const mockDeleteSelectedAsset = vi.fn()
const mockProcessFiles = vi.fn()
const mockUpdateFilename = vi.fn()
const mockUpdateAltText = vi.fn()
const mockSelectAsset = vi.fn()
const mockToggleAsset = vi.fn()
const mockGetInsertPayload = vi.fn()
const mockGetInsertPayloads = vi.fn()
const mockOpenLibrary = vi.fn()
const mockGoToUpload = vi.fn()

const asset = (name: string) => ({
  key: `media/${name}.png`,
  url: `https://cdn/${name}.png`,
  filename: `${name}.png`,
  contentType: 'image/png',
  size: 100
})

/**
 * A clip under a BARE key — no extension anywhere in the url. The dialog holds
 * an upload rather than a document node, so its only word on the matter is
 * `contentType`; the filename keeps its `.mp4` so the row still looks like a
 * real upload — it must not be what decides.
 */
const videoAsset = (name: string) => ({
  key: `media/8f2c-${name}`,
  url: `https://cdn/8f2c-${name}`,
  filename: `${name}.mp4`,
  contentType: 'video/mp4',
  size: 4_000
})

const documentAsset = (name: string) => ({
  key: `media/${name}.pdf`,
  url: `https://cdn/${name}.pdf`,
  filename: `${name}.pdf`,
  contentType: 'application/pdf',
  size: 9_000
})

/** Per-test overrides merged over the default hook shape. */
let hookState: Record<string, unknown> = {}
/** What the dialog asked the hook for — how the selection mode is threaded. */
let hookOptions: { selectionMode?: string; maxSelection?: number; accepts?: string } | undefined

function defaultHook() {
  return {
    phase: 'library',
    assets: [asset('a')],
    hasLibraryImages: true,
    selectedKey: 'media/a.png',
    selectedKeys: [],
    selectedAsset: asset('a'),
    altText: '',
    filenameText: 'favicon.png',
    uploadIndex: 0,
    uploadTotal: 0,
    isDragOver: false,
    setIsDragOver: vi.fn(),
    error: null,
    isBusy: false,
    processFiles: mockProcessFiles,
    openLibrary: mockOpenLibrary,
    goToUpload: mockGoToUpload,
    selectAsset: mockSelectAsset,
    toggleAsset: mockToggleAsset,
    updateAltText: mockUpdateAltText,
    updateFilename: mockUpdateFilename,
    deleteSelectedAsset: mockDeleteSelectedAsset,
    getInsertPayload: mockGetInsertPayload,
    getInsertPayloads: mockGetInsertPayloads
  }
}

vi.mock('@/hooks/use-image-insert', () => ({
  useImageInsert: (options: { selectionMode?: string }) => {
    hookOptions = options
    return { ...defaultHook(), ...hookState }
  }
}))

beforeEach(() => {
  hookState = {}
  hookOptions = undefined
  vi.clearAllMocks()
})

describe('ImageInsertDialog', () => {
  it('renders nothing while closed', () => {
    render(<ImageInsertDialog open={false} onClose={vi.fn()} onInsert={vi.fn()} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders library delete action when open', async () => {
    const user = userEvent.setup()
    render(<ImageInsertDialog open onClose={vi.fn()} onInsert={vi.fn()} />)

    expect(screen.getByRole('dialog', { name: 'Insert Media' })).toBeDefined()
    // "Media" throughout — the library holds clips as well as stills.
    await user.click(screen.getByRole('button', { name: 'Delete media' }))
    expect(mockDeleteSelectedAsset).toHaveBeenCalledOnce()
  })

  it("shows the file's own name in an editable field", async () => {
    const user = userEvent.setup()
    render(<ImageInsertDialog open onClose={vi.fn()} onInsert={vi.fn()} />)

    const field = screen.getByRole('textbox', { name: 'File name' })
    expect((field as HTMLInputElement).value).toBe('favicon.png')
    // The hook is mocked, so the controlled value stays put — what matters is
    // that the edit is reported.
    await user.type(field, 'X')
    expect(mockUpdateFilename).toHaveBeenCalledWith('favicon.pngX')
  })

  it('reports alt text as it is typed', async () => {
    const user = userEvent.setup()
    render(<ImageInsertDialog open onClose={vi.fn()} onInsert={vi.fn()} />)
    await user.type(screen.getByRole('textbox', { name: 'Alt text' }), 'A')
    expect(mockUpdateAltText).toHaveBeenCalledWith('A')
  })

  // Asserted on the ELEMENT rather than on the derivation, because a preview
  // is only correct if a clip is playable.
  it('previews a clip as a <video>, from its content type and not its url', () => {
    hookState = {
      assets: [videoAsset('demo')],
      selectedKey: 'media/8f2c-demo',
      selectedAsset: videoAsset('demo')
    }
    render(<ImageInsertDialog open onClose={vi.fn()} onInsert={vi.fn()} />)

    const clip = document.querySelector('video')
    expect(clip).not.toBeNull()
    expect(clip?.getAttribute('src')).toBe('https://cdn/8f2c-demo')
    // Both surfaces fork: the thumbnail and the preview.
    expect(document.querySelectorAll('video')).toHaveLength(2)
    expect(document.querySelector('img')).toBeNull()
  })

  it('renders change mode title and confirm label', () => {
    render(
      <ImageInsertDialog
        open
        mode="change"
        initialPhase="library"
        onClose={vi.fn()}
        onInsert={vi.fn()}
      />
    )
    expect(screen.getByRole('dialog', { name: 'Change Media' })).toBeDefined()
    expect(screen.getByRole('heading', { name: 'Change Media' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Change Media' })).toBeDefined()
  })

  it('hands the chosen file to onInsert and closes', async () => {
    const user = userEvent.setup()
    const onInsert = vi.fn()
    const onClose = vi.fn()
    mockGetInsertPayload.mockReturnValue({ src: 'https://cdn/a.png', kind: 'image' })
    render(<ImageInsertDialog open onClose={onClose} onInsert={onInsert} />)
    await user.click(screen.getByRole('button', { name: 'Insert Media' }))
    expect(onInsert).toHaveBeenCalledWith({ src: 'https://cdn/a.png', kind: 'image' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('will not close while an upload or a delete is on the wire', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    hookState = { isBusy: true }
    render(<ImageInsertDialog open onClose={onClose} onInsert={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Close dialog' }))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('offers the way back to the drop zone from the library', async () => {
    const user = userEvent.setup()
    render(<ImageInsertDialog open onClose={vi.fn()} onInsert={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Upload Media...' }))
    expect(mockGoToUpload).toHaveBeenCalledOnce()
  })
})

describe('ImageInsertDialog (documents)', () => {
  it('calls itself a document dialog and lists no thumbnails', () => {
    hookState = {
      assets: [documentAsset('cv')],
      selectedKey: 'media/cv.pdf',
      selectedAsset: documentAsset('cv')
    }
    render(<ImageInsertDialog open accepts="document" onClose={vi.fn()} onInsert={vi.fn()} />)
    expect(hookOptions?.accepts).toBe('document')
    expect(screen.getByRole('dialog', { name: 'Insert Document' })).toBeDefined()
    expect(screen.getByRole('option', { name: 'cv.pdf' })).toBeDefined()
    expect(document.querySelector('img')).toBeNull()
    expect(document.querySelector('video')).toBeNull()
    // Nothing draws a document, so there is no picture for alt text to describe.
    expect(screen.queryByRole('textbox', { name: 'Alt text' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Delete document' })).toBeDefined()
  })

  it('names the formats it takes', () => {
    hookState = { phase: 'upload' }
    render(<ImageInsertDialog open accepts="document" onClose={vi.fn()} onInsert={vi.fn()} />)
    expect(screen.getByText(/Supported formats: PDF/)).toBeDefined()
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(input.accept).toBe('application/pdf')
  })
})

describe('ImageInsertDialog (multi-select)', () => {
  function renderMultiple(maxSelection = 6) {
    const onInsert = vi.fn()
    render(
      <ImageInsertDialog
        open
        initialPhase="library"
        selectionMode="multiple"
        maxSelection={maxSelection}
        onClose={vi.fn()}
        onInsert={onInsert}
      />
    )
    return onInsert
  }

  it('asks the hook for a capped multiple selection', () => {
    renderMultiple()
    expect(hookOptions?.selectionMode).toBe('multiple')
    expect(hookOptions?.maxSelection).toBe(6)
  })

  it('titles itself for the batch', () => {
    renderMultiple()
    expect(screen.getByRole('heading', { name: 'Insert Media' })).toBeDefined()
  })

  it('replaces the selection on a plain click', async () => {
    const user = userEvent.setup()
    renderMultiple()
    await user.click(screen.getByRole('option', { name: 'a.png' }))
    expect(mockSelectAsset).toHaveBeenCalledWith('media/a.png')
    expect(mockToggleAsset).not.toHaveBeenCalled()
  })

  it('toggles one image on a shift-click', async () => {
    const user = userEvent.setup()
    renderMultiple()
    await user.keyboard('{Shift>}')
    await user.click(screen.getByRole('option', { name: 'a.png' }))
    await user.keyboard('{/Shift}')
    expect(mockToggleAsset).toHaveBeenCalledWith('media/a.png')
    expect(mockSelectAsset).not.toHaveBeenCalled()
  })

  it('paints every selected row, not just the anchor', () => {
    hookState = {
      assets: [asset('a'), asset('b'), asset('c')],
      selectedKeys: ['media/a.png', 'media/c.png'],
      selectedKey: 'media/b.png'
    }
    renderMultiple()
    const selected = screen
      .getAllByRole('option')
      .filter((el) => el.getAttribute('aria-selected') === 'true')
      .map((el) => el.textContent)
    expect(selected).toEqual(['a.png', 'c.png'])
  })

  it('counts the selection on the confirm button', () => {
    hookState = { assets: [asset('a'), asset('b')], selectedKeys: ['media/a.png', 'media/b.png'] }
    renderMultiple()
    expect(screen.getByText('2 of 6 selected')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Insert 2 Media' })).toBeDefined()
  })

  // "Media" is a mass noun, so the count rides along without inflecting.
  it('leaves the noun alone for one file', () => {
    hookState = { selectedKeys: ['media/a.png'] }
    renderMultiple()
    expect(screen.getByRole('button', { name: 'Insert 1 Media' })).toBeDefined()
  })

  it('refuses to confirm an empty selection', () => {
    renderMultiple()
    const confirm = screen.getByRole('button', { name: /^Insert \d+ Media/ })
    expect((confirm as HTMLButtonElement).disabled).toBe(true)
  })

  it('hands onInsert the batch, in selection order', async () => {
    const user = userEvent.setup()
    hookState = { selectedKeys: ['media/b.png', 'media/a.png'] }
    mockGetInsertPayloads.mockReturnValue([
      { src: 'https://cdn/b.png' },
      { src: 'https://cdn/a.png' }
    ])
    const onInsert = renderMultiple()

    await user.click(screen.getByRole('button', { name: 'Insert 2 Media' }))
    expect(onInsert).toHaveBeenCalledWith([
      { src: 'https://cdn/b.png' },
      { src: 'https://cdn/a.png' }
    ])
  })
})

// ---------------------------------------------------------------------------
// A drop is a batch — the picker and the drop zone both take several files
// ---------------------------------------------------------------------------

describe('ImageInsertDialog (uploading)', () => {
  const file = (name: string) => new File(['x'], name, { type: 'image/png' })

  const renderUploading = (state: Record<string, unknown> = {}) => {
    hookState = { phase: 'upload', ...state }
    render(<ImageInsertDialog open onClose={vi.fn()} onInsert={vi.fn()} />)
  }

  /** The drop zone — a div with a button role, named by its own hint. */
  const dropZone = () => screen.getByText(/Drag and drop/).closest('[role="button"]')!

  it('lets the file picker take more than one file', () => {
    renderUploading()
    const input = document.querySelector('input[type="file"]')
    expect((input as HTMLInputElement).multiple).toBe(true)
  })

  it('hands the whole drop to the hook, not just the first file', () => {
    renderUploading()
    fireEvent.drop(dropZone(), { dataTransfer: { files: [file('a.png'), file('b.png')] } })
    expect(mockProcessFiles).toHaveBeenCalledOnce()
    expect(mockProcessFiles.mock.calls[0][0]).toHaveLength(2)
  })

  it('hands a picked file to the hook the same way', () => {
    renderUploading()
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file('a.png')] } })
    expect(mockProcessFiles).toHaveBeenCalledOnce()
  })

  it('says which file of the batch is on the wire', () => {
    renderUploading({ phase: 'uploading', uploadIndex: 2, uploadTotal: 3 })
    expect(screen.getByText('Uploading 2 of 3')).toBeDefined()
  })

  // One file is the shortest batch, and counting it would be noise.
  it('counts nothing when there is only one file', () => {
    renderUploading({ phase: 'uploading', uploadIndex: 1, uploadTotal: 1 })
    expect(screen.queryByText(/Uploading 1 of/)).toBeNull()
    expect(screen.getByRole('status')).toBeDefined()
  })

  it('shows the refusal where the file was dropped', () => {
    renderUploading({ error: 'Unsupported file type' })
    expect(screen.getByText('Unsupported file type')).toBeDefined()
  })

  it('offers the library only when there is something in it', () => {
    renderUploading({ hasLibraryImages: false })
    expect(screen.queryByRole('button', { name: 'Insert from Library...' })).toBeNull()
  })

  it('opens the library from the drop zone', async () => {
    const user = userEvent.setup()
    renderUploading()
    await user.click(screen.getByRole('button', { name: 'Insert from Library...' }))
    expect(mockOpenLibrary).toHaveBeenCalledOnce()
  })
})
