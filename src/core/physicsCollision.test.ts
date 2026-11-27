import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AVATAR_COLLISION_RADIUS,
  AVATAR_MIN_SEPARATION,
  clampCameraCollision,
  HARBOR_STATIC_COLLIDERS,
  isOnWalkableLand,
  isOverWater,
  OBSERVATION_DECK_Y,
  QUAY_MAIN_DECK_Y,
  resolveAvatarPhysicsMovement,
  resolveAvatarSpawnOverlaps,
  sampleHarborElevation,
} from './physicsCollision';

describe('Physical Collision & Elevation Engine (Requirement #17)', () => {
  it('blocks avatars from walking through portal buildings, crane bogies, and container yards', () => {
    for (const box of HARBOR_STATIC_COLLIDERS) {
      const cx = (box.minX + box.maxX) * 0.5;
      const cz = (box.minZ + box.maxZ) * 0.5;
      const start = { x: cx, z: Math.min(-5, box.maxZ + 3.5) };
      const resolved = resolveAvatarPhysicsMovement(start, { x: cx, z: cz });

      const inside =
        resolved.x > box.minX - AVATAR_COLLISION_RADIUS * 0.85 &&
        resolved.x < box.maxX + AVATAR_COLLISION_RADIUS * 0.85 &&
        resolved.z > box.minZ - AVATAR_COLLISION_RADIUS * 0.85 &&
        resolved.z < box.maxZ + AVATAR_COLLISION_RADIUS * 0.85;

      assert.equal(inside, false, `Avatar penetrated static obstacle ${box.id}`);
    }
  });

  it('prevents avatars from stepping into water and slides smoothly along the seawall edge', () => {
    assert.equal(isOnWalkableLand(0, -10), true);
    assert.equal(isOverWater(0, 15), true);

    // Attempt diagonal walk from north quay toward open water
    const start = { x: 0, z: -5.0 };
    const resolved = resolveAvatarPhysicsMovement(start, { x: 10, z: 18 });

    assert.equal(isOnWalkableLand(resolved.x, resolved.z), true, 'Avatar must stay on solid quay');
    assert.equal(isOverWater(resolved.x, resolved.z), false, 'Avatar must never walk on water');
    // Smooth wall sliding along X should have progressed east even though Z hit seawall
    assert.ok(resolved.x > start.x + 2, `Expected smooth X wall slide along seawall, got x=${resolved.x}`);
  });

  it('enforces minimum personal separation between avatars on spawn and during movement', () => {
    const crowded = [
      { id: 'a', position: { x: 0, y: QUAY_MAIN_DECK_Y, z: -10 } },
      { id: 'b', position: { x: 0.1, y: QUAY_MAIN_DECK_Y, z: -10 } },
      { id: 'c', position: { x: -0.1, y: QUAY_MAIN_DECK_Y, z: -10.1 } },
    ];
    const separated = resolveAvatarSpawnOverlaps(crowded);
    for (let i = 0; i < separated.length; i += 1) {
      for (let j = i + 1; j < separated.length; j += 1) {
        const d = Math.hypot(
          separated[i].position.x - separated[j].position.x,
          separated[i].position.z - separated[j].position.z,
        );
        assert.ok(
          d >= AVATAR_MIN_SEPARATION - 0.05,
          `Avatars ${separated[i].id} & ${separated[j].id} too close: ${d.toFixed(2)}m`,
        );
      }
    }
  });

  it('samples smooth elevation along the central waterfront observation terrace and flanking ramps', () => {
    const flatY = sampleHarborElevation(0, -8);
    assert.equal(flatY, QUAY_MAIN_DECK_Y);

    const deckY = sampleHarborElevation(0, -16);
    assert.equal(deckY, OBSERVATION_DECK_Y);
    assert.ok(deckY > flatY);

    const midRampY = sampleHarborElevation(10, -16);
    assert.ok(midRampY > flatY && midRampY < deckY, `Expected ramp midpoint elevation, got ${midRampY}`);
  });

  it('clamps camera above water/deck and pushes low cameras outside portal buildings', () => {
    const underwater = clampCameraCollision({ x: 0, y: -4, z: 25 });
    assert.ok(underwater.y >= 2.2, 'Camera must not clip under water surface');

    const building = HARBOR_STATIC_COLLIDERS[0];
    const bx = (building.minX + building.maxX) * 0.5;
    const bz = (building.minZ + building.maxZ) * 0.5;
    const insideBuilding = clampCameraCollision({ x: bx, y: 3.5, z: bz });
    const stillInside =
      insideBuilding.x > building.minX &&
      insideBuilding.x < building.maxX &&
      insideBuilding.z > building.minZ &&
      insideBuilding.z < building.maxZ;
    assert.equal(stillInside, false, 'Low camera must be pushed outside solid building');
  });
});
