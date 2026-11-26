import * as THREE from 'three';
import { mergeSolidSubtreeToVertexColors } from './meshBatching';
import type { HarborTexturePack } from './textures';

export const VESSEL_SILHOUETTE_IDS = [
  'lng_carrier',
  'container_ship',
  'floating_dock',
  'vlcc_tanker',
  'wtiv_jackup',
  'fpso_offshore',
  'cruise_liner',
  'roro_car_carrier',
  'icebreaker_research',
  'naval_vessel',
] as const;

export type VesselSilhouetteId = (typeof VESSEL_SILHOUETTE_IDS)[number];

export function getVesselSilhouetteByIndex(index: number): VesselSilhouetteId {
  return VESSEL_SILHOUETTE_IDS[Math.abs(index) % VESSEL_SILHOUETTE_IDS.length];
}

/**
 * Cleanly disposes all geometries and materials inside a replaced 3D vessel group
 * so dynamically updated project berths have zero GPU memory leaks.
 */
export function disposeObjectTree(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();

  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material) {
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => materials.add(m));
      } else {
        materials.add(mesh.material);
      }
    }
  });

  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
}

function makeHullBow(width: number, height: number, bowLen: number, mat: THREE.Material): THREE.Mesh {
  const halfW = width * 0.5;
  const shape = new THREE.Shape();
  shape.moveTo(-halfW, 0);
  shape.lineTo(halfW, 0);
  shape.quadraticCurveTo(halfW * 0.8, -bowLen * 0.58, 0, -bowLen);
  shape.quadraticCurveTo(-halfW * 0.8, -bowLen * 0.58, -halfW, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = Math.PI / 2;
  return mesh;
}

/**
 * Builds one of 10 distinct procedural 3D vessel silhouettes for docked SEDMS project ships.
 * Centered around local (0, 0, 0) with bow facing -Z and waterline at y = 0.
 */
export function buildProjectVessel3D(
  vesselType: VesselSilhouetteId,
  textures: HarborTexturePack,
  windowGlowMat: THREE.MeshStandardMaterial,
  lowSpec = false,
): THREE.Group {
  const g = new THREE.Group();
  const glassMat = windowGlowMat.clone();

  const hullNavy = new THREE.MeshStandardMaterial({ color: 0x163963, roughness: 0.46, metalness: 0.24 });
  const hullRed = new THREE.MeshStandardMaterial({ color: 0x9f2222, roughness: 0.58, metalness: 0.16 });
  const deckSlate = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.68, metalness: 0.12 });
  const whiteSteel = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.44, metalness: 0.12 });
  const accentBlue = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.42, metalness: 0.2 });
  const craneYellow = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.42, metalness: 0.24 });
  const safetyOrange = new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.44, metalness: 0.16 });
  const silverMetal = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.34, metalness: 0.34 });

  if (vesselType === 'lng_carrier') {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(11.2, 4.8, 36.0), hullNavy);
    hull.position.set(0, 2.2, 0);
    g.add(hull);
    const hullDeck = new THREE.Mesh(new THREE.BoxGeometry(11.1, 0.2, 35.8), deckSlate);
    hullDeck.position.set(0, 4.62, 0);
    g.add(hullDeck);

    const boot = new THREE.Mesh(new THREE.BoxGeometry(11.36, 1.25, 36.2), hullRed);
    boot.position.set(0, 0.55, 0);
    g.add(boot);

    const bow = makeHullBow(11.2, 4.7, 10.2, hullNavy);
    bow.position.set(0, 4.55, -18.0);
    g.add(bow);

    const bulb = new THREE.Mesh(new THREE.SphereGeometry(1.35, 14, 10), hullRed);
    bulb.scale.set(0.88, 0.72, 2.4);
    bulb.position.set(0, 0.22, -27.2);
    g.add(bulb);

    const domeGeo = new THREE.SphereGeometry(3.75, 22, 16);
    const collarGeo = new THREE.CylinderGeometry(3.95, 4.05, 1.8, 20);
    for (const tz of [-12.6, -4.4, 3.8, 12.0]) {
      const collar = new THREE.Mesh(collarGeo, accentBlue);
      collar.position.set(0, 5.2, tz);
      g.add(collar);
      const dome = new THREE.Mesh(domeGeo, silverMetal);
      dome.position.set(0, 6.3, tz);
      g.add(dome);
    }

    // Elevated cryogenic pipe rack + manifold header
    const pipeRack = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.28, 30.0), silverMetal);
    pipeRack.position.set(0, 9.95, -0.4);
    g.add(pipeRack);
    const pipeRun = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 30.5, 10), safetyOrange);
    pipeRun.rotation.x = Math.PI / 2;
    pipeRun.position.set(0, 10.35, -0.4);
    g.add(pipeRun);
    const manifold = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.4, 2.2), safetyOrange);
    manifold.position.set(3.8, 5.8, -0.4);
    g.add(manifold);

    const house = new THREE.Mesh(new THREE.BoxGeometry(9.6, 7.8, 6.8), whiteSteel);
    house.position.set(0, 8.2, 15.6);
    g.add(house);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(13.0, 1.4, 2.2), whiteSteel);
    wing.position.set(0, 11.4, 14.4);
    g.add(wing);
    const win = new THREE.Mesh(new THREE.BoxGeometry(12.2, 0.74, 2.3), glassMat);
    win.position.set(0, 11.45, 14.35);
    g.add(win);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, 4.8, 8), whiteSteel);
    mast.position.set(0, 14.4, 14.6);
    g.add(mast);
    const radar = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.18, 0.28), whiteSteel);
    radar.position.set(0, 15.8, 14.6);
    g.add(radar);
    const funnel = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.8, 3.2), accentBlue);
    funnel.position.set(0, 13.4, 17.8);
    g.add(funnel);
  } else if (vesselType === 'container_ship') {
    // 2. 24K Mega Container Ship — 36 Corrugated Multi-Color ISO Containers + Twin Deck Cranes
    const hull = new THREE.Mesh(new THREE.BoxGeometry(10.6, 4.2, 35.0), hullNavy);
    hull.position.set(0, 1.9, 0);
    g.add(hull);
    const hullDeck = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.2, 34.8), deckSlate);
    hullDeck.position.set(0, 4.02, 0);
    g.add(hullDeck);
    const bow = makeHullBow(10.6, 4.1, 9.6, hullNavy);
    bow.position.set(0, 3.95, -17.5);
    g.add(bow);

    const cGeo = new THREE.BoxGeometry(2.15, 2.05, 5.8);
    const cMat = lowSpec
      ? new THREE.MeshLambertMaterial({ color: 0xffffff })
      : new THREE.MeshStandardMaterial({
          color: 0xffffff,
          bumpMap: textures.containerRibBump,
          bumpScale: 0.09,
          roughnessMap: textures.containerRibRoughness,
          roughness: 0.72,
          metalness: 0.24,
        });
    const palette = [0x0284c7, 0xdc2626, 0xd97706, 0x059669, 0x1d4ed8, 0xea580c];
    const bays = [-12.5, -5.8, 0.9];
    const boxes = new THREE.InstancedMesh(cGeo, cMat, bays.length * 4 * 3);
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    let idx = 0;
    for (let b = 0; b < bays.length; b++) {
      for (let c = 0; c < 4; c++) {
        for (let t = 0; t < 3; t++) {
          dummy.position.set(-3.45 + c * 2.3, 5.05 + t * 2.1, bays[b]);
          dummy.updateMatrix();
          boxes.setMatrixAt(idx, dummy.matrix);
          col.setHex(palette[(b * 5 + c * 3 + t * 2) % palette.length]);
          boxes.setColorAt(idx, col);
          idx++;
        }
      }
    }
    boxes.instanceMatrix.needsUpdate = true;
    if (boxes.instanceColor) boxes.instanceColor.needsUpdate = true;
    boxes.computeBoundingSphere();
    g.add(boxes);

    for (const cz of [-9.1, -2.4]) {
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.72, 7.4, 10), craneYellow);
      ped.position.set(0, 7.6, cz);
      g.add(ped);
      const boom = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 9.5), craneYellow);
      boom.position.set(0, 11.4, cz - 3.6);
      boom.rotation.x = 0.25;
      g.add(boom);
    }

    const tower = new THREE.Mesh(new THREE.BoxGeometry(9.0, 9.6, 6.2), whiteSteel);
    tower.position.set(0, 8.8, 12.2);
    g.add(tower);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(13.0, 1.5, 2.0), whiteSteel);
    wing.position.set(0, 12.6, 11.0);
    g.add(wing);
    const win = new THREE.Mesh(new THREE.BoxGeometry(12.2, 0.75, 2.1), glassMat);
    win.position.set(0, 12.65, 10.95);
    g.add(win);
    const funnel = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.8, 3.2), hullRed);
    funnel.position.set(0, 13.8, 14.6);
    g.add(funnel);
  } else if (vesselType === 'floating_dock') {
    // 3. Monumental Floating Dry Dock — Twin Wing Walls, Dock Cranes, Keel Blocks & Hull Under Construction
    const dockSteel = new THREE.MeshStandardMaterial({ color: 0x3b4d63, roughness: 0.54, metalness: 0.24 });
    const hazardYellow = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.44, metalness: 0.16 });
    const pontoon = new THREE.Mesh(new THREE.BoxGeometry(19.6, 2.0, 48.0), dockSteel);
    pontoon.position.set(0, 0.7, 0);
    g.add(pontoon);
    const floorPlate = new THREE.Mesh(new THREE.BoxGeometry(14.6, 0.26, 46.0), deckSlate);
    floorPlate.position.set(0, 1.82, 0);
    g.add(floorPlate);

    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(2.5, 9.6, 47.0), dockSteel);
      wall.position.set(side * 8.5, 6.2, 0);
      g.add(wall);
      const band = new THREE.Mesh(new THREE.BoxGeometry(2.62, 1.2, 47.2), hullRed);
      band.position.set(side * 8.5, 2.2, 0);
      g.add(band);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(2.66, 0.34, 47.2), hazardYellow);
      rail.position.set(side * 8.5, 11.1, 0);
      g.add(rail);

      const cBase = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.6, 3.2), accentBlue);
      cBase.position.set(side * 8.5, 12.5, side * -8.0);
      g.add(cBase);
      const cArm = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 13.0), accentBlue);
      cArm.position.set(side * 6.0, 16.4, side * -3.5);
      cArm.rotation.x = 0.45 * -side;
      cArm.rotation.z = side * 0.24;
      g.add(cArm);
    }

    const ctrl = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.4, 4.2), whiteSteel);
    ctrl.position.set(-8.5, 12.3, 17.5);
    g.add(ctrl);
    const ctrlWin = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.9, 3.2), glassMat);
    ctrlWin.position.set(-8.5, 12.5, 17.5);
    g.add(ctrlWin);

    for (let k = -15; k <= 15; k += 5) {
      const block = new THREE.Mesh(new THREE.BoxGeometry(3.8, 1.1, 1.4), hullRed);
      block.position.set(0, 2.4, k);
      g.add(block);
    }

    const innerHull = new THREE.Mesh(new THREE.BoxGeometry(9.0, 4.8, 32.0), hullNavy);
    innerHull.position.set(0, 5.3, 0);
    g.add(innerHull);
    const innerBow = makeHullBow(9.0, 4.7, 7.6, hullNavy);
    innerBow.position.set(0, 7.65, -16.0);
    g.add(innerBow);
    const innerBridge = new THREE.Mesh(new THREE.BoxGeometry(7.4, 4.2, 8.2), whiteSteel);
    innerBridge.position.set(0, 9.7, 7.2);
    g.add(innerBridge);
    const innerWin = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.75, 2.6), glassMat);
    innerWin.position.set(0, 11.1, 4.3);
    g.add(innerWin);
  } else if (vesselType === 'vlcc_tanker') {
    // 4. 300,000 DWT VLCC Crude Oil Tanker — Wide Deep-Red Deck, Manifold Pipes, Hose Cranes & Catwalk
    const tankerDeck = new THREE.MeshStandardMaterial({ color: 0x7f1d1d, roughness: 0.62, metalness: 0.14 });
    const hull = new THREE.Mesh(new THREE.BoxGeometry(14.0, 4.4, 40.0), hullNavy);
    hull.position.set(0, 2.0, 0);
    g.add(hull);
    const hullDeck = new THREE.Mesh(new THREE.BoxGeometry(13.9, 0.22, 39.8), tankerDeck);
    hullDeck.position.set(0, 4.22, 0);
    g.add(hullDeck);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(14.2, 1.4, 40.2), hullRed);
    boot.position.set(0, 0.6, 0);
    g.add(boot);
    const bow = makeHullBow(14.0, 4.3, 9.2, hullNavy);
    bow.position.set(0, 4.15, -20.0);
    g.add(bow);

    // Longitudinal cargo manifold pipelines & elevated central catwalk
    for (const px of [-2.4, -1.2, 1.2, 2.4]) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 30.0, 8), silverMetal);
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(px, 4.55, -2.5);
      g.add(pipe);
    }
    const catwalk = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.25, 31.0), craneYellow);
    catwalk.position.set(0, 5.2, -2.0);
    g.add(catwalk);

    // Midship Cargo Manifold & Twin Hose-Handling Cranes
    const manifold = new THREE.Mesh(new THREE.BoxGeometry(12.2, 1.4, 3.2), silverMetal);
    manifold.position.set(0, 4.9, -1.5);
    g.add(manifold);
    for (const sx of [-4.6, 4.6]) {
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 5.2, 10), craneYellow);
      ped.position.set(sx, 6.8, -1.5);
      g.add(ped);
      const jib = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 7.0), craneYellow);
      jib.position.set(sx, 9.6, -4.4);
      jib.rotation.x = 0.35;
      g.add(jib);
    }

    // Broad Aft Bridge Superstructure & Scrubber Funnel
    const house = new THREE.Mesh(new THREE.BoxGeometry(11.4, 8.2, 6.8), whiteSteel);
    house.position.set(0, 8.2, 15.8);
    g.add(house);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(15.2, 1.4, 2.0), whiteSteel);
    wing.position.set(0, 11.4, 14.5);
    g.add(wing);
    const win = new THREE.Mesh(new THREE.BoxGeometry(14.2, 0.72, 2.1), glassMat);
    win.position.set(0, 11.45, 14.45);
    g.add(win);
    const funnel = new THREE.Mesh(new THREE.BoxGeometry(3.0, 4.2, 3.6), hullRed);
    funnel.position.set(0, 13.6, 18.0);
    g.add(funnel);
  } else if (vesselType === 'wtiv_jackup') {
    // 5. Offshore Wind Turbine Installation Vessel (WTIV Jack-Up) — 4 Towering Lattice Legs + Wind Blades + Helideck
    const tealHull = new THREE.MeshStandardMaterial({ color: 0x0f766e, roughness: 0.46, metalness: 0.22 });
    const hull = new THREE.Mesh(new THREE.BoxGeometry(14.8, 3.8, 38.0), tealHull);
    hull.position.set(0, 1.8, 0);
    g.add(hull);
    const hullDeck = new THREE.Mesh(new THREE.BoxGeometry(14.7, 0.2, 37.8), deckSlate);
    hullDeck.position.set(0, 3.72, 0);
    g.add(hullDeck);
    const bow = makeHullBow(14.8, 3.7, 7.0, tealHull);
    bow.position.set(0, 3.65, -19.0);
    g.add(bow);

    // 4 Towering Jack-Up Lattice Legs (iconic silhouette!)
    const legMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.42, metalness: 0.26 });
    const jackHouseMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.48, metalness: 0.22 });
    const legCoords: Array<[number, number]> = [
      [-6.2, -11.5],
      [6.2, -11.5],
      [-6.2, 12.5],
      [6.2, 12.5],
    ];
    for (const [lx, lz] of legCoords) {
      const jh = new THREE.Mesh(new THREE.BoxGeometry(3.0, 3.6, 3.0), jackHouseMat);
      jh.position.set(lx, 5.4, lz);
      g.add(jh);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 21.0, 6), legMat);
      leg.position.set(lx, 12.5, lz);
      g.add(leg);
    }

    // Wind Turbine Tower Sections & Blades Stowed on Main Work Deck
    for (const bx of [-2.4, 0, 2.4]) {
      const towerSeg = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.85, 6.2, 12), whiteSteel);
      towerSeg.position.set(bx, 6.8, 2.0);
      g.add(towerSeg);
    }
    for (const bz of [-4.5, -2.5, -0.5]) {
      const blade = new THREE.Mesh(new THREE.ConeGeometry(0.48, 12.0, 6), whiteSteel);
      blade.rotation.z = Math.PI / 2;
      blade.position.set(0, 4.4, bz);
      g.add(blade);
    }

    // Giant Heavy-Lift Offshore Crane on Starboard Aft
    const cBase = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.7, 6.0, 12), safetyOrange);
    cBase.position.set(4.5, 6.6, 8.5);
    g.add(cBase);
    const cBoom = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 18.5), safetyOrange);
    cBoom.position.set(3.4, 14.8, 1.5);
    cBoom.rotation.x = 0.62;
    g.add(cBoom);

    // Forward Accommodation & Cantilevered Octagonal Helideck
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(12.4, 5.8, 6.4), whiteSteel);
    bridge.position.set(0, 6.6, -15.0);
    g.add(bridge);
    const win = new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.85, 1.8), glassMat);
    win.position.set(0, 8.5, -17.6);
    g.add(win);
    const heliMat = new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.55 });
    const heli = new THREE.Mesh(new THREE.CylinderGeometry(3.8, 3.8, 0.35, 8), heliMat);
    heli.position.set(0, 9.8, -20.5);
    g.add(heli);
  } else if (vesselType === 'fpso_offshore') {
    // 6. Offshore Production Plant FPSO — Bow Turret, Multi-Deck Process Plant Modules & Angled Flare Tower!
    const fpsoHull = new THREE.MeshStandardMaterial({ color: 0x1e3a5f, roughness: 0.48, metalness: 0.22 });
    const hull = new THREE.Mesh(new THREE.BoxGeometry(14.5, 4.8, 42.0), fpsoHull);
    hull.position.set(0, 2.2, 0);
    g.add(hull);
    const hullDeck = new THREE.Mesh(new THREE.BoxGeometry(14.4, 0.2, 41.8), deckSlate);
    hullDeck.position.set(0, 4.62, 0);
    g.add(hullDeck);
    const bow = makeHullBow(14.5, 4.7, 8.0, fpsoHull);
    bow.position.set(0, 4.55, -21.0);
    g.add(bow);

    // External Yellow Bow Turret Mooring System
    const turret = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 8.8, 14), craneYellow);
    turret.position.set(0, 5.4, -24.5);
    g.add(turret);

    // Dense Multi-Tier Topside Oil & Gas Process Modules (Separators, Compressors, Pipe Racks)
    const modPalette = [0x0284c7, 0x475569, 0xd97706, 0x0f766e];
    for (let i = 0; i < 4; i++) {
      const mz = -12.0 + i * 7.2;
      const modMat = new THREE.MeshStandardMaterial({ color: modPalette[i % modPalette.length], roughness: 0.5, metalness: 0.22 });
      const proc = new THREE.Mesh(new THREE.BoxGeometry(11.6, 4.6 + (i % 2) * 1.4, 5.6), modMat);
      proc.position.set(0, 6.8 + (i % 2) * 0.6, mz);
      g.add(proc);
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 4.6, 12), silverMetal);
      tank.rotation.z = Math.PI / 2;
      tank.position.set(0, 10.2, mz);
      g.add(tank);
    }

    // Tall Angled Flare Tower with Glowing Flame Tip at Forward Port Bow
    const flareBoom = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.95, 19.0, 6), safetyOrange);
    flareBoom.position.set(-5.5, 13.5, -18.5);
    flareBoom.rotation.x = -0.38;
    flareBoom.rotation.z = 0.22;
    g.add(flareBoom);
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.95, 2.4, 8),
      new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xf97316, emissiveIntensity: 2.0 }),
    );
    flame.position.set(-7.6, 22.8, -22.2);
    g.add(flame);

    // Stern Living Quarters + Helideck
    const lq = new THREE.Mesh(new THREE.BoxGeometry(12.2, 8.0, 7.2), whiteSteel);
    lq.position.set(0, 8.6, 16.5);
    g.add(lq);
    const win = new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.85, 2.0), glassMat);
    win.position.set(0, 11.4, 13.2);
    g.add(win);
    const heli = new THREE.Mesh(
      new THREE.CylinderGeometry(4.2, 4.2, 0.35, 8),
      new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.55 }),
    );
    heli.position.set(0, 12.9, 17.5);
    g.add(heli);
  } else if (vesselType === 'cruise_liner') {
    // 7. Mega Cruise Liner — Sleek White Multi-Tiered Terraced Decks, Panoramic Blue Glass, Pools & Twin Funnels
    const hull = new THREE.Mesh(new THREE.BoxGeometry(11.8, 4.0, 38.0), whiteSteel);
    hull.position.set(0, 1.9, 0);
    g.add(hull);
    const hullDeck = new THREE.Mesh(new THREE.BoxGeometry(11.7, 0.2, 37.8), deckSlate);
    hullDeck.position.set(0, 3.92, 0);
    g.add(hullDeck);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(12.0, 0.9, 38.4), accentBlue);
    stripe.position.set(0, 1.4, 0);
    g.add(stripe);
    const bow = makeHullBow(11.8, 3.9, 10.5, whiteSteel);
    bow.position.set(0, 3.85, -19.0);
    g.add(bow);

    // 4 Terraced Balcony Superstructure Tiers
    const tiers = [
      { w: 11.4, h: 2.4, l: 34.0, y: 5.0, z: 0.8 },
      { w: 10.6, h: 2.3, l: 30.0, y: 7.3, z: 1.4 },
      { w: 9.8, h: 2.2, l: 25.0, y: 9.5, z: 1.8 },
      { w: 8.6, h: 1.8, l: 19.0, y: 11.4, z: 1.0 },
    ];
    for (const t of tiers) {
      const block = new THREE.Mesh(new THREE.BoxGeometry(t.w, t.h, t.l), whiteSteel);
      block.position.set(0, t.y, t.z);
      g.add(block);
      const band = new THREE.Mesh(new THREE.BoxGeometry(t.w + 0.14, 0.72, t.l - 1.2), glassMat);
      band.position.set(0, t.y + 0.25, t.z);
      g.add(band);
    }

    // Lido Top-Deck Blue Swimming Pool + Twin Swept Funnels
    const pool = new THREE.Mesh(
      new THREE.BoxGeometry(4.2, 0.2, 7.0),
      new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 0.55 }),
    );
    pool.position.set(0, 12.4, -2.0);
    g.add(pool);

    for (const fz of [5.5, 9.8]) {
      const fun = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3.8, 3.2), safetyOrange);
      fun.position.set(0, 13.8, fz);
      fun.rotation.x = -0.22;
      g.add(fun);
    }
  } else if (vesselType === 'roro_car_carrier') {
    // 8. Pure Car & Truck Carrier (PCTC Ro-Ro) — Iconic High-Freeboard Slab Garage Hull & Stern Quarter Ramp
    const pctcBlue = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.44, metalness: 0.18 });
    const lowerHull = new THREE.Mesh(new THREE.BoxGeometry(12.0, 2.2, 38.0), hullRed);
    lowerHull.position.set(0, 0.9, 0);
    g.add(lowerHull);

    // Tall enclosed 12-deck vehicle garage box
    const garageLower = new THREE.Mesh(new THREE.BoxGeometry(12.2, 6.2, 38.5), pctcBlue);
    garageLower.position.set(0, 5.0, 0);
    g.add(garageLower);
    const garageUpper = new THREE.Mesh(new THREE.BoxGeometry(12.2, 4.4, 37.8), whiteSteel);
    garageUpper.position.set(0, 10.3, 0.2);
    g.add(garageUpper);

    // Sculpted tall bow block
    const bow = makeHullBow(12.2, 10.4, 8.8, pctcBlue);
    bow.position.set(0, 12.3, -19.2);
    g.add(bow);

    // High Forward Panoramic Wheelhouse
    const wheelhouse = new THREE.Mesh(new THREE.BoxGeometry(12.8, 1.9, 4.6), whiteSteel);
    wheelhouse.position.set(0, 13.4, -14.2);
    g.add(wheelhouse);
    const win = new THREE.Mesh(new THREE.BoxGeometry(12.2, 0.82, 4.75), glassMat);
    win.position.set(0, 13.55, -14.25);
    g.add(win);

    // Iconic Folded Stern Quarter Loading Ramp
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(4.2, 8.5, 0.65), craneYellow);
    ramp.position.set(3.2, 5.2, 20.8);
    ramp.rotation.x = 0.28;
    ramp.rotation.y = 0.22;
    g.add(ramp);
  } else if (vesselType === 'icebreaker_research') {
    // 9. Polar Icebreaker & Oceanographic Research Vessel — High-Vis Polar Red/Orange Hull, A-Frame Gantry & Helideck
    const polarRed = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.44, metalness: 0.16 });
    const hull = new THREE.Mesh(new THREE.BoxGeometry(11.6, 4.4, 34.0), polarRed);
    hull.position.set(0, 2.0, 0);
    g.add(hull);
    const hullDeck = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.2, 33.8), deckSlate);
    hullDeck.position.set(0, 4.22, 0);
    g.add(hullDeck);
    const bow = makeHullBow(11.6, 4.3, 10.2, polarRed);
    bow.position.set(0, 4.15, -17.0);
    g.add(bow);

    // Forward Polar Ice-Navigation Bridge & Mast
    const labHouse = new THREE.Mesh(new THREE.BoxGeometry(9.6, 6.2, 12.0), whiteSteel);
    labHouse.position.set(0, 7.2, -5.5);
    g.add(labHouse);
    const bridgeWing = new THREE.Mesh(new THREE.BoxGeometry(12.6, 1.5, 2.4), polarRed);
    bridgeWing.position.set(0, 10.5, -8.5);
    g.add(bridgeWing);
    const win = new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.8, 2.5), glassMat);
    win.position.set(0, 10.6, -8.55);
    g.add(win);
    const radarMast = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.7, 6.0, 8), safetyOrange);
    radarMast.position.set(0, 13.8, -7.2);
    g.add(radarMast);

    // Aft Helideck Pad + Oceanographic Stern A-Frame Gantry
    const heliPad = new THREE.Mesh(
      new THREE.CylinderGeometry(4.2, 4.2, 0.4, 16),
      new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.48 }),
    );
    heliPad.position.set(0, 4.6, 8.2);
    g.add(heliPad);

    for (const sx of [-3.6, 3.6]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.6, 6.6, 0.6), craneYellow);
      leg.position.set(sx, 7.2, 15.8);
      leg.rotation.x = 0.22;
      g.add(leg);
    }
    const cross = new THREE.Mesh(new THREE.BoxGeometry(8.0, 0.65, 0.65), craneYellow);
    cross.position.set(0, 10.3, 16.5);
    g.add(cross);
  } else {
    // 10. Next-Gen Aegis Stealth Destroyer (Special Naval Vessel) — Naval Grey Stealth Hull, SPY Radar, Turret & Helo Deck
    const navalGrey = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.48, metalness: 0.24 });
    const darkDeck = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.62, metalness: 0.16 });
    const radarPanel = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.34, metalness: 0.34 });

    const hull = new THREE.Mesh(new THREE.BoxGeometry(8.8, 3.8, 36.0), navalGrey);
    hull.position.set(0, 1.8, 0);
    g.add(hull);
    const hullDeck = new THREE.Mesh(new THREE.BoxGeometry(8.7, 0.2, 35.8), darkDeck);
    hullDeck.position.set(0, 3.72, 0);
    g.add(hullDeck);
    const bow = makeHullBow(8.8, 3.7, 11.5, navalGrey);
    bow.position.set(0, 3.65, -18.0);
    g.add(bow);

    // Forward Naval Turret & VLS Missile Cells
    const turret = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.3, 2.2), navalGrey);
    turret.position.set(0, 4.3, -17.0);
    g.add(turret);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 4.0, 8), darkDeck);
    barrel.rotation.x = Math.PI / 2 - 0.18;
    barrel.position.set(0, 4.7, -19.5);
    g.add(barrel);

    const vls = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.35, 4.6), darkDeck);
    vls.position.set(0, 3.9, -12.0);
    g.add(vls);

    // Octagonal Stealth Aegis Deckhouse with SPY Phased-Array Radar Panels
    const deckhouse = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.8, 5.4, 8), navalGrey);
    deckhouse.position.set(0, 6.2, -4.5);
    g.add(deckhouse);
    const bridgeWin = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.68, 1.6), glassMat);
    bridgeWin.position.set(0, 7.6, -7.8);
    g.add(bridgeWin);
    for (const ang of [-0.6, 0.6]) {
      const spy = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 0.24), radarPanel);
      spy.position.set(Math.sin(ang) * 4.35, 6.4, -4.5 - Math.cos(ang) * 4.35);
      spy.rotation.y = ang;
      g.add(spy);
    }

    // Twin Stealth Pyramidal Masts & Exhaust Stacks
    const mast = new THREE.Mesh(new THREE.ConeGeometry(1.6, 8.8, 4), navalGrey);
    mast.position.set(0, 12.8, -3.5);
    g.add(mast);
    const stack = new THREE.Mesh(new THREE.BoxGeometry(5.6, 4.0, 9.5), navalGrey);
    stack.position.set(0, 5.8, 4.5);
    g.add(stack);

    // Aft Helo Hangar & Flight Deck with Landing Circle
    const flightRing = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 2.55, 24),
      new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide }),
    );
    flightRing.rotation.x = -Math.PI / 2;
    flightRing.position.set(0, 3.76, 13.8);
    g.add(flightRing);
  }

  mergeSolidSubtreeToVertexColors(g, {
    lowSpec,
    roughness: 0.46,
    metalness: 0.22,
    castShadow: !lowSpec,
    receiveShadow: !lowSpec,
  });

  g.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = !lowSpec;
      mesh.receiveShadow = !lowSpec;
    }
  });

  return g;
}
