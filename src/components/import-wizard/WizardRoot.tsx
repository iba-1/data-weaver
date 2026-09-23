import React, { createContext, useContext, useState } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PortalContainerContext } from '@/components/ui/portal-container';

const InsideWizardRoot = createContext(false);

interface WizardRootProps {
  className?: string;
  children: React.ReactNode;
}

/**
 * Everything the wizard's components need from their surroundings, so a Host
 * App can render them without any setup:
 * - the `dw-root` scope that the library's CSS and theme tokens apply to;
 * - a TooltipProvider;
 * - a portal container inside that scope, so dialogs and menus stay styled.
 *
 * Nested roots are no-ops: components rendered inside the ImportWizard reuse
 * its root.
 */
export function WizardRoot({ className, children }: WizardRootProps) {
  const isNested = useContext(InsideWizardRoot);
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);

  if (isNested) return className ? <div className={className}>{children}</div> : <>{children}</>;

  return (
    <InsideWizardRoot.Provider value={true}>
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
    </InsideWizardRoot.Provider>
  );
}
