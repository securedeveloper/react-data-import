// The demo's target schema: what an app might want from a contacts file.
import { z } from 'zod';
import type { ImportSchema } from 'react-data-import';

// The playground's CSP has no 'unsafe-eval': tell Zod not to try its JIT (new Function) at all.
z.config({ jitless: true });

export const contacts: ImportSchema = {
  fields: {
    name: { aliases: ['Full name', 'Name', 'Contact'] },
    email: { aliases: ['E-mail', 'Email address', 'Mail'], required: true },
    joined: { aliases: ['Joined', 'Start date', 'Since'], type: 'date' },
    amount: { aliases: ['Amount', 'Total', 'Betrag'], type: 'number' },
  },
};

/** Row validation with Zod (any Standard Schema works); rows become its output. */
export const Contact = z.object({
  name: z.string({ error: 'Name is empty' }).trim().min(1, 'Name is empty'),
  email: z.email('Not an e-mail address'),
  // nullish: an optional field the user leaves unmapped is absent from the row.
  joined: z.date().nullish(),
  amount: z.number().nonnegative('Amount is negative').nullish(),
});
export type Contact = z.infer<typeof Contact>;

/** Shown in the page, so the validation step is readable. */
export const CONTACT_SOURCE = `z.object({
  name: z.string({ error: 'Name is empty' }).trim().min(1, 'Name is empty'),
  email: z.email('Not an e-mail address'),
  joined: z.date().nullish(),
  amount: z.number().nonnegative('Amount is negative').nullish(),
})`;
