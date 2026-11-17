import { useDataImport } from 'react-data-import';

export function Importer() {
  const { importFile, status, progress, result, error, abort, reset } = useDataImport({ maxFileBytes: 10 * 1024 * 1024 });
  return (
    <div>
      <input
        type="file"
        accept=".xlsx,.csv"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          if (file) importFile(file).catch(() => {}); // the error is also in `error`
        }}
      />
      {status === 'reading' ? (
        <p role="status">
          Reading… {progress ? `${Math.round(progress.ratio * 100)}%` : ''} <button onClick={() => abort()}>Cancel</button>
        </p>
      ) : null}
      {status === 'done' && result ? <p role="status">{result.data.length} rows</p> : null}
      {status === 'error' ? <p role="alert">{String(error)}</p> : null}
      <button onClick={reset}>Start over</button>
    </div>
  );
}
