import { useState, useCallback, useRef } from 'react';

interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

interface UseHistoryReturn<T> {
  state: T;
  set: (newState: T | ((prev: T) => T)) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  clear: () => void;
}

const MAX_HISTORY_SIZE = 50;

/**
 * Hook for managing undo/redo history
 */
export function useHistory<T>(initialState: T): UseHistoryReturn<T> {
  const [history, setHistory] = useState<HistoryState<T>>({
    past: [],
    present: initialState,
    future: [],
  });

  // Track if we should skip adding to history (for undo/redo operations)
  const skipHistoryRef = useRef(false);

  const set = useCallback((newState: T | ((prev: T) => T)) => {
    setHistory((prev) => {
      const resolvedState = typeof newState === 'function' 
        ? (newState as (prev: T) => T)(prev.present) 
        : newState;

      // Don't add to history if we're undoing/redoing
      if (skipHistoryRef.current) {
        skipHistoryRef.current = false;
        return { ...prev, present: resolvedState };
      }

      // Limit history size
      const newPast = [...prev.past, prev.present].slice(-MAX_HISTORY_SIZE);

      return {
        past: newPast,
        present: resolvedState,
        future: [], // Clear future on new changes
      };
    });
  }, []);

  const undo = useCallback(() => {
    setHistory((prev) => {
      if (prev.past.length === 0) return prev;

      const newPast = prev.past.slice(0, -1);
      const newPresent = prev.past[prev.past.length - 1];
      const newFuture = [prev.present, ...prev.future];

      return {
        past: newPast,
        present: newPresent,
        future: newFuture,
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((prev) => {
      if (prev.future.length === 0) return prev;

      const newFuture = prev.future.slice(1);
      const newPresent = prev.future[0];
      const newPast = [...prev.past, prev.present];

      return {
        past: newPast,
        present: newPresent,
        future: newFuture,
      };
    });
  }, []);

  const clear = useCallback(() => {
    setHistory((prev) => ({
      past: [],
      present: prev.present,
      future: [],
    }));
  }, []);

  return {
    state: history.present,
    set,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    clear,
  };
}
