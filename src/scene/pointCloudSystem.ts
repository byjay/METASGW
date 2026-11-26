import * as THREE from 'three';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';

export type PointCloudColorMode = 'elevation' | 'intensity' | 'classification';

export interface NativePointCloudSystem {
  group: THREE.Group;
  pointCount: number;
  sourceLabel: string;
  setColorMode: (mode: PointCloudColorMode) => void;
  loadFromFile: (file: File) => Promise<{ pointCount: number; sourceLabel: string }>;
  update: (dt: number, elapsed: number) => void;
  dispose: () => void;
}

/**
 * Generates a high-density 14,000-point 3D LiDAR scan of a 174K LNG Carrier Bow,
 * Mark-III Cryogenic Cargo Tanks, Main Deck Piping Rack, and Hull Ribs.
 */
function buildProceduralLngLidarBuffers(): {
  positions: Float32Array;
  elevations: Float32Array;
  intensities: Float32Array;
  classes: Uint8Array; // 0: Hull Steel, 1: LNG Dome, 2: Cryo Pipe, 3: Deck/Superstructure
} {
  const count = 14000;
  const positions = new Float32Array(count * 3);
  const elevations = new Float32Array(count);
  const intensities = new Float32Array(count);
  const classes = new Uint8Array(count);

  let idx = 0;
  let seed = 9001;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  // 1. Sculpted Hull Shell & Frame Ribs (8,200 points)
  const hullPts = 8200;
  for (let i = 0; i < hullPts && idx < count; i++, idx++) {
    const u = (i % 164) / 163 - 0.5; // -0.5 .. +0.5 along ship length (X)
    const v = Math.floor(i / 164) / 49; // 0 .. 1 cross-section angle
    const ang = v * Math.PI; // bottom U-hull to deck edge
    const bowTaper = u > 0.15 ? Math.max(0.06, 1 - Math.pow((u - 0.15) / 0.35, 1.8)) : 1.0;
    const sternTaper = u < -0.35 ? Math.max(0.55, 1 - Math.pow((-0.35 - u) / 0.18, 1.6)) : 1.0;
    const beam = 1.95 * bowTaper * sternTaper;

    const px = u * 9.8 + (rand() - 0.5) * 0.03;
    const py = -Math.sin(ang) * 1.25 + 0.15 + (rand() - 0.5) * 0.03;
    const pz = Math.cos(ang) * beam + (rand() - 0.5) * 0.03;

    positions[idx * 3] = px;
    positions[idx * 3 + 1] = py;
    positions[idx * 3 + 2] = pz;
    elevations[idx] = (py + 1.3) / 3.8;
    intensities[idx] = 0.45 + Math.abs(Math.sin(u * 38)) * 0.45; // Weld rib reflectivity
    classes[idx] = 0;
  }

  // 2. Three Raised LNG Cargo Domes (3,200 points)
  const domeCenters = [-2.1, 0.15, 2.35];
  for (let d = 0; d < domeCenters.length; d++) {
    const cx = domeCenters[d];
    for (let i = 0; i < 1060 && idx < count; i++, idx++) {
      const phi = Math.acos(1 - rand() * 0.85);
      const theta = rand() * Math.PI * 2;
      const r = 0.92;
      const px = cx + Math.sin(phi) * Math.cos(theta) * r;
      const py = 0.35 + Math.cos(phi) * r * 0.88;
      const pz = Math.sin(phi) * Math.sin(theta) * r;

      positions[idx * 3] = px;
      positions[idx * 3 + 1] = py;
      positions[idx * 3 + 2] = pz;
      elevations[idx] = (py + 1.3) / 3.8;
      intensities[idx] = 0.78 + rand() * 0.22;
      classes[idx] = 1;
    }
  }

  // 3. Cryogenic Deck Piping Spine & Manifold (1,400 points)
  for (let i = 0; i < 1400 && idx < count; i++, idx++) {
    const px = -3.4 + rand() * 7.2;
    const py = 1.25 + (rand() - 0.5) * 0.18;
    const pz = (rand() - 0.5) * 0.45;
    positions[idx * 3] = px;
    positions[idx * 3 + 1] = py;
    positions[idx * 3 + 2] = pz;
    elevations[idx] = (py + 1.3) / 3.8;
    intensities[idx] = 0.92;
    classes[idx] = 2;
  }

  // 4. Aft Superstructure Bridge Tower (remaining points)
  while (idx < count) {
    const px = -4.3 + rand() * 1.3;
    const py = 0.25 + rand() * 2.1;
    const pz = (rand() - 0.5) * 2.4;
    positions[idx * 3] = px;
    positions[idx * 3 + 1] = py;
    positions[idx * 3 + 2] = pz;
    elevations[idx] = (py + 1.3) / 3.8;
    intensities[idx] = 0.65 + rand() * 0.25;
    classes[idx] = 3;
    idx++;
  }

  return { positions, elevations, intensities, classes };
}

function applyPointCloudColors(
  colorAttr: THREE.BufferAttribute,
  elevations: Float32Array,
  intensities: Float32Array,
  classes: Uint8Array,
  mode: PointCloudColorMode,
): void {
  const c = new THREE.Color();
  const count = elevations.length;
  for (let i = 0; i < count; i++) {
    if (mode === 'elevation') {
      // Viridis/Cyan-Gold Engineering Elevation Ramp
      const h = THREE.MathUtils.clamp(0.66 - elevations[i] * 0.52, 0.08, 0.68);
      c.setHSL(h, 0.94, 0.54);
    } else if (mode === 'intensity') {
      // Laser Return Intensity (Deep Blue -> Cyan -> Bright White-Gold)
      const v = THREE.MathUtils.clamp(intensities[i], 0.1, 1.0);
      c.setHSL(0.54 - v * 0.12, 0.85, 0.25 + v * 0.62);
    } else {
      // Semantic Equipment Classification (ASPRS-style Naval CAD classes)
      const cls = classes[i];
      if (cls === 0) c.setHex(0x38bdf8); // Hull Steel (Sky)
      else if (cls === 1) c.setHex(0x34d399); // LNG Cryo Dome (Emerald)
      else if (cls === 2) c.setHex(0xfbbf24); // Cryogenic Piping (Amber)
      else c.setHex(0xf472b6); // Bridge Superstructure (Rose)
    }
    colorAttr.setXYZ(i, c.r, c.g, c.b);
  }
  colorAttr.needsUpdate = true;
}

export function createNativeFaroPointCloud(scene: THREE.Scene): NativePointCloudSystem {
  const group = new THREE.Group();
  // Positioned prominently above the 2X expanded FARO 360 Walk-In Hall
  group.position.set(0, 10.2, -25.5);
  scene.add(group);

  let data = buildProceduralLngLidarBuffers();
  let currentMode: PointCloudColorMode = 'elevation';
  let sourceLabel = 'H1042_LNG_Bow_Scan.e57 (14,000 pts)';

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
  const colorAttr = new THREE.BufferAttribute(new Float32Array(data.elevations.length * 3), 3);
  geo.setAttribute('color', colorAttr);
  applyPointCloudColors(colorAttr, data.elevations, data.intensities, data.classes, currentMode);

  const mat = new THREE.PointsMaterial({
    size: 0.13,
    vertexColors: true,
    transparent: true,
    opacity: 0.94,
    sizeAttenuation: true,
  });

  let pointsMesh = new THREE.Points(geo, mat);
  group.add(pointsMesh);

  // Engineering Wireframe Bounding Cage + Animated Laser Scan Sweep Plane
  const cage = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(10.6, 3.8, 4.4)),
    new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.38 }),
  );
  cage.position.y = 0.55;
  group.add(cage);

  const sweepPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(4.4, 3.8),
    new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  sweepPlane.rotation.y = Math.PI / 2;
  sweepPlane.position.y = 0.55;
  group.add(sweepPlane);

  const rebuildFromRawPositions = (rawPos: Float32Array, label: string) => {
    const n = Math.floor(rawPos.length / 3);
    if (n === 0) return;

    // Normalize loaded point cloud into a 9m wide hologram centered cleanly inside the cage
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < n; i++) {
      const x = rawPos[i * 3];
      const y = rawPos[i * 3 + 1];
      const z = rawPos[i * 3 + 2];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    const cx = (minX + maxX) * 0.5;
    const cy = (minY + maxY) * 0.5;
    const cz = (minZ + maxZ) * 0.5;
    const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 0.001);
    const scale = 8.4 / span;

    const normPos = new Float32Array(n * 3);
    const elev = new Float32Array(n);
    const inten = new Float32Array(n);
    const cls = new Uint8Array(n);
    const spanY = Math.max(maxY - minY, 0.001);

    for (let i = 0; i < n; i++) {
      const nx = (rawPos[i * 3] - cx) * scale;
      const ny = (rawPos[i * 3 + 1] - cy) * scale + 0.5;
      const nz = (rawPos[i * 3 + 2] - cz) * scale;
      normPos[i * 3] = nx;
      normPos[i * 3 + 1] = ny;
      normPos[i * 3 + 2] = nz;
      elev[i] = (rawPos[i * 3 + 1] - minY) / spanY;
      inten[i] = 0.5 + 0.5 * Math.sin(nx * 2 + nz * 2);
      cls[i] = elev[i] > 0.72 ? 3 : elev[i] > 0.45 ? 1 : 0;
    }

    data = { positions: normPos, elevations: elev, intensities: inten, classes: cls };
    sourceLabel = `${label} (${n.toLocaleString()} pts)`;

    pointsMesh.geometry.dispose();
    const nextGeo = new THREE.BufferGeometry();
    nextGeo.setAttribute('position', new THREE.BufferAttribute(normPos, 3));
    const nextColor = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    nextGeo.setAttribute('color', nextColor);
    applyPointCloudColors(nextColor, elev, inten, cls, currentMode);
    pointsMesh.geometry = nextGeo;
  };

  return {
    group,
    get pointCount() {
      return data.elevations.length;
    },
    get sourceLabel() {
      return sourceLabel;
    },
    setColorMode: (mode: PointCloudColorMode) => {
      currentMode = mode;
      const attr = pointsMesh.geometry.getAttribute('color') as THREE.BufferAttribute;
      applyPointCloudColors(attr, data.elevations, data.intensities, data.classes, mode);
    },
    loadFromFile: async (file: File) => {
      const ext = file.name.toLowerCase().split('.').pop() || '';
      if (ext === 'ply') {
        const buffer = await file.arrayBuffer();
        const loader = new PLYLoader();
        const parsedGeo = loader.parse(buffer);
        const posAttr = parsedGeo.getAttribute('position');
        if (posAttr) {
          rebuildFromRawPositions(new Float32Array(posAttr.array as ArrayLike<number>), file.name);
        }
        parsedGeo.dispose();
      } else {
        // Parse ASCII .xyz / .pts / .txt point clouds (up to 60,000 points for crisp 60fps)
        const text = await file.text();
        const lines = text.split(/\r?\n/);
        const coords: number[] = [];
        const step = Math.max(1, Math.floor(lines.length / 60000));
        for (let i = 0; i < lines.length; i += step) {
          const parts = lines[i].trim().split(/[\s,;]+/);
          if (parts.length >= 3) {
            const x = Number(parts[0]);
            const y = Number(parts[1]);
            const z = Number(parts[2]);
            if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
              coords.push(x, y, z);
            }
          }
        }
        if (coords.length >= 9) {
          rebuildFromRawPositions(new Float32Array(coords), file.name);
        }
      }
      return { pointCount: data.elevations.length, sourceLabel };
    },
    update: (dt: number, elapsed: number) => {
      group.rotation.y += dt * 0.22;
      sweepPlane.position.x = Math.sin(elapsed * 0.9) * 4.9;
    },
    dispose: () => {
      pointsMesh.geometry.dispose();
      mat.dispose();
      cage.geometry.dispose();
      (cage.material as THREE.Material).dispose();
      sweepPlane.geometry.dispose();
      (sweepPlane.material as THREE.Material).dispose();
    },
  };
}
