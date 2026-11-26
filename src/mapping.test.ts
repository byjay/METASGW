import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertValidShipBerths,
  DECK_LIGHTS_WINDOW_MS,
  deriveShipAppearance,
  formatDisconnectedBanner,
  HARBOR_WATER_ZONE,
  isUpdatedWithinDays,
  mapEmployeesToHarborPeople,
  mapProjectsToHarborShips,
  PRESENCE_TTL_MS,
  resolveProjectStatusTone,
  validateShipBerths,
} from './mapping.ts';
import { getPreviewDemoProjects } from './previewFixtures.ts';

describe('mapping API responses to Harbor ships and people', () => {
  it('returns zero ships when SEDMS projects list is empty (no fake ships)', () => {
    assert.deepEqual(mapProjectsToHarborShips([]), []);
  });

  it('places 4 project ships in collision-free 2x2 water berths with verbatim names and distinct tones', () => {
    const now = Date.parse('2026-11-26T12:00:00.000Z');
    const ships = mapProjectsToHarborShips(
      [
        { id: 'proj01', code: 'P01', name: 'proj01-verbatim', role: 'manager', status: 'active', updated_at: '2026-11-25' },
        { id: 'proj02', code: 'P02', name: 'proj02-verbatim', role: 'reviewer', status: 'review', updated_at: '2026-11-23' },
        { id: 'proj03', code: 'P03', name: 'proj03-verbatim', role: 'member', status: 'hold', updated_at: '2026-11-20' },
        { id: 'proj04', code: 'P04', name: 'proj04-verbatim', role: 'viewer', status: 'completed', updated_at: '2026-11-10' },
      ],
      now,
    );

    assert.equal(ships.length, 4);
    assert.equal(ships[0].name, 'proj01-verbatim');
    assert.equal(ships[0].statusTone, 'active');
    assert.equal(ships[1].statusTone, 'review');
    assert.equal(ships[2].statusTone, 'hold');
    assert.equal(ships[3].statusTone, 'completed');
    assert.equal(resolveProjectStatusTone('완료'), 'completed');

    // Deck lights: within 7 days (proj01~proj03) -> true, > 7 days (proj04) -> false
    assert.equal(ships[0].appearance.hasDeckLights, true);
    assert.equal(ships[1].appearance.hasDeckLights, true);
    assert.equal(ships[2].appearance.hasDeckLights, true);
    assert.equal(ships[3].appearance.hasDeckLights, false);

    for (const s of ships) {
      assert.ok(s.berthZ >= 20.5, `Ship ${s.id} must stay well clear of quay wall`);
      assert.ok(s.boardingPoint.z < -2.5, `Ship ${s.id} boarding point must lie safely on quay`);
    }
    for (let i = 0; i < ships.length; i += 1) {
      for (let j = i + 1; j < ships.length; j += 1) {
        const dx = ships[i].berthX - ships[j].berthX;
        const dz = ships[i].berthZ - ships[j].berthZ;
        assert.ok(Math.hypot(dx, dz) >= 25, 'Adjacent ships must maintain >= 25m center clearance');
      }
    }
  });

  it('derives status color, Korean label, signal flag pattern, and 7-day deck lights from mapping.ts alone', () => {
    const now = Date.parse('2026-11-26T12:00:00.000Z');
    const twoDaysAgo = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
    const nineDaysAgo = new Date(now - 9 * 24 * 60 * 60 * 1000).toISOString();

    const active = deriveShipAppearance('진행', twoDaysAgo, now);
    assert.equal(active.statusTone, 'active');
    assert.equal(active.statusLabelKo, '진행');
    assert.equal(active.flagHex, '#0ea5e9');
    assert.equal(active.flagPattern, 'pennant');
    assert.equal(active.hasDeckLights, true);

    const review = deriveShipAppearance('검토', twoDaysAgo, now);
    assert.equal(review.statusTone, 'review');
    assert.equal(review.statusLabelKo, '검토');
    assert.equal(review.flagHex, '#f59e0b');
    assert.equal(review.flagPattern, 'swallowtail');
    assert.equal(review.hasDeckLights, true);

    const hold = deriveShipAppearance('보류', nineDaysAgo, now);
    assert.equal(hold.statusTone, 'hold');
    assert.equal(hold.statusLabelKo, '보류');
    assert.equal(hold.flagHex, '#ef4444');
    assert.equal(hold.flagPattern, 'striped');
    assert.equal(hold.hasDeckLights, false);

    const completed = deriveShipAppearance('완료', nineDaysAgo, now);
    assert.equal(completed.statusTone, 'completed');
    assert.equal(completed.statusLabelKo, '완료');
    assert.equal(completed.flagHex, '#10b981');
    assert.equal(completed.flagPattern, 'checkered');
    assert.equal(completed.hasDeckLights, false);

    // Exact 7-day boundary checks
    assert.equal(
      isUpdatedWithinDays(new Date(now - DECK_LIGHTS_WINDOW_MS).toISOString(), now),
      true,
    );
    assert.equal(
      isUpdatedWithinDays(new Date(now - DECK_LIGHTS_WINDOW_MS - 1_000).toISOString(), now),
      false,
    );
    assert.equal(isUpdatedWithinDays('없음', now), false);
    assert.equal(isUpdatedWithinDays(undefined, now), false);
  });

  it('formats disconnected HUD banner with elapsed minutes since last sync', () => {
    const now = 1_700_000_600_000;
    assert.equal(formatDisconnectedBanner(null, now), '연결 끊김 — 마지막 갱신 0분 전');
    assert.equal(formatDisconnectedBanner(now - 25_000, now), '연결 끊김 — 마지막 갱신 0분 전');
    assert.equal(formatDisconnectedBanner(now - 5 * 60_000, now), '연결 끊김 — 마지막 갱신 5분 전');
    assert.equal(formatDisconnectedBanner(now + 10_000, now), '연결 끊김 — 마지막 갱신 0분 전');
  });

  it('computes 30s presence TTL keyed strictly by sub', () => {
    const now = 1_700_000_100_000;
    const people = mapEmployeesToHarborPeople(
      [
        { sub: 'user01', name: 'user01', dept: 'dept01', title: 'role01', role: 'member', isPartner: false },
        { sub: 'user02', name: 'user02', dept: 'dept01', title: 'role02', role: 'member', isPartner: false },
        { sub: 'user03', name: 'user03', dept: 'dept02', title: 'role03', role: 'partner', isPartner: true },
      ],
      [
        { sub: 'user02', lastSeenAt: now - 10_000 },
        { sub: 'user03', lastSeenAt: now - PRESENCE_TTL_MS - 1_000 },
      ],
      'user01',
      now,
    );

    assert.equal(people[0].online, true);
    assert.equal(people[1].online, true);
    assert.equal(people[2].online, false);
    assert.equal(people[2].isPartner, true);
    for (const p of people) {
      assert.ok(p.position.z <= -4.5 && p.position.z >= -13.5, 'People stay on safe quay boardwalk');
    }
  });

  it('asserts all mapped ships stay inside water zone and never overlap quay, piers, or other ships (1..6 ships & preview fixtures)', () => {
    const now = Date.parse('2026-11-26T12:00:00.000Z');
    const previewShips = mapProjectsToHarborShips(getPreviewDemoProjects(now), now);
    const previewCheck = assertValidShipBerths(previewShips, {
      throwOnViolation: true,
      warnInDev: false,
    });
    assert.equal(previewCheck.ok, true);
    assert.equal(previewCheck.violations.length, 0);

    for (const count of [1, 2, 3, 4, 5, 6]) {
      const sample = Array.from({ length: count }, (_, idx) => ({
        id: `proj0${idx + 1}`,
        code: `VESSEL-LNG-0${idx + 1}`,
        name: `proj0${idx + 1}`,
        role: 'member',
        status: 'active',
        updated_at: '2026-11-26',
      }));
      const ships = mapProjectsToHarborShips(sample, now);
      const result = assertValidShipBerths(ships, {
        throwOnViolation: true,
        warnInDev: false,
      });
      assert.equal(result.ok, true, `Berth validation must pass for ${count} ships`);
    }
  });

  it('rejects ships colliding with the quay, overlapping piers/water bounds, or overlapping another ship and emits dev warning', () => {
    const now = Date.parse('2026-11-26T12:00:00.000Z');
    const baseShips = mapProjectsToHarborShips(getPreviewDemoProjects(now), now);

    // 1. Ship intruding north into concrete quay
    const quayIntruder = [{ ...baseShips[0], berthZ: HARBOR_WATER_ZONE.minWaterZ }];
    const quayCheck = validateShipBerths(quayIntruder);
    assert.equal(quayCheck.ok, false);
    assert.ok(quayCheck.violations.some((v) => v.kind === 'quay_overlap'));

    // 2. Ship intruding west into pier
    const pierIntruder = [{ ...baseShips[0], berthX: HARBOR_WATER_ZONE.westPierInnerX }];
    const pierCheck = validateShipBerths(pierIntruder);
    assert.equal(pierCheck.ok, false);
    assert.ok(pierCheck.violations.some((v) => v.kind === 'pier_overlap'));

    // 3. Ship outside south water zone
    const outOfWater = [{ ...baseShips[0], berthZ: HARBOR_WATER_ZONE.maxWaterZ + 10 }];
    const waterCheck = validateShipBerths(outOfWater);
    assert.equal(waterCheck.ok, false);
    assert.ok(waterCheck.violations.some((v) => v.kind === 'outside_water_zone'));

    // 4. Two ships overlapping each other -> throws and logs dev warning
    const collidingPair = [
      baseShips[0],
      { ...baseShips[1], berthX: baseShips[0].berthX + 5, berthZ: baseShips[0].berthZ + 2 },
    ];
    const warnings: string[] = [];
    assert.throws(() => {
      assertValidShipBerths(collidingPair, {
        throwOnViolation: true,
        warnInDev: true,
        logger: (msg) => warnings.push(msg),
      });
    }, /overlap/);
    assert.equal(warnings.length, 1);
    assert.ok(warnings[0].includes('선박 배치 검증 실패'));
  });
});
