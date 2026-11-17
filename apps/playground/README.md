# react-data-import playground (dev sandbox)

> **Dev sandbox, not deployed.** This app runs in CI (tests and build) and locally. It is not deployed anywhere. The public playground is a separate repository, [`securedeveloper/react-data-import-playground`](https://github.com/securedeveloper/react-data-import-playground), live at https://react-data-import-playground.vercel.app/. It installs the published package from npm.

A Vite + React 19 app that shows the library end to end:

1. **Choose or drop** an `.xlsx` or `.csv` (`<DataImport>`), or try a built-in sample: an `.xlsx` with a title row, or a European `.csv` with `;`, decimal commas and day-first dates.
2. **Preview:** format, delimiter, encoding, range, the detected header row, a sheet picker, the first rows with column types, and reader warnings.
3. **Map columns** to the app's fields (`useColumnMapping`): automatic by name and alias, changeable per field, with sample values.
4. **Validate and import** with a Zod schema (any Standard Schema works): typed rows, plus problems listed by spreadsheet row.

It imports the library from `packages/react-data-import/src`, so it always matches the branch. Files never leave the browser: there are no uploads, analytics, cookies or external requests. Files of 1 MiB or more are parsed in a Web Worker (`src/excel.worker.ts`). `vite.config.ts` gives `vite preview` a strict Content-Security-Policy (`'self'` only) and the other security headers, so the CSP gets tested locally.

## Commands (from the repo root)

```sh
npm ci
npm run dev -w playground       # http://localhost:5173
npm test -w playground          # the flow above in jsdom
npm run build -w playground     # -> apps/playground/dist
npm run preview -w playground   # serves dist with the security headers
```
