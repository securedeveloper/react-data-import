import { fromDataset, isExcelError, toUint8Array } from 'javascript-excel';
import { importDataset } from 'javascript-excel/import';
import type { WorkerClient } from 'javascript-excel/worker';
import { z } from 'zod';
import { importFile, previewFile, type ImportProgress, type StandardSchemaLike } from '../src/index';

const people = [
  { name: 'Ada', email: 'ada@x.org', joined: new Date(2024, 0, 15), age: 36 },
  { name: 'Grace', email: 'grace@x.org', joined: new Date(2023, 5, 1), age: 45 },
  { name: 'Linus', email: '', joined: new Date(2022, 10, 30), age: -1 },
];
const xlsx = async () =>
  toUint8Array({
    sheets: [
      fromDataset({
        columns: [
          { title: 'Name', key: 'name' },
          { title: 'E-mail', key: 'email' },
          { title: 'Joined', key: 'joined', type: 'date' },
          { title: 'Age', key: 'age', total: 'sum' },
        ],
        data: people,
      }),
    ],
  });
const row = (o: Record<string, unknown>) => Object.assign(Object.create(null), o);

describe('importFile', () => {
  it('reads an xlsx written by fromDataset, totals row skipped', async () => {
    const r = await importFile(await xlsx());
    expect(r.columns.map((c) => [c.key, c.type])).toEqual([['Name', 'string'], ['E-mail', 'string'], ['Joined', 'date'], ['Age', 'number']]);
    expect(r.data).toHaveLength(3);
    expect(r.data[0]).toEqual(row({ Name: 'Ada', 'E-mail': 'ada@x.org', Joined: new Date(2024, 0, 15), Age: 36 }));
    expect(r.rowNumbers).toEqual([2, 3, 4]);
    expect(r.meta.totalsRowSkipped).toBe(true);
  });

  it('reads a File: name and type go to detection and meta', async () => {
    const file = new File(['Name;Amount\nAda;1.234,50\n'], 'people.csv', { type: 'text/csv' });
    const r = await importFile(file, { locale: { decimal: ',', group: '.' } });
    expect(r.meta).toMatchObject({ format: 'csv', fileName: 'people.csv', delimiter: ';' });
    expect(r.data).toEqual([row({ Name: 'Ada', Amount: 1234.5 })]);
  });

  it('gives the same result as javascript-excel importDataset when nothing is validated', async () => {
    const bytes = await xlsx();
    const ours = await importFile(bytes);
    const engine = await importDataset(bytes);
    expect(ours).toEqual(engine);
  });

  it('maxFileBytes rejects before the file is read', async () => {
    const file = new File(['x'.repeat(100)], 'big.csv');
    const read = vi.spyOn(file, 'arrayBuffer');
    const err = await importFile(file, { maxFileBytes: 10 }).catch((e) => e);
    expect(isExcelError(err)).toBe(true);
    expect(err).toMatchObject({ code: 'LIMIT_EXCEEDED', details: { limit: 'maxFileBytes', value: 100, max: 10 } });
    expect(read).not.toHaveBeenCalled();
    await expect(importFile('a', { maxFileBytes: 0 })).rejects.toThrow(TypeError);
  });

  it('passes javascript-excel errors through unchanged', async () => {
    const cfb = new Uint8Array(1024);
    cfb.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    await expect(importFile(cfb, { fileName: 'old.xls' })).rejects.toMatchObject({ code: 'UNSUPPORTED_FORMAT' });
    await expect(importFile('a\n1', { sheet: 'nope', format: 'csv' })).resolves.toBeTruthy(); // CSV has no sheets to pick
  });
});

describe('schema and validation', () => {
  const schema = {
    fields: {
      email: { aliases: ['E-mail'], required: true, validate: (v: unknown) => (typeof v === 'string' && v.includes('@') ? undefined : 'not an e-mail address') },
      name: {},
      age: { type: 'number' as const },
    },
  };

  it('maps fields, runs field checks, and leaves invalid rows out', async () => {
    const r = await importFile(await xlsx(), { schema });
    expect(r.columns.map((c) => c.key)).toEqual(['email', 'name', 'age']);
    expect(r.data).toEqual([row({ email: 'ada@x.org', name: 'Ada', age: 36 }), row({ email: 'grace@x.org', name: 'Grace', age: 45 })]);
    expect(r.rowNumbers).toEqual([2, 3]);
    expect(r.issues.map((i) => [i.row, i.field, i.code])).toEqual([[4, 'email', 'REQUIRED'], [4, 'email', 'INVALID']]);
  });

  it('a row validator: messages, issue objects, warnings that keep the row, async', async () => {
    const r = await importFile<Record<string, unknown>>(await xlsx(), {
      schema,
      validate: async (p, { rowNumber, index }) => {
        await Promise.resolve();
        if ((p['age'] as number) > 40) return { field: 'age', message: `row ${rowNumber} (#${index}) is over 40`, severity: 'warning', code: 'AGE' };
        return undefined;
      },
    });
    expect(r.data.map((d) => d['name'])).toEqual(['Ada', 'Grace']);
    expect(r.issues.find((i) => i.code === 'AGE')).toEqual({ row: 3, field: 'age', code: 'AGE', message: 'row 3 (#1) is over 40', severity: 'warning' });
  });

  it("validation: 'stop' rejects with VALIDATION_FAILED at the first invalid row", async () => {
    const err = await importFile(await xlsx(), { schema, validation: 'stop' }).catch((e) => e);
    expect(isExcelError(err)).toBe(true);
    expect(err).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect((err as { details: { issues: Array<{ row: number }> } }).details.issues.every((i) => i.row === 4)).toBe(true);
    await expect(importFile('a', { validation: 'all' as never })).rejects.toThrow(TypeError);
  });

  it('a Standard Schema (zod): rows become its output, issues get the field from the path', async () => {
    const Person = z.object({ name: z.string(), age: z.number().int().nonnegative() }).transform((p) => ({ ...p, adult: p.age >= 18 }));
    const r = await importFile(await xlsx(), { schema: { fields: { name: {}, age: {} } }, validate: Person });
    // r.data is typed as Person's output
    const adults: boolean[] = r.data.map((p) => p.adult);
    expect(adults).toEqual([true, true]);
    expect(r.issues).toEqual([expect.objectContaining({ row: 4, field: 'age', code: 'INVALID', severity: 'error' })]);
  });

  it('a hand-written Standard Schema works too', async () => {
    const upper: StandardSchemaLike<{ name: string }> = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: (v) => {
          const name = (v as { name?: unknown }).name;
          return typeof name === 'string' && name.length > 3 ? { value: { name: name.toUpperCase() } } : { issues: [{ message: 'too short', path: [{ key: 'name' }] }] };
        },
      },
    };
    const r = await importFile('name\nAda\nGrace\n', { validate: upper });
    expect(r.data).toEqual([{ name: 'GRACE' }]);
    expect(r.issues).toEqual([{ row: 2, field: 'name', code: 'INVALID', message: 'too short', severity: 'error' }]);
  });

  it('an unmapped optional field is null in every row, so .nullable() accepts it (javascript-excel JSE-21)', async () => {
    const Row = z.object({ email: z.string(), phone: z.string().nullable() });
    const r = await importFile('E-mail\nada@x.org\n', { schema: { fields: { email: { aliases: ['E-mail'] }, phone: {} } }, validate: Row });
    expect(r.issues).toEqual([]);
    expect(r.data).toEqual([{ email: 'ada@x.org', phone: null }]);
    expect(r.columns.map((c) => [c.key, c.letter, c.type])).toEqual([['email', 'A', 'string'], ['phone', '', 'empty']]);
  });

  it('rows with engine errors (TYPE, REQUIRED) are left out too', async () => {
    const r = await importFile('n\n1\nx\n', { types: { n: 'number' } });
    expect(r.data).toEqual([row({ n: 1 })]);
    expect(r.issues.map((i) => [i.code, i.row])).toEqual([['TYPE', 3]]);
  });
});

describe('progress, abort, worker', () => {
  it('progress is non-decreasing and ends at 1, with a validate phase when validating', async () => {
    const seen: ImportProgress[] = [];
    await importFile(await xlsx(), { validate: () => undefined, onProgress: (p) => seen.push(p) });
    expect(seen.map((p) => p.ratio)).toEqual([...seen.map((p) => p.ratio)].sort((a, b) => a - b));
    expect(seen[seen.length - 1]).toEqual({ phase: 'validate', ratio: 1 });
    expect(seen.some((p) => p.phase === 'parse')).toBe(true);
  });

  it('abort rejects with the signal reason, before and during validation', async () => {
    const ac = new AbortController();
    ac.abort(new Error('stop'));
    await expect(importFile('a\n1', { signal: ac.signal })).rejects.toThrow('stop');
    const ac2 = new AbortController();
    const p = importFile('a\n1\n2\n3', { signal: ac2.signal, validate: () => void ac2.abort(new Error('mid')) });
    await expect(p).rejects.toThrow('mid');
  });

  it('uses the worker from workerThreshold on, without the schema functions', async () => {
    const calls: Array<{ options: Record<string, unknown> }> = [];
    const worker = {
      importDataset: (input: string | Uint8Array, options: Record<string, unknown> = {}) => {
        calls.push({ options });
        for (const v of Object.values((options['schema'] as { fields: Record<string, object> } | undefined)?.fields ?? {})) {
          if ('validate' in v) throw new TypeError('a function was sent to the worker');
        }
        return importDataset(input, options);
      },
    } as unknown as WorkerClient;
    const schema = { fields: { a: { validate: (v: unknown) => (v === 2 ? 'two' : undefined) } } };
    const small = await importFile('a\n1\n2', { worker, workerThreshold: 100, schema });
    expect(calls).toHaveLength(0);
    const big = await importFile(`a\n1\n2\n${'\n'.repeat(200)}`, { worker, workerThreshold: 100, schema });
    expect(calls).toHaveLength(1);
    expect(big.data).toEqual(small.data);
    expect(big.issues).toEqual(small.issues);
  });
});

describe('previewFile', () => {
  it('returns the first rows and the detected layout, without mapping', async () => {
    const csv = `Report\n\nName,Age\n${Array.from({ length: 100 }, (_, i) => `p${i},${i}`).join('\n')}`;
    const p = await previewFile(csv, { rows: 5, schema: { fields: { name: {} } } });
    expect(p.data).toHaveLength(5);
    expect(p.meta.truncated).toBe(true);
    expect(p.meta.header).toEqual({ rows: [2], detected: true, confidence: 'high' });
    expect(p.columns.map((c) => c.key)).toEqual(['Name', 'Age']);
    expect((await previewFile(csv)).data).toHaveLength(20);
    await expect(previewFile(csv, { rows: -1 })).rejects.toThrow(TypeError);
  });
});
