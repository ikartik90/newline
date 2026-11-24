import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Field } from '../field'
import { Checkbox } from '../checkbox'

// Field.Search is a deliberately DUMB search box: it emits nothing but the raw
// query string. Interpreting that query — filtering a list — is the container's
// job (OptionList's `filter`), since only the container holds what the query is
// matched against. These specs pin that the box itself carries no interpretation.
describe('Field.Search', () => {
  const typeInto = (value: string) =>
    fireEvent.input(screen.getByRole('searchbox'), { target: { value } })

  it('emits the raw query string on every keystroke', () => {
    const onValueChange = vi.fn()
    render(<Field.Search onValueChange={onValueChange} />)
    typeInto('dec')
    expect(onValueChange).toHaveBeenCalledWith('dec')
  })

  it("composes a consumer's own onInput without swallowing it", () => {
    const onInput = vi.fn()
    const onValueChange = vi.fn()
    render(<Field.Search onInput={onInput} onValueChange={onValueChange} />)
    typeInto('hi')
    expect(onInput).toHaveBeenCalled()
    expect(onValueChange).toHaveBeenCalledWith('hi')
  })
})

describe('Field', () => {
  // The shell is cornered as a text button is.
  it('corners its frame at 12px', () => {
    render(
      <Field size="sm">
        <Field.Frame data-testid="frame">
          <Field.Control />
        </Field.Frame>
      </Field>
    )
    const classes = screen.getByTestId('frame').className.split(/\s+/)
    expect(classes).toContain('rounded-lg')
    expect(classes).not.toContain('rounded-sm')
  })

  it('marks its root with data-field and forwards the size to every slot', () => {
    render(
      <Field size="sm" data-testid="root">
        <Field.Label>Label</Field.Label>
        <Field.Frame>
          <Field.Control />
        </Field.Frame>
        <Field.Hint>Hint</Field.Hint>
      </Field>
    )
    expect(screen.getByTestId('root').hasAttribute('data-field')).toBe(true)
    expect(screen.getByRole('textbox').getAttribute('data-size')).toBe('sm')
    expect(screen.getByText('Label').getAttribute('data-size')).toBe('sm')
    expect(screen.getByText('Hint').getAttribute('data-size')).toBe('sm')
  })

  // A label over its control is a label; one beside it reads as the text it
  // stands with, so it takes the control's text style and resting ink.
  it('sets a stacked label smaller than its control, in the muted ink', () => {
    render(
      <Field size="sm">
        <Field.Label>Title</Field.Label>
        <Field.Frame>
          <Field.Control />
        </Field.Frame>
      </Field>
    )
    const classes = screen.getByText('Title').className.split(/\s+/)
    expect(classes).toEqual(expect.arrayContaining(['text-style-sidenote', 'text-ink-field-muted']))
    expect(classes).not.toContain('text-style-body-sm')
    expect(classes).not.toContain('text-ink-field-default')
  })

  // The smallest text style there is: a small field's label is set in it too.
  it("sets a small field's hint in the sidenote style", () => {
    render(
      <Field size="sm">
        <Field.Label>Title</Field.Label>
        <Field.Frame>
          <Field.Control />
        </Field.Frame>
        <Field.Hint>Shown in the sidebar</Field.Hint>
      </Field>
    )
    expect(screen.getByText('Shown in the sidebar').className.split(/\s+/)).toContain(
      'text-style-sidenote'
    )
  })

  it('sets an inline label as its control is, in the resting ink', () => {
    render(
      <Field size="sm" inlineLabel>
        <Field.Label>Rotation</Field.Label>
        <Field.Frame>
          <Field.Control />
        </Field.Frame>
      </Field>
    )
    const classes = screen.getByText('Rotation').className.split(/\s+/)
    expect(classes).toEqual(
      expect.arrayContaining(['text-style-body-sm', 'text-ink-field-default'])
    )
    expect(classes).not.toContain('text-style-sidenote')
    expect(classes).not.toContain('text-ink-field-muted')
    expect(screen.getByRole('textbox').className.split(/\s+/)).toContain('text-style-body-sm')
  })

  it('sets a toggle’s label, beside it, as an inline one', () => {
    render(
      <Field size="sm">
        <Checkbox />
        <Field.Label>Wi-Fi</Field.Label>
      </Field>
    )
    const classes = screen.getByText('Wi-Fi').className.split(/\s+/)
    expect(classes).toEqual(
      expect.arrayContaining(['text-style-body-sm', 'text-ink-field-default'])
    )
    expect(classes).not.toContain('text-style-sidenote')
    expect(classes).not.toContain('text-ink-field-muted')
    // The box is nudged onto the label's first line, so it reads the same line box.
    expect(screen.getByRole('checkbox').className.split(/\s+/)).toContain('text-style-body-sm')
  })

  it('throws a named error for a part used outside <Field>', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Field.Label>Loose</Field.Label>)).toThrow(
      /Field.Label must be used within <Field>/
    )
    spy.mockRestore()
  })
})
