# react-data-import

> **Status: 1.0 prerelease.** `1.0.0-alpha.2` is on npm under the `next` tag (`npm install react-data-import@next`). The API can still change before 1.0.0. The `latest` tag still points to `0.0.1`, which only reserved the name.

Import .xlsx and .csv files into React apps as { columns, data } datasets. Built on javascript-excel.

It is part of a small family of spreadsheet libraries:

- [javascript-excel](https://github.com/securedeveloper/javascript-excel): the framework-agnostic TypeScript engine that reads and writes .xlsx and .csv
- [react-data-export](https://github.com/securedeveloper/react-data-export): export datasets and tables to .xlsx / .csv
- [react-data-import](https://github.com/securedeveloper/react-data-import): import .xlsx / .csv as datasets
- [react-xlsx-viewer](https://github.com/securedeveloper/react-xlsx-viewer): view workbooks in the browser

Watch the repository for 1.0.0.

## Status

- **1.0 is designed:** [docs/api.md](docs/api.md) (decided 2026-11-16) covers `importFile`, `useDataImport`, an unstyled `<DataImport>` drop zone and a headless `useColumnMapping`, built on javascript-excel's `javascript-excel/import`.
- **`importFile`, `previewFile`, `useDataImport`, an unstyled `<DataImport>` drop zone and a headless `useColumnMapping` ship in the 1.0 prereleases** (`npm install react-data-import@next`), built on javascript-excel 2.0.0-alpha.4's `javascript-excel/import`. React 17, 18 and 19.

  ```tsx
  import { importFile, useDataImport } from 'react-data-import';

  const { columns, data, issues } = await importFile(file, {
    schema: { fields: { email: { aliases: ['E-mail'], required: true }, joined: { type: 'date' } } },
    validate: Contact, // a function or any Standard Schema (Zod, Valibot, ArkType)
    maxFileBytes: 10 * 1024 * 1024,
  });
  ```

  ```tsx
  <DataImport schema={contacts} onImported={(r) => setRows(r.data)}>
    {({ getRootProps, getInputProps, isDragging, status }) => (
      <div {...getRootProps({ className: isDragging ? 'drop over' : 'drop' })}>
        <label>Choose a file <input {...getInputProps()} /></label>
        <p>or drop an .xlsx or .csv here</p>
        <p role="status">{status === 'reading' ? 'Reading…' : null}</p>
      </div>
    )}
  </DataImport>
  ```
- **Playground:** [`apps/playground`](apps/playground) runs the whole flow in the browser: drop a file, preview it, map columns, validate with Zod. It isn't deployed yet; run it with `npm run dev -w playground`.
- **npm tags:** `next` is `1.0.0-alpha.2`. `latest` stays on the `0.0.1` name placeholder until 1.0.0, so a plain `npm install react-data-import` doesn't give you a prerelease.

## Repository layout

```
packages/react-data-import/   the published library (TypeScript, ESM + CJS + .d.ts, "use client")
apps/playground/              Vite + React 19 demo: drop, preview, map, validate (deployed to Vercel later)
scripts/                      tarball smoke test, consumer TypeScript matrix, release helpers
docs/api.md                   the 1.0 API design
```

## Development

Development needs Node `^22.22.2 || ^24.15.0 || >=26` (the strictest dev-tool floor, from jsdom). The published package declares Node >= 22 and has no Node-specific code.

```sh
npm ci
npm run typecheck
npm test                     # Vitest + React Testing Library (jsdom)
npm run build                # library (tsdown) + playground (Vite)
npm run lint:pkg             # publint + are-the-types-wrong
npm run smoke                # packs the library; checks "use client", ESM import, CJS require, types
npm run consumer-ts -- --ts 5.0,7.0 --react 17,18,19   # consumer TypeScript matrix
npm run test:release         # release script unit tests
```

CI runs Node 22, 24 and 26 against React 17, 18 and 19. To try another React major locally: `node scripts/use-react.mjs 17` (or `18`) (it rewrites dev ranges and node_modules; restore with `git checkout -- package-lock.json '*/*/package.json' && npm ci`).

## Releasing

Versions are managed with [Changesets](https://github.com/changesets/changesets). Merging a pull request that bumps the version publishes it to npm. See [RELEASING.md](RELEASING.md).

## License

MIT © Afzal Ahmad
