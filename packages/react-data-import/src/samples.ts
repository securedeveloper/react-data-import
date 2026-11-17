// Sample rows for a mapping UI (docs/api.md §8.3). While a required field has
// no column (MAPPING_MISSING), a validator usually rejects every row, so
// `data` is empty just when the mapping UI needs values to show. importFile
// keeps the engine's first rows here, keyed by the result's `data` array
// (which survives `{ ...result }` copies), and useColumnMapping reads them.

/** Rows a mapping UI shows per column. */
export const SAMPLE_SIZE = 3;

const kept = new WeakMap<object, ReadonlyArray<Record<string, unknown>>>();

/** @internal */
export function keepSamples(data: object, rows: ReadonlyArray<Record<string, unknown>>): void {
  kept.set(data, rows.slice(0, SAMPLE_SIZE));
}

/** @internal The engine's rows kept for `data`, or `data` itself. */
export function samplesOf(data: ReadonlyArray<unknown>): ReadonlyArray<Record<string, unknown>> {
  return kept.get(data) ?? (data as ReadonlyArray<Record<string, unknown>>);
}
