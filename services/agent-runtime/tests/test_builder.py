"""Tests for `agent_runtime.builder.build_model` provider/model mapping."""

from __future__ import annotations

import pytest
from agno.models.anthropic import Claude
from agno.models.openai import OpenAIChat, OpenAIResponses

from agent_runtime.builder import build_model
from agent_runtime.exceptions import UnsupportedProviderError


class TestBuildModel:
    def test_anthropic_returns_claude(self) -> None:
        model = build_model("anthropic", "claude-sonnet-4-5", "sk-test")
        assert isinstance(model, Claude)
        assert model.id == "claude-sonnet-4-5"

    @pytest.mark.parametrize(
        "model_id", ["o1-preview", "o3-mini", "o4-mini", "gpt-4.1", "gpt-5-turbo"]
    )
    def test_openai_reasoning_series_returns_responses(self, model_id: str) -> None:
        model = build_model("openai", model_id, "sk-test")
        assert isinstance(model, OpenAIResponses)
        assert model.id == model_id

    @pytest.mark.parametrize("model_id", ["gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo"])
    def test_openai_chat_series_returns_chat(self, model_id: str) -> None:
        model = build_model("openai", model_id, "sk-test")
        assert isinstance(model, OpenAIChat)
        assert model.id == model_id

    def test_unknown_provider_raises(self) -> None:
        with pytest.raises(UnsupportedProviderError) as exc:
            build_model("cohere", "command-r", "sk-test")
        assert exc.value.details == {"provider": "cohere"}
        assert exc.value.http_status == 422
