import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as THREE from 'three';
import { AdminHarborModal } from './components/AdminHarborModal';
import { RadialActionMenu } from './components/RadialActionMenu';
import { SgwBridgePreviewModal } from './components/SgwBridgePreviewModal';
import { mapProjectsToHarborShips } from './mapping';
import { mergeHubModuleChips } from './meta/hubChipModel';
import {
  getPreviewHubRegistry,
  getPreviewHubSummary,
  getPreviewKeyCables,
  getPreviewKeyDrawings,
  getPreviewReportJson,
  getPreviewSearchItems,
} from './meta/hubFixtures';
import { runSgwTwoWayVerification } from './meta/sgwTwoWayVerifier';
import { getPreviewDemoProjects } from './previewFixtures';
import { buildProjectEntryOptions } from './projectEntryOptions';
import { HOME_HARBOR_DECORATIVE_VESSELS } from './scene/sceneryCatalog';
import {
  buildSeastarSkyMonument,
  SEASTAR_MONUMENT_DIMENSIONS,
  SEASTAR_MONUMENT_POSITION,
} from './scene/seastarSkyMonument';
import {
  BUILTIN_SHIP_ASSET_CATALOG,
  createProjectFromShipAsset,
  mergeShipAssetLibrary,
  resolveProjectShipSilhouette,
  saveAllHarborShipsAsAssets,
} from './shipAssetCatalog';
import {
  applyShipVesselAsset,
  loadAddedProjectShips,
  loadSavedShipAssets,
  saveAddedProjectShips,
  saveSavedShipAssets,
  type StorageLike,
} from './shipDisplayPrefs';

function createMockMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

function assertEveryButtonHasAriaLabel(html: string, label: string): void {
  const tags = html.match(/<button\b[^>]*>/g) ?? [];
  assert.ok(tags.length > 0, `${label}: expected rendered <button> elements`);
  for (const tag of tags) {
    assert.match(tag, /aria-label="[^"]+"/, `${label}: missing aria-label on ${tag}`);
  }
}

describe('SGW API Two-Way Verification, Rotating Aerial SEASTAR Monument, Admin Ship Editor & Ship Assets', () => {
  it('1) verifies full SGW 11-endpoint API integration & bidirectional presence/hub roundtrip in sgw mode', async () => {
    const nowMs = 1_700_000_000_000;
    const calledEndpoints: Array<{ url: string; method: string; credentials?: string; hasAuth: boolean; bodyPresent: boolean }> = [];
    let heartbeatReceived = false;

    const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method ?? 'GET').toUpperCase();
      const headers = new Headers(init?.headers);
      calledEndpoints.push({
        url,
        method,
        credentials: init?.credentials,
        hasAuth: headers.has('Authorization') || headers.has('authorization'),
        bodyPresent: init?.body !== undefined && init?.body !== null,
      });

      const json = (payload: unknown, status = 200) =>
        new Response(JSON.stringify(payload), {
          status,
          headers: { 'content-type': 'application/json' },
        });

      if (url === '/auth/me') {
        return json({
          user: {
            sub: 'emp-001',
            name: '김선박',
            dept: '선체설계팀',
            role: 'manager',
            isPartner: false,
          },
        });
      }
      if (url === '/api/employees') {
        return json({
          employees: [
            { sub: 'emp-001', name: '김선박', dept: '선체설계팀', role: 'manager', isPartner: false },
            { sub: 'emp-002', name: '이해양', dept: '전장설계팀', role: 'designer', isPartner: false },
          ],
        });
      }
      if (url === '/api/presence' && method === 'POST') {
        heartbeatReceived = true;
        return json({ ok: true });
      }
      if (url === '/api/presence' && method === 'GET') {
        return json({
          entries: heartbeatReceived
            ? [
                { sub: 'emp-001', status: 'online', updatedAt: new Date(nowMs).toISOString() },
                { sub: 'emp-002', status: 'away', updatedAt: new Date(nowMs).toISOString() },
              ]
            : [{ sub: 'emp-002', status: 'away', updatedAt: new Date(nowMs).toISOString() }],
        });
      }
      if (url.startsWith('/api/gateway/sedms/projects')) {
        return json({
          status: 'ready',
          projects: [
            {
              id: 'proj01',
              code: 'VSL-01',
              name: '그린 LNG 운반선',
              role: 'manager',
              status: 'active',
              updated_at: '2026-11-28',
            },
          ],
        });
      }
      if (url === '/api/meta/registry') {
        return json(getPreviewHubRegistry());
      }
      if (url.startsWith('/api/meta/hub/summary')) {
        return json(getPreviewHubSummary('proj01', nowMs));
      }
      if (url.startsWith('/api/meta/drawings/key')) {
        return json(getPreviewKeyDrawings('proj01', { nowMs }));
      }
      if (url.startsWith('/api/meta/cables/key')) {
        return json(getPreviewKeyCables('proj01', { nowMs }));
      }
      if (url.startsWith('/api/meta/items/search')) {
        return json(getPreviewSearchItems('proj01', { q: 'DWG', nowMs }));
      }
      if (url.startsWith('/api/meta/reports/generate')) {
        return json(getPreviewReportJson('proj01', 7, nowMs));
      }
      return json({ error: 'not_found' }, 404);
    };

    const report = await runSgwTwoWayVerification({
      runtimeEnv: 'sgw',
      fetchImpl: mockFetch,
      nowMs,
    });

    assert.equal(report.runtimeEnv, 'sgw');
    assert.equal(report.steps.length, 11);
    assert.equal(report.failCount, 0);
    assert.equal(report.passCount, 11);
    assert.equal(report.twoWayPresenceOk, true);
    assert.equal(report.hubRefreshRoundtripOk, true);

    // Every single SGW call must enforce same-origin cookie auth and zero Authorization header
    for (const call of calledEndpoints) {
      assert.equal(call.credentials, 'same-origin', `Missing same-origin on ${call.url}`);
      assert.equal(call.hasAuth, false, `Forbidden Authorization header on ${call.url}`);
    }
    const heartbeatCall = calledEndpoints.find(
      (c) => c.url === '/api/presence' && c.method === 'POST',
    );
    assert.ok(heartbeatCall, 'Outbound POST /api/presence heartbeat must execute');
    assert.equal(heartbeatCall.bodyPresent, false, 'POST /api/presence must not send client-claimed identity body');
    assert.ok(
      calledEndpoints.some((c) => c.url.includes('/api/meta/hub/summary') && c.url.includes('refresh=1')),
      'Hub summary verification must send refresh=1 roundtrip',
    );
  });

  it('2) runs cleanly in preview mode with zero failures', async () => {
    const report = await runSgwTwoWayVerification({ runtimeEnv: 'preview', projectId: 'proj01' });
    assert.equal(report.runtimeEnv, 'preview');
    assert.equal(report.steps.length, 11);
    assert.equal(report.failCount, 0);
    assert.equal(report.twoWayPresenceOk, true);
    assert.equal(report.hubRefreshRoundtripOk, true);
  });

  it('3) builds large rotating aerial SEASTAR sky monument above harbor and rotates smoothly', () => {
    const stubTex = new THREE.DataTexture(new Uint8Array([10, 40, 90, 255]), 1, 1);
    const monument = buildSeastarSkyMonument(stubTex);

    assert.equal(monument.group.position.y, SEASTAR_MONUMENT_POSITION.y);
    assert.ok(monument.baseY >= 40, 'Aerial monument must float high above harbor cranes');
    assert.ok(monument.width >= 50, 'Aerial monument must be large (>= 50m wide)');
    assert.equal(monument.width, SEASTAR_MONUMENT_DIMENSIONS.width);

    // Composite multi-part structure (>= 10 meshes: core, front/back banners, beams, columns, rails, wings, beacons, hubs, halos)
    let meshCount = 0;
    monument.group.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        meshCount += 1;
        assert.equal((obj as THREE.Mesh).castShadow, false, 'Sky monument must not cast dark shadows on quay');
      }
    });
    assert.ok(meshCount >= 12, `Expected rich composite monument (>= 12 meshes), got ${meshCount}`);

    // Rotates continuously when reducedMotion is false
    const y0 = monument.rotorGroup.rotation.y;
    const h0 = monument.haloGroup.rotation.y;
    monument.update(0.1, 1.0, false);
    assert.ok(monument.rotorGroup.rotation.y > y0, 'Main banner rotor must rotate continuously');
    assert.ok(monument.haloGroup.rotation.y < h0, 'Outer halo must counter-rotate');

    // Freezes cleanly when reducedMotion is true
    const yFrozen = monument.rotorGroup.rotation.y;
    monument.update(0.1, 2.0, true);
    assert.equal(monument.rotorGroup.rotation.y, yFrozen, 'Must pause rotation under reducedMotion');

    monument.dispose();
    stubTex.dispose();
  });

  it('4) saves ALL harbor ships (project + decorative) as reusable assets and spawns any asset as a new project ship', () => {
    const storage = createMockMemoryStorage();
    const ships = mapProjectsToHarborShips(getPreviewDemoProjects(1_700_000_000_000));
    const bulkResult = saveAllHarborShipsAsAssets(
      [],
      ships,
      HOME_HARBOR_DECORATIVE_VESSELS,
      {},
      [],
      '2026-11-28',
    );

    const expectedTotal = ships.length + HOME_HARBOR_DECORATIVE_VESSELS.length;
    assert.equal(bulkResult.totalSavedCount, expectedTotal);
    assert.equal(bulkResult.newlySavedCount, expectedTotal);

    // Persist & reload assets
    saveSavedShipAssets(bulkResult.assets, storage);
    const reloadedAssets = loadSavedShipAssets(storage);
    assert.equal(reloadedAssets.length, expectedTotal);

    // Merged library includes all 13 built-in archetypes + all saved harbor ships
    const library = mergeShipAssetLibrary(reloadedAssets);
    assert.equal(library.length, BUILTIN_SHIP_ASSET_CATALOG.length + expectedTotal);

    // Pick saved "씨스타호" flagship asset and add it as a new project ship
    const seastarAsset = reloadedAssets.find((a) => a.vesselType === 'seastar_flagship');
    assert.ok(seastarAsset, 'Saved assets must include seastar_flagship from harbor');

    const created = createProjectFromShipAsset({
      asset: seastarAsset,
      projectId: 'proj-seastar-09',
      projectCode: 'VSL-09',
      projectName: '신규 씨스타 플래그십 프로젝트',
      role: 'manager',
      status: 'active',
      existingProjectIds: new Set(ships.map((s) => s.id)),
      nowIsoDate: '2026-11-28',
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    assert.equal(created.record.vesselType, 'seastar_flagship');
    saveAddedProjectShips([created.record], storage);
    const reloadedProjects = loadAddedProjectShips(storage);
    assert.equal(reloadedProjects.length, 1);
    assert.equal(reloadedProjects[0].id, 'proj-seastar-09');

    // Vessel archetype override resolves via display prefs or added project record
    const prefs = applyShipVesselAsset({}, 'proj01', 'wtiv_jackup');
    assert.equal(resolveProjectShipSilhouette('proj01', 0, prefs), 'wtiv_jackup');
    assert.equal(
      resolveProjectShipSilhouette('proj-seastar-09', 0, {}, reloadedProjects),
      'seastar_flagship',
    );

    // Duplicate ID rejected cleanly
    const dup = createProjectFromShipAsset({
      asset: seastarAsset,
      projectId: 'proj01',
      projectCode: 'VSL-01',
      projectName: '중복 테스트',
      existingProjectIds: new Set(ships.map((s) => s.id)),
    });
    assert.equal(dup.ok, false);
  });

  it('5) hides ship editing from default users in RadialActionMenu, offers selectable SEDMS/hub entry options, and keeps all Admin/Bridge buttons accessible', () => {
    const ships = mapProjectsToHarborShips(getPreviewDemoProjects(1_700_000_000_000));
    const registry = getPreviewHubRegistry();
    const summary = getPreviewHubSummary(ships[0].id);
    const chips = mergeHubModuleChips(registry, summary);

    // Pure option builder honors server-supplied entryUrl and marks planned modules disabled
    const options = buildProjectEntryOptions(ships[0], chips);
    assert.ok(options.some((o) => o.id === 'sedms' && !o.disabled && o.href?.startsWith('/api/sedms-sso')));
    assert.ok(options.some((o) => o.id === 'hub-secms' && !o.disabled));
    assert.ok(options.some((o) => o.id === 'hub-s360' && o.disabled && o.href === null));
    assert.ok(options.some((o) => o.id === 'talk' && !o.disabled));
    assert.ok(options.some((o) => o.id === 'nas' && !o.disabled));
    assert.ok(options.some((o) => o.id === 'bmail' && !o.disabled));

    // Default user RadialActionMenu (canEditShip omitted => false)
    const radialHtml = renderToStaticMarkup(
      React.createElement(RadialActionMenu, {
        target: { kind: 'ship', ship: ships[0], anchor: { x: 640, y: 400 } },
        runtimeEnv: 'preview',
        hubRegistry: registry,
        hubChips: chips,
        onBoardShip: () => {},
        onOpenAdminForShip: () => {},
        onOpenPreviewBridge: () => {},
        onRenameShip: () => ({ ok: true }),
        onRotateShipStep: () => {},
        onPreviewLinkBlocked: () => {},
        onClose: () => {},
      }),
    );
    assert.ok(radialHtml.includes('data-testid="project-entry-options-section"'));
    assert.ok(radialHtml.includes('data-testid="project-entry-launch-btn"'));
    assert.equal(radialHtml.includes('data-testid="ship-rename-toggle"'), false);
    assert.equal(radialHtml.includes('data-testid="ship-rotate-toggle"'), false);
    assertEveryButtonHasAriaLabel(radialHtml, 'RadialActionMenu(default-user)');

    // AdminHarborModal renders all 3 tabs cleanly with explicit aria-labels on every button
    for (const tab of ['ships', 'assets', 'verify'] as const) {
      const adminHtml = renderToStaticMarkup(
        React.createElement(AdminHarborModal, {
          open: true,
          initialTab: tab,
          runtimeEnv: 'preview',
          ships,
          shipDisplayPrefs: {},
          savedShipAssets: [],
          addedProjectShips: [],
          onRenameShip: () => ({ ok: true }),
          onRotateShipStep: () => {},
          onRotateShipAbsolute: () => {},
          onSnapShipParallel: () => {},
          onChangeShipAsset: () => {},
          onSaveShipAsAsset: () => {},
          onSaveAllShipsAsAssets: () => {},
          onAddProjectFromAsset: () => ({ ok: true }),
          onRemoveAddedProject: () => {},
          onClose: () => {},
        }),
      );
      assert.ok(adminHtml.includes('data-testid="admin-harbor-modal"'));
      assertEveryButtonHasAriaLabel(adminHtml, `AdminHarborModal(${tab})`);
    }

    // SgwBridgePreviewModal renders target URL & actionable buttons cleanly
    const bridgeHtml = renderToStaticMarkup(
      React.createElement(SgwBridgePreviewModal, {
        target: {
          featureLabel: 'SEDMS 프로젝트(VSL-01)',
          targetUrl: '/api/sedms-sso?return=%2Fproject%2Fproj01',
          projectId: ships[0].id,
          projectName: ships[0].name,
          kind: 'sedms',
        },
        runtimeEnv: 'preview',
        hubRegistry: registry,
        onBoardShip: () => {},
        onOpenReport: () => {},
        onOpenAdminTab: () => {},
        onClose: () => {},
      }),
    );
    assert.ok(bridgeHtml.includes('data-testid="sgw-bridge-preview-modal"'));
    assert.ok(bridgeHtml.includes('/api/sedms-sso?return=%2Fproject%2Fproj01'));
    assertEveryButtonHasAriaLabel(bridgeHtml, 'SgwBridgePreviewModal');
  });
});
