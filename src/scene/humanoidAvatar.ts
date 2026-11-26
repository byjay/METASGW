import * as THREE from 'three';
import { mergeColoredParts } from './meshBatching';

export type AvatarActionState = 'idle' | 'run';

export interface BuiltHumanoidRig {
  group: THREE.Group;
  updateAnimation: (dt: number, elapsed: number, action: AvatarActionState, reducedMotion: boolean) => void;
  dispose: () => void;
}

interface SharedAvatarGeos {
  shadow: THREE.PlaneGeometry;
  pelvis: THREE.CylinderGeometry;
  belt: THREE.CylinderGeometry;
  torsoUpper: THREE.CylinderGeometry;
  vestOverlay: THREE.BoxGeometry;
  vestStripe: THREE.BoxGeometry;
  neck: THREE.CylinderGeometry;
  head: THREE.SphereGeometry;
  eyeIris: THREE.SphereGeometry;
  hairCap: THREE.SphereGeometry;
  helmetDome: THREE.SphereGeometry;
  helmetBrim: THREE.CylinderGeometry;
  upperArm: THREE.CapsuleGeometry;
  forearm: THREE.CapsuleGeometry;
  palm: THREE.BoxGeometry;
  thigh: THREE.CapsuleGeometry;
  shin: THREE.CapsuleGeometry;
  boot: THREE.BoxGeometry;
}

let _sharedGeo: SharedAvatarGeos | null = null;
function getSharedGeos(): SharedAvatarGeos {
  if (_sharedGeo) return _sharedGeo;
  _sharedGeo = {
    shadow: new THREE.PlaneGeometry(1.6, 1.6),
    pelvis: new THREE.CylinderGeometry(0.21, 0.2, 0.22, 10),
    belt: new THREE.CylinderGeometry(0.22, 0.22, 0.06, 10),
    torsoUpper: new THREE.CylinderGeometry(0.24, 0.2, 0.44, 12),
    vestOverlay: new THREE.BoxGeometry(0.46, 0.4, 0.3),
    vestStripe: new THREE.BoxGeometry(0.48, 0.05, 0.31),
    neck: new THREE.CylinderGeometry(0.068, 0.08, 0.12, 8),
    head: new THREE.SphereGeometry(0.185, 14, 12),
    eyeIris: new THREE.SphereGeometry(0.02, 6, 6),
    hairCap: new THREE.SphereGeometry(0.194, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.6),
    helmetDome: new THREE.SphereGeometry(0.212, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.56),
    helmetBrim: new THREE.CylinderGeometry(0.228, 0.24, 0.024, 12),
    upperArm: new THREE.CapsuleGeometry(0.06, 0.22, 4, 8),
    forearm: new THREE.CapsuleGeometry(0.052, 0.2, 4, 8),
    palm: new THREE.BoxGeometry(0.07, 0.08, 0.036),
    thigh: new THREE.CapsuleGeometry(0.084, 0.3, 4, 8),
    shin: new THREE.CapsuleGeometry(0.068, 0.29, 4, 8),
    boot: new THREE.BoxGeometry(0.13, 0.12, 0.23),
  };
  return _sharedGeo;
}

interface MergedRigGeos {
  hips: THREE.BufferGeometry;
  torso: THREE.BufferGeometry;
  head: THREE.BufferGeometry;
  arm: THREE.BufferGeometry;
  leg: THREE.BufferGeometry;
}

const _mergedRigCache = new Map<string, MergedRigGeos>();

function getMergedRigGeos(jacketHex: number, vestHex: number, helmetHex: number): MergedRigGeos {
  const key = `${jacketHex}_${vestHex}_${helmetHex}`;
  const existing = _mergedRigCache.get(key);
  if (existing) return existing;

  const g = getSharedGeos();
  const SKIN = 0xf2c8a4;
  const HAIR = 0x26211d;
  const EYE = 0x1e293b;
  const PANTS = 0x1e293b;
  const BOOT = 0x18181b;
  const STRIPE = 0xe2e8f0;

  const rig: MergedRigGeos = {
    hips: mergeColoredParts([
      { geometry: g.pelvis, colorHex: PANTS, scale: [1.05, 1, 0.72] },
      { geometry: g.belt, colorHex: BOOT, position: [0, 0.095, 0], scale: [1.05, 1, 0.74] },
    ]),
    torso: mergeColoredParts([
      { geometry: g.torsoUpper, colorHex: jacketHex, position: [0, 0.34, 0], scale: [1.12, 1.18, 0.72] },
      { geometry: g.vestOverlay, colorHex: vestHex, position: [0, 0.33, 0] },
      { geometry: g.vestStripe, colorHex: STRIPE, position: [0, 0.26, 0] },
    ]),
    head: mergeColoredParts([
      { geometry: g.neck, colorHex: SKIN, position: [0, -0.01, 0] },
      { geometry: g.head, colorHex: SKIN, position: [0, 0.16, 0], scale: [0.94, 1.06, 0.98] },
      { geometry: g.eyeIris, colorHex: EYE, position: [-0.06, 0.17, 0.165] },
      { geometry: g.eyeIris, colorHex: EYE, position: [0.06, 0.17, 0.165] },
      { geometry: g.hairCap, colorHex: HAIR, position: [0, 0.175, -0.015] },
      { geometry: g.helmetDome, colorHex: helmetHex, position: [0, 0.21, 0] },
      { geometry: g.helmetBrim, colorHex: helmetHex, position: [0, 0.215, 0.048] },
    ]),
    arm: mergeColoredParts([
      { geometry: g.upperArm, colorHex: jacketHex, position: [0, -0.15, 0] },
      { geometry: g.forearm, colorHex: jacketHex, position: [0, -0.43, 0.04], rotation: [-0.15, 0, 0] },
      { geometry: g.palm, colorHex: SKIN, position: [0, -0.59, 0.06] },
    ]),
    leg: mergeColoredParts([
      { geometry: g.thigh, colorHex: PANTS, position: [0, -0.21, 0] },
      { geometry: g.shin, colorHex: PANTS, position: [0, -0.61, 0] },
      { geometry: g.boot, colorHex: BOOT, position: [0, -0.79, 0.025] },
    ]),
  };

  _mergedRigCache.set(key, rig);
  return rig;
}

const _sharedMatCache = new Map<string, THREE.Material>();
function getCachedMat<T extends THREE.Material>(key: string, factory: () => T): T {
  const existing = _sharedMatCache.get(key);
  if (existing) return existing as T;
  const created = factory();
  _sharedMatCache.set(key, created);
  return created;
}

/**
 * Builds an articulated PBR humanoid avatar using merged vertex-colored limb meshes.
 * Cuts Draw Calls from 25 -> 8 per avatar while preserving full walk/idle silhouette & animation.
 */
export function buildHarborAvatar(options: {
  isPartner: boolean;
  shirtHex: string;
  contactShadowTex: THREE.CanvasTexture;
  isCurrentUser?: boolean;
}): BuiltHumanoidRig {
  const g = getSharedGeos();
  const group = new THREE.Group();

  const jacketColor = new THREE.Color(options.shirtHex).getHex();
  const helmetColor = options.isPartner ? 0xf59e0b : options.isCurrentUser ? 0x38bdf8 : 0xf8fafc;
  const vestColor = options.isPartner ? 0xf97316 : 0x0284c7;

  const rigGeos = getMergedRigGeos(jacketColor, vestColor, helmetColor);
  const bodyMat = getCachedMat(
    'avatar_vertex_pbr',
    () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.48, metalness: 0.14 }),
  );
  const shadowMat = getCachedMat(
    `shadow_${options.contactShadowTex.uuid}`,
    () =>
      new THREE.MeshBasicMaterial({
        map: options.contactShadowTex,
        transparent: true,
        opacity: 0.68,
        depthWrite: false,
      }),
  );

  const shadow = new THREE.Mesh(g.shadow, shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  group.add(shadow);

  const hips = new THREE.Group();
  hips.position.y = 1.02;
  group.add(hips);

  const hipsMesh = new THREE.Mesh(rigGeos.hips, bodyMat);
  hips.add(hipsMesh);

  const spine = new THREE.Group();
  spine.position.y = 0.13;
  hips.add(spine);

  const torsoMesh = new THREE.Mesh(rigGeos.torso, bodyMat);
  spine.add(torsoMesh);

  const headGroup = new THREE.Group();
  headGroup.position.y = 0.66;
  spine.add(headGroup);
  headGroup.add(new THREE.Mesh(rigGeos.head, bodyMat));

  const leftArm = new THREE.Group();
  leftArm.position.set(-0.3, 0.52, 0);
  leftArm.add(new THREE.Mesh(rigGeos.arm, bodyMat));
  spine.add(leftArm);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.3, 0.52, 0);
  rightArm.add(new THREE.Mesh(rigGeos.arm, bodyMat));
  spine.add(rightArm);

  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.13, -0.05, 0);
  leftLeg.add(new THREE.Mesh(rigGeos.leg, bodyMat));
  hips.add(leftLeg);

  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.13, -0.05, 0);
  rightLeg.add(new THREE.Mesh(rigGeos.leg, bodyMat));
  hips.add(rightLeg);

  group.scale.setScalar(1.22);

  return {
    group,
    updateAnimation: (_dt, elapsed, action, reducedMotion) => {
      if (reducedMotion) {
        hips.position.y = 1.02;
        spine.rotation.x = 0;
        leftLeg.rotation.x = 0;
        rightLeg.rotation.x = 0;
        leftArm.rotation.x = 0;
        rightArm.rotation.x = 0;
        headGroup.rotation.y = 0;
        return;
      }
      if (action === 'run') {
        const stride = Math.sin(elapsed * 10.5);
        hips.position.y = 1.02 + Math.abs(Math.cos(elapsed * 10.5)) * 0.06;
        spine.rotation.x = 0.12;
        leftLeg.rotation.x = stride * 0.62;
        rightLeg.rotation.x = -stride * 0.62;
        leftArm.rotation.x = -stride * 0.5;
        rightArm.rotation.x = stride * 0.5;
      } else {
        hips.position.y = 1.02 + Math.sin(elapsed * 2.0) * 0.014;
        spine.rotation.x = 0.02;
        leftLeg.rotation.x = 0;
        rightLeg.rotation.x = 0;
        leftArm.rotation.x = Math.sin(elapsed * 1.4) * 0.04;
        rightArm.rotation.x = -Math.sin(elapsed * 1.4) * 0.04;
        headGroup.rotation.y = Math.sin(elapsed * 0.85) * 0.12;
      }
    },
    dispose: () => {
      group.clear();
    },
  };
}
