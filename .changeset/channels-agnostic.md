---
'agno-agent-builder': minor
---

Refactor the channel integration framework: Telegram is no longer the only
inbound channel and is no longer hardcoded into the runtime. The new
`agno_agent_builder.channels` package defines a `ChannelLoader` protocol;
`TelegramChannelLoader`, `WhatsAppChannelLoader`, and `DiscordChannelLoader`
implement it. The lifespan iterates over all enabled channels in order, fetches
their installations from the host CMS, mounts one inbound interface per row,
and registers per-bot bind config.

* `IdentityBindMiddleware` (replaces `TelegramBindMiddleware`) is
  channel-agnostic: each binding registers an `extract_token(body, headers,
  parsed)` callback (Discord verifies its own Ed25519 signature here, since
  no agno interface runs before the middleware), a `reply(target, text)`
  callback, and an `immediate_ack_body` (Discord uses `{"type":5}` to defer
  the slash command response).
* `TelegramChannelLoader` mounts agno's `Telegram` interface per
  `telegram-bot-installations` row.
* `WhatsAppChannelLoader` mounts agno's `Whatsapp` interface per
  `whatsapp-installations` row. Webhook signature verification still uses
  the global `WHATSAPP_APP_SECRET` env var (per-installation `appSecret`
  storage exists in the host schema for v2).
* `DiscordChannelLoader` mounts a custom `DiscordInterface` per
  `discord-installations` row — agno doesn't ship a Discord interface, so
  we wrote one based on the HTTP Interactions endpoint (verifies Ed25519,
  defers slash commands beyond 3s and follows up via the interaction
  webhook).
* Bind endpoint contract changed from `POST /api/telegram-binding-tokens/bind`
  to `POST /api/identity-binding-tokens/bind`, with body `{token, channel,
  externalId, externalUsername?, installationId}`.
* `DEFAULT_PUBLIC_PATHS` now includes `/whatsapp/` and `/discord/` (each
  channel's interface validates its own request signature).
* Added `cryptography` as a runtime dependency (Discord Ed25519 verification).
* Removed `telegram_loader.py` and `telegram_bind_middleware.py`.

Hosts that previously wired only Telegram keep working — the loader gracefully
no-ops on channels whose installation collections aren't present (404 from the
CMS internal endpoint).
