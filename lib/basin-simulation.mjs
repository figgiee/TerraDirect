// The two channels share an inlet and outlet. The higher side channel activates
// when water backs up behind the boulder at the narrow section of the main bed.
export const GRID = 129
export const STEP = 2 / (GRID - 1)
export const ROCK_RADIUS = 0.092
const OUTLET = GRID - 1
const START_X = -0.54
const FALL_Z = 0.20
const STOP_X = -0.075
const FALL_DISTANCE = STOP_X - START_X
const STEP_TIME = 1 / 90
const DEFAULT_SOURCE = 0.050
const STORM_SOURCE = 0.075
const CLOUDBURST_SOURCE = 0.16
const STORM_RAIN = 0.0000075
const CLOUDBURST_RAIN = 0.000018

const clamp = (x, low, high) => Math.max(low, Math.min(high, x))
const mix = (a, b, t) => a + (b - a) * t
function ease(a, b, value) {
  const t = clamp((value - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
function hash(x, z) {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453
  return n - Math.floor(n)
}
export function noise(x, z) {
  const i = Math.floor(x), j = Math.floor(z)
  const a = ease(0, 1, x - i), b = ease(0, 1, z - j)
  return mix(mix(hash(i, j), hash(i + 1, j), a), mix(hash(i, j + 1), hash(i + 1, j + 1), a), b)
}

export function creekX(z) {
  return -0.075 + 0.11 * Math.sin((z - FALL_Z) * 5)
}
export function bypassX(z) {
  return creekX(z) + 0.26 * ease(-0.49, -0.04, z) * (1 - ease(0.50, 0.88, z))
}

export function foldTileCoordinate(value) {
  const remainder = ((value + 1) % 4 + 4) % 4;
  return remainder <= 2 ? remainder - 1 : 3 - remainder;
}

function softenEdge(value) {
  const inset = 0.047;
  const distance = 1 - Math.abs(value);
  if (distance < 0 || distance >= inset) return value;
  const t = distance / inset;
  return Math.sign(value) * (1 - inset * t * t * (2 - t));
}

export function terrainHeight(x, z) {
  x = softenEdge(x);
  z = softenEdge(z);
  const distance = Math.abs(x - creekX(z))
  const hills = noise(x * 5.4 + noise(x * 2, z * 2), z * 5.4)
  const detail = noise(x * 24 + 3, z * 24) * 0.018 + noise(x * 57, z * 57) * 0.005
  const massif = 1 - ease(0.05, 1, Math.hypot((x + 0.48) / 0.74, (z + 0.57) / 0.71))
  const rearRidge = 1 - ease(0.03, 1, Math.hypot((x - 0.21) / 0.78, (z + 0.8) / 0.55))
  const shoulder = 1 - ease(0.03, 1, Math.hypot((x - 0.69) / 0.71, (z + 0.19) / 0.81))
  const fallSlope = 1 - ease(0.03, 1, Math.hypot((x + 0.56) / 0.66, (z - 0.1) / 0.64))
  const mountain = (massif * 0.42 + rearRidge * 0.32 + shoulder * 0.35 + fallSlope * 0.29)
    * (0.9 + hills * 0.18) + (hills * 0.055 + detail) * ease(0.14, 0.62, distance)
  const bed = 0.065 - z * 0.045
  const channel = ease(0.029, 0.074, distance)
  const side = Math.abs(x - bypassX(z))
  const sideChannel = ease(0.034, 0.078, side)
  const saddle = 0.019 * ease(-0.49, -0.26, z) * (1 - ease(0.57, 0.88, z))
  const bank = 0.065 + mountain * ease(0.09, 0.52, distance)
  const merge = Math.min(channel * bank, saddle + sideChannel * bank)
  return bed + merge
}

export class Basin {
  constructor(warmup = 4000) {
    const size = GRID * GRID
    this.height = new Float32Array(size)
    this.water = new Float32Array(size)
    this.delta = new Float32Array(size)
    this.blocked = new Uint8Array(size)
    this.discharge = [0, 0]
    this.time = 0
    this.weather = "clear"
    this.inflow = 1
    this.outflow = 0
    this.upstreamDepth = 0
    this.rock = { state: 'perched', x: START_X, z: FALL_Z, distance: 0, speed: 0 }
    for (let row = 0; row < GRID; row++) {
      for (let col = 0; col < GRID; col++) {
        this.height[row * GRID + col] = terrainHeight(col * STEP - 1, row * STEP - 1)
      }
    }
    for (let frame = 0; frame < warmup; frame++) this.stepWater()
  }

  release() {
    if (this.rock.state === 'perched') this.rock.state = 'rolling'
  }

  advance(dt = STEP_TIME) {
    this.time += dt
    const rock = this.rock
    if (rock.state === 'rolling') {
      // Gravity along a fixed fall line, with friction and a bank contact at
      // the end of the fall line. This is a constrained motion model.
      const grade = Math.max(0.1, (terrainHeight(rock.x, rock.z) - terrainHeight(rock.x + 0.024, rock.z)) / 0.024)
      rock.speed = Math.min(0.45, Math.max(0.09, rock.speed + (grade * 1.25 - rock.speed * 1.6) * dt))
      rock.distance = Math.min(FALL_DISTANCE, rock.distance + rock.speed * dt)
      rock.x = START_X + rock.distance
      if (rock.distance >= FALL_DISTANCE) {
        rock.speed = 0
        rock.state = 'lodged'
        this.seatRock()
      }
    }
    this.stepWater()
  }

  seatRock() {
    const { x, z } = this.rock
    const center = Math.round((z + 0.88) / STEP) * GRID + Math.round((x + 1) / STEP)
    let displaced = 0
    for (let index = 0; index < this.water.length; index++) {
      const px = (index % GRID) * STEP - 1, pz = Math.floor(index / GRID) * STEP - 1
      if (Math.hypot(px - x, pz - z) < ROCK_RADIUS * 0.94) {
        this.blocked[index] = 1
        displaced += this.water[index]
        this.water[index] = 0
      }
    }
    this.water[center] += displaced
  }

  openSpillway() {
    if (this.rock.state !== "lodged" || this.spillway) return;
    // Reopen a narrow path next to the boulder while its body stays lodged.
    this.spillway = true;
    for (let i = 0; i < this.blocked.length; i++) {
      const x = (i % GRID) * STEP - 1;
      if (!this.blocked[i]) continue;
      const z = Math.floor(i / GRID) * STEP - 1;
      const path = creekX(z) + 0.025;
      if (Math.abs(x - path) < 0.032) this.blocked[i] = 0;
    }
  }

  stepWater() {
    const { water, height, delta, blocked, discharge } = this
    const inlet = Math.round(1.034 / STEP)
    const supply = this.weather === "cloudburst" ? CLOUDBURST_SOURCE : this.weather === "storm" ? STORM_SOURCE : DEFAULT_SOURCE
    const source = supply * this.inflow * STEP_TIME
    for (let col = inlet - 2; col <= inlet + 2; col++) water[col] += source
    const rainfall = this.weather === "cloudburst" ? CLOUDBURST_RAIN : this.weather === "storm" ? STORM_RAIN : 0
    if (rainfall) {
      const depth = rainfall * STEP_TIME
      for (let row = 0; row < GRID; row++) {
        for (let col = 1; col < GRID - 1; col++) {
          const index = row * GRID + col
          if (!blocked[index]) water[index] += depth
        }
      }
    }
    delta.fill(0)
    const gate = Math.round(1.34 / STEP)
    const gateCenter = creekX(gate * STEP - 1)
    let main = 0, side = 0, outflow = 0
    for (let row = 0; row < GRID; row++) {
      for (let col = 1; col < GRID - 1; col++) {
        const index = row * GRID + col
        const depth = water[index]
        if (depth < 0.000002 || blocked[index]) continue
        if (row === OUTLET) {
          outflow += depth * 0.45
          delta[index] -= depth * 0.45
          continue
        }
        const surface = height[index] + depth
        let left = col === 1 || blocked[index - 1] ? 0 : Math.max(0, surface - height[index - 1] - water[index - 1])
        let right = col === GRID - 2 || blocked[index + 1] ? 0 : Math.max(0, surface - height[index + 1] - water[index + 1])
        let back = row === 0 || blocked[index - GRID] ? 0 : Math.max(0, surface - height[index - GRID] - water[index - GRID])
        let forward = blocked[index + GRID] ? 0 : Math.max(0, surface - height[index + GRID] - water[index + GRID])
        const total = left + right + back + forward
        if (total <= 0) continue
        const fraction = Math.min(0.30, depth / total)
        left *= fraction
        right *= fraction
        back *= fraction
        forward *= fraction
        delta[index] -= left + right + back + forward
        delta[index - 1] += left
        delta[index + 1] += right
        if (row > 0) delta[index - GRID] += back
        delta[index + GRID] += forward
        if (row === gate) {
          if (col * STEP - 1 < gateCenter + 0.13) main += forward
          else side += forward
        }
      }
    }
    for (let i = 0; i < water.length; i++) water[i] = Math.max(0, water[i] + delta[i])
    this.outflow = mix(this.outflow, outflow, 0.075)
    const poolZ = FALL_Z - 0.135
    const pool = Math.round((1 + poolZ) / STEP) * GRID + Math.round((1 + creekX(poolZ)) / STEP)
    this.upstreamDepth = water[pool]
    discharge[0] = mix(discharge[0], main, 0.08)
    discharge[1] = mix(discharge[1], side, 0.08)
  }

  get bypassShare() {
    const total = this.discharge[0] + this.discharge[1]
    return total > 0.00001 ? this.discharge[1] / total : 0
  }
}
