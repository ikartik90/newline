import { useState } from 'react'
import { PropertiesPanel } from '@/components/ui/properties-panel'
import CrossSmallIcon from '@/assets/icons/cross-small.svg'

// ---------------------------------------------------------------------------
// The note's own properties, in the same docked rail a picture's are edited
// in. Tags used to be scraped from hashtags in the text; they are authored
// here now, so a tag is a decision rather than a side effect of prose.
// ---------------------------------------------------------------------------

export interface NotePropertiesPanelProps {
  note: Pick<Note, 'id' | 'tags'>
  onTagsChange: (tags: string[]) => void
  /** Fired once the rail has finished sliding out. */
  onDismiss: () => void
}

/** A tag as it is stored: trimmed, lowercase, never empty. */
function normaliseTag(raw: string): string {
  return raw.trim().toLowerCase()
}

export function NotePropertiesPanel({ note, onTagsChange, onDismiss }: NotePropertiesPanelProps) {
  const [draft, setDraft] = useState('')

  function commitDraft(value: string) {
    const tag = normaliseTag(value)
    setDraft('')
    if (!tag || note.tags.includes(tag)) return
    onTagsChange([...note.tags, tag])
  }

  function removeTag(tag: string) {
    onTagsChange(note.tags.filter((t) => t !== tag))
  }

  return (
    <PropertiesPanel ariaLabel="Note properties" onDismiss={onDismiss}>
      <PropertiesPanel.Header>Note</PropertiesPanel.Header>
      <PropertiesPanel.Group title="Tags">
        <div className="flex flex-wrap gap-1 px-3 pb-2">
          {note.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-0.5 h-5 pl-2 pr-1 rounded-full bg-surface-raised text-style-caption text-fg leading-none"
            >
              {tag}
              <button
                type="button"
                aria-label={`Remove tag ${tag}`}
                className="inline-flex items-center justify-center w-4 h-4 rounded-full text-fg-body hover:bg-field-hover"
                onClick={() => removeTag(tag)}
              >
                <CrossSmallIcon className="w-3 h-3" aria-hidden />
              </button>
            </span>
          ))}
          <input
            type="text"
            aria-label="Add tag"
            placeholder={note.tags.length ? 'Add tag…' : 'Add a tag…'}
            value={draft}
            onChange={(e) => {
              const value = e.target.value
              // A comma commits, as it does in every tag field people know.
              if (value.endsWith(',')) commitDraft(value.slice(0, -1))
              else setDraft(value)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commitDraft(draft)
              } else if (e.key === 'Backspace' && draft === '' && note.tags.length > 0) {
                e.preventDefault()
                removeTag(note.tags[note.tags.length - 1])
              }
            }}
            className="flex-1 min-w-[96px] h-7 px-2 text-style-body-sm rounded-sm bg-field-on-surface text-field-fg placeholder:text-field-fg-placeholder border-[0.5px] border-solid border-field-border outline-none focus:border-field-border-active focus:bg-field-active"
          />
        </div>
      </PropertiesPanel.Group>
    </PropertiesPanel>
  )
}
