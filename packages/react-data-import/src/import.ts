// importFile and previewFile (docs/api.md §4, §7, §9). Steps 1–7 are
// javascript-excel's importDataset; this module adds File handling,
// maxFileBytes, worker routing and row validation.
import { LimitError, ValidationError, type ExcelWarning } from 'javascript-excel';
import {
  importDataset,
  type ColumnMapping,
  type ColumnType,
  type FieldSpec as EngineFieldSpec,
  type ImportDatasetOptions,
  type ImportDatasetResult,
  type ImportedColumn,
  type ImportLocale,
  type ImportMeta,
} from 'javascript-excel/import';
import type { ReadLimits } from 'javascript-excel/read';
import type { WorkerClient } from 'javascript-excel/worker';
import { keepSamples } from './samples';

export type ImportInput = File | Blob | ArrayBuffer | Uint8Array | string;

/** A schema field: javascript-excel's FieldSpec plus a field-level check. */
export interface FieldSpec extends EngineFieldSpec {
  /** Returns a message when the value is not acceptable. */
  validate?: ((value: unknown) => string | undefined) | undefined;
}

export interface ImportSchema {
  fields: Record<string, FieldSpec>;
  /** Columns no field takes: dropped (default) or kept under their own keys. */
  unmapped?: 'drop' | 'keep' | undefined;
}

/** An issue: javascript-excel's codes plus the validator's own. */
export interface ImportIssue {
  /** Spreadsheet row (1-based, as Excel shows it); 0 for column- or file-level issues. */
  row: number;
  /** The key the value has in `data` rows: the schema field with a schema, the column key without one. */
  field?: string | undefined;
  /** The source column key, for cell- and column-level issues. */
  column?: string | undefined;
  ref?: string | undefined;
  code: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ImportIssueInput {
  field?: string | undefined;
  /** Default: the column mapped to `field`. */
  column?: string | undefined;
  /** Default: the cell of `field` in this row. */
  ref?: string | undefined;
  message: string;
  code?: string | undefined;
  severity?: 'error' | 'warning' | undefined;
}

type RowCheck = ImportIssueInput[] | ImportIssueInput | string | undefined | void;
export type RowValidator<Row> = (row: Row, ctx: { rowNumber: number; index: number }) => RowCheck | Promise<RowCheck>;

/** The Standard Schema interface (standardschema.dev), structurally: Zod, Valibot, ArkType implement it. */
export interface StandardSchemaLike<Output = unknown> {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (value: unknown) => StandardResult<Output> | Promise<StandardResult<Output>>;
    readonly types?: { readonly input: unknown; readonly output: Output } | undefined;
  };
}
export type StandardResult<Output> =
  | { readonly value: Output; readonly issues?: undefined }
  | { readonly issues: ReadonlyArray<{ readonly message: string; readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined }> };

export interface ImportProgress {
  phase: 'unzip' | 'parse' | 'dataset' | 'validate';
  /** 0..1, non-decreasing. */
  ratio: number;
}

export interface ImportOptions<Row = Record<string, unknown>> {
  format?: 'auto' | 'xlsx' | 'csv' | undefined;
  /** For bytes without a name: CSV detection and meta.fileName. A File's own name is used otherwise. */
  fileName?: string | undefined;
  mimeType?: string | undefined;
  sheet?: number | string | 'first-visible' | undefined;
  header?: 'auto' | number | { row?: number | undefined; rows: number; join?: string | undefined } | false | undefined;
  range?: string | undefined;
  types?: 'infer' | 'none' | Record<string, ColumnType> | undefined;
  locale?: ImportLocale | undefined;
  delimiter?: string | undefined;
  encoding?: string | undefined;
  skipTotals?: 'auto' | boolean | undefined;
  errorCells?: 'null' | 'keep' | undefined;
  dates?: 'date' | 'serial' | undefined;
  dateZone?: 'local' | 'utc' | undefined;
  schema?: ImportSchema | undefined;
  mapping?: ColumnMapping | undefined;
  /** A function, or a Standard Schema object (rows become its output). */
  validate?: RowValidator<Row> | StandardSchemaLike<Row> | undefined;
  /** 'collect' (default): report every issue. 'stop': reject with VALIDATION_FAILED at the first invalid row. */
  validation?: 'collect' | 'stop' | undefined;
  /** Bytes; checked before the file is read. Default: javascript-excel's maxInputBytes. */
  maxFileBytes?: number | undefined;
  /** Data rows; more rejects with LIMIT_EXCEEDED. */
  maxRows?: number | undefined;
  limits?: Partial<ReadLimits> | undefined;
  /** Runs steps 1–7 in a worker (javascript-excel/worker) for inputs of `workerThreshold` bytes or more. */
  worker?: WorkerClient | undefined;
  /** Default 1 MiB (docs/api.md §12 Q9; to be measured). */
  workerThreshold?: number | undefined;
  signal?: AbortSignal | undefined;
  onProgress?: ((p: ImportProgress) => void) | undefined;
  onWarning?: ((w: ExcelWarning) => void) | undefined;
}

export interface ImportResult<Row = Record<string, unknown>> {
  /** One per column; with a schema, one per schema field (an unmapped field has title and letter '' and type 'empty'). */
  columns: ImportedColumn[];
  /**
   * Valid rows only: rows with an `error` issue are left out and listed in `issues`.
   * With a schema, every row has every schema field; an unmapped one is null.
   */
  data: Row[];
  /** Spreadsheet row of each entry in `data`. */
  rowNumbers: number[];
  issues: ImportIssue[];
  warnings: ExcelWarning[];
  meta: ImportMeta;
}

/** Default size from which the worker is used (docs/api.md §9.3). */
export const DEFAULT_WORKER_THRESHOLD: number = 1024 * 1024;
const DEFAULT_MAX_FILE_BYTES = 256 * 1024 * 1024; // javascript-excel's DEFAULT_READ_LIMITS.maxInputBytes
const ENGINE_SHARE = 0.9; // progress share of steps 1–7 when there is validation

const ENGINE_KEYS = [
  'format', 'fileName', 'mimeType', 'sheet', 'header', 'range', 'types', 'locale', 'delimiter', 'encoding',
  'skipTotals', 'errorCells', 'dates', 'dateZone', 'mapping', 'maxRows', 'limits',
] as const;

function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('This operation was aborted', 'AbortError');
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortError(signal);
}

function isBlob(x: unknown): x is Blob {
  return typeof x === 'object' && x !== null && typeof (x as Blob).arrayBuffer === 'function' && typeof (x as Blob).size === 'number';
}

function sizeOf(input: ImportInput): number {
  if (typeof input === 'string') return input.length; // characters; UTF-8 bytes are at least as many
  if (isBlob(input)) return input.size;
  return input.byteLength;
}

/** The engine's schema: field names, aliases, required and type. Functions stay here (they can't cross into a worker). */
function engineSchema(schema: ImportSchema): { fields: Record<string, EngineFieldSpec>; unmapped?: 'drop' | 'keep' } {
  const fields: Record<string, EngineFieldSpec> = Object.create(null) as Record<string, EngineFieldSpec>;
  for (const name of Object.keys(schema.fields)) {
    const { validate: _v, ...rest } = schema.fields[name]!;
    fields[name] = rest;
  }
  return schema.unmapped ? { fields, unmapped: schema.unmapped } : { fields };
}

function isStandard<Row>(v: unknown): v is StandardSchemaLike<Row> {
  return typeof v === 'object' && v !== null && '~standard' in v;
}

function toIssues(check: RowCheck, rowNumber: number): ImportIssue[] {
  if (check === undefined || check === null) return [];
  const list = Array.isArray(check) ? check : [check];
  return list.map((c) => {
    const i: ImportIssueInput = typeof c === 'string' ? { message: c } : c;
    return {
      row: rowNumber,
      ...(i.field !== undefined ? { field: i.field } : {}),
      ...(i.column !== undefined ? { column: i.column } : {}),
      ...(i.ref !== undefined ? { ref: i.ref } : {}),
      code: i.code ?? 'INVALID',
      message: i.message,
      severity: i.severity ?? 'error',
    };
  });
}

function pathField(path: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined): string | undefined {
  const first = path?.[0];
  if (first === undefined) return undefined;
  const key = typeof first === 'object' && first !== null ? first.key : first;
  return typeof key === 'symbol' ? key.description : String(key);
}

/** Each field's source column key and letter, for validator issues. */
function columnsOf(base: ImportDatasetResult): Map<string, { column: string; letter: string }> {
  const out = new Map<string, { column: string; letter: string }>();
  const { mapping, unmappedColumns } = base.meta;
  for (const c of base.columns) {
    // A schema field: its mapped column. A kept column: its own key, unless it was suffixed. No schema: the column itself.
    const column = c.field !== undefined ? mapping?.[c.field] : mapping === undefined || unmappedColumns?.includes(c.key) ? c.key : undefined;
    if (typeof column === 'string') out.set(c.key, { column, letter: c.letter });
  }
  return out;
}

/** Adds `column` and `ref` to a validator issue on a field with a column, unless the validator set them. */
function locate(issue: ImportIssue, columns: Map<string, { column: string; letter: string }>): ImportIssue {
  const at = issue.field !== undefined ? columns.get(issue.field) : undefined;
  if (!at || (issue.column !== undefined && issue.ref !== undefined)) return issue;
  const { row, field, column, ref, ...rest } = issue;
  return { row, field, column: column ?? at.column, ...(ref !== undefined ? { ref } : at.letter ? { ref: `${at.letter}${row}` } : {}), ...rest };
}

/**
 * Step 8: field checks, then the row validator; rows with an error issue are left out.
 * A field with an engine error in the row (TYPE, REQUIRED), or without a column
 * (MAPPING_MISSING), is not checked again: the engine's issue is the one reported.
 */
async function validateRows<Row>(
  base: ImportDatasetResult,
  options: ImportOptions<Row>,
  progress: (ratio: number) => void,
): Promise<ImportResult<Row>> {
  const { signal } = options;
  const issues: ImportIssue[] = [...base.issues];
  const data: Row[] = [];
  const errorRows = new Set(issues.filter((i) => i.severity === 'error' && i.row > 0).map((i) => i.row));
  const unmapped = new Set(issues.filter((i) => i.code === 'MAPPING_MISSING' && i.field !== undefined).map((i) => i.field!));
  const failedCells = new Map<number, Set<string>>();
  for (const i of issues) {
    if (i.severity !== 'error' || i.row === 0 || i.field === undefined) continue;
    let set = failedCells.get(i.row);
    if (!set) failedCells.set(i.row, (set = new Set()));
    set.add(i.field);
  }
  const columns = columnsOf(base);
  if (unmapped.size > 0) keepSamples(data, base.data);
  const fieldChecks = options.schema
    ? Object.entries(options.schema.fields).filter((e): e is [string, FieldSpec & { validate: NonNullable<FieldSpec['validate']> }] => typeof e[1].validate === 'function')
    : [];
  const validator = options.validate;
  const stop = options.validation === 'stop';
  const rowNumbers: number[] = [];
  const n = base.data.length;
  for (let i = 0; i < n; i++) {
    if (i % 256 === 0) throwIfAborted(signal);
    const rowNumber = base.rowNumbers[i]!;
    let row: unknown = base.data[i];
    const failed = failedCells.get(rowNumber);
    const blocked = (field: string | undefined): boolean => field !== undefined && (unmapped.has(field) || failed?.has(field) === true);
    const found: ImportIssue[] = [];
    for (const [field, spec] of fieldChecks) {
      if (blocked(field)) continue;
      const message = spec.validate((row as Record<string, unknown>)[field]);
      if (message !== undefined) found.push({ row: rowNumber, field, code: 'INVALID', message, severity: 'error' });
    }
    if (validator !== undefined) {
      if (isStandard<Row>(validator)) {
        const r = await validator['~standard'].validate(row);
        if (r.issues) {
          for (const issue of r.issues) {
            const field = pathField(issue.path);
            found.push({ row: rowNumber, ...(field !== undefined ? { field } : {}), code: 'INVALID', message: issue.message, severity: 'error' });
          }
        } else row = r.value;
      } else {
        found.push(...toIssues(await validator(row as Row, { rowNumber, index: i }), rowNumber));
      }
      throwIfAborted(signal);
    }
    issues.push(...found.filter((f) => !blocked(f.field)).map((f) => locate(f, columns)));
    // Blocked fields' issues are dropped, but the row still fails: its engine error, or the validator, says so.
    const invalid = errorRows.has(rowNumber) || found.some((f) => f.severity === 'error');
    if (invalid && stop) {
      let rowIssues = issues.filter((x) => x.row === rowNumber);
      // Only blocked fields failed: the file-level MAPPING_MISSING issues explain it.
      if (rowIssues.length === 0) rowIssues = issues.filter((x) => x.code === 'MAPPING_MISSING');
      throw new ValidationError('VALIDATION_FAILED', `Row ${rowNumber} is not valid: ${rowIssues.map((x) => x.message).join('; ')}`, { details: { issues: rowIssues } });
    }
    if (!invalid) {
      data.push(row as Row);
      rowNumbers.push(rowNumber);
    }
    if (i % 256 === 0) progress(n ? i / n : 1);
  }
  progress(1);
  return { columns: base.columns, data, rowNumbers, issues, warnings: base.warnings, meta: base.meta };
}

async function runEngine(input: ImportInput, options: ImportOptions<unknown>, extra: Partial<ImportDatasetOptions>, scale: number): Promise<ImportDatasetResult> {
  const { signal } = options;
  throwIfAborted(signal);
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  if (!(Number.isInteger(maxFileBytes) && maxFileBytes > 0)) throw new TypeError(`maxFileBytes must be a positive integer, got ${String(options.maxFileBytes)}`);
  const size = sizeOf(input);
  if (size > maxFileBytes) {
    // Same error class and code as javascript-excel's read limits.
    throw new LimitError('LIMIT_EXCEEDED', `The file is ${size} bytes, more than maxFileBytes (${maxFileBytes}).`, { details: { limit: 'maxFileBytes', value: size, max: maxFileBytes } });
  }
  const engine: ImportDatasetOptions = {};
  for (const k of ENGINE_KEYS) if (options[k] !== undefined) (engine as Record<string, unknown>)[k] = options[k];
  if (options.schema) engine.schema = engineSchema(options.schema);
  // A File's name and type, kept when its bytes are passed on.
  let bytesOrText: string | Uint8Array | ArrayBuffer | Blob = input;
  if (isBlob(input)) {
    const named = input as Blob & { name?: unknown };
    if (engine.fileName === undefined && typeof named.name === 'string') engine.fileName = named.name;
    if (engine.mimeType === undefined && input.type) engine.mimeType = input.type;
    bytesOrText = new Uint8Array(await input.arrayBuffer());
    throwIfAborted(signal);
  }
  Object.assign(engine, extra);
  if (signal) engine.signal = signal;
  const onProgress = options.onProgress;
  if (onProgress) engine.onProgress = (p) => onProgress({ phase: p.phase, ratio: p.ratio * scale });
  if (options.onWarning) engine.onWarning = options.onWarning;
  const threshold = options.workerThreshold ?? DEFAULT_WORKER_THRESHOLD;
  if (options.worker && size >= threshold) return options.worker.importDataset(bytesOrText as string | Uint8Array, engine);
  return importDataset(bytesOrText as string | Uint8Array, engine);
}

/**
 * Imports an .xlsx or .csv file as { columns, data } (docs/api.md §4).
 * Rejects for problems that stop the import (javascript-excel's errors,
 * unchanged); row problems are in `issues`.
 */
export async function importFile<Row = Record<string, unknown>>(input: ImportInput, options: ImportOptions<Row> = {}): Promise<ImportResult<Row>> {
  if (options.validation !== undefined && options.validation !== 'collect' && options.validation !== 'stop') {
    throw new TypeError(`validation must be 'collect' or 'stop', got ${JSON.stringify(options.validation)}`);
  }
  const validates = options.validate !== undefined || (options.schema !== undefined && Object.values(options.schema.fields).some((f) => typeof f.validate === 'function'));
  const scale = validates ? ENGINE_SHARE : 1;
  const base = await runEngine(input, options as ImportOptions<unknown>, {}, scale);
  const onProgress = options.onProgress;
  return validateRows(base, options, (r) => {
    if (validates && onProgress) onProgress({ phase: 'validate', ratio: ENGINE_SHARE + (1 - ENGINE_SHARE) * r });
  });
}

/**
 * The first `rows` data rows (default 20) with the detected header, delimiter,
 * encoding and column types; no mapping or validation (docs/api.md §9.2).
 */
export async function previewFile(input: ImportInput, options: Omit<ImportOptions<Record<string, unknown>>, 'validate' | 'validation' | 'mapping'> & { rows?: number | undefined } = {}): Promise<ImportResult<Record<string, unknown>>> {
  const { rows = 20, ...rest } = options;
  if (!(Number.isInteger(rows) && rows >= 0)) throw new TypeError(`rows must be a non-negative integer, got ${String(rows)}`);
  const base = await runEngine(input, rest as ImportOptions<unknown>, { preview: rows }, 1);
  return { columns: base.columns, data: base.data, rowNumbers: base.rowNumbers, issues: base.issues as ImportIssue[], warnings: base.warnings, meta: base.meta };
}

