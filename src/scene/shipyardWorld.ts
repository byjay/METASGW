import * as THREE from 'three';
import { ENGINEERING_MODULES, type EngineeringModuleConfig, type ModuleId } from '../config/fleetConfig';
import type { HarborTexturePack } from './textures';

export interface ShipyardWorldHandles {
  zoneBeacons: Array<{ module: EngineeringModuleConfig; ring: THREE.Mesh; hitProxy: THREE.Mesh }>;
  clickableProxies: THREE.Object3D[];
  walkableMeshes: THREE.Object3D[];
  roofGroups: Map<ModuleId, THREE.Group>;
  lighthouseBeam: THREE.Object3D | null;
  faroDomeScanner: THREE.Object3D | null;
  indoorFaroMiniScan: THREE.Object3D | null;
  weldingSparks: THREE.Points | null;
  weldingLight: THREE.PointLight | null;
  buoys: Array<{ group: THREE.Group; baseY: number; phase: number }>;
  clouds: Array<{ sprite: THREE.Sprite; speed: number; baseX: number }>;
  floodlightMaterials: THREE.MeshStandardMaterial[];
  update: (dt: number, elapsed: number, isNight: boolean, insideModuleId: ModuleId | null) => void;
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

/**
 * Builds a monumental 900-ton Korean-shipyard Goliath Gantry Crane with real truss bracing,
 * typography-painted box girder, twin trolleys, suspended spreader, and aviation beacons.
 */
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
  const cabGlass = new THREE.MeshPhysicalMaterial({
    color: 0x0f172a,
    emissive: 0x38bdf8,
    emissiveIntensity: 0.35,
    roughness: 0.14,
    metalness: 0.2,
    clearcoat: 0.85,
  });

  // Heavy Rail Bogie Feet (span +-5.2m)
  for (const sx of [-5.2, 5.2]) {
    const bogie = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.15, 8.2), darkSteel);
    bogie.position.set(sx, 0.58, 0);
    bogie.castShadow = true;
    bogie.receiveShadow = true;
    crane.add(bogie);

    // 2 A-frame inclined legs per side meeting at girder height (y = 17.5)
    for (const sz of [-3.5, 3.5]) {
      const bot = new THREE.Vector3(sx, 1.1, sz);
      const top = new THREE.Vector3(sx * 0.84, 17.5, sz * 0.24);
      addDiagonalBrace(crane, bot, top, 0.4, paintMat);
    }

    // Horizontal cross-ties & X-bracing between A-frame legs
    const midY1 = 6.5;
    const midY2 = 12.2;
    addDiagonalBrace(crane, new THREE.Vector3(sx * 0.94, midY1, -2.5), new THREE.Vector3(sx * 0.94, midY1, 2.5), 0.18, darkSteel);
    addDiagonalBrace(crane, new THREE.Vector3(sx * 0.89, midY2, -1.7), new THREE.Vector3(sx * 0.89, midY2, 1.7), 0.17, darkSteel);
    addDiagonalBrace(crane, new THREE.Vector3(sx * 0.94, midY1, -2.4), new THREE.Vector3(sx * 0.89, midY2, 1.6), 0.12, darkSteel);
    addDiagonalBrace(crane, new THREE.Vector3(sx * 0.94, midY1, 2.4), new THREE.Vector3(sx * 0.89, midY2, -1.6), 0.12, darkSteel);
  }

  // Main Overhead Box Girder with Painted Shipyard Typography on Front/Back Faces
  const girderMats = [paintMat, paintMat, paintMat, darkSteel, girderFaceMat, girderFaceMat];
  const mainGirder = new THREE.Mesh(new THREE.BoxGeometry(20.5, 2.5, 2.3), girderMats);
  mainGirder.position.set(0, 18.6, 0);
  mainGirder.castShadow = true;
  crane.add(mainGirder);

  // Cantilever Outrigger Boom extending forward over the yard
  const boom = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.3, 19.0), paintMat);
  boom.position.set(0, 17.6, 6.2);
  boom.castShadow = true;
  crane.add(boom);

  // Upper Apex Mast & Stay Cables
  const apex = new THREE.Mesh(new THREE.BoxGeometry(1.6, 4.2, 1.2), darkSteel);
  apex.position.set(0, 21.8, -0.5);
  crane.add(apex);
  addDiagonalBrace(crane, new THREE.Vector3(0, 23.6, -0.5), new THREE.Vector3(0, 18.2, 14.5), 0.1, darkSteel);
  addDiagonalBrace(crane, new THREE.Vector3(0, 23.6, -0.5), new THREE.Vector3(-9.5, 19.6, 0), 0.1, darkSteel);
  addDiagonalBrace(crane, new THREE.Vector3(0, 23.6, -0.5), new THREE.Vector3(9.5, 19.6, 0), 0.1, darkSteel);

  // Glazed Operator Cab & Trolley Winch House
  const trolley = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.5, 3.2), darkSteel);
  trolley.position.set(0, 20.4, 0.2);
  crane.add(trolley);

  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.4, 2.0), cabGlass);
  cab.position.set(1.2, 16.0, 8.8);
  crane.add(cab);

  // Hanging Hoist Cables + Spreader Beam
  for (const cx of [-1.0, 1.0]) {
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 7.2, 6), darkSteel);
    cable.position.set(cx, 13.4, 11.2);
    crane.add(cable);
  }
  const spreader = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.42, 1.6), darkSteel);
  spreader.position.set(0, 9.7, 11.2);
  crane.add(spreader);

  // Aviation Red Warning Beacons on Top
  for (const bx of [-9.6, 0, 9.6]) {
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 10), beaconMat);
    beacon.position.set(bx, bx === 0 ? 24.2 : 20.1, bx === 0 ? -0.5 : 0);
    crane.add(beacon);
  }

  return crane;
}

/**
 * Builds the monumental 52m 174,000 m³ LNG Carrier ("H1042 SEASTAR") moored along the East Outfitting Quay.
 */
function buildHeroLngCarrier(
  textures: HarborTexturePack,
  navRedMat: THREE.MeshStandardMaterial,
  navGreenMat: THREE.MeshStandardMaterial,
  windowGlowMat: THREE.MeshStandardMaterial,
): { group: THREE.Group; sparks: THREE.Points; sparkLight: THREE.PointLight } {
  const ship = new THREE.Group();
  // Moored parallel to the spacious East Outfitting Quay (x = 59.5, z = 18)
  ship.position.set(59.5, 0.05, 18.0);
  ship.rotation.y = -0.04;

  const hullRedMat = new THREE.MeshStandardMaterial({ color: 0x8f1d1d, roughness: 0.62, metalness: 0.25 });
  const hullNavyMat = new THREE.MeshStandardMaterial({ color: 0x0f243d, roughness: 0.44, metalness: 0.42 });
  const hullSideMat = new THREE.MeshStandardMaterial({
    map: textures.hullDraftMarks,
    roughness: 0.42,
    metalness: 0.38,
  });
  const deckGreenMat = new THREE.MeshStandardMaterial({ color: 0x1e4d40, roughness: 0.72, metalness: 0.14 });
  const whiteSteel = new THREE.MeshStandardMaterial({ color: 0xe8edf3, roughness: 0.46, metalness: 0.22 });
  const pipeSteel = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.34, metalness: 0.78 });
  const accentOrange = new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.4, metalness: 0.25 });

  // 1. Main Mid-Body Hull Box (length 32, width 8.8, height 4.8)
  const midMats = [hullSideMat, hullSideMat, deckGreenMat, hullRedMat, hullNavyMat, hullNavyMat];
  const midHull = new THREE.Mesh(new THREE.BoxGeometry(8.8, 4.8, 32), midMats);
  midHull.position.set(0, 2.0, 0);
  midHull.castShadow = true;
  midHull.receiveShadow = true;
  ship.add(midHull);

  // 2. Sculpted Pointed Bow Section (-Z pointing toward harbor)
  const bowShape = new THREE.Shape();
  bowShape.moveTo(-4.4, 0);
  bowShape.lineTo(4.4, 0);
  bowShape.quadraticCurveTo(3.6, -6.2, 0, -10.2);
  bowShape.quadraticCurveTo(-3.6, -6.2, -4.4, 0);

  const bowLower = new THREE.Mesh(
    new THREE.ExtrudeGeometry(bowShape, { depth: 1.7, bevelEnabled: false }),
    hullRedMat,
  );
  bowLower.rotation.x = Math.PI / 2;
  bowLower.position.set(0, 1.3, -16);
  ship.add(bowLower);

  const bowUpper = new THREE.Mesh(
    new THREE.ExtrudeGeometry(bowShape, { depth: 3.1, bevelEnabled: true, bevelSize: 0.16, bevelThickness: 0.16 }),
    hullNavyMat,
  );
  bowUpper.rotation.x = Math.PI / 2;
  bowUpper.position.set(0, 4.4, -16);
  bowUpper.castShadow = true;
  ship.add(bowUpper);

  const bulb = new THREE.Mesh(new THREE.SphereGeometry(1.3, 14, 10), hullRedMat);
  bulb.scale.set(0.88, 0.74, 2.4);
  bulb.position.set(0, 0.14, -25.0);
  ship.add(bulb);

  const stern = new THREE.Mesh(new THREE.BoxGeometry(8.2, 4.6, 5.0), hullNavyMat);
  stern.position.set(0, 2.1, 18.2);
  ship.add(stern);

  // 3. Four Iconic Mark-III LNG Membrane Prismatic Cargo Domes
  for (let i = 0; i < 4; i++) {
    const cz = -12.6 + i * 6.8;
    const domeBase = new THREE.Mesh(new THREE.BoxGeometry(6.4, 2.3, 5.4), whiteSteel);
    domeBase.position.set(0, 5.45, cz);
    domeBase.castShadow = true;
    ship.add(domeBase);

    const domeCap = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.9, 1.0, 8), whiteSteel);
    domeCap.rotation.y = Math.PI / 8;
    domeCap.position.set(0, 7.05, cz);
    domeCap.castShadow = true;
    ship.add(domeCap);

    const riser = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 1.8, 8), pipeSteel);
    riser.position.set(0, 7.9, cz);
    ship.add(riser);
  }

  const catwalk = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.24, 29.0), pipeSteel);
  catwalk.position.set(0, 7.75, -2.5);
  ship.add(catwalk);

  // 4. 6-Story Aft Accommodation Superstructure Tower & Panoramic Bridge Wings
  const accomLower = new THREE.Mesh(new THREE.BoxGeometry(7.4, 5.8, 6.2), whiteSteel);
  accomLower.position.set(0, 7.3, 14.0);
  accomLower.castShadow = true;
  ship.add(accomLower);

  const accomUpper = new THREE.Mesh(new THREE.BoxGeometry(6.2, 3.4, 4.8), whiteSteel);
  accomUpper.position.set(0, 11.7, 13.8);
  accomUpper.castShadow = true;
  ship.add(accomUpper);

  const bridgeWing = new THREE.Mesh(new THREE.BoxGeometry(11.6, 1.45, 2.0), whiteSteel);
  bridgeWing.position.set(0, 13.5, 12.8);
  bridgeWing.castShadow = true;
  ship.add(bridgeWing);

  const bridgeGlass = new THREE.Mesh(new THREE.BoxGeometry(10.8, 0.72, 2.12), windowGlowMat);
  bridgeGlass.position.set(0, 13.55, 12.75);
  ship.add(bridgeGlass);

  const cabinWin = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.5, 0.18), windowGlowMat);
  cabinWin.position.set(0, 9.2, 10.88);
  ship.add(cabinWin);
  const cabinWin2 = cabinWin.clone();
  cabinWin2.position.y = 7.4;
  ship.add(cabinWin2);

  const radarMast = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, 4.8, 8), whiteSteel);
  radarMast.position.set(0, 16.2, 13.0);
  ship.add(radarMast);
  const radarBar = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.16, 0.24), whiteSteel);
  radarBar.position.set(0, 17.6, 13.0);
  ship.add(radarBar);

  const funnel = new THREE.Mesh(new THREE.BoxGeometry(2.7, 4.1, 3.4), accentOrange);
  funnel.position.set(0, 12.2, 17.6);
  funnel.castShadow = true;
  ship.add(funnel);
  const funnelCap = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.72, 3.5), hullNavyMat);
  funnelCap.position.set(0, 14.3, 17.6);
  ship.add(funnelCap);

  const portLight = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 8), navRedMat);
  portLight.position.set(-5.85, 13.8, 12.8);
  ship.add(portLight);
  const stbdLight = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 8), navGreenMat);
  stbdLight.position.set(5.85, 13.8, 12.8);
  ship.add(stbdLight);

  const lifeboat = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 2.0, 6, 10), accentOrange);
  lifeboat.rotation.x = Math.PI * 0.36;
  lifeboat.position.set(0, 6.0, 20.2);
  ship.add(lifeboat);

  // 5. Animated Welding Arc Sparks on Bow Outfitting Deck
  const sparkCount = 44;
  const sparkPos = new Float32Array(sparkCount * 3);
  for (let i = 0; i < sparkCount; i++) {
    sparkPos[i * 3] = (Math.random() - 0.5) * 1.8;
    sparkPos[i * 3 + 1] = Math.random() * 2.0;
    sparkPos[i * 3 + 2] = (Math.random() - 0.5) * 1.8;
  }
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparkMat = new THREE.PointsMaterial({
    color: 0xfde047,
    size: 0.26,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
  });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.position.set(-2.6, 4.9, -18.0);
  ship.add(sparks);

  const sparkLight = new THREE.PointLight(0x93c5fd, 1.4, 14);
  sparkLight.position.set(-2.6, 5.4, -18.0);
  ship.add(sparkLight);

  return { group: ship, sparks, sparkLight };
}

/**
 * Populates richly detailed, module-specific 3D furniture inside each 12m x 9m Walk-In Hall
 * so stepping inside immediately reveals an active engineering studio!
 */
function buildWalkInInteriorFurniture(
  parent: THREE.Group,
  mod: EngineeringModuleConfig,
  accentHex: THREE.Color,
  steelMat: THREE.MeshStandardMaterial,
): { indoorMiniScan?: THREE.Object3D } {
  const deskTopMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.45, metalness: 0.1 });
  const darkDeskMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.55, metalness: 0.4 });
  const screenMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: 0.95,
    roughness: 0.2,
  });
  const warmWoodMat = new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.68, metalness: 0.05 });

  let indoorMiniScan: THREE.Object3D | undefined;

  // Rear Accent Feature Display Wall Screen (visible right through the open glass entrance!)
  const wallBoard = new THREE.Mesh(new THREE.BoxGeometry(5.6, 1.75, 0.14), darkDeskMat);
  wallBoard.position.set(0, 2.35, -4.05);
  parent.add(wallBoard);
  const wallScreen = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.45), screenMat);
  wallScreen.position.set(0, 2.35, -3.96);
  parent.add(wallScreen);

  if (mod.moduleId === 'faro360') {
    // Central Circular Holographic LiDAR Pedestal + Rotating Mini Ship Wireframe Scan
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.75, 0.78, 20), darkDeskMat);
    ped.position.set(-0.2, 0.52, -0.8);
    parent.add(ped);

    const glowRing = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.52, 28), new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide }));
    glowRing.rotation.x = -Math.PI / 2;
    glowRing.position.set(-0.2, 0.93, -0.8);
    parent.add(glowRing);

    const miniScanPivot = new THREE.Group();
    miniScanPivot.position.set(-0.2, 1.65, -0.8);
    const miniHull = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.82, 1),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, wireframe: true }),
    );
    miniHull.scale.set(1.5, 0.65, 0.8);
    miniScanPivot.add(miniHull);
    parent.add(miniScanPivot);
    indoorMiniScan = miniScanPivot;

    // Yellow Survey Tripod Laser Scanner on side
    const tripodHead = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.42, 0.28), new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.3 }));
    tripodHead.position.set(-3.6, 1.55, -2.0);
    parent.add(tripodHead);
    const tripodPole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.28, 1.35, 3), new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.4 }));
    tripodPole.position.set(-3.6, 0.78, -2.0);
    parent.add(tripodPole);
  } else if (mod.moduleId === 'pdfview') {
    // Quiet Reading Library: Warm Timber Reading Table + Tall Bookshelves + Warm Lamps
    const table = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.14, 1.75), warmWoodMat);
    table.position.set(0, 0.92, -1.6);
    parent.add(table);
    for (const lx of [-1.8, 1.8]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.82, 1.4), darkDeskMat);
      leg.position.set(lx, 0.48, -1.6);
      parent.add(leg);
    }
    // Warm amber reading lamps
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xfde68a, emissive: 0xf59e0b, emissiveIntensity: 1.5 });
    for (const lx of [-1.2, 1.2]) {
      const lamp = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.26, 12), lampMat);
      lamp.position.set(lx, 1.38, -1.6);
      parent.add(lamp);
    }
    // Side Bookshelves
    for (const sx of [-4.95, 4.95]) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.65, 2.8, 4.2), warmWoodMat);
      shelf.position.set(sx, 1.52, -1.2);
      parent.add(shelf);
    }
  } else if (mod.moduleId === 'secms') {
    // High-Voltage Switchboard Racks along both side walls + Central Control Desk
    const rackMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.42, metalness: 0.65 });
    const ledGreen = new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 1.8 });
    for (const sx of [-4.7, 4.7]) {
      for (const sz of [-2.4, -0.4]) {
        const rack = new THREE.Mesh(new THREE.BoxGeometry(0.95, 2.6, 1.45), rackMat);
        rack.position.set(sx, 1.42, sz);
        parent.add(rack);
        const ledBar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 1.1), ledGreen);
        ledBar.position.set(sx > 0 ? sx - 0.5 : sx + 0.5, 2.25, sz);
        parent.add(ledBar);
      }
    }
    const desk = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.92, 1.2), darkDeskMat);
    desk.position.set(0, 0.56, -2.1);
    parent.add(desk);
    const mon = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.72, 0.08), screenMat);
    mon.position.set(0, 1.42, -2.35);
    parent.add(mon);
  } else {
    // SEDMS / SECAD 3D / bmail: Twin Ergonomic Engineering CAD Workstations + Blueprint Light Table
    const lightTable = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.14, 1.7), deskTopMat);
    lightTable.position.set(0, 0.98, -1.7);
    parent.add(lightTable);
    const blueprintGlow = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.35), screenMat);
    blueprintGlow.rotation.x = -Math.PI / 2;
    blueprintGlow.position.set(0, 1.06, -1.7);
    parent.add(blueprintGlow);
    for (const lx of [-1.5, 1.5]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.88, 1.4), steelMat);
      leg.position.set(lx, 0.52, -1.7);
      parent.add(leg);
    }

    // Left & Right Side CAD Monitor Desks
    for (const sx of [-4.2, 4.2]) {
      const sideDesk = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.85, 3.2), darkDeskMat);
      sideDesk.position.set(sx, 0.52, -1.4);
      parent.add(sideDesk);
      const sideMon = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.75, 2.2), screenMat);
      sideMon.position.set(sx > 0 ? sx + 0.3 : sx - 0.3, 1.38, -1.4);
      parent.add(sideMon);
    }
  }

  return { indoorMiniScan };
}

/**
 * Builds a 100% WALK-IN OPEN-INTERIOR 12m x 9m Architectural Engineering Hall!
 * Features:
 * - Wide 3.6m OPEN sliding glass front doorway (zero collision barrier in center!)
 * - Furnished 3D interior room with polished epoxy floor & warm interior ceiling glow
 * - Separate `roofGroup` so HarborScene smoothly hides/fades the roof when the player walks inside!
 */
function buildWalkInEngineeringHall(
  mod: EngineeringModuleConfig,
  textures: HarborTexturePack,
  curtainMat: THREE.MeshStandardMaterial,
  steelMat: THREE.MeshStandardMaterial,
  darkConcreteMat: THREE.MeshStandardMaterial,
): {
  group: THREE.Group;
  roofGroup: THREE.Group;
  faroScanner?: THREE.Object3D;
  indoorMiniScan?: THREE.Object3D;
} {
  const hall = new THREE.Group();
  const isWest = mod.moduleId === 'bmail';
  hall.position.set(mod.dockPos.x, 1.61, mod.dockPos.z);
  if (isWest) {
    // Rotate +90 deg so local +Z doorway faces East (+X) out onto the West Pier walkway
    hall.rotation.y = Math.PI / 2;
  }

  const accentColor = new THREE.Color(mod.dockColor);
  const accentMat = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.36, metalness: 0.42 });
  const extWallMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.56, metalness: 0.16 });
  const intFloorMat = new THREE.MeshStandardMaterial({
    color: mod.moduleId === 'pdfview' ? 0xd6c7b2 : 0xcbd5e1,
    roughness: 0.42,
    metalness: 0.14,
  });
  const charcoalMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.55 });
  const glassPaneMat = new THREE.MeshPhysicalMaterial({
    color: 0x7dd3fc,
    transparent: true,
    opacity: 0.34,
    roughness: 0.1,
    metalness: 0.25,
    clearcoat: 1.0,
  });

  // 1. Raised Polished Interior Floor Slab (12.0m wide x 9.0m deep, top at local y = 0.11 -> world 1.72)
  const floorSlab = new THREE.Mesh(new THREE.BoxGeometry(12.0, 0.12, 9.0), intFloorMat);
  floorSlab.position.y = 0.05;
  floorSlab.receiveShadow = true;
  hall.add(floorSlab);

  // Subtle glowing accent perimeter strip around interior floor + Open Entrance Threshold Carpet
  const welcomeMat = new THREE.Mesh(
    new THREE.BoxGeometry(3.6, 0.03, 1.6),
    new THREE.MeshStandardMaterial({
      color: accentColor,
      emissive: accentColor,
      emissiveIntensity: 0.45,
      roughness: 0.65,
    }),
  );
  welcomeMat.position.set(0, 0.115, 4.35);
  hall.add(welcomeMat);

  const H = 4.15; // Wall height
  const T = 0.34; // Wall thickness

  // 2. Solid Perimeter Walls (Back, Left, Right) — Hollow Interior!
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(12.0, H, T), extWallMat);
  backWall.position.set(0, H * 0.5 + 0.1, -4.5 + T * 0.5);
  backWall.castShadow = true;
  backWall.receiveShadow = true;
  hall.add(backWall);

  // Side walls with translucent architectural window bands
  for (const sx of [-6.0 + T * 0.5, 6.0 - T * 0.5]) {
    const lowWall = new THREE.Mesh(new THREE.BoxGeometry(T, 1.3, 9.0), extWallMat);
    lowWall.position.set(sx, 0.75, 0);
    lowWall.castShadow = true;
    hall.add(lowWall);

    const upperWall = new THREE.Mesh(new THREE.BoxGeometry(T, 0.85, 9.0), extWallMat);
    upperWall.position.set(sx, H - 0.32, 0);
    upperWall.castShadow = true;
    hall.add(upperWall);

    const sideGlass = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.0, 7.6), glassPaneMat);
    sideGlass.position.set(sx, 2.4, 0);
    hall.add(sideGlass);
  }

  // 3. Split Front Wall with WIDE 3.6m OPEN WALK-IN DOORWAY (x in [-1.8, +1.8] is 100% OPEN!)
  for (const dir of [-1, 1]) {
    // Wing spans from |x|=1.8 to |x|=6.0 -> width = 4.2m, center at dir * 3.9
    const frontBase = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.15, T), extWallMat);
    frontBase.position.set(dir * 3.9, 0.68, 4.5 - T * 0.5);
    frontBase.castShadow = true;
    hall.add(frontBase);

    const frontGlass = new THREE.Mesh(new THREE.BoxGeometry(3.7, 2.25, 0.12), glassPaneMat);
    frontGlass.position.set(dir * 3.9, 2.38, 4.5 - T * 0.5);
    hall.add(frontGlass);

    const frontTop = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.75, T), extWallMat);
    frontTop.position.set(dir * 3.9, 3.88, 4.5 - T * 0.5);
    hall.add(frontTop);

    // Sleek Sliding Door Frame Jambs flanking the 3.6m Open Entrance
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.24, H, 0.42), charcoalMat);
    jamb.position.set(dir * 1.85, H * 0.5 + 0.1, 4.46);
    hall.add(jamb);

    // Outer architectural H-columns
    const cornerCol = new THREE.Mesh(new THREE.BoxGeometry(0.32, H + 0.2, 0.38), charcoalMat);
    cornerCol.position.set(dir * 5.9, H * 0.5 + 0.1, 4.48);
    hall.add(cornerCol);
  }

  // Overhead Doorway Transom Beam + Glowing Entry Canopy
  const transom = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.78, 0.42), charcoalMat);
  transom.position.set(0, 3.86, 4.46);
  hall.add(transom);

  const canopy = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.18, 1.55), charcoalMat);
  canopy.position.set(0, 3.65, 5.15);
  canopy.castShadow = true;
  hall.add(canopy);

  const canopyGlow = new THREE.Mesh(
    new THREE.BoxGeometry(3.8, 0.06, 0.25),
    new THREE.MeshStandardMaterial({
      color: accentColor,
      emissive: accentColor,
      emissiveIntensity: 1.6,
      roughness: 0.2,
    }),
  );
  canopyGlow.position.set(0, 3.55, 5.55);
  hall.add(canopyGlow);

  // Subtle Corner Curb Step outside doorway
  const entryPad = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.1, 1.5), darkConcreteMat);
  entryPad.position.set(0, 0.04, 5.2);
  entryPad.receiveShadow = true;
  hall.add(entryPad);

  // Quiet Library Timber Louver Accent on front glass wings (never blocks open center doorway)
  if (mod.moduleId === 'pdfview') {
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.72, metalness: 0.05 });
    for (const dir of [-1, 1]) {
      for (let k = 0; k < 5; k++) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.35, 0.34), woodMat);
        fin.position.set(dir * (2.35 + k * 0.72), 2.38, 4.64);
        hall.add(fin);
      }
    }
  }

  // 4. Furnished 3D Engineering Interior (always visible through glass & revealed completely on Roof Cutaway!)
  const { indoorMiniScan } = buildWalkInInteriorFurniture(hall, mod, accentColor, steelMat);

  // 5. Detachable RPG Cutaway Roof Group (Roof Slab + Fascia + Illuminated Signboard + Rooftop Landmarks)
  const roofGroup = new THREE.Group();
  hall.add(roofGroup);

  const roofSub = new THREE.Mesh(new THREE.BoxGeometry(12.8, 0.34, 9.8), charcoalMat);
  roofSub.position.set(0, H + 0.26, 0.1);
  roofSub.castShadow = true;
  roofGroup.add(roofSub);

  const roofAccent = new THREE.Mesh(new THREE.BoxGeometry(13.0, 0.24, 10.0), accentMat);
  roofAccent.position.set(0, H + 0.54, 0.1);
  roofGroup.add(roofAccent);

  // Illuminated Korean + English Architectural Signboard mounted on Roof Fascia
  const signTex = textures.createSignboard(mod.shortName, mod.displayName, mod.dockColor);
  const signMat = new THREE.MeshStandardMaterial({
    map: signTex,
    emissive: new THREE.Color(0xffffff),
    emissiveMap: signTex,
    emissiveIntensity: 0.38,
    roughness: 0.32,
  });
  const signFrame = new THREE.Mesh(new THREE.BoxGeometry(5.8, 1.32, 0.24), charcoalMat);
  signFrame.position.set(0, H + 1.32, 4.35);
  roofGroup.add(signFrame);
  const signFace = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 1.18), signMat);
  signFace.position.set(0, H + 1.32, 4.49);
  roofGroup.add(signFace);

  // Rooftop HVAC Chiller
  const hvac = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.85, 1.4), steelMat);
  hvac.position.set(-3.8, H + 1.05, -2.1);
  roofGroup.add(hvac);

  // Skylight Glass Strip on Roof
  const skylight = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.18, 2.4), curtainMat);
  skylight.position.set(0, H + 0.72, -0.4);
  roofGroup.add(skylight);

  let faroScanner: THREE.Object3D | undefined;
  if (mod.moduleId === 'faro360') {
    const domeBase = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.75, 0.5, 14), charcoalMat);
    domeBase.position.set(3.6, H + 0.9, -1.6);
    roofGroup.add(domeBase);

    const scannerPivot = new THREE.Group();
    scannerPivot.position.set(3.6, H + 1.65, -1.6);
    const dome = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.1, 1),
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.65,
        roughness: 0.25,
        metalness: 0.6,
        wireframe: true,
      }),
    );
    scannerPivot.add(dome);
    const coreLens = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, emissive: 0x38bdf8, emissiveIntensity: 1.1, roughness: 0.1 }),
    );
    scannerPivot.add(coreLens);
    roofGroup.add(scannerPivot);
    faroScanner = scannerPivot;
  } else if (mod.moduleId === 'bmail') {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.36, 7.0, 6), steelMat);
    mast.position.set(3.2, H + 4.1, -1.8);
    roofGroup.add(mast);
    for (const dy of [H + 2.8, H + 4.9]) {
      const dish = new THREE.Mesh(new THREE.ConeGeometry(0.8, 0.45, 14, 1, true), extWallMat);
      dish.rotation.z = Math.PI / 2.2;
      dish.position.set(3.75, dy, -1.8);
      roofGroup.add(dish);
    }
  } else {
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 2.8, 8), steelMat);
    antenna.position.set(4.1, H + 1.9, -2.2);
    roofGroup.add(antenna);
  }

  return { group: hall, roofGroup, faroScanner, indoorMiniScan };
}

/**
 * Builds the 2X EXPANDED Walk-In Korean Smart Shipyard World inside Three.js!
 */
export function buildShipyardWorld(
  scene: THREE.Scene,
  textures: HarborTexturePack,
): ShipyardWorldHandles {
  const zoneBeacons: ShipyardWorldHandles['zoneBeacons'] = [];
  const clickableProxies: THREE.Object3D[] = [];
  const walkableMeshes: THREE.Object3D[] = [];
  const roofGroups = new Map<ModuleId, THREE.Group>();
  const buoys: ShipyardWorldHandles['buoys'] = [];
  const clouds: ShipyardWorldHandles['clouds'] = [];
  const floodlightMaterials: THREE.MeshStandardMaterial[] = [];

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
  const seawallMat = new THREE.MeshStandardMaterial({
    color: 0x2c3a4c,
    roughness: 0.9,
    metalness: 0.08,
  });
  const hazardMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.hazardTrim,
    roughness: 0.62,
    metalness: 0.1,
  });
  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.38,
    metalness: 0.74,
  });
  const curtainMat = new THREE.MeshStandardMaterial({
    map: textures.curtainWall,
    emissive: new THREE.Color(0xbae6fd),
    emissiveMap: textures.curtainWall,
    emissiveIntensity: 0.45,
    roughness: 0.18,
    metalness: 0.42,
  });
  const aviationRedMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0xef4444,
    emissiveIntensity: 2.2,
    roughness: 0.2,
  });
  const navGreenMat = new THREE.MeshStandardMaterial({
    color: 0x22c55e,
    emissive: 0x22c55e,
    emissiveIntensity: 2.0,
    roughness: 0.2,
  });
  const bridgeGlowMat = new THREE.MeshStandardMaterial({
    color: 0xfef3c7,
    emissive: 0xfde68a,
    emissiveIntensity: 1.45,
    roughness: 0.12,
  });
  floodlightMaterials.push(curtainMat, bridgeGlowMat);

  // 1. GRAND 2X EXPANDED NORTH ENGINEERING QUAY (160m wide x 32m deep: x in [-76, 84], z in [-44, -12])
  const quayBase = new THREE.Mesh(new THREE.BoxGeometry(162, 2.6, 32), seawallMat);
  quayBase.position.set(4, 0.05, -28.0);
  quayBase.receiveShadow = true;
  scene.add(quayBase);

  const quayDeck = new THREE.Mesh(new THREE.BoxGeometry(162.4, 0.38, 32.2), concreteMat);
  quayDeck.position.set(4, 1.42, -28.0);
  quayDeck.receiveShadow = true;
  scene.add(quayDeck);
  walkableMeshes.push(quayDeck);

  // Rear Logistics Asphalt Yard behind Goliath Cranes
  const rearApron = new THREE.Mesh(new THREE.BoxGeometry(184, 1.9, 20), asphaltMat);
  rearApron.position.set(4, 0.62, -52.0);
  rearApron.receiveShadow = true;
  scene.add(rearApron);

  // Continuous Walkable WEST COMMS PIER (x in [-76, -54], z in [-12, +24])
  const westPierBase = new THREE.Mesh(new THREE.BoxGeometry(22, 2.5, 36), seawallMat);
  westPierBase.position.set(-65, 0.1, 6.0);
  westPierBase.receiveShadow = true;
  scene.add(westPierBase);
  const westPierDeck = new THREE.Mesh(new THREE.BoxGeometry(22.4, 0.38, 36.4), concreteMat);
  westPierDeck.position.set(-65, 1.42, 6.0);
  westPierDeck.receiveShadow = true;
  scene.add(westPierDeck);
  walkableMeshes.push(westPierDeck);

  // Continuous Walkable EAST 174K LNG OUTFITTING QUAY (x in [66, 84], z in [-12, +40])
  const eastPierBase = new THREE.Mesh(new THREE.BoxGeometry(18, 2.5, 52), seawallMat);
  eastPierBase.position.set(75, 0.1, 14.0);
  eastPierBase.receiveShadow = true;
  scene.add(eastPierBase);
  const eastPierDeck = new THREE.Mesh(new THREE.BoxGeometry(18.4, 0.38, 52.4), concreteMat);
  eastPierDeck.position.set(75, 1.42, 14.0);
  eastPierDeck.receiveShadow = true;
  scene.add(eastPierDeck);
  walkableMeshes.push(eastPierDeck);

  // Safety Yellow-Black Waterfront Curbing along Main Quay, West Pier & East Quay
  const frontTrim = new THREE.Mesh(new THREE.BoxGeometry(121.0, 0.26, 0.55), hazardMat);
  frontTrim.position.set(6, 1.5, -12.1);
  scene.add(frontTrim);
  const westTrim = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.26, 36.4), hazardMat);
  westTrim.position.set(-54.0, 1.5, 6.0);
  scene.add(westTrim);
  const eastTrim = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.26, 52.4), hazardMat);
  eastTrim.position.set(66.0, 1.5, 14.0);
  scene.add(eastTrim);

  // Central Harbor Plaza Compass Rose Medallion right at Humanoid Spawn (0, 1.625, -16.0)
  const plazaRing = new THREE.Mesh(
    new THREE.RingGeometry(2.8, 3.25, 48),
    new THREE.MeshBasicMaterial({ color: 0x0284c7, transparent: true, opacity: 0.65, side: THREE.DoubleSide }),
  );
  plazaRing.rotation.x = -Math.PI / 2;
  plazaRing.position.set(0, 1.625, -15.8);
  scene.add(plazaRing);

  // Embedded Parallel Steel Goliath Crane Rails running along Rear Yard (z = -31.8 & -39.8)
  for (const rz of [-31.8, -39.8]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(148, 0.08, 0.26), steelMat);
    rail.position.set(0, 1.64, rz);
    scene.add(rail);
  }

  // 2. Finger Piers + 6 WALK-IN OPEN-INTERIOR Engineering Halls + Water Berth Beacons
  let faroDomeScanner: THREE.Object3D | null = null;
  let indoorFaroMiniScan: THREE.Object3D | null = null;

  ENGINEERING_MODULES.forEach((mod) => {
    const isWest = mod.moduleId === 'bmail';
    if (!isWest) {
      const finger = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.65, 4.6), concreteMat);
      finger.position.set(mod.dockPos.x, 0.55, -10.3);
      finger.receiveShadow = true;
      scene.add(finger);
      walkableMeshes.push(finger);

      const fender = new THREE.Mesh(
        new THREE.BoxGeometry(3.32, 0.55, 0.3),
        new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.92 }),
      );
      fender.position.set(mod.dockPos.x, 0.65, -8.0);
      scene.add(fender);
    }

    const { group: hall, roofGroup, faroScanner, indoorMiniScan } = buildWalkInEngineeringHall(
      mod,
      textures,
      curtainMat,
      steelMat,
      seawallMat,
    );
    scene.add(hall);
    roofGroups.set(mod.moduleId, roofGroup);
    if (faroScanner) faroDomeScanner = faroScanner;
    if (indoorMiniScan) indoorFaroMiniScan = indoorMiniScan;

    // Interactive Water Berth Ring Beacon
    const ringGeo = new THREE.RingGeometry(2.4, 2.88, 36);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(mod.dockColor),
      transparent: true,
      opacity: 0.78,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(mod.berthPos.x, 0.08, mod.berthPos.z);
    scene.add(ring);

    const hitProxy = new THREE.Mesh(
      new THREE.CylinderGeometry(3.8, 3.8, 4.4, 12),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    hitProxy.position.set(mod.berthPos.x, 1.6, mod.berthPos.z);
    hitProxy.userData.moduleId = mod.moduleId;
    scene.add(hitProxy);
    clickableProxies.push(hitProxy);
    zoneBeacons.push({ module: mod, ring, hitProxy });
  });

  // 3. Twin Monumental 900-Ton Goliath Gantry Cranes in Rear Yard (zero doorway obstruction!)
  scene.add(buildGoliathCrane(-36.0, 1.61, -35.8, 0xc2410c, textures.craneBannerOrange, aviationRedMat));
  scene.add(buildGoliathCrane(36.0, 1.61, -35.8, 0x0369a1, textures.craneBannerBlue, aviationRedMat));

  // 4. Hero Centerpiece: 52m 174,000 m³ LNG Carrier ("H1042 SEASTAR") at East Outfitting Quay
  const heroLng = buildHeroLngCarrier(textures, aviationRedMat, navGreenMat, bridgeGlowMat);
  scene.add(heroLng.group);

  // 5. Instanced Weathered Shipping Containers on Rear Staging Yard & East Pier
  const containerGeo = new THREE.BoxGeometry(2.5, 2.6, 6.2);
  const containerMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    bumpMap: textures.containerRib,
    bumpScale: 0.09,
    roughness: 0.62,
    metalness: 0.36,
  });
  const containerSpecs: Array<{ x: number; y: number; z: number; rot: number; hex: number }> = [
    { x: -63, y: 2.9, z: -37.5, rot: 0, hex: 0xb91c1c },
    { x: -60, y: 2.9, z: -37.5, rot: 0, hex: 0x0369a1 },
    { x: -63, y: 5.52, z: -37.5, rot: 0.02, hex: 0xd97706 },
    { x: -57, y: 2.9, z: -37.5, rot: 0, hex: 0x0f766e },
    { x: -14, y: 2.9, z: -38.0, rot: Math.PI / 2, hex: 0x1d4ed8 },
    { x: -14, y: 5.52, z: -38.0, rot: Math.PI / 2, hex: 0xb91c1c },
    { x: 14, y: 2.9, z: -38.0, rot: Math.PI / 2, hex: 0x047857 },
    { x: 14, y: 5.52, z: -38.0, rot: Math.PI / 2, hex: 0xc2410c },
    { x: 77.5, y: 2.9, z: -3.5, rot: 0, hex: 0x0369a1 },
    { x: 77.5, y: 2.9, z: 3.2, rot: 0, hex: 0xb91c1c },
    { x: 77.5, y: 5.52, z: 3.2, rot: 0, hex: 0xd97706 },
    { x: 77.5, y: 2.9, z: 16.5, rot: 0, hex: 0x0f766e },
    { x: 77.5, y: 2.9, z: 23.5, rot: 0, hex: 0x1d4ed8 },
  ];
  const dummy = new THREE.Object3D();
  const cTmp = new THREE.Color();
  const containers = new THREE.InstancedMesh(containerGeo, containerMat, containerSpecs.length);
  containers.castShadow = true;
  containers.receiveShadow = true;
  containerSpecs.forEach((cs, idx) => {
    dummy.position.set(cs.x, cs.y, cs.z);
    dummy.rotation.set(0, cs.rot, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    containers.setMatrixAt(idx, dummy.matrix);
    cTmp.setHex(cs.hex);
    containers.setColorAt(idx, cTmp);
  });
  containers.instanceMatrix.needsUpdate = true;
  if (containers.instanceColor) containers.instanceColor.needsUpdate = true;
  containers.computeBoundingSphere();
  scene.add(containers);

  // 6. Shipyard Tall Floodlight Towers along Expanded Quay & Piers
  const floodHeadMat = new THREE.MeshStandardMaterial({
    color: 0xfffbeb,
    emissive: 0xfef3c7,
    emissiveIntensity: 1.8,
    roughness: 0.2,
  });
  floodlightMaterials.push(floodHeadMat);
  const towerPositions: Array<[number, number]> = [
    [-68, -32],
    [-12, -32.5],
    [12, -32.5],
    [60, -32],
    [79.5, 32],
    [-71.5, 20],
  ];
  towerPositions.forEach(([tx, tz]) => {
    const tower = new THREE.Group();
    tower.position.set(tx, 1.61, tz);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.38, 17.5, 8), steelMat);
    pole.position.y = 8.75;
    pole.castShadow = true;
    tower.add(pole);
    const crossbar = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.34, 0.55), steelMat);
    crossbar.position.y = 17.4;
    tower.add(crossbar);
    const lampBank = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.68, 0.3), floodHeadMat);
    lampBank.position.set(0, 17.35, 0.34);
    lampBank.rotation.x = 0.28;
    tower.add(lampBank);
    scene.add(tower);
  });

  // 7. Instanced Yellow Mooring Bollards along 120m Waterfront Promenade
  const bollardGeo = new THREE.CylinderGeometry(0.2, 0.26, 0.6, 10);
  const bollardMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.45, metalness: 0.42 });
  const bollards = new THREE.InstancedMesh(bollardGeo, bollardMat, 36);
  for (let i = 0; i < 36; i++) {
    dummy.position.set(-52 + i * 3.35, 1.9, -12.6);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    bollards.setMatrixAt(i, dummy.matrix);
  }
  bollards.instanceMatrix.needsUpdate = true;
  bollards.computeBoundingSphere();
  scene.add(bollards);

  // 8. Floating Channel Navigation Buoys across the Expanded Harbor Basin
  const buoyCoords: Array<{ x: number; z: number; isPort: boolean }> = [
    { x: -38, z: 34, isPort: true },
    { x: -16, z: 38, isPort: true },
    { x: 16, z: 38, isPort: false },
    { x: 38, z: 34, isPort: false },
  ];
  buoyCoords.forEach((bc, idx) => {
    const bg = new THREE.Group();
    bg.position.set(bc.x, 0.1, bc.z);
    const bodyColor = bc.isPort ? 0xdc2626 : 0x16a34a;
    const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.45, metalness: 0.25 });
    const floatBase = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.7, 12), bodyMat);
    floatBase.position.y = 0.25;
    bg.add(floatBase);
    const cage = new THREE.Mesh(new THREE.ConeGeometry(0.68, 1.7, 6, 1, true), bodyMat);
    cage.position.y = 1.35;
    bg.add(cage);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 8), bc.isPort ? aviationRedMat : navGreenMat);
    lamp.position.y = 2.3;
    bg.add(lamp);
    scene.add(bg);
    buoys.push({ group: bg, baseY: 0.08, phase: idx * 1.45 });
  });

  // 9. Sculpted Coastal Headland & Striped Maritime Lighthouse (East Channel Entrance at 64, 44)
  const lhGroup = new THREE.Group();
  lhGroup.position.set(64, 0, 44);
  const rockBase = new THREE.Mesh(
    new THREE.DodecahedronGeometry(7.2, 1),
    new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.92, metalness: 0.04, flatShading: true }),
  );
  rockBase.scale.set(1.25, 0.44, 1.15);
  rockBase.position.y = 0.4;
  rockBase.receiveShadow = true;
  lhGroup.add(rockBase);

  const lhWhite = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.55, metalness: 0.08 });
  const lhRed = new THREE.MeshStandardMaterial({ color: 0xc81e1e, roughness: 0.5, metalness: 0.12 });
  const b1 = new THREE.Mesh(new THREE.CylinderGeometry(1.65, 2.15, 4.0, 18), lhWhite);
  b1.position.y = 3.4;
  b1.castShadow = true;
  lhGroup.add(b1);
  const b2 = new THREE.Mesh(new THREE.CylinderGeometry(1.38, 1.65, 3.4, 18), lhRed);
  b2.position.y = 7.1;
  b2.castShadow = true;
  lhGroup.add(b2);
  const b3 = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.38, 3.0, 18), lhWhite);
  b3.position.y = 10.3;
  b3.castShadow = true;
  lhGroup.add(b3);

  const gallery = new THREE.Mesh(new THREE.CylinderGeometry(1.65, 1.52, 0.42, 18), steelMat);
  gallery.position.y = 12.0;
  lhGroup.add(gallery);
  const lantern = new THREE.Mesh(
    new THREE.CylinderGeometry(0.98, 0.98, 1.5, 14),
    new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xfacc15, emissiveIntensity: 2.4, roughness: 0.12 }),
  );
  lantern.position.y = 12.95;
  lhGroup.add(lantern);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.32, 1.4, 18), lhRed);
  roof.position.y = 14.35;
  lhGroup.add(roof);

  const beamPivot = new THREE.Group();
  beamPivot.position.y = 12.95;
  const beamCone = new THREE.Mesh(
    new THREE.ConeGeometry(3.2, 26, 16, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  beamCone.rotation.z = Math.PI / 2;
  beamCone.position.x = 13.2;
  beamPivot.add(beamCone);
  lhGroup.add(beamPivot);
  scene.add(lhGroup);

  // 10. Smooth Organic Rolling Korean Coastal Hills framing the Distant Horizon (zero pointy cones!)
  const ridgeGeo = new THREE.SphereGeometry(1, 20, 14);
  const ridgeMat = new THREE.MeshStandardMaterial({
    color: 0x45627c,
    roughness: 0.96,
    metalness: 0.02,
  });
  const ridgeSpecs = [
    { x: -170, z: -158, sx: 82, sy: 22, sz: 42 },
    { x: -85, z: -178, sx: 96, sy: 28, sz: 46 },
    { x: 12, z: -186, sx: 105, sy: 24, sz: 48 },
    { x: 108, z: -172, sx: 92, sy: 30, sz: 44 },
    { x: 185, z: -130, sx: 76, sy: 20, sz: 40 },
    { x: -195, z: -82, sx: 72, sy: 18, sz: 44 },
    { x: -35, z: -162, sx: 68, sy: 16, sz: 34 },
    { x: 64, z: -156, sx: 70, sy: 17, sz: 34 },
  ];
  const ridges = new THREE.InstancedMesh(ridgeGeo, ridgeMat, ridgeSpecs.length);
  ridgeSpecs.forEach((rs, idx) => {
    dummy.position.set(rs.x, -4.5, rs.z);
    dummy.rotation.set(0, idx * 0.42, 0);
    dummy.scale.set(rs.sx, rs.sy, rs.sz);
    dummy.updateMatrix();
    ridges.setMatrixAt(idx, dummy.matrix);
  });
  ridges.instanceMatrix.needsUpdate = true;
  ridges.computeBoundingSphere();
  scene.add(ridges);

  // 11. Coastal Basalt Breakwater Rocks beyond West & East Quays
  const rockGeo = new THREE.DodecahedronGeometry(2.5, 1);
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.92,
    metalness: 0.04,
    flatShading: true,
  });
  const rockClusters: Array<{ x: number; z: number; s: number }> = [];
  for (let i = 0; i < 16; i++) {
    const t = i / 15;
    rockClusters.push({
      x: -84 - Math.sin(t * Math.PI) * 7,
      z: -46 + t * 88,
      s: 0.95 + ((i * 19) % 10) * 0.08,
    });
  }
  for (let i = 0; i < 14; i++) {
    const t = i / 13;
    rockClusters.push({
      x: 92 + Math.sin(t * Math.PI) * 6,
      z: -44 + t * 90,
      s: 0.95 + ((i * 13) % 10) * 0.08,
    });
  }
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockClusters.length);
  rocks.receiveShadow = true;
  rockClusters.forEach((rc, idx) => {
    dummy.position.set(rc.x, rc.s * 0.48 - 0.5, rc.z);
    dummy.rotation.set((idx * 0.4) % 3, (idx * 1.1) % 6, 0);
    dummy.scale.set(rc.s * 1.35, rc.s * 0.88, rc.s * 1.18);
    dummy.updateMatrix();
    rocks.setMatrixAt(idx, dummy.matrix);
    const shade = 0.095 + ((idx * 17) % 10) * 0.01;
    cTmp.setRGB(shade, shade * 1.05, shade * 1.14);
    rocks.setColorAt(idx, cTmp);
  });
  rocks.instanceMatrix.needsUpdate = true;
  if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;
  rocks.computeBoundingSphere();
  scene.add(rocks);

  // 12. High-Altitude Soft Drifting Coastal Clouds
  const cloudCoords = [
    { x: -95, y: 56, z: -120, sx: 46, sy: 20, speed: 0.55 },
    { x: -12, y: 64, z: -135, sx: 58, sy: 22, speed: 0.42 },
    { x: 78, y: 58, z: -122, sx: 50, sy: 20, speed: 0.5 },
    { x: 148, y: 52, z: -92, sx: 42, sy: 18, speed: 0.62 },
  ];
  cloudCoords.forEach((cc) => {
    const mat = new THREE.SpriteMaterial({
      map: textures.cloudPuff,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });
    const sp = new THREE.Sprite(mat);
    sp.position.set(cc.x, cc.y, cc.z);
    sp.scale.set(cc.sx, cc.sy, 1);
    scene.add(sp);
    clouds.push({ sprite: sp, speed: cc.speed, baseX: cc.x });
  });

  // Track smooth roof cutaway lift animation per building
  const roofLift = new Map<ModuleId, number>();
  ENGINEERING_MODULES.forEach((m) => roofLift.set(m.moduleId, 0));

  return {
    zoneBeacons,
    clickableProxies,
    walkableMeshes,
    roofGroups,
    lighthouseBeam: beamPivot,
    faroDomeScanner,
    indoorFaroMiniScan,
    weldingSparks: heroLng.sparks,
    weldingLight: heroLng.sparkLight,
    buoys,
    clouds,
    floodlightMaterials,
    update: (dt: number, elapsed: number, isNight: boolean, insideModuleId: ModuleId | null) => {
      beamPivot.rotation.y += dt * 0.58;
      if (faroDomeScanner) faroDomeScanner.rotation.y += dt * 1.15;
      if (indoorFaroMiniScan) indoorFaroMiniScan.rotation.y += dt * 0.9;

      // Smooth RPG Roof Cutaway when the player steps inside any of the 6 buildings!
      roofGroups.forEach((rg, modId) => {
        const target = insideModuleId === modId ? 1 : 0;
        const prev = roofLift.get(modId) ?? 0;
        const next = THREE.MathUtils.damp(prev, target, 9.5, dt);
        roofLift.set(modId, next);
        rg.visible = next < 0.78;
        rg.position.y = next * 4.5;
      });

      // Gently animate navigation buoys on ocean swells
      for (let i = 0; i < buoys.length; i++) {
        const b = buoys[i];
        b.group.position.y = b.baseY + Math.sin(elapsed * 2.1 + b.phase) * 0.12;
        b.group.rotation.z = Math.sin(elapsed * 1.6 + b.phase) * 0.08;
        b.group.rotation.x = Math.cos(elapsed * 1.4 + b.phase) * 0.06;
      }

      // Drift clouds slowly across sky horizon
      for (let i = 0; i < clouds.length; i++) {
        const cl = clouds[i];
        cl.sprite.position.x = ((cl.baseX + elapsed * cl.speed + 200) % 400) - 200;
      }

      // Flicker shipyard welding arc light & spark shower on Hero LNG Carrier bow
      const flicker = Math.sin(elapsed * 27) * Math.sin(elapsed * 43);
      const activeArc = flicker > 0.15;
      heroLng.sparkLight.intensity = activeArc ? (isNight ? 4.4 : 1.7) : 0.12;
      const posAttr = heroLng.sparks.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < posAttr.count; i++) {
        let sy = posAttr.getY(i) - dt * (1.8 + (i % 5) * 0.35);
        if (sy < -0.4) sy = 1.75 + (i % 4) * 0.18;
        posAttr.setY(i, sy);
      }
      posAttr.needsUpdate = true;

      // Boost architectural glass & floodlight glow in night shipyard mode
      curtainMat.emissiveIntensity = isNight ? 1.85 : 0.52;
      floodHeadMat.emissiveIntensity = isNight ? 3.2 : 1.4;
      bridgeGlowMat.emissiveIntensity = isNight ? 2.4 : 1.1;

      // Pulse dock beacons smoothly
      for (let i = 0; i < zoneBeacons.length; i++) {
        const s = 1 + Math.sin(elapsed * 2.2 + i) * 0.045;
        zoneBeacons[i].ring.scale.set(s, s, 1);
      }
    },
  };
}
