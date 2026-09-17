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
    value: { platform: 'darwin' },
    writable: true,
    configurable: true
  })
}

beforeEach(() => {
  window.localStorage?.clear()
})

// Vitest globals are off, so React Testing Library does not unmount between
// tests on its own.
afterEach(() => {
  cleanup()
})
