# langchain-docs-agent

![Preview](assets/preview.png)

An agent that answers questions about the **LangChain ecosystem** — LangChain, LangGraph, LangSmith, and Deep Agents — grounded in two live sources: the **[official docs MCP](https://docs.langchain.com/mcp)** and the **[LangChain community forum](https://forum.langchain.com)**. No vector database. No embedding pipeline. Just verified answers from the source, cross-checked against real community solutions.

---

## Agent Architecture

The agent is built on **[Deep Agents](https://docs.langchain.com/oss/python/deepagents/overview)** (`create_deep_agent`), which adds planning, multi-step orchestration, and subagent delegation on top of a standard tool-calling loop.

![Agent Architecture](assets/agent-architecture.png)

| Subagent | Responsibility |
| --- | --- |
| `langchain-expert` | LangChain agents, tools, RAG, retrieval, models, middleware |
| `langgraph-expert` | StateGraph, checkpointers, persistence, interrupts, streaming |
| `langsmith-expert` | Observability, tracing, evaluation, datasets, deployment |
| `deepagents-expert` | Deep Agents harness, subagents, planning, filesystem, skills |
| `quality-control` | Post-draft validation — grounding, API accuracy, citations |
| `forum-researcher` | Cross-checks answers against community threads on forum.langchain.com |

All subagents are instructed via [`utils/prompts.py`](langchain_docs_agent/utils/prompts.py) to **never invent APIs**, cite evidence from MCP output, and flag gaps when docs are silent.

---

## Frontend & Backend Architecture

The React UI streams agent output in real-time over **SSE** using `@langchain/langgraph-sdk`. The `useRunStream()` hook multiplexes a single stream into four live UI channels simultaneously.

![Streaming Architecture](assets/streaming-architecture.png)

| Stream mode | What it drives |
| --- | --- |
| `messages/partial` | Streaming assistant text bubble (token by token) |
| `values` | Live TODO checklist panel (planning steps) |
| `events` → `on_tool_start/end` | Tool call steps in the sidebar |
| `events` → `task` tool | Subagent dispatch badges |

In development, Vite proxies `/langgraph/*` → `http://localhost:2024` so the UI and agent server run on separate ports without CORS issues.

---

## Setup & Running

### Prerequisites

| Requirement | Notes |
| --- | --- |
| [uv](https://docs.astral.sh/uv/) | Python deps + `langgraph` CLI |
| Node.js + npm | Vite/React UI in `frontend/` |

You also need an LLM provider API key. Set **`OPENAI_API_KEY`** or **`ANTHROPIC_API_KEY`** depending on which model you choose.

### First-time setup

```bash
# 1. Clone and enter the repo
git clone <repo-url> && cd langchain-docs-agent

# 2. Configure environment
cp .env.example .env
# Edit .env — set DOCS_AGENT_MODEL and the matching API key

# 3. Install Python dependencies
make sync

# 4. Install frontend dependencies
make frontend-install
```

### Run

```bash
# Backend + frontend together (recommended)
make dev-all
```

Then open **http://localhost:5173**.

| Service | URL |
| --- | --- |
| Web UI (Vite) | http://localhost:5173 |
| LangGraph Agent Server | http://localhost:2024 |

**Two-terminal alternative:**

```bash
# Terminal 1 — agent server
make dev

# Terminal 2 — web UI
make frontend-dev
```

### Environment variables

| Variable | Purpose |
| --- | --- |
| `DOCS_AGENT_MODEL` | Model id, e.g. `openai:gpt-4.1` or `anthropic:claude-sonnet-4-20250514` |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | Provider key matching the model prefix |
| `LANGCHAIN_DOCS_MCP_URL` | Optional. Defaults to `https://docs.langchain.com/mcp` |
| `LANGCHAIN_API_KEY` / `LANGCHAIN_TRACING_V2` | Optional LangSmith tracing |

---

## Production Version

- **Production release** — Dockerized deployment with durable Postgres/Redis checkpointing, auth, and rate-limit handling. Will only release a Production Version if enough interest is generated.

## License

See [LICENSE](LICENSE).
