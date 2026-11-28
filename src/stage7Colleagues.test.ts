import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as THREE from 'three';
import { AccessibleListView } from './components/AccessibleListView';
import { PeopleFinderDrawer } from './components/PeopleFinderDrawer';
import { RadialActionMenu } from './components/RadialActionMenu';
import { buildTalkDmUrl } from './deepLink.ts';
import { resolveAvatarCapForQuality } from './deviceProfile.ts';
import {
  mapEmployeesToHarborPeople,
  mapProjectsToHarborShips,
  PRESENCE_STATUS_LABEL_KO,
  QUAY_BENCH_SLOTS,
  selectVisibleQuayColleagues,
} from './mapping.ts';
import {
  getPreviewDemoEmployees,
  getPreviewDemoPresence,
  getPreviewDemoProjects,
  getPreviewDemoUser,
} from './previewFixtures.ts';
import { buildHumanoidEngineerAvatar } from './scene/humanoidAvatar.ts';
import { fetchPresence, type FetchLike, type SgwEmployee } from './sgwAdapter.ts';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

describe('Stage 7: Quay colleagues 1:1 presence matching, bench seating, leave exclusion & quality-tier cap', () => {
  it('parses online/away/leave/offline states from /api/presence in sgw mode (flat & grouped payloads) with same-origin cookie', async () => {
    const now = 1_700_000_100_000;
    let capturedInit: RequestInit | undefined;

    const flatFetch: FetchLike = async (_url, init) => {
      capturedInit = init;
      return jsonResponse({
        items: [
          { sub: 'emp01', status: 'online', lastSeenAt: now - 3_000 },
          { sub: 'emp02', status: 'away', lastSeenAt: now - 15_000 },
          { sub: 'emp03', status: 'annual_leave' },
          { sub: 'emp04', onLeave: true },
          { sub: 'emp05', away: true, lastSeenAt: now - 10_000 },
          { sub: 'emp06', status: 'offline', lastSeenAt: now - 90_000 },
        ],
      });
    };

    const flatRes = await fetchPresence({ runtimeEnv: 'sgw', fetchImpl: flatFetch, nowMs: now });
    assert.equal(flatRes.status, 'ok');
    assert.equal(capturedInit?.credentials, 'same-origin');
    const headers = (capturedInit?.headers ?? {}) as Record<string, string>;
    assert.equal('Authorization' in headers, false);

    if (flatRes.status === 'ok') {
      const bySub = new Map(flatRes.entries.map((e) => [e.sub, e]));
      assert.equal(bySub.get('emp01')?.status, 'online');
      assert.equal(bySub.get('emp02')?.status, 'away');
      assert.equal(bySub.get('emp03')?.status, 'leave');
      assert.equal(bySub.get('emp04')?.status, 'leave');
      assert.equal(bySub.get('emp05')?.status, 'away');
      assert.equal(bySub.get('emp06')?.status, 'offline');
    }

    const groupedFetch: FetchLike = async () =>
      jsonResponse({
        online: ['emp01'],
        away: ['emp02'],
        onLeave: ['emp03'],
      });
    const groupedRes = await fetchPresence({ runtimeEnv: 'sgw', fetchImpl: groupedFetch, nowMs: now });
    assert.equal(groupedRes.status, 'ok');
    if (groupedRes.status === 'ok') {
      const bySub = new Map(groupedRes.entries.map((e) => [e.sub, e]));
      assert.equal(bySub.get('emp01')?.status, 'online');
      assert.equal(bySub.get('emp02')?.status, 'away');
      assert.equal(bySub.get('emp03')?.status, 'leave');
    }
  });

  it('provides 6 pseudonym preview colleagues covering online, away (bench), and leave (excluded from 3D quay)', () => {
    const now = 1_700_000_000_000;
    const employees = getPreviewDemoEmployees();
    const presence = getPreviewDemoPresence(now);
    assert.equal(employees.length, 6);
    assert.equal(presence.length, 6);

    // Strictly pseudonym-only check (no emails / real names / internal domains)
    for (const emp of employees) {
      assert.match(emp.sub, /^user0[1-6]$/);
      assert.match(emp.dept, /^dept0[1-3]$/);
      assert.equal(emp.name.includes('@'), false);
    }

    const people = mapEmployeesToHarborPeople(employees, presence, 'user01', now);
    const bySub = new Map(people.map((p) => [p.sub, p]));

    // Online walking colleagues
    assert.equal(bySub.get('user02')?.presenceStatus, 'online');
    assert.equal(bySub.get('user02')?.presenceLabelKo, PRESENCE_STATUS_LABEL_KO.online);
    assert.equal(bySub.get('user02')?.benchIndex, undefined);
    assert.ok((bySub.get('user02')?.position.z ?? 0) <= -8.0, 'Walking online colleague clears bench row');

    // Away bench-seated colleagues
    const awayA = bySub.get('user04');
    const awayB = bySub.get('user05');
    assert.equal(awayA?.presenceStatus, 'away');
    assert.equal(awayA?.presenceLabelKo, PRESENCE_STATUS_LABEL_KO.away);
    assert.equal(awayA?.benchIndex, QUAY_BENCH_SLOTS[0].benchIndex);
    assert.equal(awayA?.position.x, QUAY_BENCH_SLOTS[0].x);
    assert.equal(awayA?.position.z, QUAY_BENCH_SLOTS[0].z);
    assert.equal(awayB?.presenceStatus, 'away');
    assert.equal(awayB?.benchIndex, QUAY_BENCH_SLOTS[1].benchIndex);

    // Leave colleague (오늘 연차 -> NOT rendered on 3D quay, shown in 2D list)
    const onLeave = bySub.get('user06');
    assert.equal(onLeave?.presenceStatus, 'leave');
    assert.equal(onLeave?.presenceLabelKo, PRESENCE_STATUS_LABEL_KO.leave);

    const highSel = selectVisibleQuayColleagues(people, 'high');
    assert.equal(highSel.onLeaveCount, 1);
    assert.equal(highSel.visible.some((p) => p.sub === 'user06'), false, 'On-leave colleague must not spawn on 3D quay');
    assert.equal(highSel.visible.some((p) => p.sub === 'user01'), false, 'Current user uses playerRig, not colleague list');
    assert.equal(highSel.visible.length, 4);
    assert.equal(highSel.overflowCount, 0);

    // Low quality tier caps at 3 -> overflowCount = 1 ("외 1명")
    const lowSel = selectVisibleQuayColleagues(people, 'low');
    assert.equal(lowSel.cap, resolveAvatarCapForQuality('low'));
    assert.equal(lowSel.visible.length, 3);
    assert.equal(lowSel.overflowCount, 1);
  });

  it('caps visible quay colleagues per quality tier (high/medium/low) and calculates exact "외 n명" overflow count', () => {
    const now = 1_700_000_000_000;
    const manyEmployees: SgwEmployee[] = Array.from({ length: 25 }, (_, i) => ({
      sub: `emp${String(i + 1).padStart(2, '0')}`,
      name: `emp${String(i + 1).padStart(2, '0')}`,
      dept: `dept0${(i % 3) + 1}`,
      title: 'role',
      role: 'member',
      isPartner: false,
    }));
    // emp01 = current user; emp02..emp15 = online (14); emp16..emp21 = away (6); emp22..emp25 = leave (4)
    const presence = manyEmployees.map((emp, i) => ({
      sub: emp.sub,
      lastSeenAt: i < 21 ? now - 5_000 : 0,
      status: (i < 15 ? 'online' : i < 21 ? 'away' : 'leave') as 'online' | 'away' | 'leave',
    }));

    const people = mapEmployeesToHarborPeople(manyEmployees, presence, 'emp01', now);
    // Eligible non-self non-leave = 14 online + 6 away = 20
    const highSel = selectVisibleQuayColleagues(people, 'high');
    assert.equal(highSel.totalEligibleCount, 20);
    assert.equal(highSel.onLeaveCount, 4);
    assert.equal(highSel.visible.length, 16);
    assert.equal(highSel.overflowCount, 4);
    // Priority: all 14 online colleagues come first, followed by 2 away colleagues
    assert.equal(highSel.visible.filter((p) => p.presenceStatus === 'online').length, 14);
    assert.equal(highSel.visible.filter((p) => p.presenceStatus === 'away').length, 2);

    const medSel = selectVisibleQuayColleagues(people, 'medium');
    assert.equal(medSel.visible.length, 10);
    assert.equal(medSel.overflowCount, 10);

    const lowSel = selectVisibleQuayColleagues(people, 'low');
    assert.equal(lowSel.visible.length, 3);
    assert.equal(lowSel.overflowCount, 17);
  });

  it('builds 3D volumetric sitting posture and low-tier simplified Lambert 3D material with ZERO sprites', () => {
    const lowRig = buildHumanoidEngineerAvatar({
      isPartner: false,
      shirtHex: '#0f766e',
      skipContactShadow: true,
      simplifiedMaterial: true,
    });

    assert.ok(lowRig.meshCount >= 24, `Low-tier 3D rig must remain volumetric (got ${lowRig.meshCount})`);

    let spriteCount = 0;
    let lambertCount = 0;
    let standardCount = 0;
    let shadowCasterCount = 0;
    lowRig.group.traverse((obj) => {
      if ((obj as THREE.Sprite).isSprite) spriteCount += 1;
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        if (mesh.castShadow) shadowCasterCount += 1;
        const mat = mesh.material;
        if (mat instanceof THREE.MeshLambertMaterial) lambertCount += 1;
        if (mat instanceof THREE.MeshStandardMaterial) standardCount += 1;
      }
    });

    assert.equal(spriteCount, 0, 'Low-tier avatar MUST NOT use 2D sprites');
    assert.equal(standardCount, 0, 'Low-tier simplifiedMaterial replaces PBR MeshStandardMaterial');
    assert.ok(lambertCount >= 24, 'Low-tier simplifiedMaterial uses lightweight 3D MeshLambertMaterial');
    assert.equal(shadowCasterCount, 0, 'Low-tier simplifiedMaterial disables shadow casting');

    // Apply 'sit' pose even under reducedMotion=true (low tier suppresses motion)
    lowRig.updateAnimation(0.016, 1.0, 'sit', true);
    const hips = lowRig.group.getObjectByName('hips_joint');
    const leftHip = lowRig.group.getObjectByName('left_hip_joint');
    const leftKnee = lowRig.group.getObjectByName('left_knee_joint');
    assert.ok(hips && leftHip && leftKnee, 'Articulated leg joints must exist');
    assert.ok(hips.position.y < 0.5, `Seated hips must lower onto bench seat (got ${hips.position.y})`);
    assert.ok(leftHip.rotation.x < -1.2, `Seated thigh must bend forward (got ${leftHip.rotation.x})`);
    assert.ok(leftKnee.rotation.x > 1.2, `Seated shin must bend down (got ${leftKnee.rotation.x})`);

    lowRig.dispose();
  });

  it('renders avatar click card with 이름·부서·상태 and [메시지] deep link from buildTalkDmUrl', () => {
    const now = 1_700_000_000_000;
    const people = mapEmployeesToHarborPeople(
      getPreviewDemoEmployees(),
      getPreviewDemoPresence(now),
      'user01',
      now,
    );
    const awayColleague = people.find((p) => p.sub === 'user04');
    const leaveColleague = people.find((p) => p.sub === 'user06');
    assert.ok(awayColleague && leaveColleague);

    const awayHtml = renderToStaticMarkup(
      React.createElement(RadialActionMenu, {
        target: { kind: 'person', person: awayColleague, anchor: { x: 400, y: 300 } },
        runtimeEnv: 'preview',
        onFocusPerson3D: () => {},
        onPreviewLinkBlocked: () => {},
        onClose: () => {},
      }),
    );

    assert.ok(awayHtml.includes('user04'));
    assert.ok(awayHtml.includes('dept03'));
    assert.ok(awayHtml.includes('자리비움'));
    assert.ok(awayHtml.includes('안벽 벤치 휴식'));
    assert.ok(awayHtml.includes('data-testid="person-card-message-btn"'));
    assert.ok(awayHtml.includes(`href="${buildTalkDmUrl('user04')}"`));
    assert.ok(awayHtml.includes('항구 위치 보기'));
    // Preserves existing 4 SGW radial links
    assert.ok(awayHtml.includes('data-testid="radial-item-north"'));
    assert.ok(awayHtml.includes('data-testid="radial-item-east"'));
    assert.ok(awayHtml.includes('data-testid="radial-item-south"'));
    assert.ok(awayHtml.includes('data-testid="radial-item-west"'));

    // On-leave colleague hides 3D quay focus button but keeps [메시지]
    const leaveHtml = renderToStaticMarkup(
      React.createElement(RadialActionMenu, {
        target: { kind: 'person', person: leaveColleague, anchor: { x: 400, y: 300 } },
        runtimeEnv: 'preview',
        onFocusPerson3D: () => {},
        onPreviewLinkBlocked: () => {},
        onClose: () => {},
      }),
    );
    assert.ok(leaveHtml.includes('연차'));
    assert.ok(leaveHtml.includes(`href="${buildTalkDmUrl('user06')}"`));
    assert.equal(leaveHtml.includes('항구 위치 보기'), false);
  });

  it('renders all 6 preview colleagues with 온라인/자리비움/연차 statuses in 2D list and PeopleFinderDrawer', () => {
    const now = 1_700_000_000_000;
    const user = getPreviewDemoUser();
    const ships = mapProjectsToHarborShips(getPreviewDemoProjects(now), now);
    const people = mapEmployeesToHarborPeople(
      getPreviewDemoEmployees(),
      getPreviewDemoPresence(now),
      user.sub,
      now,
    );

    const listHtml = renderToStaticMarkup(
      React.createElement(AccessibleListView, {
        user,
        runtimeEnv: 'preview',
        ships,
        projectsState: 'ready',
        projectsMessage: '',
        people,
        webglSupported: true,
        onRefreshProjects: () => {},
        onSelectShip: () => {},
        onSelectPerson: () => {},
        onPreviewLinkBlocked: () => {},
      }),
    );

    for (const sub of ['user01', 'user02', 'user03', 'user04', 'user05', 'user06']) {
      assert.ok(listHtml.includes(`data-testid="list-person-${sub}"`), `2D list must render ${sub}`);
      assert.ok(listHtml.includes(`href="${buildTalkDmUrl(sub)}"`), `2D list must link DM for ${sub}`);
    }
    assert.ok(listHtml.includes('온라인'));
    assert.ok(listHtml.includes('자리비움'));
    assert.ok(listHtml.includes('연차'));

    const lowSelection = selectVisibleQuayColleagues(people, 'low');
    const drawerHtml = renderToStaticMarkup(
      React.createElement(PeopleFinderDrawer, {
        open: true,
        runtimeEnv: 'preview',
        people,
        visibleQuaySubs: new Set(lowSelection.visible.map((p) => p.sub)),
        overflowCount: lowSelection.overflowCount,
        onClose: () => {},
        onFocusPerson: () => {},
        onSelectPerson: () => {},
        onPreviewLinkBlocked: () => {},
      }),
    );
    assert.ok(drawerHtml.includes('data-testid="drawer-overflow-notice"'));
    assert.ok(drawerHtml.includes('외 1명'));
    assert.ok(drawerHtml.includes('data-testid="drawer-person-user06"'));
    assert.ok(drawerHtml.includes('연차'));
  });
});
