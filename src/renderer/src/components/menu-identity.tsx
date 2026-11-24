// ---------------------------------------------------------------------------
// Who a menu is about: the account's picture and name, as the account button
// at the foot of the sidebar shows them, with the address under the name. The
// first row is the button's own box, so a menu standing over the button
// (`GlassMenu` with `side="over"`) puts them where they were.
// ---------------------------------------------------------------------------

export interface Identity {
  name: string
  email: string
  picture?: string
}

// A head glyph's size, so it is centred under the red window button as they are.
const avatarStyle =
  'flex items-center justify-center shrink-0 size-5 rounded-full overflow-hidden bg-bg-avatar-default text-ink-body text-style-caption font-medium'

/** The account's picture, or the name's initial on a disc where it has none. */
export function Avatar({ name, picture }: { name: string; picture?: string }) {
  return (
    <span className={avatarStyle} aria-hidden>
      {picture ? (
        <img src={picture} alt="" className="size-full object-cover" />
      ) : (
        name.charAt(0).toUpperCase()
      )}
    </span>
  )
}

// The account button's box (account-menu's trigger): its height, inset and gap.
const nameRowStyle = 'flex items-center gap-2 h-8 px-[6.5px] min-w-0'
const nameStyle = 'truncate text-style-body-sm text-ink-body'
// Under the name: past the avatar and the gap (6.5 + 20 + 8px), drawn up into
// the row's foot so the two lines read as one block.
const emailStyle = '-mt-1.5 pl-[34.5px] pr-2 truncate text-style-caption text-ink-body/50'

/** The picture, the name and, under it, the address: the head of a menu. */
export function MenuIdentity({ identity }: { identity: Identity }) {
  return (
    <div className="flex flex-col min-w-0 pb-1.5" data-menu-identity="">
      <div className={nameRowStyle}>
        <Avatar name={identity.name} picture={identity.picture} />
        <span className={nameStyle}>{identity.name}</span>
      </div>
      <div className={emailStyle}>{identity.email}</div>
    </div>
  )
}

/** The rule between a menu's head and its rows, across the menu's padding to its edges. */
export const menuRuleStyle = 'shrink-0 h-px -mx-1 mb-1 bg-border-divider'
