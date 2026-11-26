import * as THREE from 'three';
import type { ActorRoleType, ShipConfig, ShipId } from '../config/fleetConfig';

/**
 * Builds a beveled maritime hull shape using ExtrudeGeometry (never a flat BoxGeometry).
 * Oriented with bow pointing toward -Z so forward sailing matches Three.js standard.
 */
function createHullGeometry(length: number, beam: number, depth: number): THREE.ExtrudeGeometry {
  const halfL = length * 0.5;
  const halfB = beam * 0.5;
  const shape = new THREE.Shape();

  // Stern (flat/rounded) -> Starboard -> Tapered Bow -> Port
  shape.moveTo(-halfB * 0.85, -halfL);
  shape.lineTo(halfB * 0.85, -halfL);
  shape.quadraticCurveTo(halfB, -halfL + length * 0.14, halfB, halfL * 0.25);
  shape.quadraticCurveTo(halfB * 0.92, halfL * 0.72, 0, halfL);
  shape.quadraticCurveTo(-halfB * 0.92, halfL * 0.72, -halfB, halfL * 0.25);
  shape.quadraticCurveTo(-halfB, -halfL + length * 0.14, -halfB * 0.85, -halfL);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.06,
    bevelSegments: 2,
  });

  // Rotate so extrusion goes upward (+Y) and bow points to -Z
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0.08, 0);
  return geo;
}

export interface BuiltShipRig {
  group: THREE.Group;
  wakeMesh: THREE.Mesh;
  beaconMesh: THREE.Mesh;
  radarPart?: THREE.Object3D;
}

/**
 * Role 3/4: Composite 6-12 Part Procedural 3D Ship Avatar Factory
 * Matches fleet.config.json 8 canonical vessel types with PBR material contrast
 * and HQ Navy (#0044AA) vs Partner Amber (#FF6600) identification banners.
 */
export function buildCompositeShipMesh(
  ship: ShipConfig,
  actorRole: ActorRoleType,
  contactShadowTex: THREE.CanvasTexture,
  containerRibTex: THREE.CanvasTexture,
): BuiltShipRig {
  const root = new THREE.Group();
  root.name = `ship_${ship.id}`;

  const roleColor = actorRole === 'employee' ? 0x0044aa : 0xd97706;
  const roleEmissive = actorRole === 'employee' ? 0x0284c7 : 0xf59e0b;

  // Shared PBR Materials with deliberate roughness/metalness contrast (>= 0.25 delta)
  const hullMat = new THREE.MeshStandardMaterial({
    color: ship.hullColor,
    roughness: 0.72,
    metalness: 0.18,
  });
  const bootStripeMat = new THREE.MeshStandardMaterial({
    color: 0x991b1b,
    roughness: 0.65,
    metalness: 0.15,
  });
  const deckMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.82,
    metalness: 0.1,
  });
  const cabinWhiteMat = new THREE.MeshStandardMaterial({
    color: 0xf1f5f9,
    roughness: 0.42,
    metalness: 0.12,
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x0f172a,
    roughness: 0.1,
    metalness: 0.35,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
  });
  const metalTrimMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.28,
    metalness: 0.85,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: ship.accentColor,
    roughness: 0.45,
    metalness: 0.25,
  });
  const roleFlagMat = new THREE.MeshStandardMaterial({
    color: roleColor,
    emissive: roleEmissive,
    emissiveIntensity: 0.45,
    roughness: 0.35,
    metalness: 0.3,
  });

  // Dimensions per ship class
  const dims: Record<ShipId, { l: number; b: number; h: number }> = {
    tug_captain: { l: 3.4, b: 1.85, h: 0.58 },
    sedms_container: { l: 4.9, b: 1.75, h: 0.62 },
    secms_cable: { l: 4.2, b: 1.9, h: 0.56 },
    faro_survey: { l: 3.8, b: 2.05, h: 0.5 },
    secad_lng: { l: 5.1, b: 1.85, h: 0.65 },
    pdf_sail: { l: 3.6, b: 1.35, h: 0.45 },
    mail_ferry: { l: 4.3, b: 1.95, h: 0.58 },
    patrol_guard: { l: 3.7, b: 1.32, h: 0.48 },
  };
  const { l, b, h } = dims[ship.id];

  // 1. Soft radial contact/water shadow & wake halo at waterline
  const wakeMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(b * 2.1, l * 1.45),
    new THREE.MeshBasicMaterial({
      map: contactShadowTex,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }),
  );
  wakeMesh.rotation.x = -Math.PI / 2;
  wakeMesh.position.y = 0.025;
  root.add(wakeMesh);

  // 2. Primary Hull Silhouette + Lower Anti-fouling Waterline Band
  const hullGeo = createHullGeometry(l, b, h);
  const hullMesh = new THREE.Mesh(hullGeo, hullMat);
  hullMesh.castShadow = true;
  hullMesh.receiveShadow = true;
  root.add(hullMesh);

  const bootGeo = createHullGeometry(l * 0.96, b * 0.98, 0.14);
  const bootMesh = new THREE.Mesh(bootGeo, bootStripeMat);
  bootMesh.position.y = -0.02;
  root.add(bootMesh);

  // 3. Raised Deck Plate
  const deckGeo = createHullGeometry(l * 0.88, b * 0.86, 0.08);
  const deckMesh = new THREE.Mesh(deckGeo, deckMat);
  deckMesh.position.y = h + 0.02;
  deckMesh.receiveShadow = true;
  root.add(deckMesh);

  let radarPart: THREE.Object3D | undefined;
  let mastTopY = h + 1.8;

  // 4. Vessel-Specific Superstructure (6-12 parts total)
  if (ship.id === 'tug_captain') {
    // Heavy black bow pushing fender
    const fender = new THREE.Mesh(
      new THREE.TorusGeometry(b * 0.42, 0.14, 10, 18, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.92, metalness: 0.05 }),
    );
    fender.rotation.x = Math.PI / 2;
    fender.rotation.z = Math.PI;
    fender.position.set(0, h * 0.62, -l * 0.36);
    root.add(fender);

    // Bridge Cabin + Panoramic Glass
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(b * 0.64, 0.88, 1.25), cabinWhiteMat);
    cabin.position.set(0, h + 0.52, -0.15);
    cabin.castShadow = true;
    root.add(cabin);

    const bridgeGlass = new THREE.Mesh(new THREE.BoxGeometry(b * 0.68, 0.32, 0.92), glassMat);
    bridgeGlass.position.set(0, h + 0.72, -0.22);
    root.add(bridgeGlass);

    // Twin Funnels (accent orange)
    for (const side of [-0.34, 0.34]) {
      const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.75, 12), accentMat);
      funnel.position.set(side, h + 0.78, 0.62);
      funnel.castShadow = true;
      root.add(funnel);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.12, 12), metalTrimMat);
      cap.position.set(side, h + 1.18, 0.62);
      root.add(cap);
    }

    // Aft Tow Winch Drum
    const winch = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.75, 12), metalTrimMat);
    winch.rotation.z = Math.PI / 2;
    winch.position.set(0, h + 0.28, 1.05);
    root.add(winch);

    mastTopY = h + 1.9;
  } else if (ship.id === 'sedms_container') {
    // Aft Bridge Superstructure
    const tower = new THREE.Mesh(new THREE.BoxGeometry(b * 0.76, 1.35, 0.95), cabinWhiteMat);
    tower.position.set(0, h + 0.72, l * 0.3);
    tower.castShadow = true;
    root.add(tower);

    const bridge = new THREE.Mesh(new THREE.BoxGeometry(b * 0.95, 0.3, 0.45), glassMat);
    bridge.position.set(0, h + 1.18, l * 0.24);
    root.add(bridge);

    // Tiered ISO Cargo Containers with corrugated rib bump map
    const containerColors = [0x0284c7, 0xd97706, 0x0f766e, 0xe11d48];
    const cGeo = new THREE.BoxGeometry(0.68, 0.42, 1.15);
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 2; col++) {
        for (let stack = 0; stack < 2; stack++) {
          const mat = new THREE.MeshStandardMaterial({
            color: containerColors[(row * 2 + col + stack) % containerColors.length],
            bumpMap: containerRibTex,
            bumpScale: 0.04,
            roughness: 0.58,
            metalness: 0.35,
          });
          const box = new THREE.Mesh(cGeo, mat);
          box.position.set((col - 0.5) * 0.74, h + 0.3 + stack * 0.44, -1.25 + row * 1.24);
          box.castShadow = true;
          root.add(box);
        }
      }
    }
    mastTopY = h + 2.15;
  } else if (ship.id === 'secms_cable') {
    // Forward Wheelhouse
    const wheelhouse = new THREE.Mesh(new THREE.BoxGeometry(b * 0.68, 0.9, 1.0), cabinWhiteMat);
    wheelhouse.position.set(0, h + 0.52, -l * 0.24);
    wheelhouse.castShadow = true;
    root.add(wheelhouse);

    const glass = new THREE.Mesh(new THREE.BoxGeometry(b * 0.72, 0.28, 0.52), glassMat);
    glass.position.set(0, h + 0.72, -l * 0.29);
    root.add(glass);

    // Iconic Mid-Deck Cable Carousel Drum
    const carousel = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.48, 20), accentMat);
    carousel.position.set(0, h + 0.34, 0.32);
    carousel.castShadow = true;
    root.add(carousel);
    radarPart = carousel;

    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.62, 14), metalTrimMat);
    hub.position.set(0, h + 0.4, 0.32);
    root.add(hub);

    // Stern A-Frame Cable Gantry
    for (const side of [-0.62, 0.62]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.15, 0.14), accentMat);
      leg.position.set(side, h + 0.62, l * 0.38);
      leg.rotation.x = 0.22;
      root.add(leg);
    }
    const crossBar = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.14, 0.16), metalTrimMat);
    crossBar.position.set(0, h + 1.15, l * 0.45);
    root.add(crossBar);
    mastTopY = h + 1.95;
  } else if (ship.id === 'faro_survey') {
    // Research Survey Cabin
    const lab = new THREE.Mesh(new THREE.BoxGeometry(b * 0.66, 0.75, 1.55), cabinWhiteMat);
    lab.position.set(0, h + 0.45, -0.1);
    lab.castShadow = true;
    root.add(lab);

    const visor = new THREE.Mesh(new THREE.BoxGeometry(b * 0.7, 0.26, 0.78), glassMat);
    visor.position.set(0, h + 0.62, -0.45);
    root.add(visor);

    // Geodesic White Radome + 360° LiDAR Scanner Dome
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.46, 18, 14),
      new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.2, metalness: 0.05, clearcoat: 0.9 }),
    );
    dome.position.set(0, h + 1.12, 0.2);
    dome.castShadow = true;
    root.add(dome);

    // Rotating 360 LiDAR bar
    const lidarSpinner = new THREE.Group();
    lidarSpinner.position.set(0, h + 1.62, -0.35);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.1, 0.16), accentMat);
    lidarSpinner.add(bar);
    root.add(lidarSpinner);
    radarPart = lidarSpinner;

    mastTopY = h + 2.15;
  } else if (ship.id === 'secad_lng') {
    // Aft Navigation Tower
    const aftTower = new THREE.Mesh(new THREE.BoxGeometry(b * 0.74, 1.28, 0.92), cabinWhiteMat);
    aftTower.position.set(0, h + 0.68, l * 0.34);
    aftTower.castShadow = true;
    root.add(aftTower);

    const bridgeWindow = new THREE.Mesh(new THREE.BoxGeometry(b * 0.94, 0.26, 0.38), glassMat);
    bridgeWindow.position.set(0, h + 1.12, l * 0.29);
    root.add(bridgeWindow);

    // 3 Iconic Moss Spherical Cryogenic LNG Tanks + Metallic Deck Collars
    const tankMat = new THREE.MeshPhysicalMaterial({
      color: 0xe2e8f0,
      roughness: 0.25,
      metalness: 0.4,
      clearcoat: 0.7,
    });
    const tankZ = [-1.45, -0.32, 0.8];
    for (const tz of tankZ) {
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.6, 0.28, 18), accentMat);
      collar.position.set(0, h + 0.2, tz);
      root.add(collar);

      const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.52, 20, 14), tankMat);
      sphere.position.set(0, h + 0.52, tz);
      sphere.castShadow = true;
      root.add(sphere);
    }

    // Center Cryo Pipe Catwalk
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 8), metalTrimMat);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(0, h + 1.08, -0.32);
    root.add(pipe);
    mastTopY = h + 2.15;
  } else if (ship.id === 'pdf_sail') {
    // Wooden Teak Deck Insert
    const teak = new THREE.Mesh(
      new THREE.BoxGeometry(b * 0.6, 0.1, l * 0.62),
      new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.78, metalness: 0.05 }),
    );
    teak.position.set(0, h + 0.1, 0.05);
    root.add(teak);

    // Tall Tapered Mast
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.07, 2.75, 10), metalTrimMat);
    mast.position.set(0, h + 1.45, -0.15);
    mast.castShadow = true;
    root.add(mast);

    // Billowing Mainsail & Fore Jib
    const sailMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.62,
      metalness: 0.02,
      side: THREE.DoubleSide,
    });
    const mainSailShape = new THREE.Shape();
    mainSailShape.moveTo(0, 0);
    mainSailShape.lineTo(1.25, 0.12);
    mainSailShape.quadraticCurveTo(0.65, 1.25, 0, 2.35);
    mainSailShape.closePath();
    const mainSail = new THREE.Mesh(new THREE.ShapeGeometry(mainSailShape), sailMat);
    mainSail.rotation.y = Math.PI / 2 + 0.18;
    mainSail.position.set(0.02, h + 0.38, -0.1);
    mainSail.castShadow = true;
    root.add(mainSail);

    const jibShape = new THREE.Shape();
    jibShape.moveTo(0, 0);
    jibShape.lineTo(-0.98, 0.08);
    jibShape.lineTo(0, 1.9);
    jibShape.closePath();
    const jib = new THREE.Mesh(new THREE.ShapeGeometry(jibShape), accentMat);
    jib.rotation.y = Math.PI / 2 - 0.15;
    jib.position.set(-0.02, h + 0.36, -0.2);
    root.add(jib);

    mastTopY = h + 2.85;
  } else if (ship.id === 'mail_ferry') {
    // Dual-level Ferry Superstructure
    const deck1 = new THREE.Mesh(new THREE.BoxGeometry(b * 0.82, 0.55, l * 0.68), cabinWhiteMat);
    deck1.position.set(0, h + 0.34, 0);
    deck1.castShadow = true;
    root.add(deck1);

    const winStrip1 = new THREE.Mesh(new THREE.BoxGeometry(b * 0.85, 0.18, l * 0.56), glassMat);
    winStrip1.position.set(0, h + 0.4, 0);
    root.add(winStrip1);

    const deck2 = new THREE.Mesh(new THREE.BoxGeometry(b * 0.68, 0.48, l * 0.45), accentMat);
    deck2.position.set(0, h + 0.84, -0.1);
    deck2.castShadow = true;
    root.add(deck2);

    const bridge = new THREE.Mesh(new THREE.BoxGeometry(b * 0.72, 0.24, 0.62), glassMat);
    bridge.position.set(0, h + 1.15, -0.42);
    root.add(bridge);

    // Side Exhaust Funnels
    for (const side of [-0.55, 0.55]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.65, 0.32), metalTrimMat);
      f.position.set(side, h + 1.0, 0.65);
      root.add(f);
    }
    mastTopY = h + 1.95;
  } else {
    // patrol_guard (살피미) — Sleek Raked Interceptor
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(b * 0.7, 0.56, 1.35), cabinWhiteMat);
    cabin.position.set(0, h + 0.34, -0.05);
    cabin.castShadow = true;
    root.add(cabin);

    const rakedWindshield = new THREE.Mesh(new THREE.BoxGeometry(b * 0.74, 0.26, 0.72), glassMat);
    rakedWindshield.position.set(0, h + 0.48, -0.35);
    rakedWindshield.rotation.x = -0.2;
    root.add(rakedWindshield);

    const lightBar = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.1, 0.18), accentMat);
    lightBar.position.set(0, h + 0.74, -0.1);
    root.add(lightBar);

    const radarDish = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.08, 0.14), metalTrimMat);
    radarDish.position.set(0, h + 1.15, 0.15);
    root.add(radarDish);
    radarPart = radarDish;

    // Twin Waterjet Housings
    for (const side of [-0.32, 0.32]) {
      const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.34, 10), metalTrimMat);
      jet.rotation.x = Math.PI / 2;
      jet.position.set(side, h * 0.45, l * 0.48);
      root.add(jet);
    }
    mastTopY = h + 1.65;
  }

  // 5. Identification Flag Mast + Role Beacon (HQ Navy vs Partner Amber)
  const mastPole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.85, 8), metalTrimMat);
  mastPole.position.set(0, mastTopY - 0.35, 0.1);
  root.add(mastPole);

  const beaconMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), roleFlagMat);
  beaconMesh.position.set(0, mastTopY + 0.18, 0.1);
  root.add(beaconMesh);

  return { group: root, wakeMesh, beaconMesh, radarPart };
}
