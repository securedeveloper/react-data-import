import { createWorkerClient } from 'javascript-excel/worker';
import { importFile } from 'react-data-import';

// One worker for the page. Files of workerThreshold bytes or more (default 1 MiB) are parsed in it.
const worker = createWorkerClient(new Worker(new URL('./excel.worker.ts', import.meta.url), { type: 'module' }));

export function readBig(file: File, signal: AbortSignal) {
  return importFile(file, {
    worker,
    maxFileBytes: 50 * 1024 * 1024,
    signal,
    onProgress: ({ phase, ratio }) => console.log(phase, Math.round(ratio * 100)),
  });
}
