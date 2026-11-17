import { importFile, type ImportSchema } from 'react-data-import';
import { z } from 'zod';

const schema: ImportSchema = {
  fields: {
    email: { aliases: ['E-mail'], required: true },
    age: { type: 'number' },
    phone: { type: 'string' }, // keeps text: a column of digits would be inferred as numbers
  },
};

const Contact = z.object({
  email: z.email(),
  age: z.number().int().min(0).nullable(),
  phone: z.string().nullable(), // an unmapped or empty field is null
});

export async function readWithZod(file: File) {
  const { data, issues } = await importFile(file, { schema, validate: Contact });
  // data: z.output<typeof Contact>[]; an issue on age reads { row, field: 'age', column: 'Age', ref: 'B5', … }
  const emails: string[] = data.map((c) => c.email);
  return { emails, issues };
}
