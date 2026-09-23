import React, { createContext, useContext, useMemo, useState } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PortalContainerContext } from '@/components/ui/portal-container';
import { resolveMessages, type PartialMessageCatalogue } from '@/lib/import-wizard/messages';
import { MessagesContext } from './messages';

const InsideWizardRoot = createContext(false);

interface WizardRootProps {
  className?: string;
  /**
   * The Host App's message catalogue for everything inside. Entries it leaves
   * out come from the enclosing WizardRoot's catalogue, or English.
   */
  messages?: PartialMessageCatalogue;
  children: React.ReactNode;
}

/**
 * Everything the wizard's components need from their surroundings, so a Host
 * App can render them without any setup:
 * - the `dw-root` scope that the library's CSS and theme tokens apply to;
 * - a TooltipProvider;
 * - a portal container inside that scope, so dialogs and menus stay styled;
 * - the message catalogue the components read their text from.
 *
 * Nested roots only add their `messages`: components rendered inside the
 * ImportWizard reuse its root.
 */
export function WizardRoot({ className, messages, children }: WizardRootProps) {
  const isNested = useContext(InsideWizardRoot);
  const enclosing = useContext(MessagesContext);
  const resolved = useMemo(() => resolveMessages(messages, enclosing), [messages, enclosing]);
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);

  if (isNested) {
    return (
      <MessagesContext.Provider value={resolved}>
        {className ? <div className={className}>{children}</div> : children}
      </MessagesContext.Provider>
    );
  }

  return (
    <InsideWizardRoot.Provider value={true}>
      <MessagesContext.Provider value={resolved}>
        <TooltipProvider>
          <PortalContainerContext.Provider value={portalContainer}>
            {/* Scoped styles only match descendants of .dw-root, so layout
                classes go on an inner element rather than the root itself */}
            <div className="dw-root">
              <div className={className}>{children}</div>
              <div ref={setPortalContainer} className="dw-portal" />
            </div>
          </PortalContainerContext.Provider>
        </TooltipProvider>
      </MessagesContext.Provider>
    </InsideWizardRoot.Provider>
  );
}
