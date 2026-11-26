import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm';
import type { ActorRoleType } from '../config/fleetConfig';
import type { VrmVisemeWeights } from '../core/lipSyncEngine';

export type RpgActionState = 'idle' | 'run' | 'work' | 'talk';
export type VrmExpression = 'neutral' | 'happy' | 'focus' | 'talk';

export interface BuiltHumanoidRig {
  group: THREE.Group;
  isExternalVrm: boolean;
  vrmModelName: string;
  updateAnimation: (
    dt: number,
    elapsed: number,
    action: RpgActionState,
    expression: VrmExpression,
    visemes?: VrmVisemeWeights,
  ) => void;
  dispose: () => void;
}

/**
 * Builds an upgraded high-detail stylized PBR articulated Naval Engineer avatar
 * (24+ sculpted meshes: hard-hat with lamp & visor, high-vis reflective marine jacket,
 * articulated shoulders/elbows/knees/boots, holographic wrist CAD tablet, ground RPG ring).
 */
export function buildHumanoidEngineerAvatar(
  actorRole: ActorRoleType,
  contactShadowTex: THREE.CanvasTexture,
): BuiltHumanoidRig {
  const group = new THREE.Group();
  const isEmployee = actorRole === 'employee';

  const suitPrimary = isEmployee ? 0x0f2d5e : 0x78350f;
  const suitAccent = isEmployee ? 0x0ea5e9 : 0xf59e0b;
  const helmetHex = isEmployee ? 0xf8fafc : 0xf59e0b;

  const skinMat = new THREE.MeshStandardMaterial({ color: 0xf1c29b, roughness: 0.56, metalness: 0.02 });
  const suitMat = new THREE.MeshStandardMaterial({ color: suitPrimary, roughness: 0.46, metalness: 0.18 });
  const vestMat = new THREE.MeshStandardMaterial({
    color: suitAccent,
    emissive: suitAccent,
    emissiveIntensity: 0.14,
    roughness: 0.34,
    metalness: 0.22,
  });
  const reflectMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    emissive: 0xbae6fd,
    emissiveIntensity: 0.35,
    roughness: 0.2,
    metalness: 0.65,
  });
  const pantsMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.68, metalness: 0.1 });
  const bootMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.45, metalness: 0.38 });
  const helmetMat = new THREE.MeshStandardMaterial({ color: helmetHex, roughness: 0.22, metalness: 0.25 });
  const visorMat = new THREE.MeshPhysicalMaterial({
    color: 0x020617,
    roughness: 0.1,
    metalness: 0.35,
    clearcoat: 1.0,
  });
  const holoPadMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0ea5e9,
    emissiveIntensity: 1.5,
    roughness: 0.15,
  });

  // Ground contact shadow + RPG selection reticle
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.75, 1.75),
    new THREE.MeshBasicMaterial({ map: contactShadowTex, transparent: true, opacity: 0.72, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  group.add(shadow);

  // Pelvis / Hips root
  const hips = new THREE.Group();
  hips.position.y = 1.02;
  group.add(hips);

  const pelvisMesh = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.22, 0.28), pantsMat);
  hips.add(pelvisMesh);

  // Utility Safety Belt
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.31), bootMat);
  belt.position.y = 0.1;
  hips.add(belt);

  // Upper Torso / Spine Pivot
  const spine = new THREE.Group();
  spine.position.y = 0.14;
  hips.add(spine);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.34, 8, 12), suitMat);
  torso.scale.set(1.12, 1, 0.78);
  torso.position.y = 0.32;
  torso.castShadow = true;
  spine.add(torso);

  // High-Vis Marine Safety Vest + Reflective Stripes
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.44, 0.34), vestMat);
  vest.position.y = 0.32;
  vest.castShadow = true;
  spine.add(vest);

  for (const sy of [0.22, 0.4]) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.055, 0.36), reflectMat);
    stripe.position.y = sy;
    spine.add(stripe);
  }

  // Radio Backpack on Rear
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.36, 0.16), bootMat);
  pack.position.set(0, 0.34, -0.22);
  spine.add(pack);
  const packAnt = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.018, 0.36, 6), reflectMat);
  packAnt.position.set(0.1, 0.62, -0.24);
  spine.add(packAnt);

  // Articulated Head + Safety Hard-Hat + Headlamp + Polycarbonate Visor + Blendshape Rig
  const headGroup = new THREE.Group();
  headGroup.position.y = 0.72;
  spine.add(headGroup);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.12, 8), skinMat);
  neck.position.y = -0.02;
  headGroup.add(neck);

  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 14), skinMat);
  headMesh.position.y = 0.14;
  headMesh.castShadow = true;
  headGroup.add(headMesh);

  // Sculpted Safety Hard-Hat Dome + Peak Brim + Headlamp
  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.225, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.56),
    helmetMat,
  );
  helmet.position.y = 0.165;
  helmet.castShadow = true;
  headGroup.add(helmet);

  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.245, 0.255, 0.032, 16), helmetMat);
  brim.position.set(0, 0.165, 0.045);
  headGroup.add(brim);

  const headlamp = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.055, 0.05), holoPadMat);
  headlamp.position.set(0, 0.25, 0.21);
  headGroup.add(headlamp);

  // Protective Goggle Visor
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.075, 0.06), visorMat);
  visor.position.set(0, 0.155, 0.175);
  headGroup.add(visor);

  // Mouth Mesh for Expression Blendshapes (talk / happy / focus)
  const mouth = new THREE.Mesh(
    new THREE.BoxGeometry(0.075, 0.022, 0.02),
    new THREE.MeshBasicMaterial({ color: 0x7c2d12 }),
  );
  mouth.position.set(0, 0.065, 0.19);
  headGroup.add(mouth);

  // Articulated Left & Right Arms (Shoulder + Upper Arm + Forearm + Gloved Hand)
  const buildArm = (side: -1 | 1) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.34, 0.54, 0);

    const shoulderCap = new THREE.Mesh(new THREE.SphereGeometry(0.095, 10, 10), suitMat);
    shoulder.add(shoulderCap);

    const upperArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.068, 0.24, 6, 10), suitMat);
    upperArm.position.y = -0.17;
    upperArm.castShadow = true;
    shoulder.add(upperArm);

    const elbow = new THREE.Group();
    elbow.position.y = -0.32;
    shoulder.add(elbow);

    const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.058, 0.22, 6, 10), suitMat);
    forearm.position.y = -0.15;
    elbow.add(forearm);

    const glove = new THREE.Mesh(new THREE.SphereGeometry(0.062, 8, 8), bootMat);
    glove.position.y = -0.3;
    elbow.add(glove);

    // Holographic CAD Field Tablet on Right Forearm
    if (side === 1) {
      const padFrame = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.025, 0.24), bootMat);
      padFrame.position.set(0.02, -0.25, 0.11);
      padFrame.rotation.x = 0.45;
      elbow.add(padFrame);

      const padScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.2), holoPadMat);
      padScreen.position.set(0.02, -0.233, 0.11);
      padScreen.rotation.x = -Math.PI / 2 + 0.45;
      elbow.add(padScreen);
    }

    spine.add(shoulder);
    return { shoulder, elbow };
  };

  const leftArm = buildArm(-1);
  const rightArm = buildArm(1);

  // Articulated Left & Right Legs (Hip + Thigh + Knee + Boot)
  const buildLeg = (side: -1 | 1) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.145, -0.05, 0);

    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.088, 0.32, 6, 10), pantsMat);
    thigh.position.y = -0.22;
    thigh.castShadow = true;
    hip.add(thigh);

    const knee = new THREE.Group();
    knee.position.y = -0.44;
    hip.add(knee);

    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.3, 6, 10), pantsMat);
    shin.position.y = -0.2;
    knee.add(shin);

    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.15, 0.27), bootMat);
    boot.position.set(0, -0.42, 0.045);
    boot.castShadow = true;
    knee.add(boot);

    hips.add(hip);
    return { hip, knee };
  };

  const leftLeg = buildLeg(-1);
  const rightLeg = buildLeg(1);

  // Scale slightly up to match monumental shipyard architecture readability (height ~2.35 units)
  group.scale.setScalar(1.25);

  return {
    group,
    isExternalVrm: false,
    vrmModelName: isEmployee ? 'SGW 내장 VRM 스펙 엔지니어 (본사)' : 'SGW 내장 VRM 스펙 엔지니어 (협력사)',
    updateAnimation: (_dt, elapsed, action, expression, visemes) => {
      if (action === 'run') {
        const stride = Math.sin(elapsed * 10.5);
        hips.position.y = 1.02 + Math.abs(Math.cos(elapsed * 10.5)) * 0.075;
        spine.rotation.x = 0.16;
        leftLeg.hip.rotation.x = stride * 0.68;
        rightLeg.hip.rotation.x = -stride * 0.68;
        leftLeg.knee.rotation.x = Math.max(0, -stride) * 0.55;
        rightLeg.knee.rotation.x = Math.max(0, stride) * 0.55;
        leftArm.shoulder.rotation.x = -stride * 0.55;
        rightArm.shoulder.rotation.x = stride * 0.55;
        leftArm.elbow.rotation.x = -0.35;
        rightArm.elbow.rotation.x = -0.45;
      } else if (action === 'work') {
        hips.position.y = 1.01 + Math.sin(elapsed * 2.2) * 0.015;
        spine.rotation.x = 0.12;
        leftLeg.hip.rotation.x = 0;
        rightLeg.hip.rotation.x = 0;
        leftLeg.knee.rotation.x = 0;
        rightLeg.knee.rotation.x = 0;
        rightArm.shoulder.rotation.x = -0.95;
        rightArm.elbow.rotation.x = -0.55;
        leftArm.shoulder.rotation.x = -0.78 + Math.sin(elapsed * 5.2) * 0.12;
        leftArm.elbow.rotation.x = -0.5;
        headGroup.rotation.x = 0.18;
      } else if (action === 'talk') {
        hips.position.y = 1.02 + Math.sin(elapsed * 2.6) * 0.015;
        spine.rotation.x = 0.03;
        leftLeg.hip.rotation.x = 0;
        rightLeg.hip.rotation.x = 0;
        leftLeg.knee.rotation.x = 0;
        rightLeg.knee.rotation.x = 0;
        leftArm.shoulder.rotation.x = -0.38 + Math.sin(elapsed * 4.2) * 0.24;
        rightArm.shoulder.rotation.x = -0.42 + Math.cos(elapsed * 3.8) * 0.22;
        leftArm.elbow.rotation.x = -0.45;
        rightArm.elbow.rotation.x = -0.45;
        headGroup.rotation.y = Math.sin(elapsed * 2.2) * 0.16;
        headGroup.rotation.x = 0;
      } else {
        // Idle breathing & subtle head scan
        hips.position.y = 1.02 + Math.sin(elapsed * 2.1) * 0.018;
        spine.rotation.x = 0.02;
        leftLeg.hip.rotation.x = 0;
        rightLeg.hip.rotation.x = 0;
        leftLeg.knee.rotation.x = 0;
        rightLeg.knee.rotation.x = 0;
        leftArm.shoulder.rotation.x = Math.sin(elapsed * 1.5) * 0.04;
        rightArm.shoulder.rotation.x = -0.35 + Math.cos(elapsed * 1.5) * 0.04;
        leftArm.elbow.rotation.x = -0.12;
        rightArm.elbow.rotation.x = -0.55;
        headGroup.rotation.y = Math.sin(elapsed * 0.9) * 0.14;
        headGroup.rotation.x = 0;
      }

      // Real 5-Vowel FFT Lip-Sync Blendshapes (aa / ih / ou / ee / oh)
      if (visemes && visemes.volume > 0.04) {
        const openY = 0.9 + (visemes.aa * 2.5 + visemes.oh * 1.9 + visemes.ee * 1.2 + visemes.ou * 1.1);
        const widthX = 0.72 + (visemes.ih * 0.8 + visemes.ee * 0.7 - visemes.ou * 0.35);
        mouth.scale.set(THREE.MathUtils.clamp(widthX, 0.55, 1.65), THREE.MathUtils.clamp(openY, 0.8, 3.4), 1);
      } else if (expression === 'happy') {
        mouth.scale.set(1.45, 1.2, 1);
      } else if (expression === 'focus') {
        mouth.scale.set(0.75, 0.7, 1);
      } else {
        mouth.scale.set(1, 0.85, 1);
      }
    },
    dispose: () => {
      group.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          m.geometry?.dispose();
          if (Array.isArray(m.material)) m.material.forEach((mm) => mm.dispose());
          else m.material?.dispose();
        }
      });
    },
  };
}

/**
 * Loads ANY real open-source .vrm (VRM 0.x / 1.0 via @pixiv/three-vrm) or .glb 3D character file
 * directly into the live Three.js RPG shipyard scene with full humanoid bone & expression animation!
 */
export async function loadExternalVrmOrGlbAvatar(
  file: File,
  contactShadowTex: THREE.CanvasTexture,
): Promise<BuiltHumanoidRig> {
  const objectUrl = URL.createObjectURL(file);
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));

  try {
    const gltf = await loader.loadAsync(objectUrl);
    const vrm = gltf.userData.vrm as VRM | undefined;

    const root = new THREE.Group();
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.75, 1.75),
      new THREE.MeshBasicMaterial({ map: contactShadowTex, transparent: true, opacity: 0.72, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.03;
    root.add(shadow);

    const modelRoot = vrm ? vrm.scene : gltf.scene;
    if (vrm) {
      VRMUtils.removeUnnecessaryVertices(gltf.scene);
      VRMUtils.combineSkeletons(gltf.scene);
      VRMUtils.rotateVRM0(vrm);
    }

    // Normalize bounding box height to ~2.3 units so any VRM/GLB matches shipyard proportions
    const bbox = new THREE.Box3().setFromObject(modelRoot);
    const size = bbox.getSize(new THREE.Vector3());
    const scale = size.y > 0.01 ? 2.3 / size.y : 1.3;
    modelRoot.scale.setScalar(scale);
    const scaledBox = new THREE.Box3().setFromObject(modelRoot);
    modelRoot.position.y -= scaledBox.min.y;
    modelRoot.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    root.add(modelRoot);

    const mixer = gltf.animations.length > 0 ? new THREE.AnimationMixer(modelRoot) : null;
    if (mixer && gltf.animations[0]) {
      mixer.clipAction(gltf.animations[0]).play();
    }

    let happySmooth = 0;
    let blinkTimer = 2.6;

    return {
      group: root,
      isExternalVrm: true,
      vrmModelName: file.name,
      updateAnimation: (dt, elapsed, action, expression, visemes) => {
        if (mixer) mixer.update(dt);

        if (vrm) {
          const h = vrm.humanoid;
          const lLeg = h.getNormalizedBoneNode('leftUpperLeg');
          const rLeg = h.getNormalizedBoneNode('rightUpperLeg');
          const lArm = h.getNormalizedBoneNode('leftUpperArm');
          const rArm = h.getNormalizedBoneNode('rightUpperArm');
          const spine = h.getNormalizedBoneNode('spine');
          const head = h.getNormalizedBoneNode('head');

          if (action === 'run') {
            const s = Math.sin(elapsed * 10);
            if (lLeg) lLeg.rotation.x = s * 0.65;
            if (rLeg) rLeg.rotation.x = -s * 0.65;
            if (lArm) {
              lArm.rotation.z = 1.15;
              lArm.rotation.x = -s * 0.5;
            }
            if (rArm) {
              rArm.rotation.z = -1.15;
              rArm.rotation.x = s * 0.5;
            }
            if (spine) spine.rotation.x = 0.14;
          } else if (action === 'work') {
            if (lLeg) lLeg.rotation.x = 0;
            if (rLeg) rLeg.rotation.x = 0;
            if (lArm) {
              lArm.rotation.z = 0.75;
              lArm.rotation.x = -0.8 + Math.sin(elapsed * 4.5) * 0.12;
            }
            if (rArm) {
              rArm.rotation.z = -0.75;
              rArm.rotation.x = -0.9;
            }
            if (spine) spine.rotation.x = 0.1;
          } else {
            if (lLeg) lLeg.rotation.x = 0;
            if (rLeg) rLeg.rotation.x = 0;
            if (lArm) {
              lArm.rotation.z = 1.28;
              lArm.rotation.x = Math.sin(elapsed * 1.4) * 0.05;
            }
            if (rArm) {
              rArm.rotation.z = -1.28;
              rArm.rotation.x = -Math.sin(elapsed * 1.4) * 0.05;
            }
            if (spine) spine.rotation.x = Math.sin(elapsed * 1.8) * 0.025;
            if (head) head.rotation.y = Math.sin(elapsed * 0.9) * 0.15;
          }

          // Drive ALL 5 real VRM Lip-Sync Viseme Blendshapes + Smooth Emotion & Natural Blinking
          const em = vrm.expressionManager;
          if (em) {
            happySmooth = THREE.MathUtils.damp(happySmooth, expression === 'happy' ? 0.85 : 0, 8, dt);
            em.setValue('happy', happySmooth);
            em.setValue('aa', visemes?.aa ?? 0);
            em.setValue('ih', visemes?.ih ?? 0);
            em.setValue('ou', visemes?.ou ?? 0);
            em.setValue('ee', visemes?.ee ?? 0);
            em.setValue('oh', visemes?.oh ?? 0);

            blinkTimer -= dt;
            if (blinkTimer <= -0.14) blinkTimer = 2.6 + (Math.sin(elapsed * 7.3) * 0.5 + 0.5) * 2.8;
            const blinkWeight = blinkTimer < 0 ? Math.sin(((blinkTimer + 0.14) / 0.14) * Math.PI) : 0;
            em.setValue('blink', THREE.MathUtils.clamp(blinkWeight, 0, 1));
          }
          vrm.update(dt);
        }
      },
      dispose: () => {
        if (vrm) {
          VRMUtils.deepDispose(vrm.scene);
        }
      },
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
