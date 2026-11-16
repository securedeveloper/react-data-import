import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type UserConfig } from 'vite';

// Resolve the library from source so the playground always matches the branch
// it is built from, without a separate package build step. The packed tarball
// (what npm users get) is covered by the smoke test.
const config: UserConfig = defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'react-data-import': fileURLToPath(new URL('../../packages/react-data-import/src/index.ts', import.meta.url)),
    },
  },
});

export default config;
