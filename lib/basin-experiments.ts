const landscape = "A photoreal survey of one entire square terrain surface in the Argentine Andes, framed against black with generous margins and a paper-thin edge. Broad, weathered granite shoulders rise behind a glacial valley with natural-scale lenga woodland, golden steppe and snow sheltered in gullies. A narrow turquoise tributary crosses the foreground diagonally, with both banks visible and a distinct ochre boulder with a white diagonal quartz stripe beside it.";
const held = "A locked survey camera looks down from 25 degrees above the terrain plane.";
const orbiting = "The survey camera makes a slow, shallow clockwise arc at constant height and distance, looking down at 25 degrees. The view stays above the ridge and the foreground creek remains visible.";
const rain = "Natural rain falls across the entire basin, from the distant ridge to both banks in the foreground. Both creek banks stay readable through the rain.";
const sunlight = "Late-afternoon sun from the upper left gives long soft shadows. Broken high clouds cast moving shadows. Thin blue-gray atmospheric haze softens the far ridges; the foreground stays crisp.";
const stormLight = "Cool diffuse daylight under layered storm clouds. Wet rock darkens and gains a soft sheen. Distance haze is strongest at the far ridge; the foreground stays clear.";

export const surveyOpening = "Locked high-oblique aerial survey of continuous northern Patagonian terrain. A glacial valley fills the wide image, with the same far granite ridge, a turquoise creek bend in the foreground and a small quartz-striped boulder on the uphill bank. Soft afternoon sunlight and light ridge haze. Only the creek flows. The camera, scale, and landforms remain fixed.";
export const surveyRain = "Light rain sweeps across the entire same valley. Wet rock darkens. Keep the aerial camera, granite ridge, creek bend and quartz-striped boulder fixed.";

export const basinPrompt = (action: string, orbit: boolean, weather: "clear" | "storm" | "cloudburst") => [
  orbit ? orbiting : held,
  landscape,
  weather === "clear" ? sunlight : stormLight,
  weather === "storm" ? rain : weather === "cloudburst" ? `${rain} The rainfall intensifies across the whole tile.` : "",
  action,
].filter(Boolean).join(" ");

export const directions = {
  rock: "The same quartz-striped boulder rolls down its bare slope and lodges in the foreground creek.",
  reroute: "Water backs up at the creek obstruction and spills into the shallow channel on the opposite bank.",
  breach: "A narrow gap opens beside the lodged boulder and impounded water surges through the original creek bed.",
};

export const visualProbes = [
  { name: "Lightning", prompt: "One brief lightning flash illuminates the wet ridge and lenga grove." },
  { name: "Rain on snow", prompt: "Warm rain falls on the existing snowline and meltwater trickles downhill toward the creek." },
  { name: "Debris flow", prompt: "A muddy tongue of water carrying loose stones runs down the steep gully and spreads into a fan at the foot of the slope." },
  { name: "Hail", prompt: "Small white hailstones bounce off the exposed rock beside the creek." },
];

export const evaluationChecks = [
  "Storm visible",
  "Same boulder lodged",
  "Unprompted diversion",
  "Directed diversion",
  "Orbit held",
] as const;
export type EvaluationCheck = (typeof evaluationChecks)[number];

export const judges = [
  { key: "realtime", name: "Real-time engineer", criterion: "Real time", question: "How many chunks elapsed before you saw the change in the same stream?" },
  { key: "creative", name: "Creative director", criterion: "Creativity", question: "Did the 25° diorama make the storm and terrain feel like one place?" },
  { key: "function", name: "Simulation evaluator", criterion: "Functionality", question: "Could you steer an outcome and verify it against the creek and boulder?" },
] as const;
export type JudgeKey = (typeof judges)[number]["key"];
export type Rating = { points?: number; critique?: string };
