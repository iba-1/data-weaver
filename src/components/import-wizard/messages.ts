import { createContext, useContext } from 'react';
import { ENGLISH_MESSAGES, type ResolvedMessages } from '@/lib/import-wizard/messages';

/**
 * The catalogue the wizard's components read their text from. WizardRoot
 * provides the Host App's; components rendered outside any WizardRoot get the
 * English defaults.
 */
export const MessagesContext = createContext<ResolvedMessages>(ENGLISH_MESSAGES);

/** The message catalogue in effect, every entry ready to call */
export function useMessages(): ResolvedMessages {
  return useContext(MessagesContext);
}
