# langchain-docs-agent

![Preview](assets/preview.png)

An agent that answers questions about the **LangChain ecosystem** — LangChain, LangGraph, LangSmith, and Deep Agents — grounded in two live sources: the **[official docs MCP](https://docs.langchain.com/mcp)** and the **[LangChain community forum](https://forum.langchain.com)**. No vector database. No embedding pipeline. Just verified answers from the source, cross-checked against real community solutions.

---

## Agent Architecture

```mermaid
%%{init: {"flowchart": {"rankSpacing": 65, "nodeSpacing": 35, "curve": "basis"}}}%%
flowchart TB
    User(["👤 User message"])

    Orch["🧠 create_deep_agent\n── Deep Agents harness ──\nwrite_todos · planning · orchestration"]

    subgraph experts["Domain Experts  ·  tools: LangChain Docs MCP + validate_url"]
        direction LR
        LC["langchain-expert\nAgents · Tools · Middleware"]
        LG["langgraph-expert\nStateGraph · Checkpointers · Streaming"]
        LS["langsmith-expert\nTracing · Evaluation · Deployment"]
        DA["deepagents-expert\nHarness · Subagents · Skills"]
        QC["quality-control\nGrounding · API accuracy · Citations"]
    end

    FR["forum-researcher\nforum.langchain.com cross-check\ntools: Forum Tools + validate_url"]

    MCP{{"LangChain Docs MCP\ndocs.langchain.com/mcp"}}
    FT{{"Forum Tools\nsearch_forum_posts\nget_forum_topic"}}
    VU{{"validate_url\nHTTP link reachability"}}

    User -->|query| Orch
    Orch -->|final answer| User

    Orch ==>|delegate| experts
    Orch ==>|on errors / regressions| FR

    experts -.->|findings + verification report| Orch
    FR -.->|cross-check result| Orch

    experts --> MCP
    Orch --> MCP

    FR --> FT

    experts -.-> VU
    FR -.-> VU
    Orch -.-> VU

    classDef user fill:#0f172a,stroke:#334155,stroke-width:2px,color:#ffffff
    classDef orch fill:#1d4ed8,stroke:#1e40af,stroke-width:2px,color:#ffffff
    classDef sub fill:#eff6ff,stroke:#1d4ed8,stroke-width:1.5px,color:#0f172a
    classDef tool fill:#dcfce7,stroke:#16a34a,stroke-width:1.5px,color:#14532d

    class User user
    class Orch orch
    class LC,LG,LS,DA,QC,FR sub
    class MCP,FT,VU tool
```
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
