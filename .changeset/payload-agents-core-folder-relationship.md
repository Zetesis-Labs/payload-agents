---
"@zetesis/payload-agents-core": minor
---

**Folder-scoped agents**: the auto-generated `agents` collection gets a
new `folders` `relationship[hasMany]` field next to `taxonomies`.

- `AgentPluginConfig` gains an optional `foldersCollectionSlug` (default
  `'payload-folders'`, matching Payload's auto-injected folders slug).
  Override it only if your `buildConfig({ folders: { slug } })` uses a
  different slug.
- The `RAG Configuration` group on the agents admin form now exposes
  `Folders` so admins can scope an agent to one or more folders. Empty
  by default — the agent searches all available content unless a folder
  is selected.

The agno-agent-builder runtime reads the new field and forwards each
folder's breadcrumb slug chain via the `x-folder-slugs` header (handled
by `@zetesis/mcp-typesense ≥ 0.4`).
