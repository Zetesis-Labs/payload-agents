---
"@zetesis/payload-agents-core": patch
---

Add X-Internal-Secret authentication to all runtime requests. Previously only the reload endpoint was authenticated; now all proxy calls (chat, sessions) include the header and the Python runtime rejects unauthenticated requests.
