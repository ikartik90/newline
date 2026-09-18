import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { MediaFit } from '@shared/domain/nodes'
import { MediaPropertiesPanel } from '../media-properties-panel'

function setup(
  props: Partial<{
    caption: string | undefined
    objectFit: MediaFit | undefined
    padding: number | undefined
    borderRadius: number | undefined
  }> = {}
) {
  const onCaptionChange = vi.fn()
  const onObjectFitChange = vi.fn()
  const onPaddingChange = vi.fn()
  const onBorderRadiusChange = vi.fn()
  const onDismiss = vi.fn()
  render(
    <MediaPropertiesPanel
      caption={props.caption}
      objectFit={props.objectFit}
      padding={props.padding}
      borderRadius={props.borderRadius}
      onCaptionChange={onCaptionChange}
      onObjectFitChange={onObjectFitChange}
      onPaddingChange={onPaddingChange}
      onBorderRadiusChange={onBorderRadiusChange}
      onDismiss={onDismiss}
    />
  )
  return {
    onCaptionChange,
    onObjectFitChange,
    onPaddingChange,
    onBorderRadiusChange,
    onDismiss,
    user: userEvent.setup()
  }
}

const layoutPanel = () => screen.getByRole('group', { name: 'Media layout' })

const captionField = () => screen.queryByRole('textbox', { name: 'Image caption' })

describe('MediaPropertiesPanel', () => {
  it('gathers the properties under one dialog', () => {
    setup()
    expect(screen.getByRole('dialog', { name: 'Media properties' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Add caption' })).toBeDefined()
  })

  // Which sections stand open is read off the picture.
  it('opens the caption section for a captioned picture', () => {
    setup({ caption: 'A note' })
    expect(captionField()).not.toBeNull()
  })

  it('keeps the caption closed for a bare picture', () => {
    setup()
    expect(captionField()).toBeNull()
  })
})

describe('MediaPropertiesPanel caption section', () => {
  // Opening the section is not itself a caption — there is nothing yet to
  // store, and emitting an empty one would mark the picture as captioned.
  it('adds the section without writing a caption', async () => {
    const { user, onCaptionChange } = setup()
    await user.click(screen.getByRole('button', { name: 'Add caption' }))

    expect(captionField()).not.toBeNull()
    expect(onCaptionChange).not.toHaveBeenCalled()
  })

  it('seeds the field with the caption already written', () => {
    setup({ caption: 'Existing' })
    expect((captionField() as HTMLTextAreaElement).value).toBe('Existing')
  })

  it('commits as you type, trimmed', async () => {
    const { user, onCaptionChange } = setup({ caption: '' })
    await user.type(captionField()!, '  Hi  ')
    expect(onCaptionChange.mock.calls.at(-1)).toEqual(['Hi'])
  })

  // Emptying the field is not the same as removing the section: the field has
  // to stay to be typed in again, so what goes is only the stored value.
  it('stores an emptied caption as nothing at all, keeping the field', async () => {
    const { user, onCaptionChange } = setup({ caption: 'Existing' })
    await user.clear(captionField()!)

    expect(onCaptionChange).toHaveBeenLastCalledWith(undefined)
    expect(captionField()).not.toBeNull()
  })

  it('clears the caption when the section is removed', async () => {
    const { user, onCaptionChange } = setup({ caption: 'Existing' })
    await user.click(screen.getByRole('button', { name: 'Remove caption' }))

    expect(onCaptionChange).toHaveBeenCalledExactlyOnceWith(undefined)
    expect(captionField()).toBeNull()
  })

  // The draft goes with it, or re-adding the section would hand back the text
  // that removing it had just thrown away.
  it('comes back empty after being removed and re-added', async () => {
    const { user } = setup({ caption: 'Existing' })
    await user.click(screen.getByRole('button', { name: 'Remove caption' }))
    await user.click(screen.getByRole('button', { name: 'Add caption' }))

    expect((captionField() as HTMLTextAreaElement).value).toBe('')
  })
})

// ---------------------------------------------------------------------------
// Layout — the always-on section
// ---------------------------------------------------------------------------

describe('MediaPropertiesPanel layout section', () => {
  it('stands open with no add/remove control — it is not a property you attach', () => {
    setup()
    expect(layoutPanel()).toBeDefined()
    expect(screen.queryByRole('button', { name: /media layout/i })).toBeNull()
  })

  it('comes before the caption, since it is about the picture itself', () => {
    setup({ caption: 'A shot' })
    const groups = screen.getAllByRole('group').map((g) => g.getAttribute('aria-label'))
    expect(groups[0]).toBe('Media layout')
  })

  it('starts on Cover for a picture that has never been told otherwise', () => {
    setup()
    const selected = within(layoutPanel())
      .getAllByRole('option')
      .filter((o) => o.getAttribute('aria-selected') === 'true')
    expect(selected.map((o) => o.textContent)).toEqual(['Cover'])
  })

  it('shows the fit the picture actually carries', () => {
    setup({ objectFit: 'contain' })
    expect(
      within(layoutPanel()).getByRole('option', { name: 'Contain' }).getAttribute('aria-selected')
    ).toBe('true')
  })

  it('reports the fit that was picked', async () => {
    const { user, onObjectFitChange } = setup()
    await user.click(within(layoutPanel()).getByRole('option', { name: 'Contain' }))
    expect(onObjectFitChange).toHaveBeenCalledExactlyOnceWith('contain')
  })

  it('steps padding by 8, which is the grid the schema stores', async () => {
    const { user, onPaddingChange } = setup({ padding: 16 })
    const track = within(layoutPanel()).getByRole('slider', { name: 'Padding' })
    track.focus()
    await user.keyboard('{ArrowRight}')
    expect(onPaddingChange).toHaveBeenCalledExactlyOnceWith(24)
  })

  it('reads a padding-less picture as zero rather than as blank', () => {
    setup()
    const track = within(layoutPanel()).getByRole('slider', { name: 'Padding' })
    expect(track.getAttribute('aria-valuenow')).toBe('0')
  })
})

describe('MediaPropertiesPanel radius control', () => {
  it('sits in the layout section alongside the other two', () => {
    setup()
    expect(within(layoutPanel()).getAllByRole('slider')).toHaveLength(2)
  })

  it('steps by 2, which is the grid the schema stores', async () => {
    const { user, onBorderRadiusChange } = setup({ borderRadius: 8 })
    const track = within(layoutPanel()).getByRole('slider', { name: 'Radius' })
    track.focus()
    await user.keyboard('{ArrowRight}')
    expect(onBorderRadiusChange).toHaveBeenCalledExactlyOnceWith(10)
  })

  it('stops at the roundest corner the system draws', () => {
    setup()
    const track = within(layoutPanel()).getByRole('slider', { name: 'Radius' })
    // Base UI's range input states the ceiling as its `max`.
    expect(track.getAttribute('max')).toBe('20')
  })

  it('reads zero for a picture that has never set a corner', () => {
    setup()
    expect(
      within(layoutPanel()).getByRole('slider', { name: 'Radius' }).getAttribute('aria-valuenow')
    ).toBe('0')
  })

  it('shows the corner the picture actually carries', () => {
    setup({ borderRadius: 12 })
    expect(
      within(layoutPanel()).getByRole('slider', { name: 'Radius' }).getAttribute('aria-valuenow')
    ).toBe('12')
  })
})
