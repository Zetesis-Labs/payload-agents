"""System prompt composition for Agno agents.

Uses XML tags to create clear hierarchy so the model distinguishes
persona, RAG config, tool protocol, and output format unambiguously.
"""

from __future__ import annotations

from typing import Any


def compose_instructions(cfg: dict[str, Any]) -> str:
    """Build the full system prompt from a Payload agent document.

    Structure (outermost → innermost):
      <PERSONA>        — who you are (from Payload systemPrompt)
      <RAG_CONFIG>     — scoping: taxonomy slugs, collections
      <TOOL_PROTOCOL>  — how to call tools (two-pass workflow)
      <OUTPUT_FORMAT>  — how to format the final answer
    """
    sections: list[str] = []

    # -- Persona (user-authored in Payload CMS) --
    system_prompt = cfg.get("systemPrompt")
    if isinstance(system_prompt, str) and system_prompt.strip():
        sections.append(f"<PERSONA>\n{system_prompt.strip()}\n</PERSONA>")

    # -- RAG scoping --
    rag_parts: list[str] = []
    taxonomy_slugs = extract_taxonomy_slugs(cfg.get("taxonomies"))
    if taxonomy_slugs:
        rag_parts.append(f"taxonomy_slugs: {','.join(taxonomy_slugs)}")
    search_collections = cfg.get("searchCollections")
    if isinstance(search_collections, list) and search_collections:
        rag_parts.append(f"collections: {','.join(search_collections)}")
    if rag_parts:
        sections.append(f"<RAG_CONFIG>\n{chr(10).join(rag_parts)}\n</RAG_CONFIG>")

    # -- Tool protocol & output format --
    raw_limit = cfg.get("toolCallLimit")
    try:
        limit_line = f"\nMax {int(raw_limit)} tool calls per turn." if raw_limit is not None else ""
    except (ValueError, TypeError):
        limit_line = ""
    sections.append(f"<TOOL_PROTOCOL>\n{_TOOL_PROTOCOL}{limit_line}\n</TOOL_PROTOCOL>")
    sections.append(f"<OUTPUT_FORMAT>\n{_OUTPUT_FORMAT}\n</OUTPUT_FORMAT>")

    return "\n\n".join(sections)


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


_TOOL_PROTOCOL = """\
You retrieve information using ONLY `search_collections`.

TWO-PASS WORKFLOW:

Pass 1 — Discovery:
  Call `search_collections` with 1-2 concept keywords (default settings).
  Returns up to 20 hits truncated to 300 chars.
  ALWAYS pass the taxonomy_slugs from <RAG_CONFIG> in `filters`.
  NEVER put author names or meta-words ("opinión", "dice", "piensa") in the query.

Pass 2 — Expand:
  Call `search_collections` again with the SAME query adding:
    snippet_length: 0
    expand_context: 2
    per_page: 5
  This returns full text with neighboring chunks in one call.

RULES:
- Do NOT answer from truncated snippets. Always do Pass 2 before answering.
- If Pass 1 returns < 3 hits, shorten query to 1 keyword or retry with mode: "lexical".
- If no results, reformulate once before saying you have no information.
- Cite the document title for every claim.
- Plan your searches carefully to minimize tool calls."""

_OUTPUT_FORMAT = """\
ALWAYS format responses in Markdown. This is mandatory, not optional.

Structure:
- Use ## and ### headings to organize sections.
- Use **bold** for key concepts, names, and terms.
- Use numbered lists for sequential arguments.
- Use bullet lists for non-sequential points.
- Use > blockquotes when quoting the author's exact words.
- Keep paragraphs short (3-4 sentences max).
- Put the source document title in **bold** after each claim or quote."""
