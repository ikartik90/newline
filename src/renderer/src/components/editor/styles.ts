// ---------------------------------------------------------------------------
// The editor's class strings — kartik.to's Panda recipes and `css()` calls as
// Tailwind utilities. Named once here so the block file reads as structure.
// ---------------------------------------------------------------------------

/**
 * ContentEditable mechanics only; typography comes from `typographyStyles`.
 * Empty blocks keep their natural single-line height so they stay clickable;
 * only reserve caret room on focus.
 */
export const editableBaseStyle =
  'outline-none focus-visible:outline-none min-h-0 whitespace-pre-wrap break-words focus:min-h-[1.5em] editor-placeholder'

export const editorCodeBlockStyle =
  'text-style-code bg-surface rounded-md p-8 overflow-x-auto text-fg whitespace-pre outline-none focus-visible:outline-none'

export const editorCodeBlockWrapperStyle = 'relative group/code'

export const editorCodeLanguageSelectStyle =
  'absolute top-2 right-2 z-[1] text-style-caption text-fg-body bg-surface border-[0.5px] border-solid border-divider [--field-bg:var(--field-bg-on-surface)] rounded-sm px-1 py-0.5 opacity-0 pointer-events-none transition-opacity duration-150 group-focus-within/code:opacity-100 group-focus-within/code:pointer-events-auto'

export const editorHrStyle = 'border-none h-[0.5px] bg-divider my-0'

export const editorHrShellStyle = 'relative w-full py-8'

/** The showcase figure: full width, a centred column, caption at the text measure. */
export const editorShowcaseStyle =
  'w-full flex flex-col gap-2 items-center [&>figcaption]:max-w-(--size-article-content) [&>figcaption]:text-center'

export const editorShowcaseMediaStyle =
  'self-stretch w-full outline-none focus-visible:outline-none cursor-default'

/** The boxes a standalone media block is composed of — see kartik.to's `mediaBlock` slots. */
export const mediaBlockStyles = {
  /** The box that does NOT clip, so the control rail can straddle the top edge. */
  root: 'relative grid self-stretch w-full',
  /** The positioned box the ground fills and a clip's transport pins to. */
  frame: 'relative flex w-full min-w-0 rounded-xl',
  image: 'w-full block border-[0.5px] border-solid border-divider relative z-[1]'
}

export const editorImgStyle = `${mediaBlockStyles.image} ${editorShowcaseMediaStyle}`

export const editorImagePlaceholderStyle = `${editorShowcaseMediaStyle} w-full`

export const editorImageOverlayStyle =
  'absolute inset-0 flex items-center justify-center pointer-events-auto'

export const editorImageOverlayTintStyle =
  'absolute inset-0 bg-canvas border-[0.5px] border-solid border-divider rounded-xl pointer-events-none opacity-85'

export const editorImageOverlayActionsStyle =
  'relative z-[1] flex items-center justify-center gap-2'

/** Shared icon size for menu items — fixed 20px, never shrinks. */
export const menuIconStyle = 'shrink-0 w-5 h-5'

const captionEditable = `${editableBaseStyle} min-h-[1.5em]`

export const editorCaptionStyle = `${captionEditable} text-style-caption text-fg text-center [text-wrap:balance] w-full`

/** Blockquote citation — left-aligned beneath the quote text. */
export const editorBlockquoteCaptionStyle = `${captionEditable} text-style-caption not-italic text-fg-body/50 break-words`

/** Subheading eyebrow — the gradient reveals once populated. */
export const editorSubheadingCaptionStyle = `${captionEditable} article-subheading-caption`

/** Metric value — the gradient display line, with a caret's width reserved while empty. */
export const editorMetricValueStyle = `${editableBaseStyle} article-metric-value min-h-[1.5em] min-w-px`

export const editorMetricCaptionStyle = `${captionEditable} text-style-caption text-fg text-left break-words`

export const editorMetricLabelStyle = `${captionEditable} text-style-body-lg text-fg break-words`

export const articleMetricStyle = 'flex flex-col items-start gap-1 break-words'

export const articleHeadingShellStyle = 'flex flex-col gap-1'

export const articleBlockquoteShellStyle = 'flex flex-row items-start gap-1'

export const articleBlockquoteBodyStyle = 'flex-auto min-w-0 flex flex-col gap-1'

export const articleBlockquoteStyle = 'text-style-quote text-fg break-words pt-3'

/** A caret-less block's shell: focusable, with a ring that reads as "selected". */
export const editorFurnitureWrapperStyle =
  'relative outline-none rounded-lg focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-field-border-active focus-visible:outline-offset-4'

export const editorHrWrapperStyle = 'outline-none focus-visible:outline-none cursor-default'

export const editorListItemShellStyle = 'flex flex-row items-start gap-2'

export const editorListItemContentStyle = `${editableBaseStyle} flex-auto min-w-0 text-style-body-lg text-fg-body break-words`

/**
 * Every marker is a real button in the editor so it can open its popover —
 * reset the native chrome and re-enable pointer events (the prose utilities
 * disable them). The button is the 24px alignment box; the ink lives inside.
 */
const bulletButtonReset =
  'appearance-none border-none bg-transparent p-0 pointer-events-auto! cursor-pointer'

export const editorListMarkerButtonStyle = `list-marker-box ${bulletButtonReset}`
export const editorListMarkerPillStyle = 'list-marker'
export const editorListBulletButtonStyle = `list-bullet ${bulletButtonReset}`
export const editorListBulletIconButtonStyle = `list-bullet-icon ${bulletButtonReset}`
export const editorBulletCircleClass = {
  check: 'list-bullet-circle list-bullet-circle-check',
  cross: 'list-bullet-circle list-bullet-circle-cross'
} as const
