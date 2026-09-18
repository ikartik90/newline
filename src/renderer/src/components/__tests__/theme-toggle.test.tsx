import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ThemeToggle from '../ThemeToggle'

// ---------------------------------------------------------------------------
// The control is a door: it is named and pictured after the theme on the
// other side, never the one in force, and it never wears a gear — that is the
// settings button beside it.
// ---------------------------------------------------------------------------

describe('ThemeToggle', () => {
  it('offers the dark theme while light is in force', async () => {
    const onChange = vi.fn()
    render(<ThemeToggle theme="light" onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Dark theme' }))
    expect(onChange).toHaveBeenCalledWith('dark')
  })

  it('offers the light theme while dark is in force', async () => {
    const onChange = vi.fn()
    render(<ThemeToggle theme="dark" onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Light theme' }))
    expect(onChange).toHaveBeenCalledWith('light')
  })

  it('is one button with one accessible name', () => {
    render(<ThemeToggle theme="light" onChange={() => {}} />)
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /Theme:/ })).toBeNull()
  })
})
