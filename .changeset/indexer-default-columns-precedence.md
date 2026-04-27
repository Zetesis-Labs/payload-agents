---
'@zetesis/payload-indexer': patch
---

Fix `defaultColumns` precedence so the per-collection `admin.defaultColumns` wins over the global `syncConfig.defaultColumns` (the global is now a fallback for collections that haven't picked their own list).

Previously the global default silently overrode every indexed collection — e.g. `@zetesis/payload-documents` ships `['filename', 'parse_status', 'parsed_at']` but the host's global `['title', '_syncStatus', 'slug', 'categorias']` was applied instead, leaving only `_syncStatus` rendered (the other columns don't exist on the documents schema).
