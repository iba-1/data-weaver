import { useEffect, type RefObject } from 'react';

const TEXT_FIELD = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

/** Focus on the page itself rather than on any element (e.g. after a cell editor closes) */
function isPageLevel(target: EventTarget | null): boolean {
  return !(target instanceof Element) || target === document.body || target === document.documentElement;
}

/**
 * Keyboard shortcuts for undoing and redoing review changes:
 * Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z and Ctrl/Cmd+Y redo.
 *
 * The listener sits on `window` so the shortcuts still work when nothing is
 * focused (closing a cell editor drops focus to the page). A key press is
 * handled only when focus is on the page itself or inside this wizard (the
 * `.dw-root` around `scopeRef`), so a second wizard or the Host App's own
 * controls are left alone. Text fields keep their native undo: nothing is
 * handled or prevented while focus is in an input, textarea, select or
 * contenteditable element.
 */
export function useUndoRedoShortcuts(
  undo: () => void,
  redo: () => void,
  scopeRef: RefObject<HTMLElement>
) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;

      // With Shift held browsers report 'Z', except some on macOS; Caps Lock gives 'Z' without Shift
      const key = e.key.toLowerCase();
      const action = key === 'z' ? (e.shiftKey ? redo : undo) : key === 'y' ? redo : null;
      if (!action) return;

      if (!isPageLevel(e.target)) {
        const target = e.target as Element;
        if (target.closest(TEXT_FIELD)) return;
        const wizard = scopeRef.current?.closest('.dw-root') ?? scopeRef.current;
        if (!wizard?.contains(target)) return;
      }

      e.preventDefault();
      action();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, scopeRef]);
}
