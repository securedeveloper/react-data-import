---
"react-data-import": patch
---

Depends on javascript-excel `^2.0.0-beta.1`. With `header: 'auto'`, a two-row CSV header is now detected and flattened (`Sales / Q1`), and a group title written over empty cells carries right over its sub-columns (`Q1 / Jan`, `Q1 / Feb`). Before, the second header row was imported as a data row.
