import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { PropertiesPanel } from '../properties-panel'
import { Field } from '../input/field'

/** The smallest complete panel: a header and one togglable section. */
function Harness({
  onDismiss = vi.fn(),
  onEnabledChange,
  defaultEnabled = false,
  dismissOnOutsidePointer
}: {
  onDismiss?: () => void
  onEnabledChange?: (enabled: boolean) => void
  defaultEnabled?: boolean
  dismissOnOutsidePointer?: boolean
}) {
  return (
    <PropertiesPanel
      ariaLabel="Media properties"
      onDismiss={onDismiss}
      dismissOnOutsidePointer={dismissOnOutsidePointer}
    >
      <PropertiesPanel.Header>Media Properties</PropertiesPanel.Header>
      <PropertiesPanel.Section defaultEnabled={defaultEnabled} onEnabledChange={onEnabledChange}>
        <PropertiesPanel.SectionHeader>Background</PropertiesPanel.SectionHeader>
        <PropertiesPanel.ControlPanel>
          <PropertiesPanel.Control label="Rotation">
            <Field.Frame>
              <Field.Control defaultValue="90" />
            </Field.Frame>
          </PropertiesPanel.Control>
        </PropertiesPanel.ControlPanel>
      </PropertiesPanel.Section>
    </PropertiesPanel>
  )
}

const toggle = () => screen.getByRole('button', { name: /background$/i })
const panel = () => screen.getByRole('dialog', { name: 'Media properties' })
const isLeaving = () => panel().hasAttribute('data-exiting')

describe('PropertiesPanel', () => {
  it('names itself as a dialog, portalled to the body', () => {
    render(<Harness />)
    expect(panel()).toBeDefined()
    expect(panel().parentElement).toBe(document.body)
  })

  it('makes the page give up its width while docked', () => {
    const { unmount } = render(<Harness />)
    // The rule is `body[data-properties-panel]` in main.css — the panel is
    // fixed to the viewport, so the PAGE is what has to make the room.
    expect(document.body.hasAttribute('data-properties-panel')).toBe(true)

    unmount()
    expect(document.body.hasAttribute('data-properties-panel')).toBe(false)
  })

  it('hands the width back the moment it is dismissed, not when it has gone', async () => {
    render(<Harness />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Close properties panel' }))

    // Still mounted, still sliding out — and the page is already expanding, so
    // the two move together instead of the content snapping open behind it.
    await waitFor(() => expect(document.body.hasAttribute('data-properties-panel')).toBe(false))
    expect(panel()).toBeTruthy()
  })

  it('dismisses from the header', async () => {
    const onDismiss = vi.fn()
    render(<Harness onDismiss={onDismiss} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Close properties panel' }))
    await waitFor(() => expect(onDismiss).toHaveBeenCalledOnce())
  })

  it('dismisses on Escape', async () => {
    const onDismiss = vi.fn()
    render(<Harness onDismiss={onDismiss} />)
    await userEvent.setup().keyboard('{Escape}')
    await waitFor(() => expect(onDismiss).toHaveBeenCalledOnce())
  })

  // `onDismiss` is "it has finished leaving", not "it was asked to leave" —
  // the consumer unmounts on that call, and firing it up front would take the
  // closing slide away with the element playing it.
  it('plays its exit before telling the consumer to unmount it', async () => {
    const onDismiss = vi.fn()
    render(<Harness onDismiss={onDismiss} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Close properties panel' }))

    expect(onDismiss).not.toHaveBeenCalled()
    // Still on screen, sliding out, for the length of the slide.
    expect(isLeaving()).toBe(true)
    expect(panel().className).toMatch(/animate-panel-out/)

    await waitFor(() => expect(onDismiss).toHaveBeenCalledOnce())
  })

  it('closes through its handle, the way the trigger that opened it asks', async () => {
    const onDismiss = vi.fn()
    const ref = { current: null as { dismiss: () => void } | null }
    render(
      <PropertiesPanel ariaLabel="Media properties" onDismiss={onDismiss} ref={ref}>
        <PropertiesPanel.Header>Media Properties</PropertiesPanel.Header>
      </PropertiesPanel>
    )
    fireEvent.click(document.body) // nothing yet
    expect(isLeaving()).toBe(false)
    ref.current!.dismiss()
    await waitFor(() => expect(isLeaving()).toBe(true))
    await waitFor(() => expect(onDismiss).toHaveBeenCalledOnce())
  })

  // A panel docked beside the thing it edits is usually transient — press the
  // canvas and it goes. A panel that IS the page's settings is not.
  it('closes on an outside press by default', () => {
    render(<Harness />)
    fireEvent.pointerDown(document.body)
    expect(isLeaving()).toBe(true)
  })

  it('holds through an outside press when told to', () => {
    render(<Harness dismissOnOutsidePointer={false} />)
    fireEvent.pointerDown(document.body)
    expect(isLeaving()).toBe(false)

    // Escape is not what was withdrawn — a dialog still has to be escapable.
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(isLeaving()).toBe(true)
  })

  it('exempts the control that opened it from the outside press', () => {
    render(
      <>
        <button type="button" data-properties-trigger>
          Toggle
        </button>
        <Harness />
      </>
    )
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Toggle' }))
    expect(isLeaving()).toBe(false)
  })

  // Escape, the header and an outside press all reach the same close, so a
  // second one arriving mid-slide must not queue a second dismissal.
  it('only finishes leaving once', async () => {
    const onDismiss = vi.fn()
    const user = userEvent.setup()
    render(<Harness onDismiss={onDismiss} />)
    await user.click(screen.getByRole('button', { name: 'Close properties panel' }))
    await user.keyboard('{Escape}')

    await waitFor(() => expect(onDismiss).toHaveBeenCalled())
    expect(onDismiss).toHaveBeenCalledOnce()
  })
})

describe('PropertiesPanel.Header', () => {
  // The strip is `space-between` — a title at one end, the dismiss button at
  // the other — so an action put in it has to join the button rather than
  // become a third child floating between them. What a test can see of that is
  // the order: title, then whatever was given, then the way out.
  it('draws its actions before the control that sends the panel away', () => {
    render(
      <PropertiesPanel ariaLabel="Media properties" onDismiss={() => {}}>
        <PropertiesPanel.Header actions={<button type="button">Publish</button>}>
          Ada Lovelace
        </PropertiesPanel.Header>
      </PropertiesPanel>
    )

    const names = screen
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label') ?? button.textContent)
    expect(names).toEqual(['Publish', 'Close properties panel'])
  })

  it('is the title and the way out when it is given no actions', () => {
    render(<Harness />)
    expect(screen.getAllByRole('button')).toHaveLength(2) // dismiss + section
  })
})

describe('PropertiesPanel.Section', () => {
  // Mounted, not hidden: a collapsed section must hold no focusable control to
  // tab into and no stale value to read back.
  it('keeps its control panel out of the DOM until it is enabled', async () => {
    render(<Harness />)
    expect(screen.queryByRole('group', { name: 'Background' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'Rotation' })).toBeNull()

    await userEvent.setup().click(toggle())

    expect(screen.getByRole('group', { name: 'Background' })).toBeDefined()
    expect(screen.getByRole('textbox', { name: 'Rotation' })).toBeDefined()
  })

  it('takes the control panel away again when it is removed', async () => {
    const user = userEvent.setup()
    render(<Harness defaultEnabled />)
    expect(screen.getByRole('textbox', { name: 'Rotation' })).toBeDefined()

    await user.click(toggle())

    expect(screen.queryByRole('textbox', { name: 'Rotation' })).toBeNull()
  })

  it('renames its one button to say what it will do next', async () => {
    render(<Harness />)
    expect(screen.getByRole('button', { name: 'Add background' })).toBeDefined()

    await userEvent.setup().click(toggle())

    expect(screen.getByRole('button', { name: 'Remove background' })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Add background' })).toBeNull()
  })

  it('publishes the open state, and points at the panel only once it exists', async () => {
    render(<Harness />)
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
    expect(toggle().getAttribute('aria-controls')).toBeNull()

    await userEvent.setup().click(toggle())

    expect(toggle().getAttribute('aria-expanded')).toBe('true')
    const controls = toggle().getAttribute('aria-controls')
    expect(controls).toBeTruthy()
    expect(document.getElementById(controls!)).toBe(
      screen.getByRole('group', { name: 'Background' })
    )
  })

  it('reports every flip', async () => {
    const onEnabledChange = vi.fn()
    const user = userEvent.setup()
    render(<Harness onEnabledChange={onEnabledChange} />)

    await user.click(toggle())
    await user.click(toggle())

    expect(onEnabledChange.mock.calls).toEqual([[true], [false]])
  })

  it('opens from the default without being told again', () => {
    render(<Harness defaultEnabled />)
    expect(screen.getByRole('group', { name: 'Background' })).toBeDefined()
  })

  it('defers to a controlled `enabled`', async () => {
    function Controlled() {
      const [enabled, setEnabled] = useState(false)
      return (
        <PropertiesPanel ariaLabel="Media properties" onDismiss={vi.fn()}>
          <PropertiesPanel.Section enabled={enabled} onEnabledChange={setEnabled}>
            <PropertiesPanel.SectionHeader>Background</PropertiesPanel.SectionHeader>
            <PropertiesPanel.ControlPanel>
              <PropertiesPanel.Control label="Rotation">
                <Field.Frame>
                  <Field.Control defaultValue="90" />
                </Field.Frame>
              </PropertiesPanel.Control>
            </PropertiesPanel.ControlPanel>
          </PropertiesPanel.Section>
        </PropertiesPanel>
      )
    }
    render(<Controlled />)
    expect(screen.queryByRole('textbox', { name: 'Rotation' })).toBeNull()

    await userEvent.setup().click(toggle())

    expect(screen.getByRole('textbox', { name: 'Rotation' })).toBeDefined()
  })

  it('stays shut when a controlled owner declines the flip', async () => {
    render(
      <PropertiesPanel ariaLabel="Media properties" onDismiss={vi.fn()}>
        <PropertiesPanel.Section enabled={false} onEnabledChange={vi.fn()}>
          <PropertiesPanel.SectionHeader>Background</PropertiesPanel.SectionHeader>
          <PropertiesPanel.ControlPanel>
            <PropertiesPanel.Control label="Rotation">
              <Field.Frame>
                <Field.Control defaultValue="90" />
              </Field.Frame>
            </PropertiesPanel.Control>
          </PropertiesPanel.ControlPanel>
        </PropertiesPanel.Section>
      </PropertiesPanel>
    )

    await userEvent.setup().click(toggle())

    expect(screen.queryByRole('textbox', { name: 'Rotation' })).toBeNull()
  })

  it('keeps sections independent of one another', async () => {
    render(
      <PropertiesPanel ariaLabel="Media properties" onDismiss={vi.fn()}>
        <PropertiesPanel.Section>
          <PropertiesPanel.SectionHeader>Caption</PropertiesPanel.SectionHeader>
          <PropertiesPanel.ControlPanel>
            <PropertiesPanel.Control label="Text">
              <Field.Frame>
                <Field.Control />
              </Field.Frame>
            </PropertiesPanel.Control>
          </PropertiesPanel.ControlPanel>
        </PropertiesPanel.Section>
        <PropertiesPanel.Section>
          <PropertiesPanel.SectionHeader>Background</PropertiesPanel.SectionHeader>
          <PropertiesPanel.ControlPanel>
            <PropertiesPanel.Control label="Rotation">
              <Field.Frame>
                <Field.Control />
              </Field.Frame>
            </PropertiesPanel.Control>
          </PropertiesPanel.ControlPanel>
        </PropertiesPanel.Section>
      </PropertiesPanel>
    )

    await userEvent.setup().click(screen.getByRole('button', { name: 'Add caption' }))

    expect(screen.getByRole('textbox', { name: 'Text' })).toBeDefined()
    expect(screen.queryByRole('textbox', { name: 'Rotation' })).toBeNull()
  })

  it('names an always-on control panel itself, having no header to be named by', () => {
    render(
      <PropertiesPanel ariaLabel="Media properties" onDismiss={vi.fn()}>
        <PropertiesPanel.Section enabled>
          <PropertiesPanel.ControlPanel ariaLabel="Content">
            <PropertiesPanel.Control label="Rotation">
              <Field.Frame>
                <Field.Control />
              </Field.Frame>
            </PropertiesPanel.Control>
          </PropertiesPanel.ControlPanel>
        </PropertiesPanel.Section>
      </PropertiesPanel>
    )
    expect(screen.getByRole('group', { name: 'Content' })).toBeTruthy()
  })
})

describe('PropertiesPanel.Control', () => {
  // The row is a real Field — so the label keeps the native association it
  // would have anywhere else, rather than an aria-label hand-written per row.
  it('associates its label with the control it wraps', () => {
    render(<Harness defaultEnabled />)
    const input = screen.getByRole('textbox', { name: 'Rotation' })
    const label = screen.getByText('Rotation')
    expect(label.getAttribute('for')).toBe(input.getAttribute('id'))
    expect(input.closest('[data-property-control]')).not.toBeNull()
  })
})

describe('PropertiesPanel.Text', () => {
  function TextHarness({ onValueChange }: { onValueChange: (v: string) => void }) {
    const [value, setValue] = useState('')
    return (
      <PropertiesPanel ariaLabel="Media properties" onDismiss={vi.fn()}>
        <PropertiesPanel.Section defaultEnabled>
          <PropertiesPanel.SectionHeader>Caption</PropertiesPanel.SectionHeader>
          <PropertiesPanel.ControlPanel>
            <PropertiesPanel.Text
              ariaLabel="Image caption"
              value={value}
              onValueChange={(next) => {
                setValue(next)
                onValueChange(next)
              }}
            />
          </PropertiesPanel.ControlPanel>
        </PropertiesPanel.Section>
      </PropertiesPanel>
    )
  }

  it('reports every keystroke', async () => {
    const onValueChange = vi.fn()
    render(<TextHarness onValueChange={onValueChange} />)
    await userEvent.setup().type(screen.getByRole('textbox', { name: 'Image caption' }), 'Hi')
    expect(onValueChange.mock.calls.at(-1)).toEqual(['Hi'])
  })

  // It wraps because a caption wraps, but the value is still one line: Enter
  // must not smuggle a newline into it.
  it('declines Enter', async () => {
    const onValueChange = vi.fn()
    render(<TextHarness onValueChange={onValueChange} />)
    const field = screen.getByRole('textbox', { name: 'Image caption' })
    await userEvent.setup().type(field, 'One{Enter}Two')
    expect((field as HTMLTextAreaElement).value).toBe('OneTwo')
  })
})

describe('PropertiesPanel parts outside their parent', () => {
  it('says which part was misplaced', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<PropertiesPanel.Header>Orphan</PropertiesPanel.Header>)).toThrow(
      /PropertiesPanel.Header must be used within <PropertiesPanel>/
    )
    spy.mockRestore()
  })

  it('says which part was misplaced outside a section', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() =>
      render(
        <PropertiesPanel ariaLabel="Media properties" onDismiss={vi.fn()}>
          <PropertiesPanel.SectionHeader>Loose</PropertiesPanel.SectionHeader>
        </PropertiesPanel>
      )
    ).toThrow(/must be used within <PropertiesPanel.Section>/)
    spy.mockRestore()
  })
})

// A GROUP is the always-on, titled section: a heading strip over its controls
// with nothing to add or remove.
describe('PropertiesPanel.Group', () => {
  it('is a titled section whose controls form a group named by the title', () => {
    render(
      <PropertiesPanel ariaLabel="Film properties" onDismiss={vi.fn()}>
        <PropertiesPanel.Group title="Foil">
          <PropertiesPanel.Control label="Grain">
            <Field.Frame>
              <Field.Control defaultValue="10" />
            </Field.Frame>
          </PropertiesPanel.Control>
        </PropertiesPanel.Group>
      </PropertiesPanel>
    )

    const group = screen.getByRole('group', { name: 'Foil' })
    expect(within(group).getByRole('textbox', { name: 'Grain' })).toBeTruthy()
    // Nothing to add or remove: the strip carries no toggle.
    expect(screen.queryByRole('button', { name: /foil$/i })).toBeNull()
  })

  it('seats actions against the heading, and draws no panel for a heading-only group', () => {
    render(
      <PropertiesPanel ariaLabel="Film properties" onDismiss={vi.fn()}>
        <PropertiesPanel.Group title="Actions" actions={<button type="button">Reset</button>} />
      </PropertiesPanel>
    )

    expect(screen.getByRole('button', { name: 'Reset' })).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'Actions' })).toBeNull()
  })

  it('draws no panel for a group whose children come to nothing', () => {
    // A group whose contents are decided per render hands down a LIST —
    // `[false, []]` — and a list is truthy however empty it is.
    const nothing: boolean[] = []
    render(
      <PropertiesPanel ariaLabel="Film properties" onDismiss={vi.fn()}>
        <PropertiesPanel.Group title="Aliases" actions={<button type="button">Add</button>}>
          {false}
          {nothing.map((_, at) => (
            <span key={at} />
          ))}
        </PropertiesPanel.Group>
      </PropertiesPanel>
    )

    expect(screen.getByRole('button', { name: 'Add' })).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'Aliases' })).toBeNull()
  })

  it('stands on its own outside a panel', () => {
    render(
      <PropertiesPanel.Group title="Foil">
        <span>a control</span>
      </PropertiesPanel.Group>
    )
    expect(screen.getByRole('group', { name: 'Foil' })).toBeTruthy()
  })
})

// A TIE is ONE control standing against SEVERAL rows — the icon set's size
// and stroke, which move together.
describe('PropertiesPanel.Tie', () => {
  const tied = () =>
    render(
      <PropertiesPanel ariaLabel="Icon properties" onDismiss={vi.fn()}>
        <PropertiesPanel.Group title="Icon">
          <PropertiesPanel.Tie action={<button type="button">Link size and stroke</button>}>
            <PropertiesPanel.Control label="Size">
              <Field.Frame>
                <Field.Control defaultValue="64" />
              </Field.Frame>
            </PropertiesPanel.Control>
            <PropertiesPanel.Control label="Stroke">
              <Field.Frame>
                <Field.Control defaultValue="4" />
              </Field.Frame>
            </PropertiesPanel.Control>
          </PropertiesPanel.Tie>
        </PropertiesPanel.Group>
      </PropertiesPanel>
    )

  it('stands its action beside the rows, in neither of them', () => {
    tied()

    const rows = ['Size', 'Stroke'].map(
      (name) =>
        screen.getByRole('textbox', { name }).closest('[data-property-control]') as HTMLElement
    )
    for (const row of rows) expect(within(row).queryByRole('button')).toBeNull()

    const tie = screen
      .getByRole('button', { name: 'Link size and stroke' })
      .closest('[data-property-tie]') as HTMLElement
    expect(tie).toBeTruthy()
    for (const row of rows) expect(tie.contains(row)).toBe(true)
  })

  it('keeps the rows inside the group the panel names', () => {
    tied()

    const group = screen.getByRole('group', { name: 'Icon' })
    expect(within(group).getByRole('textbox', { name: 'Size' })).toBeTruthy()
    expect(within(group).getByRole('textbox', { name: 'Stroke' })).toBeTruthy()
  })

  it("insists on the panel's context, as every row-level part does", () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<PropertiesPanel.Tie action={null}>rows</PropertiesPanel.Tie>)).toThrow(
      /must be used within <PropertiesPanel>/
    )
    spy.mockRestore()
  })
})
