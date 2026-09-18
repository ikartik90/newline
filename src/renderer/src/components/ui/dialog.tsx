import type { HTMLAttributes, ReactNode } from 'react'
import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import { scrollBoundary } from '@/hooks/use-scroll-handoff'

// ---------------------------------------------------------------------------
// Dialog — the modal panel every dialog in the app is drawn in, on Base UI's
// Dialog (portal, backdrop, focus trap, Escape and outside press). Controlled:
// `open` shows it, and every way out — Escape, the backdrop, a `Dialog.Close`
// — arrives at `onClose`, which flips `open` off.
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

export type DialogAlign = 'top' | 'top-center' | 'center' | 'bottom-center' | 'bottom' | 'stretch'

export type DialogJustify = 'start' | 'center' | 'end' | 'stretch'

export type DialogSize = 'xs' | 'sm' | 'md'

export interface DialogProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
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
   * Where the focus goes on open — Base UI's default is the first tabbable
   * element, else the panel. A ref for a panel whose keys are read elsewhere
   * (the confirm's rows); `false` to leave it where it is.
   */
  initialFocus?: React.ComponentProps<typeof BaseDialog.Popup>['initialFocus']
  children: ReactNode
}

// The page behind, veiled and blurred. Fades on the same 80ms as the panel.
const backdropStyle =
  'fixed inset-0 z-50 bg-canvas/50 backdrop-frost transition-opacity duration-[80ms] ease-out data-[starting-style]:opacity-0 data-[ending-style]:opacity-0'

// The layer the panel is placed in: a flex box the size of the viewport, so
// the margins below do the placing, and transparent to the pointer so a press
// beside the panel reaches the backdrop and counts as an outside press.
const viewportStyle = 'fixed inset-0 z-50 flex overflow-y-auto pointer-events-none'

// The `dialogPanel` recipe: a clipped column on the surface, with fields inside
// taking the on-surface fill. The surface owns the glyph hue — the header's
// icon buttons are `color: inherit`. Enters scaling up from 95%, leaves the
// same way.
const panelStyle =
  'pointer-events-auto flex flex-col items-stretch justify-start p-0 bg-surface [--color-field:var(--color-field-on-surface)] text-fg-body rounded-md border-[0.5px] border-divider overflow-hidden outline-none transition-[opacity,transform] duration-[80ms] ease-out data-[starting-style]:opacity-0 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[ending-style]:scale-95'

// 16px (`xl`) of viewport on either side is the least a panel keeps.
const sizeStyle: Record<DialogSize, string> = {
  xs: 'w-[min(var(--size-dialog-xs),calc(100vw-32px))]',
  sm: 'w-[min(var(--size-dialog-sm),calc(100vw-32px))]',
  md: 'w-[min(var(--size-article-content),calc(100vw-32px))] h-(--size-insert-dialog-height)'
}

// Vertical placement — the block margins.
const alignStyle: Record<DialogAlign, string> = {
  top: 'mt-4 mb-auto',
  'top-center': 'mt-[25dvh] mb-auto',
  center: 'my-auto',
  'bottom-center': 'mt-auto mb-[25dvh]',
  bottom: 'mt-auto mb-4',
  stretch: 'my-4 h-[calc(100dvh-32px)]'
}

// Horizontal placement — the inline margins. `100%` rather than `100vw` for
// stretch, to exclude the scrollbar gutter.
const justifyStyle: Record<DialogJustify, string> = {
  start: 'ms-4 me-auto',
  center: 'mx-auto',
  end: 'ms-auto me-4',
  stretch: 'mx-4 w-[calc(100%-32px)]'
}

function DialogRoot({
  open,
  onClose,
  align = 'center',
  justify = 'center',
  size = 'sm',
  initialFocus,
  className,
  children,
  ...rest
}: DialogProps) {
  const classes = `${panelStyle} ${sizeStyle[size]} ${alignStyle[align]} ${justifyStyle[justify]}`
  return (
    <BaseDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      modal
    >
      <BaseDialog.Portal>
        <BaseDialog.Backdrop data-dialog-backdrop="" className={backdropStyle} />
        <div className={viewportStyle}>
          {/*
            A dialog is the end of the scroll as it is the end of the focus:
            the page behind it is not being read. `data-scroll-boundary` says
            so to `useScrollHandoff`, whose walk would otherwise pass straight
            through a panel that clips rather than scrolls.
          */}
          <BaseDialog.Popup
            data-modal-dialog=""
            data-align={align}
            data-justify={justify}
            data-size={size}
            initialFocus={initialFocus}
            className={className ? `${classes} ${className}` : classes}
            {...scrollBoundary}
            {...rest}
          >
            {children}
          </BaseDialog.Popup>
        </div>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  )
}

export interface DialogSlotProps extends HTMLAttributes<HTMLElement> {
  children?: ReactNode
}

// The title row, with a divider under it. Insets its contents 8px — the
// panel's own corner — so the trailing close chip and the leading title sit on
// the margin the shell curves at. The one row every dialog draws identically.
const headerStyle =
  'flex items-center justify-between w-full h-10 px-2 border-b-[0.5px] border-divider shrink-0'

export function DialogHeader({ className, children, ...rest }: DialogSlotProps) {
  return (
    <header className={className ? `${headerStyle} ${className}` : headerStyle} {...rest}>
      {children}
    </header>
  )
}

const titleStyle = 'm-0 p-0 text-style-body-sm text-fg-body [font-weight:inherit] text-balance'

/** The heading; Base UI names the dialog by it (`aria-labelledby`). */
export function DialogTitle({ className, children, ...rest }: DialogSlotProps) {
  return (
    <BaseDialog.Title className={className ? `${titleStyle} ${className}` : titleStyle} {...rest}>
      {children}
    </BaseDialog.Title>
  )
}

/** A description; Base UI wires it to the dialog (`aria-describedby`). */
export function DialogDescription({ className, children, ...rest }: DialogSlotProps) {
  return (
    <BaseDialog.Description className={className} {...rest}>
      {children}
    </BaseDialog.Description>
  )
}

// The action row, with a divider over it. Deliberately the same 8px inset as
// the header — these two rows frame the dialog and any difference reads as a
// slip. `mt-auto` holds it to the foot of a panel with a fixed height.
const footerStyle =
  'flex items-center justify-between w-full h-(--size-dialog-footer) px-2 border-t-[0.5px] border-divider shrink-0 mt-auto'

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

export const Dialog = Object.assign(DialogRoot, {
  Header: DialogHeader,
  Title: DialogTitle,
  Description: DialogDescription,
  Footer: DialogFooter,
  FooterGroup: DialogFooterGroup,
  /** A button that closes the dialog — renders your element via `render`. */
  Close: BaseDialog.Close
})
