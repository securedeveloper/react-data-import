import { importFile, type ImportSchema } from 'react-data-import';
import * as v from 'valibot';

const schema: ImportSchema = {
  fields: {
    email: { aliases: ['E-mail'], required: true },
    age: { type: 'number' },
    phone: { type: 'string' }, // keeps text: a column of digits would be inferred as numbers
  },
};

const Contact = v.object({
  email: v.pipe(v.string(), v.email()),
  age: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
  phone: v.nullable(v.string()), // an unmapped or empty field is null
});

export async function readWithValibot(file: File) {
  const { data, issues } = await importFile(file, { schema, validate: Contact });
  // data: v.InferOutput<typeof Contact>[]
  const emails: string[] = data.map((c) => c.email);
  return { emails, issues };
}
