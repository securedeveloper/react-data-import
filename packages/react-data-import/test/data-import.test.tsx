import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { DataImport, DEFAULT_ACCEPT, type ImportResult } from '../src/index';

const csv = (name = 'people.csv', text = 'Name,Age\nAda,36\n') => new File([text], name, { type: 'text/csv' });
const dropEvent = (files: File[]) => ({ dataTransfer: { files, items: files.map((f) => ({ kind: 'file', getAsFile: () => f })), types: ['Files'] } });

describe('<DataImport>', () => {
  it('without children: one labelled file input that imports the chosen file', async () => {
    const onImported = vi.fn();
    render(<DataImport onImported={onImported} />);
    const input = screen.getByLabelText('Import a spreadsheet') as HTMLInputElement;
    expect(input.type).toBe('file');
    expect(input.accept).toBe(DEFAULT_ACCEPT);
    fireEvent.change(input, { target: { files: [csv()] } });
    await waitFor(() => expect(onImported).toHaveBeenCalledTimes(1));
    const r = onImported.mock.calls[0]![0] as ImportResult;
    expect(r.data).toEqual([Object.assign(Object.create(null), { Name: 'Ada', Age: 36 })]);
    expect(r.meta.fileName).toBe('people.csv');
    expect(input.value).toBe('');
  });

  it('inputLabel and plain children name the input', () => {
    const { unmount } = render(<DataImport inputLabel="Upload contacts" />);
    expect(screen.getByLabelText('Upload contacts')).toBeTruthy();
    unmount();
    render(<DataImport>Choose a spreadsheet</DataImport>);
    expect((screen.getByLabelText('Choose a spreadsheet') as HTMLInputElement).type).toBe('file');
  });

  it('render prop: drop zone with prop getters, data-dragging, first dropped file imported', async () => {
    const onImported = vi.fn();
    render(
      <DataImport onImported={onImported} schema={{ fields: { name: {}, age: {} } }}>
        {({ getRootProps, getInputProps, isDragging, status }) => (
          <div data-testid="zone" {...getRootProps({ className: isDragging ? 'drop over' : 'drop' })}>
            <label>
              Choose a file <input {...getInputProps()} />
            </label>
            <p role="status">{status}</p>
          </div>
        )}
      </DataImport>,
    );
    const zone = screen.getByTestId('zone');
    expect(zone.getAttribute('role')).toBeNull();
    expect(zone.getAttribute('tabindex')).toBeNull();
    fireEvent.dragEnter(zone, dropEvent([csv()]));
    expect(zone.hasAttribute('data-dragging')).toBe(true);
    expect(zone.className).toBe('drop over');
    fireEvent.dragLeave(zone);
    expect(zone.hasAttribute('data-dragging')).toBe(false);
    fireEvent.dragEnter(zone, dropEvent([csv()]));
    fireEvent.drop(zone, dropEvent([csv('a.csv'), csv('b.csv'), csv('c.csv')]));
    expect(zone.hasAttribute('data-dragging')).toBe(false);
    await waitFor(() => expect(onImported).toHaveBeenCalledTimes(1));
    const r = onImported.mock.calls[0]![0] as ImportResult;
    expect(r.meta.fileName).toBe('a.csv');
    expect(r.data).toEqual([Object.assign(Object.create(null), { name: 'Ada', age: 36 })]);
    expect(r.issues).toEqual([{ row: 0, code: 'FILES_IGNORED', message: '2 more files were dropped; only a.csv was imported.', severity: 'warning' }]);
    expect(screen.getByRole('status').textContent).toBe('done');
    expect((screen.getByLabelText('Choose a file') as HTMLInputElement).id).not.toBe('');
  });

  it('drops of directories are ignored; user handlers still run', async () => {
    const onImported = vi.fn();
    const onDrop = vi.fn();
    render(<DataImport onImported={onImported}>{({ getRootProps }) => <div data-testid="z" {...getRootProps({ onDrop })} />}</DataImport>);
    const dir = { kind: 'file', getAsFile: () => csv('folder'), webkitGetAsEntry: () => ({ isDirectory: true }) };
    fireEvent.drop(screen.getByTestId('z'), { dataTransfer: { files: [], items: [dir] } });
    expect(onDrop).toHaveBeenCalledTimes(1);
    await new Promise((r) => setTimeout(r, 20));
    expect(onImported).not.toHaveBeenCalled();
  });

  it('open() clicks the input; disabled blocks choosing, dropping and opening', async () => {
    const onImported = vi.fn();
    const { rerender } = render(
      <DataImport onImported={onImported} disabled>
        {({ getRootProps, getInputProps, open }) => (
          <div data-testid="z" {...getRootProps()}>
            <input data-testid="in" {...getInputProps()} />
            <button type="button" onClick={open}>
              Browse
            </button>
          </div>
        )}
      </DataImport>,
    );
    const input = screen.getByTestId('in') as HTMLInputElement;
    const click = vi.spyOn(input, 'click');
    expect(input.disabled).toBe(true);
    fireEvent.click(screen.getByText('Browse'));
    fireEvent.drop(screen.getByTestId('z'), dropEvent([csv()]));
    expect(click).not.toHaveBeenCalled();
    rerender(
      <DataImport onImported={onImported}>
        {({ getInputProps, open }) => (
          <div>
            <input data-testid="in" {...getInputProps()} />
            <button type="button" onClick={open}>
              Browse
            </button>
          </div>
        )}
      </DataImport>,
    );
    fireEvent.click(screen.getByText('Browse'));
    expect(click).toHaveBeenCalledTimes(1);
    await new Promise((r) => setTimeout(r, 20));
    expect(onImported).not.toHaveBeenCalled();
  });

  it('errors go to onError, or to console.error without it', async () => {
    const onError = vi.fn();
    const { unmount } = render(<DataImport onError={onError} />);
    fireEvent.change(screen.getByLabelText('Import a spreadsheet'), { target: { files: [new File([new Uint8Array([1, 2, 3])], 'x.bin')] } });
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError.mock.calls[0]![0]).toMatchObject({ code: 'UNSUPPORTED_FORMAT' });
    unmount();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<DataImport />);
    fireEvent.change(screen.getByLabelText('Import a spreadsheet'), { target: { files: [csv('big.csv', 'x'.repeat(50))] } });
    await act(async () => undefined);
    log.mockRestore();
  });

  it('passes import options through (maxFileBytes, locale), read from the latest props', async () => {
    const onError = vi.fn();
    const onImported = vi.fn();
    const { rerender } = render(<DataImport maxFileBytes={5} onError={onError} />);
    fireEvent.change(screen.getByLabelText('Import a spreadsheet'), { target: { files: [csv()] } });
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError.mock.calls[0]![0]).toMatchObject({ code: 'LIMIT_EXCEEDED', details: { limit: 'maxFileBytes' } });
    rerender(<DataImport locale={{ decimal: ',', group: '.' }} onImported={onImported} />);
    fireEvent.change(screen.getByLabelText('Import a spreadsheet'), { target: { files: [csv('eu.csv', 'n;v\na;1.234,5\n')] } });
    await waitFor(() => expect(onImported).toHaveBeenCalledTimes(1));
    expect((onImported.mock.calls[0]![0] as ImportResult).data[0]!['v']).toBe(1234.5);
  });

  it('works under StrictMode', async () => {
    const onImported = vi.fn();
    render(
      <StrictMode>
        <DataImport onImported={onImported} />
      </StrictMode>,
    );
    fireEvent.change(screen.getByLabelText('Import a spreadsheet'), { target: { files: [csv()] } });
    await waitFor(() => expect(onImported).toHaveBeenCalledTimes(1));
  });
});
