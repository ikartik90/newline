import type { HTMLAttributes, ReactNode, Ref } from 'react'
import { OptionList } from '@/components/ui/input/option-list'
import { PROPERTIES_TRIGGER_ATTR } from '@/components/ui/properties-panel'
import { Media, type MediaProps } from '@/components/media'
import type { MediaNode } from '@shared/domain/nodes'
import FeatureIcon from '@/assets/icons/feature.svg'
import PropertiesIcon from '@/assets/icons/slider.svg'
import ReplaceIcon from '@/assets/icons/replace.svg'
import TrashIcon from '@/assets/icons/trash.svg'

// ---------------------------------------------------------------------------
// MediaObject — one picture or clip on the editor's canvas, wherever it
// stands. A gallery slot and a standalone media block are the SAME object in
// two positions, drawn once; what differs is handed in rather than branched
// on: `classes` (the boxes), `frameProps` / `mediaProps` (the surface's own
// contract) and `onFeature` (absent for a block, which has no other slot to
// move in front of).
//
// The rail is a SIBLING of the frame, not a child of it: it is centred on the
// frame's top edge with half of it hanging above, and a frame that clips
// would slice it in half. Both surfaces give it a `root` that does not clip.
// ---------------------------------------------------------------------------

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ')

/** The three boxes this object is composed of; see the `mediaBlock` recipe. */
export interface MediaObjectClasses {
  /** The box that does NOT clip, so the rail can straddle the frame's edge. */
  root: string
  /** The positioned box the media sits in. */
  frame: string
  image: string
}

export interface MediaObjectProps {
  item: MediaNode
  classes: MediaObjectClasses
  /** What the rail calls this object — "Image 1" in a grid, "Image" alone. */
  label: string
  /** Whether this object holds the featured position. Only consulted with `onFeature`. */
  featured?: boolean
  /**
   * Absent is what withholds the control, rather than a boolean disabling it:
   * featuring is a move-to-front, and a block standing on its own has no move
   * to make.
   */
  onFeature?: () => void
  /**
   * Whether THIS object's properties panel is the one currently open — the
   * PANEL's state, not the object's.
   */
  propertiesOpen: boolean
  onToggleProperties: () => void
  onReplace: () => void
  onRemove: () => void
  /**
   * What the trash means here. A slot is EMPTIED and the block goes on; a
   * standalone block is deleted outright — so the surface names it.
   */
  removeLabel?: string
  /** Whether the picture is see-through — paints the checkerboard behind it. */
  checkered?: boolean
  /** The surface's own hooks and gestures, spread onto the frame. */
  frameProps?: HTMLAttributes<HTMLDivElement> & {
    ref?: Ref<HTMLDivElement>
    /** The state hooks a surface's own styling keys on. */
    [state: `data-${string}`]: unknown
  }
  /**
   * The surface's own contract on the media ELEMENT — the editor block's tab
   * stop and caret keys. On the element because that is where `Media`
   * documents it belonging, and what `[data-showcase-media]` finds.
   */
  mediaProps?: Partial<
    Pick<
      MediaProps,
      | 'tabIndex'
      | 'onFocus'
      | 'onBlur'
      | 'onKeyDown'
      | 'data-showcase-media'
      | 'elementRef'
      | 'autoPlay'
      | 'draggable'
      | 'loading'
    >
  >
  /**
   * What stands in the frame while the object has no source yet — an `<img>`
   * with no `src` is a broken picture, not a placeholder.
   */
  placeholder?: ReactNode
}

/** What a media object is called where it needs a name: its alt, else its caption. */
function mediaAlt(item: MediaNode): string {
  return item.alt ?? item.caption ?? ''
}

export function MediaObject({
  item,
  classes,
  label,
  featured = false,
  onFeature,
  propertiesOpen,
  onToggleProperties,
  onReplace,
  onRemove,
  removeLabel = 'Remove image',
  checkered = false,
  frameProps,
  mediaProps,
  placeholder
}: MediaObjectProps) {
  return (
    // `group/cell` is what the rail's reveal keys on: the root holds both the
    // frame and the rail's overhang, so "the cell is under the pointer or
    // holds focus" is one rule rather than a sibling combinator per case.
    <div className={cx(classes.root, 'group/cell')}>
      <div
        className={classes.frame}
        // The ONE hook both surfaces share, stamped here so they say it the
        // same way.
        data-media-cell=""
        {...frameProps}
      >
        {item.src ? (
          <Media
            src={item.src}
            // The object's own word about what it is — never re-derived.
            kind={item.kind}
            alt={mediaAlt(item)}
            className={classes.image}
            // Fit, inset and corner are per-object DATA, applied here for the
            // reason the reader applies them: the panel is a live editor with
            // no apply step.
            layout={item}
            // The same reservation the reader makes while the picture is
            // still coming.
            width={item.width}
            height={item.height}
            poster={item.kind === 'video' ? item.poster : undefined}
            data-checkered={checkered ? '' : undefined}
            {...mediaProps}
          />
        ) : (
          placeholder
        )}
      </div>
      <MediaToolbar
        label={label}
        featured={featured}
        onFeature={onFeature}
        propertiesOpen={propertiesOpen}
        onToggleProperties={onToggleProperties}
        onReplace={onReplace}
        onRemove={onRemove}
        removeLabel={removeLabel}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// The rail
// ---------------------------------------------------------------------------

// The shared `toolbar` recipe (md, on the surface, hugging its buttons) plus
// what floating costs — position, hairline, elevation, clip — and a
// cell-relative width cap. Centred on the cell's TOP EDGE, half above it.
// Down until the cell is reached for: inert as well as invisible, so a
// control you cannot see is not a control you can hit.
const railStyle = cx(
  'flex items-center gap-1 h-10 px-[6px] rounded-md w-max bg-surface [--field-bg:var(--field-bg-on-surface)]',
  'absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[3]',
  'border-[0.5px] border-solid border-divider shadow-[0_4px_16px_color-mix(in_srgb,var(--color-neutral-900)_12%,transparent)]',
  'overflow-hidden max-w-[calc(100%-24px)]',
  'opacity-0 pointer-events-none transition-opacity duration-150',
  'group-hover/cell:opacity-100 group-hover/cell:pointer-events-auto',
  'group-focus-within/cell:opacity-100 group-focus-within/cell:pointer-events-auto'
)

interface MediaToolbarProps {
  label: string
  featured: boolean
  onFeature?: () => void
  propertiesOpen: boolean
  onToggleProperties: () => void
  onReplace: () => void
  onRemove: () => void
  removeLabel: string
}

function MediaToolbar({
  label,
  featured,
  onFeature,
  propertiesOpen,
  onToggleProperties,
  onReplace,
  onRemove,
  removeLabel
}: MediaToolbarProps) {
  return (
    <div className={railStyle}>
      <OptionList direction="inline">
        <OptionList.Toolbar aria-label={`${label} actions`}>
          {/* Featured is a POSITION, so the first slot's button is simply
              already on. Pressed rather than disabled: a disabled button
              dims, which would fight the brand chip that is the signal. */}
          {onFeature && (
            <>
              <OptionList.Option
                aria-label="Feature image"
                pressed={featured}
                onClick={() => {
                  if (!featured) onFeature()
                }}
              >
                <FeatureIcon aria-hidden />
              </OptionList.Option>
              <OptionList.Divider />
            </>
          )}
          {/* ONE button for everything about the media that isn't an action
              on the media. Pressed while its own panel is OPEN, and marked as
              the panel's trigger so a second press actually closes it. */}
          <OptionList.Option
            {...PROPERTIES_TRIGGER_ATTR}
            aria-label="Image properties"
            pressed={propertiesOpen}
            onClick={onToggleProperties}
          >
            <PropertiesIcon aria-hidden />
          </OptionList.Option>
          <OptionList.Option aria-label="Replace image" onClick={onReplace}>
            <ReplaceIcon aria-hidden />
          </OptionList.Option>
          <OptionList.Option aria-label={removeLabel} onClick={onRemove}>
            <TrashIcon aria-hidden />
          </OptionList.Option>
        </OptionList.Toolbar>
      </OptionList>
    </div>
  )
}
