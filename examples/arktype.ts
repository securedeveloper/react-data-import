import { type } from 'arktype';
import { importFile, type ImportSchema } from 'react-data-import';

const schema: ImportSchema = {
  fields: {
    email: { aliases: ['E-mail'], required: true },
    age: { type: 'number' },
    phone: { type: 'string' }, // keeps text: a column of digits would be inferred as numbers
  },
};

const Contact = type({
  email: 'string.email',
  age: 'number.integer >= 0 | null',
  phone: 'string | null', // an unmapped or empty field is null
});

export async function readWithArkType(file: File) {
  const { data, issues } = await importFile(file, { schema, validate: Contact });
  // data: typeof Contact.infer[]
  const emails: string[] = data.map((c) => c.email);
  return { emails, issues };
}
