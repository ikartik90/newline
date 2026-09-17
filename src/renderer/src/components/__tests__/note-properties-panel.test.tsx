import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NotePropertiesPanel } from '../note-properties-panel'

// The docked rail is a primitive with its own suite; here only its slots matter.
vi.mock('@/components/ui/properties-panel', () => {
  const Root = ({
    children,
    onDismiss,
    ariaLabel
  }: {
    children: React.ReactNode
    onDismiss: () => void
    ariaLabel: string
  }) => (
    <aside aria-label={ariaLabel}>
      <button onClick={onDismiss}>close panel</button>
      {children}
    </aside>
  )
  const Slot = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
  const Group = ({ title, children }: { title: string; children?: React.ReactNode }) => (
    <section aria-label={title}>{children}</section>
  )
  return {
    PropertiesPanel: Object.assign(Root, {
      Header: Slot,
      Section: Slot,
      SectionHeader: Slot,
      Group,
      ControlPanel: Slot,
      Control: Slot,
      Tie: Slot,
      Text: Slot
    })
  }
})

function note(tags: string[]): Note {
  return {
    id: 'n1',
    title: 'A note',
    body: '{"type":"doc","content":[]}',
    plainText: '',
    tags,
    createdAt: 1,
    updatedAt: 2,
    lastSyncedAt: null,
    isDeleted: false
  }
}

describe('NotePropertiesPanel', () => {
  it('lists the note’s tags', () => {
    render(
      <NotePropertiesPanel
        note={note(['work', 'ideas'])}
        onTagsChange={vi.fn()}
        onDismiss={vi.fn()}
      />
    )
    expect(screen.getByText('work')).toBeTruthy()
    expect(screen.getByText('ideas')).toBeTruthy()
  })

  it('adds a tag on Enter, trimmed and lowercased, and clears the field', async () => {
    const onTagsChange = vi.fn()
    render(
      <NotePropertiesPanel note={note(['work'])} onTagsChange={onTagsChange} onDismiss={vi.fn()} />
    )
    const input = screen.getByLabelText('Add tag') as HTMLInputElement
    await userEvent.type(input, '  Ideas {enter}')
    expect(onTagsChange).toHaveBeenCalledWith(['work', 'ideas'])
    expect(input.value).toBe('')
  })

  it('ignores an empty or duplicate tag', async () => {
    const onTagsChange = vi.fn()
    render(
      <NotePropertiesPanel note={note(['work'])} onTagsChange={onTagsChange} onDismiss={vi.fn()} />
    )
    const input = screen.getByLabelText('Add tag')
    await userEvent.type(input, '{enter}')
    await userEvent.type(input, 'WORK{enter}')
    expect(onTagsChange).not.toHaveBeenCalled()
  })

  it('also commits a tag on a comma', async () => {
    const onTagsChange = vi.fn()
    render(<NotePropertiesPanel note={note([])} onTagsChange={onTagsChange} onDismiss={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('Add tag'), 'draft,')
    expect(onTagsChange).toHaveBeenCalledWith(['draft'])
  })

  it('removes a tag from its chip', async () => {
    const onTagsChange = vi.fn()
    render(
      <NotePropertiesPanel
        note={note(['work', 'ideas'])}
        onTagsChange={onTagsChange}
        onDismiss={vi.fn()}
      />
    )
    await userEvent.click(screen.getByLabelText('Remove tag work'))
    expect(onTagsChange).toHaveBeenCalledWith(['ideas'])
  })

  it('removes the last tag with Backspace in an empty field', () => {
    const onTagsChange = vi.fn()
    render(
      <NotePropertiesPanel
        note={note(['work', 'ideas'])}
        onTagsChange={onTagsChange}
        onDismiss={vi.fn()}
      />
    )
    fireEvent.keyDown(screen.getByLabelText('Add tag'), { key: 'Backspace' })
    expect(onTagsChange).toHaveBeenCalledWith(['work'])
  })

  it('hands the rail’s dismissal back', async () => {
    const onDismiss = vi.fn()
    render(<NotePropertiesPanel note={note([])} onTagsChange={vi.fn()} onDismiss={onDismiss} />)
    await userEvent.click(screen.getByText('close panel'))
    expect(onDismiss).toHaveBeenCalled()
  })
})
