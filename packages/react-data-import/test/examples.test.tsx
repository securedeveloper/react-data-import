// The README examples (../../examples) run here, so the recipes do what the guide says.
import { render, screen } from '@testing-library/react';
import { readWithArkType } from '../../../examples/arktype';
import { describe as describeIssue, load } from '../../../examples/issues';
import { readContacts } from '../../../examples/import-file';
import { ContactsUpload } from '../../../examples/quick-start';
import { readOrders } from '../../../examples/row-function';
import { readWithValibot } from '../../../examples/valibot';
import { readWithZod } from '../../../examples/zod';

const csv = (text: string, name = 'contacts.csv') => new File([text], name, { type: 'text/csv' });
const contacts = 'E-mail,Age,Phone\nada@x.org,36,\nnot-an-email,5,555\ngrace@x.org,-2,\n';

describe('README examples', () => {
  it.each([
    ['Zod', readWithZod],
    ['Valibot', readWithValibot],
    ['ArkType', readWithArkType],
  ])('the %s recipe keeps valid rows and reports issues by cell', async (_name, read) => {
    const { emails, issues } = await read(csv(contacts));
    expect(emails).toEqual(['ada@x.org']);
    expect(issues.map((i) => [i.row, i.field, i.column, i.ref, i.code])).toEqual([
      [3, 'email', 'E-mail', 'A3', 'INVALID'],
      [4, 'age', 'Age', 'B4', 'INVALID'],
    ]);
  });

  it('importFile with a schema', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const r = await readContacts(csv('Full name,E-mail,Start date\nAda,ada@x.org,2024-01-15\n'));
    expect(r.columns.map((c) => c.key)).toEqual(['email', 'name', 'joined']);
    expect(r.data).toEqual([{ email: 'ada@x.org', name: 'Ada', joined: new Date(2024, 0, 15) }]);
    expect(r.rowNumbers).toEqual([2]);
  });

  it('a row function and field checks', async () => {
    const r = await readOrders(csv('sku,Qty,price\nA1,2,\nB2,0,5\nC3,1,99999\n'));
    expect(r.data).toEqual([{ sku: 'A1', quantity: 2, price: null }]);
    expect(r.issues.map((i) => [i.row, i.code, i.severity])).toEqual([
      [2, 'NO_PRICE', 'warning'],
      [3, 'INVALID', 'error'],
      [4, 'INVALID', 'error'],
    ]);
  });

  it('issues and errors as messages', async () => {
    expect(describeIssue({ row: 17, field: 'amount', ref: 'C17', code: 'INVALID', message: 'must be positive', severity: 'error' })).toBe('Row 17, C17 (amount): must be positive');
    expect(describeIssue({ row: 0, field: 'email', code: 'MAPPING_MISSING', message: 'No column.', severity: 'error' })).toBe('File (email): No column.');
    const cfb = new Uint8Array(1024);
    cfb.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    await expect(load(new File([cfb], 'old.xls'))).rejects.toThrow("This file type isn't supported. Use .xlsx or .csv.");
    expect((await load(csv('a\n'))).warnings).toEqual(['File: The file has a header but no data rows.']);
  });

  it('the quick start renders a labelled file input', () => {
    render(<ContactsUpload />);
    expect(screen.getByLabelText('Choose a spreadsheet')).toHaveProperty('type', 'file');
    expect(screen.getByText('0 rows imported')).toBeTruthy();
  });
});
