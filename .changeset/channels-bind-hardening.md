---
'agno-agent-builder': patch
---

Close 4 critical/major bugs from the PR #57 review:

* Discord bind reply leaked the user's email into public channels —
  `DiscordChannelLoader` now sends a deferred response with `flags: 64`
  (ephemeral) so both the "Bot is thinking…" placeholder and the bind
  follow-up are only visible to the invoking user.

* WhatsApp bind path bypassed `X-Hub-Signature-256` validation — agno's
  WhatsApp interface validates only on the passthrough path, not on the
  middleware short-circuit, leaving the bind endpoint open to forged
  POSTs from anyone who knew the public webhook URL plus a leaked
  `connect <token>` value. The WhatsApp extractor now verifies HMAC-SHA256
  against `WHATSAPP_APP_SECRET` (with a `WHATSAPP_SKIP_SIGNATURE_VALIDATION`
  escape hatch matching agno's local-dev behaviour).

* Telegram bind path had the same gap on
  `X-Telegram-Bot-Api-Secret-Token`. The Telegram extractor now validates
  it against the global `TELEGRAM_WEBHOOK_SECRET_TOKEN` env var
  (`APP_ENV=development` bypasses, mirroring agno's `_is_dev_mode`).

* `WhatsAppChannelLoader` registered the bind webhook path as `/whatsapp/<phoneNumberId>`
  (missing the `/webhook` suffix), so the IdentityBindMiddleware never
  matched the actual incoming webhook URL. Now `f"{prefix}/webhook"` like
  the Telegram loader.

* `DiscordInterface._run_agent_and_followup` wraps the `arun()` call in
  `asyncio.wait_for(timeout=14*60)` — Discord interaction tokens expire
  after 15 minutes, so a slow agent run now degrades to a graceful
  "took too long" reply instead of leaving the "thinking…" placeholder
  hanging forever (the PATCH @original 404s post-expiry).

* Moved a misplaced docstring under the field it actually describes
  (`reply_target` instead of `external_username`).
