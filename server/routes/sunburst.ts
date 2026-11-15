import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function POST() {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key || key.startsWith("replace_with_")) {
    return Response.json({ error: "Add OPENAI_API_KEY to .env.local to use Sunburst." }, { status: 503 });
  }

  const start = performance.now();
  try {
    const imageDirectory = process.env.NODE_ENV === "development" ? "public" : "dist/client";
    const image = await readFile(join(process.cwd(), imageDirectory, "patagonia-valley-reference.jpg"));
    const form = new FormData();
    form.set("model", "gpt-image-2.6-sunburst");
    form.set("image", new Blob([new Uint8Array(image)], { type: "image/jpeg" }), "patagonia.jpg");
    form.set("prompt", "Refine this northern Argentine Patagonia opening frame as a real landscape viewed from a perspective camera at a 25-degree downward angle. Keep the terrain tile boundary and black backdrop. Preserve camera placement, view extent, the ochre boulder with its white diagonal quartz vein, the bend and dry side channel, and all prominent granite peaks. Resolve wind-shaped lenga forest, angular scree, shaded high snow gullies and gravel bars in the braided meltwater. Subtle realistic surface detail and the same clear daylight. No text.");
    form.set("quality", "medium");
    form.set("complexity", "medium");
    form.set("size", "1536x1024");
    form.set("output_format", "jpeg");

    const result = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: AbortSignal.timeout(160_000),
      cache: "no-store",
    });
    const elapsedMs = Math.round(performance.now() - start);
    console.info(JSON.stringify({ event: "sunburst_request", status: result.status, elapsedMs }));
    if (!result.ok) {
      return Response.json({ error: `Sunburst returned HTTP ${result.status}. Check API key access and credits.` }, { status: 502 });
    }
    const answer = await result.json() as { data?: Array<{ b64_json?: string }> };
    const base64 = answer.data?.[0]?.b64_json;
    if (!base64) return Response.json({ error: "Sunburst returned no image." }, { status: 502 });
    return new Response(new Uint8Array(Buffer.from(base64, "base64")), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.warn(JSON.stringify({ event: "sunburst_error", category: error instanceof Error ? error.name : "UnknownError" }));
    return Response.json({ error: "Sunburst could not complete the image edit." }, { status: 502 });
  }
}
