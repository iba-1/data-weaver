import { useCallback, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowRight, FileCode2, Terminal } from 'lucide-react';
import type { Piece } from './pieces';
import { REPO_URL, SpecimenLog } from './specimenLog';
import { useSpotlight } from './useSpotlight';

/** A closed accordion body: out of the tab order and the accessibility tree (React 18 has no `inert` prop) */
const CLOSED = { inert: '', 'aria-hidden': true } as const;

/** The glow behind a specimen takes the piece's hue */
const glow = (hue: number) => ({ '--glow-hue': hue }) as CSSProperties;

/**
 * A live specimen in a frame woven in the piece's colour, with a status bar
 * showing what the component last told its Host App
 */
function SpecimenFrame({
  piece,
  stageRef,
  children,
}: {
  piece: Piece;
  stageRef: React.RefObject<HTMLDivElement>;
  children: ReactNode;
}) {
  const [lastEvent, setLastEvent] = useState<string | null>(null);
  const log = useCallback((event: string) => setLastEvent(event), []);

  return (
    <div className="wv-frame" style={glow(piece.hue)}>
      <div className="wv-frame__window">
        <div className="wv-frame__bar">
          <a className="wv-frame__path" href={`${REPO_URL}/blob/main/${piece.path}`}>
            <FileCode2 className="wv-icon" aria-hidden="true" />
            {piece.path.replace('src/components/import-wizard/', '')}
          </a>
          <span className="wv-frame__live">Live</span>
        </div>
        <div ref={stageRef} className="wv-frame__stage dark" data-specimen="">
          <SpecimenLog.Provider value={log}>{children}</SpecimenLog.Provider>
        </div>
        <p className="wv-frame__status" aria-live="polite">
          <Terminal className="wv-icon" aria-hidden="true" />
          {lastEvent ? (
            <>
              Last event: <code>{lastEvent}</code>
            </>
          ) : (
            <>What the component tells its Host App shows up here.</>
          )}
        </p>
      </div>
    </div>
  );
}

/**
 * The hero: the whole wizard, live, with sheet tabs below it naming its
 * parts. A tab shows its caption and outlines the part it names.
 */
export function HeroShowcase({ piece, actions }: { piece: Piece; actions?: ReactNode }) {
  const { stageRef, open, shown, bind } = useSpotlight(piece.notes);
  const { Specimen } = piece;

  return (
    <section id={piece.id} className="wv-hero__showcase" aria-label={piece.title}>
      <SpecimenFrame piece={piece} stageRef={stageRef}>
        <Specimen />
      </SpecimenFrame>
      <div className="wv-sheets" role="group" aria-label={`Parts of ${piece.title}`}>
        {piece.notes.map((note, i) => (
          <button
            key={note.title}
            type="button"
            data-note={i + 1}
            aria-pressed={open === i}
            data-shown={shown === i || undefined}
            {...bind(i)}
          >
            {note.title}
          </button>
        ))}
      </div>
      <p className="wv-sheets__caption" aria-live="polite">
        {piece.notes[shown].body}
      </p>
      {actions && <div className="wv-hero__showcase-actions">{actions}</div>}
    </section>
  );
}

/**
 * One piece as a feature row: its notes, stitched in a column, on one side,
 * the live specimen framed on its glow on the other. The open note outlines
 * the part it is about; hovering another shows that one.
 */
export function FeatureRow({ piece, flip }: { piece: Piece; flip?: boolean }) {
  const { stageRef, open, shown, bind } = useSpotlight(piece.notes);
  const { Specimen } = piece;

  return (
    <section
      id={piece.id}
      className={`wv-row wv-anchor ${flip ? 'wv-row--flip' : ''}`}
      aria-labelledby={`${piece.id}-title`}
      style={glow(piece.hue)}
    >
      <div className="wv-row__text">
        <p className="wv-eyebrow">{piece.stage}</p>
        <h3 id={`${piece.id}-title`}>{piece.title}</h3>
        <p className="wv-row__lede">{piece.lede}</p>
        <ol className="wv-accordion">
          {piece.notes.map((note, i) => {
            const bodyId = `${piece.id}-note-${i}`;
            return (
              <li key={note.title} data-open={open === i || undefined} data-shown={shown === i || undefined}>
                <button type="button" data-note={i + 1} aria-expanded={open === i} aria-controls={bodyId} {...bind(i)}>
                  <span className="wv-accordion__pin" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className="wv-accordion__title">{note.title}</span>
                </button>
                <div id={bodyId} className="wv-accordion__body" {...(open === i ? {} : CLOSED)}>
                  <div>
                    <p>{note.body}</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
        <a className="wv-link" href={`${REPO_URL}/blob/main/${piece.path}`}>
          Read the source <ArrowRight className="wv-icon" aria-hidden="true" />
        </a>
      </div>
      <SpecimenFrame piece={piece} stageRef={stageRef}>
        <Specimen />
      </SpecimenFrame>
    </section>
  );
}
