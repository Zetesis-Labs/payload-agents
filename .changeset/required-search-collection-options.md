---
'@zetesis/payload-agents-core': patch
---

**BREAKING**: `agentPlugin({...})` now requires `searchCollectionOptions` in its config.

The agent's `searchCollections` field used to ship with the options hardcoded to `posts_chunk` and `books_chunk`. That silently broke any consumer indexing additional collections (e.g. `documents_chunk` once the documents plugin is wired up): chunks were indexed but the agent had no way to query them.

The plugin now demands an explicit list and refuses to boot without one — same stance as `mediaCollectionSlug` and `taxonomyCollectionSlug`. Each consumer's set of indexed collections is project-specific, so silently defaulting would mask wiring mistakes.

Migration:

```ts
// Before (0.3.x)
agentPlugin({
  runtimeUrl: '...',
  mediaCollectionSlug: 'media',
  taxonomyCollectionSlug: 'taxonomy',
  // ...
})

// After (0.4.x)
agentPlugin({
  runtimeUrl: '...',
  mediaCollectionSlug: 'media',
  taxonomyCollectionSlug: 'taxonomy',
  searchCollectionOptions: [
    { label: 'Posts', value: 'posts_chunk' },
    { label: 'Books', value: 'books_chunk' }
    // add { label: 'Documents', value: 'documents_chunk' } if you index documents
  ],
  // ...
})
```

Empty arrays are rejected at boot: `agentPlugin` throws if the list has zero entries — an agent that can't search anything is almost certainly a misconfiguration.

Existing agents in the database keep whatever was saved at creation. The new `defaultValue` (= every option you declare) only applies to brand-new agents.
