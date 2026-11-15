import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { api } from "./api.js";

const root = fileURLToPath(new URL("../../client/", import.meta.url));
const app = new Hono({ strict: false });

app.route("/", api);
app.use("/assets/*", serveStatic({
  root,
  onFound: (_, context) => {
    const assetCache = context.req.path.startsWith("/assets/wasm/")
      ? "no-cache"
      : "public, max-age=31536000, immutable";
    context.header("Cache-Control", assetCache);
  },
}));
app.get("/starter", serveStatic({ root, path: "index.html" }));
app.use("*", serveStatic({ root }));

serve({
  fetch: app.fetch,
  hostname: process.env.HOSTNAME ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 3000),
  overrideGlobalObjects: false,
}, ({ address, port }) => {
  console.info(`Patagonia Live is listening on http://${address}:${port}`);
});
