import { ORBIS_MODELS } from "../../lib/orbis.js";

const REACTOR_API_URL = "https://api.reactor.inc";

export async function POST(request: Request) {
  const model = new URL(request.url).searchParams.get("model") ?? "stable";
  if (model !== "stable" && model !== "dynamic") {
    return Response.json({ error: "Choose Orbis Stable or Dynamic." }, { status: 400 });
  }
  const apiKey = process.env.REACTOR_API_KEY?.trim();
  if (!apiKey || apiKey.startsWith("replace_with_")) {
    return Response.json(
      { error: "REACTOR_API_KEY is not configured" },
      { status: 503 },
    );
  }

  const start = performance.now();
  let response: Response;
  try {
    response = await fetch(`${REACTOR_API_URL}/tokens`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Reactor-API-Key": apiKey,
      },
      body: JSON.stringify({
        expires_after: 3600,
        authorization_details: [
          {
            type: "session",
            resources: { models: { match: [ORBIS_MODELS[model]] } },
            constraints: { max_sessions: 1, max_session_duration_seconds: 300 },
          },
        ],
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
  } catch (error) {
    console.warn(JSON.stringify({ event: "reactor_token_error", category: error instanceof Error ? error.name : "UnknownError", elapsedMs: Math.round(performance.now() - start) }));
    return Response.json({ error: "Could not reach Reactor to create a session token." }, { status: 502 });
  }
  console.info(JSON.stringify({ event: "reactor_token", status: response.status, elapsedMs: Math.round(performance.now() - start), revision: process.env.K_REVISION ?? "local" }));
  if (!response.ok) {
    return Response.json(
      { error: `Reactor token request failed (${response.status}). Check your model access and account balance.` },
      { status: response.status },
    );
  }

  const result = await response.json().catch(() => null) as { jwt?: string } | null;
  if (!result?.jwt) {
    return Response.json({ error: "Reactor returned no JWT" }, { status: 502 });
  }

  return Response.json(
    { jwt: result.jwt },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
