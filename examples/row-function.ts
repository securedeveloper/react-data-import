import { importFile, type ImportSchema } from 'react-data-import';

const schema: ImportSchema = {
  fields: {
    sku: { required: true },
    // A field check: return a message, or undefined when the value is fine.
    quantity: { aliases: ['Qty'], type: 'number', validate: (v) => (typeof v === 'number' && v > 0 ? undefined : 'must be positive') },
    price: { type: 'number' },
  },
};

export async function readOrders(file: File) {
  return importFile<{ sku: string; quantity: number; price: number | null }>(file, {
    schema,
    // A row check: nothing, a message, or issues. Async is allowed; rows run one at a time.
    validate: (row, { rowNumber }) => {
      if (row.price === null) return { field: 'price', message: 'no price; it will be looked up', severity: 'warning', code: 'NO_PRICE' };
      if (row.price > 10_000) return `row ${rowNumber}: price looks wrong`;
      return undefined;
    },
  });
}
