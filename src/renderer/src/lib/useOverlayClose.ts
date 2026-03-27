import { useRef, useCallback } from 'react'

/**
 * Returns onMouseDown and onClick handlers for a modal overlay.
 * Only calls `onClose` if the click both started AND ended on the overlay itself,
 * preventing accidental closes when text selection drags outside the dialog.
 */
export function useOverlayClose(onClose: () => void) {
  const mouseDownTarget = useRef<EventTarget | null>(null)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    mouseDownTarget.current = e.target
  }, [])

  const onClick = useCallback((e: React.MouseEvent) => {
    // Only close if mousedown started on the same overlay element
    if (e.target === e.currentTarget && mouseDownTarget.current === e.currentTarget) {
      onClose()
    }
    mouseDownTarget.current = null
  }, [onClose])

  return { onMouseDown, onClick }
}
