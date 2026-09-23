import * as React from "react";

/**
 * Element that Radix portals (dialogs, menus, selects) render into.
 * `null` means the default, `document.body`.
 */
export const PortalContainerContext = React.createContext<HTMLElement | null>(null);

export function usePortalContainer(): HTMLElement | undefined {
  return React.useContext(PortalContainerContext) ?? undefined;
}
