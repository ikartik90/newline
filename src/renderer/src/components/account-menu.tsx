import { menuItemStyle, menuPopupStyle } from '@/components/menu-button'
import { Menu, MenuItem } from '@/components/ui/menu'
import ChevronDownIcon from '@/assets/icons/chevron-down.svg'

// ---------------------------------------------------------------------------
// AccountMenu — who is signed in, at the foot of the sidebar: the avatar and
// a short name, opening upward onto the full address and Sign out.
// ---------------------------------------------------------------------------

export interface AccountMenuProps {
  user: { id: string; email: string; name?: string; picture?: string }
  onSignOut: () => void
}

// A head row's height and inset, but only as wide as its contents: the margin,
// not the button, takes up the rest of the foot. The avatar is a head glyph's
// size, so it is centred under the red window button as they are.
const triggerStyle =
  'flex items-center gap-2 min-w-0 mr-auto h-8 px-[6.5px] rounded-xl text-left text-style-sidebar text-ink-body hover:bg-bg-field-hover data-[popup-open]:bg-bg-field-hover transition-colors outline-none'
const avatarStyle =
  'flex items-center justify-center shrink-0 size-5 rounded-full overflow-hidden bg-bg-avatar-default text-ink-body text-style-caption font-medium'
const addressStyle = 'px-2 pb-1 text-style-caption text-ink-body/50 truncate'

/** The name to show: Google's when it gave one, else the address before the @. */
function shortName(user: AccountMenuProps['user']): string {
  return user.name?.trim() || user.email.split('@')[0]
}

export function AccountMenu({ user, onSignOut }: AccountMenuProps) {
  const name = shortName(user)
  return (
    <Menu
      side="top"
      className={menuPopupStyle}
      trigger={
        <button type="button" aria-label="Account" className={triggerStyle}>
          <span className={avatarStyle} aria-hidden>
            {user.picture ? (
              <img src={user.picture} alt="" className="size-full object-cover" />
            ) : (
              name.charAt(0).toUpperCase()
            )}
          </span>
          <span className="truncate">{name}</span>
          <ChevronDownIcon className="shrink-0 size-4 text-ink-body" aria-hidden />
        </button>
      }
    >
      <div className={addressStyle}>{user.email}</div>
      <MenuItem className={menuItemStyle} onSelect={onSignOut}>
        Sign out
      </MenuItem>
    </Menu>
  )
}
