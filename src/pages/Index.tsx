import { useMemo, useState, type CSSProperties } from 'react';
import { ImportWizard, type ImportReport, type ImportWizardEvent } from '@/components/import-wizard';
import { createDemoHostApp, type DemoArtwork, type DemoField } from './demo/hostApp';
import { demoFields, SAMPLE_FILE_NAME, SAMPLE_PATHS, SAMPLE_ROWS, sampleSpreadsheet } from './demo/outputShape';
import { describeEvent } from './demo/events';
import { HostAppConsole } from './demo/HostAppConsole';
import './demo/demo.css';

const REPO_URL = 'https://github.com/iba-1/data-weaver';

const STEPS: ReadonlyArray<{ title: string; body: string }> = [
  { title: 'Upload the sample', body: 'Download it above and drop it into the wizard. Its Italian headers match the fields on their own.' },
  { title: 'Review', body: 'Row 11 has no title: type one or exclude it. Dates read day-first; "eur" and "Euro" become EUR.' },
  { title: 'Link records', body: 'Pick a Mario Rossi (or one per row), decide on L. Fontana, merge "Manzoni, Piero". Anna Bianchi is created once.' },
  { title: 'Make it fail', body: 'In the archive panel, refuse "Senza titolo" and arm "Lose the next batch\'s answer". Then import.' },
  { title: 'Fix & Retry', body: 'Download the rejected rows, retitle row 8, retry. The store shows every artwork exactly once.' },
];

/** The delay, in steps, of an element's entrance on page load */
const reveal = (step: number) => ({ '--i': step }) as CSSProperties;

function downloadSample() {
  const url = URL.createObjectURL(sampleSpreadsheet());
  const link = document.createElement('a');
  link.href = url;
  link.download = SAMPLE_FILE_NAME;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const Index = () => {
  // One simulated archive for the page's lifetime: importing the same file twice rejects the repeats
  const [host] = useState(createDemoHostApp);
  const fields = useMemo(() => demoFields(host.loadCurrencies), [host]);
  // A new wizard for each import
  const [importRun, setImportRun] = useState(0);
  const [batchSize, setBatchSize] = useState(3);
  const [report, setReport] = useState<ImportReport<DemoArtwork> | null>(null);
  // The wizard says when leaving would lose Rejected Rows not yet fixed
  const [warnOnLeave, setWarnOnLeave] = useState(false);

  const handleEvent = (event: ImportWizardEvent<DemoArtwork>) => {
    const line = describeEvent(event);
    if (line) host.note(line.text, line.tone);
  };

  const startOver = (reset: boolean) => {
    if (warnOnLeave && !window.confirm('Some rows were not imported and this Import Report will be lost. Start over anyway?')) {
      return;
    }
    if (reset) host.reset();
    setReport(null);
    setImportRun((run) => run + 1);
  };

  return (
    <div className="demo">
      <div className="demo-topbar demo-reveal" style={reveal(0)}>
        <span className="demo-wordmark">Data Weaver</span>
        <span className="demo-topbar__tag">Live demo · no AI Edit, no server</span>
        <nav className="demo-topbar__links">
          <a href={`${REPO_URL}#readme`}>README</a>
          <a href={REPO_URL}>GitHub</a>
        </nav>
      </div>

      <header className="demo-hero">
        <div className="demo-hero__intro">
          <p className="demo-eyebrow demo-reveal" style={reveal(1)}>
            A collection import, the whole way through
          </p>
          <h1 className="demo-reveal" style={reveal(2)}>
            From a messy spreadsheet to the archive, with <em>nothing saved twice.</em>
          </h1>
          <p className="demo-lede demo-reveal" style={reveal(3)}>
            Data Weaver is a React import wizard. Here it is embedded in the Archivio Serra, a simulated Host App
            that lives in this tab. Link the file's names to the archive's registry, make the archive refuse a row
            or drop a connection, then fix and retry. The Archivio Serra panel shows everything the archive stores.
          </p>
        </div>

        <aside className="demo-card demo-reveal" style={reveal(4)} aria-label="Sample spreadsheet">
          <div className="demo-card__head">
            <div>
              <p className="demo-card__kicker">Sample spreadsheet</p>
              <p className="demo-card__file">{SAMPLE_FILE_NAME}</p>
            </div>
            <span className="demo-card__stamp" aria-hidden="true">
              {SAMPLE_ROWS.length} rows
              <br />
              {SAMPLE_PATHS.length} paths
            </span>
          </div>
          <table className="demo-paths">
            <caption className="sr-only">What each row of the sample exercises</caption>
            <thead>
              <tr>
                <th scope="col">Rows</th>
                <th scope="col">Path</th>
              </tr>
            </thead>
            <tbody>
              {SAMPLE_PATHS.map(({ rows, path, detail }) => (
                <tr key={path}>
                  <td className="demo-mono">{rows}</td>
                  <td>
                    <strong>{path}</strong> <span>{detail}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="demo-button" onClick={downloadSample}>
            Download the sample (.xlsx)
          </button>
        </aside>
      </header>

      <ol className="demo-steps" aria-label="Walk every path">
        {STEPS.map((step, i) => (
          <li key={step.title} className="demo-reveal" style={reveal(5 + i)}>
            <span className="demo-steps__number" aria-hidden="true">
              {i + 1}
            </span>
            <p className="demo-steps__title">{step.title}</p>
            <p className="demo-steps__body">{step.body}</p>
          </li>
        ))}
      </ol>

      <main className="demo-stage">
        <section className="demo-sheet" aria-label="The import wizard">
          <p className="demo-eyebrow">What the Importer sees</p>
          <ImportWizard<DemoArtwork, DemoField>
            key={importRun}
            fields={fields}
            adapter={host.adapter}
            batchSize={batchSize}
            onImportFinished={setReport}
            onEvent={handleEvent}
            onLeaveWarningChange={setWarnOnLeave}
          />
          {report && (
            <div className="demo-sheet__again">
              <button type="button" className="demo-button demo-button--ghost" onClick={() => startOver(false)}>
                Import another file into the same archive
              </button>
            </div>
          )}
        </section>

        <aside className="demo-console-wrap">
          <HostAppConsole
            host={host}
            batchSize={batchSize}
            onBatchSizeChange={setBatchSize}
            report={report}
            onReset={() => startOver(true)}
          />
        </aside>
      </main>

      <footer className="demo-footer">
        <p>
          Data Weaver · The Archivio Serra and everything it stores are simulated in this tab. Every string inside the wizard
          comes from its message catalogue.
        </p>
      </footer>
    </div>
  );
};

export default Index;
