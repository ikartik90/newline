import { OptionList } from '@/components/ui/input/option-list'
import { Media } from '@/components/media'
import type { MediaNode } from '@shared/domain/media-node'
import ReplaceIcon from '@/assets/icons/replace.svg'
import TrashIcon from '@/assets/icons/trash.svg'

// ---------------------------------------------------------------------------
// MediaObject — one picture or clip of a note, under its rail.
//
// The rail is a SIBLING of the frame, not a child of it: it is centred on the
// frame's top edge with half of it hanging above, and a frame that clips
// would slice it in half. So the `root` it is given does not clip.
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
  /** What the rail calls this object. */
  label: string
  onReplace: () => void
  onRemove: () => void
  /** What the trash means here, named by the surface. */
  removeLabel?: string
}

/** What a media object is called where it needs a name: its alt, else its caption. */
function mediaAlt(item: MediaNode): string {
  return item.alt ?? item.caption ?? ''
}

export function MediaObject({
  item,
  classes,
  label,
  onReplace,
  onRemove,
  removeLabel = 'Remove image'
}: MediaObjectProps) {
  return (
    // `group/cell` is what the rail's reveal keys on: the root holds both the
    // frame and the rail's overhang.
    <div className={cx(classes.root, 'group/cell')}>
      <div className={classes.frame} data-media-cell="">
        {item.src && (
          <Media
            src={item.src}
            kind={item.kind}
            alt={mediaAlt(item)}
            className={classes.image}
            width={item.width}
            height={item.height}
            poster={item.kind === 'video' ? item.poster : undefined}
            // Held, not played: a note is for writing in.
            autoPlay={false}
          />
        )}
      </div>
      <MediaToolbar
        label={label}
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
export const mediaObjectRailStyle = cx(
  'flex items-center gap-1 h-10 px-[6px] rounded-lg w-max bg-bg-sheet bg-level-1',
  'absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[3]',
  'border border-solid border-border-divider shadow-[0_4px_16px_var(--shadow-sheet)]',
  'overflow-hidden max-w-[calc(100%-24px)]',
  'opacity-0 pointer-events-none transition-opacity duration-150',
  'group-hover/cell:opacity-100 group-hover/cell:pointer-events-auto',
  'group-focus-within/cell:opacity-100 group-focus-within/cell:pointer-events-auto'
)

interface MediaToolbarProps {
  label: string
  onReplace: () => void
  onRemove: () => void
  removeLabel: string
}

function MediaToolbar({ label, onReplace, onRemove, removeLabel }: MediaToolbarProps) {
  return (
    <div className={mediaObjectRailStyle}>
      <OptionList direction="inline">
        <OptionList.Toolbar aria-label={`${label} actions`}>
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
