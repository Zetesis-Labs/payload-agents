"""Typed configuration loaded from environment variables."""

from __future__ import annotations

from typing import Any

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    payload_url: str = "http://app:3000"
    payload_service_token: str = ""

    # Direct MCP service URL (not the Next.js proxy).
    mcp_url: str = "http://app:3030/mcp"

    database_url: str = ""
    database_schema: str = "agno"

    internal_secret: str = "dev"  # noqa: S105

    log_level: str = "INFO"

    def model_post_init(self, __context: Any) -> None:
        if not self.database_url:
            raise ValueError("DATABASE_URL environment variable is required")


settings = Settings()
