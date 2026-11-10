import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/input/field'
import { SegmentedControl } from '@/components/ui/input/segmented-control'
import CloseIcon from '@/assets/icons/cross.svg'

// ---------------------------------------------------------------------------
// The application's settings, opened from the gear at the foot of the
// sidebar. A note's own settings are its properties rail, not this.
// ---------------------------------------------------------------------------

export type ThemeChoice = 'light' | 'dark' | 'system'

export interface SettingsDialogProps {
  open: boolean
  onClose: () => void
  theme: ThemeChoice
  onThemeChange: (theme: ThemeChoice) => void
}

const THEME_OPTIONS = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' }
]

export function SettingsDialog({ open, onClose, theme, onThemeChange }: SettingsDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} size="xs" align="top-center">
      <Dialog.Header>
        <Dialog.Title>Settings</Dialog.Title>
        <Button variant="icon" aria-label="Close settings" onClick={onClose}>
          <CloseIcon />
        </Button>
      </Dialog.Header>
      <div className="flex flex-col gap-4 p-3">
        <Field size="sm">
          <Field.Label>Theme</Field.Label>
          <SegmentedControl
            options={THEME_OPTIONS}
            value={theme}
            onValueChange={(next) => onThemeChange(next as ThemeChoice)}
          />
        </Field>
      </div>
    </Dialog>
  )
}
