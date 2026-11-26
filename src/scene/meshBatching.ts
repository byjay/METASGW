import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

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
  return merged;
}
