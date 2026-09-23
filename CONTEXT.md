# Data Weaver

A general-purpose React library that lets non-technical people turn messy spreadsheets into clean, validated records for any tabular data model a Host App defines. SpeakArt is the first Host App.

## Language

### Parties

**Host App**:
The application that embeds Data Weaver, defines what data it accepts, and receives the result. SpeakArt is the first one.
_Avoid_: consumer, client, integrator, parent app

**Importer**:
The non-technical person at the keyboard who uploads a spreadsheet and fixes its data, typically gallery, archive or collection staff.
_Avoid_: user (ambiguous with the Host App's developer), operator, uploader

### Data

**Output Shape**:
The Host App's definition of the record each spreadsheet row becomes: its fields, their types, and which fields point to other records. An Output Shape can include Relationship Fields; the Host App's backend turns them into real records.
_Avoid_: schema, model, template, field config

**Relationship Field**:
A field in an Output Shape whose value identifies another record rather than being a plain value, e.g. an Asset's author (a Registry entry) or owner.
_Avoid_: reference, foreign key, lookup, entity field

**Related Record**:
The existing or to-be-created record that a Relationship Field value points to, e.g. the Registry entry for an author. A name is never its identity: different Related Records can share a name.
_Avoid_: entity, linked record, lookup target

**Resolution**:
The step before Commit where each distinct Relationship Field value in the whole file is matched, once, to an existing Related Record or marked to be created. Every value is shown to the Importer, grouped as matched, several matches, will be created, or possibly the same.
_Avoid_: lookup, linking, dedup

**Normalised Match**:
Two values that are equal once case, extra spaces and accents are ignored; they are treated as the same Related Record automatically. Normalising is only for comparing: the stored name keeps the original spelling, preferring the accented and most frequent one.
_Avoid_: fuzzy match, exact match

**Possible Match**:
A value that might be the same Related Record as another but is not a Normalised Match (e.g. `L. Fontana` and `Lucio Fontana`). It is only merged if the Importer confirms; the default is to keep them separate.
_Avoid_: fuzzy match, auto-merge, suggestion

**Homonyms**:
Several existing Related Records that share the same Normalised Match for a value. The Importer must pick one, or create a new one, and can assign individual rows to a different one.
_Avoid_: duplicates

**Excluded Row**:
A row the Importer has deliberately left out of the import. The Host App is told which rows were excluded; rows are never dropped silently.
_Avoid_: skipped row, ignored row, dropped row

### Lifecycle

**Commit**:
Handing the import's rows to the Host App's save function in batches. It starts by creating the new Related Records chosen in Resolution, once each; batches then point at Related Records, never at names. Every row that can be saved is saved; the rest become Rejected Rows. A Commit only ever creates new records; it never updates existing ones.
_Avoid_: submit, upload, save, complete

**Import Key**:
A unique identifier Data Weaver stamps on every row so the Host App can recognise a row it has already saved and ignore the repeat. This is what makes retrying a Commit safe.
_Avoid_: idempotency key, row ID

**Rejected Row**:
A row the Host App refused to save during Commit, always with a reason and, when known, the offending field.
_Avoid_: failed row, faulted row, error row

**Import Report**:
The account shown after a Commit: how many rows were imported, every Rejected Row with its reason, and, as a separate list, the Excluded Rows. It can be downloaded as a spreadsheet of the Rejected Rows. It is not kept after the Importer leaves.
_Avoid_: summary, result page, import log

**Fix & Retry**:
The view where the Importer corrects only the Rejected Rows and commits them again. Rows already imported are locked and hidden; Excluded Rows stay excluded. Only the Rejected Rows are sent again, with their original Import Keys, and the Import Report then covers every outcome so far.
_Avoid_: retry view, error view

### Capabilities

**AI Edit**:
An optional add-on that lets the Importer change many rows with a natural-language instruction. It works only when the Host App enables it and supplies its own AI endpoint.
_Avoid_: AI chat, AI assistant, smart edit
