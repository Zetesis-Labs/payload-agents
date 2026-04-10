# MCP Server

Thin wrapper around `@zetesis/mcp-typesense`. Provides a ready-to-run MCP server that exposes Typesense-indexed content (posts, books) with taxonomy enrichment, search, and LLM-powered synthesis tools.

## Quick start

```bash
# From the repo root
pnpm install

# Start Payload + MCP together (VSCode/Cursor)
# Use the "Launch" compound in .vscode/launch.json

# Or manually:
pnpm --filter server dev          # Payload on :3000
pnpm --filter mcp dev             # MCP on :3030
```

## Environment variables

| Variable | Default | Required |
|----------|---------|----------|
| `TYPESENSE_API_KEY` | `xyz` | Yes |
| `TYPESENSE_HOST` | `127.0.0.1` | No |
| `TYPESENSE_PORT` | `8108` | No |
| `TYPESENSE_PROTOCOL` | `http` | No |
| `OPENAI_API_KEY` | — | Yes (for semantic/hybrid search) |
| `PAYLOAD_API_URL` | `http://localhost:3000` | No |
| `MCP_PORT` | `3001` | No |

In the devcontainer, all Typesense vars and `MCP_PORT=3030` are pre-configured in `.devcontainer/devcontainer.env`. You only need to add `OPENAI_API_KEY`.

## Connect to Claude Code

Add a `.mcp.json` at the repo root (it's gitignored):

```json
{
  "mcpServers": {
    "search": {
      "type": "http",
      "url": "http://localhost:3030/mcp"
    }
  }
}
```

Then restart Claude Code. The MCP tools will appear automatically:

- `search_collections` — concept-based search across posts and books
- `get_taxonomy_tree` — browse the taxonomy hierarchy (authors, topics)
- `get_post_summaries` — list posts by author or topic
- `get_book_toc` — table of contents for a book
- `get_chunks_by_parent` — read a full document in chunk order
- `get_chunks_by_ids` — fetch specific chunks by ID
- `get_filter_criteria` — raw facet counts for filtering
- `get_collection_stats` — collection statistics
- `compare_perspectives` — compare search results across authors
- `summarize_document` — LLM-powered document summary (requires sampling)
- `extract_claims` — LLM-powered claim extraction (requires sampling)
- `synthesize_comparison` — LLM-powered cross-author comparison (requires sampling)

## How it works

```
Client (Claude Code) → MCP Server (:3030) → Typesense (:8108)
                                           → Payload CMS (:3000) (taxonomy + book content)
```

The MCP server queries Typesense for indexed chunks and Payload for taxonomy/book data. All tool definitions, transport, and sampling logic live in `@zetesis/mcp-typesense` — this app only provides the collection topology and env-var config.
