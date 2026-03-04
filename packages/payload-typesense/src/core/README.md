# Core Utilities

Core infrastructure and utilities that provide fundamental functionality for the entire plugin.

## Structure

```
core/
├── client/           # Typesense client setup
├── config/           # Configuration and constants
├── errors/           # Error class hierarchy
└── logging/          # Structured logging
```

## Modules

### Client (`./client/`)
**Purpose:** Typesense client initialization and connection management

**Key Files:**
- `typesense-client.ts` - Client factory and connection testing

**Exports:**
- `createTypesenseClient()` - Creates configured Typesense client
- `testTypesenseConnection()` - Tests connection to Typesense

### Config (`./config/`)
**Purpose:** Application constants and configuration validation

**Key Files:**
- `constants.ts` - All application constants
- `config-validation.ts` - Configuration validation utilities

**Key Constants:**
- `DEFAULT_CHUNK_SIZE` - Default text chunk size
- `DEFAULT_SEARCH_LIMIT` - Default search results limit

### Logging (`./logging/`)
**Purpose:** Structured logging with contextual information

**Key Files:**
- `logger.ts` - Logger instance and configuration

**Features:**
- Structured logging with JSON output
- Configurable log levels
- Contextual information support
- Error logging with stack traces

## Usage

```typescript
// Import from core
import { logger } from './core/logging/logger.js';
import { createTypesenseClient } from './core/client/typesense-client.js';
import { InvalidConfigError } from './core/errors/index.js';

// Use in your code
logger.info('Starting process', { context: 'value' });
const client = createTypesenseClient(config);
```

## Design Notes

- Core modules have **no dependencies** on features or shared modules
- All errors extend from `PayloadTypesenseError` for consistent error handling
- Logger uses structured logging for better observability
- Constants are centralized to avoid duplication
