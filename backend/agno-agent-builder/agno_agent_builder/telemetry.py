"""Langfuse/OpenTelemetry wiring for the Agno runtime.

Routes each tenant's OTel spans to the Langfuse project whose API key pair
is stored on its Payload tenant row, falling back to the globally
configured project (``LANGFUSE_PUBLIC_KEY`` / ``LANGFUSE_SECRET_KEY``)
for tenants without a provisioned project.

Projects are created manually in the Langfuse UI by the superadmin —
self-hosted Langfuse community edition does not expose the SCIM /
org-scoped API surface needed for automated provisioning, so the
superadmin pastes the project ID + key pair into the tenant row in
Payload admin and the runtime picks them up from there.
"""

from __future__ import annotations

import base64
import threading
import time
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

import httpx
from openinference.instrumentation.agno import AgnoInstrumentor
from opentelemetry import baggage
from opentelemetry import context as otel_context
from opentelemetry import trace as trace_api
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import ReadableSpan, Span, SpanProcessor, TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, SpanExporter, SpanExportResult
from pydantic import SecretStr

from agno_agent_builder.config import RuntimeConfig

TENANT_ID_ATTRIBUTE = "tenant_id"
LANGFUSE_TENANT_METADATA_ATTRIBUTE = "langfuse.trace.metadata.tenant_id"
LANGFUSE_TAGS_ATTRIBUTE = "langfuse.trace.tags"


@dataclass(frozen=True)
class LangfuseCredentials:
    public_key: str
    secret_key: str


@dataclass(frozen=True)
class LangfuseTracingHandle:
    """Returned by ``configure_langfuse_tracing`` so the runtime lifespan
    can hook the tenant_reload NOTIFY listener into the resolver cache."""

    provider: TracerProvider
    resolver: "PayloadTenantKeyResolver"


class BaggageAttributeSpanProcessor(SpanProcessor):
    """Copy the tenant_id baggage value to every started span so Langfuse
    can filter and tag traces per tenant within each project."""

    def on_start(self, span: Span, parent_context: otel_context.Context | None = None) -> None:
        ctx = parent_context or otel_context.get_current()
        tenant_id = baggage.get_baggage(TENANT_ID_ATTRIBUTE, context=ctx)
        if not tenant_id:
            return

        span.set_attribute(TENANT_ID_ATTRIBUTE, tenant_id)
        span.set_attribute(LANGFUSE_TENANT_METADATA_ATTRIBUTE, tenant_id)
        span.set_attribute(LANGFUSE_TAGS_ATTRIBUTE, [f"tenant:{tenant_id}"])

    def on_end(self, span: ReadableSpan) -> None:
        return None

    def shutdown(self) -> None:
        return None

    def force_flush(self, timeout_millis: int = 30000) -> bool:
        return True


class PayloadTenantKeyResolver:
    """Resolve per-tenant Langfuse project credentials from Payload.

    The runtime calls Payload's internal
    ``GET /tenants/{id}/langfuse-project-keys`` endpoint with
    ``X-Internal-Secret``. Missing keys (404) fall back to the shared
    project credentials.

    Caching:
    - Positive hits are cached for ``ttl_s`` seconds (default 300). New
      keys pasted in Payload after that propagate without restart.
    - Negative responses (404 / network errors) are **not** cached, so
      a tenant that did not have keys when first seen picks them up on
      its next trace once the superadmin saves them in Payload.
    """

    def __init__(
        self,
        *,
        payload_url: str | None,
        internal_secret: str,
        fallback: LangfuseCredentials | None,
        timeout_s: float = 5.0,
        ttl_s: float = 300.0,
        logger: Any,
    ) -> None:
        self._payload_url = payload_url.rstrip("/") if payload_url else None
        self._internal_secret = internal_secret
        self._fallback = fallback
        self._timeout_s = timeout_s
        self._ttl_s = ttl_s
        self._logger = logger
        self._cache: dict[str, tuple[LangfuseCredentials, float]] = {}
        self._lock = threading.Lock()

    def resolve(self, tenant_id: str | None) -> LangfuseCredentials | None:
        if not tenant_id or not self._payload_url or not self._internal_secret:
            return self._fallback

        now = time.monotonic()
        with self._lock:
            entry = self._cache.get(tenant_id)
            if entry is not None and entry[1] > now:
                return entry[0]

        credentials = self._fetch(tenant_id)
        if credentials is not None:
            with self._lock:
                self._cache[tenant_id] = (credentials, now + self._ttl_s)
            return credentials
        return self._fallback

    def invalidate(self, tenant_id: str | None) -> None:
        """Drop the cached entry for ``tenant_id`` (or the whole cache when
        the payload is empty). Called by the runtime's tenant_reload
        listener so the next trace re-fetches fresh keys."""
        with self._lock:
            if tenant_id:
                self._cache.pop(tenant_id, None)
            else:
                self._cache.clear()

    def _fetch(self, tenant_id: str) -> LangfuseCredentials | None:
        url = f"{self._payload_url}/api/tenants/{tenant_id}/langfuse-project-keys"
        try:
            response = httpx.get(
                url,
                headers={"X-Internal-Secret": self._internal_secret},
                timeout=self._timeout_s,
            )
            if response.status_code == 404:
                return None
            response.raise_for_status()
            data = response.json()
            public_key = data.get("publicKey")
            secret_key = data.get("secretKey")
            if isinstance(public_key, str) and isinstance(secret_key, str):
                return LangfuseCredentials(public_key=public_key, secret_key=secret_key)
        except Exception:
            self._logger.warning(
                "Langfuse tenant credential lookup failed; using fallback project",
                tenant_id=tenant_id,
                exc_info=True,
            )
        return None


class TenantRoutingLangfuseExporter(SpanExporter):
    """Route OTLP span batches to the Langfuse project matching tenant_id."""

    def __init__(
        self,
        *,
        endpoint: str,
        resolver: PayloadTenantKeyResolver,
    ) -> None:
        self._endpoint = endpoint
        self._resolver = resolver
        self._exporters: dict[LangfuseCredentials, OTLPSpanExporter] = {}
        self._lock = threading.Lock()

    def export(self, spans: Sequence[ReadableSpan]) -> SpanExportResult:
        grouped: dict[LangfuseCredentials, list[ReadableSpan]] = {}
        for span in spans:
            credentials = self._resolver.resolve(_tenant_id_from_span(span))
            if credentials is None:
                continue
            grouped.setdefault(credentials, []).append(span)

        for credentials, credential_spans in grouped.items():
            result = self._exporter_for(credentials).export(credential_spans)
            if result is not SpanExportResult.SUCCESS:
                return result
        return SpanExportResult.SUCCESS

    def shutdown(self) -> None:
        for exporter in self._exporters.values():
            exporter.shutdown()

    def force_flush(self, timeout_millis: int = 30000) -> bool:
        return all(exporter.force_flush(timeout_millis) for exporter in self._exporters.values())

    def _exporter_for(self, credentials: LangfuseCredentials) -> OTLPSpanExporter:
        with self._lock:
            exporter = self._exporters.get(credentials)
            if exporter is not None:
                return exporter

            auth = base64.b64encode(
                f"{credentials.public_key}:{credentials.secret_key}".encode()
            ).decode()
            exporter = OTLPSpanExporter(
                endpoint=self._endpoint,
                headers={
                    "Authorization": f"Basic {auth}",
                    "x-langfuse-ingestion-version": "4",
                },
            )
            self._exporters[credentials] = exporter
            return exporter


def configure_langfuse_tracing(config: RuntimeConfig, logger: Any) -> LangfuseTracingHandle | None:
    """Configure process-wide OpenTelemetry export to Langfuse, routing
    spans to the per-tenant project when available and falling back to
    the shared project otherwise. Returns a handle exposing the
    resolver so the lifespan can wire NOTIFY-based cache invalidation."""

    if not config.langfuse_host:
        return None

    fallback = _credentials_from_secrets(config.langfuse_public_key, config.langfuse_secret_key)
    if fallback is None:
        logger.warning(
            "LANGFUSE_HOST is set but LANGFUSE_PUBLIC_KEY/LANGFUSE_SECRET_KEY are missing; "
            "only tenants with provisioned project keys will be exported"
        )

    resolver = PayloadTenantKeyResolver(
        payload_url=config.payload_url,
        internal_secret=config.internal_secret.get_secret_value(),
        fallback=fallback,
        logger=logger,
    )

    provider = TracerProvider(
        resource=Resource.create(
            {
                "service.name": config.app_name,
                "service.namespace": "zetesis",
            }
        )
    )
    provider.add_span_processor(BaggageAttributeSpanProcessor())
    provider.add_span_processor(
        BatchSpanProcessor(
            TenantRoutingLangfuseExporter(
                endpoint=_otel_traces_endpoint(config.langfuse_host),
                resolver=resolver,
            )
        )
    )
    trace_api.set_tracer_provider(provider)
    AgnoInstrumentor().instrument()

    logger.info(
        "Langfuse tracing enabled",
        host=config.langfuse_host,
        tenant_project_routing=bool(config.payload_url),
        fallback_project=bool(fallback),
    )
    return LangfuseTracingHandle(provider=provider, resolver=resolver)


def tenant_baggage_context(tenant_id: str) -> Any:
    ctx = otel_context.get_current()
    ctx = baggage.set_baggage(TENANT_ID_ATTRIBUTE, tenant_id, context=ctx)
    ctx = baggage.set_baggage(LANGFUSE_TENANT_METADATA_ATTRIBUTE, tenant_id, context=ctx)
    ctx = baggage.set_baggage(LANGFUSE_TAGS_ATTRIBUTE, f"tenant:{tenant_id}", context=ctx)
    return otel_context.attach(ctx)


def detach_tenant_baggage(token: Any) -> None:
    otel_context.detach(token)


def _credentials_from_secrets(
    public_key: SecretStr | None,
    secret_key: SecretStr | None,
) -> LangfuseCredentials | None:
    public = public_key.get_secret_value() if public_key else ""
    secret = secret_key.get_secret_value() if secret_key else ""
    if not public or not secret:
        return None
    return LangfuseCredentials(public_key=public, secret_key=secret)


def _otel_traces_endpoint(host: str) -> str:
    base = host.rstrip("/")
    if base.endswith("/api/public/otel/v1/traces"):
        return base
    if base.endswith("/api/public/otel"):
        return f"{base}/v1/traces"
    return f"{base}/api/public/otel/v1/traces"


def _tenant_id_from_span(span: ReadableSpan) -> str | None:
    value = span.attributes.get(TENANT_ID_ATTRIBUTE) or span.attributes.get(
        LANGFUSE_TENANT_METADATA_ATTRIBUTE
    )
    if value is None:
        return None
    return str(value)
