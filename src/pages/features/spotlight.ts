/**
 * Finding the UI piece a review note talks about inside a live specimen.
 * The components expose few stable hooks, so a target is a small function:
 * a CSS selector, or the innermost element showing some text (the English
 * catalogue's), optionally widened to an ancestor.
 */

import type { ReactNode } from 'react';

export type Target = (root: HTMLElement) => Element | null;

/** What a note says about a piece, and the part of the live specimen it is about */
export interface Note {
  title: string;
  body: ReactNode;
  target?: Target;
}

export const bySelector =
  (selector: string, { up }: { up?: string } = {}): Target =>
  (root) => {
    const el = root.querySelector(selector);
    return el && up ? el.closest(up) : el;
  };

function matchesText(el: Element, text: string | RegExp) {
  const content = el.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  return typeof text === 'string' ? content.startsWith(text) : text.test(content);
}

/**
 * The innermost element whose text starts with `text` (or matches it), then
 * its closest ancestor matching `up`, when given
 */
export const byText =
  (text: string | RegExp, { up, within = '*' }: { up?: string; within?: string } = {}): Target =>
  (root) => {
    for (const el of Array.from(root.querySelectorAll(within))) {
      if (!matchesText(el, text)) continue;
      if (Array.from(el.children).some((child) => matchesText(child, text))) continue;
      return up ? el.closest(up) : el;
    }
    return null;
  };

/** The attribute that outlines the piece a note is about */
export const SPOTLIGHT_ATTRIBUTE = 'data-wv-spotlight';
