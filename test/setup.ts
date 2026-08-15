import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

/**
 * jsdom has no PointerEvent, so fireEvent.pointerDown builds a bare Event and
 * silently drops clientX/clientY. Drawing surfaces then receive NaN
 * coordinates. Back it with MouseEvent, which carries the coordinates.
 */
if (typeof window !== 'undefined' && !('PointerEvent' in window)) {
  class PointerEventPolyfill extends MouseEvent {
    readonly pointerId: number
    readonly pointerType: string
    readonly isPrimary: boolean

    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params)
      this.pointerId = params.pointerId ?? 0
      this.pointerType = params.pointerType ?? 'mouse'
      this.isPrimary = params.isPrimary ?? true
    }
  }
  window.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent
  globalThis.PointerEvent = window.PointerEvent
}

afterEach(cleanup)
