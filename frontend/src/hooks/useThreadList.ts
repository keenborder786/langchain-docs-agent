import { useCallback, useEffect, useState } from "react";
import type { Thread } from "@langchain/langgraph-sdk";
import { langgraphClient } from "@/lib/langgraphClient";

export function useThreadList(refreshKey: number) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await langgraphClient.threads.search({
        limit: 50,
        sortBy: "updated_at",
        sortOrder: "desc",
      });
      setThreads(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setThreads([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  return { threads, loading, error, refresh };
}
