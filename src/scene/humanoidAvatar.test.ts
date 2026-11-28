import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import * as THREE from 'three';
import {
  buildHarborAvatar,
  buildHumanoidEngineerAvatar,
  resolveAvatarLodLevel,
} from './humanoidAvatar';

function collectMeshesAndSprites(root: THREE.Object3D): {
  meshes: THREE.Mesh[];
  sprites: THREE.Sprite[];
} {
  const meshes: THREE.Mesh[] = [];
  const sprites: THREE.Sprite[] = [];
  root.traverse((obj) => {
    if ((obj as THREE.Sprite).isSprite) {
      sprites.push(obj as THREE.Sprite);
    }
    if ((obj as THREE.Mesh).isMesh) {
      meshes.push(obj as THREE.Mesh);
    }
  });
  return { meshes, sprites };
}

describe('3D Volumetric Humanoid Engineer Avatar Restoration', () => {
  it('builds buildHumanoidEngineerAvatar with >= 24 sculpted 3D meshes and key engineer details', () => {
    const rig = buildHumanoidEngineerAvatar({
      isPartner: false,
      shirtHex: '#0284c7',
      isCurrentUser: true,
      skipContactShadow: true,
      modelVariantIndex: 0,
    });

    const { meshes, sprites } = collectMeshesAndSprites(rig.group);
    assert.equal(sprites.length, 0, 'Avatar must contain ZERO THREE.Sprite objects');
    assert.ok(
      meshes.length >= 24,
      `Expected >= 24 sculpted 3D meshes in engineer avatar, got ${meshes.length}`,
    );
    assert.equal(rig.meshCount, meshes.length);

    const names = new Set(meshes.map((m) => m.name));
    const requiredParts = [
      'safety_helmet_dome',
      'safety_helmet_visor',
      'helmet_headlamp_housing',
      'helmet_headlamp_lens',
      'marine_work_jacket',
      'high_vis_safety_vest',
      'reflective_stripe_lower',
      'reflective_stripe_upper',
      'left_elbow_pad',
      'right_elbow_pad',
      'left_knee_pad',
      'right_knee_pad',
      'wrist_tablet_frame',
      'wrist_tablet_hologram_screen',
      'left_boot_upper',
      'right_boot_upper',
      'ground_status_ring',
    ];
    for (const part of requiredParts) {
      assert.ok(names.has(part), `Missing required sculpted 3D engineer part: ${part}`);
    }

    rig.dispose();
  });

  it('contains ZERO THREE.Sprite instances across every distance (8m to 800m) for both HQ and partner avatars', () => {
    const hq = buildHarborAvatar({
      isPartner: false,
      shirtHex: '#0284c7',
      isCurrentUser: true,
      modelVariantIndex: 0,
    });
    const partner = buildHarborAvatar({
      isPartner: true,
      shirtHex: '#ea580c',
      isCurrentUser: false,
      modelVariantIndex: 2,
    });

    const distances = [8, 25, 45, 160, 240, 350, 600, 800];
    for (const dist of distances) {
      const lodHq = hq.updateLod(dist);
      const lodPartner = partner.updateLod(dist);
      assert.notEqual(lodHq as string, 'billboard');
      assert.notEqual(lodPartner as string, 'billboard');
      assert.equal(hq.group.visible, true);
      assert.equal(partner.group.visible, true);

      const hqStats = collectMeshesAndSprites(hq.group);
      const partnerStats = collectMeshesAndSprites(partner.group);
      assert.equal(hqStats.sprites.length, 0, `HQ avatar had Sprite at ${dist}m`);
      assert.equal(partnerStats.sprites.length, 0, `Partner avatar had Sprite at ${dist}m`);
      assert.ok(hqStats.meshes.length >= 24);
      assert.ok(partnerStats.meshes.length >= 24);
    }

    hq.dispose();
    partner.dispose();
  });

  it('applies distance-adaptive scale floor at far distances while preserving 1.0x close-up proportion', () => {
    const rig = buildHumanoidEngineerAvatar({
      isPartner: false,
      shirtHex: '#0284c7',
      skipContactShadow: true,
    });

    const container = rig.group.getObjectByName('engineer_rig_container');
    assert.ok(container, 'engineer_rig_container must exist');

    rig.updateLod(10);
    const closeScale = container.scale.x;
    assert.equal(closeScale, 1.0, 'Close-up scale must remain natural 1.0x');

    rig.updateLod(180);
    const overviewScale = container.scale.x;
    assert.ok(overviewScale > 1.5, `Overview scale should boost legibility (got ${overviewScale})`);

    rig.updateLod(750);
    const farScale = container.scale.x;
    assert.ok(
      farScale > overviewScale && farScale <= 3.25,
      `Far zoom scale should smoothly ramp within [overview, 3.25] (got ${farScale})`,
    );

    rig.dispose();
  });

  it('grounds safety boot soles cleanly at y = 0 without floating or sinking', () => {
    const rig = buildHumanoidEngineerAvatar({
      isPartner: false,
      shirtHex: '#0284c7',
      skipContactShadow: true,
    });
    rig.updateLod(10);
    rig.updateAnimation(0.016, 0, 'idle', true);
    rig.group.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(rig.group);
    assert.ok(
      Math.abs(box.min.y) < 0.04,
      `Expected boot soles grounded near y=0, got min.y=${box.min.y.toFixed(4)}`,
    );
    assert.ok(
      box.max.y > 2.4 && box.max.y < 3.1,
      `Expected realistic diorama height ~2.7m, got max.y=${box.max.y.toFixed(3)}`,
    );

    rig.dispose();
  });

  it('articulates shoulders, elbows, hips, and knees across run / idle / wave / reducedMotion', () => {
    const rig = buildHumanoidEngineerAvatar({
      isPartner: true,
      shirtHex: '#f59e0b',
      skipContactShadow: true,
    });

    const leftHip = rig.group.getObjectByName('left_hip_joint');
    const leftKnee = rig.group.getObjectByName('left_knee_joint');
    const rightShoulder = rig.group.getObjectByName('right_shoulder_joint');
    const rightElbow = rig.group.getObjectByName('right_elbow_joint');
    assert.ok(leftHip && leftKnee && rightShoulder && rightElbow);

    // Walking stride moves hip & bends knee
    rig.updateAnimation(0.016, 0.5, 'run', false);
    assert.ok(Math.abs(leftHip.rotation.x) > 0.05, 'Walking must articulate hip swing');
    assert.ok(leftKnee.rotation.x >= 0.06, 'Walking must bend knee joint');

    // Waving raises right arm & bends elbow
    rig.updateAnimation(0.016, 1.0, 'wave', false);
    assert.ok(rightShoulder.rotation.x < -1.5, 'Wave must raise right arm');
    assert.ok(rightElbow.rotation.x < -0.1, 'Wave must flex right elbow');

    // Idle & reducedMotion stay stable
    rig.updateAnimation(0.016, 2.0, 'idle', false);
    rig.updateAnimation(0.016, 2.0, 'run', true);
    assert.equal(leftHip.rotation.x, 0, 'Reduced motion must hold neutral leg pose');

    rig.dispose();
  });

  it('static guard: humanoidAvatar.ts has zero 2D Sprite fallback and zero external VRM/GLB mannequin swap', () => {
    const srcPath = path.resolve(process.cwd(), 'src/scene/humanoidAvatar.ts');
    const source = fs.readFileSync(srcPath, 'utf8');

    assert.equal(/THREE\.Sprite|SpriteMaterial/.test(source), false, 'No THREE.Sprite allowed');
    assert.equal(/VRMLoaderPlugin|@pixiv\/three-vrm/.test(source), false, 'No VRM mannequin swap allowed');
    assert.equal(/GLTFLoader|vrm_engineer_cc0|cesium_man_cc0/.test(source), false, 'No external GLB/VRM swap allowed');
    assert.equal(resolveAvatarLodLevel(9999), 'mid');
  });
});
