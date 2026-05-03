import { Client } from "@langchain/langgraph-sdk";

/**
 * Base URL for LangGraph Agent Server.
 *
 * The SDK uses the `URL` constructor internally, which requires an absolute URL.
 * - Dev (default): resolve `/langgraph` against the current origin so Vite can
 *   proxy it to the Agent Server (`langgraph up` runs on http://localhost:8123).
 * - Direct: set `VITE_LANGGRAPH_API_URL=http://localhost:8123` (requires CORS).
 */
function resolveApiUrl(): string {
  const fromEnv = import.meta.env.VITE_LANGGRAPH_API_URL?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  // Build an absolute URL; Vite proxies /langgraph/* → Agent Server.
  return `${window.location.origin}/langgraph`;
}

export const langgraphClient = new Client({
  apiUrl: resolveApiUrl(),
  apiKey: null,
});
