// RDI-6.1: a file written by react-data-export (the published package, through
// its public exportDataset API) comes back through importFile with its rows.
// docs/api.md §4.3 "Round trip with react-data-export".
import { exportDataset } from 'react-data-export';
import { importFile } from '../src/index';

type Sale = { region: string; rep: string; date: Date; units: number; revenue: number; note: string };

const sales: Sale[] = [
  { region: 'North', rep: 'Zoë', date: new Date(2026, 0, 15), units: 12, revenue: 1234.5, note: 'Straße' },
  { region: 'South', rep: 'Ada', date: new Date(2026, 1, 1), units: 7, revenue: 99.95, note: '日本 😀' },
  { region: 'East', rep: 'Linus', date: new Date(2026, 2, 31), units: 0, revenue: -12.25, note: '' },
];

const flatColumns = [
  { title: 'Region', key: 'region' as const },
  { title: 'Rep', key: 'rep' as const },
  { title: 'Date', key: 'date' as const, type: 'date' as const },
  { title: 'Units', key: 'units' as const, total: 'sum' as const },
  { title: 'Revenue', key: 'revenue' as const, numFmt: '#,##0.00', total: 'sum' as const },
  { title: 'Note', key: 'note' as const },
];

const row = (o: Record<string, unknown>) => Object.assign(Object.create(null), o);
const expected = sales.map((s) =>
  row({ Region: s.region, Rep: s.rep, Date: s.date, Units: s.units, Revenue: s.revenue, Note: s.note === '' ? null : s.note }),
);

describe('round trip with react-data-export', () => {
  it('xlsx: exportDataset → importFile gives the same rows; the totals row is skipped', async () => {
    const { blob, filename } = await exportDataset({ columns: flatColumns, data: sales }, { download: false, filename: 'sales' });
    expect(filename).toBe('sales.xlsx');

    const r = await importFile(blob);
    expect(r.meta.format).toBe('xlsx');
    expect(r.meta.totalsRowSkipped).toBe(true);
    expect(r.columns.map((c) => [c.key, c.type])).toEqual([
      ['Region', 'string'], ['Rep', 'string'], ['Date', 'date'], ['Units', 'number'], ['Revenue', 'number'], ['Note', 'string'],
    ]);
    expect(r.data).toEqual(expected);
    expect(r.issues).toEqual([]);
  });

  it('xlsx: header groups come back flattened', async () => {
    const columns = [
      { title: 'Region', key: 'region' as const },
      { title: 'Q1', children: [{ title: 'Units', key: 'units' as const }, { title: 'Revenue', key: 'revenue' as const }] },
    ];
    const { blob } = await exportDataset({ columns, data: sales }, { download: false });

    const r = await importFile(blob);
    expect(r.columns.map((c) => c.key)).toEqual(['Region', 'Q1 / Units', 'Q1 / Revenue']);
    expect(r.data).toEqual(sales.map((s) => row({ Region: s.region, 'Q1 / Units': s.units, 'Q1 / Revenue': s.revenue })));
  });

  it('xlsx: a schema maps the exported titles back to the app fields', async () => {
    const { blob } = await exportDataset({ columns: flatColumns, data: sales }, { download: false });

    const r = await importFile(blob, {
      schema: {
        fields: {
          region: { aliases: ['Region'], required: true },
          units: { aliases: ['Units'], type: 'number' },
          date: { aliases: ['Date'], type: 'date' },
        },
      },
    });
    expect(r.data).toEqual(sales.map((s) => row({ region: s.region, units: s.units, date: s.date })));
    expect(r.issues).toEqual([]);
  });

  it('csv: exportDataset → importFile gives the same values', async () => {
    const { blob, filename } = await exportDataset({ columns: flatColumns, data: sales }, { download: false, format: 'csv', filename: 'sales' });
    expect(filename).toBe('sales.csv');

    const r = await importFile(new File([blob], filename, { type: 'text/csv' }));
    expect(r.meta.format).toBe('csv');
    expect(r.columns.map((c) => [c.key, c.type])).toEqual([
      ['Region', 'string'], ['Rep', 'string'], ['Date', 'date'], ['Units', 'number'], ['Revenue', 'number'], ['Note', 'string'],
    ]);
    // CSV has no totals formulas: the totals row is written as values, so drop it before comparing.
    const data = r.data.slice(0, sales.length);
    expect(data).toEqual(expected);
  });
});
