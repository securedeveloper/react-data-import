import { DataImport, isExcelError, type ImportResult } from 'react-data-import';

export function DropZone({ onRows }: { onRows: (result: ImportResult) => void }) {
  return (
    <DataImport maxFileBytes={10 * 1024 * 1024} onImported={onRows}>
      {({ getRootProps, getInputProps, isDragging, status, result, error }) => (
        <div {...getRootProps({ className: isDragging ? 'drop over' : 'drop' })}>
          <label>
            Choose a file <input {...getInputProps()} />
          </label>
          <p>or drop an .xlsx or .csv here</p>
          <p role="status">
            {status === 'reading' ? 'Reading the file…' : status === 'done' && result ? `${result.data.length} rows imported` : ''}
          </p>
          {error ? <p role="alert">{isExcelError(error) ? error.message : 'The file could not be read.'}</p> : null}
        </div>
      )}
    </DataImport>
  );
}
