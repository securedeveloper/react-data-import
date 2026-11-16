'use client';

// react-data-import 1.0 (docs/api.md): import .xlsx and .csv files into React
// apps as { columns, data } datasets. Steps 1–7 (format, sheet, header,
// types, mapping) are javascript-excel's importDataset (javascript-excel/import);
// this package adds File handling, worker routing, validation and React state.

export { DEFAULT_WORKER_THRESHOLD, importFile, previewFile } from './import';
export type {
  FieldSpec,
  ImportInput,
  ImportIssue,
  ImportIssueInput,
  ImportOptions,
  ImportProgress,
  ImportResult,
  ImportSchema,
  RowValidator,
  StandardResult,
  StandardSchemaLike,
} from './import';
export { useDataImport } from './use-data-import';
export type { ImportStatus, UseDataImport } from './use-data-import';
export { DataImport, DEFAULT_ACCEPT } from './data-import';
export type { DataImportProps, DataImportRenderApi } from './data-import';
export { useColumnMapping } from './use-column-mapping';
export type { MappingColumn, MappingField, UseColumnMapping } from './use-column-mapping';

export type { ColumnMapping, ColumnType, ImportedColumn, ImportLocale, ImportMeta } from 'javascript-excel/import';
export type { ExcelWarning } from 'javascript-excel';
export { isExcelError } from 'javascript-excel';

/** The version of this package. Kept in step with package.json by `npm run version-packages`. */
export const version = '1.0.0-alpha.1';
