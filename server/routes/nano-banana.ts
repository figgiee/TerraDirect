import { GoogleGenAI } from "@google/genai";

import {
  NANO_BANANA_MODEL,
  NANO_BANANA_PROMPT,
} from "../../lib/nano-banana.js";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "GEMINI_API_KEY is not configured" },
      { status: 500 },
    );
  }

  const formData = await request.formData();
  const image = formData.get("image");
  if (!(image instanceof File) || !image.type.startsWith("image/")) {
    return Response.json({ error: "Choose a valid image file" }, { status: 400 });
  }
  if (image.size > MAX_IMAGE_BYTES) {
    return Response.json(
      { error: "The image must be 10 MB or smaller" },
      { status: 413 },
    );
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: NANO_BANANA_MODEL,
      contents: [
        { text: NANO_BANANA_PROMPT },
        {
          inlineData: {
            mimeType: image.type,
            data: Buffer.from(await image.arrayBuffer()).toString("base64"),
          },
        },
      ],
    });

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const output = parts.find((part) => part.inlineData?.data)?.inlineData;
    if (!output?.data) {
      return Response.json(
        { error: "Nano Banana returned no edited image" },
        { status: 502 },
      );
    }

    return new Response(Buffer.from(output.data, "base64"), {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Content-Type": output.mimeType || "image/png",
      },
    });
  } catch (caught) {
    console.error("Nano Banana image edit failed", caught);
    return Response.json(
      { error: "Nano Banana could not edit the image" },
      { status: 502 },
    );
  }
}
