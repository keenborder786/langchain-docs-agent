/**
 * Normalize LangGraph thread state `values` into chat bubbles.
 * Deep Agents graphs expose `messages` as LangChain-serialized messages.
 */

export type ChatRole = "user" | "assistant" | "tool" | "system" | "unknown";

export interface ChatTurn {
  id: string;
  role: ChatRole;
  content: string;
  raw?: unknown;
}

/** Same guard as useThreadRuns — detect serialized Anthropic tool_use blocks. */
function looksLikeToolUseJson(s: string): boolean {
  const t = s.trim();
  if (!t.startsWith("{") && !t.startsWith("[")) return false;
  return (
    /"type"\s*:\s*"tool_use"/.test(t) ||
    /"partial_json"/.test(t) ||
    /"tool_use_id"/.test(t) ||
    /toolu_[a-zA-Z0-9]+/.test(t)
  );
}

/**
 * Extract only human-readable text from a message's content field.
 * Tool-use blocks, tool-result blocks, and stringified tool_use JSON are
 * silently dropped so raw JSON never appears in the chat.
 */
function messageContentToString(content: unknown): string {
  if (typeof content === "string") {
    return looksLikeToolUseJson(content) ? "" : content;
  }
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === "string") {
          return looksLikeToolUseJson(block) ? "" : block;
        }
        if (!block || typeof block !== "object") return "";
        const b = block as Record<string, unknown>;
        if (b.type === "text" && typeof b.text === "string") return b.text;
        return "";
      })
      .join("")
      .trim();
  }
  return "";
}

function roleFromType(type: string): ChatRole {
  switch (type) {
    case "human":
      return "user";
    case "ai":
    case "assistant":
      return "assistant";
    case "tool":
      return "tool";
    case "system":
      return "system";
    default:
      return "unknown";
  }
}

export function messagesFromStateValues(values: unknown): ChatTurn[] {
  if (!values || typeof values !== "object") return [];
  const msgs = (values as { messages?: unknown }).messages;
  if (!Array.isArray(msgs)) return [];

  const out: ChatTurn[] = [];
  let i = 0;
  for (const m of msgs) {
    if (!m || typeof m !== "object") {
      i++;
      continue;
    }
    const obj = m as Record<string, unknown>;
    const type = typeof obj.type === "string" ? obj.type : "unknown";
    const role = roleFromType(type);

    if (role === "tool" || role === "system" || role === "unknown") {
      i++;
      continue;
    }

    const content = messageContentToString(obj.content);

    // Skip assistant messages with no human-readable text (pure tool calls)
    if (role === "assistant" && !content) {
      i++;
      continue;
    }

    const id = typeof obj.id === "string" ? obj.id : `msg-${i}-${type}`;
    out.push({ id, role, content, raw: m });
    i++;
  }
  return out;
}
