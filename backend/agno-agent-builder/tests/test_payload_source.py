"""Tests for `agno_agent_builder.sources.payload`."""

from __future__ import annotations

import pytest
from agno_agent_builder.sources.payload import _extract_taxonomy_slugs, payload_doc_to_agent_config


class TestExtractTaxonomySlugs:
    def test_handles_populated_relationships(self) -> None:
        items = [{"slug": "bastos"}, {"slug": "filosofia"}]
        assert _extract_taxonomy_slugs(items) == ["bastos", "filosofia"]

    def test_handles_raw_string_ids(self) -> None:
        assert _extract_taxonomy_slugs(["bastos", "filosofia"]) == ["bastos", "filosofia"]

    def test_skips_unpopulated_int_ids(self) -> None:
        assert _extract_taxonomy_slugs([1, 2, 3]) == []

    def test_returns_empty_for_none(self) -> None:
        assert _extract_taxonomy_slugs(None) == []


class TestPayloadDocToAgentConfig:
    def _doc(self, **overrides: object) -> dict[str, object]:
        base: dict[str, object] = {
            "slug": "bastos",
            "name": "Bastos",
            "llmModel": "openai/o4-mini",
            "apiKey": "sk-test",
            "tenant": {"slug": "internal"},
            "taxonomies": [{"slug": "bastos"}],
            "searchCollections": ["posts_chunk"],
            "toolCallLimit": 5,
            "systemPrompt": "you are bastos",
        }
        base.update(overrides)
        return base

    def test_maps_full_doc(self) -> None:
        cfg = payload_doc_to_agent_config(self._doc())
        assert cfg.slug == "bastos"
        assert cfg.name == "Bastos"
        assert cfg.llm_model == "openai/o4-mini"
        assert cfg.api_key.get_secret_value() == "sk-test"
        assert cfg.tenant_slug == "internal"
        assert cfg.taxonomy_slugs == ["bastos"]
        assert cfg.search_collections == ["posts_chunk"]
        assert cfg.tool_call_limit == 5
        assert cfg.instructions_extra == "you are bastos"

    def test_unpopulated_tenant_becomes_none(self) -> None:
        cfg = payload_doc_to_agent_config(self._doc(tenant=2))
        assert cfg.tenant_slug is None

    def test_missing_optional_fields(self) -> None:
        cfg = payload_doc_to_agent_config(
            {"slug": "x", "name": "X", "llmModel": "openai/gpt-4o", "apiKey": "k"}
        )
        assert cfg.taxonomy_slugs == []
        assert cfg.search_collections == []
        assert cfg.tool_call_limit is None
        assert cfg.instructions_extra is None

    def test_invalid_tool_call_limit_falls_back_to_none(self) -> None:
        cfg = payload_doc_to_agent_config(self._doc(toolCallLimit="not-a-number"))
        assert cfg.tool_call_limit is None

    def test_falls_back_to_slug_when_name_missing(self) -> None:
        doc = self._doc()
        doc.pop("name")
        cfg = payload_doc_to_agent_config(doc)
        assert cfg.name == "bastos"

    @pytest.mark.parametrize("missing", ["slug", "llmModel", "apiKey"])
    def test_raises_on_required_missing(self, missing: str) -> None:
        doc = self._doc()
        doc[missing] = ""
        with pytest.raises(ValueError):
            payload_doc_to_agent_config(doc)
