/** Must match `graphs` key in repo `langgraph.json`. */
export const GRAPH_ASSISTANT_ID = "docs_agent";

export const DEFAULT_CONVERSATION_TITLE = "New chat";

/** Stream modes for Cursor-style trace + assistant tokens. */
export const DEFAULT_STREAM_MODES = [
  "messages-tuple",
  "updates",
  "events",
  "tasks",
  "debug",
  "values",
] as const;
