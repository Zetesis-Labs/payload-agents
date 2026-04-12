"""System prompt composition for Agno agents."""

from __future__ import annotations

from typing import Any


def compose_instructions(cfg: dict[str, Any]) -> str:
    """Build the full system prompt from a Payload agent document.

    Structure:  personality  →  RAG hints  →  tool use protocol.
    """
    parts: list[str] = []

    system_prompt = cfg.get("systemPrompt")
    if isinstance(system_prompt, str) and system_prompt.strip():
        parts.append(system_prompt.strip())

    taxonomy_slugs = extract_taxonomy_slugs(cfg.get("taxonomies"))
    if taxonomy_slugs:
        parts.append(f"[RAG filter: taxonomy_slugs={','.join(taxonomy_slugs)}]")

    search_collections = cfg.get("searchCollections")
    if isinstance(search_collections, list) and search_collections:
        parts.append(f"[RAG collections: {','.join(search_collections)}]")

    parts.append(_TOOL_USE_PROTOCOL)

    return "\n\n".join(parts)


def extract_taxonomy_slugs(taxonomies: list[Any] | None) -> list[str]:
    """Extract taxonomy slugs from populated Payload relationships."""
    if not isinstance(taxonomies, list):
        return []
    slugs: list[str] = []
    for item in taxonomies:
        if isinstance(item, dict) and isinstance(item.get("slug"), str):
            slugs.append(item["slug"])
        elif isinstance(item, str):
            slugs.append(item)
    return slugs


_TOOL_USE_PROTOCOL = """\
## Tool use protocol

You have access to a search index via MCP tools. Follow these rules:

### Search workflow
1. **Search first** — use `search_collections` with 1-2 concept keywords. \
Always pass `taxonomy_slugs` from the [RAG filter] above in the `filters` parameter. \
Never put author names or meta-words ("opinión", "dice", "piensa") in the query.
2. **Evaluate results** — if you get fewer than 3 hits, shorten the query to 1 keyword \
or retry in `mode: "lexical"`.
3. **Read full context** — when a search hit looks relevant, call `get_chunks_by_parent` \
with its `parent_doc_id` to read the surrounding paragraphs before answering. \
A single chunk rarely has enough context on its own.
4. **Cite sources** — reference the document title for every claim you make.

### Multiple tool calls
- You CAN and SHOULD make multiple tool calls in a single turn when needed.
- A typical good turn: search → read full doc → (optionally search again with a different angle) → answer.
- Do NOT answer from a single search result if the question is broad. Gather evidence from 2-3 documents first.
- If the first search returns nothing useful, reformulate and search again before saying you have no information."""
