# react-data-import 1.0: API design

Status: **design, decided** (RDI-0). Afzal accepted all fourteen recommendations in [§12](#12-decisions) on 2026-11-16. **`importFile`, `previewFile`, `useDataImport` (RDI-2), `<DataImport>` and `useColumnMapping` (RDI-3) are implemented** on **javascript-excel 2.0.0-alpha.4**, which ships the [§10](#10-what-belongs-in-javascript-excel) additions as `javascript-excel/import`. The design was written against **javascript-excel 2.0.0-alpha.2**: its reader (`read`, `readSheetNames`, `detectFormat`), its CSV reader (`readCsv`) and `toDataset` with `skipTotals`. It names the additions it needs from javascript-excel in [§10](#10-what-belongs-in-javascript-excel).

The library imports an `.xlsx` or `.csv` file chosen by the user and returns a dataset, `{ columns, data }`, the same shape react-data-export writes. So export → import round-trips.

Conventions: `[to verify]` marks a fact to be checked before code relies on it. Section references like "JSE §5.2" point to [javascript-excel's docs/api.md](https://github.com/securedeveloper/javascript-excel/blob/main/docs/api.md); "RDE §6" points to [react-data-export's](https://github.com/securedeveloper/react-data-export/blob/main/docs/api.md).

## Contents

1. [Principles](#1-principles)
2. [Entry point and packaging](#2-entry-point-and-packaging)
3. [The pipeline](#3-the-pipeline)
4. [`importFile`](#4-importfile)
5. [Headers and types](#5-headers-and-types)
6. [Column mapping](#6-column-mapping)
7. [Validation](#7-validation)
8. [React: `useDataImport`, `<DataImport>`, `useColumnMapping`](#8-react-usedataimport-dataimport-usecolumnmapping)
9. [Big files: limits, preview, worker, abort](#9-big-files-limits-preview-worker-abort)
10. [What belongs in javascript-excel](#10-what-belongs-in-javascript-excel)
11. [Security](#11-security)
12. [Decisions](#12-decisions)

---

## 1. Principles

- **Logic lives in javascript-excel; this package stays thin.** That is the rule for the whole family, and javascript-excel's own §12 Q13 already says header detection, multi-row headers, column mapping and type inference "live in the engine". A Vue or vanilla app gets the same import with the same results. react-data-import adds React state, an unstyled file input and drop zone, and headless mapping state.
- **One result shape for both formats.** CSV and xlsx both end in `{ columns, data }` plus metadata. Callers branch on the content, not on the format.
- **Explicit and reported, not guessed in silence.** Header row, delimiter, encoding, sheet and column types can all be detected. Each detection is reported in `result.meta`, so a UI can show it and let the user override it.
- **Untrusted input by default.** The file comes from a user. The engine's limits stay on, formulas are never evaluated, and rows are null-prototype objects ([§11](#11-security)).
- **Plain functions first.** `importFile` doesn't depend on React, so it works in an event handler, a test, or a server route (with bytes instead of a `File`). The hooks and the component are built on it, as in react-data-export.
- **Same conventions as react-data-export:** React 17–19, ESM + CJS + `.d.ts`, `"use client"`, a side-effect-free import, `AbortSignal`, `onProgress`, errors with `code` checked through `isExcelError`.

## 2. Entry point and packaging

One entry, `react-data-import`:

| export | kind | section |
|---|---|---|
| `importFile`, `previewFile` | functions | §4, §9 |
| `useDataImport` | hook | §8.1 |
| `DataImport` | component (unstyled) | §8.2 |
| `useColumnMapping` | hook (headless) | §8.3 |
| `isExcelError` | re-export from javascript-excel | §4.4 |
| types: `ImportOptions`, `ImportResult`, `ImportedColumn`, `ImportMeta`, `ImportIssue`, `ImportSchema`, `FieldSpec`, `ColumnMapping`, `ImportStatus`, … | own and re-exported | §4–§8 |

- `javascript-excel` is a regular **dependency**, as in react-data-export, at the version that ships the [§10](#10-what-belongs-in-javascript-excel) additions.
- `react` is a peer, `>=17 <20`.
- There are no other runtime dependencies. Schema libraries (Zod, Valibot, …) are supported through a structural interface, not a dependency ([§7](#7-validation)).

## 3. The pipeline

Every import runs the same steps. Each step is a javascript-excel call except the last, which runs the app's own code:

```
input ──► 1 detect ──► 2 read ──► 3 pick sheet ──► 4 header ──► 5 dataset ──► 6 types ──► 7 map ──► 8 validate ──► result
          detectFormat  read /     readSheetNames   detectHeader  toDataset    inferTypes   mapColumns  app's validate
          (+ name/MIME)  readCsv                     (§5.1)        (skipTotals) (§5.2)       (§6)        (§7)
```

1. **Detect the format from the bytes**, not from the file name. `detectFormat` (JSE §5.2) recognises zip and CFB containers. A zip is read as xlsx. CSV has no signature, so it's taken as CSV when the name or MIME type says so (`.csv`, `.tsv`, `.txt`, `text/csv`, `text/plain`, `text/tab-separated-values`) or `format: 'csv'` is given ([Q11](#12-decisions)). Anything else is rejected with javascript-excel's `UNSUPPORTED_FORMAT`, which keeps `details.format` (`'cfb'` is a legacy `.xls` or an encrypted file, `'xlsb'`, `'ods'`, `'unknown'`).
2. **Read.**
   - xlsx: `read(bytes, { sheets: [chosen], styles: false, richText: 'plain', limits, signal, onProgress })`. Only the chosen sheet is parsed; `styles: false` is faster and date detection still works (JSE §5.2). Formula text is kept (`formulas: true`), only so that `skipTotals: 'auto'` can recognise a totals row. It is never evaluated.
   - CSV: `readCsv(bytes, { delimiter: 'auto', encoding, inferTypes: false, maxRows, signal })`. Type inference happens in step 6, so CSV and xlsx get the same rules.
3. **Pick the sheet.** `sheet` is an index, a name, or `'first-visible'` (the default). Hidden and very hidden sheets are only used when named explicitly. `readSheetNames` lists them, without parsing, for `meta.sheets` and for a sheet picker.
4. **Find the header** ([§5.1](#51-header-row)): auto-detected, a given row, several rows flattened, or none.
5. **Build the dataset** with `toDataset(sheet, { headerRow, range, skipTotals: 'auto' })`. Rows are null-prototype objects keyed by deduplicated header text (JSE §4.3).
6. **Settle the column types** ([§5.2](#52-column-types)).
7. **Map** the file's columns to the app's schema, if a schema is given ([§6](#6-column-mapping)).
8. **Validate** each row with the app's function or schema ([§7](#7-validation)), collecting issues per row and field.

Steps 1–7 are framework-free and live in javascript-excel as one function, `importDataset` ([§10](#10-what-belongs-in-javascript-excel), [Q1](#12-decisions)). `importFile` is that function plus `File` handling, worker routing and validation.

## 4. `importFile`

### 4.1 Signature

```ts
export function importFile<Row = Record<string, unknown>>(
  input: File | Blob | ArrayBuffer | Uint8Array | string,   // string = CSV text
  options?: ImportOptions<Row>,
): Promise<ImportResult<Row>>;

export interface ImportOptions<Row> {
  /** 'auto' (default): detect from the bytes, name and MIME type (§3). */
  format?: 'auto' | 'xlsx' | 'csv';
  /** Index, name, or 'first-visible' (default). */
  sheet?: number | string | 'first-visible';
  /** 'auto' (default), a zero-based row, { rows, join } for multi-row headers, or false (no header). §5.1 */
  header?: 'auto' | number | { row?: number; rows: number; join?: string } | false;
  /** Limit to a range, e.g. 'B3:H200'. Default: the used range. */
  range?: string;
  /** 'infer' (default), 'none' (as read), or per-column types by key or title. §5.2 */
  types?: 'infer' | 'none' | Record<string, ColumnType>;
  /** Parsing text as numbers and dates (CSV, and text cells in xlsx). §5.3 */
  locale?: { decimal?: '.' | ','; group?: ',' | '.' | ' ' | "'" | ''; dateOrder?: 'auto' | 'YMD' | 'DMY' | 'MDY' };
  /** CSV only: a delimiter, or 'auto' (default). */
  delimiter?: string | 'auto';
  /** CSV only, when there is no BOM: any TextDecoder label. Default 'utf-8'. */
  encoding?: string;
  /** Drop a trailing SUBTOTAL totals row, as react-data-export writes it. Default 'auto'. */
  skipTotals?: 'auto' | boolean;
  /** Error cells (#N/A, #REF!, …): null plus an issue (default), or kept as { error }. */
  errorCells?: 'null' | 'keep';
  /** Dates: Date objects (default) or serial numbers (xlsx). Time zone for both formats. */
  dates?: 'date' | 'serial';
  dateZone?: 'local' | 'utc';

  /** Map file columns to app fields (§6). */
  schema?: ImportSchema;
  /** A mapping to use instead of the automatic one, e.g. from useColumnMapping (§6). */
  mapping?: ColumnMapping;
  /** Validate rows (§7): a function, or a Standard Schema object (Zod, Valibot, ArkType). */
  validate?: RowValidator<Row> | StandardSchemaLike<Row>;
  /** Stop at the first invalid row, or collect all issues (default). */
  validation?: 'collect' | 'stop';

  /** Bytes; checked before reading. Default: javascript-excel's maxInputBytes. §9 */
  maxFileBytes?: number;
  /** Data rows; more is an error, or a truncation with a warning in preview. §9 */
  maxRows?: number;
  /** javascript-excel read limits, passed through. */
  limits?: Partial<ReadLimits>;
  /** Run steps 1–7 in a worker (§9.3). */
  worker?: WorkerClient;
  signal?: AbortSignal;
  onProgress?: (p: ImportProgress) => void;
  onWarning?: (w: ExcelWarning) => void;
}
```

### 4.2 Result

```ts
export interface ImportResult<Row> {
  /** One per column. With a schema: one per schema field, in schema order (an unmapped field: title and letter '', type 'empty'). */
  columns: ImportedColumn[];
  /** Null-prototype objects keyed by column key (or field name with a schema). */
  data: Row[];
  /** The spreadsheet row number (1-based, as Excel shows it) of each entry in `data`. */
  rowNumbers: number[];
  /** Validation and conversion problems, per row and field. Empty when all is well. */
  issues: ImportIssue[];
  /** File-level warnings from javascript-excel (CSV_FIELD_COUNT, UNSUPPORTED_PART, …). */
  warnings: ExcelWarning[];
  meta: ImportMeta;
}

export interface ImportedColumn {
  key: string;                // unique; from the header text (deduplicated with _2, _3), or the field name
  title: string;              // the header text as in the file ('' if none)
  letter: string;             // source column, 'C'
  type: ColumnType;           // 'string' | 'number' | 'boolean' | 'date' | 'datetime' | 'mixed' | 'empty'
  field?: string;             // the schema field it was mapped to
}

export interface ImportMeta {
  format: 'xlsx' | 'xlsm' | 'xltx' | 'xltm' | 'csv';
  fileName?: string;
  sheet?: { name: string; index: number };
  sheets?: Array<{ name: string; index: number; state: 'visible' | 'hidden' | 'veryHidden' }>;
  header: { rows: number[]; detected: boolean; confidence?: 'high' | 'low' };
  range: string;              // what was read, e.g. 'A3:H120'
  delimiter?: string;         // CSV
  encoding?: string;          // CSV: 'utf-8', 'utf-16le', … ('bom' says whether a BOM decided it)
  bom?: boolean;
  totalsRowSkipped: boolean;
  mapping?: ColumnMapping;    // the mapping that was applied
  unmappedColumns?: string[]; // file columns no field took
}

export interface ImportIssue {
  row: number;                // spreadsheet row number (1-based); 0 for file-level issues
  field?: string;             // the key in data rows: the schema field, or the column key without a schema
  column?: string;            // the source column key (as in ColumnMapping), for cell- and column-level issues
  ref?: string;               // 'C17'
  code: string;               // 'REQUIRED', 'TYPE', 'ERROR_CELL', 'MAPPING_MISSING', 'INVALID' (a validator's issue without a code), or the validator's own code
  message: string;
  severity: 'error' | 'warning';
}
```

- **Round trip with react-data-export.** `columns` is a list of `{ title, key, … }`, which react-data-export accepts as `ColumnDef`s. So `exportDataset(result)` writes the file back. A file written by react-data-export comes back with its rows: `skipTotals: 'auto'` drops the `SUBTOTAL` totals row, and header groups come back flattened ([§5.1](#51-header-row)). A round-trip test belongs in RDI-6.
- **`rowNumbers` is a parallel array**, so `data` rows hold only the file's columns ([Q13](#12-decisions)). Issues use the same row numbers, so a UI can say "row 17: amount is not a number".
- **Typing `Row`.** `Row` is what the caller asserts. With a Standard Schema validator ([§7](#7-validation)) it is the schema's output type, and rows that fail are not in `data`. Without one it is a cast, as with `JSON.parse`.

### 4.3 Behaviour

- **Input.** A `File` gives `meta.fileName` and its MIME type for detection. A `Blob` or bytes are detected from content only. A string is CSV text. `importFile` reads a `File` with `arrayBuffer()` after checking `size` against `maxFileBytes`, so an oversized file is rejected before any bytes are loaded.
- **Progress.** `ImportProgress` is `{ phase: 'unzip' | 'parse' | 'dataset' | 'validate', ratio }`, non-decreasing and ending at 1. The `unzip`, `parse` and `dataset` phases come from javascript-excel. `validate` is counted in rows and takes the last 10% when there is validation. There is no `read` phase: reading a `File` into memory gives no progress events.
- **Empty input.** A sheet or file with no cells resolves with no columns and no data, not an error. `importFile` reports it as a file-level issue (`EMPTY`, severity `warning`), so a UI can show "the file is empty" without a `try`.
- **Several sheets.** One call imports one sheet. `meta.sheets` lists all of them, so a UI can offer a picker and call again with `sheet`. A whole-workbook import is a later addition ([Q12](#12-decisions)).

### 4.4 Errors

`importFile` rejects for problems that stop the import. The errors are javascript-excel's, unchanged, so `isExcelError(err)` and `err.code` work as in react-data-export:

| situation | code | suggested message for users |
|---|---|---|
| `.xls` or an encrypted/password-protected file | `UNSUPPORTED_FORMAT`, `details.format: 'cfb'` | "This is an old .xls or a password-protected file. Save it as .xlsx and try again." |
| `.xlsb`, `.ods`, unknown bytes | `UNSUPPORTED_FORMAT` | "This file type isn't supported. Use .xlsx or .csv." |
| zip without a workbook | `NOT_XLSX` | "This doesn't look like an Excel file." |
| damaged file | `ZIP_INVALID`, `ZIP_CRC_MISMATCH`, `XML_MALFORMED`, … | "The file is damaged." |
| zip encrypted with a password at the zip level | `ZIP_ENCRYPTED` | "This file is password-protected." |
| file over `maxFileBytes`, rows over `maxRows`, engine limits | `LIMIT_EXCEEDED`, `details.limit` | "The file is too large (limit: …)." |
| sheet name or index not found | `SHEET_NOT_FOUND` (new, [§10](#10-what-belongs-in-javascript-excel)) | |
| `validation: 'stop'` and an invalid row | `VALIDATION_FAILED` (new), `details.issues` | |
| abort | `signal.reason` (an `AbortError`), as `fetch` does | |

Misuse (an unknown `format`, a `header.rows` below 1, both `mapping` and an unmatched `schema`) is a `TypeError`, as in javascript-excel and react-data-export. The messages above are suggestions for the docs. The library keeps its own messages technical, and apps localise them by code.

## 5. Headers and types

### 5.1 Header row

`header` accepts:

- `'auto'` (default): detect ([Q3](#12-decisions)).
- A zero-based row index: like `toDataset`'s `headerRow`.
- `{ row, rows, join }`: a header of `rows` rows starting at `row` (default: detected), flattened into one title per column with `join` (default `' / '`). Merged cells are expanded first, so a group title merged over three columns prefixes all three: `Q1 / Jan`, `Q1 / Feb`, `Q1 / Mar`. That is the header react-data-export's header groups write.
- `false`: no header. Keys and titles are the column letters.

**Detection** (in the engine, `detectHeader`):
- Scan the first 25 rows of the used range (javascript-excel's `detectHeader`, `maxScan`). Checked by the RDI-6 fixtures (`packages/react-data-import/test/fixtures/`): blank rows above the table are outside the used range and don't count, but title rows do. A header in rows 1–24 of the scan is found with high confidence. A header in row 25 is found with `confidence: 'low'`, because no data row is left inside the scan. Below that, detection falls back to row 0 (low), and `header: n` reads it. Real exports put a few rows at most above the header, so 25 stays.
- Skip leading **title rows**: rows with a single non-empty cell, or one merged cell spanning the table.
- Pick the first row whose non-empty cells are mostly text and at least as wide as the data rows below it, where the rows below differ in kind (numbers, dates, booleans) in at least one column.
- When several rows above the data are all text and the upper ones are merged across columns, report a multi-row header. Without merges (always the case in CSV), a two-row header is **not** detected: the first row becomes the header and the second a data row, with `confidence: 'high'`. Pass `header: { rows: 2 }` for those files (RDI-6, `two-header-rows.csv`).
- Return the rows, plus `confidence: 'low'` when no row clearly qualifies; then it falls back to row 0. A UI should show the detected header and let the user change it when the confidence is low.

The heuristic is deliberately simple and deterministic, with no scoring weights to tune. Its fixtures are the files in RDI-6: Excel, LibreOffice, Numbers and Google Sheets exports, files with title rows, and react-data-export output with header groups.

### 5.2 Column types

`types: 'infer'` (default) settles one `ColumnType` per column from its non-empty values:

- **xlsx cells already have types.** Numbers, booleans, and dates (numbers with a date format, JSE §3.4.1) come typed from the reader. A column whose non-empty values are all one type gets that type. `date` and `datetime` are told apart by whether any value has a time part. A mix is `'mixed'`, and its values stay as read.
- **Text that looks like numbers or dates** (always the case in CSV, and common in xlsx made by other tools) is converted only when **every** non-empty value in the column converts, under the rules of [§5.3](#53-locale-numbers-and-dates) ([Q4](#12-decisions)). Otherwise the column keeps its text, and each failing value is reported as a `TYPE` issue (severity `warning`) only if the caller asked for that type explicitly. With all-or-nothing there is no threshold to tune, and a code column such as `007`, `012` stays text.
- **Explicit types**, `types: { amount: 'number', joined: 'date' }` (by key or title), force the conversion. Values that don't convert become `null` with a `TYPE` issue (severity `error`).
- `'none'` returns values as read: xlsx typed, CSV all strings.
- Leading/trailing whitespace is trimmed before conversion, never from strings that stay strings.

### 5.3 Locale numbers and dates

javascript-excel's CSV inference accepts only plain decimals and ISO 8601 dates, with "no locale guessing" (JSE §5.3). Real files from Europe or the US contain `1.234,56`, `1,234.56`, `15/01/2024` and `01/15/2024`. `locale` covers them:

- `decimal` and `group` say how numbers are written. Defaults are `'.'` and `''`: plain numbers only, as the engine does today. With `{ decimal: ',', group: '.' }`, `1.234,56` is 1234.56, and a value that doesn't fit the pattern (for example `1,2,3`) does not convert.
- `dateOrder` says how numeric dates are written: `'YMD'`, `'DMY'`, `'MDY'`, or `'auto'` (default). `'auto'` decides per column, and only when the data proves it: a first part above 12 means DMY, a second part above 12 means MDY. A column with no proof (every value has both parts ≤ 12), or with proof both ways, stays text with a `meta`-level warning `DATE_ORDER_AMBIGUOUS` asking for `dateOrder`.
- There is no guessing from the browser's locale ([Q5](#12-decisions)). A file's locale is the author's, not the reader's.

These parsers are framework-free and belong in javascript-excel ([§10](#10-what-belongs-in-javascript-excel)).

## 6. Column mapping

Apps rarely want the file's column names. They want their own fields. A schema describes the fields:

```ts
export interface ImportSchema {
  fields: Record<string, FieldSpec>;
  /** Columns no field takes: dropped (default) or kept under their own keys. */
  unmapped?: 'drop' | 'keep';
}

export interface FieldSpec {
  /** Titles that match this field, besides the field name itself. */
  aliases?: string[];
  required?: boolean;
  type?: ColumnType;           // forces the type (§5.2)
  /** A field-level check; returns a message or undefined. */
  validate?: (value: unknown) => string | undefined;
}

/** field → source column key, or null when unmapped. */
export type ColumnMapping = Record<string, string | null>;
```

```ts
const result = await importFile(file, {
  schema: {
    fields: {
      email: { aliases: ['E-mail', 'Email address'], required: true },
      name: { aliases: ['Full name'] },
      joined: { aliases: ['Start date'], type: 'date' },
    },
  },
});
// result.columns: email, name, joined; result.data: [{ email, name, joined }, …]
```

**Automatic matching** (in the engine, `mapColumns`):
- Titles and aliases are compared after normalisation: case-folded, with whitespace, `_`, `-` and `.` removed, and accents stripped (NFKD). So `E-mail`, `email` and `E MAIL` match.
- Each field takes the first matching column in file order. A column is taken at most once.
- No fuzzy matching or edit distance: a near-miss stays unmapped and is shown to the user ([§8.3](#83-usecolumnmapping-headless)), rather than being guessed wrong.
- **Every row has every schema field.** A field without a column is `null` in each row and still has an entry in `columns`, so rows always have the schema's shape and a validator's `.nullable()` accepts them (javascript-excel JSE-21, from 2.0.0-alpha.4).
- A required field without a column gives a file-level `MAPPING_MISSING` issue (severity `error`), and the rows are still returned, so a mapping UI can fix it and re-apply without re-reading the file.
- `mapping` overrides the automatic result, field by field.

Applying a mapping is a pure function of the dataset (`applyMapping`), so changing it in a UI doesn't read the file again ([§8.3](#83-usecolumnmapping-headless)).

## 7. Validation

```ts
type RowCheck = ImportIssueInput[] | ImportIssueInput | string | undefined;
export type RowValidator<Row> = (row: Row, ctx: { rowNumber: number; index: number }) => RowCheck | Promise<RowCheck>;

export interface ImportIssueInput { field?: string; column?: string; ref?: string; message: string; code?: string; severity?: 'error' | 'warning' }

/** The Standard Schema interface (standardschema.dev), structurally; no dependency. */
export interface StandardSchemaLike<Output> {
  readonly '~standard': {
    readonly version: 1;
    readonly validate: (value: unknown) => StandardResult<Output> | Promise<StandardResult<Output>>;
  };
}
```

- **Two ways to validate, no dependency.**
  - A function: return nothing, a message, or issues.
  - A **Standard Schema** object. Zod 3.24+, Valibot 1.0+ and ArkType 2.0+ implement that interface, so `validate: z.object({ … })`, `v.object({ … })` or `type({ … })` works without adapters, and the result rows are the schema's output. Its issue paths map to `field` ([Q7](#12-decisions)). Verified (RDI-13): the test suite runs the same cases for Zod 4, Valibot 1 and ArkType 2 (output rows, a field issue with its `column` and `ref`, an unmapped optional field as `null`, a required field without a column), and the floors Zod 3.24.0, Valibot 1.0.0 and ArkType 2.0.0 were checked by hand against the built package. ArkType's types are functions that carry `~standard`; a validator is treated as a Standard Schema whenever it has `~standard`, before it is treated as a row function.
- **Order:** field-level `FieldSpec.validate` and type issues come first, then the row validator. Issues without a `code` get `'INVALID'`; issues without a `severity` are errors. With a Standard Schema, an issue's `path` gives its `field` (its first segment).
- **One issue per cell.** Per row and field, the first of these wins: `TYPE`, `REQUIRED` (both javascript-excel's), `FieldSpec.validate`, the row validator. A field with an engine error in the row is not checked again: its `FieldSpec.validate` isn't called, and validator issues on it (Standard Schema or function) are dropped, since they could only describe the `null` the engine left there. A required field without a column (`MAPPING_MISSING`) is treated the same way in every row. Issues without a `field` (row-level checks) and issues on other fields are kept. This changes only what is reported: a row that fails still fails.
- **Validator issues point at the cell.** An issue whose `field` has a column gets that `column` and its `ref` (`'B3'`), unless the validator set them.
- **Invalid rows.** Rows with an `error` issue are **excluded** from `data` and listed in `issues` with their row number. That includes javascript-excel's own row errors (`TYPE`, `REQUIRED`). `warning` issues keep the row. `validation: 'stop'` rejects at the first error with `VALIDATION_FAILED`, with that row's issues in `details.issues`.
- **Async validators** are allowed (for example a uniqueness check against a server). They run one row at a time, in order, and check `signal` between rows. The docs will recommend batching remote checks after import rather than per row.
- Validation runs on the main thread, because functions can't cross into a worker ([§9.3](#93-worker)).

## 8. React: `useDataImport`, `<DataImport>`, `useColumnMapping`

### 8.1 `useDataImport`

```ts
export type ImportStatus = 'idle' | 'reading' | 'mapping' | 'done' | 'error';

export interface UseDataImport<Row> {
  importFile(input: File | Blob | ArrayBuffer | Uint8Array | string, options?: ImportOptions<Row>): Promise<ImportResult<Row>>;
  status: ImportStatus;
  progress: ImportProgress | null;
  result: ImportResult<Row> | null;
  error: unknown;
  /** With a schema and a missing required field, status is 'mapping' until this is called. */
  applyMapping(mapping: ColumnMapping): Promise<ImportResult<Row>>;
  abort(reason?: unknown): void;
  reset(): void;
}

export function useDataImport<Row = Record<string, unknown>>(defaults?: ImportOptions<Row>): UseDataImport<Row>;
```

- The same contract as react-data-export's `useExcelExport` (RDE §5): stable function identities, an `AbortController` per call linked to `options.signal`, abort on unmount, StrictMode-safe "mounted" tracking, and aborts that are neither errors nor `status: 'error'`.
- **`'mapping'`** is the only new state. It's entered when a schema is given and the automatic mapping leaves a required field unmapped. `result` then holds the rows mapped so far and the `MAPPING_MISSING` issues; validators don't add issues for the unmapped fields ([§7](#7-validation)). If a validator rejects every row, `data` is empty, but `useColumnMapping` still shows samples from the file ([§8.3](#83-usecolumnmapping-headless)). `applyMapping` imports again with the new mapping from the bytes the hook kept in memory, so the file is not read again. Steps 2–8 do run again: forced field types must convert from the file's own values, not from values already converted, so the import isn't split at step 7. The kept bytes are released by `reset()` or the next import.
- A new `importFile` call aborts the one in flight. An import replaces the previous result: one file at a time, which is what a form field means.

### 8.2 `<DataImport>` (unstyled)

```tsx
export type DataImportProps<Row> = ImportOptions<Row> & {
  onImported?: (result: ImportResult<Row>) => void;
  onError?: (error: unknown) => void;
  /** Passed to the file input. Default: '.xlsx,.xlsm,.xltx,.xltm,.csv,.tsv,.txt'. */
  accept?: string;
  disabled?: boolean;
  /** Accessible name of the file input when no label is rendered. Default 'Import a spreadsheet'. */
  inputLabel?: string;
  /** A render prop, or plain content that labels the default input. */
  children?: ReactNode | ((api: DataImportRenderApi<Row>) => ReactNode);
};

export interface DataImportRenderApi<Row> {
  /** Spread on the drop zone element: drag events, and data-dragging for styling. */
  getRootProps<T extends HTMLAttributes<HTMLElement>>(props?: T): T;
  /** Spread on an <input type="file">: accept, onChange, a stable id. */
  getInputProps<T extends InputHTMLAttributes<HTMLInputElement>>(props?: T): T;
  /** Opens the file dialog (for a custom button). */
  open(): void;
  isDragging: boolean;
  status: ImportStatus;
  progress: ImportProgress | null;
  result: ImportResult<Row> | null;
  error: unknown;
}
```

```tsx
<DataImport onImported={(r) => setRows(r.data)} schema={contacts}>
  {({ getRootProps, getInputProps, isDragging, status }) => (
    <div {...getRootProps({ className: isDragging ? 'drop over' : 'drop' })}>
      <label>
        Choose a file <input {...getInputProps()} />
      </label>
      <p>or drop an .xlsx or .csv here</p>
      <p role="status">{status === 'reading' ? 'Reading…' : null}</p>
    </div>
  )}
</DataImport>
```

- **Unstyled and wrapper-free.** Without children it renders one `<input type="file">` named by `inputLabel`. With the render prop it renders only what the app returns. Plain (non-function) children label the default input: `<label>{children}<input type="file"></label>`, the one element the component adds, because the label is what names the input. There is no CSS, no class names and no inline styles: the same choice as `<ExcelExport>` (RDE §6).
- **Accessibility.**
  - The file input is always a real `<input type="file">`, so keyboard and screen-reader users get the platform dialog. Dropping is an addition, never the only way.
  - `getRootProps` adds no `role` or `tabIndex`, because a drop zone is not interactive by itself. The input inside it is the control.
  - The default render has an accessible name (`inputLabel`).
  - Status and errors are left to the app's live region. A recipe:

    ```tsx
    <p role="status">{status === 'reading' ? 'Reading the file…' : status === 'done' ? `${result.data.length} rows imported` : ''}</p>
    {error ? <p role="alert">{isExcelError(error) ? messages[error.code] ?? error.message : 'The file could not be read.'}</p> : null}
    ```
  - The input keeps a stable `id` (React's `useId` on 18+, a per-instance id on 17), so an app `<label htmlFor>` works too.
- **Drops:** the first file is imported. When several files are dropped, the others are ignored, with a file-level `FILES_IGNORED` warning in `result.issues` and in what `onImported` gets ([Q12](#12-decisions)). Dropped directories are ignored. `data-dragging` is set while files are over the zone; nested elements don't make it flicker.
- **Choosing the same file again** imports it again: the input's value is cleared after each choice.
- **Errors** go to `onError`, or to `console.error` without it; aborts are not errors. The import options are read from the props when the import starts.
- **`accept`** is a convenience for the file dialog, not a check. Detection in [§3](#3-the-pipeline) decides what a file is.

### 8.3 `useColumnMapping` (headless)

```ts
export interface UseColumnMapping {
  fields: Array<{ name: string; required: boolean; column: string | null }>;
  columns: Array<{ key: string; title: string; letter: string; sample: unknown[]; takenBy: string | null }>;
  mapping: ColumnMapping;
  set(field: string, column: string | null): void;  // moves the column if another field had it
  missingRequired: string[];
  reset(): void;                                      // back to the automatic mapping
}

export function useColumnMapping(result: ImportResult<unknown> | null, schema: ImportSchema): UseColumnMapping;
```

- State only: the app renders the selects or the drag-and-drop UI. `columns[].sample` holds the first few values (three), so a UI can show "E-mail: ada@…, grace@…".
- **Where the columns come from.**
  - From a raw result (`previewFile`, or `importFile` without a schema), every column has its title, letter and sample, and the automatic mapping is javascript-excel's `mapColumns`.
  - From a mapped result (`useDataImport`'s `'mapping'` state), the result's own mapping is the starting point. Mapped columns keep their samples, but the unmapped ones are known only by key (`meta.unmappedColumns`): no letter, no sample. While a required field is unmapped, the samples come from the file's rows before validation, so they are there even when the validator rejects every row.
  - So a mapping screen that shows every column's values should start from `previewFile`, then call `importFile(file, { schema, mapping })`.
- `set(field, column)` throws a `TypeError` for an unknown field or column. A new `result` starts again from its own automatic mapping.
- Pair it with `useDataImport().applyMapping(mapping)`. A **styled** mapping UI is not in 1.0 ([Q6](#12-decisions)). The playground (RDI-9) shows one built on this hook.

## 9. Big files: limits, preview, worker, abort

### 9.1 Limits

- **`maxFileBytes`** is checked against `File.size` (`byteLength` for bytes, the length in characters for CSV text) before any byte is read, and rejects with `LIMIT_EXCEEDED`, `details.limit: 'maxFileBytes'`. Its default is javascript-excel's `maxInputBytes`, 256 MiB, which is measured (JSE §5.2) but is a server-sized ceiling. The docs will tell apps to set a limit that fits their use; no browser-specific default is invented here ([Q10](#12-decisions)).
- **`maxRows`** caps data rows: CSV through `readCsv`'s `maxRows`, xlsx through the reader's `maxCells` and a row check. Exceeding it rejects with `LIMIT_EXCEEDED` (`details.limit: 'maxRows'`), except in preview, where it truncates.
- **`limits`** passes javascript-excel's read limits through unchanged, and they stay on by default (zip bombs, cells, shared strings, XML depth; JSE §8).

### 9.2 Preview

```ts
export function previewFile(input: File | Blob | ArrayBuffer | Uint8Array | string, options?: Omit<ImportOptions, 'validate' | 'validation' | 'mapping'> & { rows?: number }): Promise<ImportResult<Record<string, unknown>>>;
```

Runs steps 1–6 on the first `rows` data rows (default 20) and returns `meta` with the detected header, delimiter, encoding and column types. It doesn't map or validate. A UI can show a preview, a sheet picker, a header-row picker and the mapping step before the full import.

- CSV: `readCsv` with `maxRows` reads only what it needs.
- xlsx: the archive is in memory anyway, but the reader parses the whole chosen sheet today. Preview needs a **row cap in the reader** (`ReadOptions.maxRows`, stopping the sheet's XML stream early) to stay fast on big sheets ([§10](#10-what-belongs-in-javascript-excel)).

### 9.3 Worker

- `worker: WorkerClient` (from `javascript-excel/worker`, created by the app from its own two-line worker file, JSE §5.5) runs steps 1–7 in the worker, through a new worker operation for `importDataset` ([§10](#10-what-belongs-in-javascript-excel)). The worker sends back the dataset: plain rows, cloned once.
- **Validation runs on the main thread**, because validators are functions. So does any `types` or `schema` entry that holds a function (`FieldSpec.validate`): the schema sent to the worker keeps names, aliases, `required` and `type` only. The threshold default is exported as `DEFAULT_WORKER_THRESHOLD`.
- `useDataImport` and `<DataImport>` accept `worker` plus `workerThreshold` (bytes): files at or above it go to the worker, smaller ones stay on the main thread, where the round trip costs more than it saves. The javascript-excel playground uses 1 MiB. The default is a question, not a measurement yet ([Q9](#12-decisions)).
- Without `worker`, everything runs on the main thread. javascript-excel's reader and `readCsv` are chunked where they can be (`readCsv` yields between chunks), but a large xlsx blocks the thread while it parses.

### 9.4 Abort

`signal` reaches `read`/`readCsv` and the worker, and is checked between pipeline steps and between rows during validation. An abort rejects with `signal.reason`. The hook aborts on unmount and when a new import starts.

## 10. What belongs in javascript-excel

Following JSE §12 Q13 and the family rule. Each item is framework-free, so it needs a javascript-excel task before the matching RDI task:

| addition | why it's in the engine | needed by |
|---|---|---|
| `detectHeader(sheet, { range, maxScan })` → `{ rows, confidence }` | any import UI needs it, framework or not | RDI-3 |
| `toDataset` options: `headerRows` + `join` (multi-row flattening, merges expanded), `trim` | a dataset feature; react-data-export's header groups are the round-trip case | RDI-3 |
| `inferColumnTypes(dataset, { locale })` and `coerceColumns(dataset, types)` | the same rules for CSV and xlsx, and for Vue/vanilla | RDI-3 |
| `parseNumber(text, { decimal, group })`, `parseDate(text, { order, zone })` | locale-aware parsing next to the existing ISO-only inference (JSE §5.3) | RDI-3 |
| `mapColumns(columns, schema)` → `{ mapping, missing }`, `applyMapping(dataset, mapping, schema)` | pure functions on the dataset | RDI-4 |
| `ReadOptions.maxRows` (stop a sheet's parse early) | fast preview of big sheets | RDI-2 (preview) |
| `importDataset(input, options)` (steps 1–7 of [§3](#3-the-pipeline)), a new subpath `javascript-excel/import` | one call for every framework; the worker can run it | RDI-2 |
| worker operation `importDataset` | big files without blocking the page | RDI-2 |
| codes `SHEET_NOT_FOUND`, `VALIDATION_FAILED`, issue codes `TYPE`, `REQUIRED`, `MAPPING_MISSING`, `ERROR_CELL`, `EMPTY`, `DATE_ORDER_AMBIGUOUS` (`FILES_IGNORED` stays in react-data-import) | errors stay in one place, checked with `isExcelError` | RDI-2 |

All of it is additive: new optional options, new functions and a new subpath, so it's a javascript-excel minor (JSE §9.1). It doesn't touch the 2.x phases in javascript-excel's docs/design/2x.md.

**What stays in react-data-import:** `File` handling and `maxFileBytes`, worker routing by size, validation (functions, Standard Schema, async), React state (`useDataImport`, `useColumnMapping`), and the unstyled `<DataImport>`.

## 11. Security

The file is untrusted: an attacker controls every byte (JSE §8). On top of javascript-excel's defences:

| threat | defence |
|---|---|
| Zip bombs, huge XML, too many cells or strings | javascript-excel limits, on by default; `maxFileBytes` checked before reading; `maxRows` |
| XXE, entity expansion, deep nesting | javascript-excel's tokenizer (no DTD, no external entities, iterative) |
| **Formula execution** | never. Formulas are not evaluated; data holds the file's cached values. A cached value is whatever the file says, so it is data from the attacker like any other cell. |
| Prototype pollution through header names (`__proto__`, `constructor`) | rows are null-prototype objects (`toDataset`); with a schema, keys come from the app's field names, not the file |
| Formula injection when the imported data is exported again as CSV | javascript-excel's CSV guard is on by default (JSE §5.3), so react-data-export's CSV export escapes it; strings stay strings in xlsx |
| Script injection when rendering imported text | React escapes text; the docs warn never to pass imported strings to `dangerouslySetInnerHTML` or to `href` without checking the scheme (hyperlinks are returned verbatim by the reader) |
| Macro files (`.xlsm`, `.xltm`) | read as data; VBA is never read or run (JSE §5.2, one `UNSUPPORTED_PART` warning) |
| Encrypted and legacy files | rejected with `UNSUPPORTED_FORMAT` before parsing |
| Trusting the extension | the format is detected from the bytes; `accept` only filters the dialog |
| Exfiltration | nothing leaves the browser: no network requests, no `eval`, no inline workers (the app's worker file works under a strict CSP) |
| ReDoS in locale parsing | hand-written scanners, as in javascript-excel's CSV parser |

## 12. Decisions

Each question had a recommendation. All fourteen were accepted on 2026-11-16, so the text above stands as written.

**Q1. Where does the pipeline live?** The engine's building blocks only, with the pipeline written in react-data-import; or the pipeline itself in javascript-excel (`javascript-excel/import`), with `importFile` adding `File` handling, the worker and validation? *Decided (2026-11-16):* the pipeline in javascript-excel. That follows the family rule and JSE §12 Q13, gives Vue and vanilla users the same import, and lets the worker run it as one operation.

**Q2. Function names.** `importFile` / `previewFile` / `useDataImport` / `<DataImport>` / `useColumnMapping`, as in the plan. *Decided (2026-11-16):* keep them. They mirror react-data-export's `exportDataset` / `useExcelExport` / `<ExcelExport>`.

**Q3. Header detection by default.** `header: 'auto'` (detect, report, fall back to row 0) or `0` (as `toDataset`)? *Decided (2026-11-16):* `'auto'`. Exports from other tools often start with title rows, and the result reports what was detected with a confidence, so a UI can let the user correct it.

**Q4. Type inference rule.** All-or-nothing per column, or a majority threshold? *Decided (2026-11-16):* all-or-nothing. It has no threshold to tune, keeps code columns (`007`) as text, and an explicit `types` entry forces a conversion and reports each failure.

**Q5. Locale.** Explicit `locale` only, or guess from the browser? *Decided (2026-11-16):* explicit, with per-column `dateOrder: 'auto'` that decides only when the data proves it, and otherwise warns. A file's locale is its author's, not the reader's browser's.

**Q6. Mapping UI.** Headless only (`useColumnMapping`), or also a styled component? *Decided (2026-11-16):* headless only in 1.0, with the playground showing a styled example built on the hook. That answers the plan's open question the same way `<DataImport>` is unstyled. A styled UI can come later as a separate entry if users ask.

**Q7. Schema libraries.** A plain function only, or Standard Schema too? *Decided (2026-11-16):* both. Standard Schema is a structural interface, so supporting Zod, Valibot and ArkType costs no dependency, and the rows get the schema's output type.

**Q8. Formulas and error cells.** Cached values only, and error cells as `null` plus an `ERROR_CELL` warning (default) or kept as `{ error }`? *Decided (2026-11-16):* as designed, with formula text never in `data`. Anyone who needs formula text can use javascript-excel's `read` with `toDataset({ values: 'cell' })`.

**Q9. Worker.** Explicit `worker` client plus `workerThreshold`, or no worker in 1.0? *Decided (2026-11-16):* explicit client (the app owns the worker file, JSE §12 Q15). The default `workerThreshold` gets measured in RDI-2 on the fixture corpus, not picked now; until then it's 1 MiB, as in the javascript-excel playground.

**Q10. Default `maxFileBytes`.** javascript-excel's 256 MiB, or a lower browser default? *Decided (2026-11-16):* inherit 256 MiB (measured, JSE §5.2), and have the docs and the `<DataImport>` example set an app-specific limit. A lower default would be a number nobody measured.

**Q11. CSV detection.** CSV only when the name, MIME type or `format` says so, or also for any input that decodes as text? *Decided (2026-11-16):* name, MIME type or `format` only. Parsing arbitrary bytes as CSV turns a wrong file into garbage rows instead of a clear `UNSUPPORTED_FORMAT`.

**Q12. Several sheets and several files.** One sheet per call (with `meta.sheets` for a picker) and one file per drop, or `sheet: 'all'` and multi-file drops now? *Decided (2026-11-16):* one and one in 1.0. A whole-workbook import (`importWorkbook`, a dataset per sheet) can be added later without changing `importFile`.

**Q13. Row numbers.** A parallel `rowNumbers` array, or a `__row` key in each row? *Decided (2026-11-16):* the parallel array. Rows keep exactly the file's (or schema's) keys, so they can go straight back into react-data-export, and no key can collide with a column.

**Q14. Engine order.** The [§10](#10-what-belongs-in-javascript-excel) additions ship in a javascript-excel minor before RDI-2/3/4. *Decided (2026-11-16):* yes. Split them into JSE tasks in the order of the table, with `importDataset`, `ReadOptions.maxRows` and `detectHeader` first, so RDI-2 (scaffold, `importFile`, hook) can start on them.
