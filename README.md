# react-data-import

> **Status: in development.** Version 0.0.1 on npm only reserves the name; the first prerelease will be announced here.

Import .xlsx and .csv files into React apps as { columns, data } datasets. Built on javascript-excel.

It will be part of a small family of spreadsheet libraries:

- [javascript-excel](https://github.com/securedeveloper/javascript-excel): the framework-agnostic TypeScript engine that reads and writes .xlsx and .csv
- [react-data-export](https://github.com/securedeveloper/react-data-export): export datasets and tables to .xlsx / .csv
- [react-data-import](https://github.com/securedeveloper/react-data-import): import .xlsx / .csv as datasets
- [react-xlsx-viewer](https://github.com/securedeveloper/react-xlsx-viewer): view workbooks in the browser

Watch the repository for the first real release.

## Status

- **1.0 is designed:** [docs/api.md](docs/api.md) (decided 2026-11-16) covers `importFile`, `useDataImport`, an unstyled `<DataImport>` drop zone and a headless `useColumnMapping`, built on javascript-excel's `javascript-excel/import`.
- **`importFile`, `previewFile` and `useDataImport` are on `main`** (RDI-2), not yet on npm, built on javascript-excel 2.0.0-alpha.3's `javascript-excel/import`. `<DataImport>` and `useColumnMapping` come next.

  ```tsx
  import { importFile, useDataImport } from 'react-data-import';

  const { columns, data, issues } = await importFile(file, {
    schema: { fields: { email: { aliases: ['E-mail'], required: true }, joined: { type: 'date' } } },
    validate: Contact, // a function or any Standard Schema (Zod, Valibot, ArkType)
    maxFileBytes: 10 * 1024 * 1024,
  });
  ```
- **0.0.1 on npm only reserves the name.**

## Repository layout

```
packages/react-data-import/   the published library (TypeScript, ESM + CJS + .d.ts, "use client")
apps/playground/              Vite + React 19 shell; becomes the demo (RDI-9)
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
