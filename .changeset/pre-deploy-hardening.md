---
"@zetesis/payload-agents-core": patch
---

Warn on empty runtimeSecret at plugin init. Use conservative token estimate (message/3 + 2000 overhead) instead of message/4.
