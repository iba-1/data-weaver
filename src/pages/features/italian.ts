import type { PartialMessageCatalogue } from '@/components/import-wizard';

const righe = (count: number) => (count === 1 ? '1 riga' : `${count} righe`);

/**
 * The Italian entries of the pieces the theming specimen shows, as a Host App
 * would supply them. Plurals are functions; entries left out stay English.
 */
export const ITALIAN: PartialMessageCatalogue = {
  report: {
    title: 'Importazione completata',
    created: ({ count }) => (count === 1 ? '1 importata' : `${count} importate`),
    rejected: ({ count }) => (count === 1 ? '1 rifiutata' : `${count} rifiutate`),
    excluded: ({ count }) => (count === 1 ? '1 esclusa' : `${count} escluse`),
    rejectedTitle: 'Righe rifiutate',
    rejectedDescription: 'Queste righe non sono state importate.',
    excludedTitle: 'Righe escluse',
    excludedDescription: "Hai lasciato fuori queste righe dall'importazione, quindi non sono state inviate.",
    rowHeader: 'Riga',
    fieldHeader: 'Campo',
    reasonHeader: 'Motivo',
    download: 'Scarica le righe rifiutate',
    downloadHint:
      'Questo report non viene conservato quando esci. Scarica le righe rifiutate per correggerle nel tuo foglio di calcolo e importarle di nuovo.',
  },
  fix: {
    open: ({ count }) => `Correggi e riprova (${righe(count)})`,
  },
};
