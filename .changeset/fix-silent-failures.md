---
"@zetesis/mcp-typesense": patch
---

fix: surface silent failures in embeddings, taxonomy cache, and collection stats

- Log OpenAI embedding errors instead of swallowing them silently
- Throw on taxonomy mid-pagination failure instead of caching partial results; fall back to stale cache if available
- Include error/error_message fields in collection stats when Typesense is unavailable
