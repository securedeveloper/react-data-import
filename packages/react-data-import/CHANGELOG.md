# react-data-import

## 1.0.0-alpha.2

### Minor Changes

- 3f5ec4d: One issue per cell. A field with a javascript-excel error in a row (`TYPE`, `REQUIRED`), or a required field without a column (`MAPPING_MISSING`), is no longer checked again in that row: its `FieldSpec.validate` isn't called, and Standard Schema or function-validator issues on it are dropped. So a value that doesn't convert gives one `TYPE` issue, and an unmapped required field gives one `MAPPING_MISSING` instead of a schema issue per row. Which rows end up in `data` doesn't change. `ImportIssue` gains an optional `column` (the source column key), and validator issues on a field with a column get `column` and `ref`; `ImportIssueInput` accepts both. With javascript-excel 2.0.0-alpha.6, `TYPE`, `ERROR_CELL` and `DATE_ORDER_AMBIGUOUS` issues name the schema field, not the source column. In the `'mapping'` state, `useColumnMapping` shows samples from the file even when a validator rejects every row.
  
  Migration: group issues by `issue.column` if you grouped by the source column key. To detect an unmapped field, check for `MAPPING_MISSING`, not per-row validator issues.

## 1.0.0-alpha.1

### Patch Changes

- 77ed633: With a schema, every imported row has every schema field: a field the file has no column for is `null`, and `columns` lists it with `type: 'empty'`. This comes from javascript-excel 2.0.0-alpha.4 (JSE-21). Before, the key was missing, so a validator's `.nullable()` rejected the row.

## 1.0.0-alpha.0

### Major Changes

- First 1.0 prerelease. react-data-import 1.0 imports `.xlsx` and `.csv` files into React apps as `{ columns, data }` datasets, on javascript-excel 2.0's `javascript-excel/import`. Version 0.0.1 only reserved the name.

### Minor Changes

- 1bd479d: Adds `<DataImport>` and `useColumnMapping`.
  
  `<DataImport>` is an unstyled file input and drop zone:
  
  - Without children it renders one labelled `<input type="file">`. Plain children label it. A render prop gets `getRootProps`, `getInputProps`, `open`, `isDragging`, `status`, `progress`, `result` and `error`.
  - The first dropped file is imported. Extra files give a `FILES_IGNORED` warning, and directories are ignored.
  - It adds no roles, tab stops or styles: the real file input stays the control.
  
  `useColumnMapping(result, schema)` is headless mapping state. It returns:
  
  - the fields, with their columns
  - the file's columns, with samples and the field each column is taken by
  - the mapping, the missing required fields, `set` (moves a taken column) and `reset`
- 36957ad: First API, built on javascript-excel 2.0.0-alpha.3 (`javascript-excel/import`):
  
  - `importFile(input, options)` imports an `.xlsx` or `.csv` (`File`, `Blob`, bytes or CSV text) as `{ columns, data, rowNumbers, issues, warnings, meta }`. It handles header detection, type inference with explicit locales, and schema mapping by name or alias. Validation can be field checks, a row function (sync or async), or any Standard Schema such as Zod, Valibot or ArkType, whose output types the rows. Invalid rows are left out and reported with their spreadsheet row number.
  - `maxFileBytes` is checked before the file is read. A `worker` client from `javascript-excel/worker` is used for inputs of `workerThreshold` bytes or more. Progress and `AbortSignal` work as usual.
  - `previewFile(input, { rows })` reads only the first rows, for preview and picker UIs.
  - `useDataImport()` adds React state (`idle`, `reading`, `mapping`, `done`, `error`), abort on unmount and `applyMapping` for a required field the automatic mapping missed. React 17, 18 and 19 are supported.
  
  The `useVersion` placeholder is removed.
