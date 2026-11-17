# Import fixtures

The files here are **generated**, so each one shows a single oddity on purpose. `generate.ts` builds them, and `../fixtures.test.ts` checks two things: that the committed files still match the generator (CSV byte for byte, xlsx by imported content, since the writer stamps a time), and what `importFile` makes of each one. To rewrite them after changing `generate.ts`:

```sh
UPDATE_FIXTURES=1 npx vitest run test/fixtures.test.ts   # in packages/react-data-import
```

`.gitattributes` turns off line-ending conversion here, so `crlf.csv` and `cr.csv` keep their bytes on every checkout.

## Generated

| file | what it checks |
|---|---|
| `csv/utf8-bom.csv`, `csv/utf16le-bom.csv`, `csv/utf16be-bom.csv` | the BOM decides the encoding, also over `encoding`; no BOM left in the first title |
| `csv/windows-1252.csv` | `encoding: 'windows-1252'` (€, „ “); without it, a `CSV_INVALID_ENCODING` warning |
| `csv/semicolon.csv`, `csv/tab.tsv`, `csv/pipe.csv` | delimiter detection; a European locale; booleans; `007` stays text |
| `csv/quoted-newlines.csv` | newlines, quotes and commas inside quoted values; row numbers count records, not lines |
| `csv/crlf.csv`, `csv/lf.csv`, `csv/cr.csv` | the same rows for each line ending |
| `csv/trailing-empty-columns.csv` | `a,b,,,`: empty columns keyed by letter, type `empty` |
| `csv/title-row.csv` | title rows and a blank row above the header |
| `csv/two-header-rows.csv` | a two-row header without merges: detected (`[0, 1]`, high) and flattened to `Sales / Q1` (javascript-excel 2.0.0-beta.1) |
| `csv/header-groups.csv` | react-data-export's header groups written to CSV: a group title over empty cells carries right (`Q1 / Jan`, `Q1 / Feb`, `Q1 / Mar`) |
| `csv/blank-rows-before-header.csv`, `csv/blank-delimited-rows-before-header.csv` | empty lines, and lines of only delimiters, above the header |
| `csv/wide-500-columns.csv` | 500 columns (up to `SF`) |
| *(in the test)* `longCsv(100_000)` | 100,000 rows: types, preview, `maxRows`. About 3 MB, so it is generated in the test and not committed |
| *(in the test)* `titleRowsAbove(n)` | the header-scan limit, below |
| `xlsx/title-row-merged.xlsx`, `xlsx/title-rows-unmerged.xlsx` | title rows above the header, merged across the table or not |
| `xlsx/header-groups.xlsx`, `xlsx/title-and-header-groups.xlsx` | react-data-export's header groups: a merged group title over its columns, flattened to `Q1 / Jan` |
| `xlsx/blank-rows-before-header.xlsx`, `xlsx/offset-table.xlsx` | a table that starts below row 1, or in column C |

The xlsx files are written by javascript-excel. LibreOffice wasn't available to export them, so they show layouts, not another writer's XML.

## The header-scan limit

`header: 'auto'` looks for the header in the **first 25 rows of the used range** (javascript-excel's `detectHeader`, `maxScan` 25):

- Blank rows above the table don't count: they are outside the used range (40 blank lines are fine).
- Title rows do count. After 23 title rows the header is found with high confidence. After 24 (the header in the 25th row) it is still found, but with `confidence: 'low'`, because no data row is left inside the scan. After 25 or more, detection falls back to row 0 with `confidence: 'low'`.
- Further down, pass the row: `header: 25`.

Real exports put at most a few rows (a title, a date, a blank row) above the header, so 25 leaves a wide margin. The generated fixtures give no reason to change it. The real exports below should confirm it.

## Still needed: real exports

Generated files can't show what other writers actually produce. These need to be saved from the real apps (Afzal's files). Add them under `real/<app>/` and add their expectations to `fixtures.test.ts`. Use the same small table in each one, where possible: a title row, a header, and text, number, date, boolean and empty cells.

**Microsoft Excel** (365, Windows and Mac)
1. `plain.xlsx`: the header in row 1; text, numbers, dates, a boolean, an empty cell
2. `title-merged.xlsx`: a merged title row and a blank row above the header
3. `header-groups.xlsx`: a two-row header with merged group cells
4. `offset-formatted.xlsx`: a table starting at C3, with formatting (borders or fill) on empty cells around it, so the stored dimension is larger than the data
5. `table-totals.xlsx`: a formatted Table (Insert > Table) with its Total Row turned on
6. `errors-formulas.xlsx`: formulas, and error cells (`#N/A`, `#DIV/0!`, `#REF!`)
7. `hidden-first-sheet.xlsx`: the first sheet hidden, data on the second
8. `date1904.xlsx`: a Mac workbook with the 1904 date system turned on
9. `macro.xlsm`: any small macro workbook
10. `protected.xlsx`: password-protected (encrypted). It should be rejected with `UNSUPPORTED_FORMAT`
11. `legacy.xls`: Excel 97-2003. It should be rejected with `UNSUPPORTED_FORMAT`
12. CSV saves of `plain`: "CSV UTF-8" (has a BOM), "CSV (Comma delimited)" (Windows-1252 on Windows), "CSV (Macintosh)", and "Unicode Text" (`.txt`, UTF-16LE, tab-separated)
13. A CSV saved with a German or French regional setting (semicolons, `1.234,56`, `15.01.2024`)

**LibreOffice Calc**
14. `title-merged.xlsx` and `header-groups.xlsx`, as 2 and 3 above
15. CSV with the default options (UTF-8, comma), and one with semicolon and Windows-1252

**Apple Numbers**
16. `plain.xlsx` (File > Export To > Excel), with the table title on
17. `two-tables.xlsx`: two tables on one sheet
18. `plain.csv` (File > Export To > CSV)

**Google Sheets**
19. `plain.xlsx`, `plain.csv` and `plain.tsv` (File > Download)
20. `title-merged.xlsx`: a merged title and a frozen header row
