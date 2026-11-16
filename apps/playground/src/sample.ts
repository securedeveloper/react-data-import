// Sample files built in the browser with javascript-excel, so the demo needs
// no upload and no download.
import { fromDataset, toUint8Array } from 'javascript-excel';
import { toCsv } from 'javascript-excel/csv';

const people = [
  { name: 'Ada Lovelace', mail: 'ada@example.org', since: new Date(2024, 0, 15), amount: 1250.5 },
  { name: 'Grace Hopper', mail: 'grace@example.org', since: new Date(2023, 5, 1), amount: 980 },
  { name: 'Alan Turing', mail: 'alan(at)example.org', since: new Date(2022, 10, 30), amount: 310.25 },
  { name: '', mail: 'nobody@example.org', since: new Date(2021, 2, 3), amount: 15 },
  { name: 'Katherine Johnson', mail: 'katherine@example.org', since: new Date(2020, 7, 26), amount: -40 },
  { name: 'Edsger Dijkstra', mail: 'edsger@example.org', since: new Date(2019, 4, 11), amount: 2200 },
];

/** An .xlsx with a title row and header names that differ from the schema ("E-mail", "Since"). */
export async function sampleXlsx(): Promise<File> {
  const sheet = fromDataset(
    {
      columns: [
        { title: 'Full name', key: 'name' },
        { title: 'E-mail', key: 'mail' },
        { title: 'Since', key: 'since', type: 'date', numFmt: 'yyyy-mm-dd' },
        { title: 'Amount', key: 'amount', numFmt: '#,##0.00' },
      ],
      data: people,
    },
    { name: 'Contacts', origin: 'A3', freezeHeader: true, autoWidth: true },
  );
  sheet.rows[0] = ['Contacts export, November 2026'];
  const bytes = await toUint8Array({ sheets: [sheet] });
  return new File([bytes as BlobPart], 'contacts.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/** A European CSV: semicolons, decimal commas, day-first dates, and no e-mail column to map automatically. */
export function sampleCsv(): File {
  const pad = (n: number): string => String(n).padStart(2, '0');
  const rows: Array<Array<string | number>> = [['Name', 'Kontakt', 'Seit', 'Betrag']];
  for (const p of people) {
    const d = p.since;
    rows.push([p.name, p.mail, `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`, p.amount.toFixed(2).replace('.', ',')]);
  }
  // The guard would quote '-40,00' (text starting with '-'); this sample is our own data.
  const text = toCsv(rows, { delimiter: ';', escapeFormulas: false });
  return new File([text], 'kontakte.csv', { type: 'text/csv' });
}
