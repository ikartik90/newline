import type { FC, SVGProps } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { POPOVER_TOOLBAR } from '@/components/ui/popover'
import { OptionList } from '@/components/ui/input/option-list'
import CloseIcon from '@/assets/icons/close.svg'
import SystemIcon from '@/assets/icons/system.svg'
import LightIcon from '@/assets/icons/light.svg'
import DarkIcon from '@/assets/icons/dark.svg'

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

const THEME_OPTIONS: { value: ThemeChoice; label: string; Icon: FC<SVGProps<SVGSVGElement>> }[] = [
  { value: 'system', label: 'System', Icon: SystemIcon },
  { value: 'light', label: 'Light', Icon: LightIcon },
  { value: 'dark', label: 'Dark', Icon: DarkIcon }
]

// A setting's row: its label, set as the dialog's other text is, then its
// control on the far edge.
const settingRowStyle = 'flex items-center justify-between gap-2'
const settingLabelStyle = 'text-style-body-sm text-ink-body'

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
          {/* The floating toolbar's row of icon buttons, standing in the dialog. */}
          <div className={POPOVER_TOOLBAR}>
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
      </div>
    </Dialog>
  )
}
