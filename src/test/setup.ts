import "@testing-library/jest-dom";
import { configure } from "@testing-library/react";

// findBy*/waitFor give up after 1 s by default, too short on a loaded machine
configure({ asyncUtilTimeout: 5_000 });
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
