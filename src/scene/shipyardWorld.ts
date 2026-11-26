import * as THREE from 'three';
import { PORTAL_BUILDINGS, type PortalBuildingSpec } from '../core/navMeshEngine';
import type { HarborShip } from '../mapping';
import {
  buildProjectVessel3D,
  disposeObjectTree,
  getVesselSilhouetteByIndex,
} from './projectVesselTypes';
import type { HarborTexturePack } from './textures';

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
    addDiagonalBrace(crane, new THREE.Vector3(sx * 0.89, 12.2, -1.7), new THREE.Vector3(sx * 0.89, 12.2, 1.7), 0.16, darkSteel);
  }

  const girderMats = [paintMat, paintMat, paintMat, darkSteel, girderFaceMat, girderFaceMat];
  const mainGirder = new THREE.Mesh(new THREE.BoxGeometry(20.5, 2.5, 2.3), girderMats);
  mainGirder.position.set(0, 18.6, 0);
  mainGirder.castShadow = true;
  crane.add(mainGirder);

  const boom = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.3, 18.0), paintMat);
  boom.position.set(0, 17.6, 6.0);
  boom.castShadow = true;
  crane.add(boom);

  const trolley = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.5, 3.2), darkSteel);
  trolley.position.set(0, 20.4, 0.2);
  crane.add(trolley);

  for (const cx of [-1.0, 1.0]) {
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 7.0, 6), darkSteel);
    cable.position.set(cx, 13.4, 10.8);
    crane.add(cable);
  }
  const hookBlock = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.72, 0.9), hookYellowMat);
  hookBlock.position.set(0, 9.5, 10.8);
  crane.add(hookBlock);

  for (const bx of [-9.6, 0, 9.6]) {
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), beaconMat);
    beacon.position.set(bx, 20.2, 0);
    crane.add(beacon);
  }

  return crane;
}

function buildStylizedPlanterTree(
  x: number,
  z: number,
  curbMat: THREE.Material,
  trunkMat: THREE.Material,
  foliageLightMat: THREE.Material,
  foliageDeepMat: THREE.Material,
  seed: number,
): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 1.61, z);

  const curb = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.52, 2.5), curbMat);
  curb.position.y = 0.26;
  curb.receiveShadow = true;
  curb.castShadow = true;
  g.add(curb);

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 1.55, 7), trunkMat);
  trunk.position.y = 1.25;
  trunk.castShadow = true;
  g.add(trunk);

  const crown1 = new THREE.Mesh(new THREE.ConeGeometry(1.18, 1.35, 7), foliageDeepMat);
  crown1.position.y = 2.15;
  crown1.rotation.y = seed * 0.8;
  crown1.castShadow = true;
  g.add(crown1);

  const crown2 = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.15, 7), foliageLightMat);
  crown2.position.set(0.06 * Math.sin(seed), 2.92, 0.06 * Math.cos(seed));
  crown2.rotation.y = seed * 1.4;
  crown2.castShadow = true;
  g.add(crown2);

  return g;
}

function buildSlattedParkBench(
  x: number,
  z: number,
  woodMat: THREE.Material,
  ironMat: THREE.Material,
): THREE.Group {
  const b = new THREE.Group();
  b.position.set(x, 1.61, z);
  for (const lx of [-1.2, 0, 1.2]) {
    const legF = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.48, 0.08), ironMat);
    legF.position.set(lx, 0.24, 0.24);
    b.add(legF);
    const legB = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.08), ironMat);
    legB.position.set(lx, 0.45, -0.24);
    b.add(legB);
  }
  for (const sz of [-0.15, 0.02, 0.19]) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.06, 0.14), woodMat);
    slat.position.set(0, 0.49, sz);
    b.add(slat);
  }
  const back = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.24, 0.05), woodMat);
  back.position.set(0, 0.76, -0.21);
  back.rotation.x = -0.14;
  b.add(back);
  return b;
}

function buildPortalPavilion(
  spec: PortalBuildingSpec,
  textures: HarborTexturePack,
  curtainMat: THREE.MeshStandardMaterial,
  steelMat: THREE.MeshStandardMaterial,
): { group: THREE.Group; hitProxy: THREE.Mesh } {
  const group = new THREE.Group();
  group.position.set(spec.centerX, 1.61, spec.centerZ);

  const accent = new THREE.Color(spec.accentHex);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.54, metalness: 0.14 });
  const charcoalMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.5 });
  const accentMat = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.36, metalness: 0.35 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(spec.width, 4.4, spec.depth), [
    wallMat,
    wallMat,
    charcoalMat,
    charcoalMat,
    curtainMat,
    wallMat,
  ]);
  body.position.y = 2.2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

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

  const hitProxy = new THREE.Mesh(
    new THREE.BoxGeometry(spec.width + 1.0, 6.8, spec.depth + 2.0),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  hitProxy.position.set(spec.centerX, 4.8, spec.centerZ);
  hitProxy.userData.portalId = spec.id;

  return { group, hitProxy };
}

/**
 * Builds the clean diorama SGW Harbor quay & dynamic SEDMS project berths.
 * Starts with ZERO fabricated ships — ships appear strictly via `syncProjectShips(ships)`.
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

  const concreteMat = new THREE.MeshStandardMaterial({
    color: 0xdde4ec,
    map: textures.concreteAlbedo,
    bumpMap: textures.concreteBump,
    bumpScale: 0.08,
    roughness: 0.86,
    metalness: 0.06,
  });
  const asphaltMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    map: textures.asphaltRoad,
    roughness: 0.9,
    metalness: 0.04,
  });
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

  // 1. North Quay (x in [-94, 94], z in [-48, -2.5]) + West/East Piers
  const quayBase = new THREE.Mesh(new THREE.BoxGeometry(188, 2.6, 45.5), seawallMat);
  quayBase.position.set(0, 0.05, -25.25);
  quayBase.receiveShadow = true;
  scene.add(quayBase);

  const quayDeck = new THREE.Mesh(new THREE.BoxGeometry(188.4, 0.38, 45.7), concreteMat);
  quayDeck.position.set(0, 1.42, -25.25);
  quayDeck.receiveShadow = true;
  scene.add(quayDeck);
  walkableMeshes.push(quayDeck);

  const rearApron = new THREE.Mesh(new THREE.BoxGeometry(204, 1.9, 20), asphaltMat);
  rearApron.position.set(0, 0.62, -58.0);
  rearApron.receiveShadow = true;
  scene.add(rearApron);

  for (const side of [-1, 1]) {
    const px = side * 84.5;
    const pierBase = new THREE.Mesh(new THREE.BoxGeometry(19, 2.5, 40), seawallMat);
    pierBase.position.set(px, 0.1, 17.5);
    pierBase.receiveShadow = true;
    scene.add(pierBase);

    const pierDeck = new THREE.Mesh(new THREE.BoxGeometry(19.2, 0.38, 40.0), concreteMat);
    pierDeck.position.set(px, 1.418, 17.5);
    pierDeck.receiveShadow = true;
    scene.add(pierDeck);
    walkableMeshes.push(pierDeck);

    const sideTrim = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.24, 40.0), hazardMat);
    sideTrim.position.set(side * 75.2, 1.55, 17.5);
    scene.add(sideTrim);
  }

  const frontTrim = new THREE.Mesh(new THREE.BoxGeometry(150.0, 0.24, 0.52), hazardMat);
  frontTrim.position.set(0, 1.55, -2.68);
  scene.add(frontTrim);

  // Rubber Fenders & Mooring Bollards along Waterfront
  const fenderMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9 });
  const bollardMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.45, metalness: 0.3 });
  for (let bx = -66; bx <= 66; bx += 16.5) {
    const fender = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.72, 0.45), fenderMat);
    fender.position.set(bx, 0.85, -2.3);
    scene.add(fender);

    const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.55, 8), bollardMat);
    bollard.position.set(bx, 1.88, -3.3);
    scene.add(bollard);
  }

  // Central Plaza Inlay + Compass Ring
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
  plazaInlay.position.set(0, 1.635, -11.5);
  plazaInlay.receiveShadow = true;
  scene.add(plazaInlay);

  const plazaRing = new THREE.Mesh(
    new THREE.RingGeometry(3.0, 3.55, 40),
    new THREE.MeshBasicMaterial({
      color: 0x0284c7,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    }),
  );
  plazaRing.rotation.x = -Math.PI / 2;
  plazaRing.position.set(0, 1.655, -10.5);
  scene.add(plazaRing);

  // Stylized Benches & Planter Trees
  const benchWoodMat = new THREE.MeshStandardMaterial({ color: 0x9a5422, roughness: 0.68 });
  const benchIronMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.5 });
  const treeTrunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.88 });
  const foliageDeepMat = new THREE.MeshStandardMaterial({ color: 0x1f6f43, roughness: 0.82, flatShading: true });
  const foliageLightMat = new THREE.MeshStandardMaterial({ color: 0x2f8f54, roughness: 0.78, flatShading: true });
  const curbStoneMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.82 });

  [-22, -10, 10, 22].forEach((bx, idx) => {
    scene.add(buildSlattedParkBench(bx, -5.8, benchWoodMat, benchIronMat));
    scene.add(buildStylizedPlanterTree(bx, -17.8, curbStoneMat, treeTrunkMat, foliageLightMat, foliageDeepMat, idx + 1));
  });

  // 2. Four SGW Portal Pavilions (SGTALK / NAS / bmail / SGW Admin)
  for (const spec of PORTAL_BUILDINGS) {
    const { group, hitProxy } = buildPortalPavilion(spec, textures, curtainMat, steelMat);
    scene.add(group);
    scene.add(hitProxy);
    clickablePortalProxies.push(hitProxy);
  }

  // 3. Twin Goliath Gantry Cranes (Generic SGW HARBOR Signage)
  scene.add(buildGoliathCrane(-44.0, 1.61, -39.5, 0xc2410c, textures.craneBannerOrange, aviationRedMat));
  scene.add(buildGoliathCrane(44.0, 1.61, -39.5, 0x0369a1, textures.craneBannerBlue, aviationRedMat));

  // 4. High-Altitude Soft Clouds (hidden in Low-Spec mode)
  const cloudMat = new THREE.SpriteMaterial({
    map: textures.cloudPuff,
    transparent: true,
    opacity: 0.58,
    depthWrite: false,
  });
  for (let i = 0; i < 7; i += 1) {
    const sp = new THREE.Sprite(cloudMat);
    const baseX = -150 + i * 52;
    sp.position.set(baseX, 58 + (i % 3) * 8, -95 - (i % 2) * 35);
    sp.scale.set(42 + (i % 3) * 10, 18, 1);
    scene.add(sp);
    clouds.push({ sprite: sp, speed: 0.5 + (i % 3) * 0.25, baseX });
  }

  // 5. Dynamic SEDMS Project Ship Mount/Unmount Manager
  const shipsRoot = new THREE.Group();
  scene.add(shipsRoot);

  const clearDockedShips = () => {
    for (const item of dockedShips) {
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
      // Orient parallel to quay so hull side & bow silhouette read clearly in overview & quay views
      anchor.rotation.y = Math.PI / 2;
      anchor.scale.setScalar(0.84);

      const silhouette = getVesselSilhouetteByIndex(ship.hullStyleIndex);
      const vesselMesh = buildProjectVessel3D(silhouette, textures, bridgeGlowMat, lowSpec);
      anchor.add(vesselMesh);
      shipsRoot.add(anchor);

      const statusRing = new THREE.Mesh(
        new THREE.RingGeometry(15.5, 16.4, 36),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(ship.accentHex),
          transparent: true,
          opacity: 0.48,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      statusRing.rotation.x = -Math.PI / 2;
      statusRing.position.set(ship.berthX, 0.09, ship.berthZ);
      shipsRoot.add(statusRing);

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
      cloudMat.dispose();
    },
  };
}
