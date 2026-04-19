"""Test bootstrap — set the required settings env vars *before* agent_runtime.config is imported.

The Settings class validates `DATABASE_URL` and `INTERNAL_SECRET` at import
time; without this shim every test module would fail to collect.
"""

from __future__ import annotations

import os

os.environ.setdefault("DATABASE_URL", "postgresql://user:pass@localhost:5432/test")
os.environ.setdefault("INTERNAL_SECRET", "test-secret")
