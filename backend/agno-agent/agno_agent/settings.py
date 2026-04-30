"""Env-driven settings for the default agno-agent service."""

from __future__ import annotations

from typing import Any

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    payload_url: str = "http://app:3000"
    payload_service_token: str = ""

    mcp_url: str = "http://app:3030/mcp"

    database_url: str = ""
    database_schema: str = "agno"

    internal_secret: SecretStr = SecretStr("")

    log_level: str = "INFO"

    app_name: str = "agno-agent"

    def model_post_init(self, __context: Any) -> None:
        if not self.database_url:
            raise ValueError("DATABASE_URL environment variable is required")
        if not self.internal_secret.get_secret_value():
            raise ValueError("INTERNAL_SECRET environment variable is required")
