import { useColumnMapping, useDataImport, type ImportSchema } from 'react-data-import';

const schema: ImportSchema = {
  fields: { email: { aliases: ['E-mail'], required: true }, name: {}, phone: {} },
};

export function MappingStep() {
  const { importFile, applyMapping, status, result } = useDataImport({ schema });
  const { fields, columns, mapping, set, missingRequired } = useColumnMapping(result, schema);
  return (
    <div>
      <input type="file" onChange={(e) => e.currentTarget.files?.[0] && importFile(e.currentTarget.files[0]).catch(() => {})} />
      {status === 'mapping' ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            applyMapping(mapping).catch(() => {}); // the file is not read again
          }}
        >
          {fields.map((f) => (
            <label key={f.name}>
              {f.name}
              {f.required ? ' *' : ''}
              <select value={f.column ?? ''} onChange={(e) => set(f.name, e.currentTarget.value || null)}>
                <option value="">(none)</option>
                {columns.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.title} {c.sample.length ? `(${c.sample.join(', ')})` : ''}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <button disabled={missingRequired.length > 0}>Import</button>
        </form>
      ) : null}
    </div>
  );
}
