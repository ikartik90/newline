import { menuItemStyle, menuPopupFrame } from '@/components/menu-button'
import { Avatar, MenuIdentity, menuRuleStyle } from '@/components/menu-identity'
import { GlassMenu } from '@/components/ui/glass-menu'
import { Menu, MenuItem } from '@/components/ui/menu'
import ChevronDownIcon from '@/assets/icons/chevron-down.svg'

// ---------------------------------------------------------------------------
// AccountMenu — who is signed in, at the foot of the sidebar: the avatar and
// a short name, opening onto the same with the full address under it, and
// Sign out. It opens over the sidebar's glass, so the menu is glass too:
// AppKit's, in a window of its own, where there is that (`GlassMenu`), standing
// over the button as a macOS pop-up does, the button hidden under it; the
// frosted sheet over the OS's other blurs, and the solid sheet where the
// window has none, both above the button. Cornered at 12px.
// ---------------------------------------------------------------------------

export interface AccountMenuProps {
  user: { id: string; email: string; name?: string; picture?: string }
  onSignOut: () => void
}

// A head row's height and inset, but only as wide as its contents: the margin,
// not the button, takes up the rest of the foot. Under the glass menu, which
// draws it again over itself, it hides.
const triggerStyle =
  'flex items-center gap-2 min-w-0 mr-auto h-8 px-[6.5px] rounded-xl text-left text-style-body-sm text-ink-body hover:bg-bg-field-hover data-[popup-open]:bg-bg-field-hover transition-colors outline-none'
const triggerUnderGlassStyle =
  'flex items-center gap-2 min-w-0 mr-auto h-8 px-[6.5px] rounded-xl text-left text-style-body-sm text-ink-body hover:bg-bg-field-hover data-[popup-open]:opacity-0 transition-colors outline-none'
const popupStyle = `${menuPopupFrame} bg-bg-sheet rounded-lg`
const popupFrostedStyle = `${menuPopupFrame} frosted-sheet rounded-lg`

const SIGN_OUT = 'sign-out'

/** The name to show: Google's when it gave one, else the address before the @. */
function shortName(user: AccountMenuProps['user']): string {
  return user.name?.trim() || user.email.split('@')[0]
}

export function AccountMenu({ user, onSignOut }: AccountMenuProps) {
  const name = shortName(user)
  const identity = { name, email: user.email, picture: user.picture }
  const glass = window.api?.glassMenu?.native
  const trigger = (
    <button
      type="button"
      aria-label="Account"
      className={glass ? triggerUnderGlassStyle : triggerStyle}
    >
      <Avatar name={name} picture={user.picture} />
      <span className="truncate">{name}</span>
      <ChevronDownIcon className="shrink-0 size-4 text-ink-body" aria-hidden />
    </button>
  )

  if (glass) {
    return (
      <GlassMenu
        side="over"
        trigger={trigger}
        identity={identity}
        items={[{ id: SIGN_OUT, label: 'Sign out' }]}
        onSelect={(id) => {
          if (id === SIGN_OUT) onSignOut()
        }}
      />
    )
  }

  return (
    <Menu
      side="top"
      className={window.api?.frosted ? popupFrostedStyle : popupStyle}
      trigger={trigger}
    >
      <MenuIdentity identity={identity} />
      <div role="separator" className={menuRuleStyle} />
      <MenuItem className={menuItemStyle} onSelect={onSignOut}>
        Sign out
      </MenuItem>
    </Menu>
  )
}
