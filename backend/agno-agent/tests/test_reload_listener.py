"""Tests for `agno_agent.reload_listener` helpers."""

from __future__ import annotations

from agno_agent.reload_listener import _psycopg_url


class TestPsycopgUrl:
    def test_strips_sqlalchemy_driver_prefix(self) -> None:
        assert (
            _psycopg_url("postgresql+psycopg://u:p@host:5432/db") == "postgresql://u:p@host:5432/db"
        )

    def test_accepts_plain_postgresql_url(self) -> None:
        assert _psycopg_url("postgresql://u:p@host/db") == "postgresql://u:p@host/db"

    def test_rewrites_postgres_short_prefix(self) -> None:
        assert _psycopg_url("postgres://u:p@host/db") == "postgresql://u:p@host/db"
