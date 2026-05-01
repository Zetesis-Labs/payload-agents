"""Built-in tasks.

Currently exposes the LlamaParse parse-document task. Adding more tasks later
is the same pattern: define them here and have `register_tasks` wire them.
"""

from payload_documents_worker_builder.tasks.parse_document import (
    PARSE_DOCUMENT_TASK_NAME,
    register_parse_document_task,
)

__all__ = ["PARSE_DOCUMENT_TASK_NAME", "register_parse_document_task"]
