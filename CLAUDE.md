# Newline

A local-first rich text note editor. Electron (electron-vite) with a React 19 renderer styled in Tailwind v4, SQLite (better-sqlite3) as the on-device store, and one Cloudflare Worker (`worker/`, D1 + R2) as the backend for sign-in sessions and media. Notes still sync through Firestore until the notes cutover to D1; Google is the identity provider throughout. Notes are stored as a structured JSON document (a block AST), not markdown or HTML.

The editor is a port of the article editor in the sibling repo `../kartik.to`. That repo is a READ-ONLY reference: never edit, build in, or run mutating commands there. Its `DESIGN.md` is stale; token values come from its `panda.config.ts`.

## Commands

- Dev: `npm run dev`
- Build: `npm run build` (then `build:mac` / `build:win` for installers)
- Test: `npm test` (vitest, three projects: `renderer` in jsdom, `shared` and `main` in node); `npm run test:watch`
- Typecheck: `npm run typecheck`
- Look at the editor in a plain browser (no sign-in, no Electron): `npm run dev`, then open http://localhost:5173/harness.html — a dev-only page (`src/renderer/harness.html`) that mounts the editor with a sample document; it is not part of the build.
- Lint / format: `npm run lint`, `npm run format` (prettier: no semicolons, single quotes, width 100)
- Worker: `worker/` is its own npm package with its own `node_modules`; run its scripts from inside it (`npm test` there runs vitest inside workerd against real D1 and R2 emulations; `npm run dev` serves it on port 8787; `npm run deploy` needs a wrangler login).

## Directory map

```
worker/                   The Cloudflare Worker (README.md is the API contract; migrations/ is the D1 schema)
src/
├── main/                 Electron main process (Node)
│   ├── db/               SQLite connection + versioned migrations
│   ├── services/         notes, media (local files + the Worker), media-api, api, auth, session, sync-status; each with __tests__/
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
- **Security.** The app holds no Cloudflare credentials. Main keeps the Worker session token in `app_meta`, encrypted with `safeStorage`, and is the only process that calls the Worker; the renderer asks main over IPC.
- **Free plan.** The Cloudflare account is on the free tier and must stay unbillable: the backend is one plain Worker with a D1 binding and an R2 binding, and the Worker's `MEDIA_QUOTA_BYTES` keeps stored media under R2's free allowance. Anything paid (placement, CPU limits, observability, queues, durable objects, custom domains) is out.

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

## Sign-in and the Worker

- Sign-in: main opens Google's consent window (OpenID Connect implicit flow, `services/auth.ts`), trades the ID token with the Worker's `POST /auth/google` for a session, and stores it (`services/session.ts`). The renderer receives the ID token too and still signs into Firebase with it, because Firestore sync needs that until the notes cutover.
- `services/api.ts` is the one door to the Worker: the deployed URL by default, `MAIN_VITE_API_URL` in `.env` to override it (`http://127.0.0.1:8787` against `npm run dev` in `worker/`), bearer attached, non-2xx raised as `ApiError` with the Worker's error code.
- Routes, limits, error codes and the D1 schema: `worker/README.md`. Change the contract there first, then both sides.

## Media pipeline

- Renderer code never talks to the Worker. It calls `@/lib/media` (`uploadMediaFile`, `listMediaAssets`, `updateMediaAlt`, `updateMediaFilename`, `deleteMedia`, `uploadPoster`), which crosses to main over `window.api.media` (typed in `src/renderer/src/env.d.ts`).
- Main saves every file to `userData/media/<uuid>-<safe-name>` first and records it in the `media_assets` SQLite table. `local://<file>` is served by the `local` protocol in `src/main/index.ts`.
- When the API is configured and a session exists (`isMediaApiAvailable` in `services/media-api.ts`) and the machine is online, the same call PUTs the bytes and metadata to the Worker in one request under key `media/<uuid>-<safe-name>` and returns the public URL the Worker answers with. Otherwise the asset is returned with its `local://` URL and queued; `media.flushPending` uploads later and rewrites `local://` sources inside note bodies to the public URL.
- The Worker files objects per user (`u/<userId>/<key>`) and serves bytes itself at `/m/...`; the app never sees the bucket key and treats a URL as opaque.

## Storage and sync

- SQLite `notes`: `body` is the JSON Document, `plain_text` is derived for FTS (`notes_fts` indexes title, tags, plain_text). Migration v2 converts every markdown body with `@shared/markdown/markdown-to-document` and marks the note dirty so the converted body reaches Firestore.
- Firestore `users/{uid}/notes/{id}` holds `{ title, body, tags, createdAt, updatedAt, isDeleted }`; `body` is the same JSON string. A remote body that is not valid JSON is legacy markdown and is converted on pull. Sync is a poll (`lib/sync-service.ts`: push dirty notes, pull those updated since the last sync, every minute), which the planned move to D1 keeps route for route.
