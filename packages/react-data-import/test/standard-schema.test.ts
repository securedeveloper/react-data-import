// The Standard Schema claim (docs/api.md §7): Zod, Valibot and ArkType schemas
// work as `validate` without adapters. The same four cases run for each library.
import { type } from 'arktype';
import * as v from 'valibot';
import { z } from 'zod';
import { importFile, type ImportSchema } from '../src/index';

// Ada and Grace are valid; Linus has a negative age (row 4).
const people = 'Name,Age\nAda,36\nGrace,45\nLinus,-1\n';
const schema: ImportSchema = { fields: { name: { aliases: ['Name'] }, age: { aliases: ['Age'] } } };

describe('Zod 4', () => {
  it('valid rows become the schema output, typed', async () => {
    const Person = z.object({ name: z.string(), age: z.number().int().nonnegative() }).transform((p) => ({ ...p, adult: p.age >= 18 }));
    const r = await importFile(people, { schema, validate: Person });
    const adults: boolean[] = r.data.map((p) => p.adult);
    expect(adults).toEqual([true, true]);
    expect(r.data[0]).toEqual({ name: 'Ada', age: 36, adult: true });
    expect(r.rowNumbers).toEqual([2, 3]);
  });

  it('a field issue gets the field, its column and the cell ref', async () => {
    const r = await importFile(people, { schema, validate: z.object({ name: z.string(), age: z.number().nonnegative() }) });
    expect(r.issues).toEqual([{ row: 4, field: 'age', column: 'Age', ref: 'B4', code: 'INVALID', message: expect.any(String), severity: 'error' }]);
  });

  it('an unmapped optional field is null, and .nullable() accepts it', async () => {
    const r = await importFile('E-mail\nada@x.org\n', {
      schema: { fields: { email: { aliases: ['E-mail'] }, phone: {} } },
      validate: z.object({ email: z.string(), phone: z.string().nullable() }),
    });
    expect(r.issues).toEqual([]);
    expect(r.data).toEqual([{ email: 'ada@x.org', phone: null }]);
  });

  it('a required field without a column: MAPPING_MISSING, not a schema issue per row', async () => {
    const r = await importFile(people, {
      schema: { fields: { ...schema.fields, email: { required: true } } },
      validate: z.object({ name: z.string(), age: z.number(), email: z.string() }),
    });
    expect(r.issues).toEqual([{ row: 0, field: 'email', code: 'MAPPING_MISSING', message: 'No column for the required field "email".', severity: 'error' }]);
    expect(r.data).toEqual([]);
  });
});

describe('Valibot 1', () => {
  it('valid rows become the schema output, typed', async () => {
    const Person = v.pipe(
      v.object({ name: v.string(), age: v.pipe(v.number(), v.integer(), v.minValue(0)) }),
      v.transform((p) => ({ ...p, adult: p.age >= 18 })),
    );
    const r = await importFile(people, { schema, validate: Person });
    const adults: boolean[] = r.data.map((p) => p.adult);
    expect(adults).toEqual([true, true]);
    expect(r.data[0]).toEqual({ name: 'Ada', age: 36, adult: true });
    expect(r.rowNumbers).toEqual([2, 3]);
  });

  it('a field issue gets the field, its column and the cell ref', async () => {
    const r = await importFile(people, { schema, validate: v.object({ name: v.string(), age: v.pipe(v.number(), v.minValue(0)) }) });
    expect(r.issues).toEqual([{ row: 4, field: 'age', column: 'Age', ref: 'B4', code: 'INVALID', message: expect.any(String), severity: 'error' }]);
  });

  it('an unmapped optional field is null, and v.nullable() accepts it', async () => {
    const r = await importFile('E-mail\nada@x.org\n', {
      schema: { fields: { email: { aliases: ['E-mail'] }, phone: {} } },
      validate: v.object({ email: v.string(), phone: v.nullable(v.string()) }),
    });
    expect(r.issues).toEqual([]);
    expect(r.data).toEqual([{ email: 'ada@x.org', phone: null }]);
  });

  it('a required field without a column: MAPPING_MISSING, not a schema issue per row', async () => {
    const r = await importFile(people, {
      schema: { fields: { ...schema.fields, email: { required: true } } },
      validate: v.object({ name: v.string(), age: v.number(), email: v.string() }),
    });
    expect(r.issues).toEqual([{ row: 0, field: 'email', code: 'MAPPING_MISSING', message: 'No column for the required field "email".', severity: 'error' }]);
    expect(r.data).toEqual([]);
  });
});

describe('ArkType 2', () => {
  it('valid rows become the schema output, typed', async () => {
    const Person = type({ name: 'string', age: 'number.integer >= 0' }).pipe((p) => ({ ...p, adult: p.age >= 18 }));
    const r = await importFile(people, { schema, validate: Person });
    const adults: boolean[] = r.data.map((p) => p.adult);
    expect(adults).toEqual([true, true]);
    expect(r.data[0]).toEqual({ name: 'Ada', age: 36, adult: true });
    expect(r.rowNumbers).toEqual([2, 3]);
  });

  it('a field issue gets the field, its column and the cell ref', async () => {
    const r = await importFile(people, { schema, validate: type({ name: 'string', age: 'number >= 0' }) });
    expect(r.issues).toEqual([{ row: 4, field: 'age', column: 'Age', ref: 'B4', code: 'INVALID', message: expect.any(String), severity: 'error' }]);
  });

  it("an unmapped optional field is null, and 'string | null' accepts it", async () => {
    const r = await importFile('E-mail\nada@x.org\n', {
      schema: { fields: { email: { aliases: ['E-mail'] }, phone: {} } },
      validate: type({ email: 'string', phone: 'string | null' }),
    });
    expect(r.issues).toEqual([]);
    expect(r.data).toEqual([{ email: 'ada@x.org', phone: null }]);
  });

  it('a required field without a column: MAPPING_MISSING, not a schema issue per row', async () => {
    const r = await importFile(people, {
      schema: { fields: { ...schema.fields, email: { required: true } } },
      validate: type({ name: 'string', age: 'number', email: 'string' }),
    });
    expect(r.issues).toEqual([{ row: 0, field: 'email', code: 'MAPPING_MISSING', message: 'No column for the required field "email".', severity: 'error' }]);
    expect(r.data).toEqual([]);
  });
});
