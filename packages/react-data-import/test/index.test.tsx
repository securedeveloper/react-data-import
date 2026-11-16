import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import { StrictMode, version as reactVersion } from 'react';
import { version as reactDomVersion } from 'react-dom';
import pkg from '../package.json';
import { useDataImport, version } from '../src/index';

function Probe() {
  const { status } = useDataImport();
  return <output data-testid="status">{`${version} ${status}`}</output>;
}

describe('react-data-import entry', () => {
  it('exports the package version', () => {
    expect(version).toBe(pkg.version);
  });

  it('useDataImport renders inside a React tree, StrictMode included', () => {
    render(
      <StrictMode>
        <Probe />
      </StrictMode>,
    );
    expect(screen.getByTestId('status').textContent).toBe(`${pkg.version} idle`);
  });

  it('the entry starts with the "use client" directive', () => {
    // jsdom replaces the global URL, so build a path rather than a file: URL.
    const entry = join(dirname(fileURLToPath(import.meta.url)), '../src/index.ts');
    const first = readFileSync(entry, 'utf8').split('\n', 1)[0];
    expect(first).toBe("'use client';");
  });

  // Guards the CI matrix: fails if the job did not really install the React major it claims.
  it.runIf(process.env['REACT_MAJOR'])('runs against the expected React major', () => {
    expect(reactVersion.split('.')[0]).toBe(process.env['REACT_MAJOR']);
    expect(reactDomVersion).toBe(reactVersion);
  });
});
