import { contextBridge, ipcRenderer } from 'electron'

/** What the renderer hands main to store a file — mirrors `MediaUploadInput` in env.d.ts. */
interface MediaUploadInput {
  filename: string
  contentType: string
  bytes: Uint8Array
  width?: number
  height?: number
}

/** Hear one channel from main, its event object kept from the renderer. */
function listen<T>(channel: string, listener: (value: T) => void): () => void {
  const handler = (_event: unknown, value: T): void => listener(value)
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.removeListener(channel, handler)
  }
}

contextBridge.exposeInMainWorld('api', {
  platform: process.platform,
  // Main says, as the window is made, whether it is the OS's own blur under a
  // clear page (main/sidebar-glass.ts's isFrostedWindow).
  frosted: process.argv.includes('--frosted-window'),
  notes: {
    create: (title?: string, body?: string) => ipcRenderer.invoke('notes:create', title, body),
    update: (id: string, fields: { title?: string; body?: string; tags?: string[] }) =>
      ipcRenderer.invoke('notes:update', id, fields),
    delete: (id: string) => ipcRenderer.invoke('notes:delete', id),
    get: (id: string) => ipcRenderer.invoke('notes:get', id),
    list: () => ipcRenderer.invoke('notes:list'),
    search: (query: string) => ipcRenderer.invoke('notes:search', query)
  },
  sync: {
    now: () => ipcRenderer.invoke('sync:now'),
    pushNote: (id: string) => ipcRenderer.invoke('sync:pushNote', id),
    status: () => ipcRenderer.invoke('sync:status'),
    onChanged: (listener: () => void) => {
      // Wrapped so the renderer's function never sees the IPC event object.
      const handler = (): void => listener()
      ipcRenderer.on('sync:changed', handler)
      return () => {
        ipcRenderer.removeListener('sync:changed', handler)
      }
    }
  },
  theme: {
    setSource: (source: string) => ipcRenderer.invoke('theme:setSource', source)
  },
  window: {
    isFullScreen: () => ipcRenderer.invoke('window:isFullScreen'),
    setSidebarWidth: (width: number) => ipcRenderer.send('window:sidebarWidth', width),
    setRailWidth: (width: number) => ipcRenderer.send('window:railWidth', width),
    onFullScreenChange: (listener: (fullScreen: boolean) => void) => {
      const handler = (_event: unknown, fullScreen: boolean): void => listener(fullScreen)
      ipcRenderer.on('window:fullScreen', handler)
      return () => {
        ipcRenderer.removeListener('window:fullScreen', handler)
      }
    },
    // Only where AppKit glasses the window: a dialog stands on that glass.
    ...(process.argv.includes('--glass-command-palette')
      ? { setGlass: (on: boolean) => ipcRenderer.send('window:glass', on) }
      : {})
  },
  // Main says, as the window is made, whether the menu is the glass palette.
  palette: {
    native: process.argv.includes('--glass-command-palette'),
    open: (state: unknown) => ipcRenderer.send('palette:open', state),
    onCommand: (listener: (id: string) => void) => listen('palette:command', listener),
    onOpenNote: (listener: (note: unknown) => void) => listen('palette:openNote', listener),
    onShow: (listener: (state: unknown, maxHeight: number) => void) => {
      const handler = (_event: unknown, state: unknown, maxHeight: number): void =>
        listener(state, maxHeight)
      ipcRenderer.on('palette:show', handler)
      return () => {
        ipcRenderer.removeListener('palette:show', handler)
      }
    },
    onFit: (listener: (maxHeight: number) => void) => listen('palette:fit', listener),
    onVisible: (listener: (visible: boolean) => void) => listen('palette:visible', listener),
    run: (id: string) => ipcRenderer.send('palette:run', id),
    openNote: (note: unknown) => ipcRenderer.send('palette:pickNote', note),
    close: () => ipcRenderer.send('palette:close'),
    setHeight: (height: number) => ipcRenderer.send('palette:height', height)
  },
  // A menu on AppKit's glass, in a window of its own; `native` where there is that glass.
  glassMenu: {
    native: process.argv.includes('--glass-command-palette'),
    open: (request: unknown) => ipcRenderer.send('glassMenu:open', request),
    onPicked: (listener: (id: string) => void) => listen('glassMenu:picked', listener),
    onClosed: (listener: () => void) => listen('glassMenu:closed', listener),
    onShow: (listener: (request: unknown) => void) => listen('glassMenu:show', listener),
    setHeight: (height: number) => ipcRenderer.send('glassMenu:height', height),
    pick: (id: string) => ipcRenderer.send('glassMenu:pick', id),
    close: () => ipcRenderer.send('glassMenu:close')
  },
  meta: {
    set: (key: string, value: string) => ipcRenderer.invoke('meta:set', key, value),
    get: (key: string) => ipcRenderer.invoke('meta:get', key)
  },
  media: {
    list: () => ipcRenderer.invoke('media:list'),
    upload: (input: MediaUploadInput) => ipcRenderer.invoke('media:upload', input),
    updateAlt: (key: string, alt: string) => ipcRenderer.invoke('media:updateAlt', key, alt),
    rename: (key: string, filename: string) => ipcRenderer.invoke('media:rename', key, filename),
    delete: (key: string) => ipcRenderer.invoke('media:delete', key),
    uploadPoster: (key: string, bytes: Uint8Array) =>
      ipcRenderer.invoke('media:uploadPoster', key, bytes),
    flushPending: () => ipcRenderer.invoke('media:flushPending')
  },
  assistant: {
    status: () => ipcRenderer.invoke('assistant:status'),
    download: () => ipcRenderer.invoke('assistant:download'),
    cancelDownload: () => ipcRenderer.invoke('assistant:cancelDownload'),
    messages: (noteId: string) => ipcRenderer.invoke('assistant:messages', noteId),
    clear: (noteId: string) => ipcRenderer.invoke('assistant:clear', noteId),
    send: (noteId: string, text: string, requestId: string) =>
      ipcRenderer.invoke('assistant:send', noteId, text, requestId),
    stop: (requestId: string) => ipcRenderer.invoke('assistant:stop', requestId),
    onStatus: (listener: (status: unknown) => void) => {
      const handler = (_event: unknown, status: unknown): void => listener(status)
      ipcRenderer.on('assistant:statusChanged', handler)
      return () => {
        ipcRenderer.removeListener('assistant:statusChanged', handler)
      }
    },
    onChunk: (listener: (chunk: unknown) => void) => {
      const handler = (_event: unknown, chunk: unknown): void => listener(chunk)
      ipcRenderer.on('assistant:chunk', handler)
      return () => {
        ipcRenderer.removeListener('assistant:chunk', handler)
      }
    }
  },
  auth: {
    googleSignIn: () => ipcRenderer.invoke('auth:google'),
    cancelSignIn: () => ipcRenderer.invoke('auth:cancel'),
    current: () => ipcRenderer.invoke('auth:current'),
    signOut: () => ipcRenderer.invoke('auth:signOut')
  }
})
