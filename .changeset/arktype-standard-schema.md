---
"react-data-import": patch
---

ArkType schemas work as `validate`: an ArkType type is a function that carries `~standard`, and it is now validated as a Standard Schema instead of being called as a row function. Valibot and ArkType are tested alongside Zod.
