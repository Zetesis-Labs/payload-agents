"""Tests for `agno_agent_builder.db`."""

from __future__ import annotations

from agno_agent_builder.db import normalize_pg_url


class TestNormalizePgUrl:
    def test_rewrites_postgres_prefix(self) -> None:
        assert (
            normalize_pg_url("postgres://u:p@host:5432/db")
            == "postgresql+psycopg://u:p@host:5432/db"
        )

    def test_rewrites_postgresql_prefix(self) -> None:
        assert (
            normalize_pg_url("postgresql://u:p@host:5432/db")
            == "postgresql+psycopg://u:p@host:5432/db"
        )

    def test_passes_through_already_normalized(self) -> None:
        url = "postgresql+psycopg://u:p@host:5432/db"
        assert normalize_pg_url(url) == url

    def test_passes_through_unknown_prefix(self) -> None:
        assert normalize_pg_url("mysql://u:p@host/db") == "mysql://u:p@host/db"
