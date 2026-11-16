// useDataImport (docs/api.md §8.1): importFile plus React state, abort and
// unmount handling, and the 'mapping' step. Only hooks that exist in React 17.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ColumnMapping } from 'javascript-excel/import';
import { importFile as importFileFn, type ImportInput, type ImportOptions, type ImportProgress, type ImportResult } from './import';

export type ImportStatus = 'idle' | 'reading' | 'mapping' | 'done' | 'error';

export interface UseDataImport<Row> {
  importFile(input: ImportInput, options?: ImportOptions<Row>): Promise<ImportResult<Row>>;
  status: ImportStatus;
  progress: ImportProgress | null;
  result: ImportResult<Row> | null;
  /** The error of the last failed import (aborts excluded); cleared when a new import starts. */
  error: unknown;
  /**
   * Imports the last input again with this mapping. The file is not read
   * again: its bytes are kept in memory from the first import.
   */
  applyMapping(mapping: ColumnMapping): Promise<ImportResult<Row>>;
  abort(reason?: unknown): void;
  /** Back to idle; forgets the result and the kept input. */
  reset(): void;
}

interface State<Row> {
  status: ImportStatus;
  progress: ImportProgress | null;
  result: ImportResult<Row> | null;
  error: unknown;
}

const isAbort = (err: unknown): boolean => typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'AbortError';

/** 'mapping' when a schema is given and a required field has no column. */
function statusOf(result: ImportResult<unknown>, options: ImportOptions<unknown>): ImportStatus {
  return options.schema && result.issues.some((i) => i.code === 'MAPPING_MISSING') ? 'mapping' : 'done';
}

export function useDataImport<Row = Record<string, unknown>>(defaults?: ImportOptions<Row>): UseDataImport<Row> {
  const [state, setState] = useState<State<Row>>({ status: 'idle', progress: null, result: null, error: undefined });
  const defaultsRef = useRef(defaults);
  defaultsRef.current = defaults;
  const mounted = useRef(false);
  const controller = useRef<AbortController | null>(null);
  // The last input (a File's bytes once read) and options, for applyMapping.
  const last = useRef<{ input: ImportInput; options: ImportOptions<Row> } | null>(null);

  useEffect(() => {
    // Set in the effect, not at render, so StrictMode's extra unmount/remount
    // in development leaves imports started after the final mount alone.
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
      controller.current = null;
    };
  }, []);

  const run = useCallback(async (input: ImportInput, options: ImportOptions<Row>): Promise<ImportResult<Row>> => {
    // One import at a time: a new one aborts the one in flight.
    controller.current?.abort();
    const ac = new AbortController();
    controller.current = ac;
    const external = options.signal;
    if (external) {
      if (external.aborted) ac.abort(external.reason);
      else external.addEventListener('abort', () => ac.abort(external.reason), { once: true });
    }
    if (mounted.current) setState((s) => ({ ...s, status: 'reading', progress: null, error: undefined }));
    const userProgress = options.onProgress;
    const live = (): boolean => mounted.current && controller.current === ac;
    try {
      // Keep the bytes, so applyMapping doesn't read the file again.
      const kept = typeof input === 'object' && input !== null && 'arrayBuffer' in input && typeof input.arrayBuffer === 'function' && !(input instanceof Uint8Array) ? await keepBytes(input, options) : { input, options };
      last.current = kept;
      const result = await importFileFn<Row>(kept.input, {
        ...kept.options,
        signal: ac.signal,
        onProgress: (p) => {
          userProgress?.(p);
          if (live()) setState((s) => ({ ...s, progress: p }));
        },
      });
      if (live()) setState({ status: statusOf(result as ImportResult<unknown>, options as ImportOptions<unknown>), progress: null, result, error: undefined });
      return result;
    } catch (err) {
      if (live()) setState((s) => (isAbort(err) || ac.signal.aborted ? { ...s, status: 'idle', progress: null } : { ...s, status: 'error', progress: null, error: err }));
      throw err;
    } finally {
      if (controller.current === ac) controller.current = null;
    }
  }, []);

  const importFile = useCallback(
    (input: ImportInput, options?: ImportOptions<Row>): Promise<ImportResult<Row>> => run(input, { ...defaultsRef.current, ...options }),
    [run],
  );

  const applyMapping = useCallback(
    (mapping: ColumnMapping): Promise<ImportResult<Row>> => {
      const prev = last.current;
      if (!prev) return Promise.reject(new TypeError('react-data-import: applyMapping needs an import first'));
      return run(prev.input, { ...prev.options, mapping });
    },
    [run],
  );

  const abort = useCallback((reason?: unknown): void => {
    controller.current?.abort(reason);
  }, []);

  const reset = useCallback((): void => {
    controller.current?.abort();
    controller.current = null;
    last.current = null;
    if (mounted.current) setState({ status: 'idle', progress: null, result: null, error: undefined });
  }, []);

  return { importFile, applyMapping, abort, reset, ...state };
}

/** A File/Blob's bytes plus its name and type as options, so a later re-import reads nothing. */
async function keepBytes<Row>(blob: Blob, options: ImportOptions<Row>): Promise<{ input: ImportInput; options: ImportOptions<Row> }> {
  const named = blob as Blob & { name?: unknown };
  const max = options.maxFileBytes;
  if (max !== undefined && blob.size > max) return { input: blob, options }; // importFile rejects it before reading
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return {
    input: bytes,
    options: {
      ...options,
      ...(options.fileName === undefined && typeof named.name === 'string' ? { fileName: named.name } : {}),
      ...(options.mimeType === undefined && blob.type ? { mimeType: blob.type } : {}),
    },
  };
}
