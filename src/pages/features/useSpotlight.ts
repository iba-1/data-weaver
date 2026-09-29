import { useEffect, useRef, useState } from 'react';
import { SPOTLIGHT_ATTRIBUTE, type Target } from './spotlight';

/**
 * Which note is showing, and the outline on the part of the specimen it is
 * about. One note is open at a time (the first to start with); hovering or
 * focusing another shows its part while the pointer or focus is on it.
 */
export function useSpotlight(notes: ReadonlyArray<{ target?: Target }>) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);
  const shown = hovered ?? open;

  useEffect(() => {
    const target = notes[shown]?.target;
    const root = stageRef.current;
    if (!target || !root) return;
    // Specimens load and re-render (the archive answers, Commit moves on): follow the part as it appears or is replaced
    let lit: Element | null = null;
    const light = () => {
      const el = target(root);
      if (el === lit) return;
      lit?.removeAttribute(SPOTLIGHT_ATTRIBUTE);
      el?.setAttribute(SPOTLIGHT_ATTRIBUTE, String(shown + 1));
      lit = el;
    };
    light();
    const observer = new MutationObserver(light);
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      lit?.removeAttribute(SPOTLIGHT_ATTRIBUTE);
    };
  }, [shown, notes]);

  /** Handlers for note `i`'s control */
  const bind = (i: number) => ({
    onMouseEnter: () => setHovered(i),
    onMouseLeave: () => setHovered(null),
    onFocus: () => setHovered(i),
    onBlur: () => setHovered(null),
    onClick: () => setOpen(i),
  });

  return { stageRef, open, shown, bind };
}
