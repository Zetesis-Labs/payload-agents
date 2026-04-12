"""Typed configuration loaded from environment variables."""

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
    # In dev: http://app:3030/mcp (MCP runs inside the app container)
    # In prod: Helm sets this to the MCP service endpoint
    mcp_url: str = "http://app:3030/mcp"

    database_url: str
    database_schema: str = "agno"

    internal_secret: str = "dev"

    log_level: str = "INFO"


settings = Settings()  # type: ignore[call-arg]
