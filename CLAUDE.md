# Newline

A local-first rich text note editor. Electron (electron-vite) with a React 19 renderer styled in Tailwind v4, SQLite (better-sqlite3) as the on-device store, Firebase Auth + Firestore for sync, and Cloudflare R2 for media. Notes are stored as a structured JSON document (a block AST), not markdown or HTML.

The editor is a port of the article editor in the sibling repo `../kartik.to`. That repo is a READ-ONLY reference: never edit, build in, or run mutating commands there. Its `DESIGN.md` is stale; token values come from its `panda.config.ts`.

## Commands

- Dev: `npm run dev`
- Build: `npm run build` (then `build:mac` / `build:win` for installers)
- Test: `npm test` (vitest, three projects: `renderer` in jsdom, `shared` and `main` in node); `npm run test:watch`
- Typecheck: `npm run typecheck`
- Look at the editor in a plain browser (no sign-in, no Electron): `npm run dev`, then open http://localhost:5173/harness.html — a dev-only page (`src/renderer/harness.html`) that mounts the editor with a sample document; it is not part of the build.
- Lint / format: `npm run lint`, `npm run format` (prettier: no semicolons, single quotes, width 100)

## Directory map

```
src/
├── main/                 Electron main process (Node)
│   ├── db/               SQLite connection + versioned migrations
│   ├── services/         notes, media (local files + R2), r2, sync-status; each with __tests__/
│   ├── ipc.ts            ipcMain handlers — the renderer's only door to Node
│   └── index.ts          window, protocols (local://), auth window, auto-update
├── preload/index.ts      contextBridge: `window.api.*` (typed in renderer/src/env.d.ts)
├── shared/               Code both processes import (alias `@shared/*`)
│   ├── domain/           Zod schemas + types: nodes, document, media; with __tests__/
│   └── markdown/         markdown → Document converter used by the migration
└── renderer/src/         React app (alias `@/*`)
    ├── components/       Flat, kebab-case; with __tests__/
    │   └── ui/           Base UI wrappers styled with Tailwind; with __tests__/
    ├── hooks/            with __tests__/
    ├── store/            Zustand stores; with __tests__/
    ├── utils/            Pure functions; with __tests__/
    ├── lib/              firebase, sync-service, media (the renderer's IPC client for uploads)
    └── assets/           main.css (tokens), icons/*.svg (React components), fonts/
```

## Conventions

- **Test-first.** Write the failing test, watch it fail, make it pass, refactor. Every directory with logic has a co-located `__tests__/` folder. Presentational-only work is verified in the running app instead.
- **Zod domain entities** in `src/shared/domain/`; derive types with `z.infer`. Never write a document to SQLite or Firestore without parsing it.
- **kebab-case file names** for everything new (matches kartik.to and eases cross-referencing). Components export named functions.
- **Base UI for primitives.** Popover, Tooltip, Dialog, Menu, Select/Combobox, Slider, Switch, Checkbox, Toggle come from `@base-ui/react`, wrapped once in `components/ui/` and styled with Tailwind. Do not hand-roll these.
- **Local-first.** The renderer never blocks on the network. Writes go to SQLite through `window.api`, then sync.
- **Security.** R2 credentials live only in the main process. The renderer asks main for uploads over IPC.

## Porting from kartik.to (Panda CSS → Tailwind)

Token names in `src/renderer/src/assets/main.css`. Mapping from Panda recipes:

| Panda                                                                                              | Tailwind                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bg.canvas` / `bg.surface` / `bg.surfaceGlass` / `bg.surfaceRaised`                                | `bg-canvas` / `bg-surface` / `bg-surface-glass` / `bg-surface-raised`                                                                                                                                                                                                                                                                                 |
| `bg.itemHover`, `bg.notice`, `bg.listMarker`, `bg.selection`, `bg.highlight`                       | `bg-item-hover`, `bg-notice`, `bg-list-marker`, `bg-selection`, `bg-highlight`                                                                                                                                                                                                                                                                        |
| `bg.button.secondary.default` / `.hover`                                                           | `bg-button-secondary` / `bg-button-secondary-hover`                                                                                                                                                                                                                                                                                                   |
| `bg.brandedEmphasis` (gradient)                                                                    | `bg-branded`; as ink: `text-branded`                                                                                                                                                                                                                                                                                                                  |
| `text.default` / `text.title` / `text.body` / `text.highlight`                                     | `text-fg` / `text-fg-title` / `text-fg-body` / `text-fg-highlight`                                                                                                                                                                                                                                                                                    |
| `border.divider` / `border.imageOutline` / `border.focusRing`                                      | `border-divider` / `outline-image-outline` / `ring-focus-ring`                                                                                                                                                                                                                                                                                        |
| `field.bg.default` … `field.text.activeMuted`                                                      | `bg-field`, `bg-field-on-surface`, `bg-field-active`, `bg-field-active-veil`, `bg-field-popover`, `bg-field-selected`, `bg-field-hover`, `bg-field-pressed`, `bg-field-hover-brand`, `border-field`, `border-field-active`, `text-field-fg`, `text-field-fg-muted`, `text-field-fg-placeholder`, `text-field-fg-active`, `text-field-fg-active-muted` |
| `textStyle: title/subheading/bodyLarge/bodySmall/quote/caption/sidenote/fineprint/inlineCode/code` | `text-style-title`, `text-style-subheading`, `text-style-body-lg`, `text-style-body-sm`, `text-style-quote`, `text-style-caption`, `text-style-sidenote`, `text-style-fineprint`, `text-style-inline-code`, `text-style-code`                                                                                                                         |
| spacing `3xs/xxs/xs/sm/md/lg/xl/xxl/3xl/4xl/5xl`                                                   | `[0.5px]` / `px` / `0.5` / `1` / `2` / `3` / `4` / `5` / `8` / `10` / `20` (e.g. `p-md` → `p-2`)                                                                                                                                                                                                                                                      |
| radii `xs/sm/md/lg/xl/xxl/full`                                                                    | `rounded-xs/sm/md/lg/xl/2xl/full` (scale overridden to 2/4/8/12/16/20px)                                                                                                                                                                                                                                                                              |
| `fontWeight: medium/bold`                                                                          | `font-medium` (500) / `font-bold` (550)                                                                                                                                                                                                                                                                                                               |
| `sizes.toolbarButton` etc.                                                                         | `w-(--size-toolbar-button)`; all sizes are `--size-*` vars                                                                                                                                                                                                                                                                                            |
| `backdropFilter: blur(md)`                                                                         | `backdrop-frost`                                                                                                                                                                                                                                                                                                                                      |
| `_dark`                                                                                            | `dark:` (class strategy on `<html>`)                                                                                                                                                                                                                                                                                                                  |

Data attributes drive state styling exactly as in kartik.to (`data-active`, `data-indented`, `data-align`, `data-slash-anchor`, `data-sidenote-rail`, `data-media-pending`, `data-keyboard-focus`, `data-control-dragging`).

## Document model

`Document = { type: 'doc', content: BlockNode[] }`. Blocks: paragraph, heading, blockquote, list_item, bullet_list_item, code_block, horizontal_rule, media (image | video), metric, link_card. Inline: text nodes with marks (bold, italic, code, underline, strikethrough, highlight, link, sidenote). Lists are runs of consecutive item blocks. See `src/shared/domain/nodes.ts`.

SQLite `notes.body` holds the document as JSON text; `notes.plain_text` holds the derived text for FTS search. Firestore mirrors the same fields.

## Media pipeline

- Renderer code never talks to R2. It calls `@/lib/media` (`uploadMediaFile`, `listMediaAssets`, `updateMediaAlt`, `updateMediaFilename`, `deleteMedia`, `uploadPoster`), which crosses to main over `window.api.media` (typed in `src/renderer/src/env.d.ts`).
- Main saves every file to `userData/media/<uuid>-<safe-name>` first and records it in the `media_assets` SQLite table. `local://<file>` is served by the `local` protocol in `src/main/index.ts`.
- If R2 is configured (`MAIN_VITE_R2_ACCOUNT_ID`, `MAIN_VITE_R2_ACCESS_KEY_ID`, `MAIN_VITE_R2_SECRET_ACCESS_KEY`, `MAIN_VITE_R2_BUCKET_NAME`, `MAIN_VITE_R2_PUBLIC_BASE_URL` in `.env`) and the machine is online, the same call uploads under key `media/<uuid>-<safe-name>` and returns the public URL. Otherwise the asset is returned with its `local://` URL and queued; `media.flushPending` uploads later and rewrites `local://` sources inside note bodies to the public URL.
- Object metadata (filename, alt, width, height, poster) is stamped after the bytes land, as kartik.to does, because R2 drops metadata on presigned PUTs.

## Storage and sync

- SQLite `notes`: `body` is the JSON Document, `plain_text` is derived for FTS (`notes_fts` indexes title, tags, plain_text). Migration v2 converts every markdown body with `@shared/markdown/markdown-to-document` and marks the note dirty so the converted body reaches Firestore.
- Firestore `users/{uid}/notes/{id}` holds `{ title, body, tags, createdAt, updatedAt, isDeleted }`; `body` is the same JSON string. A remote body that is not valid JSON is legacy markdown and is converted on pull.
