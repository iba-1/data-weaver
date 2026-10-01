// Throwaway prototype for tickets 25, 26, 28, 29: the wizard in a full-screen
// "drawer", with a SpeakArt-like Output Shape and the old importer's help.
import { ImportWizard, type FieldConfig } from '@/components/import-wizard';
import { createDemoHostApp } from './demo/hostApp';

const isFilled = (v: unknown) => v !== null && v !== undefined && v !== '';
const UNITS = ['M', 'CM', 'MM', 'FT', 'IN'].map((v) => ({ value: v, label: v }));
const CURRENCIES = [
  ['EUR', 'Euro'], ['USD', 'Dollaro statunitense'], ['GBP', 'Sterlina britannica'], ['CHF', 'Franco svizzero'],
].map(([value, label]) => ({ value, label }));

type Key =
  | 'title' | 'author' | 'creationPeriod' | 'technique' | 'dimensionsNotes' | 'netHeight' | 'netWidth' | 'netDepth'
  | 'netLengthUnit' | 'inventoryNumber' | 'amount' | 'amountLow' | 'amountHigh' | 'currency' | 'owner';

const FIELDS: FieldConfig<Key>[] = [
  { key: 'title', label: 'Titolo', type: 'string', required: true, matchKeywords: ['Titolo'] },
  { key: 'author', label: 'Autore', type: 'string', matchKeywords: ['Autore'] },
  { key: 'creationPeriod', label: 'Periodo di creazione', type: 'string', matchKeywords: ['Periodo di creazione'] },
  { key: 'technique', label: 'Tecnica e supporto', type: 'string', matchKeywords: ['Tecnica e supporto', 'tecnica'] },
  { key: 'dimensionsNotes', label: 'Note dimensioni', type: 'string', matchKeywords: ['Note dimensioni'] },
  { key: 'netHeight', label: 'Altezza', type: 'number', matchKeywords: ['Altezza'] },
  { key: 'netWidth', label: 'Larghezza', type: 'number', matchKeywords: ['Larghezza'] },
  { key: 'netDepth', label: 'Profondità', type: 'number', matchKeywords: ['Profondità'] },
  { key: 'netLengthUnit', label: 'Unità di misura', type: 'choice', options: UNITS, matchKeywords: ['Unità di misura'] },
  { key: 'inventoryNumber', label: 'Numero di inventario', type: 'string', matchKeywords: ['Numero di inventario'] },
  {
    key: 'amount', label: 'Valore', type: 'number', matchKeywords: ['Valore'],
    validate: (value, row) =>
      isFilled(value) && isFilled(row.amountLow) && isFilled(row.amountHigh)
        ? { type: 'warning', message: 'valore e intervallo insieme: si tiene il valore, l’intervallo va nelle note' }
        : null,
  },
  { key: 'amountLow', label: 'Valore minimo', type: 'number', matchKeywords: ['Valore minimo'] },
  { key: 'amountHigh', label: 'Valore massimo', type: 'number', matchKeywords: ['Valore massimo'] },
  {
    key: 'currency', label: 'Valuta', type: 'choice', options: CURRENCIES, matchKeywords: ['Valuta'],
    validate: (value, row) =>
      !isFilled(value) && isFilled(row.amount) ? { type: 'warning', message: 'mancante, verrà usato EUR' } : null,
  },
  { key: 'owner', label: 'Proprietario', type: 'string', matchKeywords: ['Proprietario'] },
];

function UploadHelp() {
  const limited = FIELDS.filter((f) => f.type === 'choice');
  return (
    <div className="space-y-4 text-[15px] text-slate-800">
      <h2 className="text-3xl font-bold">FAQ</h2>
      <div className="flex items-center justify-between">
        <p>Qui trovi le risposte alle domande più frequenti sull’import da CSV.</p>
        <a className="flex items-center gap-1 text-slate-900 underline" href="#">Scarica qui il nostro formato csv ⤓</a>
      </div>
      <section className="rounded-md border p-4">
        <h3 className="mb-1 font-semibold">Come devo preparare il file?</h3>
        <p>Una riga per opera, una colonna per campo. Le intestazioni vengono abbinate ai campi automaticamente; puoi correggere l’abbinamento al passo successivo.</p>
      </section>
      <section className="rounded-md border p-4">
        <h3 className="mb-1 font-semibold">Valore o intervallo di valore?</h3>
        <p>Indica un valore singolo oppure un valore minimo e massimo. Se li indichi entrambi, si tiene il valore singolo.</p>
      </section>
      <section className="rounded-md border p-4">
        <h3 className="mb-2 font-semibold">Quali valori sono accettati?</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2">Campo</th>
              <th className="py-2">Valori accettati</th>
            </tr>
          </thead>
          <tbody>
            {limited.map((f) => (
              <tr key={f.key} className="border-b last:border-0">
                <td className="py-2 pr-6 font-medium">{f.label}</td>
                <td className="py-2">
                  {(f.options as { value: string; label: string }[])
                    .map((o) => (o.value === o.label ? o.value : `${o.value} (${o.label})`))
                    .join(', ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

const host = createDemoHostApp();

export default function Proto() {
  return (
    <div className="flex h-screen flex-col bg-white">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <h1 className="text-xl font-semibold">Importa oggetti</h1>
        <span className="text-sm text-slate-600">⤓ Scarica il modello</span>
      </header>
      <main className="min-h-0 flex-1 px-6 py-5">
        <ImportWizard<Record<string, unknown>, Key>
          fields={FIELDS}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          adapter={host.adapter as any}
          uploadHelp={<UploadHelp />}
        />
      </main>
    </div>
  );
}
