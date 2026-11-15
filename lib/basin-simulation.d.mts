export const GRID: number;
export const STEP: number;
export const ROCK_RADIUS: number;
export function noise(x: number, z: number): number;
export function foldTileCoordinate(value: number): number;
export function terrainHeight(x: number, z: number): number;
export class Basin {
  constructor(warmup?: number);
  height: Float32Array;
  water: Float32Array;
  rock: { state: string; x: number; z: number; distance: number; speed: number };
  time: number;
  inflow: number;
  weather: "clear" | "storm" | "cloudburst";
  discharge: [number, number];
  outflow: number;
  upstreamDepth: number;
  openSpillway(): void;
  readonly bypassShare: number;
  release(): void;
  advance(dt?: number): void;
}
