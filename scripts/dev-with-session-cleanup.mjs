import { promises as fs } from "node:fs";
import path from "node:path";
import { loadEnvFile } from "node:process";
import { createServer } from "vite";

const projectDirectory = process.cwd();
const registryPath = path.join(projectDirectory, ".reactor-dev-sessions.json");
const reactorApiUrl = "https://api.reactor.inc";
const orbisModels = new Set(["reactor/visko-orbis-stable", "reactor/visko-orbis-dynamic"]);

process.env.NODE_ENV = "development";
try {
  loadEnvFile(".env.local");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

async function readRegistry() {
  try {
    const contents = await fs.readFile(registryPath, "utf8");
    const parsed = JSON.parse(contents);
    if (
      !Array.isArray(parsed.sessions) ||
      !parsed.sessions.every(
        (session) =>
          session &&
          typeof session.sessionId === "string" &&
          orbisModels.has(session.model) &&
          typeof session.registeredAt === "string",
      )
    ) {
      throw new Error("session registry has an invalid format");
    }
    return parsed.sessions;
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function writeRegistry(sessions) {
  const temporaryPath = `${registryPath}.${process.pid}.tmp`;
  await fs.writeFile(
    temporaryPath,
    `${JSON.stringify({ sessions }, null, 2)}\n`,
    { mode: 0o600 },
  );
  await fs.rename(temporaryPath, registryPath);
}

async function cleanupTrackedSessions(reason) {
  const sessions = await readRegistry();
  if (sessions.length === 0) return;

  const apiKey = process.env.REACTOR_API_KEY;
  if (!apiKey) {
    throw new Error(
      `Cannot clean ${sessions.length} tracked Reactor session(s): REACTOR_API_KEY is missing`,
    );
  }

  console.log(
    `[reactor-cleanup] ${reason}: deleting ${sessions.length} tracked session(s)`,
  );
  const remaining = [];
  for (const session of sessions) {
    try {
      const response = await fetch(
        `${reactorApiUrl}/sessions/${encodeURIComponent(session.sessionId)}`,
        {
          method: "DELETE",
          headers: { "Reactor-API-Key": apiKey },
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (response.ok || response.status === 404) {
        console.log(`[reactor-cleanup] deleted ${session.sessionId}`);
      } else {
        console.error(
          `[reactor-cleanup] ${session.sessionId}: Reactor returned ${response.status}`,
        );
        remaining.push(session);
      }
    } catch (error) {
      console.error(
        `[reactor-cleanup] ${session.sessionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      remaining.push(session);
    }
  }

  await writeRegistry(remaining);
  if (remaining.length > 0) {
    throw new Error(
      `Could not clean ${remaining.length} tracked Reactor session(s); refusing to start another dev server`,
    );
  }
}

let ready = false;
const server = await createServer({
  mode: "development",
  plugins: [{
    name: "patagonia-session-startup",
    enforce: "pre",
    configureServer(vite) {
      vite.middlewares.use((request, response, next) => {
        if (!ready && request.url?.startsWith("/api/")) {
          response.writeHead(503, { "Content-Type": "application/json" });
          response.end(JSON.stringify({ error: "Reactor session cleanup in progress" }));
          return;
        }
        next();
      });
    },
  }],
});
try {
  // Reserve the development port before sweeping this checkout's sessions.
  await server.listen();
  await cleanupTrackedSessions("startup sweep");
  ready = true;
} catch (error) {
  console.error(
    `[reactor-cleanup] ${error instanceof Error ? error.message : String(error)}`,
  );
  await server.close();
  process.exit(1);
}
server.printUrls();

let shuttingDown = false;

async function shutdown(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;
  ready = false;

  try {
    await server.close();
    await cleanupTrackedSessions("shutdown sweep");
  } catch (error) {
    console.error(
      `[reactor-cleanup] ${error instanceof Error ? error.message : String(error)}`,
    );
    exitCode = 1;
  }
  process.exit(exitCode);
}

process.once("SIGINT", () => void shutdown(130));
process.once("SIGTERM", () => void shutdown(143));
