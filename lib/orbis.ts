export const ORBIS_MODELS = {
  stable: "reactor/visko-orbis-stable",
  dynamic: "reactor/visko-orbis-dynamic",
} as const;

export type OrbisModel = keyof typeof ORBIS_MODELS;

export function isOrbisModelName(value: unknown): value is (typeof ORBIS_MODELS)[OrbisModel] {
  return value === ORBIS_MODELS.stable || value === ORBIS_MODELS.dynamic;
}

export const ORBIS_TRACKS = [
  { name: "main_video", kind: "video", direction: "recvonly" },
  { name: "main_audio", kind: "audio", direction: "recvonly" },
] as const;

export const DEFAULT_ORBIS_RESOLUTION = "1080p";
export const DOCUMENTED_RESOLUTIONS = [DEFAULT_ORBIS_RESOLUTION, "2k", "4k"];

export type OrbisMessage = {
  type?: string;
  command?: string;
  reason?: string;
  available_resolutions?: string[];
  width?: number;
  height?: number;
  has_image?: boolean;
  image_conditioned?: boolean;
  started?: boolean;
  paused?: boolean;
  fps?: number;
  max_chunks?: number;
  frames_per_chunk?: number;
  resolution?: string;
  delivered?: string | null;
  live_resolution_switching?: boolean;
};

export function unwrapOrbisMessage(raw: unknown): OrbisMessage {
  const envelope = raw as { type?: string; data?: Record<string, unknown> };
  if (envelope?.data && typeof envelope.data === "object") {
    return { ...envelope.data, type: envelope.type } as OrbisMessage;
  }
  return raw as OrbisMessage;
}

export async function requestReactorJwt(model: OrbisModel) {
  const response = await fetch("/api/token?model=" + model, { method: "POST" });
  const result = (await response.json()) as { jwt?: string; error?: string };
  if (!response.ok || !result.jwt) {
    throw new Error(result.error || "Could not create a Reactor token");
  }
  return result.jwt;
}
