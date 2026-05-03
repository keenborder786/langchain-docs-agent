"""Link validation tool — verify that URLs are reachable before citing them.

Uses HTTP HEAD (with GET fallback) and follows redirects so the final
destination is what gets checked, not an intermediate redirect hop.
"""

from __future__ import annotations

from typing import Any

import httpx
from langchain_core.tools import BaseTool, tool

_HTTP_TIMEOUT = 10.0


@tool
async def validate_url(url: str) -> dict[str, Any]:
    """Check whether a URL is reachable and not dead (404 / error).

    Performs an HTTP HEAD request first; falls back to GET if the server
    returns 405 Method Not Allowed (common on GitHub and some CDNs).
    Follows redirects so the final destination is validated.

    Returns a dict with:
    - ``url``: the URL that was checked
    - ``status_code``: final HTTP status code (None on network error)
    - ``ok``: True if the URL is live (status < 400 after following redirects)
    - ``error``: exception message on network failure, else None

    **Always call this before including any URL in a response.**
    If ``ok`` is False, omit the link entirely or note "link unavailable".

    Args:
        url: The full URL to validate (e.g. "https://docs.langchain.com/oss/python/langchain/agents").
    """
    async with httpx.AsyncClient(follow_redirects=True, timeout=_HTTP_TIMEOUT) as client:
        try:
            response = await client.head(url)
            if response.status_code == 405:
                response = await client.get(url)
            return {
                "url": url,
                "status_code": response.status_code,
                "ok": response.status_code < 400,
                "error": None,
            }
        except Exception as exc:  # noqa: BLE001
            return {
                "url": url,
                "status_code": None,
                "ok": False,
                "error": str(exc),
            }


def load_link_tools() -> list[BaseTool]:
    """Return link validation tools for injection into every subagent."""
    return [validate_url]
