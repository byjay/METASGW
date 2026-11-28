/**
 * Monumental Rotating Aerial SEASTAR Sky Display (Floating High Above Harbor).
 *
 * Composite multi-part 3D structure (8+ distinct architectural parts):
 *   1) Massive double-sided 2.38:1 panoramic display faces (52m x 21.8m) showing
 *      the SEASTAR — SHIP DESIGN SOLUTIONS banner cleanly right-side-up on BOTH sides.
 *   2) Sculpted brushed-titanium beveled perimeter chassis housing.
 *   3) Upper & lower luminous cyan LED telemetry rails.
 *   4) Twin corner nautical fin stabilizers + crimson navigation beacons.
 *   5) Counter-rotating outer gyroscopic orbital halo ring framing the floating monument.
 *
 * Non-interactive (zero raycast interference with quay/ships/avatars below) and floats
 * well above cranes & portal roofs (center Y = 43m) so sightlines stay 100% clear.
 */

import * as THREE from 'three';

export interface SeastarSkyMonumentRuntime {
  group: THREE.Group;
  rotorGroup: THREE.Group;
  haloGroup: THREE.Group;
  baseY: number;
  width: number;
  height: number;
  update: (dt: number, elapsed: number, reducedMotion: boolean) => void;
  dispose: () => void;
}

export const SEASTAR_MONUMENT_POSITION = Object.freeze({
  x: 0,
  y: 43,
  z: -6,
});

export const SEASTAR_MONUMENT_DIMENSIONS = Object.freeze({
  width: 52,
  height: 21.8,
  depth: 1.5,
  rotationSpeedRadPerSec: 0.42,
  haloCounterSpeedRadPerSec: -0.22,
});

export function buildSeastarSkyMonument(
  bannerTexture: THREE.Texture,
): SeastarSkyMonumentRuntime {
  const { width, height, depth } = SEASTAR_MONUMENT_DIMENSIONS;
  const disposables: Array<{ dispose: () => void }> = [];

  const root = new THREE.Group();
  root.name = 'SeastarAerialSkyMonument';
  root.position.set(
    SEASTAR_MONUMENT_POSITION.x,
    SEASTAR_MONUMENT_POSITION.y,
    SEASTAR_MONUMENT_POSITION.z,
  );

  const rotorGroup = new THREE.Group();
  rotorGroup.name = 'SeastarAerialRotor';
  root.add(rotorGroup);

  // Materials (varied roughness >= 0.25 between metallic chassis, matte dark core, glowing cyan trim, luminous screen)
  const frameMetalMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.26,
    metalness: 0.82,
    fog: false,
  });
  const darkHousingMat = new THREE.MeshStandardMaterial({
    color: 0x061a30,
    roughness: 0.68,
    metalness: 0.35,
    fog: false,
  });
  const cyanRailMat = new THREE.MeshStandardMaterial({
    color: 0x7dd3fc,
    emissive: 0x38bdf8,
    emissiveIntensity: 1.45,
    roughness: 0.22,
    metalness: 0.2,
    fog: false,
  });
  const redBeaconMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0xdc2626,
    emissiveIntensity: 1.6,
    roughness: 0.25,
    metalness: 0.15,
    fog: false,
  });
  // Self-illuminated vivid screen material (color 0xffffff so texture never darkens; fog:false for sky clarity)
  const bannerFaceMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: bannerTexture,
    emissive: new THREE.Color(0xffffff),
    emissiveMap: bannerTexture,
    emissiveIntensity: 0.68,
    roughness: 0.32,
    metalness: 0.08,
    fog: false,
  });

  disposables.push(frameMetalMat, darkHousingMat, cyanRailMat, redBeaconMat, bannerFaceMat);

  // 1) Central armored dark navy backing core
  const coreGeo = new THREE.BoxGeometry(width + 0.9, height + 0.9, depth);
  const coreMesh = new THREE.Mesh(coreGeo, darkHousingMat);
  coreMesh.name = 'seastar_monument_core';
  rotorGroup.add(coreMesh);
  disposables.push(coreGeo);

  // 2) Front & Back Monumental SEASTAR Banner Displays (both oriented left-to-right readable!)
  const faceGeo = new THREE.PlaneGeometry(width, height);
  disposables.push(faceGeo);

  const frontFace = new THREE.Mesh(faceGeo, bannerFaceMat);
  frontFace.name = 'seastar_banner_front';
  frontFace.position.z = depth * 0.5 + 0.06;
  rotorGroup.add(frontFace);

  const backFace = new THREE.Mesh(faceGeo, bannerFaceMat);
  backFace.name = 'seastar_banner_back';
  backFace.position.z = -(depth * 0.5 + 0.06);
  backFace.rotation.y = Math.PI;
  rotorGroup.add(backFace);

  // 3) Brushed Titanium Top & Bottom Structural Beams
  const hBeamGeo = new THREE.BoxGeometry(width + 3.2, 1.15, depth + 0.75);
  disposables.push(hBeamGeo);
  for (const sy of [-1, 1]) {
    const beam = new THREE.Mesh(hBeamGeo, frameMetalMat);
    beam.position.y = sy * (height * 0.5 + 0.85);
    rotorGroup.add(beam);
  }

  // 4) Brushed Titanium Left & Right Vertical Fin Columns
  const vColGeo = new THREE.BoxGeometry(1.15, height + 2.6, depth + 0.75);
  disposables.push(vColGeo);
  for (const sx of [-1, 1]) {
    const col = new THREE.Mesh(vColGeo, frameMetalMat);
    col.position.x = sx * (width * 0.5 + 0.95);
    rotorGroup.add(col);
  }

  // 5) Glowing Cyan Upper & Lower Telemetry Light Bars (front & back)
  const railGeo = new THREE.BoxGeometry(width + 0.6, 0.36, 0.36);
  disposables.push(railGeo);
  for (const sy of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const rail = new THREE.Mesh(railGeo, cyanRailMat);
      rail.position.set(0, sy * (height * 0.5 + 0.42), sz * (depth * 0.5 + 0.32));
      rotorGroup.add(rail);
    }
  }

  // 6) Aerodynamic Corner Stabilizer Wings + Crimson Navigation Beacons
  const wingGeo = new THREE.ConeGeometry(1.1, 3.4, 4);
  const beaconGeo = new THREE.SphereGeometry(0.48, 10, 10);
  disposables.push(wingGeo, beaconGeo);
  for (const sx of [-1, 1]) {
    const wing = new THREE.Mesh(wingGeo, frameMetalMat);
    wing.position.set(sx * (width * 0.5 + 2.4), 0, 0);
    wing.rotation.z = sx * (-Math.PI / 2);
    rotorGroup.add(wing);

    for (const sy of [-1, 1]) {
      const beacon = new THREE.Mesh(beaconGeo, redBeaconMat);
      beacon.position.set(sx * (width * 0.5 + 1.5), sy * (height * 0.5 + 1.45), 0);
      rotorGroup.add(beacon);
    }
  }

  // 7) Top & Bottom Central Gyro Hubs
  const hubGeo = new THREE.CylinderGeometry(2.4, 3.1, 1.4, 16);
  disposables.push(hubGeo);
  const topHub = new THREE.Mesh(hubGeo, frameMetalMat);
  topHub.position.y = height * 0.5 + 1.9;
  rotorGroup.add(topHub);

  const botHub = new THREE.Mesh(hubGeo, frameMetalMat);
  botHub.position.y = -(height * 0.5 + 1.9);
  botHub.rotation.z = Math.PI;
  rotorGroup.add(botHub);

  // 8) Counter-Rotating Outer Orbital Halo Ring (frames the aerial display majestically)
  const haloGroup = new THREE.Group();
  haloGroup.name = 'SeastarAerialHaloRing';
  root.add(haloGroup);

  const haloGeo = new THREE.TorusGeometry(width * 0.56, 0.28, 10, 64);
  const haloMesh = new THREE.Mesh(haloGeo, cyanRailMat);
  haloMesh.rotation.x = Math.PI / 2;
  haloMesh.position.y = -(height * 0.5 + 2.4);
  haloGroup.add(haloMesh);
  disposables.push(haloGeo);

  const upperHaloGeo = new THREE.TorusGeometry(width * 0.42, 0.2, 8, 48);
  const upperHaloMesh = new THREE.Mesh(upperHaloGeo, frameMetalMat);
  upperHaloMesh.rotation.x = Math.PI / 2;
  upperHaloMesh.position.y = height * 0.5 + 2.5;
  haloGroup.add(upperHaloMesh);
  disposables.push(upperHaloGeo);

  // Ensure aerial monument never casts distracting dark shadows over the quay or intercepts raycasts
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = false;
      mesh.receiveShadow = false;
    }
  });

  const baseY = SEASTAR_MONUMENT_POSITION.y;

  return {
    group: root,
    rotorGroup,
    haloGroup,
    baseY,
    width,
    height,
    update: (dt: number, elapsed: number, reducedMotion: boolean) => {
      if (reducedMotion) return;
      const clampedDt = Math.min(Math.max(dt, 0), 0.1);
      rotorGroup.rotation.y =
        (rotorGroup.rotation.y + clampedDt * SEASTAR_MONUMENT_DIMENSIONS.rotationSpeedRadPerSec) %
        (Math.PI * 2);
      haloGroup.rotation.y =
        (haloGroup.rotation.y + clampedDt * SEASTAR_MONUMENT_DIMENSIONS.haloCounterSpeedRadPerSec) %
        (Math.PI * 2);
      root.position.y = baseY + Math.sin(elapsed * 0.7) * 0.7;
    },
    dispose: () => {
      for (const d of disposables) {
        d.dispose();
      }
    },
  };
}
