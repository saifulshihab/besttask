import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  // Settings come from web/.env (see .env.example); real environment
  // variables, such as the ones Compose sets, take priority over the file.
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };

  // In development the browser calls /api on the Vite origin and Vite forwards
  // it to the API, so no CORS setup is needed. Inside Compose the API is
  // reachable as http://api:4000.
  const apiTarget = env.API_PROXY_TARGET || "http://localhost:4000";

  return {
    plugins: [
      // Must run before the React plugin so route files are generated first.
      tanstackRouter({ target: "react", autoCodeSplitting: true }),
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    server: {
      port: 3100,
      host: true,
      proxy: {
        "/api": { target: apiTarget, changeOrigin: true },
        // Chat's socket.io connection, WebSocket upgrades included.
        "/socket.io": { target: apiTarget, changeOrigin: true, ws: true },
      },
      // Docker Desktop bind mounts do not deliver file events.
      watch: env.VITE_POLLING === "true" ? { usePolling: true } : undefined,
    },
    preview: { port: 3100 },
  };
});
