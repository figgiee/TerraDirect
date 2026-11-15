import assert from "node:assert/strict";
import test from "node:test";
import { Basin, GRID, STEP, foldTileCoordinate, terrainHeight } from "../lib/basin-simulation.mjs";

test("the lodged boulder diverts storm runoff into the side channel", () => {
  const control = new Basin();
  const obstructed = new Basin();
  control.weather = obstructed.weather = "storm";
  obstructed.release();
  for (let tick = 0; tick < 1_100; tick++) {
    control.advance();
    obstructed.advance();
  }
  assert.equal(control.rock.state, "perched");
  assert.equal(obstructed.rock.state, "lodged");
  assert.ok(control.bypassShare < 0.25);
  assert.ok(obstructed.bypassShare > 0.9);
  assert.ok(obstructed.discharge[1] > control.discharge[1]);
  assert.ok(obstructed.water.every((depth) => Number.isFinite(depth) && depth >= 0));
  const location = { x: obstructed.rock.x, z: obstructed.rock.z };
  obstructed.release();
  obstructed.advance();
  assert.deepEqual({ x: obstructed.rock.x, z: obstructed.rock.z }, location);
});

test("mirrored tiles meet on both axes with continuous height and a flat cross-edge slope", () => {
  const worldHeight = (x, z) => terrainHeight(foldTileCoordinate(x), foldTileCoordinate(z));
  const epsilon = 1e-5;
  for (let point = 0; point < GRID; point++) {
    const position = point * STEP - 1;
    for (const edge of [-1, 1]) {
      const left = worldHeight(edge - epsilon, position);
      const right = worldHeight(edge + epsilon, position);
      assert.ok(Math.abs(left - right) < 1e-10);
      assert.ok(Math.abs(left - worldHeight(edge, position)) / epsilon < 0.02);
      const near = worldHeight(position, edge - epsilon);
      const far = worldHeight(position, edge + epsilon);
      assert.ok(Math.abs(near - far) < 1e-10);
      assert.ok(Math.abs(near - worldHeight(position, edge)) / epsilon < 0.02);
    }
  }
});

test("opening a spillway drains the backed-up water while the rock remains lodged", () => {
  const basin = new Basin();
  basin.weather = "cloudburst";
  basin.release();
  for (let tick = 0; tick < 1700; tick++) basin.advance();
  assert.equal(basin.rock.state, "lodged");
  const before = basin.upstreamDepth;
  basin.openSpillway();
  for (let tick = 0; tick < 1400; tick++) basin.advance();
  assert.equal(basin.rock.state, "lodged");
  assert.ok(basin.upstreamDepth < before, `pool depth after opening: ${basin.upstreamDepth}; before: ${before}`);
  assert.ok(basin.discharge[0] > 0.0001);
});
