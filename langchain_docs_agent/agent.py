"""Exported LangGraph graph: Deep Agent + LangChain docs MCP.

Checkpoint persistence uses Redis via ``langgraph.json`` → ``checkpointer`` (custom factory),
not ``checkpointer=`` on the compiled graph — LangGraph API / ``langgraph dev`` reject embedded
custom checkpoint savers on the graph object.
"""

from __future__ import annotations

from typing import Any

from deepagents import (
    GeneralPurposeSubagentProfile,
    HarnessProfile,
    create_deep_agent,
    register_harness_profile,
)

from langchain_docs_agent.utils.forum_tools import load_forum_tools
from langchain_docs_agent.utils.link_validator import load_link_tools
from langchain_docs_agent.utils.mcp_tools import load_mcp_tools
from langchain_docs_agent.utils.model_config import get_model_id
from langchain_docs_agent.utils.prompts import MAIN_SYSTEM_PROMPT
from langchain_docs_agent.utils.subagents import build_docs_subagents

register_harness_profile(
    "anthropic:claude-sonnet-4-6",
    HarnessProfile(
        general_purpose_subagent=GeneralPurposeSubagentProfile(enabled=False),
    ),
)

register_harness_profile(
    "openai:gpt-5.5",
    HarnessProfile(
        general_purpose_subagent=GeneralPurposeSubagentProfile(enabled=False),
    ),
)


def _build_graph() -> Any:
    """Deep agent: built-in planning/fs/task tooling plus official docs MCP tools."""
    tools = load_mcp_tools()
    forum_tools = load_forum_tools()
    link_tools = load_link_tools()
    return create_deep_agent(
        model=get_model_id(),
        tools=tools + link_tools,
        system_prompt=MAIN_SYSTEM_PROMPT,
        subagents=build_docs_subagents(tools + link_tools, forum_tools + link_tools),
        name="langchain-docs-agent",
    )


graph = _build_graph()
