export function GET() {
  return Response.json({ ok: true, revision: process.env.K_REVISION ?? "local" }, {
    headers: { "Cache-Control": "no-store" },
  });
}
