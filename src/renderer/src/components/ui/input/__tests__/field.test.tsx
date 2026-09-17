import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Field } from '../field'

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

  it('throws a named error for a part used outside <Field>', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Field.Label>Loose</Field.Label>)).toThrow(
      /Field.Label must be used within <Field>/
    )
    spy.mockRestore()
  })
})
