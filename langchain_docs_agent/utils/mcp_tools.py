"""Load tools from the hosted LangChain documentation MCP server."""

from __future__ import annotations

import asyncio
import os
from typing import Any, cast

from langchain_core.tools import BaseTool
from langchain_mcp_adapters.client import MultiServerMCPClient

DEFAULT_DOCS_MCP_URL = "https://docs.langchain.com/mcp"


async def load_mcp_tools_async() -> list[BaseTool]:
    """Fetch LangChain docs tools from the remote MCP (HTTP transport)."""
    url = os.environ.get("LANGCHAIN_DOCS_MCP_URL", DEFAULT_DOCS_MCP_URL)
    connections = cast(
        "dict[str, Any]",
        {
            "docs-langchain": {
                "transport": "http",
                "url": url,
            },
        },
    )
    client = MultiServerMCPClient(connections)
    return await client.get_tools()


def load_mcp_tools() -> list[BaseTool]:
    """Synchronous loader for module-level graph construction."""
    return asyncio.run(load_mcp_tools_async())
