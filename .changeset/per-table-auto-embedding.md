---
"@zetesis/payload-indexer": minor
"@zetesis/payload-typesense": minor
---

Per-table embedding strategy + Typesense auto-embedding.

`EmbeddingTableConfig` accepts two new mutually exclusive fields:

- `provider` — overrides the global `features.embedding` for a single
  table, so you can mix providers (e.g. OpenAI Large on one table, Gemini
  on another) without writing a second plugin instance.
- `autoEmbed` — declares `embed.from` and `embed.model_config` on the
  Typesense schema. The indexer no longer computes embeddings for that
  table and search no longer round-trips to OpenAI/Gemini for the query
  vector — Typesense embeds documents on upsert and queries on search,
  using the model declared in the schema (incl. built-in
  `ts/multilingual-e5-large`, `ts/e5-small`, etc.).

`features.embedding` is now optional at the plugin level and acts as a
fallback for tables that don't declare their own provider. Backwards
compatible: existing configs keep working.

Internally, `createIndexerPlugin` exposes a new `embeddingResolver` that
returns the right `EmbeddingService` per table (or `undefined` when the
backend handles embedding). Sync hooks were rewired to use it.
