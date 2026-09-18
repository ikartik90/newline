import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Typography, typographyStyles } from '../typography'

const classes = (cls: string) => cls.split(/\s+/).filter(Boolean)

describe('typographyStyles', () => {
  it('gives a title its own text style, ink and balanced wrapping', () => {
    const cls = classes(typographyStyles({ type: 'title' }))
    expect(cls).toContain('text-style-title')
    expect(cls).toContain('text-fg-title')
    expect(cls).toContain('[text-wrap:balance]')
    // One colour and one wrap — the base's are replaced, not stacked beside.
    expect(cls).not.toContain('text-fg')
    expect(cls).not.toContain('[text-wrap:pretty]')
  })

  it('sets body prose in the body ink with pretty wrapping', () => {
    const large = classes(typographyStyles({ type: 'bodyLarge' }))
    expect(large).toContain('text-style-body-lg')
    expect(large).toContain('text-fg-body')
    expect(large).toContain('[text-wrap:pretty]')

    const small = classes(typographyStyles({ type: 'bodySmall' }))
    expect(small).toContain('text-style-body-sm')
    expect(small).toContain('text-fg-body')
  })

  it('balances a caption and a subheading, keeps a quote and a sidenote pretty', () => {
    expect(classes(typographyStyles({ type: 'caption' }))).toContain('[text-wrap:balance]')
    expect(classes(typographyStyles({ type: 'subheading' }))).toContain('[text-wrap:balance]')
    expect(classes(typographyStyles({ type: 'quote' }))).toContain('[text-wrap:pretty]')
    expect(classes(typographyStyles({ type: 'sidenote' }))).toContain('[text-wrap:pretty]')
    expect(classes(typographyStyles({ type: 'quote' }))).toContain('text-fg')
  })

  it('lets a caller ask for balanced lines on a type that wraps pretty', () => {
    const cls = classes(typographyStyles({ type: 'bodySmall', wrap: 'balance' }))
    expect(cls).toContain('[text-wrap:balance]')
    expect(cls).not.toContain('[text-wrap:pretty]')
  })
})

describe('Typography', () => {
  it('renders the requested tag with the type styles and a merged className', () => {
    render(
      <Typography tag="h2" type="subheading" className="custom" id="heading">
        Section
      </Typography>
    )
    const heading = screen.getByRole('heading', { level: 2, name: 'Section' })
    expect(heading.className).toContain('text-style-subheading')
    expect(heading.className).toContain('custom')
    expect(heading.id).toBe('heading')
  })

  it('renders a caption as a figcaption', () => {
    const { container } = render(
      <Typography tag="figcaption" type="caption">
        A caption
      </Typography>
    )
    expect(container.querySelector('figcaption')?.textContent).toBe('A caption')
  })
})
