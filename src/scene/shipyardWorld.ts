import * as THREE from 'three';
import { PORTAL_BUILDINGS, type PortalBuildingSpec } from '../core/navMeshEngine';
import { OBSERVATION_DECK_Y, QUAY_MAIN_DECK_Y } from '../core/physicsCollision';
import type { HarborShip } from '../mapping';
import type { HubBuildingPlacement } from '../meta/hubBuildingModel';
import type { ShipDisplayPrefsMap } from '../shipDisplayPrefs';
import { buildHubModuleBuilding3D, type HubBuildingRuntime } from './hubBuildings3D';
import { createInstancedRingBatch, mergeSolidSubtreeToVertexColors } from './meshBatching';
import {
  buildProjectVessel3D,
  buildVesselScanPointCloud,
  disposeObjectTree,
  getVesselSilhouetteByIndex,
} from './projectVesselTypes';
import {
  HOME_HARBOR_DECORATIVE_VESSELS,
  type DecorativeVesselSpec,
} from './sceneryCatalog';
import type { HarborTexturePack } from './textures';

/** Top surface elevation of the concrete quay apron. */
export const QUAY_DECK_TOP_Y = QUAY_MAIN_DECK_Y;
/** Elevation offset for flush safety trims & floor decals to prevent coplanar Z-fighting. */
export const Z_FIGHTING_SAFE_OFFSET = 0.025;

export interface DockedShipRuntime {
  ship: HarborShip;
  anchor: THREE.Group;
  hitProxy: THREE.Mesh;
  scanCloud: THREE.Points;
  defaultYawDeg: number;
  phase: number;
}

export interface DecorativeVesselRuntime {
  spec: DecorativeVesselSpec;
  anchor: THREE.Group;
  hitProxy: THREE.Mesh;
  scanCloud: THREE.Points;
  phase: number;
}

export interface ShipyardWorldHandles {
  clickablePortalProxies: THREE.Object3D[];
  clickableHubBuildingProxies: THREE.Object3D[];
  clickableShipProxies: THREE.Object3D[];
  clickableDecorativeShipProxies: THREE.Object3D[];
  walkableMeshes: THREE.Object3D[];
  dockedShips: DockedShipRuntime[];
  decorativeVessels: DecorativeVesselRuntime[];
  hubBuildings: HubBuildingRuntime[];
  bridgeGlowMat: THREE.MeshStandardMaterial;
  instancedPropCounts: {
    bollards: number;
    fenders: number;
    breakwaterStones: number;
    trees: number;
    streetlights: number;
    yardContainers: number;
  };
  syncProjectShips: (ships: HarborShip[], lowSpec: boolean, prefs?: ShipDisplayPrefsMap) => void;
  syncHubBuildings: (placements: HubBuildingPlacement[], lowSpec: boolean) => void;
  applyShipDisplayPrefs: (prefs: ShipDisplayPrefsMap) => void;
  setSelectedShipId: (shipId: string | null) => void;
  setLowSpecMode: (lowSpec: boolean) => void;
  update: (dt: number, elapsed: number, lowSpec: boolean) => void;
  dispose: () => void;
}

function addDiagonalBrace(
  parent: THREE.Group,
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  radius: number,
  mat: THREE.Material,
): void {
  const dir = new THREE.Vector3().subVectors(p2, p1);
  const len = dir.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 6), mat);
  mesh.position.copy(p1).add(p2).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  parent.add(mesh);
}

function buildGoliathCrane(
  x: number,
  y: number,
  z: number,
  paintHex: number,
  bannerTex: THREE.CanvasTexture,
  beaconMat: THREE.MeshStandardMaterial,
): THREE.Group {
  const crane = new THREE.Group();
  crane.position.set(x, y, z);

  const paintMat = new THREE.MeshStandardMaterial({ color: paintHex, roughness: 0.44, metalness: 0.42 });
  const darkSteel = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.7 });
  const girderFaceMat = new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.38, metalness: 0.3 });
  const hookYellowMat = new THREE.MeshStandardMaterial({ color: 0xdca420, roughness: 0.44, metalness: 0.24 });

  for (const sx of [-5.2, 5.2]) {
    const bogie = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.15, 8.2), darkSteel);
    bogie.position.set(sx, 0.58, 0);
    bogie.castShadow = true;
    bogie.receiveShadow = true;
    crane.add(bogie);

    for (const sz of [-3.5, 3.5]) {
      addDiagonalBrace(crane, new THREE.Vector3(sx, 1.1, sz), new THREE.Vector3(sx * 0.84, 18.8, sz * 0.24), 0.4, paintMat);
    }
    addDiagonalBrace(crane, new THREE.Vector3(sx * 0.94, 7.2, -2.5), new THREE.Vector3(sx * 0.94, 7.2, 2.5), 0.18, darkSteel);
  }

  const mainGirder = new THREE.Mesh(new THREE.BoxGeometry(22.0, 2.7, 2.4), paintMat);
  mainGirder.position.set(0, 19.8, 0);
  crane.add(mainGirder);

  const bannerFront = new THREE.Mesh(new THREE.PlaneGeometry(21.6, 2.55), girderFaceMat);
  bannerFront.position.set(0, 19.8, 1.24);
  crane.add(bannerFront);

  const bannerBack = new THREE.Mesh(new THREE.PlaneGeometry(21.6, 2.55), girderFaceMat);
  bannerBack.position.set(0, 19.8, -1.24);
  bannerBack.rotation.y = Math.PI;
  crane.add(bannerBack);

  const boom = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.35, 19.5), paintMat);
  boom.position.set(0, 18.8, 6.4);
  crane.add(boom);

  const trolley = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.6, 3.4), darkSteel);
  trolley.position.set(0, 21.7, 0.2);
  crane.add(trolley);

  const hookBlock = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.75, 0.95), hookYellowMat);
  hookBlock.position.set(0, 12.0, 11.4);
  crane.add(hookBlock);

  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 8), beaconMat);
  beacon.position.set(0, 22.8, 0);
  crane.add(beacon);

  mergeSolidSubtreeToVertexColors(crane, {
    roughness: 0.44,
    metalness: 0.45,
    castShadow: true,
    receiveShadow: true,
  });

  return crane;
}

function buildPortalPavilion(
  spec: PortalBuildingSpec,
  textures: HarborTexturePack,
  curtainMat: THREE.MeshStandardMaterial,
  steelMat: THREE.MeshStandardMaterial,
): { group: THREE.Group; hitProxy: THREE.Mesh } {
  const group = new THREE.Group();
  group.position.set(spec.centerX, QUAY_DECK_TOP_Y, spec.centerZ);

  const accent = new THREE.Color(spec.accentHex);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xbac6d4, roughness: 0.62, metalness: 0.14 });
  const charcoalMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.5 });
  const accentMat = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.36, metalness: 0.35 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(spec.width, 4.4, spec.depth), wallMat);
  body.position.y = 2.2;
  group.add(body);

  const curtainFront = new THREE.Mesh(new THREE.PlaneGeometry(spec.width - 0.16, 4.24), curtainMat);
  curtainFront.position.set(0, 2.2, spec.depth * 0.5 + 0.02);
  group.add(curtainFront);

  const roofCap = new THREE.Mesh(new THREE.BoxGeometry(spec.width + 0.6, 0.32, spec.depth + 0.6), accentMat);
  roofCap.position.y = 4.56;
  group.add(roofCap);

  const canopy = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.18, 1.6), charcoalMat);
  canopy.position.set(0, 3.2, spec.depth * 0.5 + 0.75);
  group.add(canopy);

  const signTex = textures.createSignboard(spec.label, spec.subtitle, spec.accentHex);
  const signMat = new THREE.MeshStandardMaterial({
    map: signTex,
    emissive: new THREE.Color(0xffffff),
    emissiveMap: signTex,
    emissiveIntensity: 0.12,
    roughness: 0.42,
  });
  const signFrame = new THREE.Mesh(new THREE.BoxGeometry(6.0, 1.4, 0.24), charcoalMat);
  signFrame.position.set(0, 5.45, spec.depth * 0.5 - 0.1);
  group.add(signFrame);
  const signFace = new THREE.Mesh(new THREE.PlaneGeometry(5.8, 1.24), signMat);
  signFace.position.set(0, 5.45, spec.depth * 0.5 + 0.04);
  group.add(signFace);

  const hvac = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.85, 1.4), steelMat);
  hvac.position.set(-3.4, 5.1, -1.8);
  group.add(hvac);

  mergeSolidSubtreeToVertexColors(group, {
    roughness: 0.48,
    metalness: 0.28,
    castShadow: true,
    receiveShadow: true,
  });

  const hitProxy = new THREE.Mesh(
    new THREE.BoxGeometry(spec.width + 1.0, 6.8, spec.depth + 2.0),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  hitProxy.position.set(spec.centerX, 4.8, spec.centerZ);
  hitProxy.userData.portalId = spec.id;

  return { group, hitProxy };
}

function buildPierLighthouse(
  x: number,
  y: number,
  z: number,
  accentHex: number,
  lanternMat: THREE.MeshStandardMaterial,
): THREE.Group {
  const lh = new THREE.Group();
  lh.position.set(x, y, z);
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.5, metalness: 0.1 });
  const accentMat = new THREE.MeshStandardMaterial({ color: accentHex, roughness: 0.46, metalness: 0.18 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.52, metalness: 0.55 });

  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.4, 1.2, 12), darkMat);
  plinth.position.y = 0.6;
  lh.add(plinth);
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.85, 11.5, 12), whiteMat);
  tower.position.y = 6.9;
  lh.add(tower);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1.36, 1.56, 2.8, 12), accentMat);
  band.position.y = 7.4;
  lh.add(band);
  const gallery = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.25, 0.5, 12), darkMat);
  gallery.position.y = 12.7;
  lh.add(gallery);
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 1.7, 10), lanternMat);
  lantern.position.y = 13.7;
  lh.add(lantern);
  const dome = new THREE.Mesh(new THREE.ConeGeometry(1.25, 1.5, 10), accentMat);
  dome.position.y = 15.25;
  lh.add(dome);

  mergeSolidSubtreeToVertexColors(lh, {
    roughness: 0.48,
    metalness: 0.24,
    castShadow: true,
    receiveShadow: true,
  });
  return lh;
}

/**
 * Builds the Home Harbor Diorama & Dynamic SEDMS Project Berths:
 *   - Strictly separates `shipsRoot` (business SEDMS projects from API/fixtures)
 *     from `sceneryRoot` (decorative Hero "씨스타호", Floating Dry Dock "FD-01",
 *     10+ background vessels, lighthouses, buoys, fabrication halls, and cranes).
 *   - Includes raised central waterfront observation terrace + sloped ramps matching `sampleHarborElevation`.
 *   - Attaches a toggleable 3D LiDAR point-cloud scan shell to every selectable vessel.
 */
export function buildShipyardWorld(
  scene: THREE.Scene,
  textures: HarborTexturePack,
): ShipyardWorldHandles {
  const clickablePortalProxies: THREE.Object3D[] = [];
  const clickableHubBuildingProxies: THREE.Object3D[] = [];
  const clickableShipProxies: THREE.Object3D[] = [];
  const clickableDecorativeShipProxies: THREE.Object3D[] = [];
  const walkableMeshes: THREE.Object3D[] = [];
  const dockedShips: DockedShipRuntime[] = [];
  const decorativeVessels: DecorativeVesselRuntime[] = [];
  const hubBuildings: HubBuildingRuntime[] = [];
  const clouds: Array<{ sprite: THREE.Sprite; speed: number; baseX: number }> = [];
  const staticDisposables: Array<{ dispose: () => void }> = [];

  // PBR Materials (Standard) + Low-Spec Fallback Materials (Lambert)
  const concretePbrMat = new THREE.MeshStandardMaterial({
    color: 0xb0bcc9,
    map: textures.concreteAlbedo,
    bumpMap: textures.concreteBump,
    bumpScale: 0.09,
    roughnessMap: textures.concreteRoughness,
    roughness: 0.9,
    metalness: 0.04,
  });
  const concreteLowMat = new THREE.MeshLambertMaterial({ color: 0x9aa8b6 });

  const asphaltPbrMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    map: textures.asphaltRoad,
    roughness: 0.92,
    metalness: 0.04,
  });
  const asphaltLowMat = new THREE.MeshLambertMaterial({ color: 0x334155 });

  const containerYardPbrMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    bumpMap: textures.containerRibBump,
    bumpScale: 0.1,
    roughnessMap: textures.containerRibRoughness,
    roughness: 0.68,
    metalness: 0.26,
  });
  const containerYardLowMat = new THREE.MeshLambertMaterial({ color: 0xffffff });

  const seawallMat = new THREE.MeshStandardMaterial({ color: 0x2c3a4c, roughness: 0.9, metalness: 0.08 });
  const hazardMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.hazardTrim,
    roughness: 0.62,
    metalness: 0.1,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.38, metalness: 0.72 });
  const curtainMat = new THREE.MeshStandardMaterial({
    map: textures.curtainWall,
    emissive: new THREE.Color(0x93c5fd),
    emissiveMap: textures.curtainWall,
    emissiveIntensity: 0.14,
    roughness: 0.24,
    metalness: 0.38,
  });
  const aviationRedMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0xef4444,
    emissiveIntensity: 0.9,
    roughness: 0.26,
  });
  const bridgeGlowMat = new THREE.MeshStandardMaterial({
    color: 0xf5e8c8,
    emissive: 0xfde68a,
    emissiveIntensity: 0.32,
    roughness: 0.24,
  });

  staticDisposables.push(
    concretePbrMat,
    concreteLowMat,
    asphaltPbrMat,
    asphaltLowMat,
    containerYardPbrMat,
    containerYardLowMat,
    seawallMat,
    hazardMat,
    steelMat,
    curtainMat,
    aviationRedMat,
    bridgeGlowMat,
  );

  // 1. North Quay (x in [-94, 94], z in [-48, -2.5]) + West/East Outfitting Piers
  const quayBase = new THREE.Mesh(new THREE.BoxGeometry(188, 2.6, 45.5), seawallMat);
  quayBase.position.set(0, 0.05, -25.25);
  quayBase.receiveShadow = true;
  scene.add(quayBase);

  const quayDeck = new THREE.Mesh(new THREE.BoxGeometry(188.4, 0.38, 45.7), concretePbrMat);
  quayDeck.position.set(0, 1.42, -25.25);
  quayDeck.receiveShadow = true;
  scene.add(quayDeck);
  walkableMeshes.push(quayDeck);

  const rearApron = new THREE.Mesh(new THREE.BoxGeometry(200, 1.9, 46), asphaltPbrMat);
  rearApron.position.set(0, 0.62, -71.0);
  rearApron.receiveShadow = true;
  scene.add(rearApron);

  const concreteMeshes: THREE.Mesh[] = [quayDeck];
  for (const side of [-1, 1]) {
    const px = side * 84.5;
    const pierBase = new THREE.Mesh(new THREE.BoxGeometry(19, 2.5, 40), seawallMat);
    pierBase.position.set(px, 0.1, 17.5);
    pierBase.receiveShadow = true;
    scene.add(pierBase);

    const pierDeck = new THREE.Mesh(new THREE.BoxGeometry(19.2, 0.38, 40.0), concretePbrMat);
    pierDeck.position.set(px, 1.418, 17.5);
    pierDeck.receiveShadow = true;
    scene.add(pierDeck);
    walkableMeshes.push(pierDeck);
    concreteMeshes.push(pierDeck);

    const sideTrim = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.05, 40.0), hazardMat);
    sideTrim.position.set(side * 75.2, QUAY_DECK_TOP_Y + Z_FIGHTING_SAFE_OFFSET, 17.5);
    scene.add(sideTrim);

    // Outer waterfront outfitting pier ladders/gangway decks toward Hero vessels (씨스타호 / FD-01)
    const outerTrim = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.05, 40.0), hazardMat);
    outerTrim.position.set(side * 93.7, QUAY_DECK_TOP_Y + Z_FIGHTING_SAFE_OFFSET, 17.5);
    scene.add(outerTrim);
  }

  const frontTrim = new THREE.Mesh(new THREE.BoxGeometry(150.0, 0.05, 0.56), hazardMat);
  frontTrim.position.set(0, QUAY_DECK_TOP_Y + Z_FIGHTING_SAFE_OFFSET, -2.72);
  scene.add(frontTrim);

  // Central Plaza Inlay + Raised Observation Terrace & Flanking Ramps (matching sampleHarborElevation!)
  const plazaTileMat = new THREE.MeshStandardMaterial({
    color: 0x8d9aa8,
    roughness: 0.86,
    metalness: 0.04,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const plazaInlay = new THREE.Mesh(new THREE.PlaneGeometry(66, 15.0), plazaTileMat);
  plazaInlay.rotation.x = -Math.PI / 2;
  plazaInlay.position.set(0, QUAY_DECK_TOP_Y + Z_FIGHTING_SAFE_OFFSET, -11.5);
  plazaInlay.receiveShadow = true;
  scene.add(plazaInlay);

  const terraceH = OBSERVATION_DECK_Y - QUAY_DECK_TOP_Y; // 0.80m
  const terraceWoodMat = new THREE.MeshStandardMaterial({ color: 0x8b623f, roughness: 0.72, metalness: 0.05 });
  const terracePlatform = new THREE.Mesh(new THREE.BoxGeometry(16.0, terraceH, 4.0), terraceWoodMat);
  terracePlatform.position.set(0, QUAY_DECK_TOP_Y + terraceH * 0.5, -16.2);
  terracePlatform.castShadow = true;
  terracePlatform.receiveShadow = true;
  scene.add(terracePlatform);
  walkableMeshes.push(terracePlatform);

  // Left & Right sloped ramps (|x| from 8 to 12) matching sampleHarborElevation
  const rampLen = Math.hypot(4.0, terraceH);
  const rampAngle = Math.atan2(terraceH, 4.0);
  for (const side of [-1, 1]) {
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(rampLen, 0.16, 4.0), terraceWoodMat);
    ramp.position.set(side * 10.0, QUAY_DECK_TOP_Y + terraceH * 0.5 - 0.06, -16.2);
    ramp.rotation.z = side < 0 ? rampAngle : -rampAngle;
    ramp.receiveShadow = true;
    scene.add(ramp);
    walkableMeshes.push(ramp);
  }
  const terraceRail = new THREE.Mesh(new THREE.BoxGeometry(16.0, 0.08, 0.08), steelMat);
  terraceRail.position.set(0, OBSERVATION_DECK_Y + 0.92, -18.1);
  scene.add(terraceRail);
  staticDisposables.push(terraceWoodMat);

  const plazaRing = new THREE.Mesh(
    new THREE.RingGeometry(3.0, 3.55, 40),
    new THREE.MeshBasicMaterial({
      color: 0x0284c7,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    }),
  );
  plazaRing.rotation.x = -Math.PI / 2;
  plazaRing.position.set(0, QUAY_DECK_TOP_Y + Z_FIGHTING_SAFE_OFFSET * 2, -9.8);
  scene.add(plazaRing);

  // =========================================================================
  // 2. INSTANCED HARBOR INFRASTRUCTURE
  // =========================================================================
  const dummy = new THREE.Object3D();
  const tmpColor = new THREE.Color();

  const fenderPositions: Array<{ x: number; y: number; z: number; ry: number }> = [];
  const bollardPositions: Array<{ x: number; y: number; z: number }> = [];
  for (let bx = -66; bx <= 66; bx += 13.2) {
    fenderPositions.push({ x: bx, y: 0.88, z: -2.26, ry: 0 });
    bollardPositions.push({ x: bx, y: QUAY_DECK_TOP_Y, z: -3.45 });
  }
  for (const side of [-1, 1]) {
    for (let bz = 4; bz <= 32; bz += 7) {
      fenderPositions.push({ x: side * 74.75, y: 0.88, z: bz, ry: Math.PI / 2 });
      fenderPositions.push({ x: side * 94.25, y: 0.88, z: bz, ry: Math.PI / 2 });
      bollardPositions.push({ x: side * 76.2, y: QUAY_DECK_TOP_Y, z: bz });
      bollardPositions.push({ x: side * 92.6, y: QUAY_DECK_TOP_Y, z: bz });
    }
  }

  const fenderGeo = new THREE.BoxGeometry(2.8, 0.72, 0.45);
  const fenderMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9 });
  const fenderInst = new THREE.InstancedMesh(fenderGeo, fenderMat, fenderPositions.length);
  fenderPositions.forEach((fp, i) => {
    dummy.position.set(fp.x, fp.y, fp.z);
    dummy.rotation.set(0, fp.ry, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    fenderInst.setMatrixAt(i, dummy.matrix);
  });
  fenderInst.instanceMatrix.needsUpdate = true;
  fenderInst.computeBoundingSphere();
  scene.add(fenderInst);

  const bollardPostGeo = new THREE.CylinderGeometry(0.24, 0.3, 0.56, 8);
  const bollardCapGeo = new THREE.CylinderGeometry(0.32, 0.24, 0.14, 8);
  const bollardMat = new THREE.MeshStandardMaterial({ color: 0xdca420, roughness: 0.44, metalness: 0.32 });
  const bollardPostInst = new THREE.InstancedMesh(bollardPostGeo, bollardMat, bollardPositions.length);
  const bollardCapInst = new THREE.InstancedMesh(bollardCapGeo, bollardMat, bollardPositions.length);
  bollardPositions.forEach((bp, i) => {
    dummy.position.set(bp.x, bp.y + 0.28, bp.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    bollardPostInst.setMatrixAt(i, dummy.matrix);

    dummy.position.set(bp.x, bp.y + 0.58, bp.z);
    dummy.updateMatrix();
    bollardCapInst.setMatrixAt(i, dummy.matrix);
  });
  bollardPostInst.instanceMatrix.needsUpdate = true;
  bollardCapInst.instanceMatrix.needsUpdate = true;
  bollardPostInst.computeBoundingSphere();
  bollardCapInst.computeBoundingSphere();
  scene.add(bollardPostInst, bollardCapInst);

  // Breakwater armor stone blocks along pier toes
  const stoneSpecs: Array<{ x: number; y: number; z: number; sx: number; sy: number; sz: number; ry: number; rx: number; shade: number }> = [];
  let stoneSeed = 913;
  const sRand = () => {
    stoneSeed = (stoneSeed * 1664525 + 1013904223) % 4294967296;
    return stoneSeed / 4294967296;
  };
  for (const side of [-1, 1]) {
    const outerX = side * 96.4;
    for (let i = 0; i < 16; i += 1) {
      const z = -1.5 + i * 2.45;
      stoneSpecs.push({
        x: outerX + side * (1.0 + sRand() * 1.4),
        y: 0.25 + sRand() * 0.4,
        z: z + (sRand() - 0.5) * 0.8,
        sx: 1.4 + sRand() * 1.0,
        sy: 0.9 + sRand() * 0.65,
        sz: 1.4 + sRand() * 0.9,
        ry: sRand() * Math.PI,
        rx: (sRand() - 0.5) * 0.4,
        shade: 0.75 + sRand() * 0.28,
      });
    }
  }
  const stoneGeo = new THREE.DodecahedronGeometry(1.0, 0);
  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x7c8a98,
    roughness: 0.92,
    metalness: 0.04,
    flatShading: true,
  });
  const breakwaterInst = new THREE.InstancedMesh(stoneGeo, stoneMat, stoneSpecs.length);
  stoneSpecs.forEach((st, i) => {
    dummy.position.set(st.x, st.y, st.z);
    dummy.rotation.set(st.rx, st.ry, 0);
    dummy.scale.set(st.sx, st.sy, st.sz);
    dummy.updateMatrix();
    breakwaterInst.setMatrixAt(i, dummy.matrix);
    tmpColor.setRGB(st.shade * 0.54, st.shade * 0.58, st.shade * 0.63);
    breakwaterInst.setColorAt(i, tmpColor);
  });
  breakwaterInst.instanceMatrix.needsUpdate = true;
  if (breakwaterInst.instanceColor) breakwaterInst.instanceColor.needsUpdate = true;
  breakwaterInst.computeBoundingSphere();
  scene.add(breakwaterInst);

  // Planter Trees
  const treeCoords: Array<[number, number]> = [
    [-64, -17.8],
    [-46, -17.8],
    [-22, -17.8],
    [22, -17.8],
    [46, -17.8],
    [64, -17.8],
    [-84.5, 4.0],
    [84.5, 4.0],
  ];
  const curbGeo = new THREE.BoxGeometry(2.5, 0.52, 2.5);
  const trunkGeo = new THREE.CylinderGeometry(0.14, 0.22, 1.55, 7);
  const crown1Geo = new THREE.ConeGeometry(1.18, 1.35, 7);
  const crown2Geo = new THREE.ConeGeometry(0.9, 1.15, 7);

  const curbStoneMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.82 });
  const treeTrunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.88 });
  const foliageDeepMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, flatShading: true });
  const foliageLightMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, flatShading: true });

  const curbInst = new THREE.InstancedMesh(curbGeo, curbStoneMat, treeCoords.length);
  const trunkInst = new THREE.InstancedMesh(trunkGeo, treeTrunkMat, treeCoords.length);
  const crown1Inst = new THREE.InstancedMesh(crown1Geo, foliageDeepMat, treeCoords.length);
  const crown2Inst = new THREE.InstancedMesh(crown2Geo, foliageLightMat, treeCoords.length);

  treeCoords.forEach(([tx, tz], i) => {
    const scaleVar = 0.9 + ((i * 37) % 10) * 0.025;
    dummy.position.set(tx, QUAY_DECK_TOP_Y + 0.26, tz);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    curbInst.setMatrixAt(i, dummy.matrix);

    dummy.position.set(tx, QUAY_DECK_TOP_Y + 1.25 * scaleVar, tz);
    dummy.scale.set(scaleVar, scaleVar, scaleVar);
    dummy.updateMatrix();
    trunkInst.setMatrixAt(i, dummy.matrix);

    dummy.position.set(tx, QUAY_DECK_TOP_Y + 2.15 * scaleVar, tz);
    dummy.rotation.set(0, i * 0.8, 0);
    dummy.updateMatrix();
    crown1Inst.setMatrixAt(i, dummy.matrix);
    tmpColor.setHSL(0.39 + (i % 3) * 0.015, 0.5, 0.24 + (i % 2) * 0.04);
    crown1Inst.setColorAt(i, tmpColor);

    dummy.position.set(tx + 0.06 * Math.sin(i + 1), QUAY_DECK_TOP_Y + 2.92 * scaleVar, tz + 0.06 * Math.cos(i + 1));
    dummy.rotation.set(0, i * 1.4, 0);
    dummy.updateMatrix();
    crown2Inst.setMatrixAt(i, dummy.matrix);
    tmpColor.setHSL(0.38 + (i % 3) * 0.015, 0.46, 0.32 + (i % 2) * 0.05);
    crown2Inst.setColorAt(i, tmpColor);
  });
  for (const inst of [curbInst, trunkInst, crown1Inst, crown2Inst]) {
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.computeBoundingSphere();
    scene.add(inst);
  }

  // Streetlights & High-Mast Lighting Towers
  const lampCoords: Array<{ x: number; z: number; ry: number }> = [];
  for (let lx = -60; lx <= 60; lx += 15) {
    lampCoords.push({ x: lx, z: -4.8, ry: 0 });
  }
  for (const side of [-1, 1]) {
    lampCoords.push({ x: side * 78.5, z: 12, ry: side < 0 ? Math.PI / 2 : -Math.PI / 2 });
    lampCoords.push({ x: side * 78.5, z: 28, ry: side < 0 ? Math.PI / 2 : -Math.PI / 2 });
  }

  const lampPoleGeo = new THREE.CylinderGeometry(0.1, 0.14, 5.4, 7);
  const lampArmGeo = new THREE.BoxGeometry(0.12, 0.12, 1.5);
  const lampHeadGeo = new THREE.BoxGeometry(0.45, 0.16, 0.72);
  const lampPoleMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.45, metalness: 0.65 });
  const lampGlowMat = new THREE.MeshStandardMaterial({
    color: 0xf5e8c8,
    emissive: 0xfde68a,
    emissiveIntensity: 0.45,
    roughness: 0.28,
  });

  const lampPoleInst = new THREE.InstancedMesh(lampPoleGeo, lampPoleMat, lampCoords.length);
  const lampArmInst = new THREE.InstancedMesh(lampArmGeo, lampPoleMat, lampCoords.length);
  const lampHeadInst = new THREE.InstancedMesh(lampHeadGeo, lampGlowMat, lampCoords.length);

  lampCoords.forEach((lp, i) => {
    const dirX = Math.sin(lp.ry);
    const dirZ = Math.cos(lp.ry);

    dummy.position.set(lp.x, QUAY_DECK_TOP_Y + 2.7, lp.z);
    dummy.rotation.set(0, lp.ry, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    lampPoleInst.setMatrixAt(i, dummy.matrix);

    dummy.position.set(lp.x + dirX * 0.65, QUAY_DECK_TOP_Y + 5.35, lp.z + dirZ * 0.65);
    dummy.updateMatrix();
    lampArmInst.setMatrixAt(i, dummy.matrix);

    dummy.position.set(lp.x + dirX * 1.25, QUAY_DECK_TOP_Y + 5.25, lp.z + dirZ * 1.25);
    dummy.updateMatrix();
    lampHeadInst.setMatrixAt(i, dummy.matrix);
  });
  for (const inst of [lampPoleInst, lampArmInst, lampHeadInst]) {
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    scene.add(inst);
  }

  // Quay Benches
  const benchXs = [-22, -10, 10, 22];
  const benchSeatGeo = new THREE.BoxGeometry(3.0, 0.12, 0.56);
  const benchBackGeo = new THREE.BoxGeometry(3.0, 0.28, 0.08);
  const benchWoodMat = new THREE.MeshStandardMaterial({ color: 0x9a5422, roughness: 0.68 });
  const benchSeatInst = new THREE.InstancedMesh(benchSeatGeo, benchWoodMat, benchXs.length);
  const benchBackInst = new THREE.InstancedMesh(benchBackGeo, benchWoodMat, benchXs.length);
  benchXs.forEach((bx, i) => {
    dummy.position.set(bx, QUAY_DECK_TOP_Y + 0.48, -5.8);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    benchSeatInst.setMatrixAt(i, dummy.matrix);

    dummy.position.set(bx, QUAY_DECK_TOP_Y + 0.78, -6.02);
    dummy.rotation.set(-0.14, 0, 0);
    dummy.updateMatrix();
    benchBackInst.setMatrixAt(i, dummy.matrix);
  });
  benchSeatInst.instanceMatrix.needsUpdate = true;
  benchBackInst.instanceMatrix.needsUpdate = true;
  benchSeatInst.computeBoundingSphere();
  benchBackInst.computeBoundingSphere();
  scene.add(benchSeatInst, benchBackInst);

  // Corrugated Yard Containers (low-saturation realistic maritime tones)
  const yardContainerSpecs: Array<{ x: number; y: number; z: number; color: number }> = [
    { x: -66, y: 0, z: -34, color: 0x1e5c8a },
    { x: -66, y: 1, z: -34, color: 0xb87628 },
    { x: -58, y: 0, z: -34, color: 0x2a6b55 },
    { x: -58, y: 0, z: -30.8, color: 0x8e3333 },
    { x: -58, y: 1, z: -30.8, color: 0x354d6e },
    { x: -66, y: 0, z: -30.8, color: 0x1f6262 },
    { x: 58, y: 0, z: -34, color: 0xa84d25 },
    { x: 58, y: 1, z: -34, color: 0x1e5c8a },
    { x: 66, y: 0, z: -34, color: 0x354d6e },
    { x: 66, y: 0, z: -30.8, color: 0x2a6b55 },
    { x: 66, y: 1, z: -30.8, color: 0xb87628 },
    { x: 58, y: 0, z: -30.8, color: 0x8e3333 },
  ];
  const yardContainerGeo = new THREE.BoxGeometry(6.2, 2.5, 2.6);
  const yardContainerInst = new THREE.InstancedMesh(
    yardContainerGeo,
    containerYardPbrMat,
    yardContainerSpecs.length,
  );
  yardContainerSpecs.forEach((yc, i) => {
    dummy.position.set(yc.x, QUAY_DECK_TOP_Y + 1.25 + yc.y * 2.52, yc.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    yardContainerInst.setMatrixAt(i, dummy.matrix);
    tmpColor.setHex(yc.color);
    yardContainerInst.setColorAt(i, tmpColor);
  });
  yardContainerInst.instanceMatrix.needsUpdate = true;
  if (yardContainerInst.instanceColor) yardContainerInst.instanceColor.needsUpdate = true;
  yardContainerInst.computeBoundingSphere();
  scene.add(yardContainerInst);

  staticDisposables.push(
    fenderGeo,
    fenderMat,
    bollardPostGeo,
    bollardCapGeo,
    bollardMat,
    stoneGeo,
    stoneMat,
    curbGeo,
    trunkGeo,
    crown1Geo,
    crown2Geo,
    curbStoneMat,
    treeTrunkMat,
    foliageDeepMat,
    foliageLightMat,
    lampPoleGeo,
    lampArmGeo,
    lampHeadGeo,
    lampPoleMat,
    lampGlowMat,
    benchSeatGeo,
    benchBackGeo,
    benchWoodMat,
    yardContainerGeo,
    plazaTileMat,
  );

  // 3. Four SGW Portal Pavilions (SGTALK / NAS / bmail / SGW Admin)
  for (const spec of PORTAL_BUILDINGS) {
    const { group, hitProxy } = buildPortalPavilion(spec, textures, curtainMat, steelMat);
    scene.add(group);
    scene.add(hitProxy);
    clickablePortalProxies.push(hitProxy);
  }

  // 4. Twin Goliath Gantry Cranes ("SEASTAR HEAVY" — DOCK-01 / DOCK-02) + Rear Fabrication Halls
  scene.add(buildGoliathCrane(-44.0, QUAY_DECK_TOP_Y, -39.5, 0xb4481c, textures.craneBannerOrange, aviationRedMat));
  scene.add(buildGoliathCrane(44.0, QUAY_DECK_TOP_Y, -39.5, 0x144e78, textures.craneBannerBlue, aviationRedMat));

  // Rear industrial shipyard fabrication hangars (dark slate corrugated steel + pitched navy roofs + bay doors)
  const hallMat = new THREE.MeshStandardMaterial({
    color: 0x3b4d62,
    bumpMap: textures.containerRibBump,
    bumpScale: 0.08,
    roughness: 0.72,
    metalness: 0.24,
  });
  const hallRoofMat = new THREE.MeshStandardMaterial({ color: 0x1c3147, roughness: 0.58, metalness: 0.34 });
  const hallDoorMat = new THREE.MeshStandardMaterial({ color: 0x162230, roughness: 0.76, metalness: 0.28 });
  const hallTrimMat = new THREE.MeshStandardMaterial({ color: 0x26394d, roughness: 0.6, metalness: 0.3 });
  for (const hx of [-64, 0, 64]) {
    const hallGroup = new THREE.Group();
    hallGroup.position.set(hx, 1.56, -70);

    const mainBody = new THREE.Mesh(new THREE.BoxGeometry(40, 12.2, 20), hallMat);
    mainBody.position.y = 6.1;
    mainBody.castShadow = true;
    mainBody.receiveShadow = true;
    hallGroup.add(mainBody);

    // Architectural stepped industrial roof + clerestory monitor
    const lowerRoof = new THREE.Mesh(new THREE.BoxGeometry(41.2, 0.9, 21.2), hallRoofMat);
    lowerRoof.position.y = 12.65;
    hallGroup.add(lowerRoof);
    const upperMonitor = new THREE.Mesh(new THREE.BoxGeometry(34, 2.2, 9.5), hallRoofMat);
    upperMonitor.position.y = 14.0;
    hallGroup.add(upperMonitor);

    // Recessed hangar bay doors & vertical structural steel pilasters facing harbor
    for (const bx of [-12, 0, 12]) {
      const bayDoor = new THREE.Mesh(new THREE.BoxGeometry(7.2, 6.8, 0.45), hallDoorMat);
      bayDoor.position.set(bx, 3.4, 10.05);
      hallGroup.add(bayDoor);
    }
    for (const px of [-18.5, -6, 6, 18.5]) {
      const pilaster = new THREE.Mesh(new THREE.BoxGeometry(0.9, 12.2, 0.65), hallTrimMat);
      pilaster.position.set(px, 6.1, 10.12);
      hallGroup.add(pilaster);
    }
    scene.add(hallGroup);
  }

  // Distant coastal pine-slate mountain ridges behind the shipyard for organic natural skyline depth
  const ridgeNearMat = new THREE.MeshStandardMaterial({
    color: 0x2d4a40,
    roughness: 0.94,
    metalness: 0.02,
    flatShading: true,
  });
  const ridgeFarMat = new THREE.MeshStandardMaterial({
    color: 0x3b586e,
    roughness: 0.95,
    metalness: 0.02,
    flatShading: true,
  });
  const ridgeSpecs = [
    { x: -165, z: -138, sx: 1.7, sy: 0.48, sz: 0.95, r: 58, mat: ridgeNearMat },
    { x: -82, z: -148, sx: 1.9, sy: 0.54, sz: 0.9, r: 62, mat: ridgeNearMat },
    { x: 6, z: -165, sx: 2.2, sy: 0.56, sz: 0.95, r: 68, mat: ridgeFarMat },
    { x: 96, z: -148, sx: 1.85, sy: 0.5, sz: 0.9, r: 60, mat: ridgeNearMat },
    { x: 176, z: -138, sx: 1.65, sy: 0.46, sz: 0.95, r: 56, mat: ridgeNearMat },
  ];
  for (const rs of ridgeSpecs) {
    const ridge = new THREE.Mesh(
      new THREE.SphereGeometry(rs.r, 11, 7, 0, Math.PI * 2, 0, Math.PI * 0.5),
      rs.mat,
    );
    ridge.scale.set(rs.sx, rs.sy, rs.sz);
    ridge.position.set(rs.x, -1.0, rs.z);
    ridge.rotation.y = (rs.x * 0.02) % Math.PI;
    scene.add(ridge);
  }
  staticDisposables.push(hallMat, hallRoofMat, hallDoorMat, hallTrimMat, ridgeNearMat, ridgeFarMat);

  // Twin Pier-Head Lighthouses (West Red / East Green maritime harbor entrance markers)
  scene.add(buildPierLighthouse(-84.5, QUAY_DECK_TOP_Y, 34.5, 0xb91c1c, lampGlowMat));
  scene.add(buildPierLighthouse(84.5, QUAY_DECK_TOP_Y, 34.5, 0x15803d, lampGlowMat));

  // 5. High-Altitude Soft Clouds
  const cloudMat = new THREE.SpriteMaterial({
    map: textures.cloudPuff,
    transparent: true,
    opacity: 0.52,
    depthWrite: false,
  });
  for (let i = 0; i < 6; i += 1) {
    const sp = new THREE.Sprite(cloudMat);
    const baseX = -150 + i * 62;
    sp.position.set(baseX, 66 + (i % 3) * 9, -110 - (i % 2) * 35);
    sp.scale.set(46 + (i % 3) * 10, 18, 1);
    scene.add(sp);
    clouds.push({ sprite: sp, speed: 0.45 + (i % 3) * 0.22, baseX });
  }
  staticDisposables.push(cloudMat);

  // =========================================================================
  // 6. DEDICATED DECORATIVE SCENERY LAYER (Hero "씨스타호", "FD-01", 10+ Ships)
  //    STRICTLY SEPARATED FROM BUSINESS SEDMS SHIPS (`shipsRoot`)!
  // =========================================================================
  const sceneryRoot = new THREE.Group();
  sceneryRoot.name = 'DecorativeHarborSceneryRoot';
  sceneryRoot.userData.isDecorative = true;
  scene.add(sceneryRoot);

  HOME_HARBOR_DECORATIVE_VESSELS.forEach((spec, idx) => {
    const anchor = new THREE.Group();
    anchor.position.set(spec.x, 0.05, spec.z);
    anchor.rotation.y = THREE.MathUtils.degToRad(spec.defaultYawDeg);
    anchor.scale.setScalar(spec.scale);
    anchor.userData.isDecorative = true;
    anchor.userData.decorativeShipId = spec.id;

    const vesselMesh = buildProjectVessel3D(spec.vesselType, textures, bridgeGlowMat, false);
    anchor.add(vesselMesh);

    // 3D scan point-cloud shell (toggled on selection)
    const scanCloud = buildVesselScanPointCloud(
      vesselMesh,
      spec.isHero ? 0xf59e0b : 0x38bdf8,
    );
    anchor.add(scanCloud);
    sceneryRoot.add(anchor);

    const hitProxy = new THREE.Mesh(
      new THREE.BoxGeometry(spec.halfBeam * 2.1, 18, spec.halfLength * 2.05),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    hitProxy.position.set(spec.x, 7.5, spec.z);
    hitProxy.rotation.y = THREE.MathUtils.degToRad(spec.defaultYawDeg);
    hitProxy.userData.decorativeShipId = spec.id;
    hitProxy.userData.isDecorative = true;
    sceneryRoot.add(hitProxy);
    clickableDecorativeShipProxies.push(hitProxy);

    decorativeVessels.push({
      spec,
      anchor,
      hitProxy,
      scanCloud,
      phase: idx * 0.91 + 0.4,
    });
  });

  // =========================================================================
  // 7. DYNAMIC SEDMS BUSINESS PROJECT SHIPS (`shipsRoot` — API / Fixtures ONLY)
  // =========================================================================
  const shipsRoot = new THREE.Group();
  shipsRoot.name = 'BusinessProjectShipsRoot';
  scene.add(shipsRoot);
  let shipStatusRingBatch: THREE.InstancedMesh | null = null;
  let boardingMarkerBatch: THREE.InstancedMesh | null = null;
  let lastAppliedPrefs: ShipDisplayPrefsMap = {};
  let currentSelectedShipId: string | null = null;

  const clearDockedShips = () => {
    if (shipStatusRingBatch) {
      shipsRoot.remove(shipStatusRingBatch);
      shipStatusRingBatch.geometry.dispose();
      (shipStatusRingBatch.material as THREE.Material).dispose();
      shipStatusRingBatch = null;
    }
    if (boardingMarkerBatch) {
      shipsRoot.remove(boardingMarkerBatch);
      boardingMarkerBatch.geometry.dispose();
      (boardingMarkerBatch.material as THREE.Material).dispose();
      boardingMarkerBatch = null;
    }
    for (const item of dockedShips) {
      shipsRoot.remove(item.anchor);
      shipsRoot.remove(item.hitProxy);
      disposeObjectTree(item.anchor);
      item.hitProxy.geometry.dispose();
      (item.hitProxy.material as THREE.Material).dispose();
    }
    dockedShips.length = 0;
    clickableShipProxies.length = 0;
  };

  const applyShipDisplayPrefs = (prefs: ShipDisplayPrefsMap) => {
    lastAppliedPrefs = prefs;
    for (const item of dockedShips) {
      const customYaw = prefs[item.ship.id]?.yawDeg;
      const yawDeg = customYaw !== undefined ? customYaw : item.defaultYawDeg;
      const rad = THREE.MathUtils.degToRad(yawDeg);
      item.anchor.rotation.y = rad;
      item.hitProxy.rotation.y = rad;
    }
    for (const deco of decorativeVessels) {
      const customYaw = prefs[deco.spec.id]?.yawDeg;
      const yawDeg = customYaw !== undefined ? customYaw : deco.spec.defaultYawDeg;
      const rad = THREE.MathUtils.degToRad(yawDeg);
      deco.anchor.rotation.y = rad;
      deco.hitProxy.rotation.y = rad;
    }
  };

  const setSelectedShipId = (shipId: string | null) => {
    currentSelectedShipId = shipId;
    for (const item of dockedShips) {
      item.scanCloud.visible = shipId === item.ship.id;
    }
    for (const deco of decorativeVessels) {
      deco.scanCloud.visible = shipId === deco.spec.id;
    }
  };

  const syncProjectShips = (ships: HarborShip[], lowSpec: boolean, prefs?: ShipDisplayPrefsMap) => {
    if (prefs) lastAppliedPrefs = prefs;
    clearDockedShips();
    const statusRingSpecs: Array<{ x: number; y: number; z: number; colorHex: number }> = [];
    const boardingMarkerSpecs: Array<{ x: number; y: number; z: number; colorHex: number }> = [];

    ships.forEach((ship, idx) => {
      const defaultYawDeg = 90;
      const effectiveYawDeg = lastAppliedPrefs[ship.id]?.yawDeg ?? defaultYawDeg;
      const yawRad = THREE.MathUtils.degToRad(effectiveYawDeg);

      const anchor = new THREE.Group();
      anchor.position.set(ship.berthX, 0.05, ship.berthZ);
      anchor.rotation.y = yawRad;
      anchor.scale.setScalar(0.84);

      const silhouette = getVesselSilhouetteByIndex(ship.hullStyleIndex);
      const vesselMesh = buildProjectVessel3D(silhouette, textures, bridgeGlowMat, lowSpec);
      anchor.add(vesselMesh);

      const flagColor = new THREE.Color(ship.appearance.flagHex);
      const hullAccentColor = new THREE.Color(ship.appearance.hullAccentHex);

      // Signal flag mast distinguishing active business project vessels
      const flagGroup = new THREE.Group();
      flagGroup.position.set(0, 12.2, 13.5);
      const poleMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.35, metalness: 0.7 });
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 7.2, 8), poleMat);
      pole.position.y = 3.6;
      flagGroup.add(pole);

      const flagMat = new THREE.MeshStandardMaterial({
        color: flagColor,
        emissive: flagColor,
        emissiveIntensity: 0.32,
        roughness: 0.42,
        metalness: 0.08,
        side: THREE.DoubleSide,
      });

      let flagMesh: THREE.Mesh;
      if (ship.appearance.flagPattern === 'pennant') {
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.lineTo(5.6, 0.8);
        shape.lineTo(0, 1.9);
        shape.closePath();
        flagMesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), flagMat);
        flagMesh.position.set(0.12, 5.1, 0);
      } else if (ship.appearance.flagPattern === 'swallowtail') {
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.lineTo(5.2, 0);
        shape.lineTo(3.9, 1.0);
        shape.lineTo(5.2, 2.0);
        shape.lineTo(0, 2.0);
        shape.closePath();
        flagMesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), flagMat);
        flagMesh.position.set(0.12, 5.0, 0);
      } else {
        flagMesh = new THREE.Mesh(new THREE.PlaneGeometry(5.0, 2.1), flagMat);
        flagMesh.position.set(2.65, 6.0, 0);
      }
      flagGroup.add(flagMesh);
      anchor.add(flagGroup);

      // Business project hull status trim band (highlights business ships cleanly vs scenery)
      const trimMat = new THREE.MeshStandardMaterial({
        color: hullAccentColor,
        emissive: hullAccentColor,
        emissiveIntensity: 0.18,
        roughness: 0.4,
        metalness: 0.25,
      });
      const trimInst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 0.55, 28.0), trimMat, 2);
      [-1, 1].forEach((side, sIdx) => {
        dummy.position.set(side * 5.85, 3.6, 0);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        trimInst.setMatrixAt(sIdx, dummy.matrix);
      });
      trimInst.instanceMatrix.needsUpdate = true;
      trimInst.computeBoundingSphere();
      anchor.add(trimInst);

      // 7-day updated deck floodlights
      const lampPostMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5, metalness: 0.65 });
      const lampBulbMat = ship.appearance.hasDeckLights
        ? new THREE.MeshStandardMaterial({
            color: 0xfef08a,
            emissive: 0xfbbf24,
            emissiveIntensity: 2.0,
            roughness: 0.2,
          })
        : new THREE.MeshStandardMaterial({
            color: 0x475569,
            emissive: 0x000000,
            emissiveIntensity: 0,
            roughness: 0.7,
          });
      const deckPostInst = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.1, 2.2, 6), lampPostMat, 8);
      const deckBulbInst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.3, 8, 8), lampBulbMat, 8);
      let dIdx = 0;
      for (const lz of [-11.5, -3.5, 4.5, 11.5]) {
        for (const lx of [-4.6, 4.6]) {
          dummy.position.set(lx, 5.6, lz);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          deckPostInst.setMatrixAt(dIdx, dummy.matrix);

          dummy.position.set(lx, 6.85, lz);
          dummy.updateMatrix();
          deckBulbInst.setMatrixAt(dIdx, dummy.matrix);
          dIdx += 1;
        }
      }
      deckPostInst.instanceMatrix.needsUpdate = true;
      deckBulbInst.instanceMatrix.needsUpdate = true;
      deckPostInst.computeBoundingSphere();
      deckBulbInst.computeBoundingSphere();
      anchor.add(deckPostInst, deckBulbInst);

      // 3D LiDAR Point-Cloud Scan Shell (Requirement #10 — toggled on ship selection)
      const scanCloud = buildVesselScanPointCloud(vesselMesh, flagColor.getHex());
      scanCloud.visible = currentSelectedShipId === ship.id;
      anchor.add(scanCloud);

      shipsRoot.add(anchor);

      statusRingSpecs.push({
        x: ship.berthX,
        y: 0.09,
        z: ship.berthZ,
        colorHex: flagColor.getHex(),
      });

      boardingMarkerSpecs.push({
        x: ship.boardingPoint.x,
        y: QUAY_DECK_TOP_Y + Z_FIGHTING_SAFE_OFFSET * 2.2,
        z: ship.boardingPoint.z,
        colorHex: flagColor.getHex(),
      });

      // Local-aligned hit proxy (rotates cleanly with ship heading!)
      const hitProxy = new THREE.Mesh(
        new THREE.BoxGeometry(16, 18, 40),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      hitProxy.position.set(ship.berthX, 7.5, ship.berthZ);
      hitProxy.rotation.y = yawRad;
      hitProxy.userData.projectId = ship.id;
      shipsRoot.add(hitProxy);
      clickableShipProxies.push(hitProxy);

      dockedShips.push({
        ship,
        anchor,
        hitProxy,
        scanCloud,
        defaultYawDeg,
        phase: idx * 1.37,
      });
    });

    shipStatusRingBatch = createInstancedRingBatch(statusRingSpecs, {
      innerRadius: 15.5,
      outerRadius: 16.4,
      segments: 36,
      opacity: 0.56,
    });
    if (shipStatusRingBatch) {
      shipsRoot.add(shipStatusRingBatch);
    }

    boardingMarkerBatch = createInstancedRingBatch(boardingMarkerSpecs, {
      innerRadius: 1.15,
      outerRadius: 1.55,
      segments: 24,
      opacity: 0.78,
      polygonOffset: true,
    });
    if (boardingMarkerBatch) {
      shipsRoot.add(boardingMarkerBatch);
    }
  };

  // =========================================================================
  // 8. DYNAMIC HUB MODULE HARBOR BUILDINGS (Stage 8 — /api/meta/registry + summary)
  //    Places planned & active hub systems (`s360`, `secad`, `pdf`, `mail`, `secms`,
  //    and any future registry systems) on empty quay/pier lots without touching
  //    existing SGW Portal Pavilions or docked SEDMS ships.
  // =========================================================================
  const hubBuildingsRoot = new THREE.Group();
  hubBuildingsRoot.name = 'HubModuleBuildingsRoot';
  scene.add(hubBuildingsRoot);

  const clearHubBuildings = () => {
    for (const item of hubBuildings) {
      hubBuildingsRoot.remove(item.group);
      hubBuildingsRoot.remove(item.hitProxy);
      item.dispose();
    }
    hubBuildings.length = 0;
    clickableHubBuildingProxies.length = 0;
  };

  const syncHubBuildings = (placements: HubBuildingPlacement[], lowSpec: boolean) => {
    clearHubBuildings();
    placements.forEach((placement, idx) => {
      const built = buildHubModuleBuilding3D(placement, textures, lowSpec, idx);
      hubBuildingsRoot.add(built.group);
      hubBuildingsRoot.add(built.hitProxy);
      hubBuildings.push(built);
      clickableHubBuildingProxies.push(built.hitProxy);
    });
  };

  const setLowSpecMode = (lowSpec: boolean) => {
    for (const cm of concreteMeshes) {
      cm.material = lowSpec ? concreteLowMat : concretePbrMat;
    }
    (rearApron as THREE.Mesh).material = lowSpec ? asphaltLowMat : asphaltPbrMat;
    (yardContainerInst as THREE.InstancedMesh<THREE.BufferGeometry, THREE.Material>).material =
      lowSpec ? containerYardLowMat : containerYardPbrMat;

    for (const c of clouds) {
      c.sprite.visible = !lowSpec;
    }
    for (const item of dockedShips) {
      item.anchor.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = !lowSpec;
          mesh.receiveShadow = !lowSpec;
        }
      });
    }
    for (const deco of decorativeVessels) {
      deco.anchor.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = !lowSpec;
          mesh.receiveShadow = !lowSpec;
        }
      });
    }
    for (const hb of hubBuildings) {
      hb.group.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = !lowSpec;
          mesh.receiveShadow = !lowSpec;
        }
      });
    }
  };

  return {
    clickablePortalProxies,
    clickableHubBuildingProxies,
    clickableShipProxies,
    clickableDecorativeShipProxies,
    walkableMeshes,
    dockedShips,
    decorativeVessels,
    hubBuildings,
    bridgeGlowMat,
    instancedPropCounts: {
      bollards: bollardPositions.length,
      fenders: fenderPositions.length,
      breakwaterStones: stoneSpecs.length,
      trees: treeCoords.length,
      streetlights: lampCoords.length,
      yardContainers: yardContainerSpecs.length,
    },
    syncProjectShips,
    syncHubBuildings,
    applyShipDisplayPrefs,
    setSelectedShipId,
    setLowSpecMode,
    update: (dt: number, elapsed: number, lowSpec: boolean) => {
      if (lowSpec) return;

      for (const c of clouds) {
        c.sprite.position.x += c.speed * dt;
        if (c.sprite.position.x > 195) c.sprite.position.x = -195;
      }

      for (const hb of hubBuildings) {
        const baseIntensity = hb.placement.appearance.lightsOn ? 1.35 : 0.6;
        const speed = hb.placement.chip.status === 'unavailable' ? 4.2 : 2.1;
        hb.beaconMat.emissiveIntensity = baseIntensity + Math.sin(elapsed * speed + hb.phase) * 0.45;
      }

      for (const item of dockedShips) {
        item.anchor.position.y = 0.05 + Math.sin(elapsed * 1.15 + item.phase) * 0.14;
        item.anchor.rotation.z = Math.sin(elapsed * 0.85 + item.phase) * 0.011;
        if (item.scanCloud.visible) {
          const mat = item.scanCloud.material as THREE.PointsMaterial;
          mat.opacity = 0.65 + Math.sin(elapsed * 3.5) * 0.2;
        }
      }

      for (const deco of decorativeVessels) {
        deco.anchor.position.y = 0.05 + Math.sin(elapsed * 1.0 + deco.phase) * 0.12;
        deco.anchor.rotation.z = Math.sin(elapsed * 0.75 + deco.phase) * 0.01;
        if (deco.spec.cruise) {
          const span = deco.spec.cruise.rangeX;
          const offset = Math.sin(elapsed * 0.018 * Math.abs(deco.spec.cruise.speed) + deco.phase) * span;
          const nextX = deco.spec.x + offset;
          deco.anchor.position.x = nextX;
          deco.hitProxy.position.x = nextX;
        }
        if (deco.scanCloud.visible) {
          const mat = deco.scanCloud.material as THREE.PointsMaterial;
          mat.opacity = 0.65 + Math.sin(elapsed * 3.5) * 0.2;
        }
      }
    },
    dispose: () => {
      clearHubBuildings();
      clearDockedShips();
      for (const deco of decorativeVessels) {
        sceneryRoot.remove(deco.anchor);
        sceneryRoot.remove(deco.hitProxy);
        disposeObjectTree(deco.anchor);
        deco.hitProxy.geometry.dispose();
        (deco.hitProxy.material as THREE.Material).dispose();
      }
      decorativeVessels.length = 0;
      clickableDecorativeShipProxies.length = 0;
      for (const d of staticDisposables) {
        d.dispose();
      }
    },
  };
}
