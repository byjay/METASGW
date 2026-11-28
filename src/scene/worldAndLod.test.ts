import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as THREE from 'three';
import { resolveAvatarLodLevel } from './humanoidAvatar';
import {
  CHUNK_SIZE,
  computeDesiredChunkCoords,
  createChunkPrng,
  InfiniteWorldChunkManager,
  worldToChunkCoord,
} from './infiniteWorldChunks';
import { HOME_HARBOR_DECORATIVE_VESSELS } from './sceneryCatalog';
import type { HarborTexturePack } from './textures';

function createHeadlessTextureStub(): HarborTexturePack {
  const tex = () => new THREE.Texture() as unknown as THREE.CanvasTexture;
  const created: THREE.Texture[] = [];
  const make = () => {
    const t = tex();
    created.push(t);
    return t;
  };
  return {
    concreteAlbedo: make(),
    concreteBump: make(),
    concreteRoughness: make(),
    asphaltRoad: make(),
    hazardTrim: make(),
    containerRib: make(),
    containerRibBump: make(),
    containerRibRoughness: make(),
    curtainWall: make(),
    contactShadow: make(),
    craneBannerOrange: make(),
    craneBannerBlue: make(),
    hullSteelPlates: make(),
    waterNormals: make(),
    cloudPuff: make(),
    usedOffscreenCanvas: false,
    createSignboard: () => make(),
    createHubBuildingSignboard: () => make(),
    createAvatarBillboardIcon: () => make(),
    dispose: () => {
      for (const t of created) t.dispose();
    },
  };
}

describe('Avatar Distance LOD, Decorative Scenery Separation & Infinite Chunked World', () => {
  it('keeps avatars strictly 3D volumetric across all distances (never falls back to 2D billboard)', () => {
    assert.equal(resolveAvatarLodLevel(8), 'detailed');
    assert.equal(resolveAvatarLodLevel(180), 'detailed');
    assert.equal(resolveAvatarLodLevel(239.9), 'detailed');
    assert.equal(resolveAvatarLodLevel(240), 'mid');
    assert.equal(resolveAvatarLodLevel(420), 'mid');
    assert.equal(resolveAvatarLodLevel(800), 'mid');
    for (const d of [8, 45, 160, 240, 350, 600, 800]) {
      assert.notEqual(
        resolveAvatarLodLevel(d) as string,
        'billboard',
        `2D billboard LOD must never be returned at distance ${d}m`,
      );
    }
  });

  it('maintains strict separation for >= 12 decorative vessels including Hero 씨스타호 and FD-01', () => {
    assert.ok(
      HOME_HARBOR_DECORATIVE_VESSELS.length >= 12,
      `Expected >= 12 decorative vessels, got ${HOME_HARBOR_DECORATIVE_VESSELS.length}`,
    );
    const ids = new Set<string>();
    for (const v of HOME_HARBOR_DECORATIVE_VESSELS) {
      assert.equal(v.isDecorative, true, `${v.id} must be explicitly flagged isDecorative: true`);
      assert.equal(ids.has(v.id), false, `Duplicate decorative vessel id: ${v.id}`);
      ids.add(v.id);
    }

    const seastar = HOME_HARBOR_DECORATIVE_VESSELS.find((v) => v.defaultName === '씨스타호');
    assert.ok(seastar && seastar.isHero, 'Hero flagship 씨스타호 must exist in sceneryCatalog');

    const fd01 = HOME_HARBOR_DECORATIVE_VESSELS.find(
      (v) => v.defaultName === 'FD-01' && v.vesselType === 'floating_dock',
    );
    assert.ok(fd01 && fd01.isHero, 'Hero Floating Dry Dock FD-01 must exist in sceneryCatalog');
  });

  it('produces deterministic seeded PRNG output per infinite chunk coordinate', () => {
    const a1 = createChunkPrng(5, 0);
    const a2 = createChunkPrng(5, 0);
    const b1 = createChunkPrng(6, 0);

    const seqA1 = [a1(), a1(), a1(), a1()];
    const seqA2 = [a2(), a2(), a2(), a2()];
    const seqB1 = [b1(), b1(), b1(), b1()];

    assert.deepEqual(seqA1, seqA2, 'Same chunk coord must generate identical deterministic scenery');
    assert.notDeepEqual(seqA1, seqB1, 'Different chunk coords must generate distinct scenery');
  });

  it('streams 3x3 = 9 chunks and evicts/disposes distant chunks across 2,000m+ travel without unbounded growth', () => {
    assert.equal(CHUNK_SIZE, 200);
    assert.deepEqual(worldToChunkCoord(0, 0), { cx: 0, cz: 0 });
    assert.deepEqual(worldToChunkCoord(2200, 0), { cx: 11, cz: 0 });
    assert.equal(computeDesiredChunkCoords(0, 0).length, 9);

    const scene = new THREE.Scene();
    const textures = createHeadlessTextureStub();
    const glowMat = new THREE.MeshStandardMaterial({ color: 0xffe4b5 });
    const manager = new InfiniteWorldChunkManager(scene, textures, glowMat);

    // Start at Home Harbor (0, 0)
    manager.update(0, 0, 0);
    assert.equal(manager.activeChunkCount, 9);

    // Pan along coastline every 200m all the way to 2,400m+
    for (let x = 200; x <= 2400; x += 200) {
      manager.update(x, 0, x * 0.01);
      assert.equal(
        manager.activeChunkCount,
        9,
        `Active chunks must remain capped at 9 at x=${x}, got ${manager.activeChunkCount}`,
      );
    }

    assert.ok(
      manager.disposedChunkCount > 0,
      `Expected distant chunks to be evicted & disposed after 2,400m pan (disposed=${manager.disposedChunkCount})`,
    );

    // Return to Home Harbor (0, 0)
    manager.update(0, 0, 30);
    assert.equal(manager.activeChunkCount, 9);

    manager.dispose();
    assert.equal(manager.activeChunkCount, 0);
    glowMat.dispose();
    textures.dispose();
  });
});
