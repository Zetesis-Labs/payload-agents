---
'@zetesis/payload-documents': patch
---

Re-export the `ResolveFileBinary` type from the package root and from
`./plugin`. It was declared in `src/plugin/types.ts` but never re-exported,
so consumers couldn't type their `resolveFileBinary` callback against it.
