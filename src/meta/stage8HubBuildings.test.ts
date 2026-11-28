import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as THREE from 'three';
import { PORTAL_BUILDINGS, type ObstacleBox2D } from '../core/navMeshEngine';
import {
  HARBOR_STATIC_COLLIDERS,
  resolveAvatarPhysicsMovement,
} from '../core/physicsCollision';
import {
  buildRadialMenuActions,
  RadialActionMenu,
} from '../components/RadialActionMenu';
import { buildHubModuleBuilding3D } from '../scene/hubBuildings3D';
import { buildShipyardWorld } from '../scene/shipyardWorld';
import type { HarborTexturePack } from '../scene/textures';
import {
  assignHubBuildingSlots,
  buildHubBuildingColliders,
  HUB_BUILDING_LOTS,
  resolveHubBuildingAppearance,
} from './hubBuildingModel';
import { mergeHubModuleChips } from './hubChipModel';
import { getPreviewHubRegistry, getPreviewHubSummary } from './hubFixtures';
import type { MetaHubSummaryResponse, MetaRegistryResponse } from './hubTypes';

function createHeadlessTexturePack(): HarborTexturePack {
  const make = () =>
    new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1) as unknown as THREE.CanvasTexture;
  return {
    concreteAlbedo: make(),
    concreteBump: make(),
    concreteRoughness: make(),
    asphaltRoad: make(),
    hazardTrim: make(),
    curtainWall: make(),
    containerRib: make(),
    containerRibBump: make(),
    containerRibRoughness: make(),
    hullSteelPlates: make(),
    waterNormals: make(),
    contactShadow: make(),
    cloudPuff: make(),
    craneBannerOrange: make(),
    craneBannerBlue: make(),
    seastarSkyBanner: make(),
    usedOffscreenCanvas: false,
    createSignboard: () => make(),
    createHubBuildingSignboard: () => make(),
    createAvatarBillboardIcon: () => make(),
    dispose: () => {},
  };
}

function boxesOverlap(a: ObstacleBox2D, b: ObstacleBox2D): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

describe('Stage 8 — Planned & Hub Systems as 3D Harbor Buildings', () => {
  it('places s360, secad, pdf, mail, secms onto dedicated lots while keeping sgw/sedms excluded and existing portals untouched', () => {
    const registry = getPreviewHubRegistry();
    const summary = getPreviewHubSummary('proj01');
    const chips = mergeHubModuleChips(registry, summary);
    const placements = assignHubBuildingSlots(chips);

    const ids = placements.map((p) => p.moduleId);
    assert.equal(ids.includes('sgw'), false, 'sgw uses existing SGW Portal Pavilions');
    assert.equal(ids.includes('sedms'), false, 'sedms uses docked SEDMS business project ships');

    for (const expectedId of ['s360', 'secad', 'pdf', 'mail', 'secms']) {
      assert.ok(ids.includes(expectedId), `Expected harbor building for ${expectedId}`);
    }

    // Existing 4 SGW Portal Buildings remain 100% untouched
    assert.deepEqual(
      PORTAL_BUILDINGS.map((b) => b.id),
      ['talk', 'nas', 'bmail', 'admin'],
    );

    // Every placed lot is unique
    const uniqueLotIds = new Set(placements.map((p) => p.lot.lotId));
    assert.equal(uniqueLotIds.size, placements.length);
  });

  it('guarantees zero footprint overlap across all 13 HUB_BUILDING_LOTS and existing static harbor colliders', () => {
    const allLotsAsPlacements = HUB_BUILDING_LOTS.map((lot, idx) => ({
      moduleId: `lot_probe_${idx}`,
      chip: {
        moduleId: `lot_probe_${idx}`,
        name: `테스트 ${idx}`,
        status: 'planned' as const,
        statusLabel: '준비 중',
        summaryText: '준비 중',
        tooltipText: '준비 중',
        entryUrl: null,
        disabled: true,
        disabledReason: '준비 중',
        kpi: {},
        updatedAt: null,
      },
      lot,
      archetype: lot.archetype,
      appearance: resolveHubBuildingAppearance('planned'),
    }));

    const lotBoxes = buildHubBuildingColliders(allLotsAsPlacements);

    // 1. No two lots overlap each other
    for (let i = 0; i < lotBoxes.length; i += 1) {
      for (let j = i + 1; j < lotBoxes.length; j += 1) {
        assert.equal(
          boxesOverlap(lotBoxes[i], lotBoxes[j]),
          false,
          `Hub lots ${HUB_BUILDING_LOTS[i].lotId} and ${HUB_BUILDING_LOTS[j].lotId} overlap`,
        );
      }
    }

    // 2. No lot overlaps any existing static collider (portal buildings, crane bogies, benches, terrace)
    for (let i = 0; i < lotBoxes.length; i += 1) {
      for (const staticBox of HARBOR_STATIC_COLLIDERS) {
        assert.equal(
          boxesOverlap(lotBoxes[i], staticBox),
          false,
          `Hub lot ${HUB_BUILDING_LOTS[i].lotId} overlaps static collider ${staticBox.id}`,
        );
      }
    }
  });

  it('auto-spawns newly added registry systems onto empty lots deterministically independent of array order', () => {
    const baseRegistry = getPreviewHubRegistry();
    const extraModules = [
      {
        moduleId: 'erp_materials',
        name: '자재 ERP',
        status: 'planned' as const,
        capabilities: ['materials'],
        entryUrl: null,
      },
      {
        moduleId: 'iot_welding',
        name: 'IoT 용접관제',
        status: 'active' as const,
        capabilities: ['telemetry'],
        entryUrl: '/iot/welding',
      },
      {
        moduleId: 'safety_gate',
        name: '안전관리 포털',
        status: 'warn' as const,
        capabilities: ['safety'],
        entryUrl: '/safety/gate',
      },
    ];

    const regForward: MetaRegistryResponse = {
      modules: [...baseRegistry.modules, ...extraModules],
    };
    const regReversed: MetaRegistryResponse = {
      modules: [...extraModules.slice().reverse(), ...baseRegistry.modules.slice().reverse()],
    };

    const forwardPlacements = assignHubBuildingSlots(mergeHubModuleChips(regForward, null));
    const reversedPlacements = assignHubBuildingSlots(mergeHubModuleChips(regReversed, null));

    const forwardLotByMod = new Map(forwardPlacements.map((p) => [p.moduleId, p.lot.lotId]));
    const reversedLotByMod = new Map(reversedPlacements.map((p) => [p.moduleId, p.lot.lotId]));

    for (const extra of extraModules) {
      assert.ok(forwardLotByMod.has(extra.moduleId), `Missing auto-spawned lot for ${extra.moduleId}`);
      assert.equal(
        forwardLotByMod.get(extra.moduleId),
        reversedLotByMod.get(extra.moduleId),
        `Lot assignment for ${extra.moduleId} must be independent of registry array order`,
      );
    }

    // Overflow (> 13 modules) also allocates deterministic rear overflow lots without crashing
    const manyModules: MetaRegistryResponse = {
      modules: [
        ...baseRegistry.modules,
        ...Array.from({ length: 12 }, (_, idx) => ({
          moduleId: `future_sys_${idx}`,
          name: `확장 시스템 ${idx}`,
          status: 'planned' as const,
          capabilities: [],
          entryUrl: null,
        })),
      ],
    };
    const manyPlacements = assignHubBuildingSlots(mergeHubModuleChips(manyModules, null));
    assert.equal(manyPlacements.length, 5 + 12);
    assert.equal(new Set(manyPlacements.map((p) => p.lot.lotId)).size, manyPlacements.length);
  });

  it('builds 3D scaffolding + unlit windows for planned, and illuminated clean facade for active (and transitions cleanly)', () => {
    const textures = createHeadlessTexturePack();
    const scene = new THREE.Scene();
    const world = buildShipyardWorld(scene, textures);

    const registry = getPreviewHubRegistry();
    const summaryProj01 = getPreviewHubSummary('proj01');
    const chipsProj01 = mergeHubModuleChips(registry, summaryProj01);
    const placementsProj01 = assignHubBuildingSlots(chipsProj01);

    world.syncHubBuildings(placementsProj01, false);
    assert.equal(world.hubBuildings.length, 5);
    assert.equal(world.clickableHubBuildingProxies.length, 5);

    // s360 is planned -> MUST have 3D scaffolding, NO cornice light, unlit facade
    const s360Planned = world.hubBuildings.find((b) => b.placement.moduleId === 's360');
    assert.ok(s360Planned, 's360 building must be created');
    assert.ok(
      s360Planned.group.getObjectByName('hub-building-scaffolding'),
      'planned s360 must mount 3D scaffolding',
    );
    assert.equal(
      s360Planned.group.getObjectByName('hub-building-cornice-light'),
      undefined,
      'planned s360 must NOT have illuminated cornice',
    );
    assert.equal(s360Planned.placement.appearance.lightsOn, false);
    assert.equal(s360Planned.placement.appearance.signBannerText, '준비 중');

    // secms is active on proj01 -> NO scaffolding, HAS illuminated cornice + lit windows
    const secmsActive = world.hubBuildings.find((b) => b.placement.moduleId === 'secms');
    assert.ok(secmsActive, 'secms building must be created');
    assert.equal(
      secmsActive.group.getObjectByName('hub-building-scaffolding'),
      undefined,
      'active secms must NOT mount scaffolding',
    );
    assert.ok(
      secmsActive.group.getObjectByName('hub-building-cornice-light'),
      'active secms must mount illuminated cornice light',
    );
    assert.equal(secmsActive.placement.appearance.lightsOn, true);

    // Transition s360 from planned -> active: scaffolding disappears & lights turn on at the SAME lot!
    const upgradedSummary: MetaHubSummaryResponse = {
      ...summaryProj01,
      modules: summaryProj01.modules.map((m) =>
        m.moduleId === 's360'
          ? {
              ...m,
              status: 'active',
              summaryText: '360° 현장스캔 정상 운영 중',
              entryUrl: '/s360/proj01',
              kpi: { scanPoints: 42 },
            }
          : m,
      ),
    };
    const upgradedPlacements = assignHubBuildingSlots(
      mergeHubModuleChips(registry, upgradedSummary),
    );
    world.syncHubBuildings(upgradedPlacements, false);

    const s360Active = world.hubBuildings.find((b) => b.placement.moduleId === 's360');
    assert.ok(s360Active);
    assert.equal(
      s360Active.placement.lot.lotId,
      s360Planned.placement.lot.lotId,
      'status change must preserve building lot',
    );
    assert.equal(
      s360Active.group.getObjectByName('hub-building-scaffolding'),
      undefined,
      'upgraded active s360 must remove scaffolding',
    );
    assert.ok(
      s360Active.group.getObjectByName('hub-building-cornice-light'),
      'upgraded active s360 must turn on cornice light',
    );
    assert.equal(s360Active.placement.appearance.lightsOn, true);

    // Verify nosource & unavailable appearances directly
    const nosourceAppearance = resolveHubBuildingAppearance('nosource');
    assert.equal(nosourceAppearance.hasScaffolding, false);
    assert.equal(nosourceAppearance.lightsOn, false);
    assert.equal(nosourceAppearance.signBannerText, '원천 없음');

    const unavailableAppearance = resolveHubBuildingAppearance('unavailable');
    assert.equal(unavailableAppearance.hasScaffolding, false);
    assert.equal(unavailableAppearance.lightsOn, false);
    assert.equal(unavailableAppearance.signBannerText, '일시 오류');

    // Direct lowSpec build smoke test & clean dispose
    const lowSpecRuntime = buildHubModuleBuilding3D(upgradedPlacements[0], textures, true, 0);
    assert.ok(lowSpecRuntime.hitProxy.userData.hubModuleId);
    lowSpecRuntime.dispose();

    world.dispose();
    assert.equal(world.hubBuildings.length, 0);
    assert.equal(world.clickableHubBuildingProxies.length, 0);
  });

  it('generates 2D colliders that block avatar movement from walking through Hub buildings', () => {
    const placements = assignHubBuildingSlots(
      mergeHubModuleChips(getPreviewHubRegistry(), getPreviewHubSummary('proj01')),
    );
    const hubColliders = buildHubBuildingColliders(placements);
    const allColliders = [...HARBOR_STATIC_COLLIDERS, ...hubColliders];

    const pdfBuilding = placements.find((p) => p.moduleId === 'pdf')!;
    const pdfBox = hubColliders.find((c) => c.id === 'hub_building_pdf')!;
    assert.ok(pdfBox);

    // Walk south-to-north into the south wall of the PDF building (realistic frame step)
    const resolved = resolveAvatarPhysicsMovement(
      { x: pdfBuilding.lot.centerX, z: pdfBox.maxZ + 1.0 },
      { x: pdfBuilding.lot.centerX, z: pdfBox.maxZ - 0.3 },
      [],
      allColliders,
    );
    assert.ok(
      resolved.z >= pdfBox.maxZ + 0.5,
      `Avatar should be blocked outside PDF building collider (z=${resolved.z}, maxZ=${pdfBox.maxZ})`,
    );
  });

  it('renders Hub Module Status Card in RadialActionMenu matching HudHubStatusStrip (planned disabled vs active link, honest null KPIs)', () => {
    const registry = getPreviewHubRegistry();
    const summary = getPreviewHubSummary('proj01');
    const chips = mergeHubModuleChips(registry, summary);
    const placements = assignHubBuildingSlots(chips);

    const plannedS360 = placements.find((p) => p.moduleId === 's360')!;
    const activeSecms = placements.find((p) => p.moduleId === 'secms')!;

    assert.deepEqual(
      buildRadialMenuActions({
        kind: 'hub-building',
        chip: plannedS360.chip,
        lotLabel: plannedS360.lot.labelKo,
        anchor: { x: 400, y: 300 },
      }),
      [],
      'Hub building cards must not bleed ship/person 4-way actions',
    );

    const plannedHtml = renderToStaticMarkup(
      React.createElement(RadialActionMenu, {
        target: {
          kind: 'hub-building',
          chip: plannedS360.chip,
          lotLabel: plannedS360.lot.labelKo,
          anchor: { x: 400, y: 300 },
        },
        runtimeEnv: 'sgw',
        viewportSize: { width: 1440, height: 900 },
        onPreviewLinkBlocked: () => {},
        onClose: () => {},
      }),
    );

    assert.ok(plannedHtml.includes('data-testid="hub-building-card"'));
    assert.ok(plannedHtml.includes('data-status="planned"'));
    assert.ok(plannedHtml.includes('준비 중'));
    assert.ok(plannedHtml.includes('data-testid="hub-building-entry-disabled"'));
    assert.equal(
      plannedHtml.includes('data-testid="hub-building-entry-link"'),
      false,
      'planned module with null entryUrl must NEVER fabricate an active link',
    );

    // Active module with explicit server entryUrl + nullable KPI
    const activeWithNullKpi = {
      ...activeSecms.chip,
      kpi: { ...activeSecms.chip.kpi, pendingInspection: null },
    };
    const activeHtml = renderToStaticMarkup(
      React.createElement(RadialActionMenu, {
        target: {
          kind: 'hub-building',
          chip: activeWithNullKpi,
          lotLabel: activeSecms.lot.labelKo,
          anchor: { x: 400, y: 300 },
        },
        runtimeEnv: 'sgw',
        viewportSize: { width: 375, height: 812 },
        onPreviewLinkBlocked: () => {},
        onClose: () => {},
      }),
    );

    assert.ok(activeHtml.includes('data-testid="hub-building-card"'));
    assert.ok(activeHtml.includes('data-status="active"'));
    assert.ok(activeHtml.includes('data-testid="hub-building-entry-link"'));
    assert.ok(
      activeHtml.includes(`href="${activeSecms.chip.entryUrl}"`),
      'Active building card must link strictly to server-supplied entryUrl',
    );
    assert.ok(activeHtml.includes('—'), 'Null KPI values must render as em-dash ("—")');
  });

  it('keeps Hub building status card clamped within 1440x900 and 375x812 viewports with zero horizontal overflow', () => {
    const registry = getPreviewHubRegistry();
    const summary = getPreviewHubSummary('proj01');
    const placements = assignHubBuildingSlots(mergeHubModuleChips(registry, summary));
    const plannedMail = placements.find((p) => p.moduleId === 'mail')!;

    for (const vp of [
      { width: 1440, height: 900 },
      { width: 375, height: 812 },
    ]) {
      // Simulate clicking near far-right edge of viewport to verify center clamping
      const html = renderToStaticMarkup(
        React.createElement(RadialActionMenu, {
          target: {
            kind: 'hub-building',
            chip: plannedMail.chip,
            lotLabel: plannedMail.lot.labelKo,
            anchor: { x: vp.width - 8, y: vp.height - 20 },
          },
          runtimeEnv: 'preview',
          viewportSize: vp,
          onPreviewLinkBlocked: () => {},
          onClose: () => {},
        }),
      );

      assert.ok(
        html.includes('max-w-[calc(100vw-1.25rem)]'),
        `Card at ${vp.width}x${vp.height} must enforce responsive max-width to avoid horizontal overflow`,
      );
      const leftMatch = html.match(/left:(\d+)px/);
      const topMatch = html.match(/top:(\d+)px/);
      assert.ok(leftMatch && topMatch, `Card must compute clamped left/top coordinates for ${vp.width}x${vp.height}`);
      const leftPx = Number(leftMatch[1]);
      const topPx = Number(topMatch[1]);
      assert.ok(
        leftPx >= 168 && leftPx <= vp.width - 168,
        `Clamped left (${leftPx}px) must stay within [${168}, ${vp.width - 168}] for ${vp.width}px width`,
      );
      assert.ok(
        topPx >= 212 && topPx <= vp.height - 212,
        `Clamped top (${topPx}px) must stay within [${212}, ${vp.height - 212}] for ${vp.height}px height`,
      );
    }
  });
});
