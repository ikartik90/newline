import {
  Children,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
  type Ref
} from 'react'
import { createPortal } from 'react-dom'
import { useDismiss } from '@/hooks/use-dismiss'
import { usePropertiesPanelInset } from '@/hooks/use-properties-panel-inset'
import { Button } from './button'
import { Typography } from './typography'
import { cx, Field } from './input/field'
import AddIcon from '@/assets/icons/add.svg'
import RemoveIcon from '@/assets/icons/remove.svg'
import RightSidebarIcon from '@/assets/icons/right-sidebar.svg'

// ---------------------------------------------------------------------------
// PropertiesPanel — the docked inspector, composed the way the rest of the
// system composes:
//
//   <PropertiesPanel ariaLabel="Media properties" onDismiss={close}>
//     <PropertiesPanel.Header>Media Properties</PropertiesPanel.Header>
//
//     <PropertiesPanel.Section
//       defaultEnabled={Boolean(caption)}
//       onEnabledChange={(on) => !on && clearCaption()}
//     >
//       <PropertiesPanel.SectionHeader icon={<EditIcon />}>Caption</PropertiesPanel.SectionHeader>
//       <PropertiesPanel.ControlPanel>
//         <PropertiesPanel.Text value={caption} onValueChange={setCaption} />
//       </PropertiesPanel.ControlPanel>
//     </PropertiesPanel.Section>
//   </PropertiesPanel>
//
// Three nestings of one shape — a 40px header strip over a body. The panel is
// a header over its sections; a section is a header over its control panel; a
// control panel is a column of rows. A `<Group>` is the section that is always
// on: the same strip and body, with a title and no add/remove pair.
//
// A section's control panel is MOUNTED, not hidden: enabling adds it to the
// DOM and disabling takes it away, which is what makes the add/remove pair
// honest — a collapsed section holds no focusable controls to tab into and no
// stale values to read back.
//
// The panel knows nothing about what it is inspecting. `Section` owns only
// whether it is open and reports the change; what enabling MEANS belongs to
// the consumer that has the document.
//
// Desktop only: the rail docks to the right edge. Whatever opens the panel
// must mark itself {@link PROPERTIES_TRIGGER_ATTR}, or it cannot be the thing
// that closes it — see the constant.
// ---------------------------------------------------------------------------

/**
 * Spread onto the control that opens the panel:
 *
 *   <Button {...PROPERTIES_TRIGGER_ATTR} onClick={toggle} />
 *
 * It exempts that control from the outside-pointerdown dismiss. Without it a
 * toggling trigger can only ever OPEN: the dismiss runs on pointerdown, the
 * click arrives to find the panel already closed, and re-opens it.
 */
export const PROPERTIES_TRIGGER_ATTR = { 'data-properties-trigger': '' }

const TRIGGER_SELECTOR = '[data-properties-trigger]'

/** How long the panel takes to slide back out. In step with `--animate-panel-out`. */
const EXIT_MS = 200

/** The strip's ink, stated once: the buttons in it paint in `currentColor`. */
const STRIP = 'shrink-0 flex items-center justify-between gap-2 h-10 px-3 text-fg-body'

/** A control that fills the panel stops where the FIELD column stops. */
const BLOCK_WIDTH = 'w-[calc(100%-8px-var(--size-property-row-action))]'

type PanelContextValue = {
  onDismiss: () => void
}

const PanelContext = createContext<PanelContextValue | null>(null)

function usePanel(component: string): PanelContextValue {
  const ctx = useContext(PanelContext)
  if (!ctx) throw new Error(`${component} must be used within <PropertiesPanel>.`)
  return ctx
}

type SectionContextValue = {
  enabled: boolean
  setEnabled: (next: boolean) => void
  /** Ties the section header's toggle to the panel it mounts, via aria-controls. */
  panelId: string
  /** The heading the control panel is named by. */
  titleId: string
}

const SectionContext = createContext<SectionContextValue | null>(null)

function useSection(component: string): SectionContextValue {
  const ctx = useContext(SectionContext)
  if (!ctx) throw new Error(`${component} must be used within <PropertiesPanel.Section>.`)
  return ctx
}

/** What a `ref` on the panel gets you: the way to close it from outside. */
export interface PropertiesPanelHandle {
  /**
   * Start the closing slide. `onDismiss` follows when it is over — so the
   * trigger that opened the panel closes it through HERE rather than by
   * dropping it from the tree, which would take the animation with it.
   */
  dismiss: () => void
}

export interface PropertiesPanelProps {
  /** Names the dialog for assistive technology. */
  ariaLabel: string
  /**
   * Fired once the panel has finished leaving — the point at which the
   * consumer should stop rendering it. NOT the moment it was asked to close.
   */
  onDismiss: () => void
  /**
   * Extra CSS selector exempted from the outside-pointerdown dismiss, on top of
   * the panel's own trigger — for a panel that opens a portalled surface of
   * its OWN beside itself.
   */
  ignoreSelector?: string
  /**
   * Whether a press outside closes the panel (default true). Pass false for one
   * that IS the page's settings, opened and closed deliberately. Escape and
   * the header's close button are unaffected.
   */
  dismissOnOutsidePointer?: boolean
  /**
   * Whether the page SLIDES into the width this panel takes (default true).
   * Pass false on a page that opens with the panel already up — see
   * `usePropertiesPanelInset`.
   */
  animateInset?: boolean
  ref?: Ref<PropertiesPanelHandle>
  children: ReactNode
}

/**
 * The docked shell: Escape / outside-pointer dismissal from the shared
 * `useDismiss`, portalled to the body so no ancestor's `overflow`, `transform`
 * or `container-type` can clip it or steal its containing block — the panel is
 * fixed to the VIEWPORT.
 */
function PropertiesPanelRoot({
  ariaLabel,
  onDismiss,
  ignoreSelector,
  dismissOnOutsidePointer,
  animateInset,
  ref,
  children
}: PropertiesPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  // The panel LEAVES the way it arrived, which means it has to outlive the
  // decision to close it: the consumer unmounts it the moment `onDismiss`
  // fires, and an unmounted node has nothing to animate. So every dismissal
  // routes through here first, holds the panel on screen for the length of
  // the slide, and only then tells the consumer.
  const [exiting, setExiting] = useState(false)
  const close = useCallback(() => setExiting(true), [])

  // The page gives up the width the panel is about to occupy, and takes it
  // back the moment the panel is asked to leave rather than when it has gone.
  usePropertiesPanelInset(!exiting, { animate: animateInset })
  useImperativeHandle(ref, () => ({ dismiss: close }), [close])

  useDismiss({
    ref: panelRef,
    onDismiss: close,
    ignoreSelector: ignoreSelector ? `${TRIGGER_SELECTOR}, ${ignoreSelector}` : TRIGGER_SELECTOR,
    dismissOnOutsidePointer,
    // A panel already leaving takes no more instructions.
    enabled: !exiting
  })

  // Read through a ref so the timer is started by the EXIT, not restarted by
  // a consumer that hands down a fresh arrow on every render.
  const dismissRef = useRef(onDismiss)
  useEffect(() => {
    dismissRef.current = onDismiss
  }, [onDismiss])

  useEffect(() => {
    if (!exiting) return
    // A clock rather than `animationend`: under `prefers-reduced-motion`
    // main.css collapses the slide to 0.01ms, so the panel is off screen
    // immediately either way and the wait costs nothing anyone can see.
    const timer = setTimeout(() => dismissRef.current(), EXIT_MS)
    return () => clearTimeout(timer)
  }, [exiting])

  return createPortal(
    <PanelContext.Provider value={{ onDismiss: close }}>
      <div
        ref={panelRef}
        role="dialog"
        aria-label={ariaLabel}
        data-properties-panel-root
        data-exiting={exiting ? '' : undefined}
        className={cx(
          'fixed inset-y-0 right-0 z-40 flex flex-col items-stretch w-(--size-properties-panel-width) max-w-[100vw]',
          // Docked, not floating: no radius, and the hairline on the one edge
          // that meets the page — an inset SHADOW rather than a border, which
          // would push the rail's content box onto a half pixel.
          'bg-surface shadow-[inset_0.5px_0_0_var(--border-divider),0_4px_16px_color-mix(in_srgb,var(--color-neutral-900)_12%,transparent)]',
          // Fields on the panel's surface take the on-surface fill.
          '[--field-bg:var(--field-bg-on-surface)]',
          // The panel IS the scroll container; the sticky header stays put.
          'overflow-auto overscroll-contain',
          exiting ? 'animate-panel-out' : 'animate-panel-in'
        )}
      >
        {children}
      </div>
    </PanelContext.Provider>,
    document.body
  )
}

export interface PropertiesPanelHeaderProps {
  /** The panel's title. */
  children: ReactNode
  /** Overrides the dismiss button's accessible name. */
  closeLabel?: string
  /**
   * Controls that act on the thing this strip NAMES, drawn before the dismiss
   * button — for a panel whose title is a row rather than a word.
   */
  actions?: ReactNode
}

/** Title over the whole panel, with the control that sends it back to the edge. */
function PropertiesPanelHeader({
  children,
  closeLabel = 'Close properties panel',
  actions
}: PropertiesPanelHeaderProps) {
  const { onDismiss } = usePanel('PropertiesPanel.Header')
  return (
    <div
      className={cx(
        STRIP,
        // Stays put over the sections travelling under it, with its own fill
        // and the panel's edge redrawn (the root's inset hairline paints under
        // an opaque child).
        'sticky top-0 z-1 bg-surface [--field-bg:var(--field-bg-on-surface)]',
        'shadow-[inset_0.5px_0_0_var(--border-divider),inset_0_-0.5px_0_var(--border-divider)]'
      )}
    >
      <Typography
        tag="p"
        type="bodyLarge"
        className="min-w-0 whitespace-nowrap overflow-hidden text-ellipsis"
      >
        {children}
      </Typography>
      {/* A box of its own because the strip is `space-between`: a third child
          would be centred between the title and the button. */}
      <div className="flex items-center gap-0.5">
        {actions}
        <Button aria-label={closeLabel} onClick={onDismiss}>
          <PropertiesPanelDockIcon />
        </Button>
      </div>
    </div>
  )
}

/**
 * The glyph for "this panel". Exported because the control that BRINGS the
 * panel back does not live inside it: it sits on the page's own chrome, and
 * both ends of that one toggle wear this.
 */
function PropertiesPanelDockIcon() {
  return <RightSidebarIcon aria-hidden />
}

export interface PropertiesPanelSectionProps {
  /** Controlled open state. Omit to let the section own it. */
  enabled?: boolean
  /** Initial open state when uncontrolled — typically "the property is set". */
  defaultEnabled?: boolean
  /** Fired when the add/remove button flips the section. */
  onEnabledChange?: (enabled: boolean) => void
  children: ReactNode
}

/**
 * One property group: a header strip and — once enabled — the control panel it
 * mounts. Uncontrolled by default, and that is the load-bearing choice:
 * deriving "open" from the value it edits would make a section close itself
 * the moment its value went empty. Open is a fact about the PANEL; the value
 * is a fact about the document.
 */
function PropertiesPanelSection({
  enabled: enabledProp,
  defaultEnabled = false,
  onEnabledChange,
  children
}: PropertiesPanelSectionProps) {
  usePanel('PropertiesPanel.Section')
  const uid = useId()
  const [internal, setInternal] = useState(defaultEnabled)
  const enabled = enabledProp ?? internal

  const ctx: SectionContextValue = {
    enabled,
    setEnabled: (next) => {
      if (enabledProp === undefined) setInternal(next)
      onEnabledChange?.(next)
    },
    panelId: `${uid}-panel`,
    titleId: `${uid}-title`
  }

  return (
    <SectionContext.Provider value={ctx}>
      <div className={SECTION} data-property-section data-enabled={enabled ? '' : undefined}>
        {children}
      </div>
    </SectionContext.Provider>
  )
}

// Sections are content-sized and the panel scrolls. The divider is a shadow,
// for the reason the root's hairline is one — as a border each one pushed
// every section below it another half pixel down.
const SECTION =
  'shrink-0 flex flex-col items-stretch shadow-[inset_0_-0.5px_0_var(--border-divider)]'

const SECTION_TITLE =
  'flex items-center gap-1 min-w-0 [&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:block'

export interface PropertiesPanelSectionHeaderProps {
  /** Bare `<Icon />`; sized and tinted by the strip. */
  icon?: ReactNode
  /** The section's name — also what the add/remove button is labelled with. */
  children: string
}

/**
 * The section's name and its one control: add to open the section, remove to
 * close it. Both are the SAME button — a section is either open or it is not,
 * and two buttons where one is always inert would be two hit targets for one
 * piece of state.
 */
function PropertiesPanelSectionHeader({ icon, children }: PropertiesPanelSectionHeaderProps) {
  usePanel('PropertiesPanel.SectionHeader')
  const { enabled, setEnabled, panelId, titleId } = useSection('PropertiesPanel.SectionHeader')

  return (
    <div className={STRIP}>
      <div className={SECTION_TITLE}>
        {icon}
        <Typography tag="p" type="bodySmall" id={titleId}>
          {children}
        </Typography>
      </div>
      <Button
        aria-label={`${enabled ? 'Remove' : 'Add'} ${children.toLowerCase()}`}
        aria-expanded={enabled}
        // Only ever points at a panel that exists — a dangling `aria-controls`
        // is worse than none.
        aria-controls={enabled ? panelId : undefined}
        onClick={() => setEnabled(!enabled)}
      >
        {enabled ? <RemoveIcon aria-hidden /> : <AddIcon aria-hidden />}
      </Button>
    </div>
  )
}

/**
 * The control panel's own column, plus the layout it imposes on the rows in
 * it. Every labelled row IS a `Field`, relaid from the field's vertical stack
 * into the panel's label ∣ control ∣ action grid — descendant selectors, so
 * each control keeps its native `htmlFor`/`id` association and the grid wins
 * over the field's own display. The third track is EMPTY and deliberately so:
 * a declared column, so the day a row needs a reset button that button is a
 * third child and nothing here has to move.
 */
const CONTROL_PANEL = cx(
  'flex flex-col items-stretch gap-2 p-3 text-fg-body',
  `[&_[data-property-block]]:${BLOCK_WIDTH}`,
  '[&_[data-property-control]]:grid [&_[data-property-control]]:items-center [&_[data-property-control]]:gap-x-2 [&_[data-property-control]]:w-max',
  '[&_[data-property-control]]:grid-cols-[var(--size-property-row-label)_var(--size-property-row-field)_var(--size-property-row-action)]',
  // The label is a column of the grid now, so it must not also stretch to the
  // field's full width the way the stacked one does.
  '[&_[data-property-control]>label]:w-auto',
  // A row whose control is TALLER than one cell aligns to its first row.
  '[&_[data-property-control][data-control-align=start]]:items-start',
  '[&_[data-property-control][data-control-align=start]>label]:min-h-(--size-toolbar-button) [&_[data-property-control][data-control-align=start]>label]:flex [&_[data-property-control][data-control-align=start]>label]:items-center',
  // A note under a row's field takes a second grid row spanning the field and
  // action tracks.
  '[&_[data-property-control]>[data-property-hint]]:col-[2/-1]',
  // SEVERAL ROWS UNDER ONE ACTION: the rows give their action column up and
  // the tie takes it once, bracketed from each row's midline into the chip.
  '[&_[data-property-tie]]:flex [&_[data-property-tie]]:items-center [&_[data-property-tie]]:gap-2',
  '[&_[data-property-tie-rows]]:flex [&_[data-property-tie-rows]]:flex-col [&_[data-property-tie-rows]]:gap-2 [&_[data-property-tie-rows]]:flex-1 [&_[data-property-tie-rows]]:min-w-0',
  '[&_[data-property-tie]_[data-property-control]]:grid-cols-[var(--size-property-row-label)_var(--size-property-row-field)]',
  '[&_[data-property-tie-action]]:relative [&_[data-property-tie-action]]:flex [&_[data-property-tie-action]]:items-center [&_[data-property-tie-action]]:shrink-0',
  '[&_[data-property-tie-action]]:before:content-[""] [&_[data-property-tie-action]]:before:absolute [&_[data-property-tie-action]]:before:right-[calc(var(--size-toolbar-button)/2)] [&_[data-property-tie-action]]:before:w-[calc(8px+var(--size-toolbar-button)/2)] [&_[data-property-tie-action]]:before:h-1 [&_[data-property-tie-action]]:before:border-field [&_[data-property-tie-action]]:before:border-r [&_[data-property-tie-action]]:before:border-t [&_[data-property-tie-action]]:before:rounded-tr-xs [&_[data-property-tie-action]]:before:bottom-full',
  '[&_[data-property-tie-action]]:after:content-[""] [&_[data-property-tie-action]]:after:absolute [&_[data-property-tie-action]]:after:right-[calc(var(--size-toolbar-button)/2)] [&_[data-property-tie-action]]:after:w-[calc(8px+var(--size-toolbar-button)/2)] [&_[data-property-tie-action]]:after:h-1 [&_[data-property-tie-action]]:after:border-field [&_[data-property-tie-action]]:after:border-r [&_[data-property-tie-action]]:after:border-b [&_[data-property-tie-action]]:after:rounded-br-xs [&_[data-property-tie-action]]:after:top-full'
)

export interface PropertiesPanelGroupProps {
  /** The heading — and the name of the group of controls under it. */
  title: string
  /**
   * Controls that sit AGAINST the heading rather than in the panel below it —
   * the strip's own end, where a `Section` keeps its add/remove button.
   */
  actions?: ReactNode
  children?: ReactNode
}

/**
 * A titled, ALWAYS-ON section: a heading strip over its controls, with no
 * add/remove button in the strip. The one part that does not insist on the
 * panel's context, so a hand-rolled rail over the same classes can hold it.
 */
function PropertiesPanelGroup({ title, actions, children }: PropertiesPanelGroupProps) {
  return (
    <section className={SECTION}>
      <div className={STRIP}>
        <div className={SECTION_TITLE}>
          <Typography tag="p" type="bodySmall">
            {title}
          </Typography>
        </div>
        {actions && <div className="flex items-center gap-0.5">{actions}</div>}
      </div>
      {/* Absent rather than empty for a group that is only a heading. Counted
          rather than tested for truth: a group whose contents are decided per
          render hands down a LIST, and a list is truthy however empty it is. */}
      {Children.toArray(children).length > 0 && (
        <div className={CONTROL_PANEL} role="group" aria-label={title}>
          {children}
        </div>
      )}
    </section>
  )
}

export interface PropertiesPanelControlPanelProps {
  /**
   * Names the group when its section has no {@link PropertiesPanelSectionHeader}
   * to be named by — an always-on section. Omit it whenever there IS a header.
   */
  ariaLabel?: string
  children: ReactNode
}

/** The section's controls — in the DOM only while its section is enabled. */
function PropertiesPanelControlPanel({ ariaLabel, children }: PropertiesPanelControlPanelProps) {
  usePanel('PropertiesPanel.ControlPanel')
  const { enabled, panelId, titleId } = useSection('PropertiesPanel.ControlPanel')
  if (!enabled) return null
  return (
    <div
      id={panelId}
      role="group"
      // One name or the other, never both and never neither.
      aria-label={ariaLabel}
      aria-labelledby={ariaLabel ? undefined : titleId}
      className={CONTROL_PANEL}
    >
      {children}
    </div>
  )
}

export interface PropertiesPanelControlProps {
  /** The row's label, wired to the control by the field's own `htmlFor`. */
  label: ReactNode
  /** A field-family control — Slider, Combobox, ImageInput, Field.Frame, … */
  children: ReactNode
}

/**
 * One labelled row. A real {@link Field}, relaid by the control panel from
 * the field's vertical stack into the panel's label ∣ control grid — so every
 * control keeps the native label association it would have anywhere else.
 */
function PropertiesPanelControl({ label, children }: PropertiesPanelControlProps) {
  usePanel('PropertiesPanel.Control')
  return (
    <Field size="sm" data-property-control>
      <Field.Label>{label}</Field.Label>
      {children}
    </Field>
  )
}

export interface PropertiesPanelTieProps {
  /** The one control the rows are tied to. It stands in the action column the rows give up. */
  action: ReactNode
  /** The rows it is about: two or more {@link PropertiesPanelControl}s. */
  children: ReactNode
}

/**
 * Several rows under ONE action. A row reserves an action column for the chip
 * that acts on THAT row, and a chip about two of them has nowhere honest to
 * stand — so the rows give their action column up, the tie takes it once for
 * the pair, and a bracket says which rows it is about.
 */
function PropertiesPanelTie({ action, children }: PropertiesPanelTieProps) {
  usePanel('PropertiesPanel.Tie')
  return (
    <div data-property-tie>
      <div data-property-tie-rows>{children}</div>
      <div data-property-tie-action>{action}</div>
    </div>
  )
}

export interface PropertiesPanelTextProps {
  value: string
  onValueChange: (value: string) => void
  ariaLabel: string
  placeholder?: string
  /** Lines the box starts at where `field-sizing: content` is unsupported. */
  rows?: number
  className?: string
}

/**
 * Prose filling the control panel rather than a value in a labelled row — the
 * caption case. A `<textarea>` because a caption WRAPS; Enter is declined
 * because the value is still one line of text. It wears no field frame: the
 * section header above it is the label.
 */
function PropertiesPanelText({
  value,
  onValueChange,
  ariaLabel,
  placeholder,
  rows = 3,
  className
}: PropertiesPanelTextProps) {
  usePanel('PropertiesPanel.Text')
  return (
    <textarea
      aria-label={ariaLabel}
      placeholder={placeholder}
      rows={rows}
      value={value}
      className={cx(
        BLOCK_WIDTH,
        'min-w-0 m-0 p-0 bg-transparent border-none resize-none field-sizing-content',
        'text-style-sidenote text-fg-body caret-fg-body placeholder:text-fg-body/40',
        '[html[data-keyboard-focus]_&]:focus-visible:shadow-none',
        className
      )}
      onChange={(event) => onValueChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.preventDefault()
      }}
    />
  )
}

export const PropertiesPanel = Object.assign(PropertiesPanelRoot, {
  Header: PropertiesPanelHeader,
  DockIcon: PropertiesPanelDockIcon,
  Section: PropertiesPanelSection,
  SectionHeader: PropertiesPanelSectionHeader,
  Group: PropertiesPanelGroup,
  ControlPanel: PropertiesPanelControlPanel,
  Control: PropertiesPanelControl,
  Tie: PropertiesPanelTie,
  Text: PropertiesPanelText
})
