import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

HTMLCanvasElement.prototype.getContext = vi.fn(() => null)

class ResizeObserverMock {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}

globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver
