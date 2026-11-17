// The generated fixtures (README.md in this folder). test/fixtures.test.ts
// checks that the committed files match this code; to rewrite them:
//
//   UPDATE_FIXTURES=1 npx vitest run test/fixtures.test.ts
//
// CSVs are built byte by byte. The .xlsx files are written by javascript-excel,
// because LibreOffice is not part of the toolchain; real exports from Excel,
// LibreOffice, Numbers and Google Sheets are listed in README.md.
import { toUint8Array, type CellInput, type Sheet } from 'javascript-excel';

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);
const concat = (...parts: Array<Uint8Array | number[]>): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};
const utf16 = (s: string, order: 'le' | 'be'): Uint8Array => {
  const out = new Uint8Array(s.length * 2);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out[i * 2] = order === 'le' ? c & 0xff : c >> 8;
    out[i * 2 + 1] = order === 'le' ? c >> 8 : c & 0xff;
  }
  return out;
};

/** Non-ASCII text, so a wrong decoding shows. */
const PEOPLE = 'Name,City,Amount\nZoë,München,1.5\nJosé,São Paulo,2\nŁukasz,Kraków,3.25\n';

/** Windows-1252 bytes for the characters used below: é and ü are as in Latin-1; €, „ and “ exist only in Windows-1252. */
const CP1252: Record<string, number> = { é: 0xe9, ü: 0xfc, '€': 0x80, '„': 0x84, '“': 0x93 };
const cp1252 = (s: string): Uint8Array =>
  Uint8Array.from([...s], (ch) => {
    const c = ch.charCodeAt(0);
    if (c < 0x80) return c;
    const b = CP1252[ch];
    if (b === undefined) throw new Error(`no Windows-1252 byte for ${ch}`);
    return b;
  });

export const WIDE_COLUMNS = 500;
const wide = (): string => {
  const header = Array.from({ length: WIDE_COLUMNS }, (_, i) => `col${i + 1}`).join(',');
  const row = (r: number) => Array.from({ length: WIDE_COLUMNS }, (_, i) => String(r * WIDE_COLUMNS + i)).join(',');
  return `${header}\n${row(1)}\n${row(2)}\n${row(3)}\n`;
};

/** CSV fixtures: file name → bytes. */
export function csvFixtures(): Record<string, Uint8Array> {
  return {
    'utf8-bom.csv': concat([0xef, 0xbb, 0xbf], utf8(PEOPLE)),
    'utf16le-bom.csv': concat([0xff, 0xfe], utf16(PEOPLE, 'le')),
    'utf16be-bom.csv': concat([0xfe, 0xff], utf16(PEOPLE, 'be')),
    'windows-1252.csv': cp1252('Product,Price,Note\nCafé,€5,„quoted“\nMüsli,€3,plain\n'),
    'semicolon.csv': utf8('Name;Amount;Date\nAda;1.234,50;15.01.2024\nGrace;99,00;01.06.2023\n'),
    'tab.tsv': utf8('Name\tAmount\tActive\nAda\t1.5\ttrue\nGrace\t2\tfalse\n'),
    'pipe.csv': utf8('Name|Amount|Code\nAda|1.5|007\nGrace|2|012\n'),
    'quoted-newlines.csv': utf8('Name,Note,Amount\nAda,"line one\nline two",1\nGrace,"a ""quoted"" word, with a comma",2\n'),
    'crlf.csv': utf8('Name,Amount\r\nAda,1\r\nGrace,2\r\n'),
    'lf.csv': utf8('Name,Amount\nAda,1\nGrace,2\n'),
    'cr.csv': utf8('Name,Amount\rAda,1\rGrace,2\r'),
    'trailing-empty-columns.csv': utf8('Name,Amount,,,\nAda,1,,,\nGrace,2,,,\n'),
    'title-row.csv': utf8('Sales report 2024\nExported 2024-02-01\n\nRegion,Q1,Q2\nNorth,10,20\nSouth,30,40\n'),
    'two-header-rows.csv': utf8('Region,Sales,Sales\n,Q1,Q2\nNorth,10,20\nSouth,30,40\n'),
    'blank-rows-before-header.csv': utf8('\n\n\nName,Amount\nAda,1\nGrace,2\n'),
    'blank-delimited-rows-before-header.csv': utf8(',,\n,,\nName,Amount,City\nAda,1,Oslo\nGrace,2,Rome\n'),
    'wide-500-columns.csv': utf8(wide()),
  };
}

/** A long CSV, generated in the test rather than committed (about 3 MB at 100k rows). */
export function longCsv(rows: number): string {
  const parts = ['id,name,amount,date\n'];
  for (let i = 1; i <= rows; i++) parts.push(`${i},name ${i},${(i % 1000) / 4},2024-01-${String((i % 28) + 1).padStart(2, '0')}\n`);
  return parts.join('');
}

/** `n` one-cell title rows above a header and two data rows (the header-scan limit). */
export function titleRowsAbove(n: number): string {
  return `${Array.from({ length: n }, (_, i) => `Note ${i + 1}`).join('\n')}\nName,Amount\nAda,1\nGrace,2\n`;
}

const DATA: CellInput[][] = [
  ['North', 10, 20, 30],
  ['South', 30, 40, 50],
];
const sheet = (rows: Sheet['rows'], merges?: string[]): Sheet => ({ name: 'Sheet1', rows, ...(merges ? { merges } : {}) });

/** .xlsx fixtures, written by javascript-excel: file name → sheet. */
export function xlsxSheets(): Record<string, Sheet> {
  return {
    'title-row-merged.xlsx': sheet([['Sales report 2024'], [], ['Region', 'Jan', 'Feb', 'Mar'], ...DATA], ['A1:D1']),
    'title-rows-unmerged.xlsx': sheet([['Sales report 2024'], ['Exported 2024-02-01'], ['Region', 'Jan', 'Feb', 'Mar'], ...DATA]),
    // react-data-export's header groups: a group title merged over its columns.
    'header-groups.xlsx': sheet([['Region', 'Q1'], [undefined, 'Jan', 'Feb', 'Mar'], ...DATA], ['A1:A2', 'B1:D1']),
    'title-and-header-groups.xlsx': sheet([['Report'], ['Region', 'Q1'], [undefined, 'Jan', 'Feb', 'Mar'], ...DATA], ['A1:D1', 'A2:A3', 'B2:D2']),
    'blank-rows-before-header.xlsx': sheet([undefined, undefined, undefined, ['Region', 'Jan', 'Feb', 'Mar'], ...DATA]),
    'offset-table.xlsx': sheet([undefined, [undefined, undefined, 'Region', 'Jan'], [undefined, undefined, 'North', 1], [undefined, undefined, 'South', 2]]),
  };
}

export async function xlsxFixtures(): Promise<Record<string, Uint8Array>> {
  const out: Record<string, Uint8Array> = {};
  for (const [name, s] of Object.entries(xlsxSheets())) out[name] = await toUint8Array({ sheets: [s] });
  return out;
}
