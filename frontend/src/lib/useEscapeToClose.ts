import { useEffect } from 'react';

/** Lets a keyboard user dismiss an open modal/overlay with Escape — shared by every
 * dismissable modal so Escape support isn't reimplemented (or forgotten) per component. */
export function useEscapeToClose(onClose: () => void, active = true) {
  useEffect(() => {
    if (!active) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, active]);
}
