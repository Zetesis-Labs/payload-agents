# @nexo-labs/payload-taxonomies

Hierarchical taxonomy collection and relationship utilities for Payload CMS.

## Installation

```bash
pnpm add @nexo-labs/payload-taxonomies
```

## Usage

```ts
// payload.config.ts
import { taxonomiesCollection } from '@nexo-labs/payload-taxonomies'

export default buildConfig({
  collections: [
    taxonomiesCollection(),
    // your other collections...
  ],
})
```

```ts
// In another collection
import { buildTaxonomyRelationship } from '@nexo-labs/payload-taxonomies'

const PostsCollection = {
  slug: 'posts',
  fields: [
    buildTaxonomyRelationship({ hasMany: true }),
    // other fields...
  ],
}
```

## Exports

### Main (`.`)

- **`taxonomiesCollection`** - Pre-configured taxonomy collection builder
- **`buildTaxonomyRelationship`** - Helper to create taxonomy relationship fields
- **`COLLECTION_SLUG_TAXONOMY`** - Collection slug constant

### Constants (`./constants`)

- **`COLLECTION_SLUG_TAXONOMY`** - Lightweight import for the slug constant only

## Architecture

### Seed Integration

The app-level seed system uses these functions (in `apps/server/src/seed/`):

```
ensureTaxonomiesExist -> seedTaxonomy -> resolveNumericTaxonomy
```

`buildTaxonomySearchFields` generates Typesense-compatible fields from taxonomy data for indexing.

### Search Integration

`transformCategories` (app-level, `apps/server/src/payload/plugins/typesense/transforms.ts`) converts Payload taxonomy documents to Typesense-indexable format, extracting slugs and names for faceted search.

## Features

- Pre-built hierarchical taxonomy collection with slug generation
- Localized taxonomy names
- Custom JSON payload field for metadata
- Relationship helper for integrating taxonomies into other collections
- Optional TypeScript schema for typed JSON payloads

## Peer Dependencies

- `payload` ^3.75.0
- `@payloadcms/ui` ^3.75.0
- `react` ^19.0.0

## License

MIT
