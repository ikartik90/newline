import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Notice } from '../notice'

describe('Notice', () => {
  it('composes an icon + label in a row', () => {
    const { container, getByText, getByTestId } = render(
      <Notice>
        <Notice.Icon>
          <svg data-testid="glyph" />
        </Notice.Icon>
        <Notice.Label>Heads up</Notice.Label>
      </Notice>
    )

    const root = container.firstChild as HTMLElement
    expect(root.tagName).toBe('DIV')
    expect(root.contains(getByTestId('glyph'))).toBe(true)
    expect(root.contains(getByText('Heads up'))).toBe(true)
  })

  it('marks the icon decorative so the meaning stays on the label', () => {
    const { getByTestId } = render(
      <Notice>
        <Notice.Icon>
          <svg data-testid="glyph" />
        </Notice.Icon>
        <Notice.Label>Message</Notice.Label>
      </Notice>
    )
    const icon = getByTestId('glyph').parentElement as HTMLElement
    expect(icon.tagName).toBe('SPAN')
    expect(icon.getAttribute('aria-hidden')).toBe('true')
  })

  it('renders the label as a paragraph and keeps its emphasized runs', () => {
    const { getByText } = render(
      <Notice>
        <Notice.Icon>
          <svg />
        </Notice.Icon>
        <Notice.Label>
          Starts on <strong>Tuesday</strong>
        </Notice.Label>
      </Notice>
    )
    const emphasis = getByText('Tuesday')
    expect(emphasis.tagName).toBe('STRONG')
    expect(emphasis.closest('p')).not.toBeNull()
  })

  it('forwards arbitrary attributes (role, aria-live) and a className to the root', () => {
    const { container } = render(
      <Notice role="status" aria-live="polite" className="custom">
        <Notice.Icon>
          <svg />
        </Notice.Icon>
        <Notice.Label>Live</Notice.Label>
      </Notice>
    )
    const root = container.firstChild as HTMLElement
    expect(root.getAttribute('role')).toBe('status')
    expect(root.getAttribute('aria-live')).toBe('polite')
    expect(root.className).toContain('custom')
  })
})
