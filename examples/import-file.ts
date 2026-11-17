import { importFile, type ImportSchema } from 'react-data-import';

const contacts: ImportSchema = {
  fields: {
    email: { aliases: ['E-mail', 'Email address'], required: true },
    name: { aliases: ['Full name'] },
    joined: { aliases: ['Start date'], type: 'date' },
  },
};

export async function readContacts(file: File) {
  const { columns, data, rowNumbers, issues, meta } = await importFile(file, {
    schema: contacts,
    maxFileBytes: 10 * 1024 * 1024,
  });
  // columns: email, name, joined (schema order); data: [{ email, name, joined }, …]
  // rowNumbers[i]: the spreadsheet row of data[i]; issues: what was left out and why
  console.log(meta.format, meta.header.rows, meta.mapping);
  return { columns, data, rowNumbers, issues };
}
