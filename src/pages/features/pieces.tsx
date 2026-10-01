/**
 * The UI pieces the page shows, each with its live specimen and the review
 * notes that point at its parts. Targets use the English catalogue's text
 * where a component has no other hook; the page's tests check each one still
 * finds its piece.
 */

import type { ComponentType, ReactNode } from 'react';
import { bySelector, byText, type Note } from './spotlight';
import {
  CommitSpecimen,
  MappingSpecimen,
  ReportSpecimen,
  ResolutionSpecimen,
  ReviewSpecimen,
  WizardSpecimen,
} from './specimens';

export interface Piece {
  id: string;
  path: string;
  /** The lifecycle stage, as the section nav names it */
  stage: string;
  /** The hue of the thread the specimen's frame is woven in, in degrees */
  hue: number;
  title: string;
  lede: ReactNode;
  notes: Note[];
  Specimen: ComponentType;
  /** Whether the header offers the sample spreadsheet */
  offersSample?: boolean;
}

const DIR = 'src/components/import-wizard';

export const PIECES: Piece[] = [
  {
    id: 'piece-wizard',
    hue: 187,
    path: `${DIR}/ImportWizard.tsx`,
    stage: 'Upload',
    title: 'The wizard',
    lede: (
      <>
        The whole import in one component. Drop the sample in and walk it to the Import Report, or drag the frame's
        corner to make it narrow.
      </>
    ),
    offersSample: true,
    Specimen: WizardSpecimen,
    notes: [
      {
        title: 'Step indicator',
        body: "Measures itself: when the labels don't fit its width, only the current step keeps its label. Drag the frame's corner to watch it switch.",
        target: bySelector('[data-step-indicator]'),
      },
      {
        title: 'Help from the catalogue',
        body: (
          <>
            The banner is the catalogue's <code>upload.helpText</code>, or the Host App's own <code>helpText</code>.
          </>
        ),
        target: byText('Upload a spreadsheet with column names', { within: 'p', up: 'div' }),
      },
      {
        title: 'Expected columns',
        body: "A faded preview of the Output Shape's fields, so the Importer knows what the file should hold.",
        target: bySelector('table'),
      },
      {
        title: 'Rules said up front',
        body: 'File types and the size limit come from props, and are checked before the file is read.',
        target: byText('You can upload', { within: 'p' }),
      },
    ],
  },
  {
    id: 'piece-mapping',
    hue: 158,
    path: `${DIR}/ColumnMapper.tsx`,
    stage: 'Map',
    title: 'Column mapping',
    lede: (
      <>
        Every column matched to a field by keywords the Host App lists. The sample's Italian headers (
        <code>Titolo</code>, <code>Artista</code>, <code>Valuta</code>) match on their own.
      </>
    ),
    Specimen: MappingSpecimen,
    notes: [
      {
        title: 'Mapped count',
        body: "How many of the Output Shape's fields have a column.",
        target: byText(/^\d+\/\d+ mapped$/),
      },
      {
        title: 'Auto, then reviewed',
        body: (
          <>
            Columns matched by a field's <code>matchKeywords</code> are marked Auto, for the Importer to check rather
            than fill in.
          </>
        ),
        target: byText('Some columns were auto-matched', { up: 'div' }),
      },
      {
        title: 'One column, one field',
        body: 'Choosing a field takes it from any other column. "Do not import" leaves a column out.',
        target: bySelector('[role="combobox"]'),
      },
      {
        title: 'Required fields hold the step',
        body: 'Continue stays disabled while a required field has no column: set Titolo to "Do not import" to see it.',
        target: byText('Continue to Validation', { within: 'button' }),
      },
    ],
  },
  {
    id: 'piece-review',
    hue: 40,
    path: `${DIR}/DataValidator.tsx`,
    stage: 'Review',
    title: 'Review grid',
    lede: 'Fix the data before anything is sent: edit any cell, search, replace in bulk, exclude rows, undo.',
    Specimen: ReviewSpecimen,
    notes: [
      {
        title: 'Filter by state',
        body: 'All, blocked, with warnings, excluded: each badge narrows the grid. Row 11 of the sample has no title.',
        target: byText(/^All \d+$/, { up: '.flex-wrap' }),
      },
      {
        title: 'Search and replace',
        body: 'Search every cell. Find and Replace counts the cells it will change before changing them.',
        target: bySelector('input[placeholder="Search in data..."]'),
      },
      {
        title: 'Exclude, never drop',
        body: 'Rows with errors hold the import until they are fixed or excluded. Excluded Rows are reported, not dropped.',
        target: byText('Exclude Errors', { within: 'button' }),
      },
      {
        title: 'Undo and redo',
        body: 'Every edit, replace and exclusion can be undone, with Ctrl+Z and Ctrl+Shift+Z too.',
        target: bySelector('[aria-label^="Undo"]', { up: 'div' }),
      },
      {
        title: 'Choice fields',
        body: 'Currency\'s options come live from the archive: "eur" and "Euro" become EUR, anything else is picked from the list.',
        target: byText('Currency', { within: 'th' }),
      },
      {
        title: 'Virtualised rows',
        body: 'Only the rows in view are rendered, each the same height, so large files stay quick to scroll and edit.',
        target: bySelector('[data-review-grid-viewport]'),
      },
    ],
  },
  {
    id: 'piece-resolution',
    hue: 12,
    path: `${DIR}/resolution/ResolutionStep.tsx`,
    stage: 'Link',
    title: 'Resolution',
    lede: 'Every distinct name in the file, looked up once before anything is saved. Nothing is created until the import starts.',
    Specimen: ResolutionSpecimen,
    notes: [
      {
        title: 'Homonyms',
        body: 'Two Mario Rossi in the archive: pick one for the name, or a different one for individual rows.',
        target: byText(/^Several matches/, { within: 'h4, h5', up: 'section' }),
      },
      {
        title: 'Possible Matches',
        body: '"Manzoni, Piero" and "Piero Manzoni", or L. Fontana and the archive\'s Lucio Fontana: kept apart unless merged.',
        target: byText(/^Possibly the same/, { within: 'h4, h5', up: 'section' }),
      },
      {
        title: 'Created once',
        body: 'Anna Bianchi is new: created once, as artist and owner, with the most frequent spelling. The name can be edited.',
        target: byText(/^Will be created/, { within: 'h4, h5', up: 'section' }),
      },
      {
        title: 'Normalised Matches',
        body: 'Names equal once case, spaces and accents are ignored link to the existing record on their own.',
        target: byText(/^Matched existing/, { within: 'h4, h5', up: 'section' }),
      },
    ],
  },
  {
    id: 'piece-commit',
    hue: 230,
    path: `${DIR}/commit/CommitProgress.tsx`,
    stage: 'Commit',
    title: 'Commit',
    lede: 'Rows go to the Host App in batches, each with its Import Key. A batch whose answer is lost is sent again, and nothing is saved twice.',
    Specimen: CommitSpecimen,
    notes: [
      {
        title: 'A real progress bar',
        body: 'Screen readers hear "6 of 12 rows processed", not a percentage.',
        target: bySelector('[role="progressbar"]'),
      },
      {
        title: 'Retries, announced',
        body: 'One live region carries progress and retries together, so neither interrupts the other.',
        target: bySelector('.dw-root [role="status"]'),
      },
      {
        title: 'Hands off',
        body: 'The review is replaced while rows are saved, so nothing changes under the Commit.',
        target: byText('Keep this page open', { within: 'p' }),
      },
    ],
  },
  {
    id: 'piece-report',
    hue: 95,
    path: `${DIR}/commit/ImportReportView.tsx`,
    stage: 'Report',
    title: 'Import Report',
    lede: 'Every row accounted for: imported, rejected with the Host App\'s reason, or excluded by the Importer.',
    Specimen: ReportSpecimen,
    notes: [
      {
        title: 'Counts',
        body: 'Imported, rejected and excluded, at a glance.',
        target: bySelector('ul'),
      },
      {
        title: 'Reasons, by field',
        body: "The Host App's own reason for each Rejected Row, and the field at fault when it names one.",
        target: byText('Rejected rows', { within: 'h4, h5', up: 'section' }),
      },
      {
        title: 'Excluded is not rejected',
        body: 'Rows the Importer left out are listed apart: they never reached the Host App.',
        target: byText('Excluded rows', { within: 'h4, h5', up: 'section' }),
      },
      {
        title: 'Download, fix, retry',
        body: 'The Rejected Rows as a spreadsheet with an error column. Fix & Retry reopens only them, with their original Import Keys.',
        target: byText('Download rejected rows', { within: 'button' }),
      },
    ],
  },
];
