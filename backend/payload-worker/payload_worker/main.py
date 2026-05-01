"""Entrypoint exposed to uvicorn / taskiq CLI.

Build a `RuntimeConfig` from env and hand it to the library factory. The
module-level `app` and `broker` symbols are what the CLIs import.
"""

from __future__ import annotations

from payload_worker_builder import RuntimeConfig, create_app

from payload_worker.settings import Settings

_settings = Settings()

_worker = create_app(
    RuntimeConfig(
        app_name=_settings.app_name,
        redis_url=_settings.redis_url,
        payload_url=_settings.payload_url,
        payload_service_token=_settings.payload_service_token,
        documents_collection_slug=_settings.documents_collection_slug,
        llama_cloud_api_key=_settings.llama_cloud_api_key,
        llama_parse_base_url=_settings.llama_parse_base_url,
        llama_parse_poll_interval_s=_settings.llama_parse_poll_interval_s,
        llama_parse_poll_timeout_s=_settings.llama_parse_poll_timeout_s,
        internal_secret=_settings.internal_secret,
        log_level=_settings.log_level,
    )
)

# Module-level handles consumed by uvicorn / taskiq CLI.
app = _worker.app
broker = _worker.broker
