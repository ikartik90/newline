import { Menu as BaseMenu } from '@base-ui/react/menu'
import { menuItemStyle, menuPopupStyle } from '@/components/menu-button'
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
  'flex items-center gap-2 min-w-0 mr-auto h-8 px-[6.5px] rounded-lg squircle text-left text-style-sidebar text-fg hover:bg-field-hover data-[popup-open]:bg-field-hover transition-colors outline-none'
const avatarStyle =
  'flex items-center justify-center shrink-0 size-5 rounded-full overflow-hidden bg-button-secondary text-fg-body text-style-caption font-medium'
const addressStyle = 'px-2 pb-1 text-style-caption text-fg-body/50 truncate'

/** The name to show: Google's when it gave one, else the address before the @. */
function shortName(user: AccountMenuProps['user']): string {
  return user.name?.trim() || user.email.split('@')[0]
}

export function AccountMenu({ user, onSignOut }: AccountMenuProps) {
  const name = shortName(user)
  return (
    <BaseMenu.Root modal={false}>
      <BaseMenu.Trigger aria-label="Account" className={triggerStyle}>
        <span className={avatarStyle} aria-hidden>
          {user.picture ? (
            <img src={user.picture} alt="" className="size-full object-cover" />
          ) : (
            name.charAt(0).toUpperCase()
          )}
        </span>
        <span className="truncate">{name}</span>
        <ChevronDownIcon className="shrink-0 size-4 text-fg" aria-hidden />
      </BaseMenu.Trigger>
      <BaseMenu.Portal>
        <BaseMenu.Positioner side="top" align="start" sideOffset={4} className="z-50">
          <BaseMenu.Popup className={menuPopupStyle}>
            <div className={addressStyle}>{user.email}</div>
            <BaseMenu.Item className={menuItemStyle} onClick={onSignOut}>
              Sign out
            </BaseMenu.Item>
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  )
}
