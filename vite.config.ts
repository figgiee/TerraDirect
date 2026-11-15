import { fileURLToPath } from "node:url";
import { getRequestListener } from "@hono/node-server";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { api } from "./server/api.ts";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "patagonia-api",
      configureServer(server) {
        const listener = getRequestListener(api.fetch, {
          overrideGlobalObjects: false,
        });
        server.middlewares.use((request, response, next) => {
          const pathname = request.url?.split("?", 1)[0];
          if (pathname === "/api" || pathname?.startsWith("/api/")) {
            void listener(request, response).catch(next);
            return;
          }
          next();
        });
      },
    },
  ],
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  optimizeDeps: {
    // The SDK loads its wasm wrapper relative to its own module at runtime.
    exclude: ["@reactor-team/js-sdk"],
    include: ["@reactor-team/js-sdk > awaitqueue"],
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    fs: {
      deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/.reactor-dev-sessions.json*", "**/server/**"],
    },
  },
  build: {
    outDir: "dist/client",
  },
});
