import * as THREE from 'three';
import { mergeSolidSubtreeToVertexColors } from './meshBatching';
import type { DecorativeVesselType } from './sceneryCatalog';
import type { HarborTexturePack } from './textures';

export const VESSEL_SILHOUETTE_IDS = [
  'lng_carrier',
  'container_ship',
  'vlcc_tanker',
  'bulk_carrier',
  'floating_dock',
  'wtiv_jackup',
  'fpso_offshore',
  'cruise_liner',
  'roro_car_carrier',
  'icebreaker_research',
  'naval_vessel',
  'harbor_tug',
] as const;

export type VesselSilhouetteId = (typeof VESSEL_SILHOUETTE_IDS)[number] | DecorativeVesselType;

export function getVesselSilhouetteByIndex(index: number): VesselSilhouetteId {
  // Prioritize iconic commercial shipbuilding silhouettes for project berths (0..3)
  const primaryOrder: VesselSilhouetteId[] = [
    'lng_carrier',
    'container_ship',
    'vlcc_tanker',
    'bulk_carrier',
    'wtiv_jackup',
    'fpso_offshore',
    'cruise_liner',
    'roro_car_carrier',
    'icebreaker_research',
    'naval_vessel',
  ];
  return primaryOrder[Math.abs(index) % primaryOrder.length];
}

/**
 * Cleanly disposes all geometries and materials inside a replaced 3D vessel group
 * so dynamically updated project berths and pooled infinite chunks have zero GPU memory leaks.
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

/**
 * Creates a sculpted naval hull silhouette in planform using THREE.Shape + ExtrudeGeometry
 * with flared curved bow, smooth parallel midbody, and tapered transom stern (no boxy cubes!).
 * Oriented so bow faces -Z, stern faces +Z, and extrusion runs vertically from yBottom to yBottom + height.
 */
function createSculptedHullLayer(opts: {
  halfBeam: number;
  parallelHalfLen: number;
  bowLen: number;
  sternLen: number;
  height: number;
  yBottom: number;
  bevel?: number;
  mat: THREE.Material;
}): THREE.Mesh {
  const { halfBeam, parallelHalfLen, bowLen, sternLen, height, yBottom, mat } = opts;
  const bevel = opts.bevel ?? 0.24;

  // Shape is in 2D (x, y) -> rotated +90° around X maps shape (x, y) to world (x, yBottom + h, y)
  // Actually rotation.x = Math.PI / 2 maps local +Y -> world +Z and local +Z -> world -Y!
  // So we place bow at shape y = -(parallelHalfLen + bowLen) and extrude depth = height downward,
  // positioning mesh.position.y = yBottom + height.
  const shape = new THREE.Shape();
  const bowZ = -(parallelHalfLen + bowLen);
  const sternZ = parallelHalfLen + sternLen;
  const transomHalfW = halfBeam * 0.62;

  shape.moveTo(0, bowZ);
  // Starboard curved bow flare into parallel midbody
  shape.bezierCurveTo(
    halfBeam * 0.42,
    bowZ + bowLen * 0.26,
    halfBeam * 0.96,
    -parallelHalfLen - bowLen * 0.24,
    halfBeam,
    -parallelHalfLen,
  );
  // Starboard parallel midbody
  shape.lineTo(halfBeam, parallelHalfLen * 0.85);
  // Starboard stern run to transom
  shape.quadraticCurveTo(halfBeam * 0.92, sternZ - sternLen * 0.28, transomHalfW, sternZ);
  // Transom stern
  shape.lineTo(-transomHalfW, sternZ);
  // Port stern run
  shape.quadraticCurveTo(-halfBeam * 0.92, sternZ - sternLen * 0.28, -halfBeam, parallelHalfLen * 0.85);
  // Port parallel midbody
  shape.lineTo(-halfBeam, -parallelHalfLen);
  // Port curved bow flare back to stem
  shape.bezierCurveTo(
    -halfBeam * 0.96,
    -parallelHalfLen - bowLen * 0.24,
    -halfBeam * 0.42,
    bowZ + bowLen * 0.26,
    0,
    bowZ,
  );
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.1, height),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel * 0.85,
    bevelSegments: 2,
    curveSegments: 16,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.y = yBottom + height;
  return mesh;
}

/**
 * Adds a realistic 3-tier marine hull stack:
 *   1) Anti-fouling crimson boot-top below/at waterline (narrower bilge curvature)
 *   2) Crisp white Plimsoll waterline accent band
 *   3) Flared low-saturation navy/slate freeboard hull + bulbous bow + recessed main deck & gunwale railings
 */
function addCurvedMarineHull(
  g: THREE.Group,
  opts: {
    halfBeam: number;
    parallelHalfLen: number;
    bowLen: number;
    sternLen: number;
    freeboardH: number;
    hullMat: THREE.Material;
    bootMat: THREE.Material;
    deckMat: THREE.Material;
    railMat: THREE.Material;
    includeBulbousBow?: boolean;
  },
): void {
  const {
    halfBeam,
    parallelHalfLen,
    bowLen,
    sternLen,
    freeboardH,
    hullMat,
    bootMat,
    deckMat,
    railMat,
  } = opts;

  // Lower bilge / anti-fouling red waterline hull (slightly tucked inward for realistic bilge curve)
  g.add(
    createSculptedHullLayer({
      halfBeam: halfBeam * 0.95,
      parallelHalfLen,
      bowLen: bowLen * 0.94,
      sternLen: sternLen * 0.92,
      height: 1.45,
      yBottom: -0.35,
      bevel: 0.26,
      mat: bootMat,
    }),
  );

  // Upper flared freeboard hull
  g.add(
    createSculptedHullLayer({
      halfBeam,
      parallelHalfLen,
      bowLen,
      sternLen,
      height: freeboardH,
      yBottom: 1.05,
      bevel: 0.22,
      mat: hullMat,
    }),
  );

  // Main deck plate slightly inset with raised bulwark lip
  g.add(
    createSculptedHullLayer({
      halfBeam: halfBeam * 0.93,
      parallelHalfLen: parallelHalfLen * 0.98,
      bowLen: bowLen * 0.92,
      sternLen: sternLen * 0.94,
      height: 0.16,
      yBottom: 1.05 + freeboardH + 0.16,
      bevel: 0,
      mat: deckMat,
    }),
  );

  // Forecastle raised bow bulwark + anchor windlass detail
  g.add(
    createSculptedHullLayer({
      halfBeam: halfBeam * 0.96,
      parallelHalfLen: 0.5,
      bowLen: bowLen * 0.92,
      sternLen: 1.0,
      height: 0.85,
      yBottom: 1.05 + freeboardH + 0.15,
      bevel: 0.1,
      mat: hullMat,
    }),
  );

  // Thin deck perimeter safety rails along port & starboard midbody
  const railY = 1.05 + freeboardH + 0.72;
  const railLen = parallelHalfLen * 1.78;
  for (const side of [-1, 1]) {
    const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, railLen), railMat);
    topRail.position.set(side * (halfBeam * 0.94), railY, 0);
    g.add(topRail);
  }

  // Bulbous bow projecting at waterline
  if (opts.includeBulbousBow !== false) {
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(Math.min(1.5, halfBeam * 0.25), 14, 10), bootMat);
    bulb.scale.set(0.82, 0.72, 2.35);
    bulb.position.set(0, 0.24, -(parallelHalfLen + bowLen + 0.55));
    g.add(bulb);
  }
}

/**
 * Adds a realistic stepped commercial ship accommodation house with bridge wings,
 * panoramic tinted windows, orange enclosed lifeboats, radar mast, and tapered funnel.
 */
function addCommercialSuperstructure(
  g: THREE.Group,
  opts: {
    zCenter: number;
    deckY: number;
    width: number;
    levels: number;
    whiteMat: THREE.Material;
    glassMat: THREE.Material;
    funnelMat: THREE.Material;
    lifeboatMat: THREE.Material;
    darkSteelMat: THREE.Material;
  },
): void {
  const { zCenter, deckY, width, levels, whiteMat, glassMat, funnelMat, lifeboatMat, darkSteelMat } = opts;
  const levelH = 1.95;

  for (let lv = 0; lv < levels; lv += 1) {
    const w = width * (1 - lv * 0.05);
    const l = Math.max(4.4, 7.6 - lv * 0.65);
    const y = deckY + lv * levelH + levelH * 0.5;
    const tier = new THREE.Mesh(new THREE.BoxGeometry(w, levelH - 0.08, l), whiteMat);
    tier.position.set(0, y, zCenter + lv * 0.12);
    g.add(tier);

    // Porthole / cabin window strip on each tier
    const strip = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.42, l * 0.76), glassMat);
    strip.position.set(0, y + 0.16, zCenter + lv * 0.12 - 0.15);
    g.add(strip);
  }

  const bridgeY = deckY + levels * levelH + 0.85;
  // Navigation bridge + full-beam cantilevered bridge wings
  const bridgeCore = new THREE.Mesh(new THREE.BoxGeometry(width * 0.88, 1.8, 3.6), whiteMat);
  bridgeCore.position.set(0, bridgeY, zCenter - 0.65);
  g.add(bridgeCore);

  const wing = new THREE.Mesh(new THREE.BoxGeometry(width * 1.42, 1.35, 1.85), whiteMat);
  wing.position.set(0, bridgeY + 0.1, zCenter - 1.25);
  g.add(wing);

  const bridgeGlass = new THREE.Mesh(new THREE.BoxGeometry(width * 1.34, 0.72, 1.95), glassMat);
  bridgeGlass.position.set(0, bridgeY + 0.18, zCenter - 1.3);
  g.add(bridgeGlass);

  // Bridge roof radar mast + dual X/S-band scanners
  const mastBaseY = bridgeY + 0.95;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.28, 4.6, 8), whiteMat);
  mast.position.set(0, mastBaseY + 2.3, zCenter - 1.0);
  g.add(mast);

  const crossTree = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.14, 0.18), whiteMat);
  crossTree.position.set(0, mastBaseY + 3.1, zCenter - 1.0);
  g.add(crossTree);

  const radarBar = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.16, 0.24), darkSteelMat);
  radarBar.position.set(0, mastBaseY + 4.2, zCenter - 1.0);
  g.add(radarBar);

  // Enclosed orange davit lifeboats on port & starboard sides
  for (const side of [-1, 1]) {
    const boat = new THREE.Mesh(new THREE.CapsuleGeometry(0.46, 1.85, 6, 10), lifeboatMat);
    boat.rotation.x = Math.PI / 2;
    boat.position.set(side * (width * 0.54 + 0.4), deckY + 2.6, zCenter + 0.8);
    g.add(boat);
  }

  // Sculpted tapered exhaust funnel casing with dark soot top
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.75, 4.2, 8), funnelMat);
  funnel.scale.set(0.82, 1.0, 1.25);
  funnel.position.set(0, deckY + levels * levelH + 1.5, zCenter + 2.75);
  g.add(funnel);

  const funnelCap = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.2, 0.65, 8), darkSteelMat);
  funnelCap.scale.set(0.82, 1.0, 1.25);
  funnelCap.position.set(0, deckY + levels * levelH + 3.7, zCenter + 2.75);
  g.add(funnelCap);
}

/**
 * Builds a high-craft procedural 3D vessel (curved Shape+ExtrudeGeometry hull, PBR marine paint,
 * superstructure, railings, lifeboats, funnel, and vessel-class cargo silhouette).
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

  // Realistic low-saturation maritime paint palette (Requirement #3)
  const hullNavy = new THREE.MeshStandardMaterial({ color: 0x19324a, roughness: 0.48, metalness: 0.28 });
  const hullSlate = new THREE.MeshStandardMaterial({ color: 0x2a3b4d, roughness: 0.52, metalness: 0.26 });
  const hullRed = new THREE.MeshStandardMaterial({ color: 0x8b2626, roughness: 0.6, metalness: 0.14 });
  const deckSlate = new THREE.MeshStandardMaterial({ color: 0x415061, roughness: 0.72, metalness: 0.12 });
  const deckGreen = new THREE.MeshStandardMaterial({ color: 0x2f5a4f, roughness: 0.7, metalness: 0.1 });
  const whiteSteel = new THREE.MeshStandardMaterial({ color: 0xcfd8e2, roughness: 0.56, metalness: 0.12 });
  const marineBlue = new THREE.MeshStandardMaterial({ color: 0x1e567d, roughness: 0.48, metalness: 0.24 });
  const craneOchre = new THREE.MeshStandardMaterial({ color: 0xc48f22, roughness: 0.48, metalness: 0.26 });
  const lifeboatOrange = new THREE.MeshStandardMaterial({ color: 0xc4471b, roughness: 0.46, metalness: 0.14 });
  const silverMetal = new THREE.MeshStandardMaterial({ color: 0xb2becb, roughness: 0.4, metalness: 0.38 });
  const darkSteel = new THREE.MeshStandardMaterial({ color: 0x222c38, roughness: 0.56, metalness: 0.52 });

  if (vesselType === 'lng_carrier') {
    // 1. Flagship Moss-Type LNG Carrier (also used for Hero "씨스타호")
    addCurvedMarineHull(g, {
      halfBeam: 5.9,
      parallelHalfLen: 15.2,
      bowLen: 10.6,
      sternLen: 5.2,
      freeboardH: 3.7,
      hullMat: hullNavy,
      bootMat: hullRed,
      deckMat: deckGreen,
      railMat: whiteSteel,
    });

    const domeGeo = new THREE.SphereGeometry(3.85, 24, 18);
    const collarGeo = new THREE.CylinderGeometry(4.02, 4.18, 1.9, 24);
    const equatorGeo = new THREE.TorusGeometry(3.92, 0.14, 8, 24);
    for (const tz of [-11.8, -3.7, 4.4, 12.5]) {
      const collar = new THREE.Mesh(collarGeo, marineBlue);
      collar.position.set(0, 5.4, tz);
      g.add(collar);

      const dome = new THREE.Mesh(domeGeo, whiteSteel);
      dome.position.set(0, 6.45, tz);
      g.add(dome);

      const equator = new THREE.Mesh(equatorGeo, silverMetal);
      equator.rotation.x = Math.PI / 2;
      equator.position.set(0, 6.45, tz);
      g.add(equator);
    }

    // Elevated cryogenic pipe trunkway + cargo manifold
    const pipeDeck = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.24, 29.0), silverMetal);
    pipeDeck.position.set(0, 10.45, 0.2);
    g.add(pipeDeck);

    for (const px of [-0.36, 0.36]) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 29.4, 10), silverMetal);
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(px, 10.82, 0.2);
      g.add(pipe);
    }

    const manifold = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.3, 2.4), lifeboatOrange);
    manifold.position.set(4.1, 6.1, 0.4);
    g.add(manifold);

    addCommercialSuperstructure(g, {
      zCenter: 17.6,
      deckY: 4.95,
      width: 9.2,
      levels: 3,
      whiteMat: whiteSteel,
      glassMat,
      funnelMat: marineBlue,
      lifeboatMat: lifeboatOrange,
      darkSteelMat: darkSteel,
    });
  } else if (vesselType === 'container_ship') {
    // 2. Ultra-Large Container Vessel — Sculpted Curved Hull + Corrugated Multi-Color ISO Stacks + Lashing Bridges
    addCurvedMarineHull(g, {
      halfBeam: 5.7,
      parallelHalfLen: 15.6,
      bowLen: 9.8,
      sternLen: 4.8,
      freeboardH: 3.5,
      hullMat: hullNavy,
      bootMat: hullRed,
      deckMat: deckSlate,
      railMat: whiteSteel,
    });

    const cGeo = new THREE.BoxGeometry(2.15, 2.0, 5.7);
    const cMat = lowSpec
      ? new THREE.MeshLambertMaterial({ color: 0xffffff })
      : new THREE.MeshStandardMaterial({
          color: 0xffffff,
          bumpMap: textures.containerRibBump,
          bumpScale: 0.09,
          roughnessMap: textures.containerRibRoughness,
          roughness: 0.68,
          metalness: 0.26,
        });
    // Low-saturation realistic shipping line container palette
    const palette = [0x1e5c8a, 0x8e3333, 0xb87628, 0x2a6b55, 0x354d6e, 0xa84d25];
    const bays = [-12.2, -5.6, 1.0];
    const boxes = new THREE.InstancedMesh(cGeo, cMat, bays.length * 4 * 3);
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    let idx = 0;
    for (let b = 0; b < bays.length; b += 1) {
      for (let c = 0; c < 4; c += 1) {
        for (let t = 0; t < 3; t += 1) {
          dummy.position.set(-3.45 + c * 2.3, 5.7 + t * 2.05, bays[b]);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          boxes.setMatrixAt(idx, dummy.matrix);
          col.setHex(palette[(b * 5 + c * 3 + t * 2) % palette.length]);
          boxes.setColorAt(idx, col);
          idx += 1;
        }
      }
    }
    boxes.instanceMatrix.needsUpdate = true;
    if (boxes.instanceColor) boxes.instanceColor.needsUpdate = true;
    boxes.computeBoundingSphere();
    g.add(boxes);

    // Lashing bridges & twin deck cranes between bays
    for (const cz of [-8.9, -2.3]) {
      const lashing = new THREE.Mesh(new THREE.BoxGeometry(9.6, 3.8, 0.55), darkSteel);
      lashing.position.set(0, 6.6, cz);
      g.add(lashing);

      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.65, 7.6, 10), craneOchre);
      ped.position.set(0, 8.6, cz);
      g.add(ped);
      const jib = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 9.2), craneOchre);
      jib.position.set(0, 12.3, cz - 3.6);
      jib.rotation.x = 0.26;
      g.add(jib);
    }

    addCommercialSuperstructure(g, {
      zCenter: 13.6,
      deckY: 4.75,
      width: 9.0,
      levels: 4,
      whiteMat: whiteSteel,
      glassMat,
      funnelMat: hullRed,
      lifeboatMat: lifeboatOrange,
      darkSteelMat: darkSteel,
    });
  } else if (vesselType === 'bulk_carrier') {
    // 3. General Cargo / Handymax Bulk Carrier — 4 Hatched Holds + 4 Articulated Deck Cranes
    addCurvedMarineHull(g, {
      halfBeam: 5.5,
      parallelHalfLen: 14.8,
      bowLen: 9.2,
      sternLen: 4.6,
      freeboardH: 3.4,
      hullMat: hullSlate,
      bootMat: hullRed,
      deckMat: deckGreen,
      railMat: whiteSteel,
    });

    // 4 raised cargo hatch coamings + corrugated hatch covers
    for (const hz of [-12.0, -5.2, 1.6, 8.4]) {
      const coaming = new THREE.Mesh(new THREE.BoxGeometry(7.8, 1.25, 5.2), hullRed);
      coaming.position.set(0, 5.25, hz);
      g.add(coaming);
      const cover = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.3, 4.9), darkSteel);
      cover.position.set(0, 5.95, hz);
      g.add(cover);
    }

    // 3 Centerline Cargo Deck Cranes with angled jibs & crane houses
    for (const cz of [-8.6, -1.8, 5.0]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.72, 6.2, 10), craneOchre);
      post.position.set(0, 7.7, cz);
      g.add(post);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.6, 1.8), whiteSteel);
      cab.position.set(0, 10.6, cz + 0.2);
      g.add(cab);
      const boom = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.56, 10.6), craneOchre);
      boom.position.set(0, 12.6, cz - 4.4);
      boom.rotation.x = 0.34;
      g.add(boom);
    }

    addCommercialSuperstructure(g, {
      zCenter: 15.6,
      deckY: 4.65,
      width: 8.6,
      levels: 3,
      whiteMat: whiteSteel,
      glassMat,
      funnelMat: marineBlue,
      lifeboatMat: lifeboatOrange,
      darkSteelMat: darkSteel,
    });
  } else if (vesselType === 'floating_dock') {
    // 4. Monumental Floating Dry Dock (FD-01) — Ballast Barge, Twin Wing Walls, 2 Rail Cranes & Curved Hull Inside!
    const dockSteel = new THREE.MeshStandardMaterial({ color: 0x364659, roughness: 0.56, metalness: 0.34 });
    const hazardYellow = new THREE.MeshStandardMaterial({ color: 0xdca420, roughness: 0.44, metalness: 0.18 });

    // Submerged ballast pontoon barge
    const pontoon = new THREE.Mesh(new THREE.BoxGeometry(20.6, 2.2, 50.0), dockSteel);
    pontoon.position.set(0, 0.72, 0);
    g.add(pontoon);

    const floorPlate = new THREE.Mesh(new THREE.BoxGeometry(15.2, 0.28, 48.0), deckSlate);
    floorPlate.position.set(0, 1.92, 0);
    g.add(floorPlate);

    // Twin towering wing walls + floodlight towers + 2 rail-mounted dock cranes
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(2.7, 10.2, 49.0), dockSteel);
      wall.position.set(side * 8.95, 6.4, 0);
      g.add(wall);

      const waterlineBand = new THREE.Mesh(new THREE.BoxGeometry(2.84, 1.35, 49.2), hullRed);
      waterlineBand.position.set(side * 8.95, 1.4, 0);
      g.add(waterlineBand);

      const topRail = new THREE.Mesh(new THREE.BoxGeometry(2.86, 0.34, 49.2), hazardYellow);
      topRail.position.set(side * 8.95, 11.6, 0);
      g.add(topRail);

      // Rail-mounted dock jib crane (1 on Port wall, 1 on Starboard wall = 2 dock cranes!)
      const craneZ = side < 0 ? -9.5 : 8.5;
      const craneGroup = new THREE.Group();
      craneGroup.position.set(side * 8.95, 11.75, craneZ);

      const gantry = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.8, 3.6), marineBlue);
      gantry.position.set(0, 1.4, 0);
      craneGroup.add(gantry);

      const craneCab = new THREE.Mesh(new THREE.BoxGeometry(2.1, 2.1, 2.6), whiteSteel);
      craneCab.position.set(0, 3.85, 0);
      craneGroup.add(craneCab);

      const boomPivot = new THREE.Group();
      boomPivot.position.set(-side * 0.4, 4.4, 0);
      boomPivot.rotation.y = side < 0 ? -0.52 : Math.PI - 0.52;
      const craneBoom = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.7, 15.0), craneOchre);
      craneBoom.position.set(0, 3.6, -6.2);
      craneBoom.rotation.x = 0.52;
      boomPivot.add(craneBoom);
      craneGroup.add(boomPivot);

      g.add(craneGroup);
    }

    // Dockmaster Control Room on Port Aft Wing Wall
    const ctrl = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.6, 4.8), whiteSteel);
    ctrl.position.set(-8.95, 13.0, 18.8);
    g.add(ctrl);
    const ctrlWin = new THREE.Mesh(new THREE.BoxGeometry(3.52, 0.92, 3.8), glassMat);
    ctrlWin.position.set(-8.95, 13.2, 18.8);
    g.add(ctrlWin);

    // Keel & bilge timber/steel blocks along dry-dock floor
    for (let k = -16; k <= 16; k += 4) {
      const block = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.15, 1.25), darkSteel);
      block.position.set(0, 2.55, k);
      g.add(block);
    }

    // Curved vessel under construction resting on the keel blocks inside FD-01!
    const innerVessel = new THREE.Group();
    innerVessel.position.set(0, 3.3, 0);
    addCurvedMarineHull(innerVessel, {
      halfBeam: 4.5,
      parallelHalfLen: 10.5,
      bowLen: 7.4,
      sternLen: 3.8,
      freeboardH: 3.1,
      hullMat: hullNavy,
      bootMat: hullRed,
      deckMat: deckSlate,
      railMat: whiteSteel,
    });
    addCommercialSuperstructure(innerVessel, {
      zCenter: 9.2,
      deckY: 4.25,
      width: 6.8,
      levels: 3,
      whiteMat: whiteSteel,
      glassMat,
      funnelMat: marineBlue,
      lifeboatMat: lifeboatOrange,
      darkSteelMat: darkSteel,
    });
    g.add(innerVessel);
  } else if (vesselType === 'vlcc_tanker') {
    // 5. 300K DWT VLCC Tanker — Broad Curved Hull, Crimson Deck, Pipe Rack & Hose Cranes
    const tankerDeck = new THREE.MeshStandardMaterial({ color: 0x732626, roughness: 0.66, metalness: 0.14 });
    addCurvedMarineHull(g, {
      halfBeam: 6.8,
      parallelHalfLen: 16.5,
      bowLen: 9.2,
      sternLen: 4.8,
      freeboardH: 3.4,
      hullMat: hullNavy,
      bootMat: hullRed,
      deckMat: tankerDeck,
      railMat: whiteSteel,
    });

    for (const px of [-2.4, -1.2, 1.2, 2.4]) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 29.0, 8), silverMetal);
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(px, 4.95, -2.2);
      g.add(pipe);
    }
    const catwalk = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.22, 30.0), craneOchre);
    catwalk.position.set(0, 5.5, -1.8);
    g.add(catwalk);

    const manifold = new THREE.Mesh(new THREE.BoxGeometry(11.8, 1.4, 3.0), silverMetal);
    manifold.position.set(0, 5.3, -1.5);
    g.add(manifold);
    for (const sx of [-4.6, 4.6]) {
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.56, 5.2, 10), craneOchre);
      ped.position.set(sx, 7.2, -1.5);
      g.add(ped);
      const jib = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 6.8), craneOchre);
      jib.position.set(sx, 9.9, -4.3);
      jib.rotation.x = 0.34;
      g.add(jib);
    }

    addCommercialSuperstructure(g, {
      zCenter: 16.2,
      deckY: 4.65,
      width: 10.6,
      levels: 3,
      whiteMat: whiteSteel,
      glassMat,
      funnelMat: hullRed,
      lifeboatMat: lifeboatOrange,
      darkSteelMat: darkSteel,
    });
  } else if (vesselType === 'harbor_tug') {
    // 6. Compact Harbor Assist Tugboat (for decorative harbor scenery)
    const tugRed = new THREE.MeshStandardMaterial({ color: 0x992b2b, roughness: 0.48, metalness: 0.22 });
    addCurvedMarineHull(g, {
      halfBeam: 2.6,
      parallelHalfLen: 3.4,
      bowLen: 3.1,
      sternLen: 2.2,
      freeboardH: 1.55,
      hullMat: tugRed,
      bootMat: darkSteel,
      deckMat: deckSlate,
      railMat: whiteSteel,
      includeBulbousBow: false,
    });
    // Heavy black rubber bow fender
    const bowFender = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.32, 8, 14, Math.PI), darkSteel);
    bowFender.rotation.x = Math.PI / 2;
    bowFender.rotation.z = Math.PI;
    bowFender.position.set(0, 2.2, -5.7);
    g.add(bowFender);

    const wheelhouse = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.4, 3.6), whiteSteel);
    wheelhouse.position.set(0, 3.9, -0.4);
    g.add(wheelhouse);
    const tugWin = new THREE.Mesh(new THREE.BoxGeometry(3.32, 0.85, 2.6), glassMat);
    tugWin.position.set(0, 4.35, -0.8);
    g.add(tugWin);
    for (const sx of [-0.95, 0.95]) {
      const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 2.4, 8), darkSteel);
      stack.position.set(sx, 4.6, 1.8);
      g.add(stack);
    }
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 3.2, 6), craneOchre);
    mast.position.set(0, 6.4, -0.6);
    g.add(mast);
  } else if (vesselType === 'wtiv_jackup') {
    const tealHull = new THREE.MeshStandardMaterial({ color: 0x1e5c57, roughness: 0.48, metalness: 0.24 });
    addCurvedMarineHull(g, {
      halfBeam: 7.0,
      parallelHalfLen: 15.5,
      bowLen: 6.8,
      sternLen: 4.0,
      freeboardH: 3.1,
      hullMat: tealHull,
      bootMat: hullRed,
      deckMat: deckSlate,
      railMat: whiteSteel,
      includeBulbousBow: false,
    });
    for (const [lx, lz] of [[-5.8, -11.0], [5.8, -11.0], [-5.8, 12.0], [5.8, 12.0]]) {
      const jh = new THREE.Mesh(new THREE.BoxGeometry(2.8, 3.4, 2.8), darkSteel);
      jh.position.set(lx, 5.8, lz);
      g.add(jh);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 20.5, 6), craneOchre);
      leg.position.set(lx, 12.8, lz);
      g.add(leg);
    }
    for (const bx of [-2.2, 0, 2.2]) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.8, 5.8, 12), whiteSteel);
      seg.position.set(bx, 7.2, 2.0);
      g.add(seg);
    }
    const cBase = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.6, 5.8, 12), lifeboatOrange);
    cBase.position.set(4.3, 7.0, 8.2);
    g.add(cBase);
    const cBoom = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 17.5), lifeboatOrange);
    cBoom.position.set(3.2, 14.8, 1.6);
    cBoom.rotation.x = 0.6;
    g.add(cBoom);

    const bridge = new THREE.Mesh(new THREE.BoxGeometry(11.6, 5.4, 5.8), whiteSteel);
    bridge.position.set(0, 7.0, -14.5);
    g.add(bridge);
    const win = new THREE.Mesh(new THREE.BoxGeometry(10.8, 0.8, 1.8), glassMat);
    win.position.set(0, 8.8, -16.9);
    g.add(win);
    const heli = new THREE.Mesh(
      new THREE.CylinderGeometry(3.6, 3.6, 0.35, 8),
      new THREE.MeshStandardMaterial({ color: 0x266b43, roughness: 0.56 }),
    );
    heli.position.set(0, 10.0, -19.8);
    g.add(heli);
  } else if (vesselType === 'fpso_offshore') {
    addCurvedMarineHull(g, {
      halfBeam: 6.9,
      parallelHalfLen: 17.2,
      bowLen: 7.4,
      sternLen: 4.2,
      freeboardH: 3.7,
      hullMat: hullNavy,
      bootMat: hullRed,
      deckMat: deckSlate,
      railMat: whiteSteel,
    });
    const turret = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.4, 8.4, 14), craneOchre);
    turret.position.set(0, 5.6, -23.5);
    g.add(turret);
    const modColors = [0x265b80, 0x45566b, 0xa86e28, 0x26655c];
    for (let i = 0; i < 4; i += 1) {
      const mz = -11.5 + i * 7.0;
      const proc = new THREE.Mesh(
        new THREE.BoxGeometry(11.0, 4.4 + (i % 2) * 1.2, 5.4),
        new THREE.MeshStandardMaterial({ color: modColors[i], roughness: 0.52, metalness: 0.28 }),
      );
      proc.position.set(0, 7.1 + (i % 2) * 0.5, mz);
      g.add(proc);
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 4.4, 12), silverMetal);
      tank.rotation.z = Math.PI / 2;
      tank.position.set(0, 10.3, mz);
      g.add(tank);
    }
    const flareBoom = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.85, 18.0, 6), lifeboatOrange);
    flareBoom.position.set(-5.2, 13.5, -18.0);
    flareBoom.rotation.x = -0.36;
    flareBoom.rotation.z = 0.22;
    g.add(flareBoom);
    addCommercialSuperstructure(g, {
      zCenter: 16.5,
      deckY: 4.95,
      width: 11.2,
      levels: 3,
      whiteMat: whiteSteel,
      glassMat,
      funnelMat: marineBlue,
      lifeboatMat: lifeboatOrange,
      darkSteelMat: darkSteel,
    });
  } else if (vesselType === 'cruise_liner') {
    addCurvedMarineHull(g, {
      halfBeam: 5.8,
      parallelHalfLen: 15.8,
      bowLen: 10.2,
      sternLen: 4.8,
      freeboardH: 3.3,
      hullMat: whiteSteel,
      bootMat: marineBlue,
      deckMat: deckSlate,
      railMat: whiteSteel,
    });
    const tiers = [
      { w: 10.8, h: 2.2, l: 31.0, y: 5.5, z: 0.8 },
      { w: 10.0, h: 2.1, l: 27.0, y: 7.7, z: 1.4 },
      { w: 9.2, h: 2.0, l: 22.0, y: 9.8, z: 1.8 },
      { w: 8.0, h: 1.7, l: 16.0, y: 11.6, z: 1.2 },
    ];
    for (const t of tiers) {
      const block = new THREE.Mesh(new THREE.BoxGeometry(t.w, t.h, t.l), whiteSteel);
      block.position.set(0, t.y, t.z);
      g.add(block);
      const band = new THREE.Mesh(new THREE.BoxGeometry(t.w + 0.14, 0.68, t.l - 1.2), glassMat);
      band.position.set(0, t.y + 0.2, t.z);
      g.add(band);
    }
    for (const fz of [5.5, 9.8]) {
      const fun = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.5, 3.8, 8), marineBlue);
      fun.position.set(0, 14.0, fz);
      fun.rotation.x = -0.18;
      g.add(fun);
    }
  } else if (vesselType === 'roro_car_carrier') {
    addCurvedMarineHull(g, {
      halfBeam: 6.0,
      parallelHalfLen: 15.8,
      bowLen: 8.6,
      sternLen: 4.4,
      freeboardH: 8.2,
      hullMat: marineBlue,
      bootMat: hullRed,
      deckMat: whiteSteel,
      railMat: whiteSteel,
    });
    const wheelhouse = new THREE.Mesh(new THREE.BoxGeometry(11.6, 1.8, 4.4), whiteSteel);
    wheelhouse.position.set(0, 10.4, -14.2);
    g.add(wheelhouse);
    const win = new THREE.Mesh(new THREE.BoxGeometry(11.0, 0.78, 4.55), glassMat);
    win.position.set(0, 10.55, -14.25);
    g.add(win);
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(4.0, 7.6, 0.55), craneOchre);
    ramp.position.set(3.2, 4.8, 20.6);
    ramp.rotation.x = 0.28;
    ramp.rotation.y = 0.2;
    g.add(ramp);
  } else if (vesselType === 'icebreaker_research') {
    const polarRed = new THREE.MeshStandardMaterial({ color: 0xa62c2c, roughness: 0.46, metalness: 0.2 });
    addCurvedMarineHull(g, {
      halfBeam: 5.6,
      parallelHalfLen: 13.8,
      bowLen: 9.8,
      sternLen: 4.6,
      freeboardH: 3.4,
      hullMat: polarRed,
      bootMat: darkSteel,
      deckMat: deckSlate,
      railMat: whiteSteel,
    });
    addCommercialSuperstructure(g, {
      zCenter: -4.8,
      deckY: 4.65,
      width: 9.0,
      levels: 2,
      whiteMat: whiteSteel,
      glassMat,
      funnelMat: polarRed,
      lifeboatMat: lifeboatOrange,
      darkSteelMat: darkSteel,
    });
    const heliPad = new THREE.Mesh(
      new THREE.CylinderGeometry(4.0, 4.0, 0.36, 16),
      new THREE.MeshStandardMaterial({ color: 0xc25d27, roughness: 0.52 }),
    );
    heliPad.position.set(0, 4.9, 9.2);
    g.add(heliPad);
    for (const sx of [-3.4, 3.4]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.55, 6.2, 0.55), craneOchre);
      leg.position.set(sx, 7.6, 16.0);
      leg.rotation.x = 0.22;
      g.add(leg);
    }
    const cross = new THREE.Mesh(new THREE.BoxGeometry(7.5, 0.6, 0.6), craneOchre);
    cross.position.set(0, 10.5, 16.6);
    g.add(cross);
  } else {
    // Naval / Coast Guard Patrol Vessel
    const navalGrey = new THREE.MeshStandardMaterial({ color: 0x5c6b7a, roughness: 0.5, metalness: 0.28 });
    addCurvedMarineHull(g, {
      halfBeam: 4.4,
      parallelHalfLen: 14.5,
      bowLen: 11.0,
      sternLen: 4.4,
      freeboardH: 3.0,
      hullMat: navalGrey,
      bootMat: darkSteel,
      deckMat: darkSteel,
      railMat: navalGrey,
    });
    const deckhouse = new THREE.Mesh(new THREE.CylinderGeometry(3.8, 4.3, 4.8, 8), navalGrey);
    deckhouse.position.set(0, 6.4, -4.5);
    g.add(deckhouse);
    const bridgeWin = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.65, 1.5), glassMat);
    bridgeWin.position.set(0, 7.7, -7.6);
    g.add(bridgeWin);
    const mast = new THREE.Mesh(new THREE.ConeGeometry(1.4, 8.0, 4), navalGrey);
    mast.position.set(0, 12.6, -3.5);
    g.add(mast);
  }

  mergeSolidSubtreeToVertexColors(g, {
    lowSpec,
    roughness: 0.46,
    metalness: 0.24,
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

/**
 * Builds a sleek 3D LiDAR / point-cloud scan shell around any vessel group (Requirement #10)
 * toggled on vessel selection for an authentic digital-twin inspection feel.
 */
export function buildVesselScanPointCloud(vesselRoot: THREE.Object3D, colorHex = 0x38bdf8): THREE.Points {
  vesselRoot.updateMatrixWorld(true);
  const invRoot = vesselRoot.matrixWorld.clone().invert();
  const relMat = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const pts: number[] = [];

  vesselRoot.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible || !mesh.geometry) return;
    const posAttr = mesh.geometry.getAttribute('position');
    if (!posAttr) return;
    relMat.multiplyMatrices(invRoot, mesh.matrixWorld);

    // Subsample evenly so scan point-cloud stays crisp & fast (~900–1400 glowing scan points)
    const stride = Math.max(1, Math.floor(posAttr.count / 650));
    for (let i = 0; i < posAttr.count; i += stride) {
      v.fromBufferAttribute(posAttr, i).applyMatrix4(relMat);
      pts.push(v.x, v.y + 0.12, v.z);
    }
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const mat = new THREE.PointsMaterial({
    color: colorHex,
    size: 0.42,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const cloud = new THREE.Points(geo, mat);
  cloud.visible = false;
  cloud.renderOrder = 4;
  return cloud;
}
