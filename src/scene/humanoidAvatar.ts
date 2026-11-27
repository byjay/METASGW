import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { VRMLoaderPlugin, type VRM } from '@pixiv/three-vrm';
import { mergeColoredParts } from './meshBatching';

export type AvatarActionState = 'idle' | 'run' | 'wave';
export type AvatarLodLevel = 'detailed' | 'simple' | 'billboard';

export interface BuiltHumanoidRig {
  group: THREE.Group;
  updateAnimation: (dt: number, elapsed: number, action: AvatarActionState, reducedMotion: boolean) => void;
  updateLod: (cameraDistance: number) => AvatarLodLevel;
  dispose: () => void;
}

/**
 * Pure distance-based LOD classifier for 3D avatars:
 *   - Near (< 215m): detailed CC0 VRM / GLB / articulated 3D humanoid (2.85m diorama-readable height)
 *   - Mid  (215m .. 300m): simplified low-poly silhouette
 *   - Far  (>= 300m): unobtrusive 2D billboard icon sprite (never blocks harbor scenery)
 */
export function resolveAvatarLodLevel(cameraDistance: number): AvatarLodLevel {
  if (!Number.isFinite(cameraDistance) || cameraDistance < 215) return 'detailed';
  if (cameraDistance < 300) return 'simple';
  return 'billboard';
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
  simpleBody: THREE.CapsuleGeometry;
  simpleHead: THREE.SphereGeometry;
}

let _sharedGeo: SharedAvatarGeos | null = null;
function getSharedGeos(): SharedAvatarGeos {
  if (_sharedGeo) return _sharedGeo;
  _sharedGeo = {
    shadow: new THREE.PlaneGeometry(2.2, 2.2),
    pelvis: new THREE.CylinderGeometry(0.18, 0.17, 0.2, 10),
    belt: new THREE.CylinderGeometry(0.19, 0.19, 0.05, 10),
    torsoUpper: new THREE.CylinderGeometry(0.21, 0.17, 0.42, 12),
    vestOverlay: new THREE.BoxGeometry(0.42, 0.36, 0.27),
    vestStripe: new THREE.BoxGeometry(0.44, 0.045, 0.28),
    neck: new THREE.CylinderGeometry(0.06, 0.072, 0.1, 8),
    head: new THREE.SphereGeometry(0.16, 14, 12),
    eyeIris: new THREE.SphereGeometry(0.018, 6, 6),
    hairCap: new THREE.SphereGeometry(0.168, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.6),
    helmetDome: new THREE.SphereGeometry(0.184, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.56),
    helmetBrim: new THREE.CylinderGeometry(0.196, 0.208, 0.02, 12),
    upperArm: new THREE.CapsuleGeometry(0.052, 0.2, 4, 8),
    forearm: new THREE.CapsuleGeometry(0.045, 0.18, 4, 8),
    palm: new THREE.BoxGeometry(0.06, 0.07, 0.032),
    thigh: new THREE.CapsuleGeometry(0.074, 0.27, 4, 8),
    shin: new THREE.CapsuleGeometry(0.06, 0.26, 4, 8),
    boot: new THREE.BoxGeometry(0.11, 0.1, 0.2),
    simpleBody: new THREE.CapsuleGeometry(0.24, 0.85, 4, 8),
    simpleHead: new THREE.SphereGeometry(0.17, 8, 8),
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
      { geometry: g.pelvis, colorHex: PANTS, scale: [1.04, 1, 0.72] },
      { geometry: g.belt, colorHex: BOOT, position: [0, 0.088, 0], scale: [1.04, 1, 0.74] },
    ]),
    torso: mergeColoredParts([
      { geometry: g.torsoUpper, colorHex: jacketHex, position: [0, 0.3, 0], scale: [1.1, 1.12, 0.72] },
      { geometry: g.vestOverlay, colorHex: vestHex, position: [0, 0.29, 0] },
      { geometry: g.vestStripe, colorHex: STRIPE, position: [0, 0.23, 0] },
    ]),
    head: mergeColoredParts([
      { geometry: g.neck, colorHex: SKIN, position: [0, -0.01, 0] },
      { geometry: g.head, colorHex: SKIN, position: [0, 0.14, 0], scale: [0.94, 1.05, 0.98] },
      { geometry: g.eyeIris, colorHex: EYE, position: [-0.052, 0.15, 0.142] },
      { geometry: g.eyeIris, colorHex: EYE, position: [0.052, 0.15, 0.142] },
      { geometry: g.hairCap, colorHex: HAIR, position: [0, 0.155, -0.014] },
      { geometry: g.helmetDome, colorHex: helmetHex, position: [0, 0.185, 0] },
      { geometry: g.helmetBrim, colorHex: helmetHex, position: [0, 0.19, 0.042] },
    ]),
    arm: mergeColoredParts([
      { geometry: g.upperArm, colorHex: jacketHex, position: [0, -0.14, 0] },
      { geometry: g.forearm, colorHex: jacketHex, position: [0, -0.39, 0.036], rotation: [-0.15, 0, 0] },
      { geometry: g.palm, colorHex: SKIN, position: [0, -0.53, 0.054] },
    ]),
    leg: mergeColoredParts([
      { geometry: g.thigh, colorHex: PANTS, position: [0, -0.19, 0] },
      { geometry: g.shin, colorHex: PANTS, position: [0, -0.55, 0] },
      { geometry: g.boot, colorHex: BOOT, position: [0, -0.71, 0.022] },
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

// ============================================================================
// LOCAL CC0 VRM & RIGGED GLB LOADER CACHE (public/models/, ZERO EXTERNAL CDN)
// ============================================================================

const LOCAL_MODEL_BASE =
  (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL ? import.meta.env.BASE_URL : '/').replace(
    /\/?$/,
    '/',
  ) + 'models/';

const MODEL_SLOTS = [
  { kind: 'vrm' as const, file: 'vrm_engineer_cc0.vrm' },
  { kind: 'glb' as const, file: 'cesium_man_cc0.glb' },
  { kind: 'glb' as const, file: 'rigged_figure_cc0.glb' },
  { kind: 'vrm' as const, file: 'vrm_orion_cc0.vrm' },
];

interface LoadedGlbTemplate {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

const _glbCache = new Map<string, Promise<LoadedGlbTemplate | null>>();

function loadLocalGlbTemplate(url: string): Promise<LoadedGlbTemplate | null> {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') {
    return Promise.resolve(null);
  }
  const cached = _glbCache.get(url);
  if (cached) return cached;

  const promise = new Promise<LoadedGlbTemplate | null>((resolve) => {
    const loader = new GLTFLoader();
    loader.load(
      url,
      (gltf) => {
        resolve({ scene: gltf.scene, animations: gltf.animations ?? [] });
      },
      undefined,
      () => resolve(null),
    );
  });
  _glbCache.set(url, promise);
  return promise;
}

function loadLocalVrmInstance(url: string): Promise<VRM | null> {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise<VRM | null>((resolve) => {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    loader.load(
      url,
      (gltf) => {
        const vrm = (gltf.userData as { vrm?: VRM }).vrm ?? null;
        resolve(vrm);
      },
      undefined,
      () => resolve(null),
    );
  });
}

function normalizeModelHeight(root: THREE.Object3D, targetHeight = 1.75): void {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);
  if (size.y > 0.05 && Number.isFinite(size.y)) {
    const scale = targetHeight / size.y;
    root.scale.multiplyScalar(scale);
    root.updateMatrixWorld(true);
    const scaledBox = new THREE.Box3().setFromObject(root);
    root.position.y -= scaledBox.min.y;
  }
}

function addSafetyHelmetProp(
  parent: THREE.Object3D,
  helmetHex: number,
  headY: number,
  helmetScale = 1.48,
): void {
  const g = getSharedGeos();
  const helmetMat = new THREE.MeshStandardMaterial({
    color: helmetHex,
    roughness: 0.36,
    metalness: 0.22,
  });
  const helmetGroup = new THREE.Group();
  helmetGroup.position.set(0, headY, 0);
  helmetGroup.scale.setScalar(helmetScale);
  const dome = new THREE.Mesh(g.helmetDome, helmetMat);
  dome.castShadow = true;
  helmetGroup.add(dome);
  const brim = new THREE.Mesh(g.helmetBrim, helmetMat);
  brim.position.set(0, 0.005, 0.04);
  helmetGroup.add(brim);
  parent.add(helmetGroup);
}

/**
 * Builds a high-craft CC0 humanoid avatar with 3-tier distance-based LOD:
 *   1) Detailed LOD (< 36m): Loads local CC0 VRM/GLB from `public/models/` (with instant articulated PBR rig fallback)
 *      + safety helmet / workwear tint + walk / idle / wave animation + realistic 1.75m human height.
 *   2) Simple LOD (36m..68m): Lightweight capsule silhouette.
 *   3) Billboard LOD (>= 68m): Tiny crisp 2D icon sprite so distant avatars NEVER block the harbor vista!
 */
export function buildHarborAvatar(options: {
  isPartner: boolean;
  shirtHex: string;
  contactShadowTex: THREE.CanvasTexture;
  billboardIconTex?: THREE.CanvasTexture;
  isCurrentUser?: boolean;
  skipContactShadow?: boolean;
  modelVariantIndex?: number;
  enableExternalCc0Model?: boolean;
}): BuiltHumanoidRig {
  const g = getSharedGeos();
  const group = new THREE.Group();

  const jacketColor = new THREE.Color(options.shirtHex).getHex();
  const helmetColor = options.isPartner ? 0xfbbf24 : options.isCurrentUser ? 0x38bdf8 : 0xf8fafc;
  const vestColor = options.isPartner ? 0xea580c : 0x0284c7;

  // Root containers for each LOD tier
  const detailedRoot = new THREE.Group();
  const simpleRoot = new THREE.Group();
  simpleRoot.visible = false;
  group.add(detailedRoot, simpleRoot);

  // 1) Contact Shadow (when not externally batched)
  if (!options.skipContactShadow) {
    const shadowMat = getCachedMat(
      `shadow_${options.contactShadowTex.uuid}`,
      () =>
        new THREE.MeshBasicMaterial({
          map: options.contactShadowTex,
          transparent: true,
          opacity: 0.62,
          depthWrite: false,
        }),
    );
    const shadow = new THREE.Mesh(g.shadow, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.03;
    group.add(shadow);
  }

  // 2) Instant Articulated Procedural Humanoid Rig (2.85m diorama-readable base scale)
  const fallbackRigGroup = new THREE.Group();
  fallbackRigGroup.scale.setScalar(1.62);
  const rigGeos = getMergedRigGeos(jacketColor, vestColor, helmetColor);
  const bodyMat = getCachedMat(
    'avatar_vertex_pbr',
    () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.46, metalness: 0.12 }),
  );

  const hips = new THREE.Group();
  hips.position.y = 0.92;
  fallbackRigGroup.add(hips);
  const hipsMesh = new THREE.Mesh(rigGeos.hips, bodyMat);
  hipsMesh.castShadow = true;
  hips.add(hipsMesh);

  const spine = new THREE.Group();
  spine.position.y = 0.12;
  hips.add(spine);
  const torsoMesh = new THREE.Mesh(rigGeos.torso, bodyMat);
  torsoMesh.castShadow = true;
  spine.add(torsoMesh);

  const headGroup = new THREE.Group();
  headGroup.position.y = 0.58;
  spine.add(headGroup);
  const headMesh = new THREE.Mesh(rigGeos.head, bodyMat);
  headMesh.castShadow = true;
  headGroup.add(headMesh);

  const leftArm = new THREE.Group();
  leftArm.position.set(-0.27, 0.46, 0);
  const laMesh = new THREE.Mesh(rigGeos.arm, bodyMat);
  laMesh.castShadow = true;
  leftArm.add(laMesh);
  spine.add(leftArm);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.27, 0.46, 0);
  const raMesh = new THREE.Mesh(rigGeos.arm, bodyMat);
  raMesh.castShadow = true;
  rightArm.add(raMesh);
  spine.add(rightArm);

  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.12, -0.05, 0);
  const llMesh = new THREE.Mesh(rigGeos.leg, bodyMat);
  llMesh.castShadow = true;
  leftLeg.add(llMesh);
  hips.add(leftLeg);

  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.12, -0.05, 0);
  const rlMesh = new THREE.Mesh(rigGeos.leg, bodyMat);
  rlMesh.castShadow = true;
  rightLeg.add(rlMesh);
  hips.add(rightLeg);

  detailedRoot.add(fallbackRigGroup);

  // 3) Mid-distance Simplified Silhouette LOD
  const simpleInner = new THREE.Group();
  simpleInner.scale.setScalar(1.62);
  const simpleMat = new THREE.MeshStandardMaterial({
    color: vestColor,
    roughness: 0.48,
    metalness: 0.12,
  });
  const simpleBody = new THREE.Mesh(g.simpleBody, simpleMat);
  simpleBody.position.y = 0.85;
  simpleBody.castShadow = true;
  simpleInner.add(simpleBody);
  const simpleHelmetMat = new THREE.MeshStandardMaterial({ color: helmetColor, roughness: 0.36 });
  const simpleHead = new THREE.Mesh(g.simpleHead, simpleHelmetMat);
  simpleHead.position.y = 1.56;
  simpleHead.castShadow = true;
  simpleInner.add(simpleHead);
  simpleRoot.add(simpleInner);

  // 4) Far-distance Billboard Icon Sprite LOD (guarantees minimum legible screen size at overview/far zoom)
  let billboardSprite: THREE.Sprite | null = null;
  if (options.billboardIconTex) {
    const bbMat = new THREE.SpriteMaterial({
      map: options.billboardIconTex,
      transparent: true,
      depthTest: true,
      depthWrite: false,
    });
    billboardSprite = new THREE.Sprite(bbMat);
    billboardSprite.position.set(0, 2.8, 0);
    billboardSprite.scale.set(4.5, 4.5, 1);
    billboardSprite.visible = false;
    group.add(billboardSprite);
  }

  // 5) Async upgrade to local CC0 VRM / Rigged GLB from public/models/ (Requirements #7, #10, #14)
  let loadedVrm: VRM | null = null;
  let glbMixer: THREE.AnimationMixer | null = null;
  let glbWalkAction: THREE.AnimationAction | null = null;
  let externalModelRoot: THREE.Object3D | null = null;
  let disposed = false;

  if (options.enableExternalCc0Model !== false && typeof window !== 'undefined') {
    const slotIdx = Math.abs(options.modelVariantIndex ?? 0) % MODEL_SLOTS.length;
    const slot = MODEL_SLOTS[slotIdx];
    const url = `${LOCAL_MODEL_BASE}${slot.file}`;

    if (slot.kind === 'vrm') {
      void loadLocalVrmInstance(url).then((vrm) => {
        if (disposed || !vrm) return;
        loadedVrm = vrm;
        const vrmScene = vrm.scene;
        const wrapper = new THREE.Group();
        vrmScene.rotation.y = Math.PI; // VRM0/1 front faces +Z in HarborScene
        normalizeModelHeight(vrmScene, 2.85);
        vrmScene.traverse((obj) => {
          const m = obj as THREE.Mesh;
          if (m.isMesh) {
            m.castShadow = true;
            m.receiveShadow = true;
          }
        });
        wrapper.add(vrmScene);
        addSafetyHelmetProp(wrapper, helmetColor, 2.68, 1.48);
        const hum = vrm.humanoid;
        const lArm = hum?.getNormalizedBoneNode('leftUpperArm');
        const rArm = hum?.getNormalizedBoneNode('rightUpperArm');
        if (lArm) lArm.rotation.set(0, 0, 1.18);
        if (rArm) rArm.rotation.set(0, 0, -1.18);
        vrm.update(0);
        externalModelRoot = wrapper;
        detailedRoot.add(wrapper);
        fallbackRigGroup.visible = false;
      });
    } else {
      void loadLocalGlbTemplate(url).then((tpl) => {
        if (disposed || !tpl) return;
        const wrapper = new THREE.Group();
        const cloned = SkeletonUtils.clone(tpl.scene);
        normalizeModelHeight(cloned, 2.82);
        const tint = new THREE.Color(options.shirtHex);
        cloned.traverse((obj) => {
          const m = obj as THREE.Mesh;
          if (m.isMesh) {
            m.castShadow = true;
            m.receiveShadow = true;
            if (m.material && !Array.isArray(m.material)) {
              const clonedMat = m.material.clone();
              if ('color' in clonedMat && clonedMat.color instanceof THREE.Color) {
                clonedMat.color.lerp(tint, 0.35);
              }
              m.material = clonedMat;
            }
          }
        });
        wrapper.add(cloned);
        addSafetyHelmetProp(wrapper, helmetColor, 2.64, 1.46);
        if (tpl.animations.length > 0) {
          glbMixer = new THREE.AnimationMixer(cloned);
          glbWalkAction = glbMixer.clipAction(tpl.animations[0]);
          glbWalkAction.play();
        }
        externalModelRoot = wrapper;
        detailedRoot.add(wrapper);
        fallbackRigGroup.visible = false;
      });
    }
  }

  let currentLod: AvatarLodLevel = 'detailed';

  return {
    group,
    updateLod: (cameraDistance: number) => {
      const nextLod = resolveAvatarLodLevel(cameraDistance);
      currentLod = nextLod;
      detailedRoot.visible = nextLod === 'detailed';
      simpleRoot.visible = nextLod === 'simple';

      // Distance-adaptive scale floor guarantees avatars stay clearly readable in Harbor Overview
      // while remaining natural human proportion up close (d <= 45m).
      const safeDist = Number.isFinite(cameraDistance) ? cameraDistance : 160;
      const distBoost =
        safeDist <= 45
          ? 1.0
          : THREE.MathUtils.clamp(1.0 + ((safeDist - 45) / 130) * 1.25, 1.0, 2.35);
      detailedRoot.scale.setScalar(distBoost);
      simpleRoot.scale.setScalar(distBoost);

      if (billboardSprite) {
        billboardSprite.visible = nextLod === 'billboard';
        if (nextLod === 'billboard') {
          // Minimum legible screen-space billboard icon at far distances
          const iconSize = THREE.MathUtils.clamp(safeDist * 0.032, 4.4, 9.8);
          billboardSprite.scale.set(iconSize, iconSize, 1);
          billboardSprite.position.y = Math.max(2.6, iconSize * 0.55);
        }
      } else {
        simpleRoot.visible = nextLod !== 'detailed';
      }
      return nextLod;
    },
    updateAnimation: (dt, elapsed, action, reducedMotion) => {
      if (currentLod === 'simple') {
        if (!reducedMotion && action === 'run') {
          simpleInner.position.y = Math.abs(Math.sin(elapsed * 9.5)) * 0.14;
          simpleInner.rotation.z = Math.sin(elapsed * 4.75) * 0.07;
        } else {
          simpleInner.position.y = 0;
          simpleInner.rotation.z = 0;
        }
        return;
      }
      if (currentLod !== 'detailed') return;

      // Animate loaded VRM humanoid bones (walk / idle / wave)
      if (loadedVrm) {
        const hum = loadedVrm.humanoid;
        const lArm = hum?.getNormalizedBoneNode('leftUpperArm');
        const rArm = hum?.getNormalizedBoneNode('rightUpperArm');
        const lLeg = hum?.getNormalizedBoneNode('leftUpperLeg');
        const rLeg = hum?.getNormalizedBoneNode('rightUpperLeg');
        const headBone = hum?.getNormalizedBoneNode('head');

        if (reducedMotion) {
          if (lArm) lArm.rotation.set(0, 0, 1.15);
          if (rArm) rArm.rotation.set(0, 0, -1.15);
          if (lLeg) lLeg.rotation.set(0, 0, 0);
          if (rLeg) rLeg.rotation.set(0, 0, 0);
        } else if (action === 'run') {
          const stride = Math.sin(elapsed * 9.5);
          if (lLeg) lLeg.rotation.x = stride * 0.55;
          if (rLeg) rLeg.rotation.x = -stride * 0.55;
          if (lArm) lArm.rotation.set(-stride * 0.45, 0, 1.15);
          if (rArm) rArm.rotation.set(stride * 0.45, 0, -1.15);
        } else if (action === 'wave') {
          if (lArm) lArm.rotation.set(0, 0, 1.15);
          if (rArm) rArm.rotation.set(0, 0, 0.8 + Math.sin(elapsed * 7.5) * 0.35);
          if (lLeg) lLeg.rotation.x = 0;
          if (rLeg) rLeg.rotation.x = 0;
        } else {
          if (lArm) lArm.rotation.set(Math.sin(elapsed * 1.4) * 0.05, 0, 1.18);
          if (rArm) rArm.rotation.set(-Math.sin(elapsed * 1.4) * 0.05, 0, -1.18);
          if (lLeg) lLeg.rotation.x = 0;
          if (rLeg) rLeg.rotation.x = 0;
          if (headBone) headBone.rotation.y = Math.sin(elapsed * 0.8) * 0.14;
        }
        loadedVrm.update(dt);
        return;
      }

      // Animate loaded rigged GLB
      if (glbMixer && glbWalkAction) {
        if (reducedMotion) {
          glbWalkAction.timeScale = 0;
        } else {
          glbWalkAction.timeScale = action === 'run' ? 1.35 : 0.16;
          glbMixer.update(dt);
        }
        return;
      }

      // Animate instant articulated fallback rig (walk / idle / wave)
      if (reducedMotion) {
        hips.position.y = 0.92;
        spine.rotation.x = 0;
        leftLeg.rotation.x = 0;
        rightLeg.rotation.x = 0;
        leftArm.rotation.set(0, 0, 0);
        rightArm.rotation.set(0, 0, 0);
        headGroup.rotation.y = 0;
        return;
      }
      if (action === 'run') {
        const stride = Math.sin(elapsed * 10.5);
        hips.position.y = 0.92 + Math.abs(Math.cos(elapsed * 10.5)) * 0.05;
        spine.rotation.x = 0.1;
        leftLeg.rotation.x = stride * 0.58;
        rightLeg.rotation.x = -stride * 0.58;
        leftArm.rotation.set(-stride * 0.46, 0, 0);
        rightArm.rotation.set(stride * 0.46, 0, 0);
      } else if (action === 'wave') {
        hips.position.y = 0.92 + Math.sin(elapsed * 2.2) * 0.012;
        spine.rotation.x = 0;
        leftLeg.rotation.x = 0;
        rightLeg.rotation.x = 0;
        leftArm.rotation.set(0, 0, 0);
        rightArm.rotation.set(-2.5, 0, Math.sin(elapsed * 8.0) * 0.28);
        headGroup.rotation.y = Math.sin(elapsed * 1.4) * 0.14;
      } else {
        hips.position.y = 0.92 + Math.sin(elapsed * 2.0) * 0.012;
        spine.rotation.x = 0.02;
        leftLeg.rotation.x = 0;
        rightLeg.rotation.x = 0;
        leftArm.rotation.set(Math.sin(elapsed * 1.4) * 0.04, 0, 0);
        rightArm.rotation.set(-Math.sin(elapsed * 1.4) * 0.04, 0, 0);
        headGroup.rotation.y = Math.sin(elapsed * 0.85) * 0.12;
      }
    },
    dispose: () => {
      disposed = true;
      if (glbMixer) glbMixer.stopAllAction();
      if (externalModelRoot) {
        externalModelRoot.traverse((obj) => {
          const m = obj as THREE.Mesh;
          if (m.isMesh && m.material && !Array.isArray(m.material)) {
            m.material.dispose();
          }
        });
      }
      simpleMat.dispose();
      simpleHelmetMat.dispose();
      if (billboardSprite) {
        (billboardSprite.material as THREE.SpriteMaterial).dispose();
      }
      group.clear();
    },
  };
}
