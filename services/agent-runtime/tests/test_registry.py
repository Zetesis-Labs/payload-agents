"""Tests for AgentRegistry."""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from agent_runtime.registry import _normalize_pg_url


def test_normalize_pg_url_postgresql() -> None:
    assert _normalize_pg_url("postgresql://u:p@h/d") == "postgresql+psycopg://u:p@h/d"


def test_normalize_pg_url_postgres() -> None:
    assert _normalize_pg_url("postgres://u:p@h/d") == "postgresql+psycopg://u:p@h/d"


def test_normalize_pg_url_already_correct() -> None:
    url = "postgresql+psycopg://u:p@h/d"
    assert _normalize_pg_url(url) == url


@pytest.mark.asyncio
async def test_load_all_parses_payload_response(
    mock_payload_response: dict[str, Any],
    mock_httpx_response: MagicMock,
) -> None:
    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_httpx_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    with (
        patch("agent_runtime.registry.httpx.AsyncClient", return_value=mock_client),
        patch("agent_runtime.registry.PostgresDb"),
    ):
        from agent_runtime.registry import AgentRegistry

        registry = AgentRegistry()
        await registry.load_all()

    assert len(registry.all()) == 1
    assert registry.slugs() == ["test-agent"]


@pytest.mark.asyncio
async def test_load_all_skips_agents_without_api_key(
    mock_payload_response: dict[str, Any],
    mock_httpx_response: MagicMock,
) -> None:
    mock_payload_response["docs"][0]["apiKey"] = ""
    mock_httpx_response.json.return_value = mock_payload_response

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_httpx_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    with (
        patch("agent_runtime.registry.httpx.AsyncClient", return_value=mock_client),
        patch("agent_runtime.registry.PostgresDb"),
    ):
        from agent_runtime.registry import AgentRegistry

        registry = AgentRegistry()
        await registry.load_all()

    assert len(registry.all()) == 0
