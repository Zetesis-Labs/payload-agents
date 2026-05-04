---
'@zetesis/payload-documents': patch
---

Update the documents collection's `mode` field to LlamaParse's current
`parse_mode` enum.

LlamaParse renamed the `fast` / `default` / `premium` enum to:

- `parse_page_without_llm` (no LLM, OCR only — replaces `fast`)
- `parse_page_with_llm` (balanced — replaces `default`, new default value)
- `parse_page_with_lvm` (vision — replaces `premium`)
- `parse_page_with_agent` / `parse_page_with_layout_agent` (per-page agentic)
- `parse_document_with_llm` / `parse_document_with_lvm` / `parse_document_with_agent`
  (whole-document context)

The plugin's collection schema, `LlamaParseMode` type, and the inline LlamaParse
client (`parse_mode` form field instead of the old `fast_mode` / `premium_mode`
booleans) all switch to the new enum together.

Hosts on Postgres need a one-shot data migration to rewrite existing rows
with the legacy values onto the new enum before the column type can be
swapped. ZetesisPortal ships such a migration alongside the bump
(`20260504_*_rename_documents_mode_llamaparse.ts`); other hosts should
mirror that mapping (`fast → parse_page_without_llm`, `default →
parse_page_with_llm`, `premium → parse_page_with_lvm`).
