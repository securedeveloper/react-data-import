'use client';

// react-data-import 1.0: importing .xlsx and .csv files into React apps as
// { columns, data } datasets (docs/api.md). This is the RDI-1 scaffold: the
// toolchain, React 18/19 matrix and packaging are in place; importFile,
// useDataImport, <DataImport> and useColumnMapping arrive in RDI-2 onwards,
// on javascript-excel's `javascript-excel/import`.
import { useDebugValue } from 'react';

/** The version of this package. Kept in step with package.json by `npm run version-packages`. */
export const version = '0.0.1';

/**
 * Placeholder hook, so the React toolchain (peer resolution, tests on React
 * 18 and 19, typings, the "use client" build) is exercised before the real
 * API exists. Removed when `useDataImport` lands (RDI-2).
 */
export function useVersion(): string {
  useDebugValue(version);
  return version;
}
