// useColumnMapping (docs/api.md §8.3): headless state for a mapping UI. The
// app renders the controls; this keeps the mapping consistent.
import { useCallback, useMemo, useState } from 'react';
import { mapColumns, type ColumnMapping } from 'javascript-excel/import';
import type { ImportResult, ImportSchema } from './import';

export interface MappingField {
  name: string;
  required: boolean;
  /** The column key mapped to this field, or null. */
  column: string | null;
}

export interface MappingColumn {
  key: string;
  title: string;
  /** Source column ('C'); '' when the result doesn't say (an unmapped column of a mapped result). */
  letter: string;
  /** The first few values, for "E-mail: ada@…, grace@…" hints. */
  sample: unknown[];
  /** The field this column is mapped to, or null. */
  takenBy: string | null;
}

export interface UseColumnMapping {
  fields: MappingField[];
  columns: MappingColumn[];
  mapping: ColumnMapping;
  /** Maps `column` to `field` (null unmaps it). A column taken by another field moves. */
  set(field: string, column: string | null): void;
  /** Required fields without a column. */
  missingRequired: string[];
  /** Back to the automatic mapping. */
  reset(): void;
}

const SAMPLE_SIZE = 3;

interface Source {
  columns: Array<Omit<MappingColumn, 'takenBy'>>;
  auto: ColumnMapping;
}

/** The file's columns and the automatic mapping, from a raw result (previewFile, or importFile without a schema) or a mapped one. */
function sourceOf(result: ImportResult<unknown> | null, schema: ImportSchema): Source {
  const names = Object.keys(schema.fields);
  const empty = (): ColumnMapping => Object.fromEntries(names.map((n) => [n, null]));
  if (!result) return { columns: [], auto: empty() };
  const rows = result.data as Array<Record<string, unknown>>;
  const meta = result.meta;
  if (meta.mapping) {
    // A mapped result (useDataImport's 'mapping' state): mapped columns carry
    // their field's values; unmapped columns are known by key only.
    const columns: Source['columns'] = [];
    for (const c of result.columns) {
      const key = c.field !== undefined ? meta.mapping[c.field] : c.key;
      if (typeof key !== 'string') continue;
      columns.push({ key, title: c.title, letter: c.letter, sample: rows.slice(0, SAMPLE_SIZE).map((r) => r[c.key]) });
    }
    for (const key of meta.unmappedColumns ?? []) if (!columns.some((c) => c.key === key)) columns.push({ key, title: key, letter: '', sample: [] });
    return { columns, auto: { ...empty(), ...meta.mapping } };
  }
  const columns = result.columns.map((c) => ({ key: c.key, title: c.title, letter: c.letter, sample: rows.slice(0, SAMPLE_SIZE).map((r) => r[c.key]) }));
  const { mapping } = mapColumns(columns, { fields: Object.fromEntries(names.map((n) => [n, { aliases: schema.fields[n]!.aliases, required: schema.fields[n]!.required }])) });
  return { columns, auto: { ...empty(), ...mapping } };
}

export function useColumnMapping(result: ImportResult<unknown> | null, schema: ImportSchema): UseColumnMapping {
  const source = useMemo(() => sourceOf(result, schema), [result, schema]);
  // The user's changes, tied to the source they were made for: a new result starts from its automatic mapping.
  const [edits, setEdits] = useState<{ source: Source; mapping: ColumnMapping } | null>(null);
  const mapping = edits && edits.source === source ? edits.mapping : source.auto;

  const set = useCallback(
    (field: string, column: string | null): void => {
      if (!Object.prototype.hasOwnProperty.call(schema.fields, field)) throw new TypeError(`useColumnMapping: ${JSON.stringify(field)} is not a schema field`);
      if (column !== null && !source.columns.some((c) => c.key === column)) throw new TypeError(`useColumnMapping: no column with key ${JSON.stringify(column)}`);
      setEdits((prev) => {
        const base = prev && prev.source === source ? prev.mapping : source.auto;
        const next: ColumnMapping = { ...base };
        if (column !== null) for (const f of Object.keys(next)) if (next[f] === column) next[f] = null;
        next[field] = column;
        return { source, mapping: next };
      });
    },
    [schema, source],
  );
  const reset = useCallback((): void => setEdits(null), []);

  return useMemo(() => {
    const names = Object.keys(schema.fields);
    const takenBy = new Map<string, string>();
    for (const n of names) {
      const col = mapping[n];
      if (col) takenBy.set(col, n);
    }
    return {
      fields: names.map((name) => ({ name, required: schema.fields[name]!.required === true, column: mapping[name] ?? null })),
      columns: source.columns.map((c) => ({ ...c, takenBy: takenBy.get(c.key) ?? null })),
      mapping,
      set,
      missingRequired: names.filter((n) => schema.fields[n]!.required && !mapping[n]),
      reset,
    };
  }, [schema, source, mapping, set, reset]);
}
