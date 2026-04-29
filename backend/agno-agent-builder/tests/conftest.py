"""Pytest bootstrap — no module-level env shim needed.

Earlier versions of `agno_agent_builder.config` validated DATABASE_URL/INTERNAL_SECRET
at import time. The library no longer loads env at import; consumers build a
`RuntimeConfig` themselves and pass it to `create_app`, so tests are free to
import any module without preconfiguration.
"""

from __future__ import annotations
