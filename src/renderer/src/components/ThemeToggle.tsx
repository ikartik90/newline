import type { ReactElement } from 'react'
import LightIcon from '@/assets/icons/light.svg'
import DarkIcon from '@/assets/icons/dark.svg'
import SettingsIcon from '@/assets/icons/settings.svg'

type Theme = 'light' | 'dark' | 'system'

interface ThemeToggleProps {
  theme: Theme
  onChange: (theme: Theme) => void
}

const ICONS: Record<Theme, ReactElement> = {
  light: <LightIcon className="w-5 h-5" aria-hidden />,
  dark: <DarkIcon className="w-5 h-5" aria-hidden />,
  system: <SettingsIcon className="w-5 h-5" aria-hidden />
}

const CYCLE: Theme[] = ['system', 'light', 'dark']

export default function ThemeToggle({ theme, onChange }: ThemeToggleProps) {
  const next = CYCLE[(CYCLE.indexOf(theme) + 1) % CYCLE.length]

  return (
    <button
      type="button"
      onClick={() => onChange(next)}
      className="inline-flex items-center justify-center w-(--size-toolbar-button) h-(--size-toolbar-button) rounded-sm text-fg-body hover:bg-field-hover transition-colors"
      title={`Theme: ${theme} (click for ${next})`}
      aria-label={`Theme: ${theme}`}
    >
      {ICONS[theme]}
    </button>
  )
}
