"""Tests for /internal/agents/reload endpoint."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch


def test_reload_rejects_wrong_secret() -> None:
    with patch("agent_runtime.registry.PostgresDb"):
        from agent_runtime.main import app

    from fastapi.testclient import TestClient

    client = TestClient(app, raise_server_exceptions=False)
    response = client.post(
        "/internal/agents/reload",
        headers={"X-Internal-Secret": "wrong-secret"},
    )
    assert response.status_code == 401


def test_reload_rejects_missing_secret() -> None:
    with patch("agent_runtime.registry.PostgresDb"):
        from agent_runtime.main import app

    from fastapi.testclient import TestClient

    client = TestClient(app, raise_server_exceptions=False)
    response = client.post("/internal/agents/reload")
    assert response.status_code == 401
