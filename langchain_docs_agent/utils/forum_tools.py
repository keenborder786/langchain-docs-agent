"""LangChain forum research tools — query forum.langchain.com via Discourse JSON API.

The Discourse API is publicly accessible without authentication for read operations.
Two tools are exposed:
- search_forum_posts: keyword/phrase search returning relevant topics + blurbs
- get_forum_topic: fetch the full post thread for a given topic ID

These tools must NEVER raise on HTTP errors — that crashes the calling subagent
with an unrecoverable exception. Instead they retry transient failures (429 /
5xx) with exponential backoff (honouring Retry-After) and on final failure
return a structured ``{"error": ..., "results": []}`` payload so the agent can
read the error, decide whether to fall back to other sources, and complete its
turn gracefully.
"""

from __future__ import annotations

import asyncio
import re
from typing import Any

import httpx
from langchain_core.tools import BaseTool, tool

FORUM_BASE_URL = "https://forum.langchain.com"
_HTTP_TIMEOUT = 10.0
_MAX_POSTS_PER_TOPIC = 5

# Retry policy for transient failures (429, 502, 503, 504, network errors).
_MAX_RETRIES = 3
_BASE_BACKOFF_S = 1.0
_MAX_BACKOFF_S = 8.0
_RETRYABLE_STATUS = {408, 425, 429, 500, 502, 503, 504}


def _strip_html(html: str) -> str:
    """Remove HTML tags and normalise whitespace."""
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


async def _fetch_with_retries(
    url: str,
    *,
    params: dict[str, Any] | None = None,
) -> tuple[dict[str, Any] | None, str | None]:
    """Fetch a Discourse JSON endpoint, retrying transient failures.

    Returns a tuple ``(json_data, error_message)``. Exactly one element is
    non-None. ``error_message`` is a short human-readable string suitable for
    surfacing back to the agent (and therefore to the UI).
    """
    last_error: str | None = None
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
        for attempt in range(_MAX_RETRIES):
            try:
                response = await client.get(url, params=params)

                # Retryable status codes — back off and try again.
                if response.status_code in _RETRYABLE_STATUS:
                    retry_after_header = response.headers.get("retry-after")
                    if retry_after_header and retry_after_header.isdigit():
                        wait_s = min(float(retry_after_header), _MAX_BACKOFF_S)
                    else:
                        wait_s = min(_BASE_BACKOFF_S * (2**attempt), _MAX_BACKOFF_S)
                    last_error = (
                        f"Forum API returned {response.status_code} "
                        f"({response.reason_phrase or 'transient error'})"
                    )
                    if attempt + 1 < _MAX_RETRIES:
                        await asyncio.sleep(wait_s)
                        continue
                    return None, (
                        f"{last_error}. Forum is rate-limiting or unavailable; "
                        "fall back to official documentation only."
                    )

                # Non-retryable client errors — return immediately.
                if response.is_error:
                    return None, (
                        f"Forum API error {response.status_code} "
                        f"({response.reason_phrase}): {response.text[:200]}"
                    )

                return response.json(), None

            except (httpx.TimeoutException, httpx.NetworkError) as exc:
                last_error = f"Network error contacting forum: {exc.__class__.__name__}: {exc}"
                if attempt + 1 < _MAX_RETRIES:
                    wait_s = min(_BASE_BACKOFF_S * (2**attempt), _MAX_BACKOFF_S)
                    await asyncio.sleep(wait_s)
                    continue
                return None, last_error
            except Exception as exc:  # noqa: BLE001
                # Anything else — treat as a hard failure, do not retry.
                return None, f"Unexpected error contacting forum: {exc}"

    return None, last_error or "Forum request failed for unknown reasons."


@tool
async def search_forum_posts(query: str, max_topics: int = 5) -> dict[str, Any]:
    """Search forum.langchain.com for community discussions matching a query.

    Returns a dict with:
      - ``results``: ranked list of forum topics (title, URL, tags, blurbs,
        ``has_accepted_answer``, etc.). Empty if the request failed or no
        topics matched.
      - ``error`` (optional): short human-readable note explaining why the
        results are empty (e.g. ``"Forum is rate-limiting"``). When present,
        DO NOT retry the same call yourself — fall back to documentation
        from the docs MCP and proceed.

    Prioritise topics where ``has_accepted_answer`` is True when looking
    for confirmed solutions.

    Args:
        query: Search terms (e.g. "AsyncRedisSaver MESSAGE_COERCION_FAILURE").
        max_topics: Maximum number of topics to return (default 5, max 20).
    """
    max_topics = min(max(1, max_topics), 20)

    data, error = await _fetch_with_retries(
        f"{FORUM_BASE_URL}/search.json",
        params={"q": query, "order": "latest"},
    )
    if error or data is None:
        return {"results": [], "error": error or "Unknown forum error"}

    topics: list[dict[str, Any]] = data.get("topics", [])[:max_topics]
    posts: list[dict[str, Any]] = data.get("posts", [])

    blurbs_by_topic: dict[int, list[str]] = {}
    for post in posts:
        tid_raw = post.get("topic_id")
        blurb = post.get("blurb", "").strip()
        if isinstance(tid_raw, int) and blurb:
            blurbs_by_topic.setdefault(tid_raw, []).append(blurb)

    results = []
    for topic in topics:
        tid = topic.get("id")
        slug = topic.get("slug", "")
        blurbs = blurbs_by_topic.get(tid, []) if isinstance(tid, int) else []
        results.append(
            {
                "topic_id": tid,
                "title": topic.get("title", ""),
                "url": f"{FORUM_BASE_URL}/t/{slug}/{tid}",
                "tags": [t.get("name") for t in topic.get("tags", [])],
                "has_accepted_answer": topic.get("has_accepted_answer", False),
                "reply_count": topic.get("reply_count", 0),
                "posts_count": topic.get("posts_count", 0),
                "created_at": topic.get("created_at", ""),
                "last_posted_at": topic.get("last_posted_at", ""),
                "blurbs": blurbs,
            }
        )

    return {"results": results}


@tool
async def get_forum_topic(topic_id: int) -> dict[str, Any]:
    """Fetch the full post thread for a LangChain forum topic by its numeric ID.

    Returns a dict with:
      - ``topic_id``, ``title``, ``url``, ``posts``: when the fetch succeeds.
      - ``error`` (only when the fetch fails): short note explaining the
        failure. The returned dict will still contain ``topic_id`` and
        ``url`` for context but ``posts`` will be empty. DO NOT retry the
        same call yourself — fall back to documentation.

    To keep context concise, only posts that are the accepted answer or
    the first ``_MAX_POSTS_PER_TOPIC`` posts are included; code blocks
    are preserved in plain text.  Always note the ``created_at`` date on
    posts when quoting them — older posts may refer to deprecated APIs.

    Args:
        topic_id: Numeric topic ID (e.g. 1102).  Obtain from search_forum_posts.
    """
    data, error = await _fetch_with_retries(f"{FORUM_BASE_URL}/t/{topic_id}.json")
    if error or data is None:
        return {
            "topic_id": topic_id,
            "url": f"{FORUM_BASE_URL}/t/{topic_id}",
            "title": "",
            "posts": [],
            "error": error or "Unknown forum error",
        }

    slug = data.get("slug", "")
    title = data.get("title", "")
    url = f"{FORUM_BASE_URL}/t/{slug}/{topic_id}"

    raw_posts: list[dict[str, Any]] = data.get("post_stream", {}).get("posts", [])

    accepted_posts = [p for p in raw_posts if p.get("accepted_answer")]
    first_posts = raw_posts[:_MAX_POSTS_PER_TOPIC]

    seen_ids: set[int] = set()
    selected: list[dict[str, Any]] = []
    for p in accepted_posts + first_posts:
        pid = p.get("id")
        if isinstance(pid, int) and pid not in seen_ids:
            seen_ids.add(pid)
            selected.append(p)

    posts_out = []
    for p in selected:
        content = _strip_html(p.get("cooked", ""))
        posts_out.append(
            {
                "post_number": p.get("post_number"),
                "username": p.get("username", ""),
                "created_at": p.get("created_at", ""),
                "accepted_answer": p.get("accepted_answer", False),
                "like_count": p.get("like_count", 0),
                "content": content,
            }
        )

    return {
        "topic_id": topic_id,
        "title": title,
        "url": url,
        "posts": posts_out,
    }


def load_forum_tools() -> list[BaseTool]:
    """Return forum research tools for use in subagent construction."""
    return [search_forum_posts, get_forum_topic]
