# langchain-docs-agent

![Preview](assets/preview.png)

An agent that answers questions about the **LangChain ecosystem** — LangChain, LangGraph, LangSmith, and Deep Agents — grounded in two live sources: the **[official docs MCP](https://docs.langchain.com/mcp)** and the **[LangChain community forum](https://forum.langchain.com)**. No vector database. No embedding pipeline. Just verified answers from the source, cross-checked against real community solutions.

---

## Agent Architecture

The agent is built on **[Deep Agents](https://docs.langchain.com/oss/python/deepagents/overview)** (`create_deep_agent`), which adds planning, multi-step orchestration, and subagent delegation on top of a standard tool-calling loop.

```mermaid
%%{init: {'flowchart': {'htmlLabels': true, 'curve': 'basis', 'nodeSpacing': 55, 'rankSpacing': 70}}}%%
flowchart TB
    User(["<b>User message</b>"])

    Orch("<b>create_deep_agent</b><br/><i>Deep Agents harness</i><br/><sub>write_todos · virtual filesystem · multi-step orchestration</sub>")

    LC("<b>langchain-expert</b><br/><sub>Agents · Tools · RAG · Middleware</sub>")
    LG("<b>langgraph-expert</b><br/><sub>StateGraph · Checkpointers · Streaming</sub>")
    LS("<b>langsmith-expert</b><br/><sub>Tracing · Evaluation · Deployment</sub>")
    DA("<b>deepagents-expert</b><br/><sub>Harness · Subagents · Skills</sub>")
    QC("<b>quality-control</b><br/><sub>Grounding · API accuracy · Citations</sub>")
    FR("<b>forum-researcher</b><br/><sub>Community cross-check</sub>")

    MCP{{"<b>LangChain Docs MCP</b><br/><sub>docs.langchain.com/mcp</sub>"}}
    FT{{"<b>Forum Tools</b><br/><sub>search_forum_posts · get_forum_topic</sub>"}}
    VU{{"<b>validate_url</b><br/><sub>link reachability check</sub>"}}

    User <==>|query / final answer| Orch

    Orch ==>|delegate| LC
    Orch ==>|delegate| LG
    Orch ==>|delegate| LS
    Orch ==>|delegate| DA
    Orch ==>|after draft| QC
    Orch ==>|on errors / regressions| FR

    LC -.->|findings| Orch
    LG -.->|findings| Orch
    LS -.->|findings| Orch
    DA -.->|findings| Orch
    QC -.->|verification| Orch
    FR -.->|cross-check| Orch

    LC --> MCP
    LG --> MCP
    LS --> MCP
    DA --> MCP
    QC --> MCP
    Orch --> MCP

    FR --> FT

    LC -.-> VU
    LG -.-> VU
    LS -.-> VU
    DA -.-> VU
    QC -.-> VU
    FR -.-> VU
    Orch -.-> VU

    classDef user fill:#0f172a,stroke:#0f172a,stroke-width:2px,color:#ffffff
    classDef orch fill:#1d4ed8,stroke:#1e3a8a,stroke-width:2px,color:#ffffff
    classDef sub fill:#eff6ff,stroke:#1d4ed8,stroke-width:1.5px,color:#0f172a
    classDef tool fill:#dcfce7,stroke:#15803d,stroke-width:1.5px,color:#14532d

    class User user
    class Orch orch
    class LC,LG,LS,DA,QC,FR sub
    class MCP,FT,VU tool

    linkStyle default stroke:#94a3b8,stroke-width:1.2px
```

Wiring (verified against [`agent.py`](langchain_docs_agent/agent.py) and [`utils/subagents.py`](langchain_docs_agent/utils/subagents.py)):

| Node | Tools it actually has |
| --- | --- |
| `create_deep_agent` (orchestrator) | Built-in `write_todos` + virtual filesystem + task delegation, **plus** `LangChain Docs MCP` and `validate_url` |
| `langchain-expert`, `langgraph-expert`, `langsmith-expert`, `deepagents-expert`, `quality-control` | `LangChain Docs MCP` + `validate_url` |
| `forum-researcher` | `Forum Tools` (`search_forum_posts`, `get_forum_topic`) + `validate_url` — **does not touch the docs MCP** |

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

The React SPA streams agent output in real-time over **SSE** using `@langchain/langgraph-sdk`. Four custom hooks orchestrate the full lifecycle; a `BroadcastChannel`-based layer keeps every open browser tab in perfect sync — no WebSocket server required.

![Streaming Architecture](assets/streaming-architecture.png)

| Hook | Responsibility |
| --- | --- |
| `useThreadList` | Fetch + refresh the conversation list |
| `useThreadState` | Load persisted thread history via `threads.getState` |
| `useThreadRuns` | Own the live SSE stream; multiplex `messages-tuple`, `updates`, `events`, `tasks`, `debug`, `values` into streaming text + agent steps |
| `useCrossTabSync` | BroadcastChannel relay — `run_progress`, `user_pending`, `thread_list_changed`, `run_started/finished` keep all tabs identical in real-time |

The **LangGraph Agent Server** runs as a Docker container via `langgraph up` on `:8123`. Vite proxies `/langgraph/*` to it in development so the UI and agent server run on separate ports without CORS issues.

---

## Setup & Running

### Prerequisites

| Requirement | Notes |
| --- | --- |
| [uv](https://docs.astral.sh/uv/) | Python deps + `langgraph` CLI |
| Node.js + npm | Vite/React UI in `frontend/` |
| [Docker](https://docs.docker.com/get-docker/) | Required by `langgraph up` to run the agent server |

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
make up-all
```

Then open **http://localhost:5173**.

| Service | URL |
| --- | --- |
| Web UI (Vite) | http://localhost:5173 |
| LangGraph Agent Server | http://localhost:8123 |

**Two-terminal alternative:**

```bash
# Terminal 1 — agent server (Docker)
make up

# Terminal 2 — web UI
make frontend-dev
```

### Environment variables

| Variable | Purpose |
| --- | --- |
| `DOCS_AGENT_MODEL` | Model id, e.g. `anthropic:claude-sonnet-4-6` |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | Provider key matching the model prefix |
| `LANGCHAIN_DOCS_MCP_URL` | Optional. Defaults to `https://docs.langchain.com/mcp` |
| `LANGCHAIN_API_KEY` / `LANGCHAIN_TRACING_V2` | Optional LangSmith tracing |

---

## Roadmap

| Status | Item | Description |
| --- | --- | --- |
| 🔜 | **Animated concept explainers** | Auto-generate step-by-step SVG/canvas animations for complex topics (e.g. how LangGraph checkpointing works, how a StateGraph executes), rendered inline in the chat response |
| 🔜 | **Video tutorial generation** | Convert agent answers into narrated screencasts — slide deck + voiceover — exported as MP4, covering code walkthroughs and multi-step workflows |
| 🔜 | **Audio tutorials** | Text-to-speech synthesis of answers so users can listen to documentation explanations hands-free; downloadable as MP3 with chapter markers |


## License

See [LICENSE](LICENSE).
