import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // Use 127.0.0.1 instead of localhost — on Node 18+ `localhost` resolves to
  // ::1 (IPv6) first, but `langgraph dev` only binds to 127.0.0.1 (IPv4).
  const proxyTarget =
    env.VITE_LANGGRAPH_PROXY_TARGET || "http://127.0.0.1:2024";

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
    server: {
      port: 5173,
      proxy: {
        "/langgraph": {
          target: proxyTarget,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/langgraph/, ""),
        },
      },
    },
  };
});
