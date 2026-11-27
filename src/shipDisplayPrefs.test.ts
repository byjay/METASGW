import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyShipCustomName,
  applyShipCustomYaw,
  checkShipRotationCollision,
  computeQuayParallelSnapYawDeg,
  loadShipDisplayPrefs,
  MAX_SHIP_NAME_LENGTH,
  saveShipDisplayPrefs,
  stepShipYawDegrees,
  validateShipDisplayName,
  type ShipFootprintCollider,
  type StorageLike,
} from './shipDisplayPrefs';

function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

describe('Ship Local Display Preferences & Rotation Collision (Requirements #15 & #19)', () => {
  it('validates custom names (1..30 chars, plain text, empty restores original)', () => {
    const valid = validateShipDisplayName('  씨스타호 2번선  ');
    assert.equal(valid.ok, true);
    if (valid.ok) {
      assert.equal(valid.value, '씨스타호 2번선');
      assert.equal(valid.cleared, false);
    }

    const cleared = validateShipDisplayName('   ');
    assert.equal(cleared.ok, true);
    if (cleared.ok) {
      assert.equal(cleared.cleared, true);
      assert.equal(cleared.value, '');
    }

    const tooLong = validateShipDisplayName('가'.repeat(MAX_SHIP_NAME_LENGTH + 1));
    assert.equal(tooLong.ok, false);
  });

  it('persists custom ship names and headings cleanly without mutating business project objects', () => {
    const store = createMemoryStorage();
    const originalProject = Object.freeze({ id: 'proj-sample-01', name: 'VESSEL-LNG-01' });

    const renamed = applyShipCustomName({}, originalProject.id, '북항 선도선');
    assert.equal(renamed.ok, true);
    if (!renamed.ok) return;

    const rotated = applyShipCustomYaw(renamed.next, originalProject.id, 180);
    assert.equal(saveShipDisplayPrefs(rotated, store), true);

    const loaded = loadShipDisplayPrefs(store);
    assert.equal(loaded[originalProject.id]?.customName, '북항 선도선');
    assert.equal(loaded[originalProject.id]?.yawDeg, 180);
    // Original SEDMS object stays completely untouched
    assert.equal(originalProject.name, 'VESSEL-LNG-01');

    // Empty name reverts to original while keeping yaw
    const reverted = applyShipCustomName(loaded, originalProject.id, '');
    assert.equal(reverted.ok, true);
    if (reverted.ok) {
      assert.equal(reverted.cleared, true);
      assert.equal(reverted.next[originalProject.id]?.customName, undefined);
      assert.equal(reverted.next[originalProject.id]?.yawDeg, 180);
    }
  });

  it('handles restricted/throwing storage gracefully via try/catch', () => {
    const brokenStore: StorageLike = {
      getItem: () => {
        throw new Error('QuotaExceeded');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
    };
    assert.deepEqual(loadShipDisplayPrefs(brokenStore), {});
    assert.equal(saveShipDisplayPrefs({ 'deco-seastar-hero': { customName: '테스트' } }, brokenStore), false);
  });

  it('steps yaw by 15 degrees and snaps parallel to nearest quay/pier', () => {
    assert.equal(stepShipYawDegrees(0, 1), 15);
    assert.equal(stepShipYawDegrees(0, -1), 345);
    assert.equal(stepShipYawDegrees(345, 1), 0);

    // Near North Quay -> parallel is 90° or 270°
    assert.equal(computeQuayParallelSnapYawDeg(0, 14, 72), 90);
    assert.equal(computeQuayParallelSnapYawDeg(0, 14, 250), 270);

    // Near Side Pier (|x| >= 58) -> parallel is 0° or 180°
    assert.equal(computeQuayParallelSnapYawDeg(-118, 20, 20), 0);
    assert.equal(computeQuayParallelSnapYawDeg(122, 24, 165), 180);
  });

  it('rejects ship rotation when rotated OBB collides with quay wall or neighboring ship/floating dock', () => {
    // Ship closely moored parallel (yaw=90°) to North Quay (maxZ = -2.0)
    const mooredNearQuay: ShipFootprintCollider = {
      id: 'proj-sample-01',
      centerX: -34,
      centerZ: 8.5,
      halfLength: 14.2,
      halfBeam: 5.4,
      yawDeg: 90,
    };
    // Rotating to 0° swings bow/stern across z = 8.5 - 14.2 = -5.7 (deep inside North Quay!)
    const quayHit = checkShipRotationCollision(mooredNearQuay, 0, []);
    assert.equal(quayHit.ok, false);
    assert.equal(quayHit.collidedWithId, 'north_quay');

    // Open-water ship rotating freely without neighbors succeeds
    const openWaterShip: ShipFootprintCollider = {
      id: 'deco-open-01',
      centerX: 0,
      centerZ: 70,
      halfLength: 14,
      halfBeam: 5,
      yawDeg: 90,
    };
    assert.equal(checkShipRotationCollision(openWaterShip, 45, []).ok, true);

    // Adding a nearby Floating Dock right next to openWaterShip blocks rotation into it
    const floatingDockNeighbor: ShipFootprintCollider = {
      id: 'deco-fd-01',
      centerX: 0,
      centerZ: 52,
      halfLength: 10,
      halfBeam: 8,
      yawDeg: 90,
    };
    const neighborHit = checkShipRotationCollision(openWaterShip, 0, [floatingDockNeighbor]);
    assert.equal(neighborHit.ok, false);
    assert.equal(neighborHit.collidedWithId, 'deco-fd-01');
  });
});
