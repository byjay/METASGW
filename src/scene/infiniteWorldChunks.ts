import * as THREE from 'three';
import {
  buildProjectVessel3D,
  disposeObjectTree,
  type VesselSilhouetteId,
} from './projectVesselTypes';
import type { HarborTexturePack } from './textures';

export const CHUNK_SIZE = 200;
export const CHUNK_LOAD_RADIUS = 1; // 3x3 = 9 active chunks around camera target

export interface ChunkCoord {
  cx: number;
  cz: number;
}

/**
 * Deterministic seeded PRNG (Mulberry32) so every infinite world chunk `(cx, cz)`
 * always generates identical coastline piers, cranes, warehouses, lighthouses, and ships.
 */
export function createChunkPrng(cx: number, cz: number): () => number {
  let seed = ((cx * 73856093) ^ (cz * 19349663) ^ 0x5f3759df) >>> 0;
  return () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function worldToChunkCoord(worldX: number, worldZ: number): ChunkCoord {
  return {
    cx: Math.round(worldX / CHUNK_SIZE),
    cz: Math.round(worldZ / CHUNK_SIZE),
  };
}

export function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

/**
 * Computes the exact 3x3 grid of chunk keys centered on `(centerCx, centerCz)`.
 */
export function computeDesiredChunkCoords(
  centerCx: number,
  centerCz: number,
  radius = CHUNK_LOAD_RADIUS,
): ChunkCoord[] {
  const out: ChunkCoord[] = [];
  for (let dz = -radius; dz <= radius; dz += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      out.push({ cx: centerCx + dx, cz: centerCz + dz });
    }
  }
  return out;
}

const COASTAL_VESSEL_POOL: readonly VesselSilhouetteId[] = [
  'container_ship',
  'bulk_carrier',
  'vlcc_tanker',
  'lng_carrier',
  'roro_car_carrier',
  'fpso_offshore',
  'wtiv_jackup',
];

const CHANNEL_VESSEL_POOL: readonly VesselSilhouetteId[] = [
  'bulk_carrier',
  'container_ship',
  'cruise_liner',
  'icebreaker_research',
  'harbor_tug',
];

interface ActiveChunkEntry {
  key: string;
  cx: number;
  cz: number;
  kind: 'home' | 'coast' | 'sea' | 'inland';
  group: THREE.Group;
  floatingVessels: Array<{ obj: THREE.Object3D; phase: number; baseY: number }>;
}

/**
 * Infinite Chunked World Streamer (Requirement #11 & #9):
 *   - Dynamically creates/reuses 200×200m tiles in a 3×3 neighborhood around the camera target.
 *   - Evicts and disposes distant chunks so panning 2,000m+ away keeps GPU memory & draw calls flat.
 *   - Home Harbor `(0, 0)` is reserved for `shipyardWorld.ts`; adjacent coastline chunks `(cx != 0, cz === 0)`
 *     seamlessly extend the concrete quay, warehouses, container yards, cranes, lighthouses, buoys,
 *     and decorative moored vessels along an endless deterministic shoreline.
 */
export class InfiniteWorldChunkManager {
  private root = new THREE.Group();
  private active = new Map<string, ActiveChunkEntry>();
  private pool: Record<'coast' | 'sea' | 'inland', ActiveChunkEntry[]> = {
    coast: [],
    sea: [],
    inland: [],
  };
  private maxPoolPerKind = 2;
  private textures: HarborTexturePack;
  private bridgeGlowMat: THREE.MeshStandardMaterial;
  private lastCenterKey = '';
  private lowSpec = false;

  public disposedChunkCount = 0;
  public reusedChunkCount = 0;
  public createdChunkCount = 0;

  constructor(
    scene: THREE.Scene,
    textures: HarborTexturePack,
    bridgeGlowMat: THREE.MeshStandardMaterial,
  ) {
    this.textures = textures;
    this.bridgeGlowMat = bridgeGlowMat;
    this.root.name = 'InfiniteHarborChunks';
    scene.add(this.root);
  }

  public get activeChunkCount(): number {
    return this.active.size;
  }

  public getActiveKeys(): string[] {
    return Array.from(this.active.keys());
  }

  public setLowSpec(lowSpec: boolean): void {
    this.lowSpec = lowSpec;
    this.active.forEach((entry) => {
      entry.group.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = !lowSpec;
          mesh.receiveShadow = !lowSpec;
        }
      });
    });
  }

  public update(cameraTargetX: number, cameraTargetZ: number, elapsed: number): void {
    const center = worldToChunkCoord(cameraTargetX, cameraTargetZ);
    const cKey = chunkKey(center.cx, center.cz);

    if (cKey !== this.lastCenterKey) {
      this.lastCenterKey = cKey;
      const desired = computeDesiredChunkCoords(center.cx, center.cz, CHUNK_LOAD_RADIUS);
      const desiredKeys = new Set(desired.map((c) => chunkKey(c.cx, c.cz)));

      // 1. Evict chunks outside 3x3 window (return to tiny pool or dispose cleanly!)
      for (const [k, entry] of Array.from(this.active.entries())) {
        if (!desiredKeys.has(k)) {
          this.root.remove(entry.group);
          this.active.delete(k);

          if (entry.kind === 'home') {
            disposeObjectTree(entry.group);
            this.disposedChunkCount += 1;
          } else if (this.pool[entry.kind].length < this.maxPoolPerKind) {
            entry.group.visible = false;
            this.pool[entry.kind].push(entry);
          } else {
            disposeObjectTree(entry.group);
            this.disposedChunkCount += 1;
          }
        }
      }

      // 2. Mount missing chunks inside 3x3 window
      for (const coord of desired) {
        const k = chunkKey(coord.cx, coord.cz);
        if (this.active.has(k)) continue;
        const entry = this.acquireChunk(coord.cx, coord.cz);
        this.active.set(k, entry);
        this.root.add(entry.group);
      }
    }

    // Gentle wave heave on decorative chunk vessels
    if (!this.lowSpec) {
      this.active.forEach((entry) => {
        for (const v of entry.floatingVessels) {
          v.obj.position.y = v.baseY + Math.sin(elapsed * 1.05 + v.phase) * 0.14;
          v.obj.rotation.z = Math.sin(elapsed * 0.8 + v.phase) * 0.012;
        }
      });
    }
  }

  private acquireChunk(cx: number, cz: number): ActiveChunkEntry {
    const k = chunkKey(cx, cz);
    if (cx === 0 && cz === 0) {
      // Home Harbor (0, 0) is built by shipyardWorld.ts
      const empty = new THREE.Group();
      empty.name = 'Chunk_0_0_HomeHarbor';
      return { key: k, cx, cz, kind: 'home', group: empty, floatingVessels: [] };
    }

    const kind: 'coast' | 'sea' | 'inland' = cz === 0 ? 'coast' : cz > 0 ? 'sea' : 'inland';
    const pooled = this.pool[kind].pop();
    if (pooled) {
      // For sea & inland chunks, reuse pooled geometry directly by relocating the tile;
      // for coast chunks, rebuild if seed differs so deterministic coastline layout stays exact!
      if (kind !== 'coast') {
        pooled.key = k;
        pooled.cx = cx;
        pooled.cz = cz;
        pooled.group.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
        pooled.group.visible = true;
        this.reusedChunkCount += 1;
        return pooled;
      }
      disposeObjectTree(pooled.group);
      this.disposedChunkCount += 1;
    }

    this.createdChunkCount += 1;
    if (kind === 'coast') return this.buildCoastChunk(cx, cz);
    if (kind === 'sea') return this.buildSeaChunk(cx, cz);
    return this.buildInlandChunk(cx, cz);
  }

  /**
   * Builds a deterministic coastal shipyard/port chunk at `(cx * 200, 0, 0)` (cz === 0, cx !== 0).
   * Strictly decorative scenery (`isDecorative = true`) — zero business data or labels.
   */
  private buildCoastChunk(cx: number, cz: number): ActiveChunkEntry {
    const rand = createChunkPrng(cx, cz);
    const group = new THREE.Group();
    group.name = `Chunk_Coast_${cx}_${cz}`;
    group.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
    group.userData.isDecorative = true;
    const floatingVessels: Array<{ obj: THREE.Object3D; phase: number; baseY: number }> = [];

    const concreteMat = this.lowSpec
      ? new THREE.MeshLambertMaterial({ color: 0x8d9aa8 })
      : new THREE.MeshStandardMaterial({
          color: 0xa4b0be,
          map: this.textures.concreteAlbedo,
          bumpMap: this.textures.concreteBump,
          bumpScale: 0.08,
          roughness: 0.92,
          metalness: 0.04,
        });
    const seawallMat = new THREE.MeshStandardMaterial({ color: 0x2c3a4c, roughness: 0.9, metalness: 0.08 });
    const hazardMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.textures.hazardTrim,
      roughness: 0.65,
    });
    const warehouseWallMat = new THREE.MeshStandardMaterial({
      color: rand() > 0.5 ? 0x3e5166 : 0x4b5e73,
      roughness: 0.72,
      metalness: 0.22,
    });
    const roofMat = new THREE.MeshStandardMaterial({
      color: rand() > 0.5 ? 0x1e344c : 0x2f3e4f,
      roughness: 0.56,
      metalness: 0.34,
    });
    const cranePaintMat = new THREE.MeshStandardMaterial({
      color: rand() > 0.5 ? 0xb45309 : 0x0369a1,
      roughness: 0.44,
      metalness: 0.42,
    });
    const containerMat = this.lowSpec
      ? new THREE.MeshLambertMaterial({ color: 0xffffff })
      : new THREE.MeshStandardMaterial({
          color: 0xffffff,
          bumpMap: this.textures.containerRibBump,
          bumpScale: 0.09,
          roughness: 0.68,
          metalness: 0.25,
        });

    // 1. Continuous concrete quay slab (200m wide, z in [-96, -2.5])
    const base = new THREE.Mesh(new THREE.BoxGeometry(CHUNK_SIZE, 2.5, 94), seawallMat);
    base.position.set(0, 0.05, -49.5);
    base.receiveShadow = !this.lowSpec;
    group.add(base);

    const deck = new THREE.Mesh(new THREE.BoxGeometry(CHUNK_SIZE, 0.36, 94), concreteMat);
    deck.position.set(0, 1.43, -49.5);
    deck.receiveShadow = !this.lowSpec;
    group.add(deck);

    const trim = new THREE.Mesh(new THREE.BoxGeometry(CHUNK_SIZE, 0.05, 0.55), hazardMat);
    trim.position.set(0, 1.64, -2.75);
    group.add(trim);

    // 2. Industrial Shipyard Warehouses (2 per coastal chunk)
    for (let i = 0; i < 2; i += 1) {
      const wx = -54 + i * 108 + (rand() - 0.5) * 18;
      const wz = -48 - rand() * 14;
      const wLen = 36 + rand() * 16;
      const wDepth = 18 + rand() * 8;
      const wH = 8.5 + rand() * 4.5;

      const hall = new THREE.Mesh(new THREE.BoxGeometry(wLen, wH, wDepth), warehouseWallMat);
      hall.position.set(wx, 1.61 + wH * 0.5, wz);
      hall.castShadow = !this.lowSpec;
      hall.receiveShadow = !this.lowSpec;
      group.add(hall);

      const roof = new THREE.Mesh(new THREE.BoxGeometry(wLen + 1.2, 0.6, wDepth + 1.2), roofMat);
      roof.position.set(wx, 1.61 + wH + 0.3, wz);
      group.add(roof);
    }

    // 3. Instanced Corrugated Container Yard Stacks
    const containerCount = 18;
    const cGeo = new THREE.BoxGeometry(6.2, 2.5, 2.6);
    const cInst = new THREE.InstancedMesh(cGeo, containerMat, containerCount);
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    const palette = [0x1e5c8a, 0x8e3333, 0xb87628, 0x2a6b55, 0x354d6e, 0xa84d25];
    const yardOriginX = (rand() - 0.5) * 50;
    let cIdx = 0;
    for (let row = 0; row < 3; row += 1) {
      for (let colIdx = 0; colIdx < 3; colIdx += 1) {
        for (let tier = 0; tier < 2; tier += 1) {
          dummy.position.set(
            yardOriginX + (colIdx - 1) * 7.4,
            1.61 + 1.25 + tier * 2.52,
            -24 - row * 3.4,
          );
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          cInst.setMatrixAt(cIdx, dummy.matrix);
          col.setHex(palette[Math.floor(rand() * palette.length)]);
          cInst.setColorAt(cIdx, col);
          cIdx += 1;
        }
      }
    }
    cInst.instanceMatrix.needsUpdate = true;
    if (cInst.instanceColor) cInst.instanceColor.needsUpdate = true;
    cInst.computeBoundingSphere();
    group.add(cInst);

    // 4. Coastal Port Crane (STS / Gantry Silhouette)
    const craneX = (rand() - 0.5) * 80;
    const craneGroup = new THREE.Group();
    craneGroup.position.set(craneX, 1.61, -9.5);
    for (const lx of [-4.2, 4.2]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(1.1, 18.5, 1.2), cranePaintMat);
      leg.position.set(lx, 9.25, 0);
      leg.castShadow = !this.lowSpec;
      craneGroup.add(leg);
    }
    const girder = new THREE.Mesh(new THREE.BoxGeometry(12.5, 1.8, 1.8), cranePaintMat);
    girder.position.set(0, 18.8, 0);
    craneGroup.add(girder);
    const boom = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 24.0), cranePaintMat);
    boom.position.set(0, 17.8, 7.2);
    craneGroup.add(boom);
    group.add(craneGroup);

    // 5. Coastal Lighthouse on every 2nd chunk
    if (Math.abs(cx) % 2 === 1) {
      const lhX = cx > 0 ? 78 : -78;
      const lhGroup = new THREE.Group();
      lhGroup.position.set(lhX, 1.61, -6.5);
      const towerMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.52 });
      const redBandMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.48 });
      const lanternMat = new THREE.MeshStandardMaterial({
        color: 0xfef08a,
        emissive: 0xfbbf24,
        emissiveIntensity: 0.75,
      });
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.9, 13.5, 12), towerMat);
      tower.position.y = 6.75;
      lhGroup.add(tower);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(1.36, 1.56, 3.2, 12), redBandMat);
      band.position.y = 7.4;
      lhGroup.add(band);
      const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 1.8, 10), lanternMat);
      lantern.position.y = 14.3;
      lhGroup.add(lantern);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(1.25, 1.6, 10), redBandMat);
      cap.position.y = 16.0;
      lhGroup.add(cap);
      group.add(lhGroup);
    }

    // 6. Moored Decorative Ship (strictly outside Home Harbor Hero wings |cx| >= 2)
    if (Math.abs(cx) >= 2) {
      const shipType = COASTAL_VESSEL_POOL[Math.floor(rand() * COASTAL_VESSEL_POOL.length)];
      const ship = buildProjectVessel3D(shipType, this.textures, this.bridgeGlowMat, this.lowSpec);
      const localX = (rand() - 0.5) * 85;
      const localZ = 24 + rand() * 14;
      ship.position.set(localX, 0.05, localZ);
      ship.rotation.y = rand() > 0.5 ? Math.PI / 2 : -Math.PI / 2;
      ship.scale.setScalar(0.86 + rand() * 0.14);
      ship.userData.isDecorative = true;
      group.add(ship);
      floatingVessels.push({ obj: ship, phase: rand() * Math.PI * 2, baseY: 0.05 });
    }

    // 7. Coastal Channel Navigation Buoy
    const buoy = this.buildNavigationBuoy(rand() > 0.5 ? 0xb91c1c : 0x15803d);
    buoy.position.set((rand() - 0.5) * 120, 0.02, 58 + rand() * 24);
    group.add(buoy);
    floatingVessels.push({ obj: buoy, phase: rand() * Math.PI * 2, baseY: 0.02 });

    return { key: chunkKey(cx, cz), cx, cz, kind: 'coast', group, floatingVessels };
  }

  /**
   * Open-sea infinite chunk (`cz > 0`): channel buoys + occasional distant decorative vessel.
   */
  private buildSeaChunk(cx: number, cz: number): ActiveChunkEntry {
    const rand = createChunkPrng(cx, cz);
    const group = new THREE.Group();
    group.name = `Chunk_Sea_${cx}_${cz}`;
    group.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
    group.userData.isDecorative = true;
    const floatingVessels: Array<{ obj: THREE.Object3D; phase: number; baseY: number }> = [];

    // 2 Navigation channel buoys
    for (let i = 0; i < 2; i += 1) {
      const buoy = this.buildNavigationBuoy(i === 0 ? 0xb91c1c : 0x15803d);
      buoy.position.set((rand() - 0.5) * 140, 0.02, (rand() - 0.5) * 140);
      group.add(buoy);
      floatingVessels.push({ obj: buoy, phase: rand() * Math.PI * 2, baseY: 0.02 });
    }

    // Occasional open-sea decorative ship (keep cz=1, cx=0 clear of Home Harbor approach!)
    if (!(cx === 0 && cz === 1) && rand() > 0.42) {
      const shipType = CHANNEL_VESSEL_POOL[Math.floor(rand() * CHANNEL_VESSEL_POOL.length)];
      const ship = buildProjectVessel3D(shipType, this.textures, this.bridgeGlowMat, this.lowSpec);
      ship.position.set((rand() - 0.5) * 90, 0.05, (rand() - 0.5) * 90);
      ship.rotation.y = rand() * Math.PI * 2;
      ship.scale.setScalar(0.84);
      ship.userData.isDecorative = true;
      group.add(ship);
      floatingVessels.push({ obj: ship, phase: rand() * Math.PI * 2, baseY: 0.05 });
    }

    return { key: chunkKey(cx, cz), cx, cz, kind: 'sea', group, floatingVessels };
  }

  /**
   * Inland rear industrial & coastal terrain chunk (`cz < 0`) so north horizon looks continuous.
   */
  private buildInlandChunk(cx: number, cz: number): ActiveChunkEntry {
    const rand = createChunkPrng(cx, cz);
    const group = new THREE.Group();
    group.name = `Chunk_Inland_${cx}_${cz}`;
    group.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
    group.userData.isDecorative = true;

    const landMat = new THREE.MeshStandardMaterial({
      color: 0x3b4d5e,
      roughness: 0.92,
      metalness: 0.04,
    });
    const hillMat = new THREE.MeshStandardMaterial({
      color: 0x3f5e4d,
      roughness: 0.9,
      metalness: 0.02,
      flatShading: true,
    });

    const ground = new THREE.Mesh(new THREE.BoxGeometry(CHUNK_SIZE, 1.8, CHUNK_SIZE), landMat);
    ground.position.set(0, 0.65, 0);
    group.add(ground);

    // Distant coastal ridges for natural horizon framing (never sharp pyramids or boxed walls)
    for (let i = 0; i < 3; i += 1) {
      const r = 38 + rand() * 26;
      const ridge = new THREE.Mesh(
        new THREE.SphereGeometry(r, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5),
        hillMat,
      );
      ridge.scale.set(1.55 + rand() * 0.4, 0.42 + rand() * 0.14, 0.9);
      ridge.position.set((rand() - 0.5) * 130, -0.5, -20 - rand() * 60);
      ridge.rotation.y = rand() * Math.PI;
      group.add(ridge);
    }

    return { key: chunkKey(cx, cz), cx, cz, kind: 'inland', group, floatingVessels: [] };
  }

  private buildNavigationBuoy(colorHex: number): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.45, metalness: 0.25 });
    const glow = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: colorHex === 0xb91c1c ? 0xf87171 : 0x4ade80,
      emissiveIntensity: 0.65,
    });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.35, 1.0, 10), mat);
    base.position.y = 0.4;
    g.add(base);
    const tower = new THREE.Mesh(new THREE.ConeGeometry(0.65, 2.4, 8), mat);
    tower.position.y = 2.0;
    g.add(tower);
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), glow);
    light.position.y = 3.35;
    g.add(light);
    return g;
  }

  public dispose(): void {
    this.active.forEach((entry) => {
      this.root.remove(entry.group);
      disposeObjectTree(entry.group);
      this.disposedChunkCount += 1;
    });
    this.active.clear();
    for (const kind of ['coast', 'sea', 'inland'] as const) {
      for (const entry of this.pool[kind]) {
        disposeObjectTree(entry.group);
        this.disposedChunkCount += 1;
      }
      this.pool[kind].length = 0;
    }
    this.root.clear();
  }
}
