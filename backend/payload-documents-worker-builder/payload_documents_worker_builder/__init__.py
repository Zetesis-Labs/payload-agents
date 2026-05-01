"""Public API for `payload-documents-worker-builder`.

Mirrors the shape of `agno_agent_builder.__init__`: a single import surface
that exposes the factory, the config, the clients and the tasks. Consumers
should never reach into submodules.
"""

from payload_documents_worker_builder.app import WorkerApp, create_app
from payload_documents_worker_builder.broker import create_broker
from payload_documents_worker_builder.clients import (
    LlamaParseClient,
    LlamaParseError,
    LlamaParseJob,
    LlamaParseStatus,
    PayloadClient,
    PayloadError,
)
from payload_documents_worker_builder.config import RuntimeConfig
from payload_documents_worker_builder.tasks import (
    PARSE_DOCUMENT_TASK_NAME,
    register_parse_document_task,
)

__all__ = [
    "PARSE_DOCUMENT_TASK_NAME",
    "LlamaParseClient",
    "LlamaParseError",
    "LlamaParseJob",
    "LlamaParseStatus",
    "PayloadClient",
    "PayloadError",
    "RuntimeConfig",
    "WorkerApp",
    "create_app",
    "create_broker",
    "register_parse_document_task",
]

__version__ = "0.1.0"
