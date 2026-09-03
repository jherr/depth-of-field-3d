import { useEffect } from 'react'
import { useSimStore } from './useSimStore.ts'

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName)
}

/**
 * Keyboard shortcuts for view switching.
 *
 * Uses `event.code` rather than `event.key` so the bindings survive different
 * keyboard layouts, and bails out whenever focus is inside a control -- pressing
 * "1" while dragging the aperture slider should change the aperture, not the view.
 */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return
      const store = useSimStore.getState()
      switch (e.code) {
        case 'KeyV':
          store.toggleView()
          break
        case 'Digit1':
          store.setView('thirdPerson')
          break
        case 'Digit2':
          store.setView('inCamera')
          break
        case 'KeyB':
          store.setBlurEnabled(!store.blurEnabled)
          break
        default:
          return
      }
      e.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
