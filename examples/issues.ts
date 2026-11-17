import { importFile, isExcelError, type ImportIssue } from 'react-data-import';

/** "Row 17, C17 (amount): must be positive", or a file-level message for row 0. */
export function describe(issue: ImportIssue): string {
  const where = issue.row === 0 ? 'File' : `Row ${issue.row}${issue.ref ? `, ${issue.ref}` : ''}`;
  return `${where}${issue.field ? ` (${issue.field})` : ''}: ${issue.message}`;
}

const messages: Record<string, string> = {
  UNSUPPORTED_FORMAT: "This file type isn't supported. Use .xlsx or .csv.",
  LIMIT_EXCEEDED: 'The file is too large.',
  ZIP_ENCRYPTED: 'This file is password-protected.',
};

export async function load(file: File) {
  try {
    const result = await importFile(file, { maxFileBytes: 10 * 1024 * 1024 });
    const errors = result.issues.filter((i) => i.severity === 'error').map(describe);
    const warnings = result.issues.filter((i) => i.severity === 'warning').map(describe);
    return { rows: result.data, errors, warnings };
  } catch (err) {
    // Problems that stop the import reject; javascript-excel's errors carry a code.
    throw new Error(isExcelError(err) ? (messages[err.code] ?? err.message) : 'The file could not be read.');
  }
}
