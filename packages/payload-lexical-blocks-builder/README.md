# @zetesis/payload-lexical-blocks-builder

Builder and renderer utilities for Payload CMS Lexical editor blocks.

## Installation

```bash
pnpm add @zetesis/payload-lexical-blocks-builder
```

## Usage

```ts
import { buildLexicalByFeatures } from '@zetesis/payload-lexical-blocks-builder/builder'

const lexicalConfig = buildLexicalByFeatures({
  features: [HeadingFeature, BoldFeature],
  blocks: [myCustomBlock],
})
```

## Exports

### Builder (`./builder`)

- **`buildLexicalByFeatures`** - Create Lexical editor config from features and blocks
- **`filterBlocksAtLexicalBuilder`** - Dynamically filter blocks by slug

### Renderer (`./renderer`)

- **`BlockRendererFunction`** / **`BlocksRendererFunctions`** - Types for block converter functions
- **`generateStoryForLexicalBlock`** - Storybook helper for block stories

## Architecture

### Builder

`buildLexicalByFeatures` composes a Lexical editor configuration from a list of features and custom blocks. `filterBlocksAtLexicalBuilder` dynamically filters which blocks are available based on slug.

### Renderer

`BlockRendererFunction` / `BlocksRendererFunctions` define the contract for converting Lexical block data to React components. `generateStoryForLexicalBlock` automates Storybook story creation for individual blocks.

### Relation to payload-indexer

The `payload-indexer` package uses Lexical text extraction transforms (`createSummarizeLexicalTransform`) to convert rich text content created with this builder into plain text for indexing and embedding generation.

## Features

- Feature-based Lexical editor composition
- Dynamic block filtering by slug
- Type-safe block renderer functions
- Storybook integration helpers

## Peer Dependencies

- `payload` ^3.75.0
- `@payloadcms/richtext-lexical` ^3.75.0
- `@payloadcms/ui` ^3.75.0
- `react` ^19.0.0

## License

MIT
