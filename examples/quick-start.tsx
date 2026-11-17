import { useState } from 'react';
import { DataImport } from 'react-data-import';

export function ContactsUpload() {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  return (
    <>
      <DataImport maxFileBytes={10 * 1024 * 1024} onImported={(result) => setRows(result.data)}>
        Choose a spreadsheet
      </DataImport>
      <p>{rows.length} rows imported</p>
    </>
  );
}
