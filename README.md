# react-data-import

> **Status: 1.0 beta.** `1.0.0-beta.0` is on npm under the `next` tag (`npm install react-data-import@next`). It is feature-complete for 1.0, and only fixes come before 1.0.0. The `latest` tag still points to `0.0.1`, which only reserved the name.

Import .xlsx and .csv files into React apps as { columns, data } datasets. Built on javascript-excel.

It is part of a small family of spreadsheet libraries:

- [javascript-excel](https://github.com/securedeveloper/javascript-excel): the framework-agnostic TypeScript engine that reads and writes .xlsx and .csv
- [react-data-export](https://github.com/securedeveloper/react-data-export): export datasets and tables to .xlsx / .csv
- [react-data-import](https://github.com/securedeveloper/react-data-import): import .xlsx / .csv as datasets
- [react-xlsx-viewer](https://github.com/securedeveloper/react-xlsx-viewer): view workbooks in the browser

Watch the repository for 1.0.0.

## Status

- **1.0 is designed:** [docs/api.md](docs/api.md) (decided 2026-11-16) covers `importFile`, `useDataImport`, an unstyled `<DataImport>` drop zone and a headless `useColumnMapping`, built on javascript-excel's `javascript-excel/import`.
- **`importFile`, `previewFile`, `useDataImport`, an unstyled `<DataImport>` drop zone and a headless `useColumnMapping` ship in the 1.0 beta** (`npm install react-data-import@next`), built on javascript-excel's `javascript-excel/import`. React 17, 18 and 19.
- **The usage guide** is the [package README](packages/react-data-import/README.md): the quick start, `importFile` and its options, the hooks, the issue model and its codes, validation recipes for Zod, Valibot, ArkType and plain functions, and workers. Its code lives in [`examples/`](examples), which CI type-checks and runs.
- **Playground:** try the whole flow (drop a file, preview it, map columns, validate with Zod) at https://react-data-import-playground.vercel.app/ ([`securedeveloper/react-data-import-playground`](https://github.com/securedeveloper/react-data-import-playground), which uses the published package). [`apps/playground`](apps/playground) is the in-repo dev sandbox of the same flow, tested in CI and not deployed; run it with `npm run dev -w playground`.
- **npm tags:** `next` is `1.0.0-beta.0`. `latest` stays on the `0.0.1` name placeholder until 1.0.0, so a plain `npm install react-data-import` doesn't give you a prerelease.

## A quick look

<!-- example: examples/import-file.ts -->
```ts
import { importFile, type ImportSchema } from 'react-data-import';

const contacts: ImportSchema = {
  fields: {
    email: { aliases: ['E-mail', 'Email address'], required: true },
    name: { aliases: ['Full name'] },
    joined: { aliases: ['Start date'], type: 'date' },
  },
};

export async function readContacts(file: File) {
  const { columns, data, rowNumbers, issues, meta } = await importFile(file, {
    schema: contacts,
    maxFileBytes: 10 * 1024 * 1024,
  });
  // columns: email, name, joined (schema order); data: [{ email, name, joined }, …]
  // rowNumbers[i]: the spreadsheet row of data[i]; issues: what was left out and why
  console.log(meta.format, meta.header.rows, meta.mapping);
  return { columns, data, rowNumbers, issues };
}
```

More in the [usage guide](packages/react-data-import/README.md), and live in the [playground](https://react-data-import-playground.vercel.app/).

## Repository layout

```
packages/react-data-import/   the published library (TypeScript, ESM + CJS + .d.ts, "use client")
apps/playground/              Vite + React 19 dev sandbox, tested in CI (the public playground is
                              securedeveloper/react-data-import-playground)
scripts/                      tarball smoke test, consumer TypeScript matrix, release helpers
docs/api.md                   the 1.0 API design
examples/                     the code in the READMEs: type-checked and run in CI
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
npm run docs:check           # README code matches examples/, and examples/ type-checks
```

CI runs Node 22, 24 and 26 against React 17, 18 and 19. To try another React major locally: `node scripts/use-react.mjs 17` (or `18`) (it rewrites dev ranges and node_modules; restore with `git checkout -- package-lock.json '*/*/package.json' && npm ci`).

## Releasing

Versions are managed with [Changesets](https://github.com/changesets/changesets). Merging a pull request that bumps the version publishes it to npm. See [RELEASING.md](RELEASING.md).

## License

MIT © Afzal Ahmad
