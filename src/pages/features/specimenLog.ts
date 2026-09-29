import { createContext, useContext } from 'react';

export const REPO_URL = 'https://github.com/iba-1/data-weaver';

/** What a specimen reports to the page: what its component just told the Host App, e.g. `onConfirm()` */
export const SpecimenLog = createContext<(event: string) => void>(() => {});

/** Report what the specimen's component just told the Host App */
export const useSpecimenLog = () => useContext(SpecimenLog);
