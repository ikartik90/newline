import { createRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Link } from '../link'
import { Tooltip } from '../tooltip'

describe('Link', () => {
  it('renders an anchor with the href and no target of its own', () => {
    render(
      <Link href="/about">
        <Link.Text>About</Link.Text>
      </Link>
    )
    const link = screen.getByRole('link', { name: 'About' })
    expect(link.getAttribute('href')).toBe('/about')
    expect(link.hasAttribute('target')).toBe(false)
    expect(link.dataset.variant).toBe('text')
  })

  it('never ships a target=_blank without the reverse-tabnabbing guard', () => {
    render(
      <Link href="https://github.com/x" target="_blank" aria-label="GitHub">
        <svg />
      </Link>
    )
    const link = screen.getByRole('link', { name: 'GitHub' })
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(link.dataset.variant).toBe('icon')
    expect(link.dataset.emphasis).toBe('tertiary')
  })

  it('keeps a caller-provided rel', () => {
    render(
      <Link href="https://x.com" target="_blank" rel="me" aria-label="Me">
        <svg />
      </Link>
    )
    expect(screen.getByRole('link', { name: 'Me' }).getAttribute('rel')).toBe('me')
  })

  it('forwards ref to the anchor', () => {
    const ref = createRef<HTMLAnchorElement>()
    render(
      <Link href="/" ref={ref}>
        Home
      </Link>
    )
    expect(ref.current?.tagName).toBe('A')
  })

  it('takes the inline link look on request', () => {
    render(
      <Link href="/" variant="link">
        Home
      </Link>
    )
    expect(screen.getByRole('link', { name: 'Home' }).dataset.variant).toBe('link')
  })

  it('hosts a cursor-following tooltip on hover', () => {
    render(
      <Link href="https://github.com/x" target="_blank" aria-label="GitHub">
        <svg />
        <Link.Tooltip>
          <Tooltip.Text>GitHub</Tooltip.Text>
          <svg />
        </Link.Tooltip>
      </Link>
    )
    const link = screen.getByRole('link', { name: 'GitHub' })
    const tip = screen.getByText('GitHub').parentElement as HTMLElement
    expect(tip.getAttribute('aria-hidden')).toBe('true')
    expect(tip.hasAttribute('data-open')).toBe(false)
    // Hosting the tooltip leaves the anchor an anchor — no button attributes.
    expect(link.tagName).toBe('A')
    expect(link.hasAttribute('type')).toBe(false)
    expect(link.hasAttribute('role')).toBe(false)

    fireEvent.pointerEnter(link, { pointerType: 'mouse', clientX: 5, clientY: 5 })
    expect(tip.hasAttribute('data-open')).toBe(true)

    fireEvent.pointerLeave(link, { pointerType: 'mouse' })
    expect(tip.hasAttribute('data-open')).toBe(false)
  })

  it('leaves the tooltip down for a finger', () => {
    render(
      <Link href="https://github.com/x" target="_blank" aria-label="GitHub">
        <svg />
        <Link.Tooltip>
          <Tooltip.Text>GitHub</Tooltip.Text>
          <svg />
        </Link.Tooltip>
      </Link>
    )
    const link = screen.getByRole('link', { name: 'GitHub' })
    const tip = screen.getByText('GitHub').parentElement as HTMLElement

    fireEvent.pointerEnter(link, { pointerType: 'touch', clientX: 5, clientY: 5 })
    fireEvent.mouseEnter(link, { clientX: 5, clientY: 5 })
    fireEvent.click(link)
    expect(tip.hasAttribute('data-open')).toBe(false)
  })
})
