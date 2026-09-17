import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LinkCardConfig } from '@shared/domain/link-card'
import type { MediaAsset } from '@shared/domain/media'
import type { MediaNode } from '@shared/domain/nodes'
import { LinkCardPropertiesPanel } from '../link-card-properties-panel'

// The panel opens the media library itself, and the library is the main
// process's — so the renderer's client is stood in for, with whatever each
// test puts in the bucket.
const mockListMediaAssets = vi.fn()
vi.mock('@/lib/media', () => ({
  listMediaAssets: (...args: unknown[]) => mockListMediaAssets(...args),
  uploadMediaFile: vi.fn(),
  updateMediaAlt: vi.fn(),
  updateMediaFilename: vi.fn(),
  deleteMedia: vi.fn(),
  uploadPoster: vi.fn()
}))

const SHOT: MediaAsset = {
  key: 'media/550e8400-e29b-41d4-a716-446655440000-shot.png',
  url: 'https://cdn.test/media/550e8400-e29b-41d4-a716-446655440000-shot.png',
  filename: 'shot.png',
  contentType: 'image/png',
  size: 100,
  width: 1600,
  height: 900
}

const CV: MediaAsset = {
  key: 'media/550e8400-e29b-41d4-a716-446655440000-cv.pdf',
  url: 'https://cdn.test/media/550e8400-e29b-41d4-a716-446655440000-cv.pdf',
  filename: 'cv.pdf',
  contentType: 'application/pdf',
  size: 9000
}

beforeEach(() => {
  vi.clearAllMocks()
  mockListMediaAssets.mockResolvedValue([SHOT, CV])
})

function setup(config: LinkCardConfig = {}) {
  const onChange = vi.fn()
  const onDismiss = vi.fn()
  render(<LinkCardPropertiesPanel config={config} onChange={onChange} onDismiss={onDismiss} />)
  return { onChange, onDismiss, user: userEvent.setup() }
}

const section = (name: string) => screen.queryByRole('group', { name })

const image = (src: string): MediaNode => ({ type: 'media', kind: 'image', src })

describe('LinkCardPropertiesPanel', () => {
  it('gathers the three sections under one dialog', () => {
    setup()
    expect(screen.getByRole('dialog', { name: 'Link card properties' })).toBeDefined()
    for (const name of ['Picture', 'Content', 'Link']) {
      expect(screen.getByText(name)).toBeTruthy()
    }
  })

  // A SECTION IS THE PROPERTY: a closed section is a property the card does
  // not have, so a card whose configuration is empty opens nothing.
  it('opens the sections the card actually carries', () => {
    setup({ media: { light: image('/a.png') } })
    expect(section('Picture')).toBeTruthy()
    expect(section('Content')).toBeNull()
    expect(section('Link')).toBeNull()
  })

  it('opens nothing for an empty card', () => {
    setup()
    expect(section('Picture')).toBeNull()
    expect(section('Content')).toBeNull()
    expect(section('Link')).toBeNull()
  })
})

describe('LinkCardPropertiesPanel — picture', () => {
  it('offers a picture per theme, from nothing', async () => {
    const { user, onChange } = setup()
    await user.click(screen.getByRole('button', { name: 'Add picture' }))
    expect(onChange).toHaveBeenCalledWith({ media: {} })
    expect(
      within(section('Picture')!)
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label'))
    ).toEqual(['Add light media', 'Add dark media'])
  })

  it('names the file each slot is holding', () => {
    setup({ media: { light: image('https://cdn.test/media/uuid-shader.png') } })
    expect(screen.getByRole('button', { name: 'Change light media' }).textContent).toContain(
      'shader.png'
    )
  })

  // Swapping a picture is the SLOT's act; emptying one is the section's.
  it('offers to replace a filled slot, never to clear it', () => {
    setup({ media: { light: image('/light.png'), dark: image('/dark.png') } })
    expect(
      within(section('Picture')!)
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label'))
    ).toEqual([
      'Change light media',
      'Replace light media',
      'Change dark media',
      'Replace dark media'
    ])
  })

  it('opens the media library for the slot that was pressed', async () => {
    const { user } = setup({ media: {} })
    await user.click(screen.getByRole('button', { name: 'Add dark media' }))
    expect(await screen.findByRole('dialog', { name: 'Insert Media' })).toBeDefined()
    // The library's half only — a document is not a picture.
    expect(await screen.findByRole('option', { name: 'shot.png' })).toBeDefined()
    expect(screen.queryByRole('option', { name: 'cv.pdf' })).toBeNull()
  })

  it('writes the picked file into that slot, shape and all', async () => {
    const { user, onChange } = setup({ media: { light: image('/light.png') } })
    await user.click(screen.getByRole('button', { name: 'Add dark media' }))
    await user.click(await screen.findByRole('option', { name: 'shot.png' }))
    await user.click(screen.getByRole('button', { name: 'Insert Media' }))

    expect(onChange).toHaveBeenCalledWith({
      media: {
        light: image('/light.png'),
        dark: { type: 'media', kind: 'image', src: SHOT.url, width: 1600, height: 900 }
      }
    })
    // The dialog has done its job and gone.
    expect(screen.queryByRole('dialog', { name: 'Insert Media' })).toBeNull()
  })

  // A filled slot is CHANGED, and the dialog says so.
  it('offers to change a filled slot', async () => {
    const { user } = setup({ media: { light: image('/light.png') } })
    await user.click(screen.getByRole('button', { name: 'Change light media' }))
    expect(await screen.findByRole('dialog', { name: 'Change Media' })).toBeDefined()
  })

  // The dialog stands OVER the panel; a press inside it must not read as a
  // press outside the panel, or choosing a picture would close the rail you
  // chose it from.
  it('keeps the panel up while the library is open', async () => {
    const { user, onDismiss } = setup({ media: {} })
    await user.click(screen.getByRole('button', { name: 'Add light media' }))
    await user.click(await screen.findByRole('option', { name: 'shot.png' }))
    // The modal hides the rest of the page from assistive tech while it is
    // up, so the panel is asked for by its root rather than by its role.
    const panel = document.querySelector('[data-properties-panel-root]')
    expect(panel).not.toBeNull()
    expect(panel?.hasAttribute('data-exiting')).toBe(false)
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('takes the whole section away, and both pictures with it', async () => {
    const { user, onChange } = setup({ media: { light: image('/light.png') } })
    await user.click(screen.getByRole('button', { name: 'Remove picture' }))
    expect(onChange).toHaveBeenCalledWith({})
  })
})

describe('LinkCardPropertiesPanel — content', () => {
  const open = (config: LinkCardConfig = { content: {} }) => setup(config)

  it('writes the title as it is typed', async () => {
    const { user, onChange } = open()
    await user.type(screen.getByLabelText('Title'), 'S')
    expect(onChange).toHaveBeenCalledWith({ content: { title: 'S' } })
  })

  it('writes the meta line above it', async () => {
    const { user, onChange } = open()
    await user.type(screen.getByLabelText('Meta'), 'P')
    expect(onChange).toHaveBeenCalledWith({ content: { meta: 'P' } })
  })

  // An emptied line is an ABSENT line, not an empty string.
  it('drops an emptied line rather than storing a blank', async () => {
    const { user, onChange } = open({ content: { title: 'Was' } })
    await user.clear(screen.getByLabelText('Title'))
    expect(onChange).toHaveBeenLastCalledWith({ content: {} })
  })

  it('grounds the words on a scrim', async () => {
    const { user, onChange } = open()
    await user.click(screen.getByRole('switch', { name: 'Scrim' }))
    expect(onChange).toHaveBeenCalledWith({ content: { scrim: true } })
  })

  it("offers the reader's theme as well as the two pinned ones", () => {
    open()
    expect(
      within(screen.getByRole('group', { name: 'Content' }))
        .getAllByRole('option')
        .map((o) => o.textContent)
    ).toEqual(['Auto', 'Light', 'Dark'])
  })

  it('pins the tone to the picture under it', async () => {
    const { user, onChange } = open()
    await user.click(screen.getByRole('option', { name: 'Dark' }))
    expect(onChange).toHaveBeenCalledWith({ content: { tone: 'dark' } })
  })

  it("hands the words back to the reader's theme", async () => {
    const { user, onChange } = open({ content: { tone: 'dark' } })
    await user.click(screen.getByRole('option', { name: 'Auto' }))
    expect(onChange).toHaveBeenCalledWith({ content: {} })
  })

  it('takes the words away with the section, and nothing else', async () => {
    const { user, onChange } = open({ content: { title: 'Shader' }, link: { kind: 'external' } })
    await user.click(screen.getByRole('button', { name: 'Remove content' }))
    expect(onChange).toHaveBeenCalledWith({ link: { kind: 'external' } })
  })
})

// ---------------------------------------------------------------------------
// The scrim switch tells the truth about the card behind it: `LinkCard` draws
// the band wherever there is a picture unless told not to.
// ---------------------------------------------------------------------------
describe('LinkCardPropertiesPanel — the scrim default', () => {
  const scrimSwitch = () => screen.getByRole('switch', { name: 'Scrim' })
  const pictured = { media: { light: image('/a.png') } }

  it('opens on for a card with a picture and no stored value', () => {
    setup({ ...pictured, content: {} })
    expect(scrimSwitch().getAttribute('aria-checked')).toBe('true')
  })

  it('opens off for a card with no picture', () => {
    setup({ content: {} })
    expect(scrimSwitch().getAttribute('aria-checked')).toBe('false')
  })

  it('reads a stored value over the default', () => {
    setup({ ...pictured, content: { scrim: false } })
    expect(scrimSwitch().getAttribute('aria-checked')).toBe('false')
  })

  // Off is a VALUE, not the absence of one: an absent key would hand the card
  // back to its default, which draws the band straight back.
  it('writes a definite off when turned off over a picture', async () => {
    const { user, onChange } = setup({ ...pictured, content: {} })
    await user.click(scrimSwitch())
    expect(onChange).toHaveBeenCalledWith({ ...pictured, content: { scrim: false } })
  })
})

describe('LinkCardPropertiesPanel — link', () => {
  it('starts an external link when the section is added', async () => {
    const { user, onChange } = setup()
    await user.click(screen.getByRole('button', { name: 'Add link' }))
    expect(onChange).toHaveBeenCalledWith({ link: { kind: 'external' } })
  })

  it('offers the two sorts of destination', () => {
    setup({ link: { kind: 'external' } })
    expect(
      within(screen.getByRole('group', { name: 'Link' }))
        .getAllByRole('option')
        .map((o) => o.textContent)
    ).toEqual(['External', 'Document'])
  })

  // Changing the sort of link drops the destination with it; the switch is
  // about the card, not about the destination, so it stays.
  it('drops the destination when the sort of link changes', async () => {
    const { user, onChange } = setup({
      link: { kind: 'external', href: 'https://example.com', newTab: true }
    })
    await user.click(screen.getByRole('option', { name: 'Document' }))
    expect(onChange).toHaveBeenCalledWith({ link: { kind: 'document', newTab: true } })
  })

  it('takes a typed URL once you leave the field, made into a URL', async () => {
    const { user, onChange } = setup({ link: { kind: 'external' } })
    await user.type(screen.getByLabelText('URL'), 'example.com')
    expect(onChange).not.toHaveBeenCalled()
    await user.tab()
    expect(onChange).toHaveBeenCalledWith({
      link: { kind: 'external', href: 'https://example.com' }
    })
  })

  it('takes the URL on Enter as well', async () => {
    const { user, onChange } = setup({ link: { kind: 'external' } })
    await user.type(screen.getByLabelText('URL'), 'https://example.com/a{Enter}')
    expect(onChange).toHaveBeenCalledWith({
      link: { kind: 'external', href: 'https://example.com/a' }
    })
  })

  it('stores nothing for something that is not a URL', async () => {
    const { user, onChange } = setup({ link: { kind: 'external', href: 'https://was.test/' } })
    await user.clear(screen.getByLabelText('URL'))
    await user.type(screen.getByLabelText('URL'), 'not a url{Enter}')
    expect(onChange).toHaveBeenLastCalledWith({ link: { kind: 'external' } })
  })

  it('shows the URL the card already points at', () => {
    setup({ link: { kind: 'external', href: 'https://was.test/' } })
    expect((screen.getByLabelText('URL') as HTMLInputElement).value).toBe('https://was.test/')
  })

  it('opens the document library for a document card', async () => {
    const { user } = setup({ link: { kind: 'document' } })
    await user.click(screen.getByRole('button', { name: 'Add document' }))
    expect(await screen.findByRole('dialog', { name: 'Insert Document' })).toBeDefined()
    expect(await screen.findByRole('option', { name: 'cv.pdf' })).toBeDefined()
    expect(screen.queryByRole('option', { name: 'shot.png' })).toBeNull()
  })

  it('points the card at the document that was picked', async () => {
    const { user, onChange } = setup({ link: { kind: 'document' } })
    await user.click(screen.getByRole('button', { name: 'Add document' }))
    await user.click(await screen.findByRole('option', { name: 'cv.pdf' }))
    await user.click(screen.getByRole('button', { name: 'Insert Document' }))
    expect(onChange).toHaveBeenCalledWith({ link: { kind: 'document', href: CV.url } })
  })

  it('names the document it is pointing at', () => {
    setup({ link: { kind: 'document', href: 'https://cdn.test/media/uuid-cv.pdf' } })
    expect(screen.getByRole('button', { name: 'Change document' }).textContent).toContain('cv.pdf')
  })

  it('opens the card away from here', async () => {
    const { user, onChange } = setup({ link: { kind: 'external', href: 'https://x.test/' } })
    await user.click(screen.getByRole('switch', { name: 'New Tab' }))
    expect(onChange).toHaveBeenCalledWith({
      link: { kind: 'external', href: 'https://x.test/', newTab: true }
    })
  })

  it('takes the whole destination away with the section', async () => {
    const { user, onChange } = setup({
      content: { title: 'Shader' },
      link: { kind: 'external', href: 'https://x.test/' }
    })
    await user.click(screen.getByRole('button', { name: 'Remove link' }))
    // The words stay — removing a section removes THAT property and no other.
    expect(onChange).toHaveBeenCalledWith({ content: { title: 'Shader' } })
  })
})
