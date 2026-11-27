import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { RenderBatchMetrics } from './harborSceneTypes';

function prepareBakedGeometry(
  sourceGeo: THREE.BufferGeometry,
  transform: THREE.Matrix4,
  color: THREE.Color,
): THREE.BufferGeometry {
  const cloned = sourceGeo.index ? sourceGeo.toNonIndexed() : sourceGeo.clone();
  cloned.applyMatrix4(transform);

  if (!cloned.getAttribute('normal')) {
    cloned.computeVertexNormals();
  }

  // Normalize attributes strictly to (position, normal, color) so mergeGeometries never mismatches UVs/tangents
  for (const attrName of Object.keys(cloned.attributes)) {
    if (attrName !== 'position' && attrName !== 'normal') {
      cloned.deleteAttribute(attrName);
    }
  }

  const posAttr = cloned.getAttribute('position');
  const count = posAttr.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  cloned.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return cloned;
}

function isMergeableSolidStandardMaterial(mat: THREE.Material): mat is THREE.MeshStandardMaterial {
  if (!(mat instanceof THREE.MeshStandardMaterial)) return false;
  if (mat.map || mat.bumpMap || mat.roughnessMap || mat.metalnessMap || mat.emissiveMap || mat.alphaMap) {
    return false;
  }
  if (mat.transparent || mat.opacity < 1) return false;
  if (mat.emissiveIntensity > 0 && mat.emissive.getHex() !== 0) return false;
  return true;
}

/**
 * Merges all static untextured solid-color MeshStandardMaterial meshes within `root`
 * into a single vertex-colored Mesh to slash GPU Draw Calls without losing any 3D geometry.
 * Leaves InstancedMesh, textured meshes, emissive glass/beacons, and invisible hit proxies untouched.
 */
export function mergeSolidSubtreeToVertexColors(
  root: THREE.Object3D,
  options?: {
    lowSpec?: boolean;
    roughness?: number;
    metalness?: number;
    castShadow?: boolean;
    receiveShadow?: boolean;
  },
): THREE.Mesh | null {
  root.updateMatrixWorld(true);
  const invRoot = root.matrixWorld.clone().invert();
  const candidates: Array<{ mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial }> = [];

  root.traverse((obj) => {
    if (obj === root) return;
    if ((obj as THREE.InstancedMesh).isInstancedMesh) return;
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    if (mesh.userData.isMergedBatch) return;
    if (Array.isArray(mesh.material)) return;
    if (!isMergeableSolidStandardMaterial(mesh.material)) return;
    candidates.push({ mesh, mat: mesh.material });
  });

  if (candidates.length < 2) return null;

  const bakedGeos: THREE.BufferGeometry[] = [];
  const relativeMatrix = new THREE.Matrix4();
  const oldGeos = new Set<THREE.BufferGeometry>();

  for (const { mesh, mat } of candidates) {
    relativeMatrix.multiplyMatrices(invRoot, mesh.matrixWorld);
    bakedGeos.push(prepareBakedGeometry(mesh.geometry, relativeMatrix, mat.color));
    oldGeos.add(mesh.geometry);
    mesh.parent?.remove(mesh);
  }

  const mergedGeo = mergeGeometries(bakedGeos, false);
  bakedGeos.forEach((g) => g.dispose());
  if (!mergedGeo) return null;

  mergedGeo.computeBoundingSphere();

  const mergedMat = options?.lowSpec
    ? new THREE.MeshLambertMaterial({ vertexColors: true })
    : new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: options?.roughness ?? 0.48,
        metalness: options?.metalness ?? 0.2,
      });

  const mergedMesh = new THREE.Mesh(mergedGeo, mergedMat);
  mergedMesh.castShadow = options?.castShadow ?? !options?.lowSpec;
  mergedMesh.receiveShadow = options?.receiveShadow ?? !options?.lowSpec;
  mergedMesh.userData.isMergedBatch = true;
  mergedMesh.userData.mergedSourceCount = candidates.length;
  root.add(mergedMesh);

  // Clean up unreferenced per-part geometries
  oldGeos.forEach((g) => g.dispose());
  return mergedMesh;
}

/**
 * Merges a small list of static avatar sub-parts (already positioned/scaled) into one vertex-colored geometry.
 */
export function mergeColoredParts(
  parts: Array<{
    geometry: THREE.BufferGeometry;
    colorHex: number;
    position?: [number, number, number];
    scale?: [number, number, number];
    rotation?: [number, number, number];
  }>,
): THREE.BufferGeometry {
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const prepared: THREE.BufferGeometry[] = [];

  for (const part of parts) {
    dummy.position.set(...(part.position ?? [0, 0, 0]));
    dummy.scale.set(...(part.scale ?? [1, 1, 1]));
    dummy.rotation.set(...(part.rotation ?? [0, 0, 0]));
    dummy.updateMatrix();
    color.setHex(part.colorHex);
    prepared.push(prepareBakedGeometry(part.geometry, dummy.matrix, color));
  }

  const merged = mergeGeometries(prepared, false);
  prepared.forEach((g) => g.dispose());
  if (!merged) {
    throw new Error('Failed to merge avatar part geometries');
  }
  merged.computeBoundingSphere();
  merged.userData.mergedSourceCount = parts.length;
  return merged;
}

export interface InstancedRingSpec {
  x: number;
  y: number;
  z: number;
  colorHex: number;
  scale?: number;
}

/**
 * Batches multiple ground/water status rings (presence rings, ship rings, boarding markers)
 * into a single InstancedMesh with per-instance color so N rings render in 1 Draw Call.
 */
export function createInstancedRingBatch(
  specs: readonly InstancedRingSpec[],
  options: {
    innerRadius: number;
    outerRadius: number;
    segments?: number;
    opacity?: number;
    polygonOffset?: boolean;
  },
): THREE.InstancedMesh | null {
  if (specs.length === 0) return null;

  const geo = new THREE.RingGeometry(
    options.innerRadius,
    options.outerRadius,
    options.segments ?? 24,
  );
  geo.rotateX(-Math.PI / 2);

  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: options.opacity ?? 0.82,
    side: THREE.DoubleSide,
    depthWrite: false,
    ...(options.polygonOffset
      ? {
          polygonOffset: true,
          polygonOffsetFactor: -3,
          polygonOffsetUnits: -3,
        }
      : {}),
  });

  const inst = new THREE.InstancedMesh(geo, mat, specs.length);
  const dummy = new THREE.Object3D();
  const tmpColor = new THREE.Color();

  specs.forEach((spec, idx) => {
    const sc = spec.scale ?? 1;
    dummy.position.set(spec.x, spec.y, spec.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(sc, 1, sc);
    dummy.updateMatrix();
    inst.setMatrixAt(idx, dummy.matrix);
    tmpColor.setHex(spec.colorHex);
    inst.setColorAt(idx, tmpColor);
  });

  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  inst.computeBoundingSphere();
  return inst;
}

/**
 * Batches multiple NPC contact shadow quads into a single InstancedMesh (N shadows -> 1 Draw Call).
 */
export function createInstancedContactShadowBatch(
  positions: ReadonlyArray<{ x: number; y: number; z: number; scale?: number }>,
  contactShadowTex: THREE.CanvasTexture,
): THREE.InstancedMesh | null {
  if (positions.length === 0) return null;

  const geo = new THREE.PlaneGeometry(1.6, 1.6);
  geo.rotateX(-Math.PI / 2);

  const mat = new THREE.MeshBasicMaterial({
    map: contactShadowTex,
    transparent: true,
    opacity: 0.68,
    depthWrite: false,
  });

  const inst = new THREE.InstancedMesh(geo, mat, positions.length);
  const dummy = new THREE.Object3D();

  positions.forEach((pos, idx) => {
    const sc = pos.scale ?? 1.22;
    dummy.position.set(pos.x, pos.y + 0.03, pos.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(sc, 1, sc);
    dummy.updateMatrix();
    inst.setMatrixAt(idx, dummy.matrix);
  });

  inst.instanceMatrix.needsUpdate = true;
  inst.computeBoundingSphere();
  return inst;
}

/**
 * Collects live Draw Call batching statistics across a Three.js scene graph
 * (InstancedMesh counts/instances + merged static vertex-color meshes + saved draw calls).
 */
export function collectSceneBatchStats(root: THREE.Object3D): RenderBatchMetrics {
  let instancedMeshCount = 0;
  let totalInstances = 0;
  let mergedMeshCount = 0;
  let mergedSourceMeshes = 0;
  let savedDrawCalls = 0;

  root.traverse((obj) => {
    if (!obj.visible) return;
    if ((obj as THREE.InstancedMesh).isInstancedMesh) {
      const inst = obj as THREE.InstancedMesh;
      if (inst.count > 0) {
        instancedMeshCount += 1;
        totalInstances += inst.count;
        savedDrawCalls += Math.max(0, inst.count - 1);
      }
      return;
    }

    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const sourceCount =
      typeof mesh.userData.mergedSourceCount === 'number'
        ? mesh.userData.mergedSourceCount
        : typeof mesh.geometry?.userData?.mergedSourceCount === 'number'
          ? (mesh.geometry.userData.mergedSourceCount as number)
          : 0;
    if (sourceCount > 1) {
      mergedMeshCount += 1;
      mergedSourceMeshes += sourceCount;
      savedDrawCalls += sourceCount - 1;
    }
  });

  return {
    instancedMeshCount,
    totalInstances,
    mergedMeshCount,
    mergedSourceMeshes,
    savedDrawCalls,
  };
}
