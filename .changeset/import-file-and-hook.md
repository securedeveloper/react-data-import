---
"react-data-import": minor
---

First API, built on javascript-excel 2.0.0-alpha.3 (`javascript-excel/import`):

- `importFile(input, options)` imports an `.xlsx` or `.csv` (`File`, `Blob`, bytes or CSV text) as `{ columns, data, rowNumbers, issues, warnings, meta }`. It handles header detection, type inference with explicit locales, and schema mapping by name or alias. Validation can be field checks, a row function (sync or async), or any Standard Schema such as Zod, Valibot or ArkType, whose output types the rows. Invalid rows are left out and reported with their spreadsheet row number.
- `maxFileBytes` is checked before the file is read. A `worker` client from `javascript-excel/worker` is used for inputs of `workerThreshold` bytes or more. Progress and `AbortSignal` work as usual.
- `previewFile(input, { rows })` reads only the first rows, for preview and picker UIs.
- `useDataImport()` adds React state (`idle`, `reading`, `mapping`, `done`, `error`), abort on unmount and `applyMapping` for a required field the automatic mapping missed. React 17, 18 and 19 are supported.

The `useVersion` placeholder is removed.
