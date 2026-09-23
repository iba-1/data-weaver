import { fireEvent } from '@testing-library/react';

/**
 * jsdom has no layout: every element measures 0×0, so the virtualised review
 * grid would think its viewport is empty and render no rows. These helpers
 * give the grid's scroll viewport a size, and scroll it, the way a browser
 * would. Installed for every test in `setup.ts`.
 */

/** Height (px) the review grid's viewport reports in tests */
export const TEST_VIEWPORT_HEIGHT = 400;
const TEST_VIEWPORT_WIDTH = 1000;

const VIEWPORT_SELECTOR = '[data-review-grid-viewport]';

function isViewport(element: HTMLElement): boolean {
  return element.matches(VIEWPORT_SELECTOR);
}

/** Give the review grid's viewport a size; other elements keep jsdom's 0 */
export function mockReviewGridLayout() {
  const offsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
  const offsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');

  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return isViewport(this) ? TEST_VIEWPORT_HEIGHT : (offsetHeight?.get?.call(this) ?? 0);
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return isViewport(this) ? TEST_VIEWPORT_WIDTH : (offsetWidth?.get?.call(this) ?? 0);
    },
  });
}

/** The review grid's scrollable viewport */
export function reviewGridViewport(): HTMLElement {
  const viewport = document.querySelector<HTMLElement>(VIEWPORT_SELECTOR);
  if (!viewport) throw new Error('The review grid is not rendered');
  return viewport;
}

/** Scroll the review grid to `top` px, as the Importer's scroll wheel would */
export function scrollReviewGrid(top: number) {
  const viewport = reviewGridViewport();
  viewport.scrollTop = top;
  fireEvent.scroll(viewport);
}
