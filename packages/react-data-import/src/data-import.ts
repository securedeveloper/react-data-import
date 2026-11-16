// <DataImport> (docs/api.md §8.2): an unstyled file input and drop zone.
// Written with createElement rather than JSX: JSX compiles to an import of
// 'react/jsx-runtime', which plain Node ESM can't resolve with React 17.
import * as React from 'react';
import {
  createElement,
  Fragment,
  useCallback,
  useRef,
  useState,
  type DragEvent,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react';
import type { ImportIssue, ImportOptions, ImportProgress, ImportResult } from './import';
import { useDataImport, type ImportStatus } from './use-data-import';

export const DEFAULT_ACCEPT = '.xlsx,.xlsm,.xltx,.xltm,.csv,.tsv,.txt';
const DEFAULT_LABEL = 'Import a spreadsheet';

export interface DataImportRenderApi<Row> {
  /** Spread on the drop zone element: drag events, and `data-dragging` while a file is over it. */
  getRootProps<T extends HTMLAttributes<HTMLElement>>(props?: T): T;
  /** Spread on an `<input type="file">`: type, accept, onChange, disabled and a stable id. */
  getInputProps<T extends InputHTMLAttributes<HTMLInputElement>>(props?: T): T;
  /** Opens the file dialog (for a custom button). */
  open(): void;
  isDragging: boolean;
  status: ImportStatus;
  progress: ImportProgress | null;
  result: ImportResult<Row> | null;
  error: unknown;
}

export type DataImportProps<Row> = ImportOptions<Row> & {
  onImported?: ((result: ImportResult<Row>) => void) | undefined;
  /** Without it, errors go to console.error. Aborts are not errors. */
  onError?: ((error: unknown) => void) | undefined;
  /** Passed to the file input. Default: '.xlsx,.xlsm,.xltx,.xltm,.csv,.tsv,.txt'. A convenience for the dialog, not a check. */
  accept?: string | undefined;
  disabled?: boolean | undefined;
  /** Accessible name of the default input. Default 'Import a spreadsheet'. */
  inputLabel?: string | undefined;
  /**
   * A render prop (renders only what it returns), or plain content that
   * labels the default input (`<label>{children}<input type="file"></label>`).
   * Without children: one `<input type="file">` named by `inputLabel`.
   */
  children?: ReactNode | ((api: DataImportRenderApi<Row>) => ReactNode) | undefined;
};

let counter = 0;
/** React 18+ useId; a per-instance counter on React 17 (which has no useId). */
const useStableId: () => string =
  typeof (React as { useId?: () => string }).useId === 'function'
    ? (React as unknown as { useId: () => string }).useId
    : () => {
        const ref = useRef<string | null>(null);
        if (ref.current === null) ref.current = `rdi-${++counter}`;
        return ref.current;
      };

const isAbort = (err: unknown): boolean => typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'AbortError';

/** Files from a drop, without directories. */
function droppedFiles(dt: DataTransfer | null): File[] {
  if (!dt) return [];
  const files: File[] = [];
  const items = dt.items;
  if (items && items.length) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      if (item.kind !== 'file') continue;
      const entry = (item as { webkitGetAsEntry?: () => { isDirectory: boolean } | null }).webkitGetAsEntry?.();
      if (entry?.isDirectory) continue;
      const f = item.getAsFile();
      if (f) files.push(f);
    }
    return files;
  }
  return Array.from(dt.files ?? []);
}

function compose<E>(own: (e: E) => void, theirs: ((e: E) => void) | undefined): (e: E) => void {
  return (e) => {
    theirs?.(e);
    own(e);
  };
}

export function DataImport<Row = Record<string, unknown>>(props: DataImportProps<Row>): ReactElement {
  const hook = useDataImport<Row>();
  const latest = useRef(props);
  latest.current = props;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const id = useStableId();
  const [isDragging, setDragging] = useState(false);
  const depth = useRef(0);
  const [ignored, setIgnored] = useState<{ result: ImportResult<Row>; issue: ImportIssue } | null>(null);

  const run = useCallback(
    (file: File, extra: number): void => {
      const { onImported, onError, accept: _a, disabled: _d, inputLabel: _l, children: _c, ...options } = latest.current;
      hook.importFile(file, options).then(
        (result) => {
          let out = result;
          if (extra > 0) {
            const issue: ImportIssue = { row: 0, code: 'FILES_IGNORED', message: `${extra} more file${extra === 1 ? ' was' : 's were'} dropped; only ${file.name} was imported.`, severity: 'warning' };
            out = { ...result, issues: [...result.issues, issue] };
            setIgnored({ result, issue });
          } else setIgnored(null);
          onImported?.(out);
        },
        (err: unknown) => {
          if (isAbort(err)) return;
          if (onError) onError(err);
          else console.error(err);
        },
      );
    },
    [hook.importFile],
  );

  const take = useCallback(
    (files: File[]): void => {
      if (latest.current.disabled || files.length === 0) return;
      run(files[0]!, files.length - 1);
    },
    [run],
  );

  const getRootProps = useCallback(
    <T extends HTMLAttributes<HTMLElement>>(own?: T): T => {
      const p = (own ?? {}) as T;
      const enter = (e: DragEvent<HTMLElement>): void => {
        e.preventDefault();
        depth.current++;
        if (!latest.current.disabled) setDragging(true);
      };
      const over = (e: DragEvent<HTMLElement>): void => {
        e.preventDefault(); // allows the drop
        if (e.dataTransfer) e.dataTransfer.dropEffect = latest.current.disabled ? 'none' : 'copy';
      };
      const leave = (): void => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDragging(false);
      };
      const drop = (e: DragEvent<HTMLElement>): void => {
        e.preventDefault();
        depth.current = 0;
        setDragging(false);
        take(droppedFiles(e.dataTransfer));
      };
      return {
        ...p,
        onDragEnter: compose(enter, p.onDragEnter),
        onDragOver: compose(over, p.onDragOver),
        onDragLeave: compose(leave, p.onDragLeave),
        onDrop: compose(drop, p.onDrop),
        ...(isDragging ? { 'data-dragging': '' } : {}),
      };
    },
    [isDragging, take],
  );

  const getInputProps = useCallback(
    <T extends InputHTMLAttributes<HTMLInputElement>>(own?: T): T => {
      const p = (own ?? {}) as T;
      const change = (e: React.ChangeEvent<HTMLInputElement>): void => {
        const input = e.currentTarget;
        const files = Array.from(input.files ?? []);
        // Clear the value, so choosing the same file again imports it again.
        input.value = '';
        take(files);
      };
      const userRef = (p as { ref?: unknown }).ref;
      return {
        id,
        ...p,
        type: 'file',
        accept: p.accept ?? latest.current.accept ?? DEFAULT_ACCEPT,
        disabled: p.disabled ?? latest.current.disabled ?? false,
        onChange: compose(change, p.onChange),
        ref: (el: HTMLInputElement | null) => {
          inputRef.current = el;
          if (typeof userRef === 'function') userRef(el);
          else if (userRef && typeof userRef === 'object') (userRef as { current: unknown }).current = el;
        },
      };
    },
    [id, take],
  );

  const open = useCallback((): void => {
    if (!latest.current.disabled) inputRef.current?.click();
  }, []);

  const result = hook.result && ignored && ignored.result === hook.result ? { ...hook.result, issues: [...hook.result.issues, ignored.issue] } : hook.result;
  const api: DataImportRenderApi<Row> = { getRootProps, getInputProps, open, isDragging, status: hook.status, progress: hook.progress, result, error: hook.error };

  const { children, inputLabel } = props;
  const content: ReactNode =
    typeof children === 'function'
      ? children(api)
      : children !== undefined && children !== null && children !== false
        ? // Plain children label the default input.
          createElement('label', null, children, createElement('input', getInputProps()))
        : createElement('input', getInputProps({ 'aria-label': inputLabel ?? DEFAULT_LABEL }));
  return createElement(Fragment, null, content);
}
