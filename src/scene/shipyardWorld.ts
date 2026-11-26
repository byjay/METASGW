import * as THREE from 'three';
import { PORTAL_BUILDINGS, type PortalBuildingSpec } from '../core/navMeshEngine';
import type { HarborShip } from '../mapping';
import { mergeSolidSubtreeToVertexColors } from './meshBatching';
import {
  buildProjectVessel3D,
  disposeObjectTree,
  getVesselSilhouetteByIndex,
} from './projectVesselTypes';
import type { HarborTexturePack } from './textures';

/** Top surface elevation of the concrete quay apron. */
export const QUAY_DECK_TOP_Y = 1.61;
/** Elevation offset for flush safety trims & floor decals to prevent coplanar Z-fighting. */
export const Z_FIGHTING_SAFE_OFFSET = 0.025;

export interface DockedShipRuntime {
  ship: HarborShip;
  anchor: THREE.Group;
  hitProxy: THREE.Mesh;
  statusRing: THREE.Mesh;
  phase: number;
}

export interface ShipyardWorldHandles {
  clickablePortalProxies: THREE.Object3D[];
  clickableShipProxies: THREE.Object3D[];
  walkableMeshes: THREE.Object3D[];
  dockedShips: DockedShipRuntime[];
  instancedPropCounts: {
    bollards: number;
    fenders: number;
    breakwaterStones: number;
    trees: number;
    streetlights: number;
    yardContainers: number;
  };
  syncProjectShips: (ships: HarborShip[], lowSpec: boolean) => void;
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

  const paintMat = new THREE.MeshStandardMaterial({ color: paintHex, roughness: 0.42, metalness: 0.45 });
  const darkSteel = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.72 });
  const girderFaceMat = new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.38, metalness: 0.35 });
  const hookYellowMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.42, metalness: 0.25 });

  for (const sx of [-5.2, 5.2]) {
    const bogie = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.15, 8.2), darkSteel);
    bogie.position.set(sx, 0.58, 0);
    bogie.castShadow = true;
    bogie.receiveShadow = true;
    crane.add(bogie);

    for (const sz of [-3.5, 3.5]) {
      addDiagonalBrace(crane, new THREE.Vector3(sx, 1.1, sz), new THREE.Vector3(sx * 0.84, 17.5, sz * 0.24), 0.38, paintMat);
    }
    addDiagonalBrace(crane, new THREE.Vector3(sx * 0.94, 6.5, -2.5), new THREE.Vector3(sx * 0.94, 6.5, 2.5), 0.17, darkSteel);
  }

  const mainGirder = new THREE.Mesh(new THREE.BoxGeometry(20.5, 2.5, 2.3), paintMat);
  mainGirder.position.set(0, 18.6, 0);
  crane.add(mainGirder);

  const bannerFront = new THREE.Mesh(new THREE.PlaneGeometry(20.2, 2.35), girderFaceMat);
  bannerFront.position.set(0, 18.6, 1.17);
  crane.add(bannerFront);

  const boom = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.3, 18.0), paintMat);
  boom.position.set(0, 17.6, 6.0);
  crane.add(boom);

  const trolley = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.5, 3.2), darkSteel);
  trolley.position.set(0, 20.4, 0.2);
  crane.add(trolley);

  const hookBlock = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.72, 0.9), hookYellowMat);
  hookBlock.position.set(0, 11.2, 10.8);
  crane.add(hookBlock);

  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 8), beaconMat);
  beacon.position.set(0, 20.3, 0);
  crane.add(beacon);

  mergeSolidSubtreeToVertexColors(crane, {
    roughness: 0.44,
    metalness: 0.48,
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
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.54, metalness: 0.14 });
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
    emissiveIntensity: 0.35,
    roughness: 0.32,
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

/**
 * Builds the SGW Harbor quay & dynamic SEDMS project berths.
 * - Uses OffscreenCanvas PBR maps (concrete joints/weathering, corrugated containers) with low-spec Lambert fallback.
 * - Uses InstancedMesh for bollards, fenders, breakwater stones, trees, streetlights, benches, and yard containers
 *   to keep total scene Draw Calls well under 150.
 * - Elevates safety lines & floor markings by +0.025m above QUAY_DECK_TOP_Y to eliminate Z-fighting.
 */
export function buildShipyardWorld(
  scene: THREE.Scene,
  textures: HarborTexturePack,
): ShipyardWorldHandles {
  const clickablePortalProxies: THREE.Object3D[] = [];
  const clickableShipProxies: THREE.Object3D[] = [];
  const walkableMeshes: THREE.Object3D[] = [];
  const dockedShips: DockedShipRuntime[] = [];
  const clouds: Array<{ sprite: THREE.Sprite; speed: number; baseX: number }> = [];
  const staticDisposables: Array<{ dispose: () => void }> = [];

  // PBR Materials (Standard) + Low-Spec Fallback Materials (Lambert)
  const concretePbrMat = new THREE.MeshStandardMaterial({
    color: 0xdde4ec,
    map: textures.concreteAlbedo,
    bumpMap: textures.concreteBump,
    bumpScale: 0.09,
    roughnessMap: textures.concreteRoughness,
    roughness: 0.9,
    metalness: 0.05,
  });
  const concreteLowMat = new THREE.MeshLambertMaterial({ color: 0xb6c2cf });

  const asphaltPbrMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    map: textures.asphaltRoad,
    roughness: 0.9,
    metalness: 0.04,
  });
  const asphaltLowMat = new THREE.MeshLambertMaterial({ color: 0x3f4e63 });

  const containerYardPbrMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    bumpMap: textures.containerRibBump,
    bumpScale: 0.1,
    roughnessMap: textures.containerRibRoughness,
    roughness: 0.7,
    metalness: 0.28,
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
    emissive: new THREE.Color(0xbae6fd),
    emissiveMap: textures.curtainWall,
    emissiveIntensity: 0.42,
    roughness: 0.18,
    metalness: 0.42,
  });
  const aviationRedMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0xef4444,
    emissiveIntensity: 2.0,
    roughness: 0.2,
  });
  const bridgeGlowMat = new THREE.MeshStandardMaterial({
    color: 0xfef3c7,
    emissive: 0xfde68a,
    emissiveIntensity: 1.35,
    roughness: 0.14,
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

  // 1. North Quay (x in [-94, 94], z in [-48, -2.5]) + West/East Piers
  const quayBase = new THREE.Mesh(new THREE.BoxGeometry(188, 2.6, 45.5), seawallMat);
  quayBase.position.set(0, 0.05, -25.25);
  quayBase.receiveShadow = true;
  scene.add(quayBase);

  const quayDeck = new THREE.Mesh(new THREE.BoxGeometry(188.4, 0.38, 45.7), concretePbrMat);
  quayDeck.position.set(0, 1.42, -25.25); // Top sits cleanly at QUAY_DECK_TOP_Y = 1.610
  quayDeck.receiveShadow = true;
  scene.add(quayDeck);
  walkableMeshes.push(quayDeck);

  const rearApron = new THREE.Mesh(new THREE.BoxGeometry(204, 1.9, 20), asphaltPbrMat);
  rearApron.position.set(0, 0.62, -58.0);
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

    // Waterfront safety line elevated cleanly by +0.025m (no Z-fighting!)
    const sideTrim = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.05, 40.0), hazardMat);
    sideTrim.position.set(side * 75.2, QUAY_DECK_TOP_Y + Z_FIGHTING_SAFE_OFFSET, 17.5);
    scene.add(sideTrim);
  }

  const frontTrim = new THREE.Mesh(new THREE.BoxGeometry(150.0, 0.05, 0.56), hazardMat);
  frontTrim.position.set(0, QUAY_DECK_TOP_Y + Z_FIGHTING_SAFE_OFFSET, -2.72);
  scene.add(frontTrim);

  // Central Plaza Inlay + Compass Ring (elevated with >= +0.025m separation)
  const plazaTileMat = new THREE.MeshStandardMaterial({
    color: 0xd5dee8,
    roughness: 0.72,
    metalness: 0.06,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const plazaInlay = new THREE.Mesh(new THREE.PlaneGeometry(66, 15.0), plazaTileMat);
  plazaInlay.rotation.x = -Math.PI / 2;
  plazaInlay.position.set(0, QUAY_DECK_TOP_Y + Z_FIGHTING_SAFE_OFFSET, -11.5);
  plazaInlay.receiveShadow = true;
  scene.add(plazaInlay);

  const plazaRing = new THREE.Mesh(
    new THREE.RingGeometry(3.0, 3.55, 40),
    new THREE.MeshBasicMaterial({
      color: 0x0284c7,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    }),
  );
  plazaRing.rotation.x = -Math.PI / 2;
  plazaRing.position.set(0, QUAY_DECK_TOP_Y + Z_FIGHTING_SAFE_OFFSET * 2, -10.5);
  scene.add(plazaRing);

  // =========================================================================
  // 2. INSTANCED HARBOR INFRASTRUCTURE (Keep total Draw Calls <= 150!)
  // =========================================================================
  const dummy = new THREE.Object3D();
  const tmpColor = new THREE.Color();

  // 2a. Instanced Rubber Fenders & Mooring Bollards (North Quay + West/East Piers)
  const fenderPositions: Array<{ x: number; y: number; z: number; ry: number }> = [];
  const bollardPositions: Array<{ x: number; y: number; z: number }> = [];
  for (let bx = -66; bx <= 66; bx += 13.2) {
    fenderPositions.push({ x: bx, y: 0.88, z: -2.26, ry: 0 });
    bollardPositions.push({ x: bx, y: QUAY_DECK_TOP_Y, z: -3.45 });
  }
  for (const side of [-1, 1]) {
    for (let bz = 4; bz <= 32; bz += 7) {
      fenderPositions.push({ x: side * 74.75, y: 0.88, z: bz, ry: Math.PI / 2 });
      bollardPositions.push({ x: side * 76.2, y: QUAY_DECK_TOP_Y, z: bz });
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
  const bollardMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.44, metalness: 0.32 });
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

  // 2b. Instanced Breakwater Armor Stone Blocks (방파제 석축 — West & East Outer Revetments)
  const stoneSpecs: Array<{ x: number; y: number; z: number; sx: number; sy: number; sz: number; ry: number; rx: number; shade: number }> = [];
  let stoneSeed = 913;
  const sRand = () => {
    stoneSeed = (stoneSeed * 1664525 + 1013904223) % 4294967296;
    return stoneSeed / 4294967296;
  };
  for (const side of [-1, 1]) {
    const outerX = side * 95.8;
    for (let i = 0; i < 18; i += 1) {
      const z = -2.0 + i * 2.45;
      // Lower submerged-to-waterline tier
      stoneSpecs.push({
        x: outerX + side * (1.2 + sRand() * 1.4),
        y: 0.25 + sRand() * 0.4,
        z: z + (sRand() - 0.5) * 0.8,
        sx: 1.5 + sRand() * 1.1,
        sy: 1.0 + sRand() * 0.7,
        sz: 1.5 + sRand() * 1.0,
        ry: sRand() * Math.PI,
        rx: (sRand() - 0.5) * 0.4,
        shade: 0.75 + sRand() * 0.3,
      });
      // Upper crest armor tier
      stoneSpecs.push({
        x: outerX + side * (0.1 + sRand() * 0.9),
        y: 1.05 + sRand() * 0.45,
        z: z + (sRand() - 0.5) * 0.8,
        sx: 1.2 + sRand() * 0.85,
        sy: 0.85 + sRand() * 0.55,
        sz: 1.25 + sRand() * 0.85,
        ry: sRand() * Math.PI,
        rx: (sRand() - 0.5) * 0.4,
        shade: 0.82 + sRand() * 0.26,
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

  // 2c. Instanced Planter Trees (나무 — Curbs + Trunks + Dual Crowns with color tint variation)
  const treeCoords: Array<[number, number]> = [
    [-64, -17.8],
    [-46, -17.8],
    [-22, -17.8],
    [-10, -17.8],
    [10, -17.8],
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
    tmpColor.setHSL(0.39 + (i % 3) * 0.015, 0.56, 0.25 + (i % 2) * 0.04);
    crown1Inst.setColorAt(i, tmpColor);

    dummy.position.set(tx + 0.06 * Math.sin(i + 1), QUAY_DECK_TOP_Y + 2.92 * scaleVar, tz + 0.06 * Math.cos(i + 1));
    dummy.rotation.set(0, i * 1.4, 0);
    dummy.updateMatrix();
    crown2Inst.setMatrixAt(i, dummy.matrix);
    tmpColor.setHSL(0.38 + (i % 3) * 0.015, 0.52, 0.34 + (i % 2) * 0.05);
    crown2Inst.setColorAt(i, tmpColor);
  });
  for (const inst of [curbInst, trunkInst, crown1Inst, crown2Inst]) {
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.computeBoundingSphere();
    scene.add(inst);
  }

  // 2d. Instanced Quay Streetlights (가로등 — Pole + Arm + Warm Luminaire)
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
    color: 0xfef3c7,
    emissive: 0xfde68a,
    emissiveIntensity: 1.6,
    roughness: 0.2,
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

  // 2e. Instanced Quay Benches (4 benches batched into 2 draw calls)
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

  // 2f. Instanced Quay Yard Containers (Corrugated Bump + Roughness PBR Showcase on East/West Apron)
  const yardContainerSpecs: Array<{ x: number; y: number; z: number; color: number }> = [
    { x: -66, y: 0, z: -34, color: 0x0284c7 },
    { x: -66, y: 1, z: -34, color: 0xd97706 },
    { x: -58, y: 0, z: -34, color: 0x059669 },
    { x: -58, y: 0, z: -30.8, color: 0xdc2626 },
    { x: -58, y: 1, z: -30.8, color: 0x1d4ed8 },
    { x: -66, y: 0, z: -30.8, color: 0x0f766e },
    { x: 58, y: 0, z: -34, color: 0xea580c },
    { x: 58, y: 1, z: -34, color: 0x0284c7 },
    { x: 66, y: 0, z: -34, color: 0x1d4ed8 },
    { x: 66, y: 0, z: -30.8, color: 0x059669 },
    { x: 66, y: 1, z: -30.8, color: 0xd97706 },
    { x: 58, y: 0, z: -30.8, color: 0xdc2626 },
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

  // 4. Twin Goliath Gantry Cranes (DOCK-01 / DOCK-02)
  scene.add(buildGoliathCrane(-44.0, QUAY_DECK_TOP_Y, -39.5, 0xc2410c, textures.craneBannerOrange, aviationRedMat));
  scene.add(buildGoliathCrane(44.0, QUAY_DECK_TOP_Y, -39.5, 0x0369a1, textures.craneBannerBlue, aviationRedMat));

  // 5. High-Altitude Soft Clouds (hidden in Low-Spec mode)
  const cloudMat = new THREE.SpriteMaterial({
    map: textures.cloudPuff,
    transparent: true,
    opacity: 0.58,
    depthWrite: false,
  });
  for (let i = 0; i < 6; i += 1) {
    const sp = new THREE.Sprite(cloudMat);
    const baseX = -140 + i * 56;
    sp.position.set(baseX, 58 + (i % 3) * 8, -95 - (i % 2) * 35);
    sp.scale.set(42 + (i % 3) * 10, 18, 1);
    scene.add(sp);
    clouds.push({ sprite: sp, speed: 0.5 + (i % 3) * 0.25, baseX });
  }
  staticDisposables.push(cloudMat);

  // 6. Dynamic SEDMS Project Ship Mount/Unmount Manager
  const shipsRoot = new THREE.Group();
  scene.add(shipsRoot);

  const clearDockedShips = () => {
    for (const item of dockedShips) {
      const bm = item.anchor.userData.boardingMarker as THREE.Mesh | undefined;
      if (bm) {
        shipsRoot.remove(bm);
        bm.geometry.dispose();
        (bm.material as THREE.Material).dispose();
      }
      shipsRoot.remove(item.anchor);
      shipsRoot.remove(item.hitProxy);
      shipsRoot.remove(item.statusRing);
      disposeObjectTree(item.anchor);
      item.hitProxy.geometry.dispose();
      (item.hitProxy.material as THREE.Material).dispose();
      item.statusRing.geometry.dispose();
      (item.statusRing.material as THREE.Material).dispose();
    }
    dockedShips.length = 0;
    clickableShipProxies.length = 0;
  };

  const syncProjectShips = (ships: HarborShip[], lowSpec: boolean) => {
    clearDockedShips();

    ships.forEach((ship, idx) => {
      const anchor = new THREE.Group();
      anchor.position.set(ship.berthX, 0.05, ship.berthZ);
      anchor.rotation.y = Math.PI / 2;
      anchor.scale.setScalar(0.84);

      const silhouette = getVesselSilhouetteByIndex(ship.hullStyleIndex);
      const vesselMesh = buildProjectVessel3D(silhouette, textures, bridgeGlowMat, lowSpec);
      anchor.add(vesselMesh);

      const flagColor = new THREE.Color(ship.appearance.flagHex);
      const hullAccentColor = new THREE.Color(ship.appearance.hullAccentHex);

      // 1) Signal flag mast + distinct silhouette
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

        if (ship.appearance.flagPattern === 'striped') {
          const stripeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
          const stripe = new THREE.Mesh(new THREE.PlaneGeometry(5.0, 0.48), stripeMat);
          stripe.position.set(2.65, 6.0, 0.03);
          flagGroup.add(stripe);
        } else if (ship.appearance.flagPattern === 'checkered') {
          const checkMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc, side: THREE.DoubleSide });
          const checkGeo = new THREE.PlaneGeometry(1.1, 0.9);
          const checkInst = new THREE.InstancedMesh(checkGeo, checkMat, 4);
          for (let c = 0; c < 4; c += 1) {
            dummy.position.set(0.8 + c * 1.25, c % 2 === 0 ? 6.48 : 5.52, 0.03);
            dummy.rotation.set(0, 0, 0);
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            checkInst.setMatrixAt(c, dummy.matrix);
          }
          checkInst.instanceMatrix.needsUpdate = true;
          checkInst.computeBoundingSphere();
          flagGroup.add(checkInst);
        }
      }
      flagGroup.add(flagMesh);
      anchor.add(flagGroup);

      // 2) Hull status trim bands (batched via 2-instance InstancedMesh)
      const trimMat = new THREE.MeshStandardMaterial({
        color: hullAccentColor,
        emissive: hullAccentColor,
        emissiveIntensity: 0.16,
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

      // 3) 7-day updated deck floodlights batched via InstancedMesh (2 draw calls per ship instead of 16!)
      const lampPostMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5, metalness: 0.65 });
      const lampBulbMat = ship.appearance.hasDeckLights
        ? new THREE.MeshStandardMaterial({
            color: 0xfef08a,
            emissive: 0xfbbf24,
            emissiveIntensity: 2.1,
            roughness: 0.2,
          })
        : new THREE.MeshStandardMaterial({
            color: 0x475569,
            emissive: 0x000000,
            emissiveIntensity: 0,
            roughness: 0.7,
          });
      const deckPostInst = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.1, 2.2, 6), lampPostMat, 8);
      const deckBulbInst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.32, 8, 8), lampBulbMat, 8);
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

      shipsRoot.add(anchor);

      const statusRing = new THREE.Mesh(
        new THREE.RingGeometry(15.5, 16.4, 36),
        new THREE.MeshBasicMaterial({
          color: flagColor,
          transparent: true,
          opacity: ship.appearance.hasDeckLights ? 0.62 : 0.38,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      statusRing.rotation.x = -Math.PI / 2;
      statusRing.position.set(ship.berthX, 0.09, ship.berthZ);
      shipsRoot.add(statusRing);

      // Quay boarding marker elevated cleanly above quay deck (+0.055m)
      const boardingMarker = new THREE.Mesh(
        new THREE.RingGeometry(1.15, 1.55, 24),
        new THREE.MeshBasicMaterial({
          color: flagColor,
          transparent: true,
          opacity: 0.78,
          side: THREE.DoubleSide,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -3,
          polygonOffsetUnits: -3,
        }),
      );
      boardingMarker.rotation.x = -Math.PI / 2;
      boardingMarker.position.set(
        ship.boardingPoint.x,
        QUAY_DECK_TOP_Y + Z_FIGHTING_SAFE_OFFSET * 2.2,
        ship.boardingPoint.z,
      );
      anchor.userData.boardingMarker = boardingMarker;
      shipsRoot.add(boardingMarker);

      const hitProxy = new THREE.Mesh(
        new THREE.BoxGeometry(40, 18, 16),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      hitProxy.position.set(ship.berthX, 7.5, ship.berthZ);
      hitProxy.userData.projectId = ship.id;
      shipsRoot.add(hitProxy);
      clickableShipProxies.push(hitProxy);

      dockedShips.push({
        ship,
        anchor,
        hitProxy,
        statusRing,
        phase: idx * 1.37,
      });
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
  };

  return {
    clickablePortalProxies,
    clickableShipProxies,
    walkableMeshes,
    dockedShips,
    instancedPropCounts: {
      bollards: bollardPositions.length,
      fenders: fenderPositions.length,
      breakwaterStones: stoneSpecs.length,
      trees: treeCoords.length,
      streetlights: lampCoords.length,
      yardContainers: yardContainerSpecs.length,
    },
    syncProjectShips,
    setLowSpecMode,
    update: (dt: number, elapsed: number, lowSpec: boolean) => {
      if (lowSpec) return;

      for (const c of clouds) {
        c.sprite.position.x += c.speed * dt;
        if (c.sprite.position.x > 190) c.sprite.position.x = -190;
      }

      for (const item of dockedShips) {
        item.anchor.position.y = 0.05 + Math.sin(elapsed * 1.15 + item.phase) * 0.14;
        item.anchor.rotation.z = Math.sin(elapsed * 0.85 + item.phase) * 0.012;
      }
    },
    dispose: () => {
      clearDockedShips();
      for (const d of staticDisposables) {
        d.dispose();
      }
    },
  };
}
