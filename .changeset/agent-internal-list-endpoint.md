---
'@zetesis/payload-agents-core': minor
---

Add the `internal/list` endpoint and migrate the apiKey decryption gate
off the `X-Runtime-Secret` request header.

**New endpoint** (registered on the agents collection):

`GET /api/<collectionSlug>/internal/list` — gated by `X-Internal-Secret`,
returns active agents with their tenant + taxonomies populated and the
`apiKey` field decrypted. Calls Payload's local API with
`overrideAccess: true` and `req.context.internalAgentRead = true` so the
host's collection access (and any populated relations like `tenants`) can
stay honestly user-scoped — the bypass branches that previously had to
live in the host's access functions are no longer needed.

**Hook change**: `createDecryptAfterReadHook` no longer checks for an
`X-Runtime-Secret` request header. Decryption now keys off
`req.context.internalAgentRead === true` (set by the new endpoint),
plus the existing `payloadAPI === 'local'` and superadmin checks.

**Migration for hosts**:

1. Bump this package + the `agno-agent-builder` Python lib together. The
   Python source class (`PayloadAgentSource`) now hits the new endpoint
   automatically — no caller changes if you used keyword args.
2. Drop the `X-Runtime-Secret` bypass branches from your `agents` and
   `tenants` collection `read` access functions; they're no longer
   reachable.

The `runtimeSecret` plugin config field stays the same value (it's
still the shared secret with the agent runtime); only the inbound
header name and the decryption-gate mechanism change.
