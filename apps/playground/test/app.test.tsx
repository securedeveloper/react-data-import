import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { App } from '../src/App';

afterEach(cleanup);

describe('playground', () => {
  it('sample .xlsx: preview, automatic mapping, Zod validation with problems by row', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Try a sample .xlsx' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Read contacts\.xlsx: 6 rows, 4 columns\. Header: row 3 \(detected, high confidence\)\./));
    expect((screen.getByLabelText(/^email/) as HTMLSelectElement).value).toBe('E-mail');
    expect((screen.getByLabelText(/^joined/) as HTMLSelectElement).value).toBe('Since');
    fireEvent.click(screen.getByRole('button', { name: 'Validate and import' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Imported 3 valid rows; 3 problems found.'));
    const valid = screen.getByRole('region', { name: /3 valid rows/ });
    expect(within(valid).getAllByRole('row').map((r) => r.textContent?.split(/\s+/)[0])).toContain('4Ada');
    const problems = screen.getByRole('region', { name: /^Problems by spreadsheet row/ });
    expect(within(problems).getByText('Not an e-mail address')).toBeTruthy();
    expect(within(problems).getByText('Name is empty')).toBeTruthy();
    expect(within(problems).getByText('Amount is negative')).toBeTruthy();
  });

  it('European CSV: email needs mapping by hand; the button waits for it', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Try a European .csv' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Read kontakte\.csv/));
    expect(screen.getByText('Map a column to: email.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Validate and import' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/^email/), { target: { value: 'Kontakt' } });
    fireEvent.click(screen.getByRole('button', { name: 'Validate and import' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Imported 3 valid rows; 3 problems found.'));
  });

  it('a file that is not a spreadsheet gives a readable error', async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Choose an .xlsx or .csv file'), { target: { files: [new File([new Uint8Array([0, 1, 2])], 'x.bin')] } });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('This file type is not supported. Use .xlsx or .csv.'));
  });
});
