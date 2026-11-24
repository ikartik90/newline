import { useId, useState, type FC, type SVGProps } from 'react'
import { GEMMA_MODEL, type AssistantModelCopy, type ModelSource } from '@shared/domain/assistant'
import { useAssistantModels } from '@/hooks/use-assistant'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { OptionList } from '@/components/ui/input/option-list'
import CloseIcon from '@/assets/icons/close.svg'
import SystemIcon from '@/assets/icons/system.svg'
import LightIcon from '@/assets/icons/light.svg'
import DarkIcon from '@/assets/icons/dark.svg'
import TrashIcon from '@/assets/icons/trash.svg'

// ---------------------------------------------------------------------------
// The application's settings, opened from the gear at the foot of the
// sidebar: the theme, and the copies of Gemma on this computer. A note's own
// settings are its properties rail, not this.
// ---------------------------------------------------------------------------

export type ThemeChoice = 'light' | 'dark' | 'system'

export interface SettingsDialogProps {
  open: boolean
  onClose: () => void
  theme: ThemeChoice
  onThemeChange: (theme: ThemeChoice) => void
}

const THEME_OPTIONS: { value: ThemeChoice; label: string; Icon: FC<SVGProps<SVGSVGElement>> }[] = [
  { value: 'system', label: 'System', Icon: SystemIcon },
  { value: 'light', label: 'Light', Icon: LightIcon },
  { value: 'dark', label: 'Dark', Icon: DarkIcon }
]

// A setting's row: its label, set as the dialog's other text is, then its
// control on the far edge.
const settingRowStyle = 'flex items-center justify-between gap-2'
const settingLabelStyle = 'text-style-body-sm text-ink-body'
// The floating toolbar's icon buttons standing in the dialog, 1px apart as they are there,
// with no shell round them to stand clear of: the row is as tall as its buttons, a pressed
// one its chip alone.
const themeRowStyle =
  'flex items-center w-max h-(--size-toolbar-button) [&_[role=toolbar]]:gap-px [&_button[aria-pressed=true]]:after:border-0'
const sectionStyle = 'flex flex-col gap-2'
const modelRowStyle = 'flex items-center justify-between gap-2 min-h-8'
const modelTextStyle = 'flex flex-col min-w-0'
const captionStyle = 'text-style-caption text-ink-body/50'

/** Where a copy lives, as the person knows the place. */
const SOURCE_NAMES: Record<ModelSource, string> = {
  huggingface: 'Hugging Face cache',
  'lm-studio': 'LM Studio',
  ollama: 'Ollama',
  'llama.cpp': 'llama.cpp cache',
  'node-llama-cpp': 'node-llama-cpp'
}

function gigabytes(bytes: number): string {
  return `${(bytes / 1e9).toFixed(1)} GB`
}

export function SettingsDialog({ open, onClose, theme, onThemeChange }: SettingsDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} size="xs" align="top-center" material="glass">
      <Dialog.Header>
        <Dialog.Title>Settings</Dialog.Title>
        <Button variant="icon" aria-label="Close settings" onClick={onClose}>
          <CloseIcon />
        </Button>
      </Dialog.Header>
      <div className="flex flex-col gap-4 p-3">
        <div className={settingRowStyle}>
          <span className={settingLabelStyle}>Theme</span>
          <div className={themeRowStyle}>
            <OptionList direction="inline">
              <OptionList.Toolbar aria-label="Theme">
                {THEME_OPTIONS.map(({ value, label, Icon }) => (
                  <OptionList.Option
                    key={value}
                    aria-label={label}
                    pressed={theme === value}
                    onClick={() => onThemeChange(value)}
                  >
                    <Icon aria-hidden />
                  </OptionList.Option>
                ))}
              </OptionList.Toolbar>
            </OptionList>
          </div>
        </div>
        <ModelSettings shown={open} />
      </div>
    </Dialog>
  )
}

/** The copies of Gemma on this computer, Newline's download or another app's. */
function ModelSettings({ shown }: { shown: boolean }) {
  const { copies, error, remove } = useAssistantModels(shown)
  const [confirming, setConfirming] = useState<AssistantModelCopy | null>(null)
  const [deleted, setDeleted] = useState(false)
  const headingId = useId()

  return (
    <section aria-labelledby={headingId} className={sectionStyle}>
      <h3 id={headingId} className={settingLabelStyle}>
        Models
      </h3>
      {copies?.length === 0 && (
        <p className={captionStyle}>
          {deleted
            ? 'Deleted. Gemma downloads again when you send it a message.'
            : 'None yet. Gemma downloads when you send it your first message.'}
        </p>
      )}
      {copies && copies.length > 0 && (
        <ul className="flex flex-col gap-1">
          {copies.map((copy) => (
            <li key={copy.path} className={modelRowStyle}>
              <div className={modelTextStyle}>
                <span className={settingLabelStyle}>{GEMMA_MODEL.label}</span>
                <span className={captionStyle}>
                  {gigabytes(copy.sizeBytes)} · {SOURCE_NAMES[copy.source]}
                  {copy.deletable ? '' : ' · Remove it with Ollama'}
                </span>
              </div>
              {copy.deletable && (
                <Button
                  aria-label={`Delete ${GEMMA_MODEL.label}`}
                  onClick={() => setConfirming(copy)}
                >
                  <TrashIcon aria-hidden />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-style-caption text-ink-error">
          {error}
        </p>
      )}
      <ConfirmDialog
        open={confirming !== null}
        title="Delete Model"
        message={
          confirming
            ? `You are about to delete ${GEMMA_MODEL.label} (${gigabytes(confirming.sizeBytes)}) from ${confirming.source === 'huggingface' ? 'the Hugging Face cache, which other apps may share' : SOURCE_NAMES[confirming.source]}. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        confirmIcon={TrashIcon}
        onConfirm={() => {
          if (!confirming) return
          setDeleted(true)
          void remove(confirming.path)
        }}
        onClose={() => setConfirming(null)}
      />
    </section>
  )
}
