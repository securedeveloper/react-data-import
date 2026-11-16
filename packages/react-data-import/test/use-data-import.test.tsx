import { act, render, screen, waitFor } from '@testing-library/react';
import { StrictMode, useEffect } from 'react';
import { useDataImport, type ImportResult, type UseDataImport } from '../src/index';

function Probe({ api }: { api: { current: UseDataImport<Record<string, unknown>> | null } }) {
  const hook = useDataImport();
  api.current = hook;
  return <output data-testid="status">{hook.status}</output>;
}

const setup = () => {
  const api: { current: UseDataImport<Record<string, unknown>> | null } = { current: null };
  const utils = render(<Probe api={api} />);
  return { api, ...utils, status: () => screen.getByTestId('status').textContent };
};

describe('useDataImport', () => {
  it('idle -> reading -> done, with the result in state', async () => {
    const { api, status } = setup();
    expect(status()).toBe('idle');
    let result!: ImportResult;
    await act(async () => {
      result = await api.current!.importFile('a,b\n1,2');
    });
    expect(status()).toBe('done');
    expect(api.current!.result).toBe(result);
    expect(result.data).toHaveLength(1);
    expect(api.current!.progress).toBeNull();
  });

  it('error state with the error; a new import clears it', async () => {
    const { api, status } = setup();
    const bytes = new Uint8Array([1, 2, 3]);
    await act(async () => {
      await api.current!.importFile(bytes).catch(() => undefined);
    });
    expect(status()).toBe('error');
    expect(api.current!.error).toMatchObject({ code: 'UNSUPPORTED_FORMAT' });
    await act(async () => {
      await api.current!.importFile('a\n1');
    });
    expect(status()).toBe('done');
    expect(api.current!.error).toBeUndefined();
  });

  it("'mapping' when a required field has no column; applyMapping finishes without reading the file again", async () => {
    const { api, status } = setup();
    const file = new File(['Mail,Name\nada@x.org,Ada\n'], 'p.csv', { type: 'text/csv' });
    const read = vi.spyOn(file, 'arrayBuffer');
    const schema = { fields: { email: { required: true }, name: {} } };
    await act(async () => {
      await api.current!.importFile(file, { schema });
    });
    expect(status()).toBe('mapping');
    expect(api.current!.result!.issues.map((i) => i.code)).toEqual(['MAPPING_MISSING']);
    expect(api.current!.result!.meta.unmappedColumns).toEqual(['Mail']);
    await act(async () => {
      await api.current!.applyMapping({ email: 'Mail' });
    });
    expect(status()).toBe('done');
    expect(api.current!.result!.data).toEqual([Object.assign(Object.create(null), { email: 'ada@x.org', name: 'Ada' })]);
    expect(api.current!.result!.meta.fileName).toBe('p.csv');
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('applyMapping before any import rejects with a TypeError', async () => {
    const { api } = setup();
    await expect(api.current!.applyMapping({})).rejects.toThrow(TypeError);
  });

  it('a new import aborts the one in flight; abort() returns to idle', async () => {
    const { api, status } = setup();
    let first!: Promise<unknown>;
    let second!: Promise<ImportResult>;
    await act(async () => {
      first = api.current!.importFile('a\n1', { validate: () => new Promise<undefined>((r) => setTimeout(() => r(undefined), 50)) }).catch((e) => e);
      second = api.current!.importFile('b\n2');
      await second;
    });
    expect(await first).toMatchObject({ name: 'AbortError' });
    expect((await second).columns[0]!.key).toBe('b');
    expect(status()).toBe('done');
    let third!: Promise<unknown>;
    await act(async () => {
      third = api.current!.importFile('c\n3', { validate: () => new Promise<undefined>((r) => setTimeout(() => r(undefined), 50)) }).catch((e) => e);
      api.current!.abort();
      await third;
    });
    expect(await third).toMatchObject({ name: 'AbortError' });
    expect(status()).toBe('idle');
  });

  it('reset forgets the result', async () => {
    const { api, status } = setup();
    await act(async () => {
      await api.current!.importFile('a\n1');
    });
    act(() => api.current!.reset());
    expect(status()).toBe('idle');
    expect(api.current!.result).toBeNull();
    await expect(api.current!.applyMapping({})).rejects.toThrow(TypeError);
  });

  it('unmount aborts the import, with no state update afterwards', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { api, unmount } = setup();
    let pending!: Promise<unknown>;
    act(() => {
      pending = api.current!.importFile('a\n1', { validate: () => new Promise<undefined>((r) => setTimeout(() => r(undefined), 50)) }).catch((e) => e);
    });
    unmount();
    expect(await pending).toMatchObject({ name: 'AbortError' });
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('StrictMode: an import started on mount survives the development remount', async () => {
    const results: number[] = [];
    function Auto() {
      const { importFile, status } = useDataImport();
      useEffect(() => {
        importFile('a\n1\n2').then(
          (r) => results.push(r.data.length),
          () => undefined, // StrictMode's simulated unmount aborts the first run
        );
      }, [importFile]);
      return <output data-testid="auto">{status}</output>;
    }
    render(
      <StrictMode>
        <Auto />
      </StrictMode>,
    );
    await waitFor(() => expect(screen.getByTestId('auto').textContent).toBe('done'));
    expect(results).toEqual([2]);
  });

  it('functions keep their identity across renders; defaults merge under call options', async () => {
    const seen: Array<UseDataImport<Record<string, unknown>>> = [];
    function Twice({ n }: { n: number }) {
      seen.push(useDataImport({ format: 'csv', delimiter: n === 1 ? ';' : ',' }));
      return null;
    }
    const { rerender } = render(<Twice n={1} />);
    rerender(<Twice n={2} />);
    expect(seen[0]!.importFile).toBe(seen[1]!.importFile);
    expect(seen[0]!.applyMapping).toBe(seen[1]!.applyMapping);
    expect(seen[0]!.abort).toBe(seen[1]!.abort);
    let r!: ImportResult;
    await act(async () => {
      r = await seen[seen.length - 1]!.importFile('a,b\n1,2', { delimiter: ';' });
    });
    expect(r.meta.delimiter).toBe(';');
  });
});
