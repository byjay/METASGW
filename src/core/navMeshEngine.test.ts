import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findQuayPath,
  getBuildingContainingPoint,
  isWalkableOnQuay,
  resolveQuayMovement,
  resolveShipNavCollision,
  sampleQuaySurfaceHeight,
} from './navMeshEngine';

test('NavMesh allows walking directly through open 3.6m doorways into all 6 buildings while blocking solid walls', () => {
  // FARO 360 open doorway (x = 0, z = -21.0) & interior center (0, -25.5) MUST be walkable
  assert.equal(isWalkableOnQuay(0, -15.5), true); // Promenade spawn
  assert.equal(isWalkableOnQuay(0, -21.0), true); // Open front doorway
  assert.equal(isWalkableOnQuay(0, -25.5), true); // Interior hall floor
  assert.equal(getBuildingContainingPoint(0, -25.5), 'faro360');
  assert.equal(getBuildingContainingPoint(0, -15.5), null);

  // Solid front-left wall of FARO 360 (x = -3.8, z = -21.0) MUST block collision
  assert.equal(isWalkableOnQuay(-3.8, -21.0), false);
  // Solid back wall of FARO 360 (x = 0, z = -30.0) MUST block collision
  assert.equal(isWalkableOnQuay(0, -30.0), false);

  // West bmail open East doorway (x = -60.5, z = 10) & interior (-65, 10) MUST be walkable
  assert.equal(isWalkableOnQuay(-60.5, 10), true);
  assert.equal(isWalkableOnQuay(-65, 10), true);
  assert.equal(getBuildingContainingPoint(-65, 10), 'bmail');
});

test('NavMesh A* pathfinding routes cleanly from promenade into building interiors through open doorways', () => {
  const path = findQuayPath({ x: -10, z: -15.5 }, { x: 0, z: -25.5 });
  assert.ok(path.length >= 1);
  const last = path[path.length - 1];
  assert.ok(Math.hypot(last.x - 0, last.z - -25.5) < 1.0);
  // Every waypoint must be walkable
  for (const pt of path) {
    assert.equal(isWalkableOnQuay(pt.x, pt.z), true);
  }
});

test('resolveQuayMovement slides along walls and sampleQuaySurfaceHeight raises indoor floor cleanly', () => {
  const slid = resolveQuayMovement({ x: -4.0, z: -20.2 }, { x: -3.5, z: -21.1 });
  assert.equal(isWalkableOnQuay(slid.x, slid.z), true);
  assert.ok(sampleQuaySurfaceHeight(0, -25.5) > sampleQuaySurfaceHeight(0, -15.5));
  assert.ok(sampleQuaySurfaceHeight(0, -10.0) < sampleQuaySurfaceHeight(0, -15.5));
});

test('resolveShipNavCollision protects piers and separates overlapping vessels', () => {
  const clamped = resolveShipNavCollision({ x: 0, z: -20 }, []);
  assert.ok(clamped.z >= -7.8);

  const separated = resolveShipNavCollision({ x: 0, z: 10 }, [{ x: 0.5, z: 10 }]);
  assert.ok(Math.hypot(separated.x - 0.5, separated.z - 10) > 0.5);
});
