// ---------------------------------------------------------------------------
// The class strings a note's picture is drawn in: kartik.to's Panda recipes
// and `css()` calls as Tailwind utilities.
// ---------------------------------------------------------------------------

/**
 * ContentEditable mechanics only. An empty line keeps its natural height so it
 * stays clickable; caret room is reserved only on focus.
 */
const editableBaseStyle =
  'outline-none focus-visible:outline-none min-h-0 whitespace-pre-wrap break-words focus:min-h-[1.5em] editor-placeholder'

/** The showcase figure: full width, a centred column, caption at the text measure. */
export const editorShowcaseStyle =
  'w-full flex flex-col gap-2 items-center [&>figcaption]:max-w-(--size-article-content) [&>figcaption]:text-center'

const editorShowcaseMediaStyle =
  'self-stretch w-full outline-none focus-visible:outline-none cursor-default'

/** The boxes a standalone media block is composed of — see kartik.to's `mediaBlock` slots. */
export const mediaBlockStyles = {
  /** The box that does NOT clip, so the control rail can straddle the top edge. */
  root: 'relative grid self-stretch w-full',
  /** The positioned box the picture sits in. */
  frame: 'relative flex w-full min-w-0 rounded-xl',
  image: 'w-full block object-cover border border-solid border-border-divider relative z-[1]'
}

export const editorImgStyle = `${mediaBlockStyles.image} ${editorShowcaseMediaStyle}`

export const editorCaptionStyle = `${editableBaseStyle} min-h-[1.5em] text-style-caption text-ink-body text-center [text-wrap:balance] w-full`
