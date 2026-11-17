// RDI-6: odd CSVs and .xlsx layouts from test/fixtures (see its README.md),
// and the header-scan limit (docs/api.md §5.1).
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importDataset } from 'javascript-excel/import';
import { importFile, previewFile, type ImportOptions } from '../src/index';
import { csvFixtures, longCsv, titleRowsAbove, WIDE_COLUMNS, xlsxFixtures } from './fixtures/generate';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const update = process.env['UPDATE_FIXTURES'] === '1';
const csvPath = (name: string) => join(dir, 'csv', name);
const xlsxPath = (name: string) => join(dir, 'xlsx', name);
const load = (path: string) => new Uint8Array(readFileSync(path));
const row = (o: Record<string, unknown>) => Object.assign(Object.create(null), o);

const csv = (name: string, options: ImportOptions = {}) => importFile(load(csvPath(name)), { fileName: name, ...options });
const xlsx = (name: string, options: ImportOptions = {}) => importFile(load(xlsxPath(name)), { fileName: name, ...options });

describe('the committed fixtures match generate.ts', () => {
  if (update) {
    it('writes them (UPDATE_FIXTURES=1)', async () => {
      mkdirSync(join(dir, 'csv'), { recursive: true });
      mkdirSync(join(dir, 'xlsx'), { recursive: true });
      for (const [name, bytes] of Object.entries(csvFixtures())) writeFileSync(csvPath(name), bytes);
      for (const [name, bytes] of Object.entries(await xlsxFixtures())) writeFileSync(xlsxPath(name), bytes);
    });
    return;
  }

  it('CSV: byte for byte, and no stray files', () => {
    const want = csvFixtures();
    expect(readdirSync(join(dir, 'csv')).sort()).toEqual(Object.keys(want).sort());
    for (const [name, bytes] of Object.entries(want)) expect(Buffer.from(load(csvPath(name))).equals(Buffer.from(bytes)), name).toBe(true);
  });

  it('xlsx: the same content (the writer stamps a time, so the bytes differ)', async () => {
    const want = await xlsxFixtures();
    expect(readdirSync(join(dir, 'xlsx')).sort()).toEqual(Object.keys(want).sort());
    for (const [name, bytes] of Object.entries(want)) {
      expect(existsSync(xlsxPath(name)), name).toBe(true);
      expect(await importDataset(load(xlsxPath(name))), name).toEqual(await importDataset(bytes));
    }
  });
});

describe('encodings', () => {
  const people = [
    row({ Name: 'Zoë', City: 'München', Amount: 1.5 }),
    row({ Name: 'José', City: 'São Paulo', Amount: 2 }),
    row({ Name: 'Łukasz', City: 'Kraków', Amount: 3.25 }),
  ];

  it.each([
    ['utf8-bom.csv', 'utf-8'],
    ['utf16le-bom.csv', 'utf-16le'],
    ['utf16be-bom.csv', 'utf-16be'],
  ])('%s: the BOM decides the encoding', async (name, encoding) => {
    const r = await csv(name);
    expect(r.meta).toMatchObject({ encoding, bom: true, header: { rows: [0], confidence: 'high' } });
    expect(r.columns.map((c) => c.key)).toEqual(['Name', 'City', 'Amount']); // no BOM left in the first title
    expect(r.data).toEqual(people);
  });

  it('the BOM wins over the encoding option', async () => {
    expect((await csv('utf16le-bom.csv', { encoding: 'windows-1252' })).data).toEqual(people);
  });

  it('Windows-1252: read with encoding, and a warning without it', async () => {
    const r = await csv('windows-1252.csv', { encoding: 'windows-1252' });
    expect(r.meta).toMatchObject({ encoding: 'windows-1252', bom: false });
    expect(r.data[0]).toEqual(row({ Product: 'Café', Price: '€5', Note: '„quoted“' }));
    expect(r.warnings).toEqual([]);
    const plain = await csv('windows-1252.csv');
    expect(plain.warnings.map((w) => w.code)).toEqual(['CSV_INVALID_ENCODING']);
    expect(plain.data[0]?.['Product']).toBe('Caf�');
  });
});

describe('delimiters and line endings', () => {
  it('semicolon, with a European locale', async () => {
    const r = await csv('semicolon.csv', { locale: { decimal: ',', group: '.', dateOrder: 'DMY' } });
    expect(r.meta.delimiter).toBe(';');
    expect(r.data).toEqual([
      row({ Name: 'Ada', Amount: 1234.5, Date: new Date(2024, 0, 15) }),
      row({ Name: 'Grace', Amount: 99, Date: new Date(2023, 5, 1) }),
    ]);
  });

  it('tab (.tsv): booleans inferred', async () => {
    const r = await csv('tab.tsv');
    expect(r.meta.delimiter).toBe('\t');
    expect(r.data[1]).toEqual(row({ Name: 'Grace', Amount: 2, Active: false }));
  });

  it('pipe: codes with leading zeros stay text', async () => {
    const r = await csv('pipe.csv');
    expect(r.meta.delimiter).toBe('|');
    expect(r.columns.map((c) => [c.key, c.type])).toEqual([['Name', 'string'], ['Amount', 'number'], ['Code', 'string']]);
    expect(r.data.map((d) => d['Code'])).toEqual(['007', '012']);
  });

  it('quoted newlines, quotes and commas stay in the value; row numbers count records', async () => {
    const r = await csv('quoted-newlines.csv');
    expect(r.data).toEqual([row({ Name: 'Ada', Note: 'line one\nline two', Amount: 1 }), row({ Name: 'Grace', Note: 'a "quoted" word, with a comma', Amount: 2 })]);
    expect(r.rowNumbers).toEqual([2, 3]);
  });

  it.each(['crlf.csv', 'lf.csv', 'cr.csv'])('%s gives the same rows', async (name) => {
    const r = await csv(name);
    expect(r.data).toEqual([row({ Name: 'Ada', Amount: 1 }), row({ Name: 'Grace', Amount: 2 })]);
    expect(r.rowNumbers).toEqual([2, 3]);
  });

  it('trailing empty columns: kept as empty columns keyed by letter', async () => {
    const r = await csv('trailing-empty-columns.csv');
    expect(r.columns.map((c) => [c.key, c.type])).toEqual([['Name', 'string'], ['Amount', 'number'], ['C', 'empty'], ['D', 'empty'], ['E', 'empty']]);
    // With a schema they are simply not mapped.
    const mapped = await csv('trailing-empty-columns.csv', { schema: { fields: { name: { aliases: ['Name'] }, amount: { aliases: ['Amount'] } } } });
    expect(mapped.data).toEqual([row({ name: 'Ada', amount: 1 }), row({ name: 'Grace', amount: 2 })]);
  });
});

describe('header detection', () => {
  it('CSV: title rows above the header are skipped', async () => {
    const r = await csv('title-row.csv');
    expect(r.meta.header).toEqual({ rows: [3], detected: true, confidence: 'high' });
    expect(r.data).toEqual([row({ Region: 'North', Q1: 10, Q2: 20 }), row({ Region: 'South', Q1: 30, Q2: 40 })]);
    expect(r.rowNumbers).toEqual([5, 6]);
  });

  it('CSV: blank rows before the header are skipped, empty or all delimiters', async () => {
    const blank = await csv('blank-rows-before-header.csv');
    expect(blank.meta.header).toMatchObject({ rows: [3], confidence: 'high' });
    expect(blank.rowNumbers).toEqual([5, 6]);
    const commas = await csv('blank-delimited-rows-before-header.csv');
    expect(commas.meta.header).toMatchObject({ rows: [2], confidence: 'high' });
    expect(commas.data[0]).toEqual(row({ Name: 'Ada', Amount: 1, City: 'Oslo' }));
  });

  it('CSV: two header rows are NOT detected (CSV has no merges); header: { rows: 2 } reads them', async () => {
    // What 'auto' does today: the first row is the header, and the second becomes data, with high confidence.
    const auto = await csv('two-header-rows.csv');
    expect(auto.meta.header).toEqual({ rows: [0], detected: true, confidence: 'high' });
    expect(auto.data[0]).toEqual(row({ Region: null, Sales: 'Q1', Sales_2: 'Q2' }));
    const two = await csv('two-header-rows.csv', { header: { rows: 2 } });
    expect(two.columns.map((c) => c.key)).toEqual(['Region', 'Sales / Q1', 'Sales / Q2']);
    expect(two.data).toEqual([row({ Region: 'North', 'Sales / Q1': 10, 'Sales / Q2': 20 }), row({ Region: 'South', 'Sales / Q1': 30, 'Sales / Q2': 40 })]);
  });

  it.each(['title-row-merged.xlsx', 'title-rows-unmerged.xlsx'])('xlsx %s: title rows skipped', async (name) => {
    const r = await xlsx(name);
    expect(r.meta.header).toEqual({ rows: [2], detected: true, confidence: 'high' });
    expect(r.columns.map((c) => c.key)).toEqual(['Region', 'Jan', 'Feb', 'Mar']);
    expect(r.rowNumbers).toEqual([4, 5]);
  });

  it('xlsx: header groups (merged) are detected as a two-row header and flattened', async () => {
    for (const [name, rows] of [['header-groups.xlsx', [0, 1]], ['title-and-header-groups.xlsx', [1, 2]]] as const) {
      const r = await xlsx(name);
      expect(r.meta.header, name).toEqual({ rows, detected: true, confidence: 'high' });
      expect(r.columns.map((c) => c.key), name).toEqual(['Region', 'Q1 / Jan', 'Q1 / Feb', 'Q1 / Mar']);
      expect(r.data[0], name).toEqual(row({ Region: 'North', 'Q1 / Jan': 10, 'Q1 / Feb': 20, 'Q1 / Mar': 30 }));
    }
  });

  it('xlsx: blank rows before the header, and a table that starts in column C', async () => {
    const blank = await xlsx('blank-rows-before-header.xlsx');
    expect(blank.meta).toMatchObject({ header: { rows: [3], confidence: 'high' }, range: 'A4:D6' });
    const offset = await xlsx('offset-table.xlsx');
    expect(offset.meta).toMatchObject({ header: { rows: [1], confidence: 'high' }, range: 'C2:D4' });
    expect(offset.columns.map((c) => [c.key, c.letter])).toEqual([['Region', 'C'], ['Jan', 'D']]);
  });
});

// The header is looked for in the first 25 rows of the used range (javascript-excel's
// detectHeader maxScan default). Blank rows above the used range don't count; title rows do.
describe('the header-scan limit (25 rows)', () => {
  it('a header after 23 title rows: found, high confidence', async () => {
    const r = await importFile(titleRowsAbove(23), { format: 'csv' });
    expect(r.meta.header).toEqual({ rows: [23], detected: true, confidence: 'high' });
  });

  it('after 24 title rows (the 25th row): found, but low confidence, since no data row is inside the scan', async () => {
    const r = await importFile(titleRowsAbove(24), { format: 'csv' });
    expect(r.meta.header).toEqual({ rows: [24], detected: true, confidence: 'low' });
    expect(r.data).toEqual([row({ Name: 'Ada', Amount: 1 }), row({ Name: 'Grace', Amount: 2 })]);
  });

  it('after 25 title rows: not found; falls back to row 0 with low confidence', async () => {
    const r = await importFile(titleRowsAbove(25), { format: 'csv' });
    expect(r.meta.header).toEqual({ rows: [0], detected: true, confidence: 'low' });
    // An explicit header row reads it.
    const fixed = await importFile(titleRowsAbove(25), { format: 'csv', header: 25 });
    expect(fixed.data).toEqual([row({ Name: 'Ada', Amount: 1 }), row({ Name: 'Grace', Amount: 2 })]);
  });

  it('blank rows above the header do not count against the limit', async () => {
    const r = await importFile(`${'\n'.repeat(40)}Name,Amount\nAda,1\n`, { format: 'csv' });
    expect(r.meta.header).toEqual({ rows: [40], detected: true, confidence: 'high' });
  });
});

describe('size', () => {
  it(`${WIDE_COLUMNS} columns`, async () => {
    const r = await csv('wide-500-columns.csv');
    expect(r.columns).toHaveLength(WIDE_COLUMNS);
    expect(r.columns[r.columns.length - 1]).toMatchObject({ key: `col${WIDE_COLUMNS}`, letter: 'SF', type: 'number' });
    expect(r.data).toHaveLength(3);
    expect(r.data[2]?.[`col${WIDE_COLUMNS}`]).toBe(3 * WIDE_COLUMNS + WIDE_COLUMNS - 1);
  });

  it('100,000 rows: all imported with types; preview reads the first rows; maxRows rejects', async () => {
    const text = longCsv(100_000);
    const r = await importFile(text, { format: 'csv' });
    expect(r.data).toHaveLength(100_000);
    expect(r.columns.map((c) => c.type)).toEqual(['number', 'string', 'number', 'date']);
    expect(r.rowNumbers[r.rowNumbers.length - 1]).toBe(100_001);
    expect((await previewFile(text, { format: 'csv' })).data).toHaveLength(20);
    await expect(importFile(text, { format: 'csv', maxRows: 1000 })).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED', details: { limit: 'maxRows' } });
  }, 60_000);
});
