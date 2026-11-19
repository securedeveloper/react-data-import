# react-data-import

Import `.xlsx` and `.csv` files into React apps as `{ columns, data }` datasets: column mapping to your own fields, validation with a function or any Standard Schema (Zod, Valibot, ArkType), and issues reported by spreadsheet row and cell. Built on [javascript-excel](https://github.com/securedeveloper/javascript-excel).

**Try it:** the [live playground](https://react-data-import-playground.vercel.app/) imports a file, previews it, maps columns and validates with Zod, using the published package.

- [Install](#install)
- [Quick start](#quick-start)
- [`importFile`](#importfile)
- [The hooks: `useDataImport` and `useColumnMapping`](#the-hooks)
- [Issues](#issues)
- [Validation recipes: Zod, Valibot, ArkType, a function](#validation-recipes)
- [Big files and workers](#big-files-and-workers)
- [Security](#security)

## Install

```sh
npm install react-data-import
```

React 17, 18 and 19 are supported (`react` is a peer dependency). The only runtime dependency is javascript-excel. Schema libraries are optional: any object that implements [Standard Schema](https://standardschema.dev) works, with no adapter.

## Quick start

`<DataImport>` renders one `<input type="file">`, with no styles and no wrapper. Plain children label it:

<!-- example: examples/quick-start.tsx -->
```tsx
import { useState } from 'react';
import { DataImport } from 'react-data-import';

export function ContactsUpload() {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  return (
    <>
      <DataImport maxFileBytes={10 * 1024 * 1024} onImported={(result) => setRows(result.data)}>
        Choose a spreadsheet
      </DataImport>
      <p>{rows.length} rows imported</p>
    </>
  );
}
```

With a render prop it renders only what you return, so you can build a drop zone. Spread `getRootProps()` on the zone and `getInputProps()` on a real file input. The input stays the control for keyboard and screen-reader users; dropping is an addition.

<!-- example: examples/drop-zone.tsx -->
```tsx
import { DataImport, isExcelError, type ImportResult } from 'react-data-import';

export function DropZone({ onRows }: { onRows: (result: ImportResult) => void }) {
  return (
    <DataImport maxFileBytes={10 * 1024 * 1024} onImported={onRows}>
      {({ getRootProps, getInputProps, isDragging, status, result, error }) => (
        <div {...getRootProps({ className: isDragging ? 'drop over' : 'drop' })}>
          <label>
            Choose a file <input {...getInputProps()} />
          </label>
          <p>or drop an .xlsx or .csv here</p>
          <p role="status">
            {status === 'reading' ? 'Reading the file…' : status === 'done' && result ? `${result.data.length} rows imported` : ''}
          </p>
          {error ? <p role="alert">{isExcelError(error) ? error.message : 'The file could not be read.'}</p> : null}
        </div>
      )}
    </DataImport>
  );
}
```

- The format is detected from the bytes, not the name: `.xlsx`, `.xlsm`, `.xltx`, `.xltm`, and CSV/TSV (taken as CSV when the name or MIME type says so, or with `format: 'csv'`).
- `accept` (default `.xlsx,.xlsm,.xltx,.xltm,.csv,.tsv,.txt`) only filters the file dialog.
- When several files are dropped, the first is imported and the result gets a `FILES_IGNORED` warning.
- Errors go to `onError`, or to `console.error` without it. Aborts are not errors.
- `<DataImport>` takes every `importFile` option as a prop.

## `importFile`

`importFile(input, options)` is a plain async function: use it in an event handler, a test or a server route. `input` is a `File`, a `Blob`, bytes (`ArrayBuffer`, `Uint8Array`) or CSV text.

A **schema** maps the file's columns to your fields. Titles and aliases match after normalisation (case, spaces, `_`, `-`, `.` and accents are ignored), so `E-mail`, `email` and `E MAIL` all match `email`. There is no fuzzy matching: a near-miss stays unmapped, so you can show it to the user.

<!-- example: examples/import-file.ts -->
```ts
import { importFile, type ImportSchema } from 'react-data-import';

const contacts: ImportSchema = {
  fields: {
    email: { aliases: ['E-mail', 'Email address'], required: true },
    name: { aliases: ['Full name'] },
    joined: { aliases: ['Start date'], type: 'date' },
  },
};

export async function readContacts(file: File) {
  const { columns, data, rowNumbers, issues, meta } = await importFile(file, {
    schema: contacts,
    maxFileBytes: 10 * 1024 * 1024,
  });
  // columns: email, name, joined (schema order); data: [{ email, name, joined }, …]
  // rowNumbers[i]: the spreadsheet row of data[i]; issues: what was left out and why
  console.log(meta.format, meta.header.rows, meta.mapping);
  return { columns, data, rowNumbers, issues };
}
```

What you get back:

| field | |
|---|---|
| `columns` | `{ key, title, letter, type, field? }` per column; with a schema, one per field in schema order. They work as react-data-export column definitions, so the result can be exported again. |
| `data` | the valid rows, as null-prototype objects keyed by column key (or field name). With a schema every row has every field, and an unmapped one is `null`. |
| `rowNumbers` | the spreadsheet row (1-based, as Excel shows it) of each entry in `data`. |
| `issues` | what was wrong, per row and cell ([Issues](#issues)). |
| `warnings` | file-level warnings from javascript-excel (`CSV_FIELD_COUNT`, `UNSUPPORTED_PART`, …). |
| `meta` | what was detected: `format`, `sheet` and `sheets`, `header` (`rows`, `detected`, `confidence`), `range`, `delimiter`, `encoding`, `bom`, `totalsRowSkipped`, `mapping`, `unmappedColumns`. |

Options you'll reach for most:

| option | default | |
|---|---|---|
| `header` | `'auto'` | `'auto'` detects the header (title and blank rows above it are skipped). Or a zero-based row, `{ rows: 2 }` to flatten a two-row header (`Q1 / Jan`), or `false` for none. Check `meta.header.confidence`: when it is `'low'`, let the user pick the row. |
| `sheet` | `'first-visible'` | an index or a name; `meta.sheets` lists them for a picker. |
| `types` | `'infer'` | `'infer'` converts a column only when every value converts, so codes like `007` stay text. `'none'` keeps values as read. `{ amount: 'number' }` forces a type and reports each value that doesn't convert. |
| `locale` | plain numbers, ISO dates | `{ decimal: ',', group: '.' }` reads `1.234,56`; `dateOrder: 'DMY'` reads `15/01/2024`. With `'auto'` (default) the order is decided per column only when the data proves it. Nothing is guessed from the browser. |
| `delimiter`, `encoding` | `'auto'`, `'utf-8'` | CSV only. A BOM (UTF-8, UTF-16) always wins. |
| `skipTotals` | `'auto'` | drops a trailing `SUBTOTAL` totals row, as react-data-export writes it. |
| `maxFileBytes` | 256 MiB | checked before any byte is read. Set a limit that fits your app. |
| `maxRows` | none | more data rows reject with `LIMIT_EXCEEDED`. |
| `validate`, `validation` | none, `'collect'` | a row function or a Standard Schema; `'stop'` rejects at the first invalid row. |
| `signal`, `onProgress` | | `AbortSignal`, and `{ phase, ratio }` progress that ends at 1. |

`previewFile(input, { rows: 20 })` runs the same steps on the first rows, without mapping or validation: use it for a preview, a header-row picker or a mapping screen that shows every column's values.

## The hooks

### `useDataImport`

The state of one import: `status` (`'idle' | 'reading' | 'mapping' | 'done' | 'error'`), `progress`, `result` and `error`. A new import aborts the one in flight, and unmounting aborts too. The options you pass to the hook are defaults for every call.

<!-- example: examples/use-data-import.tsx -->
```tsx
import { useDataImport } from 'react-data-import';

export function Importer() {
  const { importFile, status, progress, result, error, abort, reset } = useDataImport({ maxFileBytes: 10 * 1024 * 1024 });
  return (
    <div>
      <input
        type="file"
        accept=".xlsx,.csv"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          if (file) importFile(file).catch(() => {}); // the error is also in `error`
        }}
      />
      {status === 'reading' ? (
        <p role="status">
          Reading… {progress ? `${Math.round(progress.ratio * 100)}%` : ''} <button onClick={() => abort()}>Cancel</button>
        </p>
      ) : null}
      {status === 'done' && result ? <p role="status">{result.data.length} rows</p> : null}
      {status === 'error' ? <p role="alert">{String(error)}</p> : null}
      <button onClick={reset}>Start over</button>
    </div>
  );
}
```

### `useColumnMapping`

When a schema's required field has no matching column, `useDataImport` stops in `status: 'mapping'`, with the rows mapped so far and a `MAPPING_MISSING` issue. `useColumnMapping` holds the state of a mapping screen: `fields`, the file's `columns` with a few sample values each, the current `mapping`, `set(field, column)` and `missingRequired`. You render the controls. `applyMapping(mapping)` imports again from the bytes the hook kept, without reading the file again.

<!-- example: examples/column-mapping.tsx -->
```tsx
import { useColumnMapping, useDataImport, type ImportSchema } from 'react-data-import';

const schema: ImportSchema = {
  fields: { email: { aliases: ['E-mail'], required: true }, name: {}, phone: {} },
};

export function MappingStep() {
  const { importFile, applyMapping, status, result } = useDataImport({ schema });
  const { fields, columns, mapping, set, missingRequired } = useColumnMapping(result, schema);
  return (
    <div>
      <input type="file" onChange={(e) => e.currentTarget.files?.[0] && importFile(e.currentTarget.files[0]).catch(() => {})} />
      {status === 'mapping' ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            applyMapping(mapping).catch(() => {}); // the file is not read again
          }}
        >
          {fields.map((f) => (
            <label key={f.name}>
              {f.name}
              {f.required ? ' *' : ''}
              <select value={f.column ?? ''} onChange={(e) => set(f.name, e.currentTarget.value || null)}>
                <option value="">(none)</option>
                {columns.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.title} {c.sample.length ? `(${c.sample.join(', ')})` : ''}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <button disabled={missingRequired.length > 0}>Import</button>
        </form>
      ) : null}
    </div>
  );
}
```

A column moves when you give it to another field. From a mapped result, columns no field took are known only by key (no sample); to show every column's values, start the mapping screen from `previewFile`, then call `importFile(file, { schema, mapping })`.

## Issues

Every problem that doesn't stop the import is an issue in `result.issues`. Rows with an `error` issue are left out of `data`; `warning` issues keep the row.

| field | |
|---|---|
| `row` | the spreadsheet row (1-based); `0` for file- and column-level issues |
| `field` | the key in `data` rows: the schema field, or the column key without a schema |
| `column` | the source column key, for cell- and column-level issues |
| `ref` | the cell, `'C17'` |
| `code` | see below, or your validator's own code |
| `message` | a technical message; localise by `code` |
| `severity` | `'error'` or `'warning'` |

| code | severity | when |
|---|---|---|
| `TYPE` | error | a value doesn't convert to a forced type (`types` or `FieldSpec.type`); the cell is `null` |
| `REQUIRED` | error | a required field is empty in a row |
| `MAPPING_MISSING` | error | a required field has no column (row `0`); the rows are still returned so a mapping screen can fix it |
| `INVALID` | error | a field check, a row function or a schema rejected the value, with no code of its own |
| `ERROR_CELL` | warning | an error cell (`#N/A`, `#REF!`, …) became `null` (`errorCells: 'keep'` keeps `{ error }` instead) |
| `EMPTY` | warning | the sheet or file has no data rows |
| `DATE_ORDER_AMBIGUOUS` | warning | a numeric date column could be day-first or month-first; set `locale.dateOrder` |
| `FILES_IGNORED` | warning | `<DataImport>` got several files and imported the first |

**One issue per cell.** For each row and field the first of `TYPE`, `REQUIRED`, the field check and the row validator wins. A field the engine already rejected (or that has no column) is not checked again, so a schema doesn't add "expected string, received null" on top of the real problem.

**Issues point at the cell.** A validator issue on a field gets that field's `column` and `ref`, unless the validator set them.

Problems that stop the import reject instead. They are javascript-excel's errors, unchanged, so check them with `isExcelError(err)` and `err.code`: `UNSUPPORTED_FORMAT` (`.xls`, encrypted, `.xlsb`, `.ods`, unknown), `NOT_XLSX`, `ZIP_INVALID` and other damage codes, `ZIP_ENCRYPTED`, `LIMIT_EXCEEDED` (`details.limit`), `SHEET_NOT_FOUND`, and `VALIDATION_FAILED` with `validation: 'stop'` (`details.issues`). An abort rejects with `signal.reason`.

<!-- example: examples/issues.ts -->
```ts
import { importFile, isExcelError, type ImportIssue } from 'react-data-import';

/** "Row 17, C17 (amount): must be positive", or a file-level message for row 0. */
export function describe(issue: ImportIssue): string {
  const where = issue.row === 0 ? 'File' : `Row ${issue.row}${issue.ref ? `, ${issue.ref}` : ''}`;
  return `${where}${issue.field ? ` (${issue.field})` : ''}: ${issue.message}`;
}

const messages: Record<string, string> = {
  UNSUPPORTED_FORMAT: "This file type isn't supported. Use .xlsx or .csv.",
  LIMIT_EXCEEDED: 'The file is too large.',
  ZIP_ENCRYPTED: 'This file is password-protected.',
};

export async function load(file: File) {
  try {
    const result = await importFile(file, { maxFileBytes: 10 * 1024 * 1024 });
    const errors = result.issues.filter((i) => i.severity === 'error').map(describe);
    const warnings = result.issues.filter((i) => i.severity === 'warning').map(describe);
    return { rows: result.data, errors, warnings };
  } catch (err) {
    // Problems that stop the import reject; javascript-excel's errors carry a code.
    throw new Error(isExcelError(err) ? (messages[err.code] ?? err.message) : 'The file could not be read.');
  }
}
```

## Validation recipes

Pass a schema as `validate`. Valid rows become the schema's **output**, typed: `data` is `z.output<typeof Contact>[]`, with any transform applied. Each schema issue's path gives its `field`, and so its `column` and `ref`. Zod 3.24+, Valibot 1.0+ and ArkType 2.0+ work: the test suite runs the same cases on Zod 4, Valibot 1 and ArkType 2.

Two things to know for every library:

- **Empty and unmapped fields are `null`**, not `undefined` or `''`. Make optional fields nullable.
- **Types are settled before validation.** A column is converted to numbers or dates only when every value converts, so a column of digits (phone numbers, codes) arrives as numbers. Set `type: 'string'` on the field to keep text, or `type: 'number'` to force numbers and report the values that aren't.

### Zod

<!-- example: examples/zod.ts -->
```ts
import { importFile, type ImportSchema } from 'react-data-import';
import { z } from 'zod';

const schema: ImportSchema = {
  fields: {
    email: { aliases: ['E-mail'], required: true },
    age: { type: 'number' },
    phone: { type: 'string' }, // keeps text: a column of digits would be inferred as numbers
  },
};

const Contact = z.object({
  email: z.email(),
  age: z.number().int().min(0).nullable(),
  phone: z.string().nullable(), // an unmapped or empty field is null
});

export async function readWithZod(file: File) {
  const { data, issues } = await importFile(file, { schema, validate: Contact });
  // data: z.output<typeof Contact>[]; an issue on age reads { row, field: 'age', column: 'Age', ref: 'B5', … }
  const emails: string[] = data.map((c) => c.email);
  return { emails, issues };
}
```

### Valibot

<!-- example: examples/valibot.ts -->
```ts
import { importFile, type ImportSchema } from 'react-data-import';
import * as v from 'valibot';

const schema: ImportSchema = {
  fields: {
    email: { aliases: ['E-mail'], required: true },
    age: { type: 'number' },
    phone: { type: 'string' }, // keeps text: a column of digits would be inferred as numbers
  },
};

const Contact = v.object({
  email: v.pipe(v.string(), v.email()),
  age: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
  phone: v.nullable(v.string()), // an unmapped or empty field is null
});

export async function readWithValibot(file: File) {
  const { data, issues } = await importFile(file, { schema, validate: Contact });
  // data: v.InferOutput<typeof Contact>[]
  const emails: string[] = data.map((c) => c.email);
  return { emails, issues };
}
```

### ArkType

<!-- example: examples/arktype.ts -->
```ts
import { type } from 'arktype';
import { importFile, type ImportSchema } from 'react-data-import';

const schema: ImportSchema = {
  fields: {
    email: { aliases: ['E-mail'], required: true },
    age: { type: 'number' },
    phone: { type: 'string' }, // keeps text: a column of digits would be inferred as numbers
  },
};

const Contact = type({
  email: 'string.email',
  age: 'number.integer >= 0 | null',
  phone: 'string | null', // an unmapped or empty field is null
});

export async function readWithArkType(file: File) {
  const { data, issues } = await importFile(file, { schema, validate: Contact });
  // data: typeof Contact.infer[]
  const emails: string[] = data.map((c) => c.email);
  return { emails, issues };
}
```

### A function

No library needed: a field check per field, and a row function that returns nothing, a message, or issues (with your own `code` and `severity`). Row functions may be async (for example a lookup); they run one row at a time and check the abort signal between rows. Prefer batching remote checks after the import over one request per row.

<!-- example: examples/row-function.ts -->
```ts
import { importFile, type ImportSchema } from 'react-data-import';

const schema: ImportSchema = {
  fields: {
    sku: { required: true },
    // A field check: return a message, or undefined when the value is fine.
    quantity: { aliases: ['Qty'], type: 'number', validate: (v) => (typeof v === 'number' && v > 0 ? undefined : 'must be positive') },
    price: { type: 'number' },
  },
};

export async function readOrders(file: File) {
  return importFile<{ sku: string; quantity: number; price: number | null }>(file, {
    schema,
    // A row check: nothing, a message, or issues. Async is allowed; rows run one at a time.
    validate: (row, { rowNumber }) => {
      if (row.price === null) return { field: 'price', message: 'no price; it will be looked up', severity: 'warning', code: 'NO_PRICE' };
      if (row.price > 10_000) return `row ${rowNumber}: price looks wrong`;
      return undefined;
    },
  });
}
```

## Big files and workers

Without a worker everything runs on the main thread. CSV reading yields between chunks, but a large `.xlsx` blocks the page while it parses. To parse in a Web Worker, add a two-line worker file and pass a client as `worker`:

<!-- example: examples/excel.worker.ts -->
```ts
// excel.worker.ts: the app's own worker file.
import { exposeWorker } from 'javascript-excel/worker';

exposeWorker();
```

<!-- example: examples/worker.ts -->
```ts
import { createWorkerClient } from 'javascript-excel/worker';
import { importFile } from 'react-data-import';

// One worker for the page. Files of workerThreshold bytes or more (default 1 MiB) are parsed in it.
const worker = createWorkerClient(new Worker(new URL('./excel.worker.ts', import.meta.url), { type: 'module' }));

export function readBig(file: File, signal: AbortSignal) {
  return importFile(file, {
    worker,
    maxFileBytes: 50 * 1024 * 1024,
    signal,
    onProgress: ({ phase, ratio }) => console.log(phase, Math.round(ratio * 100)),
  });
}
```

- `javascript-excel` is installed with react-data-import. With a strict package manager (pnpm), add it to your own dependencies at the same version.
- Inputs of `workerThreshold` bytes or more (default `DEFAULT_WORKER_THRESHOLD`, 1 MiB) go to the worker; smaller ones stay on the main thread, where the round trip costs more than it saves. `useDataImport` and `<DataImport>` take `worker` and `workerThreshold` too.
- Validation always runs on the main thread, because functions can't cross into a worker.
- `signal` and `onProgress` work across the boundary.

## Security

The file is untrusted input. Formulas are never evaluated (`data` holds the file's cached values), macros are never read, javascript-excel's limits against zip bombs and huge XML stay on, and rows are null-prototype objects, so a header named `__proto__` can't pollute anything. React escapes imported text when you render it; don't pass it to `dangerouslySetInnerHTML`, or to `href` without checking the scheme.

The full design is in [docs/api.md](https://github.com/securedeveloper/react-data-import/blob/main/docs/api.md).

MIT licensed.
