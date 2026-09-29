/**
 * The live specimens: each is the library's own component, fed the demo's
 * sample file and its simulated archive, the way a Host App would feed it.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Wrench } from 'lucide-react';
import {
  ColumnMapper,
  DataValidator,
  ImportWizard,
  updateMapping,
  WizardRoot,
  type ImportReport,
  type PartialMessageCatalogue,
} from '@/components/import-wizard';
import { useMessages } from '@/components/import-wizard/messages';
import { ResolutionStep } from '@/components/import-wizard/resolution/ResolutionStep';
import { useResolution } from '@/components/import-wizard/resolution/useResolution';
import { CommitProgress } from '@/components/import-wizard/commit/CommitProgress';
import { ImportReportView } from '@/components/import-wizard/commit/ImportReportView';
import { RejectedRowsDownload } from '@/components/import-wizard/commit/RejectedRowsDownload';
import { Button } from '@/components/ui/button';
import { cellText } from '@/lib/import-wizard/values';
import { createDemoHostApp, type DemoArtwork, type DemoField } from '../demo/hostApp';
import { demoFields, SAMPLE_FILE_NAME, SAMPLE_HEADERS } from '../demo/outputShape';
import { useSpecimenLog } from './specimenLog';
import { sampleMappings, sampleSourceRows, useSampleImport } from './sampleImport';

/** The whole wizard, in a frame the reader can narrow */
export function WizardSpecimen() {
  const [host] = useState(() => createDemoHostApp());
  const fields = useMemo(() => demoFields(host.loadCurrencies), [host]);
  const log = useSpecimenLog();

  return (
    <div className="wv-resizable" data-resizable="">
      <ImportWizard<DemoArtwork, DemoField>
        fields={fields}
        adapter={host.adapter}
        onImportFinished={(report) =>
          log(`onImportFinished({ created: ${report.created.length}, rejected: ${report.rejected.length} })`)
        }
      />
    </div>
  );
}

export function MappingSpecimen() {
  const [host] = useState(() => createDemoHostApp());
  const fields = useMemo(() => demoFields(host.loadCurrencies), [host]);
  const [mappings, setMappings] = useState(() => sampleMappings(fields));
  const log = useSpecimenLog();

  return (
    <ColumnMapper<DemoField>
      mappings={mappings}
      fields={fields}
      onMappingChange={(column, field) => {
        setMappings((current) => updateMapping(current, column, field));
        log(`onMappingChange('${column}', ${field ? `'${field}'` : 'null'})`);
      }}
      onConfirm={() => log('onConfirm()')}
    />
  );
}

export function ReviewSpecimen() {
  const [host] = useState(() => createDemoHostApp({ latencyMs: 0 }));
  const sample = useSampleImport(host);
  const log = useSpecimenLog();

  // Keyed apart: the review takes its rows when it mounts, so the loaded one must be a new instance
  if (!sample) {
    return <DataValidator key="loading" validatedRows={[]} fields={[]} isLoading onComplete={() => {}} onBack={() => {}} />;
  }
  return (
    <DataValidator<DemoArtwork, DemoField>
      key="ready"
      validatedRows={sample.rows}
      fields={sample.fields}
      onComplete={() => log('onComplete()')}
      onBack={() => log('onBack()')}
    />
  );
}

export function ResolutionSpecimen() {
  return (
    <WizardRoot>
      <Resolution />
    </WizardRoot>
  );
}

const NO_FIELDS: never[] = [];

function Resolution() {
  const m = useMessages();
  const log = useSpecimenLog();
  const [host] = useState(() => createDemoHostApp({ latencyMs: 300 }));
  const sample = useSampleImport(host);
  const fields = sample?.fields ?? NO_FIELDS;
  // As the review would hand them over: the row with no title left out
  const rows = useMemo(
    () => (sample?.rows ?? []).map((row) => (row.errors.length > 0 ? { ...row, excluded: true } : row)),
    [sample]
  );
  const resolution = useResolution<DemoArtwork, DemoField>({
    fields,
    rows,
    adapter: host.adapter,
    messages: m,
    active: sample !== null,
  });

  // Look the names up once, as the wizard does when the step opens
  const started = useRef(false);
  const { start } = resolution;
  useEffect(() => {
    if (!sample || started.current) return;
    started.current = true;
    void start();
  }, [sample, start]);

  const titles = useMemo(() => new Map(rows.map((row) => [row.rowIndex, cellText(row.data.title)])), [rows]);

  return (
    <ResolutionStep
      kinds={resolution.kinds}
      lookup={resolution.lookup}
      resolved={resolution.resolved}
      names={resolution.names}
      blockers={resolution.blockers}
      canCommit={resolution.canCommit}
      rowCount={rows.filter((row) => !row.excluded).length}
      describeRow={(rowIndex) => titles.get(rowIndex) ?? ''}
      onNameChange={resolution.setName}
      onChoose={resolution.choose}
      onChooseForRow={resolution.chooseForRow}
      onMergeChange={resolution.setMerge}
      onRetry={() => void start()}
      onBack={() => log('onBack()')}
      onComplete={() => log('onComplete()')}
    />
  );
}

/** A Commit of the sample's 12 rows in batches of 3, where the third batch's answer is lost once */
const COMMIT_FRAMES: ReadonlyArray<{
  done: number;
  retry: { attempt: number; attempts: number } | null;
  ms: number;
  caption: string;
}> = [
  { done: 0, retry: null, ms: 1000, caption: 'Batch 1 of 4 sent: 3 rows, each with its Import Key.' },
  { done: 3, retry: null, ms: 1000, caption: 'Batch 2 of 4: one outcome per row comes back.' },
  { done: 6, retry: null, ms: 900, caption: 'Batch 3 of 4 sent… and its answer never arrives.' },
  { done: 6, retry: { attempt: 2, attempts: 3 }, ms: 1800, caption: 'Sent again with the same Import Keys: rows saved the first time are not saved twice.' },
  { done: 9, retry: null, ms: 1000, caption: 'Batch 4 of 4.' },
  { done: 12, retry: null, ms: 2400, caption: 'Every row has an outcome. Next: the Import Report.' },
];

export function CommitSpecimen() {
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true);
  const current = COMMIT_FRAMES[frame];

  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => setFrame((f) => (f + 1) % COMMIT_FRAMES.length), current.ms);
    return () => clearTimeout(timer);
  }, [frame, playing, current.ms]);

  return (
    <div className="wv-commit">
      <WizardRoot>
        <CommitProgress done={current.done} total={12} retry={current.retry} />
      </WizardRoot>
      <div className="wv-commit__narration">
        <p>
          <span className="wv-counter">{frame + 1}/{COMMIT_FRAMES.length}</span> {current.caption}
        </p>
        <button type="button" className="wv-btn wv-btn--sm" onClick={() => setPlaying((p) => !p)}>
          {playing ? 'Pause' : 'Play'}
        </button>
      </div>
    </div>
  );
}

/** A sample import's outcome: the archive refused two rows, and the row with no title was excluded */
function sampleReport(): { report: ImportReport<DemoArtwork>; rows: DemoArtwork[] } {
  const source = sampleSourceRows();
  const fields = demoFields(async () => []);
  const record = (rowIndex: number) =>
    Object.fromEntries(
      sampleMappings(fields).flatMap((mapping) =>
        mapping.targetField ? [[mapping.targetField, source[rowIndex][mapping.sourceColumn]]] : []
      )
    ) as DemoArtwork;
  const row = (rowIndex: number) => ({ importKey: `key-${rowIndex}`, rowIndex, record: record(rowIndex) });
  const all = source.map((_, i) => i);

  return {
    rows: all.map(record),
    report: {
      created: all.filter((i) => ![4, 7, 10].includes(i)).map(row),
      rejected: [
        {
          ...row(4),
          cause: 'host',
          reason: 'The archive already holds this artwork: imports only create new ones.',
        },
        {
          ...row(7),
          cause: 'host',
          field: 'title',
          reason: 'The archive does not accept "Senza titolo" as a title: add what tells this work apart, e.g. "Senza titolo (blu)".',
        },
      ],
      excluded: [row(10)],
    },
  };
}

/** The Import Report of a sample import, in the catalogue's language */
export function ReportSpecimen({ messages }: { messages?: PartialMessageCatalogue }) {
  return (
    <WizardRoot messages={messages}>
      <Report />
    </WizardRoot>
  );
}

function Report() {
  const m = useMessages();
  const log = useSpecimenLog();
  const fields = useMemo(() => demoFields(async () => []), []);
  const { report, rows } = useMemo(sampleReport, []);
  const source = useMemo(() => sampleSourceRows(), []);

  return (
    <ImportReportView
      report={report}
      fields={fields}
      actions={
        <div className="space-y-3">
          <RejectedRowsDownload
            file={{ headers: [...SAMPLE_HEADERS], rows: source, fileName: SAMPLE_FILE_NAME }}
            mappings={sampleMappings(fields)}
            fields={fields}
            rejected={report.rejected}
            unedited={rows}
            acceptedFileTypes={['.xlsx', '.csv']}
          />
          <div className="flex justify-end">
            <Button size="lg" className="gap-2" onClick={() => log('Fix & Retry: the 2 Rejected Rows open for editing')}>
              <Wrench className="h-4 w-4" aria-hidden="true" />
              {m.fix.open({ count: report.rejected.length })}
            </Button>
          </div>
        </div>
      }
    />
  );
}
