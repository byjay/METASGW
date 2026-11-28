import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as THREE from 'three';
import { RadialActionMenu } from '../components/RadialActionMenu';
import {
  AVATAR_PROP_MIN_CLEARANCE,
  CAMERA_MIN_DISTANCE,
  CAMERA_MIN_LAND_CLEARANCE_Y,
  CAMERA_MIN_WATER_CLEARANCE_Y,
  CAMERA_PERSON_FOCUS_DEFAULT_DIST,
  CAMERA_PERSON_FOCUS_MAX_DIST,
  CAMERA_PERSON_FOCUS_MIN_DIST,
  clampCameraCollision,
  computePersonFocusCameraPose,
  computeProjectedScreenHeightFraction,
  distancePointToAabb,
  HARBOR_ALL_OBSTACLES,
  HARBOR_PROP_COLLIDERS,
  QUAY_BENCH_POSITIONS,
  QUAY_LAMP_POSITIONS,
  QUAY_PLANTER_POSITIONS,
  resolveAvatarPropClearance,
  resolveAvatarSpawnOverlaps,
  sampleHarborElevation,
} from '../core/physicsCollision';
import { mapEmployeesToHarborPeople } from '../mapping';
import { assignHubBuildingSlots, buildHubBuildingColliders } from '../meta/hubBuildingModel';
import { mergeHubModuleChips } from '../meta/hubChipModel';
import { getPreviewHubRegistry, getPreviewHubSummary } from '../meta/hubFixtures';
import { getPreviewDemoEmployees, getPreviewDemoPresence } from '../previewFixtures';
import { buildHumanoidEngineerAvatar } from './humanoidAvatar';
import { buildProjectVessel3D, disposeObjectTree } from './projectVesselTypes';
import {
  OCCLUDED_SUPERSTRUCTURE_OPACITY,
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
    usedOffscreenCanvas: false,
    createSignboard: () => asCanvasTex,
    createHubBuildingSignboard: () => asCanvasTex,
    createAvatarBillboardIcon: () => asCanvasTex,
    dispose: () => {
      dummy.dispose();
    },
  };
}

describe('Stage 10 — Close-Up Zoom, Person Focus, Prop Clearance, Occlusion & Worker Detail', () => {
  it('1. lowers camera minDistance so a worker fills >= 1/3 of screen height and never clips below ground or water', () => {
    assert.ok(
      CAMERA_MIN_DISTANCE <= 4.0,
      `CAMERA_MIN_DISTANCE (${CAMERA_MIN_DISTANCE}m) must allow close-up zoom`,
    );

    // Measure actual worker height from the 3D rig
    const rig = buildHumanoidEngineerAvatar({
      isPartner: false,
      shirtHex: '#0284c7',
      skipContactShadow: true,
    });
    rig.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(rig.group);
    const workerHeight = box.max.y - box.min.y;
    assert.ok(workerHeight >= 2.4 && workerHeight <= 3.1, `Unexpected workerHeight: ${workerHeight}`);

    // At max zoom (CAMERA_MIN_DISTANCE) and person focus (3..6m), vertical height fraction >= 1/3
    // Both 1440x900 and 375x812 share the 50° vertical FOV in Three.js PerspectiveCamera
    const fracAtMinZoom = computeProjectedScreenHeightFraction(workerHeight, CAMERA_MIN_DISTANCE, 50);
    const fracAtDefaultFocus = computeProjectedScreenHeightFraction(
      workerHeight,
      CAMERA_PERSON_FOCUS_DEFAULT_DIST,
      50,
    );
    const fracAtMaxFocus = computeProjectedScreenHeightFraction(
      workerHeight,
      CAMERA_PERSON_FOCUS_MAX_DIST,
      50,
    );
    assert.ok(
      fracAtMinZoom >= 1 / 3,
      `Expected worker screen height >= 1/3 at max zoom (${CAMERA_MIN_DISTANCE}m), got ${fracAtMinZoom.toFixed(3)}`,
    );
    assert.ok(
      fracAtDefaultFocus >= 1 / 3,
      `Expected worker screen height >= 1/3 at focus (${CAMERA_PERSON_FOCUS_DEFAULT_DIST}m), got ${fracAtDefaultFocus.toFixed(3)}`,
    );
    assert.ok(
      fracAtMaxFocus >= 1 / 3,
      `Expected worker screen height >= 1/3 at 6m focus, got ${fracAtMaxFocus.toFixed(3)}`,
    );

    // Ground & water floor clamp: camera NEVER dips below concrete deck or sea surface
    const landElevated = sampleHarborElevation(0, -10);
    const clampedOnQuay = clampCameraCollision({ x: 0, y: 0.2, z: -10 }, HARBOR_ALL_OBSTACLES);
    assert.ok(
      clampedOnQuay.y >= landElevated + CAMERA_MIN_LAND_CLEARANCE_Y - 1e-6,
      `Camera on quay must stay above deck + ${CAMERA_MIN_LAND_CLEARANCE_Y}m, got ${clampedOnQuay.y}`,
    );

    const terraceY = sampleHarborElevation(0, -16.2);
    const clampedOnTerrace = clampCameraCollision({ x: 0, y: 1.5, z: -16.2 }, HARBOR_ALL_OBSTACLES);
    assert.ok(
      clampedOnTerrace.y >= terraceY + CAMERA_MIN_LAND_CLEARANCE_Y - 1e-6,
      `Camera on terrace must stay above terrace + ${CAMERA_MIN_LAND_CLEARANCE_Y}m, got ${clampedOnTerrace.y}`,
    );

    const clampedOnWater = clampCameraCollision({ x: 0, y: -3.5, z: 30 }, HARBOR_ALL_OBSTACLES);
    assert.ok(
      clampedOnWater.y >= CAMERA_MIN_WATER_CLEARANCE_Y,
      `Camera over water must stay >= ${CAMERA_MIN_WATER_CLEARANCE_Y}m, got ${clampedOnWater.y}`,
    );

    rig.dispose();
  });

  it('2. computes smooth 3–6m front person-focus camera pose & preserves person card (이름·부서·상태 + [메시지]) at 1440x900 and 375x812', () => {
    const people = mapEmployeesToHarborPeople(
      getPreviewDemoEmployees(),
      getPreviewDemoPresence(),
      'user01',
    );
    const hubChips = mergeHubModuleChips(getPreviewHubRegistry(), getPreviewHubSummary('proj01'));
    const fullColliders = [
      ...HARBOR_ALL_OBSTACLES,
      ...buildHubBuildingColliders(assignHubBuildingSlots(hubChips)),
    ];

    // Standing online colleague and seated away colleague both resolve to [3, 6]m front pose
    const standing = people.find((p) => p.presenceStatus === 'online' && !p.isCurrentUser)!;
    const seated = people.find((p) => p.presenceStatus === 'away')!;
    assert.ok(standing && seated);

    for (const targetPerson of [standing, seated]) {
      const personY = sampleHarborElevation(targetPerson.position.x, targetPerson.position.z);
      const pose = computePersonFocusCameraPose(
        { x: targetPerson.position.x, y: personY, z: targetPerson.position.z },
        targetPerson.facingYaw,
        targetPerson.presenceStatus === 'away',
        fullColliders,
        CAMERA_PERSON_FOCUS_DEFAULT_DIST,
      );

      assert.ok(
        pose.distance >= CAMERA_PERSON_FOCUS_MIN_DIST && pose.distance <= CAMERA_PERSON_FOCUS_MAX_DIST,
        `Focus distance for ${targetPerson.name} must be in [3, 6]m, got ${pose.distance.toFixed(2)}m`,
      );
      const groundAtCam = sampleHarborElevation(pose.cameraPos.x, pose.cameraPos.z);
      const minFloorY =
        groundAtCam > 0.1
          ? groundAtCam + CAMERA_MIN_LAND_CLEARANCE_Y
          : CAMERA_MIN_WATER_CLEARANCE_Y;
      assert.ok(
        pose.cameraPos.y >= minFloorY - 1e-4,
        `Focus camera must stay above floor (${minFloorY}), got ${pose.cameraPos.y}`,
      );
    }

    // Person card renders 이름·부서·상태 + [메시지] cleanly on both desktop 1440x900 & mobile 375x812
    for (const vp of [
      { width: 1440, height: 900 },
      { width: 375, height: 812 },
    ]) {
      const html = renderToStaticMarkup(
        React.createElement(RadialActionMenu, {
          target: { kind: 'person', person: standing, anchor: { x: vp.width / 2, y: vp.height / 2 } },
          runtimeEnv: 'preview',
          viewportSize: vp,
          onFocusPerson3D: () => {},
          onPreviewLinkBlocked: () => {},
          onClose: () => {},
          onEscapeClose: () => {},
        }),
      );
      assert.ok(html.includes(standing.name), `Missing person name at ${vp.width}x${vp.height}`);
      assert.ok(html.includes(standing.dept), `Missing person dept at ${vp.width}x${vp.height}`);
      assert.ok(html.includes(standing.presenceLabelKo), `Missing status label at ${vp.width}x${vp.height}`);
      assert.ok(html.includes('person-card-message-btn'), `Missing [메시지] button at ${vp.width}x${vp.height}`);
      assert.ok(html.includes('메시지'), `Missing [메시지] label at ${vp.width}x${vp.height}`);
    }

    // Verify App.tsx wires person click + drawer select -> focusPerson and Esc / Harbor View -> returnToHomeHarbor
    const appSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf8');
    assert.ok(appSrc.includes('sceneRef.current?.focusPerson(sub)'), 'onPersonClicked must focusPerson');
    assert.ok(
      appSrc.includes('sceneRef.current?.focusPerson(person.sub)'),
      'PeopleFinderDrawer selection must focusPerson',
    );
    assert.ok(
      appSrc.includes('sceneRef.current?.returnToHomeHarbor()'),
      'Esc & Harbor View return must call returnToHomeHarbor()',
    );
  });

  it('3. guarantees >= 0.8m clearance between every person and every lamp, bench, planter, and planned building scaffolding', () => {
    const hubChips = mergeHubModuleChips(getPreviewHubRegistry(), getPreviewHubSummary('proj01'));
    const hubPlacements = assignHubBuildingSlots(hubChips);
    const hubColliders = buildHubBuildingColliders(hubPlacements);
    const allColliders = [...HARBOR_ALL_OBSTACLES, ...hubColliders];

    // Confirm prop colliders cover all 13 lamps, 4 benches, 8 planters + planned scaffolding lots
    assert.equal(
      HARBOR_PROP_COLLIDERS.length,
      QUAY_LAMP_POSITIONS.length + QUAY_BENCH_POSITIONS.length + QUAY_PLANTER_POSITIONS.length,
    );
    const plannedHub = hubPlacements.find((p) => p.appearance.hasScaffolding);
    assert.ok(plannedHub, 'Preview fixtures must include at least one planned building with scaffolding');

    // Stress-test: deliberately spawn people directly on top of a lamp, bench, planter, and planned scaffolding
    const hostileSpawns = [
      { id: 'on-lamp', position: { x: QUAY_LAMP_POSITIONS[2].x, y: 1.61, z: QUAY_LAMP_POSITIONS[2].z } },
      { id: 'on-bench', position: { x: QUAY_BENCH_POSITIONS[0].x, y: 1.61, z: QUAY_BENCH_POSITIONS[0].z } },
      { id: 'on-planter', position: { x: QUAY_PLANTER_POSITIONS[1].x, y: 1.61, z: QUAY_PLANTER_POSITIONS[1].z } },
      {
        id: 'on-scaffold',
        position: { x: plannedHub.lot.centerX, y: 1.61, z: plannedHub.lot.centerZ + 2.5 },
      },
    ];

    const relocated = resolveAvatarSpawnOverlaps(hostileSpawns, allColliders, AVATAR_PROP_MIN_CLEARANCE);
    for (const item of relocated) {
      for (const box of allColliders) {
        const dist = distancePointToAabb(item.position, box);
        assert.ok(
          dist >= AVATAR_PROP_MIN_CLEARANCE - 1e-4,
          `Relocated avatar '${item.id}' at (${item.position.x.toFixed(2)}, ${item.position.z.toFixed(2)}) is only ${dist.toFixed(3)}m from '${box.id}' (< ${AVATAR_PROP_MIN_CLEARANCE}m)`,
        );
      }
    }

    // Real preview colleague roster (standing/walking) also has 0 overlaps against full quay + scaffolding colliders
    const people = mapEmployeesToHarborPeople(
      getPreviewDemoEmployees(),
      getPreviewDemoPresence(),
      'user01',
    );
    const standingRoster = resolveAvatarSpawnOverlaps(
      people.filter((p) => !p.isCurrentUser && p.presenceStatus !== 'away' && p.presenceStatus !== 'leave'),
      allColliders,
      AVATAR_PROP_MIN_CLEARANCE,
    );
    for (const person of standingRoster) {
      for (const box of allColliders) {
        const dist = distancePointToAabb(person.position, box);
        assert.ok(
          dist >= AVATAR_PROP_MIN_CLEARANCE - 1e-4,
          `Colleague ${person.name} is ${dist.toFixed(3)}m from '${box.id}' (< ${AVATAR_PROP_MIN_CLEARANCE}m)`,
        );
      }
    }

    // Direct single-point resolver also enforces >= 0.8m from a lamp post
    const singleResolved = resolveAvatarPropClearance(
      { x: QUAY_LAMP_POSITIONS[0].x, z: QUAY_LAMP_POSITIONS[0].z },
      allColliders,
      [],
      AVATAR_PROP_MIN_CLEARANCE,
    );
    const distToLamp = distancePointToAabb(singleResolved, HARBOR_PROP_COLLIDERS[0]);
    assert.ok(distToLamp >= AVATAR_PROP_MIN_CLEARANCE - 1e-4);
  });

  it('4. fades occluding ship superstructures to opacity 0.25 and restores exact original opacity once clear', () => {
    const textures = createStubTextures();
    const glowMat = new THREE.MeshStandardMaterial({
      color: 0xf5e8c8,
      emissive: 0xfde68a,
      emissiveIntensity: 0.32,
    });

    const vessel = buildProjectVessel3D('lng_carrier', textures, glowMat, false);
    const superGroup = vessel.getObjectByName('ship_superstructure');
    assert.ok(superGroup, 'Vessel must isolate upper structures in a ship_superstructure group');

    const root = new THREE.Group();
    root.add(vessel);
    root.updateMatrixWorld(true);

    // Verify superstructure sits above hull and find its center for line-of-sight raycast
    const superBox = new THREE.Box3().setFromObject(superGroup);
    assert.ok(!superBox.isEmpty(), 'ship_superstructure must contain renderable meshes');
    const superCenter = superBox.getCenter(new THREE.Vector3());

    // Collect hull meshes (outside superstructure) to verify hull stays opaque
    const hullMeshes: THREE.Mesh[] = [];
    const superMeshes: THREE.Mesh[] = [];
    vessel.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      let isSuper = false;
      let curr: THREE.Object3D | null = obj;
      while (curr) {
        if (curr === superGroup) {
          isSuper = true;
          break;
        }
        curr = curr.parent;
      }
      if (isSuper) superMeshes.push(obj);
      else hullMeshes.push(obj);
    });
    assert.ok(superMeshes.length > 0 && hullMeshes.length > 0);

    const controller = new SuperstructureOcclusionController();

    // Case A: Camera behind superstructure looking at target on opposite side -> occluded
    const camOccluded = new THREE.Vector3(superCenter.x + 25, superCenter.y, superCenter.z);
    const targetOpposite = new THREE.Vector3(superCenter.x - 25, superCenter.y, superCenter.z);
    const occludedNames = controller.update(camOccluded, targetOpposite, [superGroup]);

    assert.equal(occludedNames.length, 1, 'Expected superstructure to be detected as occluding');
    assert.equal(controller.getOccludedCount(), 1);
    for (const m of superMeshes) {
      const mat = m.material as THREE.Material;
      assert.equal(mat.opacity, OCCLUDED_SUPERSTRUCTURE_OPACITY, 'Occluding superstructure opacity must be 0.25');
      assert.equal(mat.transparent, true);
      assert.equal(mat.depthWrite, false);
    }
    for (const m of hullMeshes) {
      const mat = m.material as THREE.Material;
      assert.equal(mat.opacity, 1, 'Lower hull must remain fully opaque while superstructure fades');
    }

    // Case B: Camera moves clear of superstructure -> exact original opacity restored
    const camClear = new THREE.Vector3(superCenter.x, superCenter.y + 40, superCenter.z + 40);
    const targetClear = new THREE.Vector3(superCenter.x, superCenter.y + 38, superCenter.z + 30);
    const afterClear = controller.update(camClear, targetClear, [superGroup]);

    assert.equal(afterClear.length, 0);
    assert.equal(controller.getOccludedCount(), 0);
    for (const m of superMeshes) {
      const mat = m.material as THREE.Material;
      assert.equal(mat.opacity, 1, 'Superstructure opacity must restore to 1.0 when sightline clears');
      assert.equal(mat.transparent, false);
      assert.equal(mat.depthWrite, true);
    }

    disposeObjectTree(vessel);
    glowMat.dispose();
    textures.dispose();
  });

  it('5. enhances close-up worker face/hand/workwear/reflective detail and boosts shadow resolution only at close range', () => {
    const rig = buildHumanoidEngineerAvatar({
      isPartner: false,
      shirtHex: '#0284c7',
      skipContactShadow: true,
    });

    const meshNames = new Set<string>();
    let spriteCount = 0;
    let reflectiveStripeMesh: THREE.Mesh | null = null;
    rig.group.traverse((obj) => {
      if ((obj as THREE.Sprite).isSprite) spriteCount += 1;
      if ((obj as THREE.Mesh).isMesh) {
        meshNames.add(obj.name);
        if (obj.name === 'reflective_stripe_upper') {
          reflectiveStripeMesh = obj as THREE.Mesh;
        }
      }
    });

    assert.equal(spriteCount, 0, 'Worker avatar must remain 100% 3D with zero sprites');
    for (const requiredPart of [
      'face_nose',
      'face_mouth',
      'eyebrow_left',
      'eyebrow_right',
      'eye_sclera_left',
      'eye_sclera_right',
      'left_thumb',
      'right_thumb',
      'left_glove_cuff',
      'right_glove_cuff',
      'chest_pocket_left',
      'chest_pocket_right',
      'reflective_stripe_upper',
      'reflective_stripe_lower',
    ]) {
      assert.ok(meshNames.has(requiredPart), `Missing close-up worker detail mesh: ${requiredPart}`);
    }

    assert.ok(reflectiveStripeMesh, 'Missing reflective_stripe_upper mesh');
    const reflMat = (reflectiveStripeMesh as THREE.Mesh).material as THREE.MeshStandardMaterial;
    assert.ok(reflMat.metalness >= 0.65, 'Reflective stripe must have crisp retro-reflective sheen');
    assert.ok(reflMat.emissiveIntensity >= 0.3, 'Reflective stripe must retain crisp close-up visibility');

    // Ground contact preserved after close-up detail upgrade
    rig.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(rig.group);
    assert.ok(Math.abs(box.min.y) < 0.04, `Worker boots must stay grounded near y=0, got ${box.min.y}`);

    // HarborScene activates close-range shadow frustum tightening & resolution boost only at close distance
    const sceneSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/scene/HarborScene.ts'), 'utf8');
    assert.ok(sceneSrc.includes('updateCloseRangeShadowRig'), 'HarborScene must implement updateCloseRangeShadowRig');
    assert.ok(sceneSrc.includes('camDist <= 18') && sceneSrc.includes('camDist >= 22'), 'Shadow boost must use close-range hysteresis');
    assert.ok(sceneSrc.includes('4096'), 'High-tier close-range shadow resolution boost must be present');

    rig.dispose();
  });
});
