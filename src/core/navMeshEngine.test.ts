import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findQuayPath,
  isWalkableOnQuay,
  resolveQuayMovement,
  sampleQuaySurfaceHeight,
  snapToNearestWalkable,
} from './navMeshEngine.ts';

test('quay NavMesh allows promenade walking while blocking water and portal building footprints', () => {
  assert.equal(isWalkableOnQuay(0, -10), true);
  assert.equal(isWalkableOnQuay(-82, 12), true);
  assert.equal(isWalkableOnQuay(82, 12), true);

  // Open water basin must be blocked
  assert.equal(isWalkableOnQuay(0, 12), false);
  // Portal building center (-12, -26) must be blocked
  assert.equal(isWalkableOnQuay(-12, -26), false);
});

test('A* pathfinding routes around portal buildings cleanly', () => {
  const path = findQuayPath({ x: -12, z: -12 }, { x: -12, z: -34 });
  assert.ok(path.length >= 1);
  for (const pt of path) {
    assert.equal(isWalkableOnQuay(pt.x, pt.z), true);
  }
});

test('resolveQuayMovement slides along edges and snaps invalid clicks back onto quay', () => {
  const slid = resolveQuayMovement({ x: 0, z: -3.2 }, { x: 2.0, z: 4.0 });
  assert.equal(isWalkableOnQuay(slid.x, slid.z), true);

  const snapped = snapToNearestWalkable({ x: 0, z: 3.0 });
  assert.ok(snapped !== null);
  assert.equal(isWalkableOnQuay(snapped.x, snapped.z), true);
  assert.equal(sampleQuaySurfaceHeight(0, -10), 1.61);
});
