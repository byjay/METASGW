import * as THREE from 'three';

export type AvatarActionState = 'idle' | 'run' | 'wave' | 'sit';
/**
 * 3D-only LOD levels for harbor personnel.
 * 2D billboard sprites are strictly prohibited: avatars remain shaded volumetric
 * 3D humanoids at every camera distance and quality tier.
 */
export type AvatarLodLevel = 'detailed' | 'mid';

export interface HumanoidAvatarOptions {
  isPartner: boolean;
  shirtHex: string;
  contactShadowTex?: THREE.CanvasTexture;
  isCurrentUser?: boolean;
  skipContactShadow?: boolean;
  modelVariantIndex?: number;
  /** Low-tier optimization: lightweight MeshLambertMaterial & zero shadows, strictly still 3D volumetric. */
  simplifiedMaterial?: boolean;
}

export interface BuiltHumanoidRig {
  group: THREE.Group;
  meshCount: number;
  updateAnimation: (
    dt: number,
    elapsed: number,
    action: AvatarActionState,
    reducedMotion: boolean,
  ) => void;
  updateLod: (cameraDistance: number) => AvatarLodLevel;
  dispose: () => void;
}

/**
 * Pure distance-based 3D LOD classifier for avatars:
 *   - Near/Overview (< 240m): full detailed 3D articulated engineer with shadow casting & wrist hologram
 *   - Far (>= 240m): same volumetric 3D articulated engineer with distance-adaptive scale floor
 *     and lighter shadow/detail flags (NEVER a 2D billboard sprite or flat card)
 */
export function resolveAvatarLodLevel(cameraDistance: number): AvatarLodLevel {
  if (!Number.isFinite(cameraDistance) || cameraDistance < 240) return 'detailed';
  return 'mid';
}

interface SharedEngineerGeos {
  contactShadow: THREE.PlaneGeometry;
  groundRing: THREE.RingGeometry;
  pelvis: THREE.CylinderGeometry;
  belt: THREE.CylinderGeometry;
  beltBuckle: THREE.BoxGeometry;
  beltPouch: THREE.BoxGeometry;
  jacketTorso: THREE.CylinderGeometry;
  jacketCollar: THREE.CylinderGeometry;
  jacketZipper: THREE.BoxGeometry;
  safetyVest: THREE.BoxGeometry;
  reflectiveBand: THREE.BoxGeometry;
  reflectiveStrap: THREE.BoxGeometry;
  idBadge: THREE.BoxGeometry;
  radioBody: THREE.BoxGeometry;
  radioAntenna: THREE.CylinderGeometry;
  neck: THREE.CylinderGeometry;
  head: THREE.SphereGeometry;
  hairCap: THREE.SphereGeometry;
  eye: THREE.SphereGeometry;
  ear: THREE.SphereGeometry;
  helmetDome: THREE.SphereGeometry;
  helmetRidge: THREE.BoxGeometry;
  helmetVisor: THREE.CylinderGeometry;
  helmetChinStrap: THREE.TorusGeometry;
  headlampHousing: THREE.BoxGeometry;
  headlampLens: THREE.CylinderGeometry;
  shoulderCap: THREE.SphereGeometry;
  upperArm: THREE.CapsuleGeometry;
  elbowJoint: THREE.SphereGeometry;
  forearm: THREE.CapsuleGeometry;
  cuffStripe: THREE.CylinderGeometry;
  hand: THREE.BoxGeometry;
  tabletStrap: THREE.CylinderGeometry;
  tabletFrame: THREE.BoxGeometry;
  tabletScreen: THREE.BoxGeometry;
  thigh: THREE.CapsuleGeometry;
  kneeJoint: THREE.SphereGeometry;
  shin: THREE.CapsuleGeometry;
  ankleBand: THREE.CylinderGeometry;
  bootUpper: THREE.BoxGeometry;
  bootSole: THREE.BoxGeometry;
}

let _sharedGeo: SharedEngineerGeos | null = null;
function getSharedGeos(): SharedEngineerGeos {
  if (_sharedGeo) return _sharedGeo;
  const groundRing = new THREE.RingGeometry(0.38, 0.46, 24);
  groundRing.rotateX(-Math.PI / 2);

  _sharedGeo = {
    contactShadow: new THREE.PlaneGeometry(1.9, 1.9),
    groundRing,
    pelvis: new THREE.CylinderGeometry(0.175, 0.165, 0.19, 12),
    belt: new THREE.CylinderGeometry(0.186, 0.186, 0.048, 12),
    beltBuckle: new THREE.BoxGeometry(0.068, 0.056, 0.032),
    beltPouch: new THREE.BoxGeometry(0.075, 0.11, 0.058),
    jacketTorso: new THREE.CylinderGeometry(0.215, 0.168, 0.46, 14),
    jacketCollar: new THREE.CylinderGeometry(0.095, 0.118, 0.068, 12),
    jacketZipper: new THREE.BoxGeometry(0.028, 0.42, 0.018),
    safetyVest: new THREE.BoxGeometry(0.435, 0.37, 0.275),
    reflectiveBand: new THREE.BoxGeometry(0.452, 0.044, 0.292),
    reflectiveStrap: new THREE.BoxGeometry(0.052, 0.375, 0.288),
    idBadge: new THREE.BoxGeometry(0.068, 0.088, 0.014),
    radioBody: new THREE.BoxGeometry(0.052, 0.115, 0.038),
    radioAntenna: new THREE.CylinderGeometry(0.006, 0.008, 0.11, 6),
    neck: new THREE.CylinderGeometry(0.058, 0.07, 0.095, 10),
    head: new THREE.SphereGeometry(0.15, 16, 14),
    hairCap: new THREE.SphereGeometry(0.157, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.62),
    eye: new THREE.SphereGeometry(0.018, 8, 8),
    ear: new THREE.SphereGeometry(0.028, 8, 8),
    helmetDome: new THREE.SphereGeometry(0.182, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.56),
    helmetRidge: new THREE.BoxGeometry(0.048, 0.042, 0.29),
    helmetVisor: new THREE.CylinderGeometry(0.194, 0.214, 0.022, 16, 1, false, -Math.PI * 0.45, Math.PI * 0.9),
    helmetChinStrap: new THREE.TorusGeometry(0.152, 0.011, 6, 16, Math.PI),
    headlampHousing: new THREE.BoxGeometry(0.076, 0.048, 0.046),
    headlampLens: new THREE.CylinderGeometry(0.021, 0.021, 0.014, 12),
    shoulderCap: new THREE.SphereGeometry(0.068, 10, 8),
    upperArm: new THREE.CapsuleGeometry(0.052, 0.18, 4, 10),
    elbowJoint: new THREE.SphereGeometry(0.054, 10, 8),
    forearm: new THREE.CapsuleGeometry(0.045, 0.17, 4, 10),
    cuffStripe: new THREE.CylinderGeometry(0.049, 0.049, 0.028, 10),
    hand: new THREE.BoxGeometry(0.058, 0.076, 0.044),
    tabletStrap: new THREE.CylinderGeometry(0.052, 0.052, 0.045, 10),
    tabletFrame: new THREE.BoxGeometry(0.092, 0.125, 0.026),
    tabletScreen: new THREE.BoxGeometry(0.076, 0.104, 0.012),
    thigh: new THREE.CapsuleGeometry(0.068, 0.24, 4, 10),
    kneeJoint: new THREE.SphereGeometry(0.064, 10, 8),
    shin: new THREE.CapsuleGeometry(0.056, 0.23, 4, 10),
    ankleBand: new THREE.CylinderGeometry(0.061, 0.061, 0.032, 10),
    bootUpper: new THREE.BoxGeometry(0.108, 0.095, 0.198),
    bootSole: new THREE.BoxGeometry(0.118, 0.028, 0.218),
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
 * Builds the procedural 3D volumetric marine engineer humanoid avatar (24+ sculpted 3D meshes):
 *   - Safety helmet with glossy shell, crown ridge, front visor, chin strap & glowing LED headlamp
 *   - Sculpted head (skin, eyes, ears, hair cap, neck)
 *   - High-visibility reflective work jacket (collar, zipper, vest overlay, horizontal & vertical
 *     reflective safety stripes, chest ID badge, VHF walkie-talkie, utility belt, metallic buckle, tool pouch)
 *   - Articulated shoulders, upper arms, elbow joints, forearms, reflective cuffs, hands & wrist holographic tablet
 *   - Articulated hips, thighs, reinforced knee joints, shins with ankle reflective bands & rugged safety boots
 *   - Ground status ring + optional soft contact shadow
 *
 * Strictly 3D volumetric at every camera distance and quality tier (ZERO 2D sprites, ZERO VRM white-mannequin swap).
 */
export function buildHumanoidEngineerAvatar(options: HumanoidAvatarOptions): BuiltHumanoidRig {
  const g = getSharedGeos();
  const group = new THREE.Group();
  group.name = options.isCurrentUser ? 'avatar_current_user' : 'avatar_colleague';

  const jacketHex = new THREE.Color(options.shirtHex).getHex();
  const collarHex = new THREE.Color(options.shirtHex).multiplyScalar(0.76).getHex();
  const helmetHex = options.isPartner ? 0xfbbf24 : options.isCurrentUser ? 0x38bdf8 : 0xf8fafc;
  const vestHex = options.isPartner ? 0xea580c : options.isCurrentUser ? 0x0284c7 : 0x0369a1;
  const ringHex = options.isCurrentUser ? 0x38bdf8 : options.isPartner ? 0xf59e0b : 0x10b981;

  // Skin/hair slight deterministic variation per colleague index for natural shipyard crew diversity
  const variant = Math.abs(options.modelVariantIndex ?? 0) % 4;
  const skinPalette = [0xf1c29b, 0xe8b48a, 0xf4caa6, 0xdfa67b];
  const hairPalette = [0x1f1b18, 0x2b2420, 0x18181b, 0x362a22];
  const skinHex = skinPalette[variant];
  const hairHex = hairPalette[variant];

  const simplified = Boolean(options.simplifiedMaterial);
  const makeShadedMat = (
    key: string,
    params: {
      color: number;
      roughness?: number;
      metalness?: number;
      emissive?: number;
      emissiveIntensity?: number;
    },
  ): THREE.Material => {
    if (simplified) {
      return getCachedMat(
        `simp_${key}`,
        () =>
          new THREE.MeshLambertMaterial({
            color: params.color,
            emissive: params.emissive ?? 0x000000,
            emissiveIntensity: params.emissiveIntensity ?? 0,
          }),
      );
    }
    return getCachedMat(
      key,
      () =>
        new THREE.MeshStandardMaterial({
          color: params.color,
          roughness: params.roughness ?? 0.6,
          metalness: params.metalness ?? 0.05,
          emissive: params.emissive ?? 0x000000,
          emissiveIntensity: params.emissiveIntensity ?? 0,
        }),
    );
  };

  // Shared Materials: full PBR on high/medium, lightweight Lambert on low (strictly 3D volumetric always)
  const jacketMat = makeShadedMat(`eng_jacket_${jacketHex}`, {
    color: jacketHex,
    roughness: 0.7,
    metalness: 0.05,
  });
  const collarMat = makeShadedMat(`eng_collar_${collarHex}`, {
    color: collarHex,
    roughness: 0.74,
    metalness: 0.04,
  });
  const vestMat = makeShadedMat(`eng_vest_${vestHex}`, {
    color: vestHex,
    roughness: 0.52,
    metalness: 0.08,
  });
  const reflectiveMat = makeShadedMat('eng_reflective_stripe', {
    color: 0xf1f5f9,
    emissive: 0xcbd5e1,
    emissiveIntensity: 0.24,
    roughness: 0.22,
    metalness: 0.52,
  });
  const trousersMat = makeShadedMat('eng_trousers', {
    color: 0x1e293b,
    roughness: 0.78,
    metalness: 0.04,
  });
  const jointPadMat = makeShadedMat('eng_joint_pad', {
    color: 0x334155,
    roughness: 0.6,
    metalness: 0.12,
  });
  const leatherDarkMat = makeShadedMat('eng_dark_gear', {
    color: 0x111827,
    roughness: 0.48,
    metalness: 0.18,
  });
  const bootUpperMat = makeShadedMat('eng_boot_upper', {
    color: 0x18181b,
    roughness: 0.5,
    metalness: 0.16,
  });
  const bootSoleMat = makeShadedMat('eng_boot_sole', {
    color: 0x09090b,
    roughness: 0.82,
    metalness: 0.06,
  });
  const metalBuckleMat = makeShadedMat('eng_metal_buckle', {
    color: 0xdbeafe,
    roughness: 0.22,
    metalness: 0.85,
  });
  const skinMat = makeShadedMat(`eng_skin_${skinHex}`, {
    color: skinHex,
    roughness: 0.6,
    metalness: 0.02,
  });
  const hairMat = makeShadedMat(`eng_hair_${hairHex}`, {
    color: hairHex,
    roughness: 0.76,
    metalness: 0.04,
  });
  const eyeMat = makeShadedMat('eng_eye', {
    color: 0x0f172a,
    roughness: 0.16,
    metalness: 0.05,
  });
  const helmetMat = makeShadedMat(`eng_helmet_${helmetHex}`, {
    color: helmetHex,
    roughness: 0.22,
    metalness: 0.2,
  });
  const headlampHousingMat = makeShadedMat('eng_headlamp_housing', {
    color: 0x1e293b,
    roughness: 0.34,
    metalness: 0.5,
  });
  const headlampLensMat = makeShadedMat('eng_headlamp_lens', {
    color: 0xfef9c3,
    emissive: 0xfde047,
    emissiveIntensity: 1.15,
    roughness: 0.12,
    metalness: 0.08,
  });
  const idBadgeMat = makeShadedMat('eng_id_badge', {
    color: 0xf8fafc,
    roughness: 0.3,
    metalness: 0.08,
  });
  const tabletFrameMat = makeShadedMat('eng_tablet_frame', {
    color: 0x0f172a,
    roughness: 0.32,
    metalness: 0.58,
  });
  const tabletScreenMat = makeShadedMat('eng_tablet_screen', {
    color: 0x7dd3fc,
    emissive: 0x0ea5e9,
    emissiveIntensity: 0.92,
    roughness: 0.14,
    metalness: 0.12,
  });
  const groundRingMat = getCachedMat(
    `eng_ring_${ringHex}`,
    () =>
      new THREE.MeshBasicMaterial({
        color: ringHex,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
  );

  // Soft contact shadow when not externally instanced
  if (!options.skipContactShadow && options.contactShadowTex) {
    const shadowMat = getCachedMat(
      `eng_shadow_${options.contactShadowTex.uuid}`,
      () =>
        new THREE.MeshBasicMaterial({
          map: options.contactShadowTex,
          transparent: true,
          opacity: 0.58,
          depthWrite: false,
        }),
    );
    const shadowMesh = new THREE.Mesh(g.contactShadow, shadowMat);
    shadowMesh.name = 'avatar_contact_shadow';
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = 0.025;
    group.add(shadowMesh);
  }

  // Root container scaled smoothly by camera distance (always 3D volumetric)
  const rigContainer = new THREE.Group();
  rigContainer.name = 'engineer_rig_container';
  group.add(rigContainer);

  // Base diorama scale: ~2.78m height up close (natural beside quay gantries & ships)
  const rigRoot = new THREE.Group();
  rigRoot.name = 'engineer_humanoid_root';
  rigRoot.scale.setScalar(1.45);
  rigContainer.add(rigRoot);

  const shadowCasters: THREE.Mesh[] = [];
  const registerMesh = (mesh: THREE.Mesh, name: string, castsShadow = true): THREE.Mesh => {
    mesh.name = name;
    const allowShadow = !simplified && castsShadow;
    mesh.castShadow = allowShadow;
    mesh.receiveShadow = !simplified;
    if (allowShadow) shadowCasters.push(mesh);
    return mesh;
  };

  // 1) Ground status ring (flat on quay)
  const groundRing = registerMesh(
    new THREE.Mesh(g.groundRing, groundRingMat),
    'ground_status_ring',
    false,
  );
  groundRing.position.y = 0.032;
  rigRoot.add(groundRing);

  // 2) Pelvis & Utility Belt (y = 0.88 -> legs drop exactly 0.88 to y = 0.000)
  const hips = new THREE.Group();
  hips.name = 'hips_joint';
  hips.position.y = 0.88;
  rigRoot.add(hips);

  const pelvisMesh = registerMesh(new THREE.Mesh(g.pelvis, trousersMat), 'pelvis');
  pelvisMesh.position.y = 0.02;
  pelvisMesh.scale.set(1.06, 1.0, 0.72);
  hips.add(pelvisMesh);

  const beltMesh = registerMesh(new THREE.Mesh(g.belt, leatherDarkMat), 'utility_belt', false);
  beltMesh.position.y = 0.1;
  beltMesh.scale.set(1.06, 1.0, 0.74);
  hips.add(beltMesh);

  const beltBuckleMesh = registerMesh(new THREE.Mesh(g.beltBuckle, metalBuckleMat), 'belt_buckle', false);
  beltBuckleMesh.position.set(0, 0.1, 0.138);
  hips.add(beltBuckleMesh);

  const beltPouchMesh = registerMesh(new THREE.Mesh(g.beltPouch, jointPadMat), 'belt_tool_pouch', false);
  beltPouchMesh.position.set(0.185, 0.075, 0.02);
  hips.add(beltPouchMesh);

  // 3) Spine, Marine Work Jacket, High-Vis Vest & Reflective Stripes
  const spine = new THREE.Group();
  spine.name = 'spine_joint';
  spine.position.y = 0.11;
  hips.add(spine);

  const jacketTorsoMesh = registerMesh(new THREE.Mesh(g.jacketTorso, jacketMat), 'marine_work_jacket');
  jacketTorsoMesh.position.y = 0.25;
  jacketTorsoMesh.scale.set(1.08, 1.0, 0.68);
  spine.add(jacketTorsoMesh);

  const jacketCollarMesh = registerMesh(new THREE.Mesh(g.jacketCollar, collarMat), 'jacket_collar', false);
  jacketCollarMesh.position.y = 0.485;
  spine.add(jacketCollarMesh);

  const jacketZipperMesh = registerMesh(new THREE.Mesh(g.jacketZipper, leatherDarkMat), 'jacket_zipper', false);
  jacketZipperMesh.position.set(0, 0.25, 0.142);
  spine.add(jacketZipperMesh);

  const safetyVestMesh = registerMesh(new THREE.Mesh(g.safetyVest, vestMat), 'high_vis_safety_vest');
  safetyVestMesh.position.set(0, 0.245, 0);
  spine.add(safetyVestMesh);

  const reflectiveLower = registerMesh(
    new THREE.Mesh(g.reflectiveBand, reflectiveMat),
    'reflective_stripe_lower',
    false,
  );
  reflectiveLower.position.set(0, 0.14, 0);
  spine.add(reflectiveLower);

  const reflectiveUpper = registerMesh(
    new THREE.Mesh(g.reflectiveBand, reflectiveMat),
    'reflective_stripe_upper',
    false,
  );
  reflectiveUpper.position.set(0, 0.245, 0);
  spine.add(reflectiveUpper);

  const reflectiveLeftStrap = registerMesh(
    new THREE.Mesh(g.reflectiveStrap, reflectiveMat),
    'reflective_strap_left',
    false,
  );
  reflectiveLeftStrap.position.set(-0.115, 0.25, 0);
  spine.add(reflectiveLeftStrap);

  const reflectiveRightStrap = registerMesh(
    new THREE.Mesh(g.reflectiveStrap, reflectiveMat),
    'reflective_strap_right',
    false,
  );
  reflectiveRightStrap.position.set(0.115, 0.25, 0);
  spine.add(reflectiveRightStrap);

  const chestIdBadge = registerMesh(new THREE.Mesh(g.idBadge, idBadgeMat), 'chest_id_badge', false);
  chestIdBadge.position.set(-0.115, 0.34, 0.146);
  spine.add(chestIdBadge);

  const chestRadio = registerMesh(new THREE.Mesh(g.radioBody, leatherDarkMat), 'chest_vhf_radio', false);
  chestRadio.position.set(0.125, 0.345, 0.145);
  spine.add(chestRadio);

  const radioAntenna = registerMesh(
    new THREE.Mesh(g.radioAntenna, leatherDarkMat),
    'chest_radio_antenna',
    false,
  );
  radioAntenna.position.set(0.142, 0.445, 0.145);
  spine.add(radioAntenna);

  // 4) Sculpted Head & Industrial Safety Helmet with Visor + Glowing Headlamp
  const headGroup = new THREE.Group();
  headGroup.name = 'head_joint';
  headGroup.position.y = 0.51;
  spine.add(headGroup);

  const neckMesh = registerMesh(new THREE.Mesh(g.neck, skinMat), 'neck', false);
  neckMesh.position.y = 0.025;
  headGroup.add(neckMesh);

  const headMesh = registerMesh(new THREE.Mesh(g.head, skinMat), 'head_sculpt');
  headMesh.position.y = 0.17;
  headMesh.scale.set(0.93, 1.06, 0.96);
  headGroup.add(headMesh);

  const hairCapMesh = registerMesh(new THREE.Mesh(g.hairCap, hairMat), 'hair_cap', false);
  hairCapMesh.position.set(0, 0.18, -0.02);
  hairCapMesh.rotation.x = -0.22;
  headGroup.add(hairCapMesh);

  const leftEyeMesh = registerMesh(new THREE.Mesh(g.eye, eyeMat), 'eye_left', false);
  leftEyeMesh.position.set(-0.048, 0.165, 0.138);
  headGroup.add(leftEyeMesh);

  const rightEyeMesh = registerMesh(new THREE.Mesh(g.eye, eyeMat), 'eye_right', false);
  rightEyeMesh.position.set(0.048, 0.165, 0.138);
  headGroup.add(rightEyeMesh);

  const leftEarMesh = registerMesh(new THREE.Mesh(g.ear, skinMat), 'ear_left', false);
  leftEarMesh.position.set(-0.138, 0.168, -0.006);
  leftEarMesh.scale.set(0.55, 1.0, 0.85);
  headGroup.add(leftEarMesh);

  const rightEarMesh = registerMesh(new THREE.Mesh(g.ear, skinMat), 'ear_right', false);
  rightEarMesh.position.set(0.138, 0.168, -0.006);
  rightEarMesh.scale.set(0.55, 1.0, 0.85);
  headGroup.add(rightEarMesh);

  const helmetDomeMesh = registerMesh(new THREE.Mesh(g.helmetDome, helmetMat), 'safety_helmet_dome');
  helmetDomeMesh.position.set(0, 0.232, 0);
  headGroup.add(helmetDomeMesh);

  const helmetRidgeMesh = registerMesh(new THREE.Mesh(g.helmetRidge, helmetMat), 'safety_helmet_ridge', false);
  helmetRidgeMesh.position.set(0, 0.394, -0.005);
  headGroup.add(helmetRidgeMesh);

  const helmetVisorMesh = registerMesh(new THREE.Mesh(g.helmetVisor, helmetMat), 'safety_helmet_visor', false);
  helmetVisorMesh.position.set(0, 0.228, 0.046);
  helmetVisorMesh.rotation.x = 0.08;
  headGroup.add(helmetVisorMesh);

  const helmetChinStrap = registerMesh(
    new THREE.Mesh(g.helmetChinStrap, leatherDarkMat),
    'helmet_chin_strap',
    false,
  );
  helmetChinStrap.position.set(0, 0.228, 0.008);
  helmetChinStrap.rotation.x = Math.PI;
  headGroup.add(helmetChinStrap);

  const headlampHousing = registerMesh(
    new THREE.Mesh(g.headlampHousing, headlampHousingMat),
    'helmet_headlamp_housing',
    false,
  );
  headlampHousing.position.set(0, 0.308, 0.168);
  headGroup.add(headlampHousing);

  const headlampLens = registerMesh(
    new THREE.Mesh(g.headlampLens, headlampLensMat),
    'helmet_headlamp_lens',
    false,
  );
  headlampLens.rotation.x = Math.PI / 2;
  headlampLens.position.set(0, 0.308, 0.193);
  headGroup.add(headlampLens);

  // 5) Articulated Arms (Shoulder -> Upper Arm -> Elbow Joint -> Forearm -> Cuff -> Hand + Left Wrist Hologram Tablet)
  const buildArm = (side: 'left' | 'right') => {
    const sign = side === 'left' ? -1 : 1;
    const shoulder = new THREE.Group();
    shoulder.name = `${side}_shoulder_joint`;
    shoulder.position.set(sign * 0.275, 0.42, 0);
    spine.add(shoulder);

    const shoulderCap = registerMesh(
      new THREE.Mesh(g.shoulderCap, jacketMat),
      `${side}_shoulder_cap`,
      false,
    );
    shoulder.add(shoulderCap);

    const upperArm = registerMesh(new THREE.Mesh(g.upperArm, jacketMat), `${side}_upper_arm`);
    upperArm.position.set(0, -0.14, 0);
    shoulder.add(upperArm);

    const elbow = new THREE.Group();
    elbow.name = `${side}_elbow_joint`;
    elbow.position.set(0, -0.28, 0);
    shoulder.add(elbow);

    const elbowJointMesh = registerMesh(
      new THREE.Mesh(g.elbowJoint, jointPadMat),
      `${side}_elbow_pad`,
      false,
    );
    elbow.add(elbowJointMesh);

    const forearm = registerMesh(new THREE.Mesh(g.forearm, jacketMat), `${side}_forearm`);
    forearm.position.set(0, -0.135, 0.01);
    elbow.add(forearm);

    const cuff = registerMesh(new THREE.Mesh(g.cuffStripe, reflectiveMat), `${side}_cuff_stripe`, false);
    cuff.position.set(0, -0.22, 0.012);
    elbow.add(cuff);

    const hand = registerMesh(new THREE.Mesh(g.hand, skinMat), `${side}_hand`, false);
    hand.position.set(0, -0.278, 0.016);
    elbow.add(hand);

    return { shoulder, elbow };
  };

  const leftArm = buildArm('left');
  const rightArm = buildArm('right');

  // Left Wrist Holographic Engineering Tablet
  const wristTabletGroup = new THREE.Group();
  wristTabletGroup.name = 'wrist_hologram_tablet';
  wristTabletGroup.position.set(-0.022, -0.175, 0.056);
  wristTabletGroup.rotation.set(-0.28, -0.25, 0.08);
  leftArm.elbow.add(wristTabletGroup);

  const tabletStrap = registerMesh(
    new THREE.Mesh(g.tabletStrap, leatherDarkMat),
    'wrist_tablet_strap',
    false,
  );
  tabletStrap.position.set(0.022, 0, -0.044);
  wristTabletGroup.add(tabletStrap);

  const tabletFrame = registerMesh(
    new THREE.Mesh(g.tabletFrame, tabletFrameMat),
    'wrist_tablet_frame',
    false,
  );
  wristTabletGroup.add(tabletFrame);

  const tabletScreen = registerMesh(
    new THREE.Mesh(g.tabletScreen, tabletScreenMat),
    'wrist_tablet_hologram_screen',
    false,
  );
  tabletScreen.position.set(0, 0, 0.012);
  wristTabletGroup.add(tabletScreen);

  // 6) Articulated Legs (Hip -> Thigh -> Knee Joint Pad -> Shin -> Ankle Band -> Rugged Safety Boot)
  const buildLeg = (side: 'left' | 'right') => {
    const sign = side === 'left' ? -1 : 1;
    const hip = new THREE.Group();
    hip.name = `${side}_hip_joint`;
    hip.position.set(sign * 0.112, -0.04, 0);
    hips.add(hip);

    const thigh = registerMesh(new THREE.Mesh(g.thigh, trousersMat), `${side}_thigh`);
    thigh.position.set(0, -0.19, 0);
    hip.add(thigh);

    const knee = new THREE.Group();
    knee.name = `${side}_knee_joint`;
    knee.position.set(0, -0.39, 0);
    hip.add(knee);

    const kneePad = registerMesh(new THREE.Mesh(g.kneeJoint, jointPadMat), `${side}_knee_pad`, false);
    kneePad.position.set(0, 0, 0.014);
    knee.add(kneePad);

    const shin = registerMesh(new THREE.Mesh(g.shin, trousersMat), `${side}_shin`);
    shin.position.set(0, -0.185, 0);
    knee.add(shin);

    const ankleBand = registerMesh(
      new THREE.Mesh(g.ankleBand, reflectiveMat),
      `${side}_ankle_reflective`,
      false,
    );
    ankleBand.position.set(0, -0.295, 0);
    knee.add(ankleBand);

    const bootUpper = registerMesh(new THREE.Mesh(g.bootUpper, bootUpperMat), `${side}_boot_upper`);
    bootUpper.position.set(0, -0.378, 0.032);
    knee.add(bootUpper);

    const bootSole = registerMesh(new THREE.Mesh(g.bootSole, bootSoleMat), `${side}_boot_sole`, false);
    bootSole.position.set(0, -0.436, 0.034);
    knee.add(bootSole);

    return { hip, knee };
  };

  const leftLeg = buildLeg('left');
  const rightLeg = buildLeg('right');

  // Count distinct 3D meshes built into this humanoid rig
  let meshCount = 0;
  group.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) meshCount += 1;
  });

  let lastLod: AvatarLodLevel = 'detailed';

  return {
    group,
    meshCount,
    updateLod: (cameraDistance: number) => {
      const nextLod = resolveAvatarLodLevel(cameraDistance);
      const safeDist = Number.isFinite(cameraDistance) ? cameraDistance : 160;

      // Distance-adaptive minimum screen-size scale floor:
      // Keeps natural 1.0x human proportion close-up (d <= 40m) and scales smoothly up to 3.25x
      // at maximum harbor zoom-out (d = 450..800m) so volumetric 3D engineers stay legible everywhere.
      const distScale =
        safeDist <= 40
          ? 1.0
          : THREE.MathUtils.clamp(1.0 + ((safeDist - 40) / 145) * 1.18, 1.0, 3.25);
      rigContainer.scale.setScalar(distScale);

      if (nextLod !== lastLod) {
        lastLod = nextLod;
        const enableShadows = nextLod === 'detailed';
        for (let i = 0; i < shadowCasters.length; i += 1) {
          shadowCasters[i].castShadow = enableShadows;
        }
        // Keep tiny sub-pixel hologram bezel hidden only at extreme far zoom while preserving full 3D body
        wristTabletGroup.visible = nextLod === 'detailed';
      }

      return nextLod;
    },
    updateAnimation: (_dt, elapsed, action, reducedMotion) => {
      if (action === 'sit') {
        // Seated bench pose for 'away' (자리비움) colleagues — always applied even in reducedMotion/low-tier
        hips.position.y = 0.44;
        hips.position.z = 0.04;
        hips.rotation.y = 0;
        const breathe = reducedMotion ? 0 : Math.sin(elapsed * 1.6) * 0.015;
        const headLookY = reducedMotion ? 0 : Math.sin(elapsed * 0.65) * 0.2;
        spine.rotation.set(-0.08 + breathe, 0, 0);
        headGroup.rotation.set(0.03, headLookY, 0);

        leftLeg.hip.rotation.x = -1.48;
        rightLeg.hip.rotation.x = -1.48;
        leftLeg.knee.rotation.x = 1.46;
        rightLeg.knee.rotation.x = 1.46;

        leftArm.shoulder.rotation.set(-0.48, 0.14, 0.08);
        leftArm.elbow.rotation.x = -0.82;
        rightArm.shoulder.rotation.set(-0.42, -0.1, -0.08);
        rightArm.elbow.rotation.x = -0.74;
        return;
      }

      hips.position.z = 0;

      if (reducedMotion) {
        hips.position.y = 0.88;
        hips.rotation.y = 0;
        spine.rotation.set(0.02, 0, 0);
        headGroup.rotation.set(0, 0, 0);
        leftLeg.hip.rotation.x = 0;
        rightLeg.hip.rotation.x = 0;
        leftLeg.knee.rotation.x = 0.03;
        rightLeg.knee.rotation.x = 0.03;
        leftArm.shoulder.rotation.set(-0.28, 0.1, 0.08);
        leftArm.elbow.rotation.x = -0.52;
        rightArm.shoulder.rotation.set(0, 0, -0.08);
        rightArm.elbow.rotation.x = -0.18;
        return;
      }

      if (action === 'run') {
        const stride = Math.sin(elapsed * 9.8);
        const lift = Math.abs(Math.cos(elapsed * 9.8));
        hips.position.y = 0.88 + lift * 0.045;
        hips.rotation.y = stride * 0.07;
        spine.rotation.set(0.085, -stride * 0.11, 0);

        leftLeg.hip.rotation.x = stride * 0.56;
        rightLeg.hip.rotation.x = -stride * 0.56;
        leftLeg.knee.rotation.x = Math.max(0, -stride) * 0.68 + 0.06;
        rightLeg.knee.rotation.x = Math.max(0, stride) * 0.68 + 0.06;

        leftArm.shoulder.rotation.set(-stride * 0.46, 0, 0.08);
        rightArm.shoulder.rotation.set(stride * 0.46, 0, -0.08);
        leftArm.elbow.rotation.x = -0.32 - Math.max(0, stride) * 0.26;
        rightArm.elbow.rotation.x = -0.26 - Math.max(0, -stride) * 0.28;

        headGroup.rotation.set(-0.04, Math.sin(elapsed * 1.1) * 0.07, 0);
      } else if (action === 'wave') {
        hips.position.y = 0.88 + Math.sin(elapsed * 2.2) * 0.012;
        hips.rotation.y = 0;
        spine.rotation.set(0.02, Math.sin(elapsed * 1.4) * 0.06, 0);

        leftLeg.hip.rotation.x = 0;
        rightLeg.hip.rotation.x = 0;
        leftLeg.knee.rotation.x = 0.04;
        rightLeg.knee.rotation.x = 0.04;

        leftArm.shoulder.rotation.set(-0.44, 0.18, 0.12);
        leftArm.elbow.rotation.x = -0.78;
        rightArm.shoulder.rotation.set(-2.25, 0, -0.34 + Math.sin(elapsed * 7.6) * 0.24);
        rightArm.elbow.rotation.x = -0.45 - Math.sin(elapsed * 7.6) * 0.22;

        headGroup.rotation.set(Math.sin(elapsed * 2.4) * 0.06, Math.sin(elapsed * 1.6) * 0.16, 0);
      } else {
        // Standing / inspecting holographic wrist tablet
        hips.position.y = 0.88 + Math.sin(elapsed * 2.0) * 0.012;
        hips.rotation.y = 0;
        spine.rotation.set(0.025, Math.sin(elapsed * 0.7) * 0.035, 0);

        leftLeg.hip.rotation.x = 0;
        rightLeg.hip.rotation.x = 0;
        leftLeg.knee.rotation.x = 0.03;
        rightLeg.knee.rotation.x = 0.03;

        leftArm.shoulder.rotation.set(-0.36 + Math.sin(elapsed * 1.3) * 0.04, 0.14, 0.1);
        leftArm.elbow.rotation.x = -0.68 + Math.sin(elapsed * 1.3) * 0.05;
        rightArm.shoulder.rotation.set(Math.sin(elapsed * 1.2) * 0.04, 0, -0.09);
        rightArm.elbow.rotation.x = -0.22;

        headGroup.rotation.set(0.04, Math.sin(elapsed * 0.85) * 0.16, 0);
      }
    },
    dispose: () => {
      // Geometries and PBR materials are cached & shared across avatars to minimize GPU overhead.
      group.clear();
    },
  };
}

/**
 * Alias preserved for HarborScene and existing callers — always delegates to the
 * 3D volumetric articulated engineer builder.
 */
export const buildHarborAvatar = buildHumanoidEngineerAvatar;
