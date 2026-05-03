"""Deep-agent subagent specs (module experts + quality control + forum researcher)."""

from __future__ import annotations

from typing import Any

from deepagents.middleware.subagents import CompiledSubAgent
from langchain.agents import create_agent
from langchain_core.runnables import Runnable
from langchain_core.tools import BaseTool

from langchain_docs_agent.utils.model_config import get_model_id
from langchain_docs_agent.utils.prompts import (
    DEEPAGENTS_EXPERT_SYSTEM_PROMPT,
    FORUM_RESEARCHER_SYSTEM_PROMPT,
    LANGCHAIN_EXPERT_SYSTEM_PROMPT,
    LANGGRAPH_EXPERT_SYSTEM_PROMPT,
    LANGSMITH_EXPERT_SYSTEM_PROMPT,
    QUALITY_CONTROL_SYSTEM_PROMPT,
)


def build_docs_subagents(
    tools: list[BaseTool], forum_tools: list[BaseTool]
) -> list[CompiledSubAgent]:
    """Return specialized subagents for each LangChain ecosystem module + QC + forum research.

    Each subagent is a pre-compiled runnable built with ``create_agent`` (which sets
    ``recursion_limit=9_999`` internally).

    Args:
        tools: MCP documentation tools (search + filesystem query) to provide to each subagent.
        forum_tools: Forum research tools (search_forum_posts, get_forum_topic) for the
            forum-researcher subagent only.
    """
    model = get_model_id()
    recursion_limit = 11_000

    def _agent(tools_: list[BaseTool], system_prompt: str, name: str) -> Runnable[Any, Any]:
        return create_agent(
            model=model,
            tools=tools_,
            system_prompt=system_prompt,
            name=name,
        ).with_config({"recursion_limit": recursion_limit})

    return [
        # LangChain module expert (agents, tools, middleware, RAG, etc.)
        CompiledSubAgent(
            name="langchain-expert",
            description=(
                "Specialist for **LangChain Python** (create_agent, tools, middleware, "
                "RAG, retrieval, messages, structured output, models, MCP, context "
                "engineering, multi-agent, long-term memory, SQL agents, voice agents, "
                "guardrails). Use for questions specific to LangChain's agent framework, "
                "integrations, or component architecture."
            ),
            runnable=_agent(tools, LANGCHAIN_EXPERT_SYSTEM_PROMPT, "langchain-expert"),
        ),
        # LangGraph module expert (orchestration, state, persistence, graphs)
        CompiledSubAgent(
            name="langgraph-expert",
            description=(
                "Specialist for **LangGraph Python** (graph API, functional API, "
                "StateGraph, persistence, checkpointers, memory, interrupts, streaming, "
                "subgraphs, pregel, durable execution, fault tolerance, time travel, "
                "studio). Use for low-level orchestration, stateful workflows, graph "
                "compilation, or advanced control flow."
            ),
            runnable=_agent(tools, LANGGRAPH_EXPERT_SYSTEM_PROMPT, "langgraph-expert"),
        ),
        # LangSmith module expert (observability, evaluation, prompts, deployment)
        CompiledSubAgent(
            name="langsmith-expert",
            description=(
                "Specialist for **LangSmith** (observability, tracing, evaluation, "
                "datasets, annotation queues, prompts, deployment, sandboxes, agent "
                "servers, distributed tracing, fleet, self-hosted, online evals, "
                "RBAC, cost tracking). Use for platform/ops questions, testing, "
                "production deployment, or LangSmith API/SDK."
            ),
            runnable=_agent(tools, LANGSMITH_EXPERT_SYSTEM_PROMPT, "langsmith-expert"),
        ),
        # Deep Agents module expert (harness, subagents, planning, filesystem, skills)
        CompiledSubAgent(
            name="deepagents-expert",
            description=(
                "Specialist for **Deep Agents Python/TypeScript** (create_deep_agent, "
                "harness, subagents, planning/todos, virtual filesystem, skills, "
                "profiles, backends, sandboxes, async subagents, MCP integration, "
                "streaming, content builder, permissions, data analysis, deep research, "
                "CLI). Use for questions about the Deep Agents framework, architecture, "
                "or advanced orchestration patterns."
            ),
            runnable=_agent(tools, DEEPAGENTS_EXPERT_SYSTEM_PROMPT, "deepagents-expert"),
        ),
        # Quality control / answer validation (post-research)
        CompiledSubAgent(
            name="quality-control",
            description=(
                "Answer validation specialist. After the main agent drafts a response, "
                "delegate here to check: (1) all factual claims are grounded in doc tool "
                "output, (2) code/APIs match current docs exactly, (3) version/platform "
                "assumptions are stated, (4) no hallucinated symbols, (5) citations "
                "present. Returns a verification report or approval."
            ),
            runnable=_agent(tools, QUALITY_CONTROL_SYSTEM_PROMPT, "quality-control"),
        ),
        # Forum researcher — community cross-check via forum.langchain.com
        CompiledSubAgent(
            name="forum-researcher",
            description=(
                "Cross-check answers against real community solutions on forum.langchain.com. "
                "Use AFTER the expert subagents draft an answer to verify with accepted "
                "community answers and workarounds. Especially useful for: specific error "
                "messages (e.g. MESSAGE_COERCION_FAILURE), version-specific bugs, "
                "undocumented workarounds, and common pitfalls not yet in official docs. "
                "Returns CONFIRMS / CONTRADICTS / ADDS NUANCE / NO RELEVANT RESULTS."
            ),
            runnable=_agent(forum_tools, FORUM_RESEARCHER_SYSTEM_PROMPT, "forum-researcher"),
        ),
    ]
