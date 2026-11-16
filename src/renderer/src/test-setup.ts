import { afterEach, beforeEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// jsdom ships none of these; the editor's popovers, sliders and the sidenote
// layer ask for all of them.

globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function () {}
}

if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false
    })
  })
}

if (typeof window !== 'undefined' && typeof window.localStorage?.clear !== 'function') {
  const store = new Map<string, string>()
  const localStorageMock: Storage = {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: (key) => (store.has(key) ? store.get(key)! : null),
    key: (index) => Array.from(store.keys())[index] ?? null,
    removeItem: (key) => {
      store.delete(key)
    },
    setItem: (key, value) => {
      store.set(key, String(value))
    }
  }
  Object.defineProperty(window, 'localStorage', { value: localStorageMock, configurable: true })
}

// The renderer talks to the main process through `window.api`. Tests that need
// it install their own mock; this default keeps a component that merely
// touches `window.api.platform` from throwing.
if (typeof window !== 'undefined' && !('api' in window)) {
  Object.defineProperty(window, 'api', {
    value: { platform: 'darwin', frosted: true, theme: { setSource: async () => {} } },
    writable: true,
    configurable: true
  })
}

// jsdom has no top layer. These stand-ins keep the state a test can read — a shown
// popover matches `[data-test-popover-open]`, a modal dialog is `open` — and leave the
// placement, the dim and the focus trap to the browser checks.
if (typeof HTMLElement !== 'undefined' && !HTMLElement.prototype.showPopover) {
  HTMLElement.prototype.showPopover = function (this: HTMLElement) {
    this.setAttribute('data-test-popover-open', '')
  }
  HTMLElement.prototype.hidePopover = function (this: HTMLElement) {
    this.removeAttribute('data-test-popover-open')
  }
  HTMLElement.prototype.togglePopover = function (this: HTMLElement) {
    return this.toggleAttribute('data-test-popover-open')
  }
  // jsdom's own sheet hides every `[popover]`: it never matches `:popover-open`.
  const shown = document.createElement('style')
  shown.textContent = '[popover][data-test-popover-open] { display: block !important; }'
  document.head.append(shown)
}

if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.show = function (this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement, value?: string) {
    if (!this.open) return
    this.open = false
    if (value !== undefined) this.returnValue = value
    this.dispatchEvent(new Event('close'))
  }
}

beforeEach(() => {
  window.localStorage?.clear()
})

// Vitest globals are off, so React Testing Library does not unmount between
// tests on its own.
afterEach(() => {
  cleanup()
})
