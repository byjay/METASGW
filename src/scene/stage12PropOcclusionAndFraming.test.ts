import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import * as THREE from 'three';
import {
  CAMERA_MIN_LAND_CLEARANCE_Y,
  CAMERA_MIN_WATER_CLEARANCE_Y,
  CAMERA_WHEEL_MIN_DISTANCE,
  clampCloseZoomCameraFraming,
  distancePointToAabb,
  estimateWaterScreenFraction,
  HARBOR_ALL_OBSTACLES,
  HARBOR_PROP_COLLIDERS,
  isOnWalkableLand,
  PLAYER_DEFAULT_SPAWN,
  PLAYER_POLE_MIN_CLEARANCE,
  QUAY_LAMP_POSITIONS,
  QUAY_MAIN_DECK_Y,
  sampleHarborElevation,
  WORKER_CHEST_HEIGHT_OFFSET,
} from '../core/physicsCollision';
import { mapProjectsToHarborShips } from '../mapping';
import { assignHubBuildingSlots } from '../meta/hubBuildingModel';
import { mergeHubModuleChips } from '../meta/hubChipModel';
import { getPreviewHubRegistry, getPreviewHubSummary } from '../meta/hubFixtures';
import { getPreviewDemoProjects } from '../previewFixtures';
import { buildHumanoidEngineerAvatar } from './humanoidAvatar';
import { buildShipyardWorld } from './shipyardWorld';
import {
  OCCLUDED_VERTICAL_PROP_OPACITY,
  SuperstructureOcclusionController,
} from './superstructureOcclusion';
import type { HarborTexturePack } from './textures';

function createStubTextures(): HarborTexturePack {
  const dummy = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
  const asCanvasTex = dummy as unknown as THREE.CanvasTexture;
  return {
    concreteAlbedo: asCanvasTex,
    concreteBump: asCanvasTex,
    concreteRoughness: asCanvasTex,
    asphaltRoad: asCanvasTex,
    hazardTrim: asCanvasTex,
    curtainWall: asCanvasTex,
    containerRib: asCanvasTex,
    containerRibBump: asCanvasTex,
    containerRibRoughness: asCanvasTex,
    hullSteelPlates: asCanvasTex,
    craneBannerOrange: asCanvasTex,
    craneBannerBlue: asCanvasTex,
    waterNormals: asCanvasTex,
    cloudPuff: asCanvasTex,
    contactShadow: asCanvasTex,
    seastarSkyBanner: asCanvasTex,
    usedOffscreenCanvas: false,
    createSignboard: () => asCanvasTex,
    createHubBuildingSignboard: () => asCanvasTex,
    createAvatarBillboardIcon: () => asCanvasTex,
    dispose: () => {
      dummy.dispose();
    },
  };
}

function projectBoxToNdc(
  box: THREE.Box3,
  camera: THREE.PerspectiveCamera,
): { minX: number; maxX: number; minY: number; maxY: number } {
  const corners = [
    new THREE.Vector3(box.min.x, box.min.y, box.min.z),
    new THREE.Vector3(box.min.x, box.min.y, box.max.z),
    new THREE.Vector3(box.min.x, box.max.y, box.min.z),
    new THREE.Vector3(box.min.x, box.max.y, box.max.z),
    new THREE.Vector3(box.max.x, box.min.y, box.min.z),
    new THREE.Vector3(box.max.x, box.min.y, box.max.z),
    new THREE.Vector3(box.max.x, box.max.y, box.min.z),
    new THREE.Vector3(box.max.x, box.max.y, box.max.z),
  ];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const pt of corners) {
    pt.project(camera);
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  }
  return { minX, maxX, minY, maxY };
}

function collectMeshMaterials(root: THREE.Object3D): THREE.Material[] {
  const out: THREE.Material[] = [];
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (Array.isArray(obj.material)) out.push(...obj.material);
    else if (obj.material) out.push(obj.material);
  });
  return out;
}

describe('Stage 12 — Vertical Prop Sightline Occlusion (0.15), Open-Plaza Player Spawn & Unobstructed Full-Body Max Zoom', () => {
  it('1. places default player spawn >= 1.5m away from every lamp post and prop collider on solid walkable quay', () => {
    assert.ok(PLAYER_POLE_MIN_CLEARANCE >= 1.5);
    assert.ok(
      isOnWalkableLand(PLAYER_DEFAULT_SPAWN.x, PLAYER_DEFAULT_SPAWN.z),
      'PLAYER_DEFAULT_SPAWN must stand on solid walkable quay deck',
    );

    // Must be >= 1.5m from every lamp post (especially central lamp at (0, -4.8))
    for (let i = 0; i < QUAY_LAMP_POSITIONS.length; i += 1) {
      const lp = QUAY_LAMP_POSITIONS[i];
      const dist = Math.hypot(PLAYER_DEFAULT_SPAWN.x - lp.x, PLAYER_DEFAULT_SPAWN.z - lp.z);
      assert.ok(
        dist >= PLAYER_POLE_MIN_CLEARANCE,
        `PLAYER_DEFAULT_SPAWN is only ${dist.toFixed(2)}m from lamp #${i} (${lp.x}, ${lp.z}), must be >= ${PLAYER_POLE_MIN_CLEARANCE}m`,
      );
    }

    // Must be >= 1.5m from every quay prop collider (lamps, benches, planters)
    for (const box of HARBOR_PROP_COLLIDERS) {
      const dist = distancePointToAabb(PLAYER_DEFAULT_SPAWN, box);
      assert.ok(
        dist >= PLAYER_POLE_MIN_CLEARANCE,
        `PLAYER_DEFAULT_SPAWN is only ${dist.toFixed(2)}m from '${box.id}', must be >= ${PLAYER_POLE_MIN_CLEARANCE}m`,
      );
    }

    // HarborScene initializes playerPos using PLAYER_DEFAULT_SPAWN and PLAYER_POLE_MIN_CLEARANCE
    const sceneSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/scene/HarborScene.ts'), 'utf8');
    assert.ok(sceneSrc.includes('PLAYER_DEFAULT_SPAWN'), 'HarborScene must use PLAYER_DEFAULT_SPAWN');
    assert.ok(
      sceneSrc.includes('PLAYER_POLE_MIN_CLEARANCE'),
      'HarborScene must enforce PLAYER_POLE_MIN_CLEARANCE',
    );
  });

  it('2. fades all occluding vertical props (lamp posts, flagpoles, pillars/trees, scaffolding, signboards) to opacity 0.15 and restores cleanly', () => {
    assert.equal(OCCLUDED_VERTICAL_PROP_OPACITY, 0.15);

    const scene = new THREE.Scene();
    const textures = createStubTextures();
    const world = buildShipyardWorld(scene, textures);

    // Sync business ships (flagpoles) and hub buildings (planned scaffolding + signboards + beacons)
    const ships = mapProjectsToHarborShips(getPreviewDemoProjects());
    world.syncProjectShips(ships, false);
    const hubChips = mergeHubModuleChips(getPreviewHubRegistry(), getPreviewHubSummary('proj01'));
    world.syncHubBuildings(assignHubBuildingSlots(hubChips), false);
    scene.updateMatrixWorld(true);

    const names = world.occludableVerticalProps.map((o) => o.name);
    const lampCount = names.filter((n) => n.startsWith('vertical_prop:lamp_')).length;
    const flagpoleCount = names.filter((n) => n.startsWith('vertical_prop:flagpole:')).length;
    const pillarLikeCount = names.filter(
      (n) =>
        n.startsWith('vertical_prop:lighthouse_') ||
        n.startsWith('vertical_prop:crane_') ||
        n.startsWith('vertical_prop:tree_'),
    ).length;
    const scaffoldingCount = names.filter((n) => n === 'hub-building-scaffolding').length;
    const signboardCount = names.filter(
      (n) => n.startsWith('vertical_prop:portal_sign:') || n.startsWith('vertical_prop:hub_sign:'),
    ).length;

    assert.equal(lampCount, QUAY_LAMP_POSITIONS.length, 'All 13 lamp posts must be occludable vertical props');
    assert.ok(flagpoleCount >= 1, 'Business ship flagpoles must be registered as occludable vertical props');
    assert.ok(pillarLikeCount >= 12, 'Lighthouses, cranes & quay tree pillars must be registered');
    assert.ok(scaffoldingCount >= 1, 'Planned hub building scaffolding must be registered');
    assert.ok(signboardCount >= 5, 'Portal & hub building signboards must be registered');

    const controller = new SuperstructureOcclusionController();
    const propOpts = { corridorRadius: 0.75, verticalProbeOffsets: [0, 1.15, -1.05] };

    // Scenario A: Exact Stage 12 bug reproduction — central lamp post #4 at (0, -4.8) directly between camera and character
    const centralLamp = world.occludableVerticalProps.find((o) => o.name === 'vertical_prop:lamp_4')!;
    const distantLamp = world.occludableVerticalProps.find((o) => o.name === 'vertical_prop:lamp_0')!;
    assert.ok(centralLamp && distantLamp);

    const camBehindLamp = new THREE.Vector3(0, QUAY_MAIN_DECK_Y + 2.8, -2.0);
    const charBehindLamp = new THREE.Vector3(0, QUAY_MAIN_DECK_Y + WORKER_CHEST_HEIGHT_OFFSET, -7.5);
    const fadedLampNames = controller.update(
      camBehindLamp,
      charBehindLamp,
      world.occludableVerticalProps,
      OCCLUDED_VERTICAL_PROP_OPACITY,
      propOpts,
    );

    assert.ok(
      fadedLampNames.includes('vertical_prop:lamp_4'),
      `Central lamp post must fade when blocking camera->character, got [${fadedLampNames.join(', ')}]`,
    );
    for (const mat of collectMeshMaterials(centralLamp)) {
      assert.equal(mat.opacity, OCCLUDED_VERTICAL_PROP_OPACITY, 'Occluding lamp must fade to 0.15');
      assert.equal(mat.transparent, true);
      assert.equal(mat.depthWrite, false);
    }
    // Unrelated distant lamp stays 100% opaque (independent cloned material)
    for (const mat of collectMeshMaterials(distantLamp)) {
      assert.equal(mat.opacity, 1, 'Non-occluding lamp must remain fully opaque');
      assert.equal(mat.transparent, false);
      assert.equal(mat.depthWrite, true);
    }

    // Move camera clear -> central lamp restores exact original material state
    const clearCam = new THREE.Vector3(PLAYER_DEFAULT_SPAWN.x, QUAY_MAIN_DECK_Y + 2.8, -3.0);
    const clearTarget = new THREE.Vector3(
      PLAYER_DEFAULT_SPAWN.x,
      QUAY_MAIN_DECK_Y + WORKER_CHEST_HEIGHT_OFFSET,
      PLAYER_DEFAULT_SPAWN.z,
    );
    const afterClear = controller.update(
      clearCam,
      clearTarget,
      world.occludableVerticalProps,
      OCCLUDED_VERTICAL_PROP_OPACITY,
      propOpts,
    );
    assert.equal(afterClear.length, 0, 'Open-plaza player sightline must have 0 occluded vertical props');
    for (const mat of collectMeshMaterials(centralLamp)) {
      assert.equal(mat.opacity, 1, 'Cleared lamp must restore opacity to 1.0');
      assert.equal(mat.transparent, false);
      assert.equal(mat.depthWrite, true);
    }

    // Scenario B: Verify flagpole, scaffolding, and signboard also fade to 0.15 and restore to 1.0
    const sampleTargets = [
      world.occludableVerticalProps.find((o) => o.name.startsWith('vertical_prop:flagpole:'))!,
      world.occludableVerticalProps.find((o) => o.name === 'hub-building-scaffolding')!,
      world.occludableVerticalProps.find((o) => o.name.startsWith('vertical_prop:portal_sign:'))!,
    ];
    for (const propObj of sampleTargets) {
      assert.ok(propObj, 'Expected vertical prop category to exist');
      const box = new THREE.Box3().setFromObject(propObj);
      const center = box.getCenter(new THREE.Vector3());
      const camA = new THREE.Vector3(center.x, center.y, center.z + 6);
      const targetB = new THREE.Vector3(center.x, center.y, center.z - 6);
      const hitNames = controller.update(
        camA,
        targetB,
        world.occludableVerticalProps,
        OCCLUDED_VERTICAL_PROP_OPACITY,
        propOpts,
      );
      assert.ok(
        hitNames.includes(propObj.name),
        `Vertical prop '${propObj.name}' must fade when between camera and target`,
      );
      for (const mat of collectMeshMaterials(propObj)) {
        assert.equal(mat.opacity, OCCLUDED_VERTICAL_PROP_OPACITY, `'${propObj.name}' must fade to 0.15`);
      }

      // Clear sightline and verify restoration
      controller.update(clearCam, clearTarget, world.occludableVerticalProps, OCCLUDED_VERTICAL_PROP_OPACITY, propOpts);
      for (const mat of collectMeshMaterials(propObj)) {
        assert.equal(mat.opacity, 1, `'${propObj.name}' must restore opacity to 1.0 after clearing`);
        assert.equal(mat.transparent, false);
        assert.equal(mat.depthWrite, true);
      }
    }

    world.dispose();
    textures.dispose();
  });

  it('3. keeps full player body (head to boots) unobstructed inside HUD-safe frame at 1440x900 and 375x812 max wheel zoom with water <= 40%', () => {
    const scene = new THREE.Scene();
    const textures = createStubTextures();
    const world = buildShipyardWorld(scene, textures);
    scene.updateMatrixWorld(true);

    const playerY = sampleHarborElevation(PLAYER_DEFAULT_SPAWN.x, PLAYER_DEFAULT_SPAWN.z);
    assert.equal(playerY, QUAY_MAIN_DECK_Y);

    const rig = buildHumanoidEngineerAvatar({
      isPartner: false,
      shirtHex: '#0284c7',
      skipContactShadow: true,
      isCurrentUser: true,
    });
    rig.group.position.set(PLAYER_DEFAULT_SPAWN.x, playerY, PLAYER_DEFAULT_SPAWN.z);
    rig.group.updateMatrixWorld(true);
    const playerBox = new THREE.Box3().setFromObject(rig.group);

    // Simulate max wheel zoom directly from default Harbor View (azimuth = 0)
    const framedDefault = clampCloseZoomCameraFraming(
      { x: 0, y: 3.0 + 1.8, z: 22 + 3.0 },
      { x: 0, y: 3.0, z: 22 },
      PLAYER_DEFAULT_SPAWN,
      HARBOR_ALL_OBSTACLES,
    );
    assert.ok(
      Math.hypot(
        framedDefault.targetPos.x - PLAYER_DEFAULT_SPAWN.x,
        framedDefault.targetPos.z - PLAYER_DEFAULT_SPAWN.z,
      ) < 0.05,
      'Harbor View max wheel zoom must anchor directly onto PLAYER_DEFAULT_SPAWN',
    );
    assert.ok(framedDefault.distance >= CAMERA_WHEEL_MIN_DISTANCE - 1e-4);

    // Zero vertical props block the default max-zoom sightline to the player
    const occluder = new SuperstructureOcclusionController();
    const occludedAtMaxZoom = occluder.update(
      new THREE.Vector3(framedDefault.cameraPos.x, framedDefault.cameraPos.y, framedDefault.cameraPos.z),
      new THREE.Vector3(framedDefault.targetPos.x, framedDefault.targetPos.y, framedDefault.targetPos.z),
      world.occludableVerticalProps,
      OCCLUDED_VERTICAL_PROP_OPACITY,
      { corridorRadius: 0.75, verticalProbeOffsets: [0, 1.15, -1.05] },
    );
    assert.equal(
      occludedAtMaxZoom.length,
      0,
      `Expected 0 occluding poles on default max wheel zoom, found: ${occludedAtMaxZoom.join(', ')}`,
    );

    // Verify full-body framing (head below top HUD, boots above bottom dock) at BOTH 1440x900 & 375x812
    for (const vp of [
      { label: '1440x900', width: 1440, height: 900 },
      { label: '375x812', width: 375, height: 812 },
    ]) {
      const cam = new THREE.PerspectiveCamera(50, vp.width / vp.height, 0.25, 3600);
      cam.position.set(framedDefault.cameraPos.x, framedDefault.cameraPos.y, framedDefault.cameraPos.z);
      cam.lookAt(framedDefault.targetPos.x, framedDefault.targetPos.y, framedDefault.targetPos.z);
      cam.updateMatrixWorld(true);

      const ndc = projectBoxToNdc(playerBox, cam);
      const heightFrac = (ndc.maxY - ndc.minY) / 2;
      // Top HUD takes ~10% on 1440x900 and ~14% on 375x812 (ndcY > +0.72); bottom dock takes ~9% (ndcY < -0.82)
      assert.ok(
        ndc.maxY <= 0.72,
        `${vp.label}: Player head too close to top HUD (maxY=${ndc.maxY.toFixed(3)})`,
      );
      assert.ok(
        ndc.minY >= -0.78,
        `${vp.label}: Player boots too close to bottom dock (minY=${ndc.minY.toFixed(3)})`,
      );
      assert.ok(
        ndc.minX >= -0.85 && ndc.maxX <= 0.85,
        `${vp.label}: Player clipped horizontally ([${ndc.minX.toFixed(2)}, ${ndc.maxX.toFixed(2)}])`,
      );
      assert.ok(
        heightFrac >= 1 / 3 && heightFrac <= 0.75,
        `${vp.label}: Player screen height fraction (${heightFrac.toFixed(3)}) must stay in [0.333, 0.75]`,
      );
    }

    // Water ratio <= 40% & zero floor clip across 360° orbit around PLAYER_DEFAULT_SPAWN
    for (let i = 0; i < 8; i += 1) {
      const az = (i / 8) * Math.PI * 2;
      const framed = clampCloseZoomCameraFraming(
        {
          x: PLAYER_DEFAULT_SPAWN.x + 3.2 * Math.sin(az),
          y: playerY + 1.2,
          z: PLAYER_DEFAULT_SPAWN.z + 3.2 * Math.cos(az),
        },
        { x: PLAYER_DEFAULT_SPAWN.x, y: playerY + 0.5, z: PLAYER_DEFAULT_SPAWN.z },
        PLAYER_DEFAULT_SPAWN,
        HARBOR_ALL_OBSTACLES,
      );
      const waterRatio = estimateWaterScreenFraction(framed.cameraPos, framed.targetPos, 50, 121);
      assert.ok(
        waterRatio <= 0.4,
        `Water ratio ${(waterRatio * 100).toFixed(1)}% exceeded 40% at az=${az.toFixed(2)}`,
      );
      const minY = isOnWalkableLand(framed.cameraPos.x, framed.cameraPos.z, 0)
        ? sampleHarborElevation(framed.cameraPos.x, framed.cameraPos.z) + CAMERA_MIN_LAND_CLEARANCE_Y
        : CAMERA_MIN_WATER_CLEARANCE_Y;
      assert.ok(framed.cameraPos.y >= minY - 1e-4);
    }

    rig.dispose();
    world.dispose();
    textures.dispose();
  });

  it('4. strictly locks LookAt target to worker chest height and clamps pitch against extreme low/high alignment on main deck and raised terrace', () => {
    const rig = buildHumanoidEngineerAvatar({
      isPartner: false,
      shirtHex: '#0284c7',
      skipContactShadow: true,
      isCurrentUser: true,
    });

    const locations = [
      { label: 'main-quay', x: PLAYER_DEFAULT_SPAWN.x, z: PLAYER_DEFAULT_SPAWN.z },
      { label: 'observation-terrace', x: 0, z: -16.2 },
    ];
    const extremeScenarios = [
      // Hostile low target (at boots) + ground-skimming upward-tilted camera
      { targetOffsetY: 0.0, camDeltaY: -1.4 },
      // Hostile high target (above helmet) + steep bird's-eye overhead camera
      { targetOffsetY: 3.8, camDeltaY: 4.9 },
      // Neutral horizontal eye-level input
      { targetOffsetY: 1.46, camDeltaY: 0.8 },
    ];

    for (const loc of locations) {
      const deckY = sampleHarborElevation(loc.x, loc.z);
      const expectedChestY = deckY + WORKER_CHEST_HEIGHT_OFFSET;
      rig.group.position.set(loc.x, deckY, loc.z);
      rig.group.updateMatrixWorld(true);
      const workerBox = new THREE.Box3().setFromObject(rig.group);

      for (const sc of extremeScenarios) {
        for (let i = 0; i < 8; i += 1) {
          const az = (i / 8) * Math.PI * 2;
          const framed = clampCloseZoomCameraFraming(
            {
              x: loc.x + 4.0 * Math.sin(az),
              y: deckY + sc.targetOffsetY + sc.camDeltaY,
              z: loc.z + 4.0 * Math.cos(az),
            },
            { x: loc.x, y: deckY + sc.targetOffsetY, z: loc.z },
            { x: loc.x, z: loc.z },
            HARBOR_ALL_OBSTACLES,
          );

          // 1) LookAt target Y is locked strictly to exact worker chest height
          assert.ok(
            Math.abs(framed.targetPos.y - expectedChestY) < 1e-4,
            `${loc.label}: LookAt Y (${framed.targetPos.y.toFixed(3)}) must equal chest height (${expectedChestY.toFixed(3)})`,
          );

          // 2) Camera elevation stays in ergonomic worker shoulder-to-helmet band (never too low or too high)
          assert.ok(
            framed.cameraPos.y >= deckY + 1.9 && framed.cameraPos.y <= deckY + 3.15,
            `${loc.label}: Camera Y (${framed.cameraPos.y.toFixed(2)}) outside ergonomic worker band [${(deckY + 1.9).toFixed(2)}, ${(deckY + 3.15).toFixed(2)}]`,
          );

          // 3) Full worker body stays symmetrically centered in HUD-safe viewport on both 1440x900 & 375x812
          for (const aspect of [1440 / 900, 375 / 812]) {
            const cam = new THREE.PerspectiveCamera(50, aspect, 0.25, 3600);
            cam.position.set(framed.cameraPos.x, framed.cameraPos.y, framed.cameraPos.z);
            cam.lookAt(framed.targetPos.x, framed.targetPos.y, framed.targetPos.z);
            cam.updateMatrixWorld(true);

            const ndc = projectBoxToNdc(workerBox, cam);
            assert.ok(
              ndc.maxY <= 0.65 && ndc.minY >= -0.68,
              `${loc.label}: Full body drifted out of centered safe band [minY=${ndc.minY.toFixed(3)}, maxY=${ndc.maxY.toFixed(3)}]`,
            );
          }
        }
      }
    }

    rig.dispose();
  });
});
