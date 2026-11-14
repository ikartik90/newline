import {
  createContext,
  useContext,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject
} from 'react'
import { createPortal } from 'react-dom'
import { scrollBoundary } from '@/hooks/use-scroll-handoff'
import { hasWindowGlass, holdWindowGlass } from '@/hooks/use-window-glass'

// ---------------------------------------------------------------------------
// Dialog — the modal panel every dialog in the app is drawn in: a native
// `<dialog>` shown with `showModal()`, so the platform supplies the top layer,
// the inert page behind and the `::backdrop` the dim is drawn on. Controlled:
// `open` shows it, and every way out — Escape, a press on the dim, a
// `Dialog.Close` — arrives at `onClose`, which flips `open` off. The content
// mounts on open and unmounts once the closing transition has run.
//
//   <Dialog open={open} onClose={close} aria-label="Insert image">
//     <Dialog.Header>
//       <Dialog.Title>Insert image</Dialog.Title>
//       <Button aria-label="Close" onClick={close}><CrossIcon /></Button>
//     </Dialog.Header>
//     …
//     <Dialog.Footer>
//       <Dialog.FooterGroup>…</Dialog.FooterGroup>
//     </Dialog.Footer>
//   </Dialog>
//
// `align`/`justify` place the panel in the viewport; `size` is the panel shell
// (`dialogPanel` recipe). The panel marks itself `data-modal-dialog` so
// `useDismiss` leaves a menu standing behind it alone when Escape closes it.
// ---------------------------------------------------------------------------

export type DialogAlign =
  | 'top'
  | 'top-center'
  | 'center'
  | 'bottom-center'
  | 'bottom'
  | 'stretch'
  | 'palette'

export type DialogJustify = 'start' | 'center' | 'end' | 'stretch'

export type DialogSize = 'xs' | 'sm' | 'md' | 'palette'

export type DialogMaterial = 'solid' | 'frosted' | 'glass'

export interface DialogProps extends Omit<HTMLAttributes<HTMLDialogElement>, 'title'> {
  open: boolean
  /** Called for every way out; the caller flips `open` off. */
  onClose: () => void
  /** Vertical placement in the viewport. Default `center`. */
  align?: DialogAlign
  /** Horizontal placement in the viewport. Default `center`. */
  justify?: DialogJustify
  /** The panel shell's width (and, for `md`, height). Default `sm`. */
  size?: DialogSize
  /**
   * `solid`, the default, is the sheet over the page veiled and blurred.
   * `frosted` is the glass palette's stand-in where AppKit has no glass: the
   * panel is the blur, over the page left as it is.
   * `glass` stands straight on the window's own glass, as the glass palette
   * does, where AppKit has it; elsewhere it is `solid`.
   */
  material?: DialogMaterial
  /**
   * Where the focus goes on open — by default the first tabbable control, else
   * the panel. A ref for a panel whose keys are read elsewhere (the confirm's
   * rows).
   */
  initialFocus?: RefObject<HTMLElement | null>
  children: ReactNode
}

// The panel and its dim fade on 80ms, both ways; the panel's 95% scale is set
// and dropped at once, never animated. The dialog's `display` and `overlay` are transitioned as
// well, so a closed dialog stays in the top layer until it has faded.
//
// Solid: the page behind veiled and blurred, on the dialog's own `::backdrop`.
// The `dialogPanel` recipe: a clipped column on the surface, a sheet whose
// fields stand a step up, on surface 2. The surface owns the glyph hue — the
// header's icon buttons are `color: inherit`.
// Frosted: the page only dims, by 15%, as under the glass palette, and the panel
// takes the glass palette's corner (`rounded-3xl`, AppKit's continuous 16pt).
// Glass: no sheet, rim or dim. The window is glass under it and the page has
// faded away, so what the panel holds stands straight on the glass, and steps
// on it as the sidebar's rows do (`data-on-glass`).
const panelStyle: Record<DialogMaterial, string> = {
  solid:
    'flex flex-col items-stretch justify-start p-0 max-w-none bg-surface-sheet surface-level-1 text-glyph-body rounded-md border border-border-divider overflow-hidden outline-none transition-[opacity,display,overlay] transition-discrete duration-[80ms] ease-out opacity-0 scale-95 open:opacity-100 open:scale-100 starting:open:opacity-0 starting:open:scale-95 backdrop:bg-surface-canvas/50 backdrop:backdrop-frost backdrop:transition-[opacity,display,overlay] backdrop:transition-discrete backdrop:duration-[80ms] backdrop:ease-out backdrop:opacity-0 open:backdrop:opacity-100 starting:open:backdrop:opacity-0',
  frosted:
    'flex flex-col items-stretch justify-start p-0 max-w-none frosted-sheet surface-level-1 text-glyph-body rounded-3xl border border-border-divider shadow-lg overflow-hidden outline-none transition-[opacity,display,overlay] transition-discrete duration-[80ms] ease-out opacity-0 scale-95 open:opacity-100 open:scale-100 starting:open:opacity-0 starting:open:scale-95 backdrop:bg-black/15 backdrop:transition-[opacity,display,overlay] backdrop:transition-discrete backdrop:duration-[80ms] backdrop:ease-out backdrop:opacity-0 open:backdrop:opacity-100 starting:open:backdrop:opacity-0',
  glass:
    'flex flex-col items-stretch justify-start p-0 max-w-none bg-transparent surface-level-1 text-glyph-body overflow-hidden outline-none transition-[opacity,display,overlay] transition-discrete duration-[80ms] ease-out opacity-0 scale-95 open:opacity-100 open:scale-100 starting:open:opacity-0 starting:open:scale-95 backdrop:bg-transparent'
}

// 16px (`xl`) of viewport on either side is the least a panel keeps.
const sizeStyle: Record<DialogSize, string> = {
  xs: 'w-[min(var(--size-dialog-xs),calc(100vw-32px))]',
  sm: 'w-[min(var(--size-dialog-sm),calc(100vw-32px))]',
  md: 'w-[min(var(--size-article-content),calc(100vw-32px))] h-(--size-insert-dialog-height)',
  // The command menu's, as the glass palette is: 24px kept on either side.
  palette: 'w-[min(var(--size-dialog-sm),calc(100vw-48px))]'
}

// Vertical placement — the block margins, which place a modal dialog (fixed,
// inset 0) in the viewport. `max-h-none` and the panel's `max-w-none` lift the
// browser's own cap on a modal dialog, 38px short of the viewport.
const alignStyle: Record<DialogAlign, string> = {
  top: 'mt-4 mb-auto max-h-none',
  'top-center': 'mt-[25dvh] mb-auto max-h-none',
  center: 'my-auto max-h-none',
  'bottom-center': 'mt-auto mb-[25dvh] max-h-none',
  bottom: 'mt-auto mb-4 max-h-none',
  stretch: 'my-4 h-[calc(100dvh-32px)] max-h-none',
  // As the glass palette stands (main/command-palette.ts): centred at the
  // menu's full height, 424px, so the field stays put as the list filters, and
  // never nearer than 24px under the 48px top bar or 40px above the bottom.
  palette:
    'mt-[max(72px,calc((100dvh-424px)/2))] mb-auto max-h-[calc(100dvh-max(72px,calc((100dvh-424px)/2))-40px)]'
}

// Horizontal placement — the inline margins. `100%` rather than `100vw` for
// stretch, to exclude the scrollbar gutter.
const justifyStyle: Record<DialogJustify, string> = {
  start: 'ms-4 me-auto',
  center: 'mx-auto',
  end: 'ms-auto me-4',
  stretch: 'mx-4 w-[calc(100%-32px)]'
}

const TABBABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [contenteditable="true"], [tabindex]'

function firstTabbable(root: HTMLElement): HTMLElement | null {
  for (const el of root.querySelectorAll<HTMLElement>(TABBABLE)) {
    if (el.tabIndex >= 0) return el
  }
  return null
}

/** Whether a pointer at (x, y) is off the panel — on the dim, which is the dialog's own. */
function isBeside(dialog: HTMLElement, x: number, y: number): boolean {
  const r = dialog.getBoundingClientRect()
  return x < r.left || x > r.right || y < r.top || y > r.bottom
}

// A modal dialog holds the page behind it still, and nothing beside it shifts.
// Beside an overlay scrollbar, which takes no room, hiding the overflow is all.
// Beside one that does, its gutter is kept stable; where the engine keeps no
// gutter for it (Chromium under a styled scrollbar), the body is pinned at the
// viewport's size less the scrollbar and the page scrolled inside it instead.
// A page whose viewport already does not scroll (the frosted shell's) is left
// alone. Nested dialogs share one lock.
let pageLocks = 0
let unlockPage: (() => void) | null = null

function lockPageScroll(): () => void {
  pageLocks += 1
  if (pageLocks === 1) unlockPage = lockPage()
  return () => {
    pageLocks -= 1
    if (pageLocks === 0) {
      unlockPage?.()
      unlockPage = null
    }
  }
}

/** The element whose overflow is the viewport's: <html> when it scrolls itself, else <body>. */
function viewportScroller(): HTMLElement {
  const html = document.documentElement
  return /auto|scroll|overlay|hidden|clip/.test(getComputedStyle(html).overflowY)
    ? html
    : document.body
}

function keepsStableGutter(scroller: HTMLElement): boolean {
  if (!CSS.supports?.('scrollbar-gutter', 'stable')) return false
  const html = document.documentElement
  const saved = { overflowY: scroller.style.overflowY, gutter: html.style.scrollbarGutter }
  html.style.scrollbarGutter = 'stable'
  scroller.style.overflowY = 'scroll'
  const scrolling = scroller.offsetWidth
  scroller.style.overflowY = 'hidden'
  const hidden = scroller.offsetWidth
  scroller.style.overflowY = saved.overflowY
  html.style.scrollbarGutter = saved.gutter
  return scrolling === hidden
}

function lockPage(): () => void {
  const html = document.documentElement
  const body = document.body
  const scroller = viewportScroller()
  if (/hidden|clip/.test(getComputedStyle(scroller).overflowY)) return () => {}

  if (window.innerWidth - html.clientWidth <= 0) {
    const saved = { overflowY: scroller.style.overflowY, overflowX: scroller.style.overflowX }
    Object.assign(scroller.style, { overflowY: 'hidden', overflowX: 'hidden' })
    return () => Object.assign(scroller.style, saved)
  }

  const htmlStyle = getComputedStyle(html)
  const bodyStyle = getComputedStyle(body)
  const gutter = htmlStyle.scrollbarGutter?.includes('both-edges') ? 'stable both-edges' : 'stable'
  const savedHtml = {
    scrollbarGutter: html.style.scrollbarGutter,
    overflowY: html.style.overflowY,
    overflowX: html.style.overflowX,
    scrollBehavior: html.style.scrollBehavior
  }
  const savedBody = {
    position: body.style.position,
    height: body.style.height,
    width: body.style.width,
    boxSizing: body.style.boxSizing,
    overflowY: body.style.overflowY,
    overflowX: body.style.overflowX,
    scrollBehavior: body.style.scrollBehavior
  }

  if (keepsStableGutter(scroller)) {
    html.style.scrollbarGutter = gutter
    Object.assign(scroller.style, { overflowY: 'hidden', overflowX: 'hidden' })
    return () => {
      Object.assign(html.style, savedHtml)
      Object.assign(body.style, savedBody)
    }
  }

  const { scrollTop, scrollLeft } = html
  const scrollsY =
    html.scrollHeight > html.clientHeight ||
    htmlStyle.overflowY === 'scroll' ||
    bodyStyle.overflowY === 'scroll'
  const scrollsX =
    html.scrollWidth > html.clientWidth ||
    htmlStyle.overflowX === 'scroll' ||
    bodyStyle.overflowX === 'scroll'
  const scrollbarWidth = Math.max(0, window.innerWidth - body.clientWidth)
  const scrollbarHeight = Math.max(0, window.innerHeight - body.clientHeight)
  const marginY = parseFloat(bodyStyle.marginTop) + parseFloat(bodyStyle.marginBottom) || 0
  const marginX = parseFloat(bodyStyle.marginLeft) + parseFloat(bodyStyle.marginRight) || 0
  Object.assign(html.style, {
    scrollbarGutter: gutter,
    overflowY: scrollsY ? 'scroll' : 'hidden',
    overflowX: scrollsX ? 'scroll' : 'hidden',
    scrollBehavior: 'unset'
  })
  Object.assign(body.style, {
    position: 'relative',
    height: marginY || scrollbarHeight ? `calc(100dvh - ${marginY + scrollbarHeight}px)` : '100dvh',
    width: marginX || scrollbarWidth ? `calc(100vw - ${marginX + scrollbarWidth}px)` : '100vw',
    boxSizing: 'border-box',
    overflowY: 'hidden',
    overflowX: 'hidden',
    scrollBehavior: 'unset'
  })
  body.scrollTop = scrollTop
  body.scrollLeft = scrollLeft
  return () => {
    Object.assign(html.style, savedHtml)
    Object.assign(body.style, savedBody)
    html.scrollTop = scrollTop
    html.scrollLeft = scrollLeft
  }
}

interface DialogContextValue {
  onClose: () => void
  setTitleId: (id: string | undefined) => void
  setDescriptionId: (id: string | undefined) => void
}

const DialogContext = createContext<DialogContextValue | null>(null)

function DialogRoot({
  open,
  onClose,
  align = 'center',
  justify = 'center',
  size = 'sm',
  material: asked = 'solid',
  initialFocus,
  className,
  children,
  onKeyDown,
  onPointerDown,
  onClick,
  ...rest
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const material: DialogMaterial = asked === 'glass' && !hasWindowGlass() ? 'solid' : asked
  // Mounted from the render that opens it until its closing transition ends.
  const [mounted, setMounted] = useState(open)
  if (open && !mounted) setMounted(true)
  const [titleId, setTitleId] = useState<string>()
  const [descriptionId, setDescriptionId] = useState<string>()
  const openRef = useRef(open)
  openRef.current = open
  const returnFocus = useRef<HTMLElement | null>(null)
  const pressBegunBeside = useRef(false)

  useLayoutEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open) {
      if (dialog.open) return
      const active = document.activeElement
      returnFocus.current =
        active instanceof HTMLElement && active !== document.body ? active : null
      dialog.showModal()
      ;(initialFocus?.current ?? firstTabbable(dialog) ?? dialog).focus()
      return
    }
    if (dialog.open) {
      dialog.close()
      // close() hands the focus back as well; this covers an engine that does not.
      const back = returnFocus.current
      returnFocus.current = null
      if (
        back?.isConnected &&
        (dialog.contains(document.activeElement) || document.activeElement === document.body)
      ) {
        back.focus()
      }
    }
    const fading = dialog.getAnimations?.({ subtree: true }) ?? []
    if (fading.length === 0) {
      setMounted(false)
      return
    }
    // A window that draws no frames (hidden, minimised) never runs the fade, so
    // a little past its 80ms the dialog goes regardless.
    const faded = Promise.allSettled(fading.map((a) => a.finished))
    const late = new Promise((resolve) => setTimeout(resolve, 160))
    void Promise.race([faded, late]).then(() => {
      if (!openRef.current) setMounted(false)
    })
    // `initialFocus` is read on open only.
  }, [open, mounted])

  useLayoutEffect(() => (open ? lockPageScroll() : undefined), [open])
  useLayoutEffect(
    () => (open && material === 'glass' ? holdWindowGlass() : undefined),
    [open, material]
  )

  if (!mounted) return null

  const classes = `${panelStyle[material]} ${sizeStyle[size]} ${alignStyle[align]} ${justifyStyle[justify]}`
  return createPortal(
    <DialogContext.Provider value={{ onClose, setTitleId, setDescriptionId }}>
      {/*
        A dialog is the end of the scroll as it is the end of the focus: the
        page behind it is not being read. `data-scroll-boundary` says so to
        `useScrollHandoff`, whose walk would otherwise pass straight through a
        panel that clips rather than scrolls.
      */}
      <dialog
        ref={ref}
        data-modal-dialog=""
        data-dialog-backdrop={material === 'solid' ? '' : 'clear'}
        data-on-glass={material === 'glass' ? '' : undefined}
        data-align={align}
        data-justify={justify}
        data-size={size}
        tabIndex={-1}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className={className ? `${classes} ${className}` : classes}
        {...scrollBoundary}
        {...rest}
        onKeyDown={(e: KeyboardEvent<HTMLDialogElement>) => {
          onKeyDown?.(e)
          if (e.key !== 'Escape' || e.defaultPrevented) return
          // Ours to close, not the browser's: it would close the dialog itself.
          e.preventDefault()
          onClose()
        }}
        onCancel={(e) => {
          e.preventDefault()
          onClose()
        }}
        onClose={() => {
          // The browser closed it without asking — an Escape it would not let
          // be cancelled. The caller still hears of it.
          if (openRef.current) onClose()
        }}
        // A press on the dim lands on the dialog itself, beside its panel, and
        // closes it only if it began there too: a drag out of the panel is a
        // selection running long.
        onPointerDown={(e: PointerEvent<HTMLDialogElement>) => {
          onPointerDown?.(e)
          pressBegunBeside.current =
            e.target === e.currentTarget && isBeside(e.currentTarget, e.clientX, e.clientY)
        }}
        onClick={(e: MouseEvent<HTMLDialogElement>) => {
          onClick?.(e)
          const begunBeside = pressBegunBeside.current
          pressBegunBeside.current = false
          if (
            begunBeside &&
            e.target === e.currentTarget &&
            isBeside(e.currentTarget, e.clientX, e.clientY)
          ) {
            onClose()
          }
        }}
      >
        {children}
      </dialog>
    </DialogContext.Provider>,
    document.body
  )
}

export interface DialogSlotProps extends HTMLAttributes<HTMLElement> {
  children?: ReactNode
}

// The title row, with a divider under it. Insets its contents 8px — the
// panel's own corner — so the trailing close chip and the leading title sit on
// the margin the shell curves at. The one row every dialog draws identically.
const headerStyle =
  'flex items-center justify-between w-full h-10 px-2 border-b border-border-divider shrink-0'

export function DialogHeader({ className, children, ...rest }: DialogSlotProps) {
  return (
    <header className={className ? `${headerStyle} ${className}` : headerStyle} {...rest}>
      {children}
    </header>
  )
}

const titleStyle = 'm-0 p-0 text-style-body-sm text-glyph-body [font-weight:inherit] text-balance'

/** Registers a slot's id with the dialog while the slot is mounted. */
function useSlotId(register: ((id: string | undefined) => void) | undefined, given?: string) {
  const generated = useId()
  const id = given ?? generated
  useLayoutEffect(() => {
    if (!register) return
    register(id)
    return () => register(undefined)
  }, [register, id])
  return id
}

/** The heading; the dialog is named by it (`aria-labelledby`). */
export function DialogTitle({ className, children, id, ...rest }: DialogSlotProps) {
  const titleId = useSlotId(useContext(DialogContext)?.setTitleId, id)
  return (
    <h2 id={titleId} className={className ? `${titleStyle} ${className}` : titleStyle} {...rest}>
      {children}
    </h2>
  )
}

/** A description; the dialog is described by it (`aria-describedby`). */
export function DialogDescription({ className, children, id, ...rest }: DialogSlotProps) {
  const descriptionId = useSlotId(useContext(DialogContext)?.setDescriptionId, id)
  return (
    <p id={descriptionId} className={className} {...rest}>
      {children}
    </p>
  )
}

// The action row, with a divider over it. Deliberately the same 8px inset as
// the header — these two rows frame the dialog and any difference reads as a
// slip. `mt-auto` holds it to the foot of a panel with a fixed height.
const footerStyle =
  'flex items-center justify-between w-full h-(--size-dialog-footer) px-2 border-t border-border-divider shrink-0 mt-auto'

export function DialogFooter({ className, children, ...rest }: DialogSlotProps) {
  return (
    <footer className={className ? `${footerStyle} ${className}` : footerStyle} {...rest}>
      {children}
    </footer>
  )
}

const footerGroupStyle = 'flex items-center gap-2'

/** A cluster of buttons at one end of the footer. */
export function DialogFooterGroup({ className, children, ...rest }: DialogSlotProps) {
  return (
    <div className={className ? `${footerGroupStyle} ${className}` : footerGroupStyle} {...rest}>
      {children}
    </div>
  )
}

/** A button that closes the dialog it stands in. */
export function DialogClose({
  onClick,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  const dialog = useContext(DialogContext)
  return (
    <button
      type={type}
      onClick={(e) => {
        onClick?.(e)
        if (!e.defaultPrevented) dialog?.onClose()
      }}
      {...rest}
    />
  )
}

export const Dialog = Object.assign(DialogRoot, {
  Header: DialogHeader,
  Title: DialogTitle,
  Description: DialogDescription,
  Footer: DialogFooter,
  FooterGroup: DialogFooterGroup,
  Close: DialogClose
})
