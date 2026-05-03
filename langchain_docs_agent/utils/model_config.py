"""Resolve chat model id from environment."""

from __future__ import annotations

import os

DEFAULT_MODEL = "anthropic:claude-sonnet-4-6"


def get_model_id() -> str:
    """Return LangChain v1 provider-prefixed model id (see ``DOCS_AGENT_MODEL``)."""
    return os.environ.get("DOCS_AGENT_MODEL", DEFAULT_MODEL).strip()
