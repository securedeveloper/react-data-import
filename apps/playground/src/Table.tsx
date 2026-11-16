import type { ReactElement } from 'react';

/** Cell text for display. Values from the file are untrusted: React escapes them; nothing goes through innerHTML. */
export function show(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
  if (typeof v === 'object') return 'error' in v ? String((v as { error: unknown }).error) : JSON.stringify(v);
  return String(v);
}

interface Props {
  caption: string;
  columns: Array<{ key: string; title: string; note?: string | undefined }>;
  rows: ReadonlyArray<Record<string, unknown>>;
  rowNumbers?: readonly number[] | undefined;
}

/** A scrollable, keyboard-reachable table with a caption and scoped headers. */
export function Table({ caption, columns, rows, rowNumbers }: Props): ReactElement {
  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label={caption}>
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            {rowNumbers ? <th scope="col">Row</th> : null}
            {columns.map((c) => (
              <th scope="col" key={c.key}>
                {c.title}
                {c.note ? <span className="note"> {c.note}</span> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={rowNumbers?.[i] ?? i}>
              {rowNumbers ? <th scope="row">{rowNumbers[i]}</th> : null}
              {columns.map((c) => (
                <td key={c.key} className={typeof r[c.key] === 'number' ? 'num' : undefined}>
                  {show(r[c.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
