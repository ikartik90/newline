import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import type { MediaKind } from '@shared/domain/nodes'
import { cx, Field, whenFieldActive } from './field'
import MediaIcon from '@/assets/icons/media.svg'
import PageIcon from '@/assets/icons/page.svg'
import ReplaceIcon from '@/assets/icons/replace.svg'

// ---------------------------------------------------------------------------
// ImageInput — the file archetype of the field family, composed INTO a <Field>
// exactly like Slider:
//
//   <PropertiesPanel.Control label="Image">
//     <ImageInput noun="picture" src={coverUrl} onPick={openLibrary} />
//   </PropertiesPanel.Control>
//
// A 16px cell holds the file, a hairline divides it, and the file's name
// stands beside it. Every picture slot in every rail is this control, so a
// card's cover and a testimonial's portrait are edited in the same row.
//
// It owns no library and no dialog — `onPick` is the whole of its outward
// contract. WHICH library opens is the caller's to decide, because it is the
// caller that holds the slot.
//
// Two targets for one act: the field itself, which is the big and obvious one,
// and the replace button beside it, which says out loud what pressing does. An
// empty slot has nothing to replace, so it stands alone and asks instead.
// There is no clear: emptying a slot is the SECTION's job.
// ---------------------------------------------------------------------------

/** The `<uuid>-` a stored file's key is stamped with (`media/<uuid>-<name>`). */
const MEDIA_KEY_UUID_PREFIX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i

/**
 * The name a stored file was uploaded under, read off the URL the document
 * holds — a public R2 URL or a `local://` one, both of which end in the same
 * stamped key.
 */
export function filenameFromMediaUrl(url: string): string {
  const path = url.split(/[?#]/)[0]
  const segment = path.split('/').pop() ?? ''
  return decodeURIComponent(segment).replace(MEDIA_KEY_UUID_PREFIX, '')
}

export interface ImageInputProps {
  /**
   * The file in the slot, as the URL the document stores — `undefined` for an
   * empty one. The name written in the field is read off it.
   */
  src?: string
  /**
   * Which element draws it. `"document"` draws nothing at all — there is no
   * element that renders a PDF, and the glyph stands in for it. Taken rather
   * than guessed from the src: a library key is not obliged to carry an
   * extension, and every caller holds a node that states its kind.
   */
  kind?: MediaKind | 'document'
  /** A clip's still, so a slot holding a clip shows a frame rather than black. */
  poster?: string
  /**
   * What the slot holds, for the controls' labels — "picture", "document",
   * "dark media". A button is not labelable by the row's `<label>`, so this is
   * the only thing that names either control: "Change picture", "Add document".
   */
  noun: string
  /** Open the library. The same act on both controls. */
  onPick: () => void
  disabled?: boolean
  /** Applied to the row, so a caller can size the control in its rail. */
  className?: string
}

export function ImageInput({
  src,
  kind = 'image',
  poster,
  noun,
  onPick,
  disabled = false,
  className
}: ImageInputProps) {
  const filename = src ? filenameFromMediaUrl(src) : undefined

  return (
    // Field, then the replace button, at the frame's own gap. A GRID rather
    // than a flex row, because the button's column is held whether or not
    // there is a button in it: every control in the rail is one width.
    <div
      className={cx(
        'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 w-full min-w-0',
        className
      )}
    >
      <Field.Frame className="flex-auto min-w-0 cursor-pointer">
        <button
          type="button"
          // The field lights up while it is engaged, like every other control
          // in the family — the frame keys that off any `[data-control]` in
          // focus, and this button is the control.
          data-control
          aria-label={`${filename ? 'Change' : 'Add'} ${noun}`}
          disabled={disabled}
          className={cx(
            'appearance-none m-0 p-0 border-0 bg-transparent text-inherit cursor-pointer',
            'flex items-center self-stretch gap-2 flex-auto min-w-0 text-start',
            'disabled:cursor-not-allowed'
          )}
          onClick={onPick}
        >
          {/* The 16px cell, holding a picture instead of a colour. The hairline
              is there because a pale screenshot on a pale field would otherwise
              have no edge at all. */}
          <span
            className={cx(
              'relative shrink-0 flex items-center justify-center size-4 rounded-sm overflow-hidden',
              'bg-field shadow-[inset_0_0_0_0.5px_var(--field-border)]',
              '[&>svg]:size-3 [&>svg]:text-field-fg-muted'
            )}
          >
            {thumbnailFor(src, kind, poster)}
          </span>
          <span
            className={cx(
              'self-stretch shrink-0 w-[0.5px] bg-field-border transition-colors duration-150',
              whenFieldActive('bg-field-border-active')
            )}
            aria-hidden
          />
          {/* One line, ellipsised: a library name is as long as it is. An empty
              slot ASKS, in the muted tone a placeholder is written in. */}
          <span
            className="flex-auto min-w-0 overflow-hidden text-ellipsis whitespace-nowrap data-[empty]:text-field-fg-muted"
            data-empty={filename ? undefined : ''}
          >
            {filename ?? `Add ${noun}`}
          </span>
        </button>
      </Field.Frame>

      {/* Nothing to replace in an empty slot — the field is asking already. Its
          column is still held, so a filled slot and an empty one in the same
          section are the same width. */}
      {filename ? (
        <Button
          type="button"
          size="sm"
          variant="icon"
          emphasis="tertiary"
          aria-label={`Replace ${noun}`}
          disabled={disabled}
          onClick={onPick}
        >
          <ReplaceIcon aria-hidden />
        </Button>
      ) : (
        <span className="size-7" aria-hidden />
      )}
    </div>
  )
}

/**
 * What the 16px cell draws: the file, or the glyph that stands in for one.
 * Decorative in every branch — the name beside it is what says which file
 * this is, so a described thumbnail would be the same fact twice.
 */
function thumbnailFor(
  src: string | undefined,
  kind: MediaKind | 'document',
  poster: string | undefined
): ReactNode {
  // The glyph follows the KIND, not the emptiness: an empty document slot is
  // still a document slot, and offering it a picture glyph would describe the
  // library it does not open.
  if (!src || kind === 'document') {
    return kind === 'document' ? <PageIcon aria-hidden /> : <MediaIcon aria-hidden />
  }
  const media = 'block size-full object-cover'
  if (kind === 'video') {
    return (
      <video src={src} poster={poster} muted playsInline preload="metadata" className={media} />
    )
  }
  return <img src={src} alt="" loading="lazy" className={media} />
}
