import { useLayoutEffect, useRef } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { OptionList } from '@/components/ui/input/option-list'
import { Media } from '@/components/media'
import {
  useImageInsert,
  type ImageInsertAccepts,
  type ImageInsertPayload,
  type ImageInsertPhase
} from '@/hooks/use-image-insert'
import {
  ALLOWED_DOCUMENT_CONTENT_TYPES,
  ALLOWED_MEDIA_CONTENT_TYPES,
  mediaKindOf
} from '@shared/domain/media'
import { formatFileSize, formatMediaType } from '@/utils/format-file-size'
import CloseIcon from '@/assets/icons/cross.svg'
import PageIcon from '@/assets/icons/page.svg'
import TrashIcon from '@/assets/icons/trash.svg'
import UploadIcon from '@/assets/icons/upload.svg'

// ---------------------------------------------------------------------------
// ImageInsertDialog — the drop zone and the library, in one modal.
//
// This is the one surface that shows media it holds as an ASSET rather than
// as a document node, so there is no `kind` field to read — and it needs
// none, because the content type it does have is where a node's `kind` comes
// from in the first place (`mediaKindOf`).
// ---------------------------------------------------------------------------

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ')

// --- The library: two columns between the header and the footer ------------

const libraryBodyStyle = 'flex flex-auto items-stretch w-full min-h-0'

// The frame around the listbox: width, divider and inset. The listbox owns
// the scrolling.
const sidebarStyle =
  'w-(--size-library-sidebar) shrink-0 self-stretch flex flex-col min-h-0 overflow-hidden py-2 px-1 border-r-[0.5px] border-solid border-divider'

// The sidebar owns the frame, so the list's own popover framing — its inset
// and its 7-row cap — is taken off and the list fills the column.
const libraryListStyle = 'flex-auto min-h-0 max-h-none! p-0!'

const thumbnailStyle = cx(
  'relative shrink-0 size-8 rounded-xs border-[0.5px] border-solid border-divider overflow-hidden',
  'flex items-center justify-center [&>svg]:size-5 [&>svg]:text-fg-body/50',
  '[&_:is(img,video)]:absolute [&_:is(img,video)]:inset-0 [&_:is(img,video)]:size-full [&_:is(img,video)]:object-cover [&_:is(img,video)]:block'
)

const libraryFilenameStyle = 'flex-auto min-w-0 overflow-hidden text-ellipsis whitespace-nowrap'

const previewPaneStyle =
  'flex-auto self-stretch flex flex-col items-center gap-0.5 py-2 px-2 min-w-0 min-h-0 overflow-y-auto'

// HEIGHT is the only fixed dimension: the width hugs the file's own shape, so
// the metadata rows below hold their position as you switch files.
const previewStyle = cx(
  'h-(--size-image-preview-max) w-auto max-w-full shrink-0 m-0 flex items-center justify-center',
  '[&_:is(img,video)]:h-full [&_:is(img,video)]:w-auto [&_:is(img,video)]:max-w-full [&_:is(img,video)]:object-contain [&_:is(img,video)]:block [&_:is(img,video)]:rounded-sm [&_:is(img,video)]:outline-none'
)

const metadataRowStyle =
  'flex items-center gap-4 w-full max-w-(--size-image-preview-max) min-w-0 text-style-caption'

// The filename reads as plain text until you click it — a bare input with
// the chrome stripped, like the alt field it sits above.
const filenameFieldStyle =
  'flex-auto min-w-0 bg-transparent border-none p-0 [font:inherit] text-fg-body text-ellipsis whitespace-nowrap placeholder:text-fg-body/50'

const fileMetaStyle =
  'shrink-0 w-[120px] text-right text-fg-body/50 tabular-nums overflow-hidden text-ellipsis whitespace-nowrap'

const altRowStyle = 'block w-full max-w-(--size-image-preview-max) min-w-0 self-center'

const altFieldStyle =
  'w-full min-w-0 bg-transparent border-none p-0 text-style-caption text-fg-body leading-5 resize-none overflow-hidden whitespace-pre-wrap break-words placeholder:text-fg-body/50'

const deleteRowStyle =
  'flex justify-center w-full max-w-(--size-image-preview-max) min-w-0 self-center'

const selectionCountStyle = 'text-style-caption text-fg-body/50 m-0 tabular-nums'

const errorStyle = 'text-style-caption text-brand-pink dark:text-brand-orange text-center'

/** A document's stand-in: nothing draws a PDF, and the name below answers which file it is. */
const documentGlyphStyle = 'size-10 text-fg-body/50'

// --- The drop zone -----------------------------------------------------------

const uploadSlotStyle = 'flex flex-col items-center justify-center flex-1 w-full min-h-0'

const uploadBodyStyle = cx(
  'flex flex-col items-center justify-center gap-0.5 w-(--size-image-preview-max) h-40 shrink-0 cursor-pointer text-center',
  'data-[drag-over]:bg-item-hover data-[drag-over]:rounded-sm',
  'aria-disabled:cursor-default'
)

const illustrationStyle = 'size-10 shrink-0 text-fg-body/50 [&>svg]:size-full'

const hintStyle = 'text-style-body-sm text-fg-body text-pretty leading-6 m-0'

const formatsStyle = 'text-style-caption text-fg-body/50 leading-5 m-0'

// No byte count comes back from the main process, so the bar sweeps rather
// than fills: a shimmer across the divider in the brand hue.
const progressStyle =
  'w-full max-w-(--size-image-preview-max) h-0.5 rounded-xs bg-[linear-gradient(90deg,var(--border-divider),var(--color-brand-pink),var(--border-divider))] dark:bg-[linear-gradient(90deg,var(--border-divider),var(--color-brand-orange),var(--border-divider))] bg-[length:200%_100%] animate-shimmer'

// Built from the allow-lists rather than restated, so the file picker cannot
// drift from what `processFiles` and the main process will actually take.
const ACCEPT = {
  media: ALLOWED_MEDIA_CONTENT_TYPES.join(','),
  document: ALLOWED_DOCUMENT_CONTENT_TYPES.join(',')
} as const

/** The same lists as `ACCEPT`, for the hint under the drop zone. */
const FORMAT_NAMES = {
  media: 'PNG, SVG, WEBP, JPG, GIF, MP4',
  document: 'PDF'
} as const

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export type ImageDialogMode = 'insert' | 'change'

interface ImageInsertDialogBaseProps {
  open: boolean
  mode?: ImageDialogMode
  initialPhase?: ImageInsertPhase
  /**
   * Which half of the bucket this is opening — pictures and clips by default,
   * or documents. Decides what the library lists, what the drop zone takes
   * and what the dialog calls itself.
   */
  accepts?: ImageInsertAccepts
  onClose: () => void
}

/**
 * Single- and multi-select are one dialog but two contracts: the payload
 * shape follows the selection mode, so a mismatched `onInsert` is a type
 * error rather than a runtime surprise.
 */
export type ImageInsertDialogProps = ImageInsertDialogBaseProps &
  (
    | {
        selectionMode?: 'single'
        maxSelection?: never
        onInsert: (payload: ImageInsertPayload) => void
      }
    | {
        selectionMode: 'multiple'
        /** How many more images the target will take. */
        maxSelection?: number
        onInsert: (payloads: ImageInsertPayload[]) => void
      }
  )

export function ImageInsertDialog(props: ImageInsertDialogProps) {
  const {
    open,
    mode = 'insert',
    initialPhase = 'upload',
    accepts = 'media',
    onClose,
    selectionMode = 'single'
  } = props
  const isMultiple = selectionMode === 'multiple'
  const isDocument = accepts === 'document'
  const maxSelection = (isMultiple ? props.maxSelection : undefined) ?? 6

  const fileInputRef = useRef<HTMLInputElement>(null)
  const altFieldRef = useRef<HTMLTextAreaElement>(null)

  const {
    phase,
    assets,
    hasLibraryImages,
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
    getInsertPayloads
  } = useImageInsert({
    open,
    initialPhase,
    selectionMode,
    accepts,
    ...(isMultiple ? { maxSelection } : {})
  })

  const selectedCount = selectedKeys.length
  // "Media" is the dialog's noun throughout — the library holds clips as well
  // as stills, and it is a mass noun, so the batch count rides along without
  // inflecting. A document dialog says "Document" for the same reason it
  // lists nothing but documents.
  const noun = isDocument ? 'Document' : 'Media'
  const title = `${mode === 'change' ? 'Change' : 'Insert'} ${noun}`
  const confirmLabel = isMultiple ? `Insert ${selectedCount} ${noun}` : title

  // The alt field grows to its text: one line to start, more as it wraps.
  useLayoutEffect(() => {
    const field = altFieldRef.current
    if (!field) return
    field.style.height = 'auto'
    field.style.height = `${field.scrollHeight}px`
  }, [altText, selectedKey])

  function handleClose() {
    if (isBusy) return
    onClose()
  }

  function handleInsert() {
    if (props.selectionMode === 'multiple') {
      const payloads = getInsertPayloads()
      if (payloads.length === 0) return
      props.onInsert(payloads)
    } else {
      const payload = getInsertPayload()
      if (!payload) return
      props.onInsert(payload)
    }
    onClose()
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length > 0) void processFiles(files)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragOver(false)
    if (isBusy || phase === 'library') return
    const files = Array.from(e.dataTransfer.files ?? [])
    if (files.length > 0) void processFiles(files)
  }

  return (
    <Dialog open={open} onClose={handleClose} size="md" align="center" justify="center">
      <Dialog.Header>
        <Dialog.Title>{title}</Dialog.Title>
        <Button
          type="button"
          variant="icon"
          aria-label="Close dialog"
          disabled={isBusy}
          onClick={handleClose}
        >
          <CloseIcon />
        </Button>
      </Dialog.Header>

      {phase === 'library' ? (
        <div className={libraryBodyStyle}>
          <div className={sidebarStyle}>
            <OptionList
              value={selectedKey}
              selectedValues={isMultiple ? selectedKeys : undefined}
              // A plain click means "just this one"; a modified click adds or
              // drops a single image. Shift, and ⌘/Ctrl — the same gesture
              // on every desktop file list.
              onValueChange={(key, event) => {
                const modified = !!event && (event.shiftKey || event.metaKey || event.ctrlKey)
                if (isMultiple && modified) toggleAsset(key)
                else selectAsset(key)
              }}
              tone="plain"
            >
              <OptionList.Listbox className={libraryListStyle} aria-label={`${noun} library`}>
                {assets.map((asset) => (
                  // `label` carries the accessible text, since the children
                  // are rich (thumbnail + filename) rather than a string.
                  <OptionList.Option
                    key={asset.key}
                    value={asset.key}
                    label={asset.filename}
                    disabled={isBusy}
                  >
                    <span className={thumbnailStyle}>
                      {/* The row's own `label` is the accessible name, so the
                          thumbnail is decorative either way. */}
                      {isDocument ? (
                        <PageIcon aria-hidden />
                      ) : (
                        <Media
                          src={asset.url}
                          kind={mediaKindOf(asset.contentType)}
                          alt=""
                          poster={asset.poster}
                          width={asset.width}
                          height={asset.height}
                        />
                      )}
                    </span>
                    <span className={libraryFilenameStyle}>{asset.filename}</span>
                  </OptionList.Option>
                ))}
              </OptionList.Listbox>
            </OptionList>
          </div>

          <div className={previewPaneStyle}>
            {selectedAsset && (
              <>
                {/* The pane below edits ONE file — the anchor. This line is
                    what keeps that honest when the batch is larger than what
                    is on screen. */}
                {isMultiple && (
                  <p className={selectionCountStyle} aria-live="polite">
                    {selectedCount} of {maxSelection} selected
                  </p>
                )}
                <figure className={previewStyle}>
                  {/* Controls here and not on the thumbnail: this pane is
                      where you check what you are about to insert, and for a
                      clip that means being able to scrub it. */}
                  {isDocument ? (
                    <PageIcon aria-hidden className={documentGlyphStyle} />
                  ) : (
                    <Media
                      src={selectedAsset.url}
                      kind={mediaKindOf(selectedAsset.contentType)}
                      alt={altText || selectedAsset.filename}
                      controls
                      poster={selectedAsset.poster}
                      width={selectedAsset.width}
                      height={selectedAsset.height}
                    />
                  )}
                </figure>
                <div className={metadataRowStyle}>
                  {/* Click the name to rename it — display only; the object
                      key (and any URL already in a note) is untouched. */}
                  <input
                    type="text"
                    className={filenameFieldStyle}
                    value={filenameText}
                    aria-label="File name"
                    placeholder="File name"
                    disabled={isBusy}
                    onChange={(e) => updateFilename(e.target.value)}
                  />
                  <span className={fileMetaStyle}>
                    {formatMediaType(selectedAsset.contentType)} -{' '}
                    {formatFileSize(selectedAsset.size)}
                  </span>
                </div>
                {/* Nothing draws a document, so there is no picture for a
                    description to stand in for. */}
                {!isDocument && (
                  <label className={altRowStyle}>
                    <span className="sr-only">Alt text</span>
                    <textarea
                      ref={altFieldRef}
                      className={altFieldStyle}
                      value={altText}
                      placeholder="Add alt text..."
                      rows={1}
                      disabled={isBusy}
                      onChange={(e) => updateAltText(e.target.value)}
                    />
                  </label>
                )}
                <div className={deleteRowStyle}>
                  <Button
                    type="button"
                    variant="icon"
                    aria-label={`Delete ${noun.toLowerCase()}`}
                    disabled={isBusy}
                    onClick={() => void deleteSelectedAsset()}
                  >
                    <TrashIcon />
                  </Button>
                </div>
                {error && <p className={errorStyle}>{error}</p>}
              </>
            )}
          </div>
        </div>
      ) : (
        <div className={uploadSlotStyle}>
          <div
            className={uploadBodyStyle}
            data-drag-over={isDragOver ? '' : undefined}
            onDragOver={(e) => {
              e.preventDefault()
              if (!isBusy) setIsDragOver(true)
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => !isBusy && fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                if (!isBusy) fileInputRef.current?.click()
              }
            }}
            role="button"
            tabIndex={isBusy ? -1 : 0}
            aria-disabled={isBusy}
          >
            <span className={illustrationStyle} aria-hidden>
              <UploadIcon />
            </span>

            {phase === 'uploading' ? (
              <>
                <div className={progressStyle} aria-hidden />
                {/* One status line: which file of the batch is on the wire,
                    or just that one is — counting a lone file would be noise. */}
                <p className={formatsStyle} role="status" aria-live="polite">
                  {uploadTotal > 1
                    ? `Uploading ${uploadIndex} of ${uploadTotal}`
                    : `Uploading ${noun.toLowerCase()}…`}
                </p>
              </>
            ) : error ? (
              <p className={errorStyle}>{error}</p>
            ) : (
              <>
                <div className={hintStyle}>
                  Drag and drop or{' '}
                  <Button
                    type="button"
                    variant="link"
                    onClick={(e) => {
                      e.stopPropagation()
                      fileInputRef.current?.click()
                    }}
                  >
                    browse to upload
                  </Button>{' '}
                  one or more files
                </div>
                <p className={formatsStyle}>Supported formats: {FORMAT_NAMES[accepts]}</p>
              </>
            )}
          </div>
        </div>
      )}

      <Dialog.Footer>
        <Dialog.FooterGroup>
          <Button
            type="button"
            size="sm"
            emphasis="tertiary"
            disabled={isBusy}
            onClick={handleClose}
          >
            Cancel
          </Button>
          {phase === 'library' ? (
            <Button type="button" size="sm" disabled={isBusy} onClick={goToUpload}>
              Upload {noun}...
            </Button>
          ) : (
            // Absent rather than disabled while there is nothing to pick from.
            hasLibraryImages && (
              <Button type="button" size="sm" disabled={isBusy} onClick={() => void openLibrary()}>
                Insert from Library...
              </Button>
            )
          )}
        </Dialog.FooterGroup>
        <Button
          type="button"
          size="sm"
          disabled={
            isBusy || phase !== 'library' || (isMultiple ? selectedCount === 0 : !selectedKey)
          }
          onClick={handleInsert}
        >
          {confirmLabel}
        </Button>
      </Dialog.Footer>

      <input
        ref={fileInputRef}
        type="file"
        // A library is a place files LIVE, not a queue of exactly what this
        // block needs — uploading five and inserting one of them is
        // ordinary, so the batch is allowed even where the selection is
        // single.
        multiple
        accept={ACCEPT[accepts]}
        className="hidden"
        onChange={handleFileInputChange}
        tabIndex={-1}
        aria-hidden
      />
    </Dialog>
  )
}
