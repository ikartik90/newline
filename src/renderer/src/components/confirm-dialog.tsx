import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent,
  type SVGProps
} from 'react'
import { Dialog } from '@/components/ui/dialog'
import { useHasCursor } from '@/hooks/use-has-cursor'
import CrossIcon from '@/assets/icons/cross.svg'

// ---------------------------------------------------------------------------
// A question before something that cannot be undone with one click — deleting
// a note, leaving an editor with unsaved work.
//
// Asked in the command palette's shape rather than as a card of buttons: the
// title where the palette's field is, the question under it, and the answers
// as the palette's rows. A footer of three buttons also had nowhere to go at
// 320px but onto two lines each.
//
// The rows run from the answer you most likely want to the one that does
// nothing, each with its key: the affirmative on 1, the alternate on 0, Cancel
// on Esc. The affirmative is highlighted on open, so Enter takes it too.
//
// Usually two answers. `alternate` adds a THIRD, for the one question that
// genuinely has three — leaving an editor with unsaved work, where "save and
// go", "throw it away" and "stay" are all real answers.
// ---------------------------------------------------------------------------

type Icon = ComponentType<SVGProps<SVGSVGElement>>

export interface ConfirmDialogProps {
  open: boolean
  /** The action, named as it appears in the header — e.g. "Delete Note". */
  title: string
  /** The question, in full. Ends with a question mark; the rows answer it. */
  message: string
  /** The affirmative row's label — the verb, never "OK". */
  confirmLabel: string
  /** The affirmative row's glyph — the one the command that asked wears. */
  confirmIcon: Icon
  onConfirm: () => void
  /**
   * A third answer, between the affirmative and Cancel. Absent for the ordinary
   * two-answer question; see the note above for the one that needs it.
   */
  alternate?: { label: string; icon: Icon; onClick: () => void }
  onClose: () => void
}

/** The keys that answer, as `KeyboardEvent.key` reports them. */
const CONFIRM_KEY = '1'
const ALTERNATE_KEY = '0'
const CANCEL_VALUE = 'Cancel'

interface Answer {
  value: string
  icon: Icon
  key: string
  keyLabel: string
  run?: () => void
}

// The `commandHeader` recipe: the palette's top row, with a divider under it.
// Its 12px inset lands the title on the line the row icons sit on (group 4px +
// row 8px).
const headerStyle =
  'flex items-center gap-2 h-10 px-3 border-b-[0.5px] border-divider shrink-0 text-fg-body'
const titleStyle = 'm-0 p-0 text-style-body-sm text-fg-body [font-weight:inherit] text-balance'

// Inset to the header's 12px, so the title, the question and the row icons
// stand on one line; the list's own padding spaces it from the rows.
const messageStyle = 'px-3 pt-2 text-style-body-sm text-fg-body/50 text-pretty'

// `commandList` + `commandGroup`: the column of rows, inset 4px from the panel.
// The listbox holds the focus — there is no field to hold it — and the rows
// show where it is, so it draws no ring of its own.
const listStyle = 'flex flex-col gap-1 py-2 px-1 outline-none'

// The `menuItem` recipe: a 32px row on an 8px inset, washed when highlighted.
const itemStyle =
  'flex items-center w-full gap-2 h-8 px-2 rounded-sm cursor-default text-style-body-sm text-fg-body aria-selected:bg-field-hover'
const iconStyle = 'shrink-0 size-5'

// The row's key, held against the far end of it — the palette's chip, on the
// wash a hovered row wears so the hint sits at the depth of the thing it hints.
const hotkeyStyle =
  'ml-auto flex items-center shrink-0 h-5 px-1 rounded-sm border-[0.5px] border-divider bg-field-hover text-fg-body text-style-caption whitespace-nowrap'

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  confirmIcon,
  onConfirm,
  alternate,
  onClose
}: ConfirmDialogProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const id = useId()
  const messageId = `${id}-message`
  // Chips name keys; a device without a keyboard is shown none, as in the palette.
  const hasCursor = useHasCursor()

  /**
   * The highlighted row, or null for "the affirmative".
   *
   * Null rather than `confirmLabel` because the wording is a prop that changes
   * between questions, and a label captured on one question would highlight
   * nothing on the next. Reset on every close, so each question opens on its
   * affirmative.
   */
  const [selected, setSelected] = useState<string | null>(null)
  useEffect(() => {
    if (!open) setSelected(null)
  }, [open])

  const answers: Answer[] = [
    {
      value: confirmLabel,
      icon: confirmIcon,
      key: CONFIRM_KEY,
      keyLabel: CONFIRM_KEY,
      run: onConfirm
    },
    ...(alternate
      ? [
          {
            value: alternate.label,
            icon: alternate.icon,
            key: ALTERNATE_KEY,
            keyLabel: ALTERNATE_KEY,
            run: alternate.onClick
          }
        ]
      : []),
    // Esc is the Dialog's own — it closes, which is all Cancel does.
    { value: CANCEL_VALUE, icon: CrossIcon, key: 'Escape', keyLabel: 'Esc' }
  ]
  const current = answers.find((answer) => answer.value === selected) ?? answers[0]

  // Every way out — an answer, Cancel, Esc, the backdrop — arrives here, so
  // `onClose` is called exactly once per question.
  function close() {
    setSelected(null)
    onClose()
  }

  function answer(run?: () => void) {
    run?.()
    close()
  }

  function move(step: 1 | -1) {
    const at = answers.indexOf(current)
    const next = answers[(at + step + answers.length) % answers.length]
    setSelected(next.value)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    // ⌘1 / Ctrl 1 switch browser tabs, and are not an answer.
    if (e.metaKey || e.ctrlKey || e.altKey) return
    switch (e.key) {
      case CONFIRM_KEY:
        e.preventDefault()
        answer(onConfirm)
        break
      case ALTERNATE_KEY:
        if (!alternate) return
        e.preventDefault()
        answer(alternate.onClick)
        break
      case 'ArrowDown':
        e.preventDefault()
        move(1)
        break
      case 'ArrowUp':
        e.preventDefault()
        move(-1)
        break
      case 'Enter':
        e.preventDefault()
        answer(current.run)
        break
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      align="top-center"
      justify="center"
      size="sm"
      aria-label={title}
      aria-describedby={messageId}
      // Into the rows, where the arrows, Enter and the digits are read.
      // Nothing in here is otherwise focusable.
      initialFocus={listRef}
    >
      <header className={headerStyle}>
        <h2 className={titleStyle}>{title}</h2>
      </header>

      <p id={messageId} className={messageStyle}>
        {message}
      </p>

      <div
        ref={listRef}
        role="listbox"
        aria-label={title}
        aria-activedescendant={`${id}-${answers.indexOf(current)}`}
        tabIndex={-1}
        className={listStyle}
        onKeyDown={handleKeyDown}
      >
        {answers.map((row, index) => {
          const Glyph = row.icon
          return (
            <div
              key={row.value}
              id={`${id}-${index}`}
              role="option"
              aria-selected={row === current}
              aria-keyshortcuts={row.key}
              data-value={row.value}
              className={itemStyle}
              onPointerMove={() => {
                if (row !== current) setSelected(row.value)
              }}
              onClick={() => answer(row.run)}
            >
              <Glyph className={iconStyle} aria-hidden />
              {row.value}
              {hasCursor && (
                <kbd aria-hidden className={hotkeyStyle}>
                  {row.keyLabel}
                </kbd>
              )}
            </div>
          )
        })}
      </div>
    </Dialog>
  )
}
