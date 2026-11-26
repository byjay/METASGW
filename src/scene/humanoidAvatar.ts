import * as THREE from 'three';

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

const _sharedMatCache = new Map<string, THREE.Material>();
function getCachedMat<T extends THREE.Material>(key: string, factory: () => T): T {
  const existing = _sharedMatCache.get(key);
  if (existing) return existing as T;
  const created = factory();
  _sharedMatCache.set(key, created);
  return created;
}

/**
 * Builds a clean, articulated PBR humanoid avatar driven strictly by API user role & palette.
 * Zero hardcoded personal names or business personas.
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

  const skinMat = getCachedMat('skin_neutral', () => new THREE.MeshStandardMaterial({ color: 0xf2c8a4, roughness: 0.54, metalness: 0.02 }));
  const hairMat = getCachedMat('hair_dark', () => new THREE.MeshStandardMaterial({ color: 0x26211d, roughness: 0.65 }));
  const eyeMat = getCachedMat('eye_dark', () => new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.2 }));
  const jacketMat = getCachedMat(`jacket_${jacketColor}`, () => new THREE.MeshStandardMaterial({ color: jacketColor, roughness: 0.48, metalness: 0.14 }));
  const vestMat = getCachedMat(`vest_${vestColor}`, () => new THREE.MeshStandardMaterial({ color: vestColor, roughness: 0.4, metalness: 0.14 }));
  const reflectMat = getCachedMat('reflect_stripe', () => new THREE.MeshStandardMaterial({ color: 0xe2e8f0, emissive: 0xbae6fd, emissiveIntensity: 0.18, roughness: 0.25, metalness: 0.5 }));
  const pantsMat = getCachedMat('pants_navy', () => new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 }));
  const bootMat = getCachedMat('boot_dark', () => new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.45 }));
  const helmetMat = getCachedMat(`helmet_${helmetColor}`, () => new THREE.MeshStandardMaterial({ color: helmetColor, roughness: 0.28, metalness: 0.18 }));
  const shadowMat = getCachedMat(
    `shadow_${options.contactShadowTex.uuid}`,
    () => new THREE.MeshBasicMaterial({ map: options.contactShadowTex, transparent: true, opacity: 0.68, depthWrite: false }),
  );

  const shadow = new THREE.Mesh(g.shadow, shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  group.add(shadow);

  const hips = new THREE.Group();
  hips.position.y = 1.02;
  group.add(hips);

  const pelvis = new THREE.Mesh(g.pelvis, pantsMat);
  pelvis.scale.set(1.05, 1, 0.72);
  hips.add(pelvis);

  const belt = new THREE.Mesh(g.belt, bootMat);
  belt.scale.set(1.05, 1, 0.74);
  belt.position.y = 0.095;
  hips.add(belt);

  const spine = new THREE.Group();
  spine.position.y = 0.13;
  hips.add(spine);

  const torsoUpper = new THREE.Mesh(g.torsoUpper, jacketMat);
  torsoUpper.scale.set(1.12, 1.18, 0.72);
  torsoUpper.position.y = 0.34;
  spine.add(torsoUpper);

  const vest = new THREE.Mesh(g.vestOverlay, vestMat);
  vest.position.set(0, 0.33, 0);
  spine.add(vest);

  const stripe = new THREE.Mesh(g.vestStripe, reflectMat);
  stripe.position.y = 0.26;
  spine.add(stripe);

  const headGroup = new THREE.Group();
  headGroup.position.y = 0.66;
  spine.add(headGroup);

  const neck = new THREE.Mesh(g.neck, skinMat);
  neck.position.y = -0.01;
  headGroup.add(neck);

  const headMesh = new THREE.Mesh(g.head, skinMat);
  headMesh.scale.set(0.94, 1.06, 0.98);
  headMesh.position.y = 0.16;
  headGroup.add(headMesh);

  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(g.eyeIris, eyeMat);
    eye.position.set(sx * 0.06, 0.17, 0.165);
    headGroup.add(eye);
  }

  const hairCap = new THREE.Mesh(g.hairCap, hairMat);
  hairCap.position.set(0, 0.175, -0.015);
  headGroup.add(hairCap);

  const helmet = new THREE.Mesh(g.helmetDome, helmetMat);
  helmet.position.y = 0.21;
  headGroup.add(helmet);

  const brim = new THREE.Mesh(g.helmetBrim, helmetMat);
  brim.position.set(0, 0.215, 0.048);
  headGroup.add(brim);

  const buildArm = (side: -1 | 1) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.3, 0.52, 0);
    const upperArm = new THREE.Mesh(g.upperArm, jacketMat);
    upperArm.position.y = -0.15;
    shoulder.add(upperArm);

    const elbow = new THREE.Group();
    elbow.position.y = -0.29;
    shoulder.add(elbow);
    const forearm = new THREE.Mesh(g.forearm, jacketMat);
    forearm.position.y = -0.14;
    elbow.add(forearm);
    const palm = new THREE.Mesh(g.palm, skinMat);
    palm.position.y = -0.3;
    elbow.add(palm);

    spine.add(shoulder);
    return { shoulder, elbow };
  };

  const leftArm = buildArm(-1);
  const rightArm = buildArm(1);

  const buildLeg = (side: -1 | 1) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.13, -0.05, 0);
    const thigh = new THREE.Mesh(g.thigh, pantsMat);
    thigh.position.y = -0.21;
    hip.add(thigh);

    const knee = new THREE.Group();
    knee.position.y = -0.42;
    hip.add(knee);
    const shin = new THREE.Mesh(g.shin, pantsMat);
    shin.position.y = -0.19;
    knee.add(shin);
    const boot = new THREE.Mesh(g.boot, bootMat);
    boot.position.set(0, -0.37, 0.025);
    knee.add(boot);

    hips.add(hip);
    return { hip, knee };
  };

  const leftLeg = buildLeg(-1);
  const rightLeg = buildLeg(1);

  group.scale.setScalar(1.22);

  return {
    group,
    updateAnimation: (_dt, elapsed, action, reducedMotion) => {
      if (reducedMotion) {
        hips.position.y = 1.02;
        spine.rotation.x = 0;
        leftLeg.hip.rotation.x = 0;
        rightLeg.hip.rotation.x = 0;
        leftLeg.knee.rotation.x = 0;
        rightLeg.knee.rotation.x = 0;
        leftArm.shoulder.rotation.x = 0;
        rightArm.shoulder.rotation.x = 0;
        headGroup.rotation.y = 0;
        return;
      }
      if (action === 'run') {
        const stride = Math.sin(elapsed * 10.5);
        hips.position.y = 1.02 + Math.abs(Math.cos(elapsed * 10.5)) * 0.06;
        spine.rotation.x = 0.12;
        leftLeg.hip.rotation.x = stride * 0.62;
        rightLeg.hip.rotation.x = -stride * 0.62;
        leftLeg.knee.rotation.x = Math.max(0, -stride) * 0.5;
        rightLeg.knee.rotation.x = Math.max(0, stride) * 0.5;
        leftArm.shoulder.rotation.x = -stride * 0.5;
        rightArm.shoulder.rotation.x = stride * 0.5;
        leftArm.elbow.rotation.x = -0.35;
        rightArm.elbow.rotation.x = -0.35;
      } else {
        hips.position.y = 1.02 + Math.sin(elapsed * 2.0) * 0.014;
        spine.rotation.x = 0.02;
        leftLeg.hip.rotation.x = 0;
        rightLeg.hip.rotation.x = 0;
        leftLeg.knee.rotation.x = 0;
        rightLeg.knee.rotation.x = 0;
        leftArm.shoulder.rotation.x = Math.sin(elapsed * 1.4) * 0.04;
        rightArm.shoulder.rotation.x = -Math.sin(elapsed * 1.4) * 0.04;
        leftArm.elbow.rotation.x = -0.12;
        rightArm.elbow.rotation.x = -0.12;
        headGroup.rotation.y = Math.sin(elapsed * 0.85) * 0.12;
      }
    },
    dispose: () => {
      group.clear();
    },
  };
}
