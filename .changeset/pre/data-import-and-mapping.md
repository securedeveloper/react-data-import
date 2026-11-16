---
"react-data-import": minor
---

Adds `<DataImport>` and `useColumnMapping`.

`<DataImport>` is an unstyled file input and drop zone:

- Without children it renders one labelled `<input type="file">`. Plain children label it. A render prop gets `getRootProps`, `getInputProps`, `open`, `isDragging`, `status`, `progress`, `result` and `error`.
- The first dropped file is imported. Extra files give a `FILES_IGNORED` warning, and directories are ignored.
- It adds no roles, tab stops or styles: the real file input stays the control.

`useColumnMapping(result, schema)` is headless mapping state. It returns:

- the fields, with their columns
- the file's columns, with samples and the field each column is taken by
- the mapping, the missing required fields, `set` (moves a taken column) and `reset`
