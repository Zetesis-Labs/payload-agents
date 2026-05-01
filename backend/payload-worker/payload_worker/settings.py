"""Env-loaded Settings → RuntimeConfig."""

from __future__ import annotations

from pydantic import HttpUrl, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Same shape as `payload_worker_builder.RuntimeConfig` but populated from env.

    Kept separate so the lib stays decoupled from any specific env-loading
    strategy — consumers in other repos may load from Vault, Helm values, etc.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "payload-worker"

    redis_url: str = "redis://redis:6379"

    payload_url: HttpUrl = HttpUrl("http://app:3000")
    payload_service_token: SecretStr = SecretStr("")
    documents_collection_slug: str = "documents"

    llama_cloud_api_key: SecretStr = SecretStr("")
    llama_parse_base_url: HttpUrl = HttpUrl("https://api.cloud.llamaindex.ai")
    llama_parse_poll_interval_s: float = 5.0
    llama_parse_poll_timeout_s: float = 600.0

    internal_secret: SecretStr = SecretStr("")

    log_level: str = "INFO"

    def model_post_init(self, _ctx: object) -> None:
        if not self.payload_service_token.get_secret_value():
            raise ValueError("PAYLOAD_SERVICE_TOKEN environment variable is required")
        if not self.llama_cloud_api_key.get_secret_value():
            raise ValueError("LLAMA_CLOUD_API_KEY environment variable is required")
        if not self.internal_secret.get_secret_value():
            raise ValueError("INTERNAL_SECRET environment variable is required")
