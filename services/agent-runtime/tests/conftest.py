"""Shared fixtures for agent-runtime tests."""

from __future__ import annotations

import os
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

# Ensure DATABASE_URL is set before any agent_runtime imports
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost/test")


@pytest.fixture
def mock_payload_agents() -> list[dict[str, Any]]:
    return [
        {
            "id": 1,
            "name": "Test Agent",
            "slug": "test-agent",
            "isActive": True,
            "llmModel": "openai/gpt-4o-mini",
            "apiKey": "sk-test-key-123",
            "systemPrompt": "You are a test assistant.",
            "searchCollections": ["posts_chunk"],
            "taxonomies": [{"slug": "test-author"}],
            "kResults": 5,
        }
    ]


@pytest.fixture
def mock_payload_response(mock_payload_agents: list[dict[str, Any]]) -> dict[str, Any]:
    return {"docs": mock_payload_agents, "totalDocs": len(mock_payload_agents)}


@pytest.fixture
def mock_httpx_response(mock_payload_response: dict[str, Any]) -> MagicMock:
    """A mock httpx.Response that returns the payload agents."""
    resp = MagicMock()
    resp.json.return_value = mock_payload_response
    resp.raise_for_status = MagicMock()
    resp.status_code = 200
    return resp
