import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as THREE from 'three';
import {
  collectSceneBatchStats,
  createInstancedRingBatch,
  mergeColoredParts,
  mergeSolidSubtreeToVertexColors,
} from './meshBatching';

describe('meshBatching: Draw Call batching & renderMetrics statistics', () => {
  it('merges static solid MeshStandardMaterial parts into one vertex-colored mesh and records mergedSourceCount', () => {
    const group = new THREE.Group();
    const solidColors = [0x1e3a5f, 0x334155, 0xf97316, 0x0ea5e9];

    solidColors.forEach((hex, idx) => {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(1, 2, 1),
        new THREE.MeshStandardMaterial({ color: hex, roughness: 0.5 }),
      );
      m.position.set(idx * 2, 0, 0);
      group.add(m);
    });

    // Emissive beacon mesh must NOT be merged
    const emissiveBeacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 8, 8),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0x38bdf8,
        emissiveIntensity: 1.5,
      }),
    );
    group.add(emissiveBeacon);

    const merged = mergeSolidSubtreeToVertexColors(group);
    assert.ok(merged, 'Expected merged mesh to be created');
    assert.equal(merged.userData.isMergedBatch, true);
    assert.equal(merged.userData.mergedSourceCount, 4);
    assert.equal(group.children.length, 2, '4 solid meshes should collapse into 1 + 1 untouched emissive mesh');
    assert.ok(merged.geometry.getAttribute('color'), 'Merged geometry must contain baked vertex colors');

    const stats = collectSceneBatchStats(group);
    assert.equal(stats.mergedMeshCount, 1);
    assert.equal(stats.mergedSourceMeshes, 4);
    assert.equal(stats.savedDrawCalls, 3);
  });

  it('batches N status rings into a single InstancedMesh and aggregates batching stats across the scene', () => {
    const scene = new THREE.Scene();

    const rings = createInstancedRingBatch(
      [
        { x: 0, y: 0.1, z: 0, colorHex: 0x10b981, scale: 1 },
        { x: 4, y: 0.1, z: 0, colorHex: 0x0284c7, scale: 1.2 },
        { x: 8, y: 0.1, z: 0, colorHex: 0xf59e0b, scale: 0.9 },
        { x: 12, y: 0.1, z: 0, colorHex: 0x64748b, scale: 1 },
      ],
      { innerRadius: 0.5, outerRadius: 0.7, opacity: 0.85 },
    );
    assert.ok(rings);
    assert.equal(rings.isInstancedMesh, true);
    assert.equal(rings.count, 4);
    assert.ok(rings.instanceColor, 'Instanced ring batch must populate per-instance color');
    scene.add(rings);

    const avatarPartGeo = mergeColoredParts([
      { geometry: new THREE.BoxGeometry(0.4, 0.6, 0.3), colorHex: 0x1e293b, position: [0, 0.8, 0] },
      { geometry: new THREE.SphereGeometry(0.2, 8, 8), colorHex: 0xfde68a, position: [0, 1.3, 0] },
      { geometry: new THREE.BoxGeometry(0.3, 0.1, 0.3), colorHex: 0xf59e0b, position: [0, 1.48, 0] },
    ]);
    assert.equal(avatarPartGeo.userData.mergedSourceCount, 3);
    scene.add(new THREE.Mesh(avatarPartGeo, new THREE.MeshStandardMaterial({ vertexColors: true })));

    const stats = collectSceneBatchStats(scene);
    assert.equal(stats.instancedMeshCount, 1);
    assert.equal(stats.totalInstances, 4);
    assert.equal(stats.mergedMeshCount, 1);
    assert.equal(stats.mergedSourceMeshes, 3);
    // (4 - 1) from instanced rings + (3 - 1) from merged avatar parts = 5 saved draw calls
    assert.equal(stats.savedDrawCalls, 5);
  });

  it('returns null for empty ring specs and ignores hidden meshes in stats', () => {
    assert.equal(
      createInstancedRingBatch([], { innerRadius: 0.4, outerRadius: 0.6 }),
      null,
    );

    const scene = new THREE.Scene();
    const hiddenRings = createInstancedRingBatch(
      [
        { x: 0, y: 0, z: 0, colorHex: 0x10b981 },
        { x: 2, y: 0, z: 0, colorHex: 0x0284c7 },
      ],
      { innerRadius: 0.4, outerRadius: 0.6 },
    );
    assert.ok(hiddenRings);
    hiddenRings.visible = false;
    scene.add(hiddenRings);

    const stats = collectSceneBatchStats(scene);
    assert.equal(stats.instancedMeshCount, 0);
    assert.equal(stats.totalInstances, 0);
    assert.equal(stats.savedDrawCalls, 0);
  });
});
