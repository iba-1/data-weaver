import "@testing-library/jest-dom";
import { mockReviewGridLayout } from "./reviewGridLayout";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// jsdom has no layout; give the virtualised review grid a viewport to fill
mockReviewGridLayout();
