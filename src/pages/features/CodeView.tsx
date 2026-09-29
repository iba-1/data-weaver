import { useState } from 'react';
import { Check, Copy, FileCode2 } from 'lucide-react';

type TokenKind = 'comment' | 'string' | 'keyword' | 'type' | 'fn' | 'number' | 'tag' | 'plain';

/** A tokenizer for the few TypeScript/TSX shapes the page's snippets use; not a general highlighter */
const TOKEN =
  /(\/\/.*|\/\*.*?\*\/)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)|\b(import|from|export|const|async|await|return|function|type|new|if|throw|of|for)\b|(<\/?[A-Z][\w.]*|\/>)|\b([A-Z][\w]*)\b|\b([a-z_$][\w$]*)(?=\s*\()|\b(\d+)\b/g;

const KINDS: TokenKind[] = ['comment', 'string', 'keyword', 'tag', 'type', 'fn', 'number'];

function tokenize(line: string): Array<{ text: string; kind: TokenKind }> {
  const tokens: Array<{ text: string; kind: TokenKind }> = [];
  let last = 0;
  for (const match of line.matchAll(TOKEN)) {
    if (match.index! > last) tokens.push({ text: line.slice(last, match.index), kind: 'plain' });
    const group = match.slice(1).findIndex((g) => g !== undefined);
    tokens.push({ text: match[0], kind: KINDS[group] });
    last = match.index! + match[0].length;
  }
  if (last < line.length) tokens.push({ text: line.slice(last), kind: 'plain' });
  return tokens;
}

interface CodeViewProps {
  path: string;
  code: string;
  /** Shown in the header, next to the line count */
  note?: string;
}

/** A source file: path, line count, copy button, numbered lines */
export function CodeView({ path, code, note }: CodeViewProps) {
  const lines = code.replace(/\n$/, '').split('\n');
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard refused (e.g. an insecure context): the code stays selectable
    }
  };

  return (
    <div className="wv-box wv-code">
      <div className="wv-box__header wv-code__header">
        <FileCode2 className="wv-icon" aria-hidden="true" />
        <span className="wv-code__path">{path}</span>
        <span className="wv-code__meta">
          {lines.length} lines{note ? ` · ${note}` : ''}
        </span>
        <button type="button" className="wv-btn wv-btn--sm wv-btn--icon" onClick={copy} aria-label={`Copy ${path}`}>
          {copied ? <Check className="wv-icon wv-icon--success" aria-hidden="true" /> : <Copy className="wv-icon" aria-hidden="true" />}
        </button>
      </div>
      <div className="wv-code__body">
        <table>
          <tbody>
            {lines.map((line, i) => (
              <tr key={i}>
                <td className="wv-code__num" data-line={i + 1} aria-hidden="true" />
                <td className="wv-code__line">
                  {tokenize(line).map((token, j) =>
                    token.kind === 'plain' ? (
                      token.text
                    ) : (
                      <span key={j} className={`wv-tok wv-tok--${token.kind}`}>
                        {token.text}
                      </span>
                    )
                  )}
                  {line === '' && '​'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
