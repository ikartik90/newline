import { useState, type Ref } from 'react'
import { PropertiesPanel, type PropertiesPanelHandle } from '@/components/ui/properties-panel'
import { Field } from '@/components/ui/input/field'
import { ImageInput } from '@/components/ui/input/image-input'
import { SegmentedControl } from '@/components/ui/input/segmented-control'
import { Switch } from '@/components/ui/input/switch'
import { ImageInsertDialog } from '@/components/image-insert-dialog'
import type { ImageInsertPayload } from '@/hooks/use-image-insert'
import type {
  LinkCardConfig,
  LinkCardContent,
  LinkCardLink,
  LinkCardTone,
  LinkTargetKind
} from '@shared/domain/link-card'
import type { MediaNode } from '@shared/domain/nodes'
import LinkIcon from '@/assets/icons/link.svg'
import MediaIcon from '@/assets/icons/media.svg'
import TitleIcon from '@/assets/icons/title.svg'

// ---------------------------------------------------------------------------
// LinkCardPropertiesPanel — the three sections that ARE a link card, in the
// docked inspector: what it shows, what it says, and where it goes. In that
// order because it is the order you build one in.
//
// Distilled from kartik.to's `CardPropertiesPanel`, which inspected every
// kind of homepage card; newline has one card, so the panel is the card.
//
// A live editor, not a form: every control commits on change and the parent
// owns the value. What is handed back is the WHOLE configuration each time,
// because a section that has been removed has to arrive as an absent key — a
// partial patch could never clear anything.
//
// The panel opens the media library ITSELF. kartik.to's rail emitted the
// intent and let the grid own the dialog; here there is no grid, so the modal
// stands over the rail, exempted from the rail's outside-press dismiss.
// ---------------------------------------------------------------------------

/** Which of the two theme slots a picture is being chosen for. */
export type LinkCardMediaSlot = 'light' | 'dark'

/**
 * The band's tone, with the reader's own theme first. "Auto" is a real choice
 * rather than the absence of one; the other two PIN the band, for a cover
 * that is a screenshot of one appearance.
 */
const TONES = [
  { value: 'auto', label: 'Auto' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' }
]

/** The two sorts of destination newline knows: a page elsewhere, or a file in the bucket. */
const LINK_KINDS: { value: LinkTargetKind; label: string }[] = [
  { value: 'external', label: 'External' },
  { value: 'document', label: 'Document' }
]

/** What is asked of the library, and for which slot. */
type Picker = { kind: 'media'; slot: LinkCardMediaSlot } | { kind: 'document' }

/**
 * A typed destination made into a URL, or nothing. A bare host gets `https://`
 * — nobody types the scheme — and anything the URL parser refuses is dropped
 * rather than stored, since the schema would refuse it on the way to disk.
 */
export function normaliseHref(raw: string): string | undefined {
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    new URL(withScheme)
    return withScheme
  } catch {
    return undefined
  }
}

/** What a slot's node hands the {@link ImageInput}: the file, its kind, and a clip's still. */
function slotFile(node: MediaNode | undefined) {
  if (!node) return {}
  return {
    src: node.src,
    kind: node.kind,
    ...(node.kind === 'video' && node.poster ? { poster: node.poster } : {})
  }
}

/** The node a picked file becomes in a slot — only the facts the library had. */
function nodeFromPayload(payload: ImageInsertPayload): MediaNode {
  const base = {
    type: 'media' as const,
    src: payload.src,
    ...(payload.alt ? { alt: payload.alt } : {}),
    ...(payload.width ? { width: payload.width } : {}),
    ...(payload.height ? { height: payload.height } : {})
  }
  return payload.kind === 'video'
    ? { ...base, kind: 'video', ...(payload.poster ? { poster: payload.poster } : {}) }
    : { ...base, kind: 'image' }
}

export interface LinkCardPropertiesPanelProps {
  /** The card as it currently stands, drafts and all. */
  config: LinkCardConfig
  /** The WHOLE configuration, replacing what was there. */
  onChange: (config: LinkCardConfig) => void
  /** Fired once the panel has finished sliding out — see PropertiesPanel. */
  onDismiss: () => void
  /** Handle for closing the panel from the control that opened it. */
  ref?: Ref<PropertiesPanelHandle>
}

export function LinkCardPropertiesPanel({
  config,
  onChange,
  onDismiss,
  ref
}: LinkCardPropertiesPanelProps) {
  const { media, content, link } = config

  // What the library is open for. `picker` outlives `open` so the dialog
  // keeps its title and its half of the library through its closing fade.
  const [picker, setPicker] = useState<Picker>({ kind: 'media', slot: 'light' })
  const [pickerOpen, setPickerOpen] = useState(false)

  /** Rewrite one section, leaving the other two exactly as they were. */
  const set = (patch: Partial<LinkCardConfig>) => onChange({ ...config, ...patch })

  /** Drop one section — an absent key, which is what a closed section is. */
  const clear = (key: keyof LinkCardConfig) => {
    const next = { ...config }
    delete next[key]
    onChange(next)
  }

  function pick(next: Picker) {
    setPicker(next)
    setPickerOpen(true)
  }

  function insert(payload: ImageInsertPayload) {
    if (picker.kind === 'document') {
      set({
        link: {
          kind: 'document',
          href: payload.src,
          ...(link?.newTab ? { newTab: true } : {})
        }
      })
      return
    }
    set({ media: { ...media, [picker.slot]: nodeFromPayload(payload) } })
  }

  const pickingDocument = picker.kind === 'document'
  const slotFilled =
    picker.kind === 'document' ? Boolean(link?.href) : Boolean(media?.[picker.slot])

  return (
    <PropertiesPanel
      ref={ref}
      ariaLabel="Link card properties"
      // The library is a modal standing OVER this panel, opened by its own
      // controls — a press inside it must not read as a press outside the
      // rail, or choosing a picture would close the panel you chose it from.
      ignoreSelector="[data-modal-dialog], [data-dialog-backdrop]"
      onDismiss={onDismiss}
    >
      <PropertiesPanel.Header>Link Card</PropertiesPanel.Header>

      {/* A picture per theme, in a section that IS the property. Two slots
          rather than one picture and a filter, because the case this exists
          for is a SCREENSHOT with its own light and dark appearance. Closing
          the section is what empties the slots — see ImageInput. */}
      <PropertiesPanel.Section
        defaultEnabled={media !== undefined}
        // From nothing: a card with no picture is a plate with words on it.
        onEnabledChange={(enabled) => (enabled ? set({ media: {} }) : clear('media'))}
      >
        <PropertiesPanel.SectionHeader icon={<MediaIcon aria-hidden />}>
          Picture
        </PropertiesPanel.SectionHeader>
        <PropertiesPanel.ControlPanel>
          {(['light', 'dark'] as const).map((slot) => (
            <PropertiesPanel.Control key={slot} label={slot === 'light' ? 'Light' : 'Dark'}>
              <ImageInput
                noun={`${slot} media`}
                {...slotFile(media?.[slot])}
                onPick={() => pick({ kind: 'media', slot })}
              />
            </PropertiesPanel.Control>
          ))}
        </PropertiesPanel.ControlPanel>
      </PropertiesPanel.Section>

      <PropertiesPanel.Section
        defaultEnabled={content !== undefined}
        onEnabledChange={(enabled) => (enabled ? set({ content: {} }) : clear('content'))}
      >
        <PropertiesPanel.SectionHeader icon={<TitleIcon aria-hidden />}>
          Content
        </PropertiesPanel.SectionHeader>
        <PropertiesPanel.ControlPanel>
          <ContentControls
            content={content ?? {}}
            // What the scrim's default is read off.
            pictured={Boolean(media?.light || media?.dark)}
            onChange={(next) => set({ content: next })}
          />
        </PropertiesPanel.ControlPanel>
      </PropertiesPanel.Section>

      <PropertiesPanel.Section
        defaultEnabled={link !== undefined}
        // External is where a link starts. The destination itself stays
        // unset: you choose the SORT of link first and then go and find it.
        onEnabledChange={(enabled) =>
          enabled ? set({ link: { kind: 'external' } }) : clear('link')
        }
      >
        <PropertiesPanel.SectionHeader icon={<LinkIcon aria-hidden />}>
          Link
        </PropertiesPanel.SectionHeader>
        <PropertiesPanel.ControlPanel>
          <LinkControls
            link={link ?? { kind: 'external' }}
            onChange={(next) => set({ link: next })}
            onPickDocument={() => pick({ kind: 'document' })}
          />
        </PropertiesPanel.ControlPanel>
      </PropertiesPanel.Section>

      <ImageInsertDialog
        open={pickerOpen}
        mode={slotFilled ? 'change' : 'insert'}
        // A slot is usually filled from what is already in the library; the
        // drop zone is one press away.
        initialPhase="library"
        accepts={pickingDocument ? 'document' : 'media'}
        onClose={() => setPickerOpen(false)}
        onInsert={insert}
      />
    </PropertiesPanel>
  )
}

/** The words on the card, and the band they stand on. */
function ContentControls({
  content,
  pictured,
  onChange
}: {
  content: LinkCardContent
  /** Whether the card has a picture in either slot — the scrim's default. */
  pictured: boolean
  onChange: (content: LinkCardContent) => void
}) {
  const write = (patch: Partial<LinkCardContent>) => {
    const next = { ...content, ...patch }
    // An emptied value is an ABSENT value, not an empty string or an explicit
    // undefined: absent is what `LinkCard` reads to decide there is nothing
    // to draw, and `{}` is the honest shape of words nobody has written.
    for (const key of Object.keys(next) as (keyof LinkCardContent)[]) {
      if (next[key] === undefined || next[key] === '') delete next[key]
    }
    onChange(next)
  }

  return (
    <>
      {/* Above the title in the panel because it is above the title on the
          card. */}
      <TextControl
        label="Meta"
        placeholder="Case study"
        value={content.meta}
        onChange={(meta) => write({ meta })}
      />

      <TextControl
        label="Title"
        placeholder="Atlas"
        value={content.title}
        onChange={(title) => write({ title })}
      />

      {/* The switch reports what the CARD is doing, not what is stored: the
          band is drawn wherever there is a picture unless told otherwise.
          What a press writes is DEFINITE — off over a picture is a choice,
          and an absent key would hand the card straight back to the band. */}
      <PropertiesPanel.Control label="Scrim">
        <Switch
          size="sm"
          checked={content.scrim ?? pictured}
          onCheckedChange={(scrim) => write({ scrim })}
        />
      </PropertiesPanel.Control>

      {/* Applies whether or not the scrim is drawn: it pins the caption's INK
          as well as the wash's colour. */}
      <PropertiesPanel.Control label="Mode">
        <SegmentedControl
          options={TONES}
          value={content.tone ?? 'auto'}
          onValueChange={(tone) =>
            write({ tone: tone === 'auto' ? undefined : (tone as LinkCardTone) })
          }
        />
      </PropertiesPanel.Control>
    </>
  )
}

/**
 * One line of the caption, as a row that commits on every keystroke. It keeps
 * a DRAFT of what is typed, because what is stored is not what is in the
 * field: the value is trimmed on the way out and an emptied one is dropped.
 *
 * A bare `Field.Frame` rather than a `TextInput`: `Control` IS the field,
 * and a TextInput would open a second one inside it, leaving the row's label
 * pointing at nothing.
 */
function TextControl({
  label,
  placeholder,
  value,
  onChange
}: {
  label: string
  placeholder: string
  /** What is stored — the field's starting point, not its state. */
  value: string | undefined
  onChange: (value: string | undefined) => void
}) {
  const [draft, setDraft] = useState(value ?? '')

  return (
    <PropertiesPanel.Control label={label}>
      <Field.Frame>
        <Field.Control
          value={draft}
          placeholder={placeholder}
          onChange={(event) => {
            setDraft(event.target.value)
            onChange(event.target.value.trim() || undefined)
          }}
        />
      </Field.Frame>
    </PropertiesPanel.Control>
  )
}

/** Where the card goes, and how it opens. */
function LinkControls({
  link,
  onChange,
  onPickDocument
}: {
  link: LinkCardLink
  onChange: (link: LinkCardLink) => void
  onPickDocument: () => void
}) {
  return (
    <>
      <PropertiesPanel.Control label="Type">
        <SegmentedControl
          options={LINK_KINDS}
          value={link.kind}
          // The destination goes with the kind: a page's URL is not a file in
          // the bucket. `newTab` survives — it is a fact about the CARD.
          onValueChange={(value) =>
            onChange({
              kind: value as LinkTargetKind,
              ...(link.newTab ? { newTab: true } : {})
            })
          }
        />
      </PropertiesPanel.Control>

      {link.kind === 'external' && (
        <UrlControl
          // Remounted per destination, so a fresh kind starts a fresh draft.
          key={link.href ?? ''}
          href={link.href}
          onCommit={(href) => {
            const next = { ...link }
            if (href) next.href = href
            else delete next.href
            onChange(next)
          }}
        />
      )}

      {link.kind === 'document' && (
        <PropertiesPanel.Control label="File">
          <ImageInput noun="document" kind="document" src={link.href} onPick={onPickDocument} />
        </PropertiesPanel.Control>
      )}

      <PropertiesPanel.Control label="New Tab">
        <Switch
          size="sm"
          checked={link.newTab ?? false}
          onCheckedChange={(newTab) => {
            const next = { ...link }
            if (newTab) next.newTab = true
            else delete next.newTab
            onChange(next)
          }}
        />
      </PropertiesPanel.Control>
    </>
  )
}

/**
 * The typed destination of an external card. Committed on blur and on Enter
 * rather than per keystroke, because it is NORMALISED on the way out — a
 * bare host gains its scheme — and rewriting the field under someone still
 * typing into it would be worse than waiting for them to finish.
 */
function UrlControl({
  href,
  onCommit
}: {
  href: string | undefined
  onCommit: (href: string | undefined) => void
}) {
  const [draft, setDraft] = useState(href ?? '')
  const commit = () => onCommit(normaliseHref(draft))

  return (
    <PropertiesPanel.Control label="URL">
      <Field.Frame>
        <Field.Control
          type="url"
          inputMode="url"
          value={draft}
          placeholder="https://example.com"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            commit()
          }}
        />
      </Field.Frame>
    </PropertiesPanel.Control>
  )
}
