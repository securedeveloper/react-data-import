import { act, render } from '@testing-library/react';
import { importFile, previewFile, useColumnMapping, type ImportResult, type ImportSchema, type UseColumnMapping } from '../src/index';

const schema: ImportSchema = { fields: { email: { aliases: ['E-mail'], required: true }, name: { aliases: ['Full name'] }, phone: { required: true } } };
const csv = 'E-mail,Full name,Telefon\nada@x.org,Ada,123\ngrace@x.org,Grace,456\n';

function Probe({ result, s, api }: { result: ImportResult<unknown> | null; s: ImportSchema; api: { current: UseColumnMapping | null } }) {
  api.current = useColumnMapping(result, s);
  return null;
}

describe('useColumnMapping', () => {
  it('from a preview: columns with samples, the automatic mapping, and what is missing', async () => {
    const preview = await previewFile(csv);
    const api: { current: UseColumnMapping | null } = { current: null };
    render(<Probe result={preview} s={schema} api={api} />);
    const m = api.current!;
    expect(m.mapping).toEqual({ email: 'E-mail', name: 'Full name', phone: null });
    expect(m.fields).toEqual([
      { name: 'email', required: true, column: 'E-mail' },
      { name: 'name', required: false, column: 'Full name' },
      { name: 'phone', required: true, column: null },
    ]);
    expect(m.columns).toEqual([
      { key: 'E-mail', title: 'E-mail', letter: 'A', sample: ['ada@x.org', 'grace@x.org'], takenBy: 'email' },
      { key: 'Full name', title: 'Full name', letter: 'B', sample: ['Ada', 'Grace'], takenBy: 'name' },
      { key: 'Telefon', title: 'Telefon', letter: 'C', sample: [123, 456], takenBy: null },
    ]);
    expect(m.missingRequired).toEqual(['phone']);
  });

  it('set moves a column taken by another field; reset goes back; the mapping imports', async () => {
    const preview = await previewFile(csv);
    const api: { current: UseColumnMapping | null } = { current: null };
    render(<Probe result={preview} s={schema} api={api} />);
    act(() => api.current!.set('phone', 'Telefon'));
    expect(api.current!.missingRequired).toEqual([]);
    act(() => api.current!.set('name', 'E-mail'));
    expect(api.current!.mapping).toEqual({ email: null, name: 'E-mail', phone: 'Telefon' });
    expect(api.current!.missingRequired).toEqual(['email']);
    act(() => api.current!.set('email', 'E-mail'));
    act(() => api.current!.set('name', 'Full name'));
    const r = await importFile(csv, { schema, mapping: api.current!.mapping });
    expect(r.issues).toEqual([]);
    expect(r.data[0]).toEqual(Object.assign(Object.create(null), { email: 'ada@x.org', name: 'Ada', phone: 123 }));
    act(() => api.current!.reset());
    expect(api.current!.mapping).toEqual({ email: 'E-mail', name: 'Full name', phone: null });
    expect(() => api.current!.set('nope', null)).toThrow(TypeError);
    expect(() => api.current!.set('email', 'nope')).toThrow(TypeError);
  });

  it("from a mapped result (useDataImport's 'mapping' state): its mapping, unmapped columns by key", async () => {
    const mapped = await importFile(csv, { schema });
    const api: { current: UseColumnMapping | null } = { current: null };
    render(<Probe result={mapped} s={schema} api={api} />);
    expect(api.current!.mapping).toEqual({ email: 'E-mail', name: 'Full name', phone: null });
    expect(api.current!.columns.map((c) => [c.key, c.letter, c.sample.length])).toEqual([['E-mail', 'A', 2], ['Full name', 'B', 2], ['Telefon', '', 0]]);
  });

  it('a new result starts from its own automatic mapping; null gives an empty state', async () => {
    const api: { current: UseColumnMapping | null } = { current: null };
    const { rerender } = render(<Probe result={null} s={schema} api={api} />);
    expect(api.current!.columns).toEqual([]);
    expect(api.current!.mapping).toEqual({ email: null, name: null, phone: null });
    const a = await previewFile(csv);
    rerender(<Probe result={a} s={schema} api={api} />);
    act(() => api.current!.set('phone', 'Telefon'));
    const b = await previewFile('Phone,Mail\n1,x@y\n');
    rerender(<Probe result={b} s={schema} api={api} />);
    expect(api.current!.mapping).toEqual({ email: null, name: null, phone: 'Phone' });
  });
});

describe('useColumnMapping samples (RDI-12)', () => {
  it("in the 'mapping' state, samples come from the file even when a validator rejects every row", async () => {
    const s: ImportSchema = { fields: { email: { aliases: ['E-mail'], required: true }, name: { aliases: ['Full name'] }, phone: { required: true } } };
    const result = await importFile(csv, { schema: s, validate: () => 'rejected' });
    expect(result.data).toEqual([]);
    const api: { current: UseColumnMapping | null } = { current: null };
    // A copy, as <DataImport> makes when it adds FILES_IGNORED, keeps the samples.
    render(<Probe result={{ ...result, issues: [...result.issues] }} s={s} api={api} />);
    expect(api.current!.columns.map((c) => [c.key, c.sample])).toEqual([
      ['E-mail', ['ada@x.org', 'grace@x.org']],
      ['Full name', ['Ada', 'Grace']],
      ['Telefon', []],
    ]);
  });
});
