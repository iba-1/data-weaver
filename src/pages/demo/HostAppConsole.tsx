/**
 * The simulated Host App's own UI on the demo page, outside the wizard: the
 * switches that make it misbehave, its store, the latest Import Report and an
 * activity log of every adapter call and wizard event.
 */

import { useId, useSyncExternalStore, type ReactNode } from 'react';
import type { ImportReport } from '@/components/import-wizard';
import {
  artworksSavedTwice,
  registryName,
  type DemoArtwork,
  type DemoHostApp,
  type DemoHostSnapshot,
} from './hostApp';
import { reportCounts } from './events';

const BATCH_SIZES = [3, 5, 100] as const;

interface HostAppConsoleProps {
  host: DemoHostApp;
  batchSize: number;
  onBatchSizeChange: (size: number) => void;
  report: ImportReport<DemoArtwork> | null;
  onReset: () => void;
}

export function HostAppConsole({ host, batchSize, onBatchSizeChange, report, onReset }: HostAppConsoleProps) {
  const snapshot = useSyncExternalStore(host.subscribe, host.getSnapshot);
  const { refuseTitle, loseNextBatch } = snapshot.settings;

  return (
    <div className="demo-console" aria-label="Archivio Serra, the simulated Host App">
      <header className="demo-console__head">
        <p className="demo-eyebrow demo-eyebrow--light">What the Host App sees</p>
        <h2 className="demo-console__title">Archivio Serra</h2>
        <p className="demo-console__note">A simulated backend living in this tab. Nothing leaves your browser.</p>
      </header>

      <Section title="Make the archive misbehave" index={1}>
        <Toggle
          label="Refuse a title"
          checked={refuseTitle.enabled}
          onChange={(enabled) => host.setRefuseTitle({ enabled })}
          description={
            <>
              Rows titled{' '}
              <input
                aria-label="Title to refuse"
                className="demo-inline-input"
                value={refuseTitle.title}
                onChange={(e) => host.setRefuseTitle({ title: e.target.value })}
                spellCheck={false}
              />{' '}
              are rejected, with the reason pinned to their Title cell.
            </>
          }
        />
        <Toggle
          label="Lose the next batch's answer"
          checked={loseNextBatch}
          onChange={(on) => host.setLoseNextBatch(on)}
          description={
            loseNextBatch
              ? 'Armed: the next batch is saved, then the connection drops. Data Weaver sends it again with the same Import Keys.'
              : 'Saves the next batch, then drops the connection once. Turns itself off when it fires.'
          }
        />
        <fieldset className="demo-segmented">
          <legend>Rows per batch</legend>
          <div className="demo-segmented__options">
            {BATCH_SIZES.map((size) => (
              <label key={size} className="demo-segmented__option">
                <input
                  type="radio"
                  name="demo-batch-size"
                  value={size}
                  aria-label={`${size} rows per batch`}
                  checked={batchSize === size}
                  onChange={() => onBatchSizeChange(size)}
                />
                <span>{size}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </Section>

      <Section title="The store" index={2}>
        <Store snapshot={snapshot} />
      </Section>

      <Section title="Latest Import Report" index={3}>
        {report ? (
          <div className="demo-report">
            <p className="demo-report__counts">{reportCounts(report)}</p>
            {report.rejected.length > 0 && (
              <ul className="demo-report__rejected">
                {report.rejected.map((row) => (
                  <li key={row.importKey}>
                    <span className="demo-mono">row {row.rowIndex + 1}</span> {row.reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <p className="demo-empty">No import finished yet. onImportFinished's report will show here.</p>
        )}
      </Section>

      <Section title="Activity" index={4}>
        <ActivityLog snapshot={snapshot} />
      </Section>

      <div className="demo-console__foot">
        <button type="button" className="demo-link-button" onClick={onReset}>
          Reset the archive and start over
        </button>
      </div>
    </div>
  );
}

function Section({ title, index, children }: { title: string; index: number; children: ReactNode }) {
  return (
    <section className="demo-console__section">
      <h3 className="demo-console__section-title">
        <span className="demo-console__section-index">{String(index).padStart(2, '0')}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  description,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description: ReactNode;
}) {
  const labelId = useId();
  return (
    <div className="demo-toggle" data-checked={checked}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        className="demo-switch"
        onClick={() => onChange(!checked)}
      >
        <span className="demo-switch__thumb" />
      </button>
      <div>
        <p id={labelId} className="demo-toggle__label">
          {label}
        </p>
        <p className="demo-toggle__description">{description}</p>
      </div>
    </div>
  );
}

function Store({ snapshot }: { snapshot: DemoHostSnapshot }) {
  const created = snapshot.registry.filter((entry) => entry.createdByImport);
  const twice = artworksSavedTwice(snapshot);

  return (
    <div className="demo-store">
      <dl className="demo-stats">
        <div>
          <dt>Artworks saved</dt>
          <dd>{snapshot.artworks.length}</dd>
        </div>
        <div>
          <dt>Registry</dt>
          <dd>
            {snapshot.registry.length}
            {created.length > 0 && <small> +{created.length} new</small>}
          </dd>
        </div>
        <div>
          <dt>Repeats ignored</dt>
          <dd>{snapshot.repeatsIgnored}</dd>
        </div>
      </dl>
      <p className={twice === 0 ? 'demo-verdict demo-verdict--ok' : 'demo-verdict demo-verdict--bad'} role="status">
        {twice > 0
          ? `${twice} artwork${twice === 1 ? '' : 's'} saved twice!`
          : snapshot.repeatsIgnored > 0
            ? `No artwork saved twice: ${snapshot.repeatsIgnored} repeated row${snapshot.repeatsIgnored === 1 ? ' was' : 's were'} recognised by Import Key.`
            : 'No artwork saved twice.'}
      </p>

      <details className="demo-disclosure" open={snapshot.artworks.length > 0}>
        <summary>Artworks ({snapshot.artworks.length})</summary>
        {snapshot.artworks.length === 0 ? (
          <p className="demo-empty">Empty. Import the sample to fill it.</p>
        ) : (
          <ol className="demo-records">
            {snapshot.artworks.map(({ importKey, rowNumber, record }) => (
              <li key={importKey}>
                <span className="demo-mono demo-records__row">r{rowNumber}</span>
                <span className="demo-records__title">{String(record.title)}</span>
                <span className="demo-records__meta">
                  {registryName(snapshot, record.artist) ?? 'no artist'}
                  {registryName(snapshot, record.owner) && <> · owned by {registryName(snapshot, record.owner)}</>}
                </span>
              </li>
            ))}
          </ol>
        )}
      </details>

      <details className="demo-disclosure">
        <summary>Registry ({snapshot.registry.length})</summary>
        <ul className="demo-records">
          {snapshot.registry.map((entry) => (
            <li key={entry.id}>
              <span className="demo-mono demo-records__row">{entry.id}</span>
              <span className="demo-records__title">
                {entry.name}
                {entry.createdByImport && <span className="demo-stamp">new</span>}
              </span>
              {entry.description && <span className="demo-records__meta">{entry.description}</span>}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function ActivityLog({ snapshot }: { snapshot: DemoHostSnapshot }) {
  if (snapshot.activity.length === 0) {
    return <p className="demo-empty">Adapter calls and wizard events appear here as they happen.</p>;
  }
  return (
    <ol className="demo-log" aria-label="Activity log, newest first">
      {[...snapshot.activity].reverse().map((entry) => (
        <li key={entry.seq} className={`demo-log__entry demo-log__entry--${entry.tone}`}>
          <span className="demo-log__source">{entry.source === 'host' ? 'host' : 'event'}</span>
          <span>{entry.text}</span>
        </li>
      ))}
    </ol>
  );
}
