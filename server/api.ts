import { Hono } from "hono";
import { GET as health } from "./routes/health.js";
import { POST as nanoBanana } from "./routes/nano-banana.js";
import { POST as orbisPrompt } from "./routes/orbis-prompt.js";
import { POST as cleanup } from "./routes/session-cleanup.js";
import {
  DELETE as unregister,
  POST as register,
} from "./routes/session-registry.js";
import { POST as sunburst } from "./routes/sunburst.js";
import { POST as token } from "./routes/token.js";

export const api = new Hono().basePath("/api");

api.get("/health", () => health());
api.post("/token", ({ req }) => token(req.raw));
api.post("/session-cleanup", ({ req }) => cleanup(req.raw));
api.post("/session-registry", ({ req }) => register(req.raw));
api.delete("/session-registry", ({ req }) => unregister(req.raw));
api.post("/nano-banana", ({ req }) => nanoBanana(req.raw));
api.post("/orbis-prompt", ({ req }) => orbisPrompt(req.raw));
api.post("/sunburst", () => sunburst());
api.all("*", (context) => context.json({ error: "Not found" }, 404));
