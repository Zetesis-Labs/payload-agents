"""Tests for /health and /ready endpoints."""

from __future__ import annotations

from unittest.mock import patch

import pytest


def test_health_returns_200() -> None:
    with patch("agent_runtime.registry.PostgresDb"):
        from agent_runtime.main import app

    from fastapi.testclient import TestClient

    client = TestClient(app, raise_server_exceptions=False)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
