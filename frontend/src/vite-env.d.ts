/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Direct LangGraph API base URL; unset means use `/langgraph` (Vite proxy in dev). */
  readonly VITE_LANGGRAPH_API_URL?: string;
  /** Proxy target for dev server (used in `vite.config.ts` only). */
  readonly VITE_LANGGRAPH_PROXY_TARGET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
