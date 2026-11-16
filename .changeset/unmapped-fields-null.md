---
"react-data-import": patch
---

With a schema, every imported row has every schema field: a field the file has no column for is `null`, and `columns` lists it with `type: 'empty'`. This comes from javascript-excel 2.0.0-alpha.4 (JSE-21). Before, the key was missing, so a validator's `.nullable()` rejected the row.
