/**
 * Procedural 3D Hub Module Harbor Buildings (Stage 8).
 *
 * Builds composite architectural 3D harbor buildings (control towers, engineering halls,
 * archive warehouses, comms hubs) driven purely by `/api/meta/registry` + `/api/meta/hub/summary`:
 *   - `planned`: 3D galvanized steel scaffolding + catwalk planks + hazard barrier + orange cones + `"준비 중"` sign + dark unlit windows
 *   - `active` / `warn` / `idle`: clean finished building with warm illuminated windows + glowing roof light strip + status beacon
 *   - `nosource` / `unavailable`: unlit dimmed standby building + honest status signboard & beacon
 */

import * as THREE from 'three';
import { QUAY_MAIN_DECK_Y } from '../core/physicsCollision';
import type { HubBuildingPlacement } from '../meta/hubBuildingModel';
import { mergeSolidSubtreeToVertexColors } from './meshBatching';
import { disposeObjectTree } from './projectVesselTypes';
import type { HarborTexturePack } from './textures';

export interface HubBuildingRuntime {
  placement: HubBuildingPlacement;
  group: THREE.Group;
  hitProxy: THREE.Mesh;
  beaconMat: THREE.MeshStandardMaterial;
  signTextures: THREE.CanvasTexture[];
  phase: number;
  dispose: () => void;
}

function addDiagonalBar(
  parent: THREE.Group,
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  radius: number,
  mat: THREE.Material,
): void {
  const dir = new THREE.Vector3().subVectors(p2, p1);
  const len = dir.length();
  if (len < 1e-4) return;
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 6), mat);
  bar.position.copy(p1).add(p2).multiplyScalar(0.5);
  bar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  parent.add(bar);
}

/**
 * Builds 3D construction scaffolding rig around a `planned` building:
 * vertical poles, 2-tier horizontal rails, timber catwalk planks, diagonal X-braces,
 * entrance safety barrier, and orange traffic cones.
 */
function buildConstructionScaffolding(
  width: number,
  height: number,
  depth: number,
  hazardMat: THREE.Material,
  lowSpec: boolean,
): THREE.Group {
  const scaffold = new THREE.Group();
  scaffold.name = 'hub-building-scaffolding';

  const pipeMat = lowSpec
    ? new THREE.MeshLambertMaterial({ color: 0x94a3b8 })
    : new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.42, metalness: 0.72 });
  const plankMat = lowSpec
    ? new THREE.MeshLambertMaterial({ color: 0xb47b44 })
    : new THREE.MeshStandardMaterial({ color: 0xb47b44, roughness: 0.85, metalness: 0.05 });
  const coneMat = lowSpec
    ? new THREE.MeshLambertMaterial({ color: 0xf97316 })
    : new THREE.MeshStandardMaterial({
        color: 0xf97316,
        emissive: 0xea580c,
        emissiveIntensity: 0.12,
        roughness: 0.5,
      });

  const halfW = width * 0.5 + 0.48;
  const halfD = depth * 0.5 + 0.48;
  const poleH = height + 0.85;
  const poleXs = [-halfW, -halfW * 0.34, halfW * 0.34, halfW];

  // Vertical scaffold poles along front (+Z) & back (-Z) faces
  for (const pz of [halfD, -halfD]) {
    for (const px of poleXs) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, poleH, 6), pipeMat);
      pole.position.set(px, poleH * 0.5, pz);
      scaffold.add(pole);
    }
  }
  // Mid-side poles on East/West edges
  for (const px of [-halfW, halfW]) {
    const sidePole = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, poleH, 6), pipeMat);
    sidePole.position.set(px, poleH * 0.5, 0);
    scaffold.add(sidePole);
  }

  // Horizontal ledgers + wooden work catwalks at two tiers
  const tierHeights = [height * 0.44, height * 0.86];
  for (const ty of tierHeights) {
    // Front & back ledgers
    for (const pz of [halfD, -halfD]) {
      const ledger = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2 + 0.14, 0.09, 0.09), pipeMat);
      ledger.position.set(0, ty, pz);
      scaffold.add(ledger);
    }
    // Left & right ledgers
    for (const px of [-halfW, halfW]) {
      const sideLedger = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, halfD * 2 + 0.14), pipeMat);
      sideLedger.position.set(px, ty, 0);
      scaffold.add(sideLedger);
    }
    // Front wooden walk-plank platform
    const plank = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2 - 0.1, 0.08, 0.62), plankMat);
    plank.position.set(0, ty - 0.06, halfD - 0.14);
    scaffold.add(plank);
  }

  // Diagonal X-bracing across the 3 front scaffold bays
  const braceTopY = tierHeights[1];
  const braceBotY = 0.35;
  for (let i = 0; i < poleXs.length - 1; i += 1) {
    const x1 = poleXs[i];
    const x2 = poleXs[i + 1];
    addDiagonalBar(
      scaffold,
      new THREE.Vector3(x1, braceBotY, halfD),
      new THREE.Vector3(x2, braceTopY, halfD),
      0.045,
      pipeMat,
    );
    addDiagonalBar(
      scaffold,
      new THREE.Vector3(x2, braceBotY, halfD),
      new THREE.Vector3(x1, braceTopY, halfD),
      0.045,
      pipeMat,
    );
  }

  // Side X-braces
  for (const px of [-halfW, halfW]) {
    addDiagonalBar(
      scaffold,
      new THREE.Vector3(px, braceBotY, -halfD),
      new THREE.Vector3(px, braceTopY, halfD),
      0.045,
      pipeMat,
    );
  }

  // Merge solid scaffolding steel + wood into vertex-colored single mesh for lean draw calls
  mergeSolidSubtreeToVertexColors(scaffold, {
    roughness: 0.55,
    metalness: 0.45,
    castShadow: !lowSpec,
    receiveShadow: !lowSpec,
  });

  // Ground-level yellow/black hazard safety barrier directly in front of the building
  const barrierBoard = new THREE.Mesh(new THREE.BoxGeometry(width * 0.72, 0.42, 0.1), hazardMat);
  barrierBoard.position.set(0, 0.78, halfD + 0.65);
  scaffold.add(barrierBoard);

  for (const cx of [-width * 0.38, width * 0.38]) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.72, 8), coneMat);
    cone.position.set(cx, 0.36, halfD + 0.75);
    scaffold.add(cone);
  }

  return scaffold;
}

/**
 * Builds a complete 3D Hub Module Harbor Building with status-reactive exterior:
 *   - `planned`: unlit facade + 3D scaffolding + `"준비 중"` roof & scaffold signage
 *   - `active` / `warn` / `idle`: warm glowing windows + illuminated cornice + bright operational beacon
 *   - `nosource` / `unavailable`: dark standby facade + honest status signboard & beacon
 */
export function buildHubModuleBuilding3D(
  placement: HubBuildingPlacement,
  textures: HarborTexturePack,
  lowSpec: boolean,
  phaseIndex = 0,
): HubBuildingRuntime {
  const { chip, lot, archetype, appearance } = placement;
  const group = new THREE.Group();
  group.name = `hub-building-${placement.moduleId}`;
  group.position.set(lot.centerX, QUAY_MAIN_DECK_Y, lot.centerZ);
  group.rotation.y = lot.facingYaw;
  group.userData.hubModuleId = placement.moduleId;
  group.userData.hubStatus = chip.status;
  group.userData.hasScaffolding = appearance.hasScaffolding;
  group.userData.lightsOn = appearance.lightsOn;

  const signTextures: THREE.CanvasTexture[] = [];
  const w = lot.width;
  const d = lot.depth;
  const bodyH = archetype === 'control-tower' ? 5.6 : archetype === 'warehouse' ? 5.2 : 5.0;

  const makeMat = (params: {
    color: number;
    roughness?: number;
    metalness?: number;
    emissive?: number;
    emissiveIntensity?: number;
  }) =>
    lowSpec
      ? new THREE.MeshLambertMaterial({
          color: params.color,
          emissive: params.emissive ?? 0x000000,
          emissiveIntensity: params.emissiveIntensity ?? 0,
        })
      : new THREE.MeshStandardMaterial({
          color: params.color,
          roughness: params.roughness ?? 0.56,
          metalness: params.metalness ?? 0.24,
          emissive: params.emissive ?? 0x000000,
          emissiveIntensity: params.emissiveIntensity ?? 0,
        });

  const plinthMat = makeMat({ color: 0x334155, roughness: 0.88, metalness: 0.08 });
  const wallMat = makeMat({ color: appearance.wallColorHex, roughness: 0.64, metalness: 0.18 });
  const roofMat = makeMat({ color: appearance.roofColorHex, roughness: 0.45, metalness: 0.36 });
  const trimDarkMat = makeMat({ color: 0x1e293b, roughness: 0.52, metalness: 0.52 });
  const accentColor = new THREE.Color(appearance.accentHex);
  const accentMat = makeMat({
    color: accentColor.getHex(),
    roughness: 0.38,
    metalness: 0.34,
    emissive: appearance.lightsOn ? accentColor.getHex() : 0x000000,
    emissiveIntensity: appearance.lightsOn ? 0.22 : 0,
  });

  // Static solid architecture group (merged cleanly into vertex-colored mesh for performance)
  const structureGroup = new THREE.Group();
  structureGroup.name = 'hub-building-structure';

  // 1. Concrete Foundation Plinth (grounded flush at y=0 -> QUAY_MAIN_DECK_Y)
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.38, d + 0.5), plinthMat);
  plinth.position.y = 0.19;
  structureGroup.add(plinth);

  // 2. Primary Building Body
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, bodyH, d), wallMat);
  body.position.y = 0.38 + bodyH * 0.5;
  structureGroup.add(body);

  // Corner structural steel pilasters for crisp industrial silhouette
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const pilaster = new THREE.Mesh(new THREE.BoxGeometry(0.45, bodyH + 0.1, 0.45), trimDarkMat);
      pilaster.position.set(sx * (w * 0.5 - 0.15), 0.38 + bodyH * 0.5, sz * (d * 0.5 - 0.15));
      structureGroup.add(pilaster);
    }
  }

  // 3. Roof Cap & Archetype-Specific Superstructure
  const roofBaseY = 0.38 + bodyH;
  const roofCap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.55, 0.32, d + 0.55), roofMat);
  roofCap.position.y = roofBaseY + 0.16;
  structureGroup.add(roofCap);

  // Entrance canopy facing harbor (+Z)
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.2, 1.45), trimDarkMat);
  canopy.position.set(0, 3.05, d * 0.5 + 0.65);
  structureGroup.add(canopy);

  let topFeatureY = roofBaseY + 0.32;

  if (archetype === 'control-tower') {
    // 360° Scan Control Tower: upper octagonal observation cab + scanner radome sphere
    const cab = new THREE.Mesh(new THREE.BoxGeometry(w * 0.56, 2.0, d * 0.58), trimDarkMat);
    cab.position.set(0, topFeatureY + 1.0, -0.35);
    structureGroup.add(cab);

    const cabRoof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.62, 0.22, d * 0.64), accentMat);
    cabRoof.position.set(0, topFeatureY + 2.1, -0.35);
    structureGroup.add(cabRoof);

    const radomeBase = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.15, 0.55, 10), wallMat);
    radomeBase.position.set(w * 0.16, topFeatureY + 2.45, -0.45);
    structureGroup.add(radomeBase);

    const radome = new THREE.Mesh(new THREE.SphereGeometry(1.05, 12, 10), accentMat);
    radome.position.set(w * 0.16, topFeatureY + 3.25, -0.45);
    structureGroup.add(radome);
    topFeatureY += 2.25;
  } else if (archetype === 'engineering-hall') {
    // SECAD 3D CAD Engineering Hall: twin north-light sawtooth skylight monitors + chiller
    for (const bx of [-w * 0.22, w * 0.22]) {
      const monitor = new THREE.Mesh(new THREE.BoxGeometry(w * 0.36, 1.35, d * 0.72), roofMat);
      monitor.position.set(bx, topFeatureY + 0.68, -0.2);
      structureGroup.add(monitor);
    }
    const accentTrim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.24, 0.32), accentMat);
    accentTrim.position.set(0, roofBaseY + 0.38, d * 0.5 + 0.16);
    structureGroup.add(accentTrim);
    topFeatureY += 1.35;
  } else if (archetype === 'warehouse') {
    // PDF Archive / SEcMS Cable Warehouse: stepped clerestory monitor + recessed cargo roll-up bay
    const monitor = new THREE.Mesh(new THREE.BoxGeometry(w * 0.78, 1.15, d * 0.44), roofMat);
    monitor.position.set(0, topFeatureY + 0.58, -0.35);
    structureGroup.add(monitor);

    const bayDoor = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.6, 0.24), trimDarkMat);
    bayDoor.position.set(0, 1.68, d * 0.5 + 0.04);
    structureGroup.add(bayDoor);
    topFeatureY += 1.15;
  } else {
    // Mail / Comms Relay Hub: communications penthouse + antenna mast + parabolic reflector
    const penthouse = new THREE.Mesh(new THREE.BoxGeometry(w * 0.52, 1.5, d * 0.5), wallMat);
    penthouse.position.set(-w * 0.1, topFeatureY + 0.75, -0.3);
    structureGroup.add(penthouse);

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 3.6, 8), trimDarkMat);
    mast.position.set(w * 0.24, topFeatureY + 1.8, -0.5);
    structureGroup.add(mast);

    const dish = new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.5, 10), accentMat);
    dish.rotation.x = Math.PI * 0.38;
    dish.position.set(w * 0.24, topFeatureY + 2.85, 0.05);
    structureGroup.add(dish);
    topFeatureY += 1.5;
  }

  mergeSolidSubtreeToVertexColors(structureGroup, {
    roughness: 0.54,
    metalness: 0.26,
    castShadow: !lowSpec,
    receiveShadow: !lowSpec,
  });
  group.add(structureGroup);

  // 4. Status-Reactive Window Facade (Lit warm glow when active/idle/warn; dark unlit when planned/nosource/unavailable)
  const windowMat = new THREE.MeshStandardMaterial({
    map: textures.curtainWall,
    color: appearance.lightsOn ? 0xffffff : 0x263447,
    emissive: new THREE.Color(appearance.lightsOn ? 0xfde68a : 0x000000),
    emissiveMap: appearance.lightsOn ? textures.curtainWall : null,
    emissiveIntensity: appearance.windowEmissiveIntensity,
    roughness: appearance.lightsOn ? 0.22 : 0.72,
    metalness: appearance.lightsOn ? 0.38 : 0.15,
  });

  const windowW = w - 1.1;
  const windowH = archetype === 'warehouse' ? 1.55 : bodyH - 1.1;
  const windowY = archetype === 'warehouse' ? roofBaseY - 1.1 : 0.38 + bodyH * 0.52;
  const frontWindows = new THREE.Mesh(new THREE.PlaneGeometry(windowW, windowH), windowMat);
  frontWindows.name = 'hub-building-windows-front';
  frontWindows.position.set(0, windowY, d * 0.5 + 0.04);
  group.add(frontWindows);

  // Illuminated architectural cornice bar (visible ONLY when lightsOn === true)
  if (appearance.lightsOn) {
    const corniceGlowMat = new THREE.MeshStandardMaterial({
      color: 0xfef3c7,
      emissive: accentColor,
      emissiveIntensity: 1.35,
      roughness: 0.2,
    });
    const corniceBar = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.18, 0.22), corniceGlowMat);
    corniceBar.name = 'hub-building-cornice-light';
    corniceBar.position.set(0, roofBaseY + 0.04, d * 0.5 + 0.24);
    group.add(corniceBar);
  }

  // 5. Status Rooftop Beacon (animated pulse on active/warn/unavailable)
  const beaconMat = new THREE.MeshStandardMaterial({
    color: appearance.beaconColorHex,
    emissive: appearance.beaconColorHex,
    emissiveIntensity: appearance.lightsOn ? 1.4 : 0.65,
    roughness: 0.22,
  });
  const beaconPost = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.9, 6), trimDarkMat);
  beaconPost.position.set(-w * 0.36, roofBaseY + 0.72, d * 0.32);
  group.add(beaconPost);

  const beaconOrb = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), beaconMat);
  beaconOrb.name = 'hub-building-beacon';
  beaconOrb.position.set(-w * 0.36, roofBaseY + 1.24, d * 0.32);
  group.add(beaconOrb);

  // 6. Prominent Rooftop Signboard ("준비 중" hazard board for planned vs illuminated board for active)
  const signTex = textures.createHubBuildingSignboard(
    chip.name,
    appearance.signBannerText,
    appearance.accentHex,
    appearance.hasScaffolding,
  );
  signTextures.push(signTex);

  const signMat = new THREE.MeshStandardMaterial({
    map: signTex,
    emissive: new THREE.Color(0xffffff),
    emissiveMap: signTex,
    emissiveIntensity: appearance.lightsOn ? 0.36 : 0.14,
    roughness: 0.38,
  });

  const signW = Math.min(w - 0.8, 6.8);
  const signH = 1.95;
  const signY = roofBaseY + 1.28;
  const signFrame = new THREE.Mesh(new THREE.BoxGeometry(signW + 0.24, signH + 0.2, 0.28), trimDarkMat);
  signFrame.position.set(0, signY, d * 0.5 - 0.1);
  group.add(signFrame);

  const signFace = new THREE.Mesh(new THREE.PlaneGeometry(signW, signH), signMat);
  signFace.name = 'hub-building-signboard';
  signFace.position.set(0, signY, d * 0.5 + 0.06);
  group.add(signFace);

  // 7. 3D Construction Scaffolding Rig (STRICTLY when status === 'planned')
  if (appearance.hasScaffolding) {
    const hazardBarMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.hazardTrim,
      roughness: 0.58,
      metalness: 0.12,
    });
    const scaffolding = buildConstructionScaffolding(w, bodyH + 0.4, d, hazardBarMat, lowSpec);
    group.add(scaffolding);
  }

  // 8. Invisible Click Hit Proxy (slightly oversized for effortless click/tap targeting)
  const hitProxy = new THREE.Mesh(
    new THREE.BoxGeometry(w + 1.4, Math.max(8.0, topFeatureY + 1.8), d + 2.2),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  hitProxy.position.set(lot.centerX, QUAY_MAIN_DECK_Y + 4.2, lot.centerZ);
  hitProxy.rotation.y = lot.facingYaw;
  hitProxy.userData.hubModuleId = placement.moduleId;

  const dispose = () => {
    disposeObjectTree(group);
    hitProxy.geometry.dispose();
    (hitProxy.material as THREE.Material).dispose();
    for (const tex of signTextures) {
      tex.dispose();
    }
    signTextures.length = 0;
  };

  return {
    placement,
    group,
    hitProxy,
    beaconMat,
    signTextures,
    phase: phaseIndex * 1.15,
    dispose,
  };
}
