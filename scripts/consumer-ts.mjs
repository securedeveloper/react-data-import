// Consumer TypeScript matrix: type-checks a small consumer project against the
// packed tarball (what npm users install) for each TypeScript version,
// @types/react major and moduleResolution mode.
//
//   node scripts/consumer-ts.mjs --ts 5.0,5.9,7.0 --react 17,18,19 --resolution node16,nodenext,bundler
//
// Every option also reads an env var (CONSUMER_TS, CONSUMER_REACT, CONSUMER_RESOLUTION).
// Without --tarball it packs packages/react-data-import, so run
// `npm run build -w react-data-import` first. Exits 1 if any cell fails.
//
// Each cell runs `tsc --noEmit` with strict and skipLibCheck: false over:
//   - a .tsx component using useDataImport, importFile with a Standard Schema (typed rows) and previewFile (react-jsx)
//   - a CommonJS .cts consumer (node16/nodenext only; bundler has no CJS mode)
//   - @ts-expect-error probes that fail if the package's types resolve to `any`
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    ts: { type: 'string', default: process.env.CONSUMER_TS ?? '5.0,5.1,5.2,5.3,5.4,5.5,5.6,5.7,5.8,5.9,6.0,7.0' },
    react: { type: 'string', default: process.env.CONSUMER_REACT ?? '17,18,19' },
    resolution: { type: 'string', default: process.env.CONSUMER_RESOLUTION ?? 'node16,nodenext,bundler' },
    tarball: { type: 'string', default: process.env.CONSUMER_TARBALL },
    keep: { type: 'boolean', default: false },
  },
});
const list = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);
const tsVersions = list(values.ts);
const reactMajors = list(values.react);
const resolutions = list(values.resolution);

const root = resolve(import.meta.dirname, '..');
const pkgDir = join(root, 'packages/react-data-import');
const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const work = mkdtempSync(join(tmpdir(), 'rdi-consumer-ts-'));
let tarball;
if (values.tarball) {
  tarball = resolve(values.tarball);
  if (!existsSync(tarball)) {
    console.error(`tarball not found: ${tarball}`);
    process.exit(1);
  }
  console.log(`using ${tarball}`);
} else {
  const [packed] = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', work], pkgDir));
  tarball = join(work, packed.filename);
  console.log(`packed ${packed.filename}`);
}

const tsx = `import { useEffect, type ReactElement } from 'react';
import { DataImport, importFile, isExcelError, previewFile, useColumnMapping, useDataImport, version } from 'react-data-import';
import type { ColumnMapping, DataImportRenderApi, ImportOptions, ImportResult, ImportSchema, StandardSchemaLike } from 'react-data-import';

const schema: ImportSchema = {
  fields: { email: { aliases: ['E-mail'], required: true, validate: (v) => (typeof v === 'string' ? undefined : 'text please') }, age: { type: 'number' } },
};

export function Importer({ file }: { file: File }): ReactElement {
  const { importFile: run, status, result, applyMapping } = useDataImport({ schema });
  useEffect(() => {
    run(file).catch(() => undefined);
  }, [file, run]);
  const fix: ColumnMapping = { email: 'Mail' };
  return <output title={version} onClick={() => void applyMapping(fix)}>{status}{result?.data.length}</output>;
}

// A Standard Schema as Zod/Valibot/ArkType declare it (structural; the real libraries have their own TS floors).
export function DropZone({ onRows }: { onRows: (n: number) => void }): ReactElement {
  return (
    <DataImport schema={schema} maxFileBytes={1_000_000} onImported={(r) => onRows(r.data.length)} onError={(e) => console.log(e)}>
      {({ getRootProps, getInputProps, isDragging, status, open }: DataImportRenderApi<Record<string, unknown>>) => (
        <div {...getRootProps({ className: isDragging ? 'over' : '' })}>
          <label>
            File <input {...getInputProps({ 'aria-describedby': 'hint' })} />
          </label>
          <button type="button" onClick={open}>Browse</button>
          <p role="status">{status}</p>
        </div>
      )}
    </DataImport>
  );
}

export function Mapper({ preview }: { preview: ImportResult | null }): ReactElement {
  const m = useColumnMapping(preview, schema);
  return (
    <ul>
      {m.fields.map((f) => (
        <li key={f.name}>
          <select value={f.column ?? ''} onChange={(e) => m.set(f.name, e.target.value || null)}>
            {m.columns.map((c) => <option key={c.key} value={c.key}>{c.title} {String(c.sample[0])}</option>)}
          </select>
        </li>
      ))}
      <li>{m.missingRequired.join(', ')}</li>
    </ul>
  );
}

export const simple: ReactElement = <DataImport inputLabel="Upload">Choose a file</DataImport>;

const Person: StandardSchemaLike<{ email: string; age: number }> = {
  '~standard': { version: 1, vendor: 'fixture', validate: (v) => ({ value: v as { email: string; age: number } }) },
};
export const typed: Promise<number[]> = importFile(new Blob(['x']), { schema, validate: Person }).then((r) => r.data.map((p) => p.age));
export const fn: Promise<ImportResult<{ a: string }>> = importFile<{ a: string }>('a', { validate: (row, { rowNumber }) => (row.a ? undefined : \`row \${rowNumber}\`) });
export const preview = previewFile(new Uint8Array(), { rows: 5, locale: { decimal: ',', group: '.' } });
export const options: ImportOptions = { maxFileBytes: 1_000_000, header: { rows: 2, join: ' / ' }, types: { amount: 'number' } };
export const known: boolean = isExcelError(new Error('x'));
export const std: StandardSchemaLike<{ n: number }> = { '~standard': { version: 1, vendor: 'x', validate: () => ({ value: { n: 1 } }) } };

// These must be errors; if the package's types were missing or \`any\`, tsc reports unused directives.
// @ts-expect-error version is a string
export const notNumber: number = version;
// @ts-expect-error rows from the schema have no 'missing'
export const wrong: Promise<unknown> = importFile('a', { validate: Person }).then((r) => r.data[0]!.missing);
// @ts-expect-error unknown format
importFile('a', { format: 'xls' });
// @ts-expect-error not a validation mode
importFile('a', { validation: 'all' });
// @ts-expect-error onImported gets an ImportResult
export const badHandler: ReactElement = <DataImport onImported={(r: string) => r} />;
`;
const cts = `import { importFile, version } from 'react-data-import';
import type { ImportResult } from 'react-data-import';
export const v: string = version;
export const p: Promise<ImportResult> = importFile('a\\n1');
// @ts-expect-error version is a string
export const n: number = version;
`;

function compilerOptions(resolution) {
  const base = {
    strict: true,
    noEmit: true,
    skipLibCheck: false,
    target: 'es2022',
    lib: ['es2022', 'dom'],
    jsx: 'react-jsx',
    types: [],
  };
  if (resolution === 'bundler') return { ...base, module: 'esnext', moduleResolution: 'bundler' };
  return { ...base, module: resolution, moduleResolution: resolution };
}

const results = [];
for (const ts of tsVersions) {
  for (const react of reactMajors) {
    const dir = join(work, `ts${ts}-react${react}`);
    mkdirSync(dir, { recursive: true });
    // "type": "module" makes .tsx an ES module under node16/nodenext; .cts stays CommonJS.
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'consumer', private: true, type: 'module' }));
    let installError = null;
    try {
      run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error',
        `typescript@~${ts}`, `@types/react@${react}`, `react@${react}`, tarball], dir);
    } catch (e) {
      installError = (e.stderr || e.message).trim().split('\n').slice(-3).join(' ');
    }
    const tsPkgPath = join(dir, 'node_modules/typescript/package.json');
    const tsPkg = installError ? null : JSON.parse(readFileSync(tsPkgPath, 'utf8'));
    const typesReact = installError ? null : JSON.parse(readFileSync(join(dir, 'node_modules/@types/react/package.json'), 'utf8')).version;
    // TypeScript 7 does not export ./bin/tsc, so locate the bin through package.json.
    const tsc = tsPkg && join(dirname(tsPkgPath), tsPkg.bin.tsc);

    for (const resolution of resolutions) {
      const cell = { ts, tsResolved: tsPkg?.version, react, typesReact, resolution };
      if (installError) {
        results.push({ ...cell, ok: false, detail: `install failed: ${installError}` });
        continue;
      }
      const cellDir = join(dir, resolution);
      mkdirSync(cellDir, { recursive: true });
      const files = ['app.tsx'];
      writeFileSync(join(cellDir, 'app.tsx'), tsx);
      if (resolution !== 'bundler') {
        writeFileSync(join(cellDir, 'legacy.cts'), cts);
        files.push('legacy.cts');
      }
      writeFileSync(join(cellDir, 'tsconfig.json'), JSON.stringify({ compilerOptions: compilerOptions(resolution), files }, null, 2));
      try {
        run('node', [tsc, '-p', join(cellDir, 'tsconfig.json')], cellDir);
        results.push({ ...cell, ok: true, detail: '' });
      } catch (e) {
        const out = `${e.stdout ?? ''}${e.stderr ?? ''}`.trim();
        results.push({ ...cell, ok: false, detail: out.split('\n').slice(0, 6).join('\n') });
      }
    }
  }
}

const table = [
  '| TypeScript | @types/react | moduleResolution | result |',
  '|---|---|---|---|',
  ...results.map((r) => `| ${r.tsResolved ?? r.ts} | ${r.typesReact ?? r.react} | ${r.resolution} | ${r.ok ? 'pass' : 'FAIL'} |`),
].join('\n');
console.log(`\n${table}`);
// In GitHub Actions, also show the table on the run's summary page.
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${table}\n`);
const failed = results.filter((r) => !r.ok);
for (const r of failed) {
  console.log(`\n--- FAIL: TS ${r.tsResolved ?? r.ts}, @types/react ${r.typesReact ?? r.react}, ${r.resolution}\n${r.detail}`);
}

if (values.keep) console.log(`\nkept ${work}`);
else rmSync(work, { recursive: true, force: true });
process.exit(failed.length ? 1 : 0);
