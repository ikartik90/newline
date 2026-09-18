import LightIcon from '@/assets/icons/light.svg'
import DarkIcon from '@/assets/icons/dark.svg'

// ---------------------------------------------------------------------------
// The control names and pictures the theme it OFFERS, never the one in force:
// it is a door, and a door is labelled with the room on the other side. In the
// light theme it shows the moon and reads "Dark theme"; in the dark theme the
// sun and "Light theme". Ported from kartik.to's theme-toggle. The gear next
// to it is the note's settings, and this never wears one.
// ---------------------------------------------------------------------------

export type EffectiveTheme = 'light' | 'dark'

interface ThemeToggleProps {
  /** The theme in force right now (`useTheme().effectiveTheme`). */
  theme: EffectiveTheme
  onChange: (theme: EffectiveTheme) => void
}

const OFFER: Record<EffectiveTheme, string> = {
  light: 'Light theme',
  dark: 'Dark theme'
}

export default function ThemeToggle({ theme, onChange }: ThemeToggleProps) {
  const next: EffectiveTheme = theme === 'dark' ? 'light' : 'dark'
  const label = OFFER[next]

  return (
    <button
      type="button"
      onClick={() => onChange(next)}
      className="inline-flex items-center justify-center w-(--size-toolbar-button) h-(--size-toolbar-button) rounded-sm text-fg-body hover:bg-field-hover transition-colors"
      title={label}
      aria-label={label}
    >
      {next === 'dark' ? (
        <DarkIcon className="w-5 h-5" aria-hidden />
      ) : (
        <LightIcon className="w-5 h-5" aria-hidden />
      )}
    </button>
  )
}
