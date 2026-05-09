---
"@zetesis/mcp-typesense": minor
---

**Folder-scoped MCP search**: parse the new `x-folder-slugs` header and
auto-apply it as the `folder_slugs` filter on every search.

Mirrors the existing `x-taxonomy-slugs` plumbing:

- `McpAuthContext` gains an optional `folderSlugs?: string[]` field.
- The default `header` auth strategy parses comma-separated values from
  the `x-folder-slugs` request header.
- `searchCollections` injects `folder_slugs:[…]` into `scopedFilters`
  when `auth.folderSlugs` is non-empty and the caller hasn't already
  set the filter explicitly.
- `getPostSummaries` mirrors the same auto-scoping for both
  `taxonomy_slugs` (when not already narrowed via `author_slug` /
  `topic_slug`) and `folder_slugs`. A token-scoped client now sees a
  consistent corpus across listing and search.

The slug chain is expected to mirror the folder breadcrumb (root →
leaf), so a token scoped to "Proyectos" matches every doc nested below
it. Documentation in `defaults.ts` (DEFAULT_INSTRUCTIONS / DEFAULT_GUIDE)
mentions the new filter alongside `taxonomy_slugs`.
