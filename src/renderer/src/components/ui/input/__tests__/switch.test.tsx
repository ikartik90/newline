import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Field } from '../field'
import { Switch } from '../switch'

describe('Switch', () => {
  it('exposes switch role, takes its Field.Label as the accessible name, and is off by default', () => {
    render(
      <Field>
        <Switch />
        <Field.Label>Wi-Fi</Field.Label>
      </Field>
    )
    const sw = screen.getByRole('switch', { name: 'Wi-Fi' })
    expect((sw as HTMLInputElement).checked).toBe(false)
  })

  // A native checkbox in the switch role: checked state, label and Space are the browser's.
  it('is a native checkbox in the switch role', () => {
    render(
      <Field>
        <Switch />
        <Field.Label>Wi-Fi</Field.Label>
      </Field>
    )
    const sw = screen.getByRole('switch') as HTMLInputElement
    expect(sw.tagName).toBe('INPUT')
    expect(sw.type).toBe('checkbox')
    expect(sw.hasAttribute('aria-checked')).toBe(false)
    fireEvent.click(screen.getByText('Wi-Fi'))
    expect(sw.checked).toBe(true)
  })

  // See Button: WebKit's default tab order skips a bare <button>, so every
  // control drawn as one states its own place in it.
  it('states its own place in the tab order', () => {
    render(
      <Field>
        <Switch />
        <Field.Label>Wi-Fi</Field.Label>
      </Field>
    )
    expect(screen.getByRole('switch', { name: 'Wi-Fi' }).getAttribute('tabindex')).toBe('0')
  })

  it('toggles and reports each change when uncontrolled', () => {
    const onCheckedChange = vi.fn()
    render(
      <Field>
        <Switch onCheckedChange={onCheckedChange} />
        <Field.Label>Wi-Fi</Field.Label>
      </Field>
    )
    const sw = screen.getByRole('switch')

    fireEvent.click(sw)
    expect((sw as HTMLInputElement).checked).toBe(true)
    expect(onCheckedChange).toHaveBeenLastCalledWith(true)

    fireEvent.click(sw)
    expect((sw as HTMLInputElement).checked).toBe(false)
    expect(onCheckedChange).toHaveBeenLastCalledWith(false)
  })

  it('honors defaultChecked', () => {
    render(
      <Field>
        <Switch defaultChecked />
        <Field.Label>Wi-Fi</Field.Label>
      </Field>
    )
    expect((screen.getByRole('switch') as HTMLInputElement).checked).toBe(true)
  })

  it('is controlled by `checked` — a click reports intent but never self-updates', () => {
    const onCheckedChange = vi.fn()
    const { rerender } = render(
      <Field>
        <Switch checked={false} onCheckedChange={onCheckedChange} />
        <Field.Label>Wi-Fi</Field.Label>
      </Field>
    )
    const sw = screen.getByRole('switch')

    fireEvent.click(sw)
    expect(onCheckedChange).toHaveBeenCalledWith(true)
    expect((sw as HTMLInputElement).checked).toBe(false) // parent still owns state

    rerender(
      <Field>
        <Switch checked onCheckedChange={onCheckedChange} />
        <Field.Label>Wi-Fi</Field.Label>
      </Field>
    )
    expect((sw as HTMLInputElement).checked).toBe(true)
  })

  it('links a Field.Hint through aria-describedby, and omits it when there is none', () => {
    const { rerender } = render(
      <Field>
        <Switch />
        <Field.Label>Wi-Fi</Field.Label>
        <Field.Hint>Connect automatically</Field.Hint>
      </Field>
    )
    const sw = screen.getByRole('switch')
    const id = sw.getAttribute('aria-describedby')
    expect(id).toBeTruthy()
    expect(document.getElementById(id!)?.textContent).toBe('Connect automatically')

    rerender(
      <Field>
        <Switch />
        <Field.Label>Wi-Fi</Field.Label>
      </Field>
    )
    expect(sw.getAttribute('aria-describedby')).toBeNull()
  })

  // The track is drawn at sm and lg; a size-less switch in a default (md)
  // field takes the full geometry, and an explicit `size` overrides the field.
  it('takes its geometry from the field, or from its own size prop', () => {
    const { rerender } = render(
      <Field>
        <Switch />
        <Field.Label>Wi-Fi</Field.Label>
      </Field>
    )
    expect(screen.getByRole('switch').getAttribute('data-size')).toBe('lg')

    rerender(
      <Field size="sm">
        <Switch />
        <Field.Label>Wi-Fi</Field.Label>
      </Field>
    )
    expect(screen.getByRole('switch').getAttribute('data-size')).toBe('sm')

    rerender(
      <Field size="sm">
        <Switch size="md" />
        <Field.Label>Wi-Fi</Field.Label>
      </Field>
    )
    expect(screen.getByRole('switch').getAttribute('data-size')).toBe('md')
  })

  it('throws when rendered outside <Field>', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Switch />)).toThrow(/must be used within <Field>/)
    spy.mockRestore()
  })
  // jsdom lays nothing out, so the geometry is read from the classes, each a
  // step of the 4px spacing scale: the thumb (the track's ::before) sits inset
  // alike on every side, off and on.
  it.each(['sm', 'md', 'lg'] as const)('rests the %s thumb as far from either end', (size) => {
    render(
      <Field>
        <Switch size={size} />
        <Field.Label>Wi-Fi</Field.Label>
      </Field>
    )
    const track = screen.getByRole('switch')
    const step = (className: string, prefix: string) => {
      const match = new RegExp(`(?:^|\\s)${prefix}-([\\d.]+)(?:\\s|$)`).exec(className)
      if (!match) throw new Error(`no ${prefix}- in "${className}"`)
      return Number(match[1]) * 4
    }
    const width = step(track.className, 'w')
    const height = step(track.className, 'h')
    const knob = step(track.className, 'before:size')
    const inset = step(track.className, 'before:left')
    const travel = step(track.className, 'checked:before:translate-x')
    expect(step(track.className, 'before:top')).toBe(inset)
    expect(height).toBe(knob + 2 * inset)
    expect(inset + travel + knob).toBe(width - inset)
  })
})
