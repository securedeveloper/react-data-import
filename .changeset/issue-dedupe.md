---
"react-data-import": minor
---

One issue per cell. A field with a javascript-excel error in a row (`TYPE`, `REQUIRED`), or a required field without a column (`MAPPING_MISSING`), is no longer checked again in that row: its `FieldSpec.validate` isn't called, and Standard Schema or function-validator issues on it are dropped. So a value that doesn't convert gives one `TYPE` issue, and an unmapped required field gives one `MAPPING_MISSING` instead of a schema issue per row. Which rows end up in `data` doesn't change. `ImportIssue` gains an optional `column` (the source column key), and validator issues on a field with a column get `column` and `ref`; `ImportIssueInput` accepts both. With javascript-excel 2.0.0-alpha.6, `TYPE`, `ERROR_CELL` and `DATE_ORDER_AMBIGUOUS` issues name the schema field, not the source column. In the `'mapping'` state, `useColumnMapping` shows samples from the file even when a validator rejects every row.

Migration: group issues by `issue.column` if you grouped by the source column key. To detect an unmapped field, check for `MAPPING_MISSING`, not per-row validator issues.
