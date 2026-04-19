---
'@zetesis/payload-agents-core': minor
---

Make `mediaCollectionSlug` and `taxonomyCollectionSlug` required on `agentPlugin()`.

The previous defaults (`'media'` and `'taxonomy'`) matched the conventions we use, but hid a footgun: if a consumer renamed either collection, the Agents' `avatar` upload and `taxonomies` relationship broke silently — no error at boot, just empty references on every write.

Both fields are now required in `AgentPluginConfig`, and the plugin validates at registration time that each referenced slug is present in the Payload config, throwing with a clear `[agent-plugin] collection "…" referenced by …CollectionSlug is not registered` if you try to boot without them.

**Migration** — set the slugs explicitly in your plugin config. If you were relying on the defaults the values stay the same:

```ts
agentPlugin({
  runtimeUrl: '…',
  mediaCollectionSlug: 'media',
  taxonomyCollectionSlug: 'taxonomy',
  // …
})
```
