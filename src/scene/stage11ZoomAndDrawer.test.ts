import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as THREE from 'three';
import { HUD_HEIGHT_CSS_VAR, HudTopBar } from '../components/HudTopBar';
import {
  computePeopleDrawerTopPx,
  DEFAULT_DESKTOP_HUD_HEIGHT_PX,
  DEFAULT_MOBILE_HUD_HEIGHT_PX,
  PEOPLE_DRAWER_HUD_GAP_PX,
  PeopleFinderDrawer,
} from '../components/PeopleFinderDrawer';
import {
  CAMERA_CLOSE_MAX_POLAR_ANGLE,
  CAMERA_CLOSE_MIN_POLAR_ANGLE,
  CAMERA_MIN_DISTANCE,
  CAMERA_MIN_LAND_CLEARANCE_Y,
  CAMERA_MIN_WATER_CLEARANCE_Y,
  CAMERA_PERSON_FOCUS_DEFAULT_DIST,
  CAMERA_PERSON_FOCUS_MAX_DIST,
  CAMERA_PERSON_FOCUS_MIN_DIST,
  CAMERA_WHEEL_MIN_DISTANCE,
  clampCloseZoomCameraFraming,
  computePersonFocusCameraPose,
  computePolarAngleBoundsForDistance,
  estimateWaterScreenFraction,
  HARBOR_ALL_OBSTACLES,
  isOnWalkableLand,
  QUAY_MAIN_DECK_Y,
  sampleHarborElevation,
  WORKER_CHEST_HEIGHT_OFFSET,
} from '../core/physicsCollision';
import { mapEmployeesToHarborPeople } from '../mapping';
import { mergeHubModuleChips } from '../meta/hubChipModel';
import { getPreviewHubRegistry, getPreviewHubSummary } from '../meta/hubFixtures';
import { getPreviewDemoEmployees, getPreviewDemoPresence, getPreviewDemoUser } from '../previewFixtures';
import { buildHumanoidEngineerAvatar } from './humanoidAvatar';

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

describe('Stage 11 — Max Wheel Zoom Framing & PeopleFinderDrawer Clearance Below HUD', () => {
  it('1. frames the full worker body (boots to helmet) with water ratio <= 40% at 1440x900 max wheel zoom across all orbit azimuths', () => {
    const workerX = 0;
    const workerZ = -7.5;
    const workerY = sampleHarborElevation(workerX, workerZ);
    assert.equal(workerY, QUAY_MAIN_DECK_Y);

    const rig = buildHumanoidEngineerAvatar({
      isPartner: false,
      shirtHex: '#0284c7',
      skipContactShadow: true,
    });
    rig.group.position.set(workerX, workerY, workerZ);
    rig.group.updateMatrixWorld(true);
    const workerBox = new THREE.Box3().setFromObject(rig.group);

    // Case A: Starting from default Harbor View target (0, 3.0, 22) over water, wheel-zoom all the way in
    const zoomedFromHarbor = clampCloseZoomCameraFraming(
      { x: 0, y: 3.0 + 1.8, z: 22 + 3.0 }, // hostile close wheel zoom still aimed over water
      { x: 0, y: 3.0, z: 22 },
      { x: workerX, z: workerZ },
      HARBOR_ALL_OBSTACLES,
    );
    assert.equal(zoomedFromHarbor.closeBlend, 1);
    assert.ok(
      isOnWalkableLand(zoomedFromHarbor.targetPos.x, zoomedFromHarbor.targetPos.z, 0),
      'Close wheel zoom from Harbor View must pull over-water target onto the quay deck',
    );
    assert.ok(
      Math.abs(zoomedFromHarbor.targetPos.y - (QUAY_MAIN_DECK_Y + WORKER_CHEST_HEIGHT_OFFSET)) < 0.05,
      `Close wheel zoom target Y must lock to worker chest height, got ${zoomedFromHarbor.targetPos.y}`,
    );
    assert.ok(
      zoomedFromHarbor.distance >= CAMERA_WHEEL_MIN_DISTANCE - 1e-4,
      `Wheel zoom distance must respect CAMERA_WHEEL_MIN_DISTANCE (${CAMERA_WHEEL_MIN_DISTANCE}m), got ${zoomedFromHarbor.distance}`,
    );

    // Case B: Full 360° orbit (8 azimuths) + extreme pitch inputs (steep top-down & low water-skimming) at 1440x900
    const cam1440 = new THREE.PerspectiveCamera(50, 1440 / 900, 0.25, 3600);
    const testAzimuths = [0, Math.PI * 0.25, Math.PI * 0.5, Math.PI * 0.75, Math.PI, -Math.PI * 0.75, -Math.PI * 0.5, -Math.PI * 0.25];
    const testInputPolars = [0.2, 1.24, 1.34, 1.44, 1.54]; // includes hostile steep & grazing angles

    for (const az of testAzimuths) {
      for (const rawPolar of testInputPolars) {
        const rawDist = 3.5; // user scrolling wheel past floor
        const rawCam = {
          x: workerX + rawDist * Math.sin(rawPolar) * Math.sin(az),
          y: workerY + 0.5 + rawDist * Math.cos(rawPolar),
          z: workerZ + rawDist * Math.sin(rawPolar) * Math.cos(az),
        };
        const framed = clampCloseZoomCameraFraming(
          rawCam,
          { x: workerX, y: workerY + 0.3, z: workerZ },
          { x: workerX, z: workerZ },
          HARBOR_ALL_OBSTACLES,
        );

        // 1) Polar angle stays strictly within close-zoom framing bounds
        assert.ok(
          framed.polarAngle >= CAMERA_CLOSE_MIN_POLAR_ANGLE - 0.02 &&
            framed.polarAngle <= CAMERA_CLOSE_MAX_POLAR_ANGLE + 0.02,
          `Framed polar ${framed.polarAngle.toFixed(3)} out of bounds [${CAMERA_CLOSE_MIN_POLAR_ANGLE}, ${CAMERA_CLOSE_MAX_POLAR_ANGLE}]`,
        );

        // 2) Zero ground or water clipping
        const minAllowedY = isOnWalkableLand(framed.cameraPos.x, framed.cameraPos.z, 0)
          ? sampleHarborElevation(framed.cameraPos.x, framed.cameraPos.z) + CAMERA_MIN_LAND_CLEARANCE_Y
          : CAMERA_MIN_WATER_CLEARANCE_Y;
        assert.ok(
          framed.cameraPos.y >= minAllowedY - 1e-4,
          `Camera Y (${framed.cameraPos.y.toFixed(2)}) clipped below safe floor (${minAllowedY.toFixed(2)})`,
        );

        // 3) Worker's ENTIRE body (boots to helmet) stays inside 1440x900 viewport with surrounding margin
        cam1440.position.set(framed.cameraPos.x, framed.cameraPos.y, framed.cameraPos.z);
        cam1440.lookAt(framed.targetPos.x, framed.targetPos.y, framed.targetPos.z);
        cam1440.updateMatrixWorld(true);
        const ndc = projectBoxToNdc(workerBox, cam1440);
        const viewportHeightFrac = (ndc.maxY - ndc.minY) / 2;

        assert.ok(
          ndc.maxY <= 0.92,
          `Worker helmet cropped at top (maxY=${ndc.maxY.toFixed(3)}, az=${az.toFixed(2)}, polar=${rawPolar})`,
        );
        assert.ok(
          ndc.minY >= -0.92,
          `Worker boots cropped at bottom (minY=${ndc.minY.toFixed(3)}, az=${az.toFixed(2)}, polar=${rawPolar})`,
        );
        assert.ok(
          viewportHeightFrac >= 1 / 3 && viewportHeightFrac <= 0.85,
          `Worker height fraction (${viewportHeightFrac.toFixed(3)}) must be in [0.333, 0.85]`,
        );

        // 4) Open-water screen coverage strictly <= 40% even when orbiting north of worker looking south toward sea
        const waterRatio = estimateWaterScreenFraction(framed.cameraPos, framed.targetPos, 50, 121);
        assert.ok(
          waterRatio <= 0.4,
          `Water screen fraction ${(waterRatio * 100).toFixed(1)}% exceeded 40% limit (az=${az.toFixed(2)}, polar=${framed.polarAngle.toFixed(2)})`,
        );
      }
    }

    // Case C: Distant harbor overview & ship boarding remain 100% untouched
    const harborOverview = clampCloseZoomCameraFraming(
      { x: 0, y: 58, z: 162 },
      { x: 0, y: 3.0, z: 22 },
      { x: workerX, z: workerZ },
      HARBOR_ALL_OBSTACLES,
    );
    assert.equal(harborOverview.closeBlend, 0);
    assert.equal(harborOverview.targetPos.z, 22);
    assert.equal(harborOverview.cameraPos.z, 162);

    const shipBoarding = clampCloseZoomCameraFraming(
      { x: 14, y: 17.5, z: 47 },
      { x: 0, y: 6.2, z: 22 },
      { x: workerX, z: workerZ },
      HARBOR_ALL_OBSTACLES,
    );
    assert.equal(shipBoarding.closeBlend, 0);
    assert.equal(shipBoarding.targetPos.z, 22);

    // Polar bounds smoothly transition with distance
    const farBounds = computePolarAngleBoundsForDistance(120);
    const closeBounds = computePolarAngleBoundsForDistance(CAMERA_WHEEL_MIN_DISTANCE);
    assert.equal(farBounds.closeBlend, 0);
    assert.equal(closeBounds.closeBlend, 1);
    assert.equal(closeBounds.minPolarAngle, CAMERA_CLOSE_MIN_POLAR_ANGLE);
    assert.equal(closeBounds.maxPolarAngle, CAMERA_CLOSE_MAX_POLAR_ANGLE);

    rig.dispose();
  });

  it('2. preserves Stage 10 person focus quality (3–6m front pose) untouched alongside Stage 11 wheel framing', () => {
    const people = mapEmployeesToHarborPeople(
      getPreviewDemoEmployees(),
      getPreviewDemoPresence(),
      'user01',
    );
    const standing = people.find((p) => p.presenceStatus === 'online' && !p.isCurrentUser)!;
    const pose = computePersonFocusCameraPose(
      {
        x: standing.position.x,
        y: sampleHarborElevation(standing.position.x, standing.position.z),
        z: standing.position.z,
      },
      standing.facingYaw,
      false,
      HARBOR_ALL_OBSTACLES,
      CAMERA_PERSON_FOCUS_DEFAULT_DIST,
    );

    assert.ok(
      pose.distance >= CAMERA_PERSON_FOCUS_MIN_DIST &&
        pose.distance <= CAMERA_PERSON_FOCUS_MAX_DIST,
      `Person focus distance must remain in [3, 6]m, got ${pose.distance}`,
    );

    const sceneSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/scene/HarborScene.ts'), 'utf8');
    assert.ok(
      sceneSrc.includes('if (this.focusedPersonSub !== null)') &&
        sceneSrc.includes('this.controls.minDistance = CAMERA_MIN_DISTANCE'),
      'HarborScene must preserve CAMERA_MIN_DISTANCE during focusPerson',
    );
    assert.ok(
      sceneSrc.includes('clampCloseZoomCameraFraming'),
      'HarborScene must invoke clampCloseZoomCameraFraming during free zoom',
    );
  });

  it('3. positions PeopleFinderDrawer strictly below HudTopBar + HudHubStatusStrip at 1440x900 and 375x812 without clipping title or close button', () => {
    // 1440x900 desktop: 2-row HUD (~88px) -> drawer starts at 96px (>= hud + 8px)
    const desktopMeasured = computePeopleDrawerTopPx(88, 1440);
    assert.equal(desktopMeasured, 88 + PEOPLE_DRAWER_HUD_GAP_PX);
    assert.ok(desktopMeasured >= 96);

    const desktopFallback = computePeopleDrawerTopPx(null, 1440);
    assert.equal(desktopFallback, DEFAULT_DESKTOP_HUD_HEIGHT_PX + PEOPLE_DRAWER_HUD_GAP_PX);

    // 375x812 mobile: 3-row HUD (~116px collapsed, ~184px expanded mobile chip panel)
    const mobileMeasured = computePeopleDrawerTopPx(116, 375);
    assert.equal(mobileMeasured, 116 + PEOPLE_DRAWER_HUD_GAP_PX);
    assert.ok(mobileMeasured >= 124);

    const mobileExpanded = computePeopleDrawerTopPx(184, 375);
    assert.equal(mobileExpanded, 184 + PEOPLE_DRAWER_HUD_GAP_PX);
    assert.ok(mobileExpanded >= 192);

    const mobileFallback = computePeopleDrawerTopPx(undefined, 375);
    assert.equal(mobileFallback, DEFAULT_MOBILE_HUD_HEIGHT_PX + PEOPLE_DRAWER_HUD_GAP_PX);

    // Verify rendered markup for HudTopBar (with Hub chip strip) & PeopleFinderDrawer
    const hubChips = mergeHubModuleChips(getPreviewHubRegistry(), getPreviewHubSummary('proj01'));
    const hudHtml = renderToStaticMarkup(
      React.createElement(HudTopBar, {
        user: getPreviewDemoUser(),
        runtimeEnv: 'preview',
        viewMode: '3d',
        webglSupported: true,
        lowSpecMode: false,
        qualityTier: 'high',
        darkTheme: false,
        cameraPreset: 'harbor',
        onlineCount: 6,
        projectCount: 3,
        hubChips,
        hubProjectLabel: '샘플 호선 S-01',
        onToggleViewMode: () => {},
        onToggleLowSpec: () => {},
        onToggleTheme: () => {},
        onCycleCamera: () => {},
        onZoom: () => {},
        onLogout: () => {},
        onPreviewLinkBlocked: () => {},
      }),
    );
    assert.ok(hudHtml.includes('data-testid="hud-top-bar"'), 'HudTopBar must expose hud-top-bar testid');
    assert.ok(hudHtml.includes('data-testid="hud-hub-status-strip"'), 'HudTopBar must include hub chip strip');

    const people = mapEmployeesToHarborPeople(
      getPreviewDemoEmployees(),
      getPreviewDemoPresence(),
      'user01',
    );
    const drawerHtml = renderToStaticMarkup(
      React.createElement(PeopleFinderDrawer, {
        open: true,
        runtimeEnv: 'preview',
        people,
        onClose: () => {},
        onFocusPerson: () => {},
        onSelectPerson: () => {},
        onPreviewLinkBlocked: () => {},
      }),
    );

    assert.ok(drawerHtml.includes('data-testid="people-finder-drawer"'));
    assert.ok(drawerHtml.includes('data-testid="people-finder-drawer-header"'));
    assert.ok(drawerHtml.includes('사람 찾기'), 'Drawer header title must render');
    assert.ok(drawerHtml.includes('aria-label="사람 찾기 닫기"'), 'Drawer close button must render');
    assert.ok(
      drawerHtml.includes(`top-[calc(var(${HUD_HEIGHT_CSS_VAR},124px)+8px)]`),
      'Mobile drawer top must track --metasgw-hud-height with 124px + 8px safe fallback',
    );
    assert.ok(
      drawerHtml.includes(`sm:top-[calc(var(${HUD_HEIGHT_CSS_VAR},96px)+8px)]`),
      'Desktop drawer top must track --metasgw-hud-height with 96px + 8px safe fallback',
    );
    assert.ok(
      !drawerHtml.includes('sm:top-16') && !drawerHtml.includes(' top-24 '),
      'Old hardcoded top-24 / sm:top-16 that clipped under HUD must be removed',
    );
    assert.ok(
      drawerHtml.includes('inset-x-3') && drawerHtml.includes('sm:w-80'),
      'Drawer width must stay inside 375px viewport (inset-x-3) with 0 horizontal overflow',
    );

    // Verify HudTopBar dynamically publishes --metasgw-hud-height via ResizeObserver
    const hudSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/HudTopBar.tsx'), 'utf8');
    assert.ok(
      hudSrc.includes('ResizeObserver') && hudSrc.includes('HUD_HEIGHT_CSS_VAR'),
      'HudTopBar must dynamically measure header height via ResizeObserver and publish --metasgw-hud-height',
    );
    assert.ok(CAMERA_MIN_DISTANCE <= 4.0);
  });
});
