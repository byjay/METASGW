import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  mapEmployeesToHarborPeople,
  mapProjectsToHarborShips,
  PRESENCE_TTL_MS,
  resolveProjectStatusTone,
} from './mapping.ts';

describe('mapping API responses to Harbor ships and people', () => {
  it('returns zero ships when SEDMS projects list is empty (no fake ships)', () => {
    assert.deepEqual(mapProjectsToHarborShips([]), []);
  });

  it('places 4 project ships in collision-free 2x2 water berths with verbatim names and distinct tones', () => {
    const ships = mapProjectsToHarborShips([
      { id: 'proj01', code: 'P01', name: 'proj01-verbatim', role: 'manager', status: 'active', updated_at: '2026-11-26' },
      { id: 'proj02', code: 'P02', name: 'proj02-verbatim', role: 'reviewer', status: 'review', updated_at: '2026-11-25' },
      { id: 'proj03', code: 'P03', name: 'proj03-verbatim', role: 'member', status: 'hold', updated_at: '2026-11-24' },
      { id: 'proj04', code: 'P04', name: 'proj04-verbatim', role: 'viewer', status: 'completed', updated_at: '2026-11-20' },
    ]);

    assert.equal(ships.length, 4);
    assert.equal(ships[0].name, 'proj01-verbatim');
    assert.equal(ships[0].statusTone, 'active');
    assert.equal(ships[1].statusTone, 'review');
    assert.equal(ships[2].statusTone, 'hold');
    assert.equal(ships[3].statusTone, 'completed');
    assert.equal(resolveProjectStatusTone('완료'), 'completed');

    for (const s of ships) {
      assert.ok(s.berthZ >= 20.5, `Ship ${s.id} must stay well clear of quay wall`);
    }
    for (let i = 0; i < ships.length; i += 1) {
      for (let j = i + 1; j < ships.length; j += 1) {
        const dx = ships[i].berthX - ships[j].berthX;
        const dz = ships[i].berthZ - ships[j].berthZ;
        assert.ok(Math.hypot(dx, dz) >= 25, 'Adjacent ships must maintain >= 25m center clearance');
      }
    }
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
});
