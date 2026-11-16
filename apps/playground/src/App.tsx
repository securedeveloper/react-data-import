import { useCallback, useMemo, useRef, useState, type ReactElement } from 'react';
import { createWorkerClient, type WorkerClient } from 'javascript-excel/worker';
import { DataImport, importFile, isExcelError, useColumnMapping, version, type ImportLocale, type ImportResult } from 'react-data-import';
import { sampleCsv, sampleXlsx } from './sample';
import { Contact, CONTACT_SOURCE, contacts } from './schema';
import { show, Table } from './Table';

const LOCALES: Record<string, { label: string; locale: ImportLocale | undefined }> = {
  auto: { label: 'International (1,234.56; ISO dates)', locale: undefined },
  eu: { label: 'European (1.234,56; DD.MM.YYYY)', locale: { decimal: ',', group: '.', dateOrder: 'DMY' } },
  us: { label: 'US (1,234.56; MM/DD/YYYY)', locale: { decimal: '.', group: ',', dateOrder: 'MDY' } },
};
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const PREVIEW_ROWS = 10;
/** Rows shown in the result tables; the counts above them are complete. */
const SHOWN_ROWS = 50;

/** Friendly text for javascript-excel's error codes; the rest falls back to the message. */
function describe(err: unknown): string {
  if (isExcelError(err)) {
    switch (err.code) {
      case 'UNSUPPORTED_FORMAT':
        return (err.details as { format?: string } | undefined)?.format === 'cfb'
          ? 'This is an old .xls or a password-protected file. Save it as .xlsx and try again.'
          : 'This file type is not supported. Use .xlsx or .csv.';
      case 'NOT_XLSX':
        return "This doesn't look like an Excel file.";
      case 'LIMIT_EXCEEDED':
        return `The file is too large for the playground (limit ${MAX_FILE_BYTES / 1024 / 1024} MiB).`;
      default:
        return `${err.code}: ${err.message}`;
    }
  }
  return err instanceof Error ? err.message : String(err);
}

function useWorker(): WorkerClient | undefined {
  // One worker for the page; files of 1 MiB or more are parsed there (DEFAULT_WORKER_THRESHOLD).
  return useMemo(() => (typeof Worker === 'undefined' ? undefined : createWorkerClient(new Worker(new URL('./excel.worker.ts', import.meta.url), { type: 'module' }))), []);
}

export function App(): ReactElement {
  const worker = useWorker();
  const [file, setFile] = useState<File | null>(null);
  const [sheet, setSheet] = useState<number | undefined>(undefined);
  const [localeKey, setLocaleKey] = useState('auto');
  const [raw, setRaw] = useState<ImportResult | null>(null);
  const [final, setFinal] = useState<ImportResult<Contact> | null>(null);
  const [message, setMessage] = useState('Choose a file, drop one, or try a sample.');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mapping = useColumnMapping(raw, contacts);
  const latestFile = useRef<File | null>(null);
  const locale = LOCALES[localeKey]!.locale;

  const common = useMemo(() => ({ maxFileBytes: MAX_FILE_BYTES, worker, ...(locale ? { locale } : {}) }), [worker, locale]);

  const showRaw = useCallback((f: File, r: ImportResult) => {
    setRaw(r);
    setFinal(null);
    setError(null);
    const h = r.meta.header;
    setMessage(
      `Read ${f.name}: ${r.data.length} rows, ${r.columns.length} columns. ` +
        (h.rows.length ? `Header: row ${h.rows.map((x) => x + 1).join('–')}${h.detected ? ` (detected, ${h.confidence} confidence)` : ''}.` : 'No header row.'),
    );
  }, []);

  const fail = useCallback((err: unknown) => {
    setRaw(null);
    setFinal(null);
    setError(describe(err));
    setMessage('');
  }, []);

  /** Reads `f` without a schema: the preview and the columns for mapping. */
  const readRaw = useCallback(
    async (f: File, sheetIndex: number | undefined) => {
      latestFile.current = f;
      setBusy(true);
      setMessage(`Reading ${f.name}…`);
      try {
        const r = await importFile(f, { ...common, ...(sheetIndex !== undefined ? { sheet: sheetIndex } : {}) });
        if (latestFile.current === f) showRaw(f, r);
      } catch (err) {
        if (latestFile.current === f) fail(err);
      } finally {
        setBusy(false);
      }
    },
    [common, showRaw, fail],
  );

  const pick = useCallback(
    (f: File | null | undefined) => {
      if (!f) return;
      setFile(f);
      setSheet(undefined);
      latestFile.current = f;
    },
    [],
  );

  const runImport = useCallback(async () => {
    if (!file) return;
    setBusy(true);
    setMessage('Validating…');
    try {
      const r = await importFile(file, { ...common, ...(sheet !== undefined ? { sheet } : {}), schema: contacts, mapping: mapping.mapping, validate: Contact });
      setFinal(r);
      const errors = r.issues.filter((i) => i.severity === 'error').length;
      setMessage(`Imported ${r.data.length} valid rows; ${errors} problem${errors === 1 ? '' : 's'} found.`);
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusy(false);
    }
  }, [file, common, sheet, mapping.mapping]);

  const columnTitle = (key: string): string => mapping.columns.find((c) => c.key === key)?.title ?? key;

  return (
    <>
      <aside className="banner" aria-label="Prerelease notice">
        <strong>In development.</strong> react-data-import {version} is not on npm yet; its API can still change. Everything runs in your browser: no uploads,
        no tracking, no cookies.
      </aside>
      <main>
        <header>
          <h1>react-data-import playground</h1>
          <p className="lead">
            Drop a spreadsheet, preview it, map its columns to an app's fields, validate the rows with Zod, and get typed rows back. Built on{' '}
            <a href="https://github.com/securedeveloper/javascript-excel">javascript-excel</a>.
          </p>
        </header>

        <section aria-labelledby="step-file">
          <h2 id="step-file">1. Choose a file</h2>
          <DataImport
            {...common}
            // The file was set by the input or drop handler just before; read it from the ref, not from a render's state.
            onImported={(r) => latestFile.current && showRaw(latestFile.current, r)}
            onError={fail}
          >
            {({ getRootProps, getInputProps, isDragging, status }) => (
              <div {...getRootProps({ className: isDragging ? 'drop over' : 'drop', onDrop: (e) => pick(e.dataTransfer?.files?.[0]) })}>
                <label className="file-label">
                  Choose an .xlsx or .csv file
                  <input {...getInputProps({ onChange: (e) => pick(e.currentTarget.files?.[0]) })} />
                </label>
                <p className="hint">or drop one here. {status === 'reading' ? 'Reading…' : null}</p>
              </div>
            )}
          </DataImport>
          <div className="actions">
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                const f = await sampleXlsx();
                pick(f);
                await readRaw(f, undefined);
              }}
            >
              Try a sample .xlsx
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                const f = sampleCsv();
                setLocaleKey('eu');
                pick(f);
                latestFile.current = f;
                setBusy(true);
                try {
                  showRaw(f, await importFile(f, { maxFileBytes: MAX_FILE_BYTES, worker, locale: LOCALES['eu']!.locale! }));
                } catch (err) {
                  fail(err);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Try a European .csv
            </button>
            <div className="field">
              <label htmlFor="locale">Numbers and dates</label>
              <select
                id="locale"
                value={localeKey}
                onChange={(e) => {
                  setLocaleKey(e.target.value);
                  if (file) {
                    const next = LOCALES[e.target.value]!.locale;
                    latestFile.current = file;
                    setBusy(true);
                    importFile(file, { maxFileBytes: MAX_FILE_BYTES, worker, ...(next ? { locale: next } : {}), ...(sheet !== undefined ? { sheet } : {}) })
                      .then((r) => showRaw(file, r), fail)
                      .finally(() => setBusy(false));
                  }
                }}
              >
                {Object.entries(LOCALES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p role="status" className="status">
            {message}
          </p>
          {error ? (
            <p role="alert" className="error">
              {error}
            </p>
          ) : null}
        </section>

        {raw ? (
          <section aria-labelledby="step-preview">
            <h2 id="step-preview">2. Preview</h2>
            <dl className="facts">
              <div>
                <dt>Format</dt>
                <dd>{raw.meta.format}</dd>
              </div>
              {raw.meta.delimiter !== undefined ? (
                <div>
                  <dt>Delimiter</dt>
                  <dd>{raw.meta.delimiter === '\t' ? 'Tab' : raw.meta.delimiter}</dd>
                </div>
              ) : null}
              {raw.meta.encoding ? (
                <div>
                  <dt>Encoding</dt>
                  <dd>{raw.meta.encoding}</dd>
                </div>
              ) : null}
              <div>
                <dt>Range</dt>
                <dd>{raw.meta.range}</dd>
              </div>
              {raw.meta.totalsRowSkipped ? (
                <div>
                  <dt>Totals row</dt>
                  <dd>skipped</dd>
                </div>
              ) : null}
            </dl>
            {raw.meta.sheets && raw.meta.sheets.length > 1 ? (
              <div className="field">
                <label htmlFor="sheet">Sheet</label>
                <select
                  id="sheet"
                  value={raw.meta.sheet?.index ?? 0}
                  onChange={(e) => {
                    const i = Number(e.target.value);
                    setSheet(i);
                    if (file) void readRaw(file, i);
                  }}
                >
                  {raw.meta.sheets.map((s) => (
                    <option key={s.index} value={s.index}>
                      {s.name}
                      {s.state !== 'visible' ? ` (${s.state})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <Table
              caption={`First ${Math.min(PREVIEW_ROWS, raw.data.length)} of ${raw.data.length} rows, as read`}
              columns={raw.columns.map((c) => ({ key: c.key, title: c.title || c.letter, note: `${c.letter} · ${c.type}` }))}
              rows={raw.data.slice(0, PREVIEW_ROWS)}
              rowNumbers={raw.rowNumbers.slice(0, PREVIEW_ROWS)}
            />
            {raw.warnings.length ? (
              <ul className="warnings" aria-label="Reader warnings">
                {raw.warnings.map((w, i) => (
                  <li key={i}>
                    <code>{w.code}</code> {w.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        {raw ? (
          <section aria-labelledby="step-map">
            <h2 id="step-map">3. Map columns to fields</h2>
            <p className="hint">The app expects these fields. Columns were matched by name and alias; change any of them.</p>
            <fieldset className="mapping">
              <legend>Fields</legend>
              {mapping.fields.map((f) => (
                <div className="field" key={f.name}>
                  <label htmlFor={`map-${f.name}`}>
                    {f.name}
                    {f.required ? <span className="req"> (required)</span> : null}
                  </label>
                  <select id={`map-${f.name}`} value={f.column ?? ''} onChange={(e) => mapping.set(f.name, e.target.value || null)}>
                    <option value="">Not mapped</option>
                    {mapping.columns.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.title || c.key} — {c.sample.map(show).filter(Boolean).slice(0, 2).join(', ')}
                        {c.takenBy && c.takenBy !== f.name ? ` (now ${c.takenBy})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </fieldset>
            <div className="actions">
              <button type="button" onClick={mapping.reset} className="secondary">
                Reset to automatic
              </button>
            </div>
            {mapping.missingRequired.length ? (
              <p className="error" id="mapping-missing">
                Map a column to: {mapping.missingRequired.join(', ')}.
              </p>
            ) : null}
          </section>
        ) : null}

        {raw ? (
          <section aria-labelledby="step-validate">
            <h2 id="step-validate">4. Validate and import</h2>
            <p className="hint">Each row goes through this Zod schema (any Standard Schema works). Rows that fail are left out and listed below.</p>
            <pre className="code" tabIndex={0} aria-label="Zod schema">
              <code>{CONTACT_SOURCE}</code>
            </pre>
            <div className="actions">
              <button
                type="button"
                disabled={busy || mapping.missingRequired.length > 0}
                aria-describedby={mapping.missingRequired.length > 0 ? 'mapping-missing' : undefined}
                onClick={() => void runImport()}
              >
                Validate and import
              </button>
            </div>
            {final ? (
              <>
                <Table
                  caption={`${final.data.length} valid rows (typed by the Zod schema)${final.data.length > SHOWN_ROWS ? `, first ${SHOWN_ROWS} shown` : ''}`}
                  columns={final.columns.map((c) => ({ key: c.key, title: c.key, note: `from ${columnTitle(mapping.mapping[c.key] ?? c.key)}` }))}
                  rows={(final.data as unknown as Array<Record<string, unknown>>).slice(0, SHOWN_ROWS)}
                  rowNumbers={final.rowNumbers.slice(0, SHOWN_ROWS)}
                />
                <h3>Problems ({final.issues.length})</h3>
                {final.issues.length ? (
                  <Table
                    caption={`Problems by spreadsheet row${final.issues.length > SHOWN_ROWS ? `, first ${SHOWN_ROWS} shown` : ''}`}
                    columns={[
                      { key: 'row', title: 'Row' },
                      { key: 'field', title: 'Field' },
                      { key: 'code', title: 'Code' },
                      { key: 'message', title: 'Message' },
                    ]}
                    rows={final.issues.slice(0, SHOWN_ROWS).map((i) => ({ row: i.row || 'file', field: i.field ?? '', code: i.code, message: i.message }))}
                  />
                ) : (
                  <p className="hint">None.</p>
                )}
              </>
            ) : null}
          </section>
        ) : null}
      </main>
      <footer>
        <p>
          react-data-import {version}, MIT licence. <a href="https://github.com/securedeveloper/react-data-import">Source on GitHub</a>.
        </p>
      </footer>
    </>
  );
}
