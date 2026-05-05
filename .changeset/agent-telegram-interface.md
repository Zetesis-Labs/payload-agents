---
'@zetesis/payload-agents-core': minor
---

Add `Agent.allowGuestAccess` checkbox so hosts can mark agents as
guest-accessible from external channels (e.g. Telegram users not yet
bound to a CMS user). Defaults to `false` — backwards compatible.

Pairs with the Telegram bot wiring in `agno-agent-builder` (same release).
Hosts that wire a per-tenant `TelegramBotInstallations` collection and the
matching internal endpoints can expose any active agent through Telegram;
the `allowGuestAccess` flag lets them limit which agents the bot will
serve to anonymous Telegram chats.
