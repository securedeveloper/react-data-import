import type { ReactElement } from 'react';
import { useVersion } from 'react-data-import';

// An empty shell until RDI-9: drop a file, see { columns, data }, map columns.
// Exported components need an explicit return type under isolatedDeclarations.
export function App(): ReactElement {
  const version = useVersion();
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 640, margin: '4rem auto', padding: '0 1rem' }}>
      <h1>react-data-import playground (in progress)</h1>
      <p>
        Workspace package version: <code>{version}</code>
      </p>
    </main>
  );
}
