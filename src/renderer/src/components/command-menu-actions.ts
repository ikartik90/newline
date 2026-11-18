import type { CommandMenuAction } from '@/components/command-menu'
import LeftSidebarIcon from '@/assets/icons/left-sidebar.svg'
import AddIcon from '@/assets/icons/add.svg'
import TrashIcon from '@/assets/icons/trash.svg'
import MetadataIcon from '@/assets/icons/metadata.svg'
import DarkIcon from '@/assets/icons/dark.svg'
import LightIcon from '@/assets/icons/light.svg'
import NoteSparkleIcon from '@/assets/icons/note-sparkle.svg'

export type CommandId = 'new-note' | 'sidebar' | 'assistant' | 'properties' | 'delete' | 'theme'

/**
 * The command menu's actions for what the window holds, each running `run`
 * with its id. One list for the in-page menu and the glass palette, which
 * runs in a window of its own and can only name what to do.
 */
export function commandMenuActions(
  { sidebarCollapsed, noteOpen, assistantOpen, theme }: CommandMenuState,
  run: (id: CommandId) => void
): CommandMenuAction[] {
  const action = (id: CommandId, fields: Omit<CommandMenuAction, 'id' | 'run'>) => ({
    id,
    ...fields,
    run: () => run(id)
  })
  return [
    action('new-note', { label: 'New note', icon: AddIcon, shortcut: 'N' }),
    action('sidebar', {
      label: sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar',
      icon: LeftSidebarIcon,
      shortcut: '\\'
    }),
    action('assistant', {
      label: assistantOpen ? 'Hide Gemma' : 'Ask Gemma',
      icon: NoteSparkleIcon
    }),
    ...(noteOpen
      ? [
          action('properties', { label: 'Note properties', icon: MetadataIcon }),
          action('delete', { label: 'Delete note', icon: TrashIcon })
        ]
      : []),
    // Last, so the bottom of the menu is never Delete note.
    action('theme', {
      label: theme === 'dark' ? 'Light theme' : 'Dark theme',
      icon: theme === 'dark' ? LightIcon : DarkIcon,
      group: 'Settings'
    })
  ]
}
