# react-data-import

Import `.xlsx` and `.csv` files into React apps as `{ columns, data }` datasets. Built on [javascript-excel](https://github.com/securedeveloper/javascript-excel).

> **1.0 prerelease.** This is `1.0.0-alpha.2` on the `next` tag; the API can still change before 1.0.0. The `latest` tag still points to `0.0.1`, which only reserved the name.

```sh
npm install react-data-import@next
```

```tsx
import { DataImport, importFile } from 'react-data-import';

// A function: read a File as rows, mapped to your fields and validated.
const { columns, data, issues } = await importFile(file, {
  schema: { fields: { email: { aliases: ['E-mail'], required: true }, joined: { type: 'date' } } },
  validate: Contact, // a row function, or any Standard Schema (Zod, Valibot, ArkType)
  maxFileBytes: 10 * 1024 * 1024,
});

// A component: an unstyled file input and drop zone.
<DataImport schema={contacts} onImported={(r) => setRows(r.data)}>
  {({ getRootProps, getInputProps, isDragging, status }) => (
    <div {...getRootProps({ className: isDragging ? 'drop over' : 'drop' })}>
      <label>Choose a file <input {...getInputProps()} /></label>
      <p role="status">{status === 'reading' ? 'Reading…' : null}</p>
    </div>
  )}
</DataImport>
```

- **Formats:** `.xlsx`, `.xlsm`, `.xltx` and `.xltm`, and CSV/TSV in any encoding. The format is detected from the bytes, not the name.
- **Reading:** the header row is detected (title rows skipped, multi-row headers flattened). Types are inferred all-or-nothing, with explicit number and date locales.
- **Mapping and validation:** columns map to your fields by name or alias, with `useColumnMapping` for a mapping UI. Rows are validated with field checks, a row function or a Standard Schema; invalid rows are left out and reported by spreadsheet row.
- **Large and untrusted files:** `maxFileBytes` is checked before reading, an optional Web Worker handles big files, and `AbortSignal` and progress work throughout. Formulas are never evaluated, and rows read from the file are null-prototype objects.
- **React and runtimes:** React 17, 18 and 19; ESM + CJS + types; `"use client"`.
- **The full API** is in [docs/api.md](https://github.com/securedeveloper/react-data-import/blob/main/docs/api.md).

MIT licensed.
