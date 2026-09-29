import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Download, FileSpreadsheet, KeyRound, ListChecks, Wrench, type LucideIcon } from 'lucide-react';
import { messageKeys } from '@/lib/import-wizard/messages';
import { downloadSample, SAMPLE_FILE_NAME, SAMPLE_HEADERS, SAMPLE_ROWS } from './demo/outputShape';
import { PIECES } from './features/pieces';
import { FeatureRow, HeroShowcase } from './features/Showcase';
import { CodeView } from './features/CodeView';
import { ReportSpecimen } from './features/specimens';
import { ITALIAN } from './features/italian';
import { REPO_URL } from './features/specimenLog';
import './features/features.css';

const [WIZARD, ...STEPS] = PIECES;

const NAV: ReadonlyArray<{ href: string; label: string }> = [
  { href: '#pieces', label: 'Pieces' },
  { href: '#accountability', label: 'Every row' },
  { href: '#adapter', label: 'Adapter' },
  { href: '#theming', label: 'Theming & i18n' },
];

/** Built on: the libraries the wizard itself uses */
const BUILT_ON = ['React 18', 'TypeScript', 'SheetJS', 'Radix UI', 'TanStack Virtual', 'Tailwind, scoped'];

const PROMISES: ReadonlyArray<{ icon: LucideIcon; title: string; body: ReactNode; href: string }> = [
  {
    icon: KeyRound,
    title: 'Import Keys',
    body: 'Every row carries a key the Host App honours, so a batch sent twice after a dropped connection is saved once.',
    href: '#piece-commit',
  },
  {
    icon: ListChecks,
    title: 'Import Report',
    body: (
      <>
        One outcome per row. In the report above: <strong>9 imported, 2 rejected with a reason, 1 excluded</strong>.
      </>
    ),
    href: '#piece-report',
  },
  {
    icon: Wrench,
    title: 'Fix & Retry',
    body: 'Only the Rejected Rows come back for editing, and go out again with their original Import Keys.',
    href: '#piece-report',
  },
];

const ADAPTER_CODE = `import { ImportWizard, type HostAppAdapter } from 'data-weaver';
import 'data-weaver/styles.css';

const adapter: HostAppAdapter<Artwork> = {
  // One outcome per row, matched by Import Key.
  // A key already saved answers 'created' and is not saved again.
  async saveBatch(rows) {
    return api.importArtworks(rows);
  },
  // Each distinct name once, normalised; answer every value, [] when none match.
  async findRelated(kind, values) {
    return api.registryCandidates(values);
  },
  // Called once per new name, when the import starts, before any row.
  async createRelated(kind, name) {
    const { id } = await api.createRegistry({ name });
    return id;
  },
};

export function ArtworkImport() {
  return (
    <ImportWizard
      fields={artworkFields}
      adapter={adapter}
      batchSize={50}
      messages={catalogue}
      onImportFinished={(report) => attach(report.created)}
    />
  );
}
`;

const THEME_CODE = `/* Theme: override the tokens on .dw-root (HSL channels) */
.my-app .dw-root {
  --primary: 212 92% 45%;
  --ring: 212 92% 45%;
  --radius: 0.375rem;
}

// Language: a partial catalogue; missing entries stay English
<ImportWizard messages={{ report: { title: 'Importazione completata' } }} />
`;

type Language = 'en' | 'it';
type WizardTheme = 'default' | 'primer' | 'archivio';
type Mode = 'light' | 'dark';

const WIZARD_THEMES: ReadonlyArray<{ id: WizardTheme; label: string }> = [
  { id: 'default', label: 'Data Weaver' },
  { id: 'primer', label: 'Primer' },
  { id: 'archivio', label: 'Archivio' },
];

const FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:ital,wght@0,400..800;1,400..800&family=Instrument+Serif:ital@0;1&display=swap';

/** The page's typefaces, loaded only when it opens (the demo page uses others) */
function useSiteFonts() {
  useEffect(() => {
    if (document.querySelector(`link[href="${FONTS_URL}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = FONTS_URL;
    document.head.appendChild(link);
  }, []);
}

/** The section in the middle of the viewport */
function useActiveSection(ids: string[]) {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-40% 0px -55% 0px' }
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [ids]);
  return active;
}

/** The delay, in steps, of an element's entrance on page load */
const reveal = (step: number) => ({ '--i': step }) as CSSProperties;
const glow = (hue: number) => ({ '--glow-hue': hue }) as CSSProperties;

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ReadonlyArray<{ id: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="wv-segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={value === option.id}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

const Mark = ({ size = 32 }: { size?: number }) => (
  <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={size} height={size} />
);

const Features = () => {
  const [language, setLanguage] = useState<Language>('it');
  const [wizardTheme, setWizardTheme] = useState<WizardTheme>('primer');
  const [mode, setMode] = useState<Mode>('light');
  const stepIds = useMemo(() => STEPS.map((s) => s.id), []);
  const activeStep = useActiveSection(stepIds);
  const catalogueSize = useMemo(() => messageKeys().length, []);
  useSiteFonts();

  const stats: ReadonlyArray<{ value: ReactNode; label: string }> = [
    { value: catalogueSize, label: 'messages in the catalogue, every one translatable' },
    { value: PIECES.length, label: 'pieces running live on this page' },
    { value: 3, label: 'time zones every test runs in' },
    { value: 0, label: 'Tailwind setup needed in your app' },
  ];

  return (
    <div className="wv">
      <a className="wv-skip" href="#pieces">
        Skip to the pieces
      </a>

      <header className="wv-nav">
        <Link to="/" className="wv-nav__brand" aria-label="Data Weaver live demo">
          <Mark />
          <span>Data Weaver</span>
        </Link>
        <nav aria-label="Page">
          {NAV.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>
        <div className="wv-nav__actions">
          <a className="wv-btn wv-btn--ghost" href={REPO_URL}>
            Source
          </a>
          <Link className="wv-btn wv-btn--outline" to="/">
            Live demo
          </Link>
        </div>
      </header>

      <main>
        <section className="wv-hero" aria-labelledby="hero-title">
          <div className="wv-hero__intro">
            <p className="wv-kicker wv-reveal" style={reveal(0)}>
              A React import wizard
            </p>
            <h1 id="hero-title" className="wv-reveal" style={reveal(1)}>
              Messy spreadsheets in. <em>Clean records</em> out.
            </h1>
            <p className="wv-hero__lede wv-reveal" style={reveal(2)}>
              For the files people actually have. Collection staff fix and link their rows; your app receives records it
              can trust, each one exactly once.
            </p>
            <div className="wv-hero__cta wv-reveal" style={reveal(3)}>
              <Link to="/" className="wv-btn wv-btn--primary wv-btn--lg">
                Try the live demo <ArrowRight className="wv-icon" aria-hidden="true" />
              </Link>
              <a className="wv-btn wv-btn--quiet wv-btn--lg" href={REPO_URL}>
                Read the source
              </a>
            </div>
          </div>
          <button type="button" className="wv-file wv-reveal" style={reveal(4)} onClick={downloadSample}>
            <FileSpreadsheet className="wv-file__icon" aria-hidden="true" />
            <span className="wv-file__name">
              <strong>{SAMPLE_FILE_NAME}</strong>
              <small>
                {SAMPLE_ROWS.length} rows · {SAMPLE_HEADERS.length} columns · the file every piece below starts from
              </small>
            </span>
            <Download className="wv-icon" aria-hidden="true" />
          </button>
          <div className="wv-hero__stage wv-reveal" style={reveal(5)}>
            <HeroShowcase piece={WIZARD} />
          </div>
        </section>

        <section className="wv-built" aria-label="Built on">
          <p>Built on</p>
          <ul>
            {BUILT_ON.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </section>

        <section id="pieces" className="wv-section wv-anchor" aria-labelledby="pieces-title">
          <div className="wv-section__head">
            <h2 id="pieces-title" className="wv-h2">
              Every step, in the <em>Importer's</em> hands
            </h2>
            <p>
              Each piece below is the library's own component, live in this tab against a simulated archive. Open a
              note to see the part it talks about.
            </p>
          </div>
          <nav className="wv-subnav" aria-label="Pieces">
            {STEPS.map((step) => (
              <a key={step.id} href={`#${step.id}`} aria-current={activeStep === step.id ? 'location' : undefined}>
                {step.stage}
              </a>
            ))}
          </nav>
          {STEPS.map((piece, i) => (
            <FeatureRow key={piece.id} piece={piece} flip={i % 2 === 1} />
          ))}
        </section>

        <section id="accountability" className="wv-center wv-anchor" aria-labelledby="accountability-title">
          <h2 id="accountability-title" className="wv-h2">
            Every row accounted for, <em>never dropped silently</em>
          </h2>
          <p className="wv-center__lede">
            Imported, rejected with the Host App's reason, or excluded by the Importer. Retrying is always safe.
          </p>
          <ul className="wv-promises">
            {PROMISES.map(({ icon: Icon, title, body, href }) => (
              <li key={title}>
                <Icon className="wv-icon" aria-hidden="true" />
                <h3>{title}</h3>
                <p>{body}</p>
                <a className="wv-link" href={href}>
                  See it <ArrowRight className="wv-icon" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
          <dl className="wv-stats">
            {stats.map(({ value, label }) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="adapter" className="wv-split wv-anchor" aria-labelledby="adapter-title">
          <div className="wv-split__text">
            <p className="wv-eyebrow">Adapter</p>
            <h2 id="adapter-title" className="wv-h2">
              Three functions <em>connect it</em> to your app
            </h2>
            <dl className="wv-defs">
              <dt>
                <code>saveBatch(rows)</code>
              </dt>
              <dd>Saves one batch and answers one outcome per row: created, or rejected with a reason and a field.</dd>
              <dt>
                <code>findRelated(kind, values)</code>
              </dt>
              <dd>Looks up each distinct name once. Several answers for one name are Homonyms, and the Importer chooses.</dd>
              <dt>
                <code>createRelated(kind, name)</code>
              </dt>
              <dd>Creates a new related record once per name, before any row points at it. Batches carry IDs, never names.</dd>
            </dl>
            <a className="wv-link" href={`${REPO_URL}/blob/main/docs/adr/0001-resolve-related-records-before-commit.md`}>
              Why names are resolved before Commit <ArrowRight className="wv-icon" aria-hidden="true" />
            </a>
          </div>
          <div className="wv-glowbox" style={glow(187)}>
            <CodeView path="src/ArtworkImport.tsx" code={ADAPTER_CODE} note="example" />
          </div>
        </section>

        <section id="theming" className="wv-split wv-split--flip wv-anchor" aria-labelledby="theming-title">
          <div className="wv-split__text">
            <p className="wv-eyebrow">Theming &amp; i18n</p>
            <h2 id="theming-title" className="wv-h2">
              Your look, <em>their language</em>
            </h2>
            <p>
              The wizard ships its own compiled CSS, scoped to <code>.dw-root</code>, so it neither needs nor disturbs
              your styles. Colours and radius are CSS variables. Every piece of text comes from a message catalogue with
              English defaults; your own rejection reasons pass through as you wrote them.
            </p>
            <div className="wv-controls">
              <Segmented<Language>
                label="Language"
                options={[
                  { id: 'en', label: 'English' },
                  { id: 'it', label: 'Italiano' },
                ]}
                value={language}
                onChange={setLanguage}
              />
              <Segmented<WizardTheme> label="Wizard theme" options={WIZARD_THEMES} value={wizardTheme} onChange={setWizardTheme} />
              <Segmented<Mode>
                label="Mode"
                options={[
                  { id: 'light', label: 'Light' },
                  { id: 'dark', label: 'Dark' },
                ]}
                value={mode}
                onChange={setMode}
              />
            </div>
            <CodeView path="host-app.css · tsx" code={THEME_CODE} />
          </div>
          <div className="wv-glowbox" style={glow(40)}>
            <div
              className={`wv-themed wv-theme-${wizardTheme} ${mode === 'dark' ? 'dark' : 'wv-themed--light'}`}
              data-testid="themed-specimen"
            >
              <p className="wv-themed__label">
                ImportReportView · {language === 'it' ? 'Italiano' : 'English'} ·{' '}
                {WIZARD_THEMES.find((t) => t.id === wizardTheme)!.label} · {mode === 'dark' ? 'Dark' : 'Light'}
              </p>
              <ReportSpecimen messages={language === 'it' ? ITALIAN : undefined} />
            </div>
          </div>
        </section>

        <section className="wv-cta" aria-labelledby="cta-title">
          <h2 id="cta-title" className="wv-h2">
            Give your Importers an import <em>they can finish</em>
          </h2>
          <div className="wv-hero__cta">
            <Link to="/" className="wv-btn wv-btn--primary wv-btn--lg">
              Try the live demo
            </Link>
            <a className="wv-btn wv-btn--outline wv-btn--lg" href={`${REPO_URL}#readme`}>
              Read the README
            </a>
          </div>
        </section>
      </main>

      <footer className="wv-footer">
        <div className="wv-footer__cols">
          <div className="wv-footer__brand">
            <Mark size={40} />
            <p>Everything on this page runs in your browser. The archive is simulated.</p>
          </div>
          <nav aria-label="Try it">
            <h3>Try it</h3>
            <Link to="/">Live demo</Link>
            <a href="#pieces">Pieces</a>
            <button type="button" onClick={downloadSample}>
              Sample spreadsheet
            </button>
          </nav>
          <nav aria-label="Learn">
            <h3>Learn</h3>
            <a href={`${REPO_URL}#readme`}>README</a>
            <a href={`${REPO_URL}/blob/main/CONTEXT.md`}>Glossary</a>
            <a href={`${REPO_URL}/tree/main/docs/adr`}>Decisions</a>
          </nav>
          <nav aria-label="Project">
            <h3>Project</h3>
            <a href={REPO_URL}>Source</a>
            <a href={`${REPO_URL}/actions/workflows/ci.yml`}>CI</a>
            <a href={`${REPO_URL}/tree/main/docs/product`}>Purpose and scope</a>
          </nav>
        </div>
        <div className="wv-footer__bar">
          <span>Data Weaver</span>
          <span>First Host App: SpeakArt</span>
        </div>
      </footer>
    </div>
  );
};

export default Features;
