import { isOrbisModelName } from "../../lib/orbis.js";
import {
  registerReactorSession,
  unregisterReactorSession,
} from "../reactor-session-registry.js";

const REACTOR_API_URL = "https://api.reactor.inc";

type RegistryRequest = {
  sessionId?: unknown;
  jwt?: unknown;
};

function unavailableInProduction() {
  return Response.json({ error: "Not found" }, { status: 404 });
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return unavailableInProduction();
  }

  let body: RegistryRequest;
  try {
    body = (await request.json()) as RegistryRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { sessionId, jwt } = body;
  if (
    typeof sessionId !== "string" ||
    !sessionId ||
    sessionId.length > 200 ||
    typeof jwt !== "string" ||
    !jwt ||
    jwt.length > 16_384
  ) {
    return Response.json(
      { error: "A valid sessionId and JWT are required" },
      { status: 400 },
    );
  }

  let response: Response;
  try {
    response = await fetch(
      `${REACTOR_API_URL}/sessions/${encodeURIComponent(sessionId)}`,
      {
        headers: { Authorization: `Bearer ${jwt}` },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      },
    );
  } catch {
    return Response.json(
      { error: "Could not verify Reactor session" },
      { status: 502 },
    );
  }

  if (!response.ok) {
    return Response.json(
      { error: "Reactor session verification failed" },
      { status: response.status },
    );
  }

  const session = (await response.json()) as {
    model?: string | { name?: string };
    closed?: boolean;
    state?: string;
  };
  const sessionModel =
    typeof session.model === "string" ? session.model : session.model?.name;
  if (
    !isOrbisModelName(sessionModel) ||
    session.closed === true ||
    session.state?.toUpperCase() === "CLOSED"
  ) {
    return Response.json(
      { error: "The session is closed or uses an unsupported model" },
      { status: 400 },
    );
  }

  await registerReactorSession({
    sessionId,
    model: sessionModel,
    registeredAt: new Date().toISOString(),
  });
  return new Response(null, { status: 204 });
}

export async function DELETE(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return unavailableInProduction();
  }

  let body: RegistryRequest;
  try {
    body = (await request.json()) as RegistryRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.sessionId !== "string" || !body.sessionId) {
    return Response.json(
      { error: "A sessionId is required" },
      { status: 400 },
    );
  }

  await unregisterReactorSession(body.sessionId);
  return new Response(null, { status: 204 });
}
