# react-data-import playground

A Vite + React 19 app that shows the library end to end:

1. **Choose or drop** an `.xlsx` or `.csv` (`<DataImport>`), or try a built-in sample: an `.xlsx` with a title row, or a European `.csv` with `;`, decimal commas and day-first dates.
2. **Preview:** format, delimiter, encoding, range, the detected header row, a sheet picker, the first rows with column types, and reader warnings.
3. **Map columns** to the app's fields (`useColumnMapping`): automatic by name and alias, changeable per field, with sample values.
4. **Validate and import** with a Zod schema (any Standard Schema works): typed rows, plus problems listed by spreadsheet row.

It imports the library from `packages/react-data-import/src`, so it always matches the branch. Files never leave the browser: there are no uploads, analytics, cookies or external requests. Files of 1 MiB or more are parsed in a Web Worker (`src/excel.worker.ts`). `vercel.json` sets a strict Content-Security-Policy (`'self'` only), and `vite preview` serves the same headers, so the CSP is tested locally.

## Commands (from the repo root)

```sh
npm ci
npm run dev -w playground       # http://localhost:5173
npm test -w playground          # the flow above in jsdom
npm run build -w playground     # -> apps/playground/dist
npm run preview -w playground   # serves dist with the production headers
```

## Deploying on Vercel

| Setting | Value |
|---|---|
| Root Directory | `apps/playground` |
| Framework preset | Vite (also in `vercel.json`) |
| Install command | `cd ../.. && npm ci` (from `vercel.json`: installs the whole workspace) |
| Build command | `npm run build` (from `vercel.json`) |
| Output directory | `dist` (from `vercel.json`) |
| Node.js version | 24.x |

Keep "Include files outside the root directory in the Build Step" enabled (Vercel's default): the app builds the library from `../../packages/react-data-import/src`.
