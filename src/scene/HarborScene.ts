import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import {
  findQuayPath,
  PORTAL_BUILDINGS,
  type ObstacleBox2D,
  type PortalBuildingSpec,
  type Vec2,
} from '../core/navMeshEngine';
import {
  AVATAR_PROP_MIN_CLEARANCE,
  CAMERA_MIN_DISTANCE,
  CAMERA_PERSON_FOCUS_DEFAULT_DIST,
  CAMERA_WHEEL_MIN_DISTANCE,
  clampCameraCollision,
  clampCloseZoomCameraFraming,
  computePersonFocusCameraPose,
  computePolarAngleBoundsForDistance,
  HARBOR_ALL_OBSTACLES,
  PLAYER_DEFAULT_SPAWN,
  PLAYER_POLE_MIN_CLEARANCE,
  resolveAvatarPhysicsMovement,
  resolveAvatarPropClearance,
  resolveAvatarSpawnOverlaps,
  sampleHarborElevation,
  WORKER_CHEST_HEIGHT_OFFSET,
} from '../core/physicsCollision';
import {
  evaluateAutoQualityDowngrade,
  resolvePixelRatioForQuality,
} from '../deviceProfile';
import {
  assertValidShipBerths,
  selectVisibleQuayColleagues,
  type HarborPerson,
  type HarborShip,
} from '../mapping';
import {
  assignHubBuildingSlots,
  buildHubBuildingColliders,
  type HubBuildingPlacement,
} from '../meta/hubBuildingModel';
import type { HubModuleChipItem } from '../meta/hubChipModel';
import type { ShipDisplayPrefsMap } from '../shipDisplayPrefs';
import type {
  AvatarSceneGraphAudit,
  CameraPreset,
  ClickedDecorativeShip,
  HarborSceneCallbacks,
  HarborSceneHandle,
  HarborSceneInitOptions,
  HubBuildingSceneAudit,
  ProjectedLabel,
  QualityTier,
  RenderBatchMetrics,
  RenderMetrics,
  ScreenAnchorPoint,
} from './harborSceneTypes';
import {
  buildHumanoidEngineerAvatar,
  type AvatarActionState,
  type BuiltHumanoidRig,
} from './humanoidAvatar';
import { InfiniteWorldChunkManager } from './infiniteWorldChunks';
import {
  collectSceneBatchStats,
  createInstancedContactShadowBatch,
  createInstancedRingBatch,
} from './meshBatching';
import { createMaritimeOcean, type OceanWaterSystem } from './oceanShader';
import { buildShipyardWorld, type ShipyardWorldHandles } from './shipyardWorld';
import {
  OCCLUDED_VERTICAL_PROP_OPACITY,
  SuperstructureOcclusionController,
} from './superstructureOcclusion';
import { createHarborTextures, type HarborTexturePack } from './textures';

export type {
  CameraPreset,
  ClickedDecorativeShip,
  HarborSceneCallbacks,
  HarborSceneHandle,
  HarborSceneInitOptions,
  ProjectedLabel,
  QualityTier,
  RenderBatchMetrics,
  RenderMetrics,
  ScreenAnchorPoint,
};

interface PersonNpcRuntime {
  person: HarborPerson;
  rig: BuiltHumanoidRig;
  hitProxy: THREE.Mesh;
  phase: number;
  instanceIdx: number;
  homeX: number;
  homeZ: number;
  curX: number;
  curZ: number;
  heading: number;
  patrolDir: 1 | -1;
  patrolRange: number;
  isSeated: boolean;
}

const _scratchProj = new THREE.Vector3();
const _scratchMouse = new THREE.Vector2();
const _scratchHit = new THREE.Vector3();
const _quayPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.61);
const _sunVec = new THREE.Vector3();
const _scratchForward = new THREE.Vector3();
const _scratchRight = new THREE.Vector3();
const _scratchCamUp = new THREE.Vector3(0, 1, 0);
const _scratchOffset = new THREE.Vector3();
const _scratchOcclusionTarget = new THREE.Vector3();
const _scratchInstDummy = new THREE.Object3D();

/**
 * Procedural Maritime Sky Dome — smooth azure day & golden sunset gradient with
 * zero Preetham white horizon blowout strip directly below the top HUD.
 */
function createMaritimeSkyDome(): {
  mesh: THREE.Mesh;
  uniforms: {
    uZenithColor: { value: THREE.Color };
    uMidColor: { value: THREE.Color };
    uHorizonColor: { value: THREE.Color };
    uNadirColor: { value: THREE.Color };
    uSunDir: { value: THREE.Vector3 };
    uSunColor: { value: THREE.Color };
    uSunGlow: { value: number };
  };
} {
  const uniforms = {
    uZenithColor: { value: new THREE.Color(0x145cb3) },
    uMidColor: { value: new THREE.Color(0x3e91db) },
    uHorizonColor: { value: new THREE.Color(0x93c7ec) },
    uNadirColor: { value: new THREE.Color(0x08345e) },
    uSunDir: { value: new THREE.Vector3(0.45, 0.65, 0.6) },
    uSunColor: { value: new THREE.Color(0xfff5db) },
    uSunGlow: { value: 0.32 },
  };
  const geo = new THREE.SphereGeometry(2900, 32, 24);
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vWorldDir;
      void main() {
        vWorldDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenithColor;
      uniform vec3 uMidColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uNadirColor;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform float uSunGlow;
      varying vec3 vWorldDir;
      void main() {
        vec3 d = normalize(vWorldDir);
        float h = d.y;
        vec3 col;
        if (h >= 0.0) {
          float tMid = smoothstep(0.0, 0.24, h);
          float tZen = smoothstep(0.18, 0.78, h);
          col = mix(uHorizonColor, uMidColor, tMid);
          col = mix(col, uZenithColor, tZen);
        } else {
          float tDown = smoothstep(0.0, -0.14, h);
          col = mix(uHorizonColor, uNadirColor, tDown);
        }
        float sunAmt = max(dot(d, normalize(uSunDir)), 0.0);
        col += uSunColor * pow(sunAmt, 14.0) * uSunGlow;
        col += uSunColor * smoothstep(0.9982, 0.9995, sunAmt) * 0.75;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}

const EMPTY_BATCH_METRICS: RenderBatchMetrics = {
  instancedMeshCount: 0,
  totalInstances: 0,
  mergedMeshCount: 0,
  mergedSourceMeshes: 0,
  savedDrawCalls: 0,
};

export function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render|ANGLE.*Google/i.test(gpu);
  } catch {
    return true;
  }
}

/**
 * Suppresses overlapping 2D screen-space markers & tooltips so tags NEVER clutter the harbor (Req #6 & #18).
 */
function declutterProjectedLabels(
  candidates: ProjectedLabel[],
  viewportWidth: number,
  viewportHeight: number,
): ProjectedLabel[] {
  const placed: Array<{ x: number; y: number; halfW: number; halfH: number }> = [];
  const accepted: ProjectedLabel[] = [];
  const topSafe = viewportWidth < 640 ? 96 : 74;
  const bottomSafe = viewportHeight - (viewportWidth < 640 ? 116 : 92);

  for (const label of candidates) {
    if (!label.visible) continue;
    if (label.y < topSafe || label.y > bottomSafe) continue;
    if (label.x < 36 || label.x > viewportWidth - 36) continue;

    // Text tooltip needs wider exclusion box; tiny dot markers need only a compact 18px footprint
    const halfW = label.showText ? 72 : 16;
    const halfH = label.showText ? 18 : 16;

    const overlaps = placed.some(
      (p) => Math.abs(p.x - label.x) < p.halfW + halfW && Math.abs(p.y - label.y) < p.halfH + halfH,
    );
    if (overlaps) continue;

    placed.push({ x: label.x, y: label.y, halfW, halfH });
    accepted.push(label);
  }

  return accepted;
}

export class HarborSceneController implements HarborSceneHandle {
  private container: HTMLElement;
  private callbacks: HarborSceneCallbacks;
  private isSoftwareGl: boolean;
  private qualityTier: QualityTier;
  private userLockedQuality: boolean;
  private reducedMotion = false;
  private darkTheme = false;
  private cameraPreset: CameraPreset = 'harbor';
  private shipDisplayPrefs: ShipDisplayPrefsMap;

  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private composerRT: THREE.WebGLRenderTarget | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private smaaPass: SMAAPass | null = null;

  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private skyDome: ReturnType<typeof createMaritimeSkyDome>;
  private textures: HarborTexturePack;
  private envRT: THREE.WebGLRenderTarget | null = null;
  private sunKeyLight!: THREE.DirectionalLight;
  private closeUpFillLight!: THREE.PointLight;
  private closeRangeShadowActive = false;
  private hemiFillLight!: THREE.HemisphereLight;
  private ambientLight!: THREE.AmbientLight;

  private ocean: OceanWaterSystem;
  private world: ShipyardWorldHandles;
  private chunkManager: InfiniteWorldChunkManager;
  private occlusionController = new SuperstructureOcclusionController();
  private verticalPropOcclusionController = new SuperstructureOcclusionController();

  private playerRig: BuiltHumanoidRig;
  private playerPos = {
    x: PLAYER_DEFAULT_SPAWN.x,
    y: 1.61,
    z: PLAYER_DEFAULT_SPAWN.z,
    heading: 0,
    speed: 0,
  };
  private walkPath: Vec2[] = [];
  private waypointMarker: THREE.Mesh;
  private playerHalo: THREE.Mesh;

  private allPeople: HarborPerson[] = [];
  private hubPlacements: HubBuildingPlacement[] = [];
  private activeColliders: ObstacleBox2D[] = [...HARBOR_ALL_OBSTACLES];
  private focusedPersonSub: string | null = null;
  private lastOverflowCount = 0;
  private lastOnLeaveCount = 0;
  private lastSimplifiedMaterial = false;
  private personRuntimes: PersonNpcRuntime[] = [];
  private personHitProxies: THREE.Object3D[] = [];
  private peopleRoot = new THREE.Group();
  private presenceRingBatch: THREE.InstancedMesh | null = null;
  private npcShadowBatch: THREE.InstancedMesh | null = null;
  private hoveredLabelId: string | null = null;

  private keys = new Set<string>();
  private raycaster = new THREE.Raycaster();
  private pointerDownPos = { x: 0, y: 0 };
  private lastHoverProbeMs = 0;
  private cameraTween: {
    startMs: number;
    durationMs: number;
    fromPos: THREE.Vector3;
    toPos: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
  } | null = null;

  private resizeObserver: ResizeObserver;
  private frameId = 0;
  private softTimerId = 0;
  private lastFrameMs = performance.now();
  private elapsedTotal = 0;
  private lastLabelEmitMs = 0;
  private lastMetricsEmitMs = 0;
  private frameCountWindow = 0;
  private measuredFps = 60;
  private avgFrameTimeMs = 0;
  private peakDrawCalls = 0;
  private batchStats: RenderBatchMetrics = { ...EMPTY_BATCH_METRICS };
  private autoQualityStartMs = performance.now();
  private autoQualitySamplesMs: number[] = [];
  private autoQualityEvaluated = false;
  private contextLost = false;
  private disposed = false;

  constructor(
    container: HTMLElement,
    callbacks: HarborSceneCallbacks,
    initialOptions?: HarborSceneInitOptions,
  ) {
    this.container = container;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareWebGL();
    this.qualityTier =
      initialOptions?.qualityTier ?? (initialOptions?.lowSpec ? 'low' : 'high');
    this.userLockedQuality = initialOptions?.userSelectedQuality ?? false;
    this.reducedMotion = initialOptions?.reducedMotion ?? false;
    this.darkTheme = initialOptions?.darkTheme ?? false;
    this.shipDisplayPrefs = initialOptions?.shipDisplayPrefs ?? {};

    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;

    this.renderer = new THREE.WebGLRenderer({
      antialias: this.qualityTier !== 'low',
      powerPreference: this.qualityTier === 'low' ? 'low-power' : 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.info.autoReset = false;
    this.renderer.setPixelRatio(
      resolvePixelRatioForQuality(this.qualityTier, window.devicePixelRatio || 1),
    );
    this.renderer.shadowMap.enabled = this.qualityTier !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(w, h);
    this.renderer.domElement.style.display = 'block';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.skyDome = createMaritimeSkyDome();
    this.scene.add(this.skyDome.mesh);

    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.25, 3600);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = !this.isSoftwareGl && !this.reducedMotion;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = true;
    this.controls.screenSpacePanning = false;
    this.controls.maxPolarAngle = Math.PI * 0.485;
    this.controls.minPolarAngle = 0.14;
    this.controls.minDistance = CAMERA_WHEEL_MIN_DISTANCE;
    // Unlocked infinite-world zoom range (Requirement #11)
    this.controls.maxDistance = 800;
    this.controls.addEventListener('start', () => {
      this.cameraTween = null;
    });

    this.textures = createHarborTextures(this.renderer.capabilities.getMaxAnisotropy());
    this.setupLighting();

    this.ocean = createMaritimeOcean(
      this.qualityTier,
      this.textures.waterNormals,
      this.reducedMotion,
    );
    this.scene.add(this.ocean.group);

    this.world = buildShipyardWorld(this.scene, this.textures);
    this.world.setLowSpecMode(this.qualityTier === 'low' || this.reducedMotion);
    this.world.applyShipDisplayPrefs(this.shipDisplayPrefs);

    this.chunkManager = new InfiniteWorldChunkManager(
      this.scene,
      this.textures,
      this.world.bridgeGlowMat,
    );
    this.chunkManager.setLowSpec(this.qualityTier === 'low');

    this.scene.add(this.peopleRoot);

    this.lastSimplifiedMaterial = this.qualityTier === 'low';
    this.playerRig = buildHumanoidEngineerAvatar({
      isPartner: false,
      shirtHex: '#0284c7',
      contactShadowTex: this.textures.contactShadow,
      isCurrentUser: true,
      modelVariantIndex: 0,
      simplifiedMaterial: this.lastSimplifiedMaterial,
    });
    const safePlayerSpawn = resolveAvatarPropClearance(
      { x: this.playerPos.x, z: this.playerPos.z },
      this.activeColliders,
      [],
      PLAYER_POLE_MIN_CLEARANCE,
    );
    this.playerPos.x = safePlayerSpawn.x;
    this.playerPos.z = safePlayerSpawn.z;
    this.playerPos.y = sampleHarborElevation(this.playerPos.x, this.playerPos.z);
    this.playerRig.group.position.set(this.playerPos.x, this.playerPos.y, this.playerPos.z);
    this.scene.add(this.playerRig.group);

    const haloGeo = new THREE.RingGeometry(1.35, 1.88, 28);
    haloGeo.rotateX(-Math.PI / 2);
    this.playerHalo = new THREE.Mesh(
      haloGeo,
      new THREE.MeshBasicMaterial({
        color: 0x0ea5e9,
        transparent: true,
        opacity: 0.94,
        side: THREE.DoubleSide,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
      }),
    );
    this.playerHalo.position.set(this.playerPos.x, this.playerPos.y + 0.06, this.playerPos.z);
    this.scene.add(this.playerHalo);

    const wpGeo = new THREE.RingGeometry(0.55, 0.88, 24);
    wpGeo.rotateX(-Math.PI / 2);
    this.waypointMarker = new THREE.Mesh(
      wpGeo,
      new THREE.MeshBasicMaterial({
        color: 0x22d3ee,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.waypointMarker.visible = false;
    this.scene.add(this.waypointMarker);

    this.setupPostProcessing(w, h);
    this.applyAtmosphere(this.darkTheme);
    this.snapCameraToPreset(this.cameraPreset);
    this.chunkManager.update(this.controls.target.x, this.controls.target.z, 0);
    this.refreshBatchStats();

    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleWindowBlur);
    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.addEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.addEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.handleContextRestored);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);

    this.renderFrame();
    this.lastFrameMs = performance.now();
    this.autoQualityStartMs = this.lastFrameMs;
    this.tick();
  }

  private setupPostProcessing(w: number, h: number): void {
    if (this.composer) {
      this.composer.dispose();
      this.composer = null;
      this.bloomPass = null;
      this.smaaPass = null;
    }
    if (this.composerRT) {
      this.composerRT.dispose();
      this.composerRT = null;
    }

    // Post-processing active strictly in 'high' tier on hardware GPU (per Req #5 & threejs/SKILL.md §2.1)
    if (this.qualityTier !== 'high' || this.isSoftwareGl) {
      return;
    }

    const pr = this.renderer.getPixelRatio();
    // Explicit HDR HalfFloatType target prevents 8-bit clipping & ACES blowout on hardware GPU
    const rt = new THREE.WebGLRenderTarget(
      Math.max(1, Math.floor(w * pr)),
      Math.max(1, Math.floor(h * pr)),
      {
        type: THREE.HalfFloatType,
        samples: 4,
      },
    );
    const composer = new EffectComposer(this.renderer, rt);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);

    const renderPass = new RenderPass(this.scene, this.camera);
    composer.addPass(renderPass);

    // High-threshold, ultra-subtle bloom so daylight sky, concrete & white superstructures never smear
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(Math.max(1, Math.floor(w / 2)), Math.max(1, Math.floor(h / 2))),
      0.06, // minimal strength
      0.22, // tight radius
      1.25, // strictly HDR-only threshold (> 1.0) so sunlit diffuse surfaces never bloom
    );
    composer.addPass(bloomPass);

    const smaaPass = new SMAAPass();
    smaaPass.setSize(Math.max(1, Math.floor(w * pr)), Math.max(1, Math.floor(h * pr)));
    composer.addPass(smaaPass);

    const outputPass = new OutputPass();
    composer.addPass(outputPass);

    this.composerRT = rt;
    this.composer = composer;
    this.bloomPass = bloomPass;
    this.smaaPass = smaaPass;
  }

  private refreshBatchStats(): void {
    this.batchStats = collectSceneBatchStats(this.scene);
  }

  private setupLighting(): void {
    this.sunKeyLight = new THREE.DirectionalLight(0xfffaf0, 2.15);
    this.sunKeyLight.position.set(65, 92, 74);
    const shadowSize = this.qualityTier === 'high' ? 2048 : 1024;
    this.sunKeyLight.castShadow = this.qualityTier !== 'low';
    this.sunKeyLight.shadow.mapSize.set(shadowSize, shadowSize);
    const d = 165;
    this.sunKeyLight.shadow.camera.left = -d;
    this.sunKeyLight.shadow.camera.right = d;
    this.sunKeyLight.shadow.camera.top = d;
    this.sunKeyLight.shadow.camera.bottom = -d;
    this.sunKeyLight.shadow.camera.near = 10;
    this.sunKeyLight.shadow.camera.far = 380;
    this.sunKeyLight.shadow.bias = -0.0005;
    this.sunKeyLight.shadow.normalBias = 0.02;
    this.scene.add(this.sunKeyLight);
    this.scene.add(this.sunKeyLight.target);

    // Subtle non-shadow-casting camera-side fill light activated ONLY at close range (<= 18m)
    // so facial features, hands, and workwear shading read clearly during close-up inspection.
    this.closeUpFillLight = new THREE.PointLight(0xfff7ed, 0, 14, 1.6);
    this.closeUpFillLight.castShadow = false;
    this.scene.add(this.closeUpFillLight);

    this.hemiFillLight = new THREE.HemisphereLight(0xebf6ff, 0x5c6d7e, 1.3);
    this.scene.add(this.hemiFillLight);

    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
    this.scene.add(this.ambientLight);
  }

  /**
   * Tightens directional shadow frustum & boosts shadow resolution ONLY at close range
   * (<= 18m or active person focus; exits at >= 22m) so worker close-ups get crisp self-shadows
   * without taxing far-range harbor overview performance.
   */
  private updateCloseRangeShadowRig(force = false): void {
    if (!this.sunKeyLight || !this.closeUpFillLight) return;

    const shadowsEnabled = this.qualityTier !== 'low';
    const camDist = this.camera.position.distanceTo(this.controls.target);
    let nextActive = this.closeRangeShadowActive;
    if (!shadowsEnabled) {
      nextActive = false;
    } else if (this.focusedPersonSub !== null || camDist <= 18) {
      nextActive = true;
    } else if (camDist >= 22) {
      nextActive = false;
    }

    const changed = nextActive !== this.closeRangeShadowActive;
    this.closeRangeShadowActive = nextActive;

    if (nextActive) {
      this.sunKeyLight.target.position.copy(this.controls.target);
      this.sunKeyLight.target.updateMatrixWorld();
      this.sunKeyLight.position.copy(this.controls.target).addScaledVector(_sunVec, 55);

      // Position gentle fill light on camera side of subject for crisp face/workwear readability
      this.closeUpFillLight.position
        .copy(this.controls.target)
        .lerp(this.camera.position, 0.48);
      this.closeUpFillLight.position.y += 1.35;
      this.closeUpFillLight.intensity = this.darkTheme ? 0.65 : 0.52;

      if (changed || force) {
        const d = 14;
        this.sunKeyLight.shadow.camera.left = -d;
        this.sunKeyLight.shadow.camera.right = d;
        this.sunKeyLight.shadow.camera.top = d;
        this.sunKeyLight.shadow.camera.bottom = -d;
        this.sunKeyLight.shadow.camera.near = 4;
        this.sunKeyLight.shadow.camera.far = 130;
        this.sunKeyLight.shadow.bias = -0.0002;
        this.sunKeyLight.shadow.normalBias = 0.008;
        this.sunKeyLight.shadow.camera.updateProjectionMatrix();

        const boostSize =
          this.qualityTier === 'high' && !this.isSoftwareGl ? 4096 : 2048;
        if (
          this.sunKeyLight.shadow.mapSize.x !== boostSize ||
          this.sunKeyLight.shadow.mapSize.y !== boostSize
        ) {
          this.sunKeyLight.shadow.mapSize.set(boostSize, boostSize);
          this.sunKeyLight.shadow.map?.dispose();
          this.sunKeyLight.shadow.map = null;
        }
      }
      return;
    }

    this.closeUpFillLight.intensity = 0;
    if (changed || force) {
      this.sunKeyLight.target.position.set(0, 0, 0);
      this.sunKeyLight.target.updateMatrixWorld();
      this.sunKeyLight.position.copy(_sunVec).multiplyScalar(145);

      const d = 165;
      this.sunKeyLight.shadow.camera.left = -d;
      this.sunKeyLight.shadow.camera.right = d;
      this.sunKeyLight.shadow.camera.top = d;
      this.sunKeyLight.shadow.camera.bottom = -d;
      this.sunKeyLight.shadow.camera.near = 10;
      this.sunKeyLight.shadow.camera.far = 380;
      this.sunKeyLight.shadow.bias = -0.0005;
      this.sunKeyLight.shadow.normalBias = 0.02;
      this.sunKeyLight.shadow.camera.updateProjectionMatrix();

      if (shadowsEnabled) {
        const baseSize = this.qualityTier === 'high' ? 2048 : 1024;
        if (
          this.sunKeyLight.shadow.mapSize.x !== baseSize ||
          this.sunKeyLight.shadow.mapSize.y !== baseSize
        ) {
          this.sunKeyLight.shadow.mapSize.set(baseSize, baseSize);
          this.sunKeyLight.shadow.map?.dispose();
          this.sunKeyLight.shadow.map = null;
        }
      }
    }
  }

  private applyAtmosphere(sunset: boolean): void {
    this.darkTheme = sunset;
    const isLowTier = this.qualityTier === 'low';
    const isMediumTier = this.qualityTier === 'medium';

    // Crisp Azure Maritime Day (낮) vs Rich Warm Golden Sunset (해질녘)
    const elevation = sunset ? 12 : 40;
    const azimuth = sunset ? 224 : 36;
    const fogHex = sunset ? 0x9a5d52 : 0x86bee8;
    const oceanFogDensity = isLowTier ? (sunset ? 0.0014 : 0.0012) : sunset ? 0.00024 : 0.00018;

    const u = this.skyDome.uniforms;
    if (sunset) {
      u.uZenithColor.value.setHex(0x162246);
      u.uMidColor.value.setHex(0x6b4166);
      u.uHorizonColor.value.setHex(0xe88642);
      u.uNadirColor.value.setHex(0x162038);
      u.uSunColor.value.setHex(0xffb45c);
      u.uSunGlow.value = 0.52;
      this.scene.background = new THREE.Color(0x2a2440);

      this.sunKeyLight.color.setHex(0xff9b45);
      this.sunKeyLight.intensity = 2.45;
      this.hemiFillLight.color.setHex(0xdd855e);
      this.hemiFillLight.groundColor.setHex(0x172033);
      this.hemiFillLight.intensity = 0.68;
      this.ambientLight.intensity = 0.08;
      this.renderer.toneMappingExposure = 1.04;
    } else {
      u.uZenithColor.value.setHex(0x145cb3);
      u.uMidColor.value.setHex(0x3e91db);
      u.uHorizonColor.value.setHex(0x93c7ec);
      u.uNadirColor.value.setHex(0x08345e);
      u.uSunColor.value.setHex(0xfff5db);
      u.uSunGlow.value = 0.28;
      this.scene.background = new THREE.Color(0x3e91db);

      this.sunKeyLight.color.setHex(0xfff6e5);
      this.sunKeyLight.intensity = 2.65;
      this.hemiFillLight.color.setHex(0x8cc8f7);
      this.hemiFillLight.groundColor.setHex(0x1b3044);
      this.hemiFillLight.intensity = 0.72;
      this.ambientLight.intensity = 0.08;
      this.renderer.toneMappingExposure = 1.06;
    }

    const phi = THREE.MathUtils.degToRad(90 - elevation);
    const theta = THREE.MathUtils.degToRad(azimuth);
    _sunVec.setFromSphericalCoords(1, phi, theta);
    u.uSunDir.value.copy(_sunVec);
    this.updateCloseRangeShadowRig(true);

    // Distant fog only so Home Harbor foreground/midground stays razor-sharp with rich contrast.
    // Closer fog is applied ONLY on 'low' quality tier.
    const fogNear = isLowTier ? (sunset ? 200 : 220) : isMediumTier ? (sunset ? 420 : 480) : sunset ? 480 : 560;
    const fogFar = isLowTier ? (sunset ? 860 : 920) : isMediumTier ? (sunset ? 1750 : 2000) : sunset ? 2050 : 2350;
    this.scene.fog = new THREE.Fog(fogHex, fogNear, fogFar);

    this.ocean.setAtmosphere({
      sunDir: _sunVec,
      sunColor: sunset ? 0xffa454 : 0xfff5e0,
      deepColor: sunset ? 0x0c1e3b : 0x042b54,
      shallowColor: sunset ? 0x1b3658 : 0x0a4f82,
      horizonColor: sunset ? 0xc97648 : 0x5da2d8,
      fogColor: fogHex,
      fogDensity: oceanFogDensity,
    });

    if (!isLowTier) {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      const roomEnv = new RoomEnvironment();
      if (this.envRT) this.envRT.dispose();
      this.envRT = pmrem.fromScene(roomEnv, 0.04);
      roomEnv.dispose();
      this.scene.environment = this.envRT.texture;
      this.scene.environmentIntensity = sunset ? 0.34 : 0.28;
      pmrem.dispose();
    } else {
      this.scene.environment = null;
    }
  }

  public setThemeMode(dark: boolean): void {
    this.applyAtmosphere(dark);
    this.renderFrame();
  }

  private shouldSuppressMotion(): boolean {
    return this.qualityTier === 'low' || this.reducedMotion;
  }

  public setReducedMotion(enabled: boolean): void {
    this.reducedMotion = enabled;
    const suppress = this.shouldSuppressMotion();
    this.controls.enableDamping = !this.isSoftwareGl && !suppress;
    this.ocean.setQualityTier(this.qualityTier, this.reducedMotion);
    this.world.setLowSpecMode(suppress);
    this.renderFrame();
  }

  public setQualityTier(tier: QualityTier, userInitiated = true): void {
    if (userInitiated) {
      this.userLockedQuality = true;
    }
    this.qualityTier = tier;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;

    const pixelRatio = resolvePixelRatioForQuality(tier, window.devicePixelRatio || 1);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(w, h);

    const shadowsOn = tier !== 'low';
    this.renderer.shadowMap.enabled = shadowsOn;
    this.sunKeyLight.castShadow = shadowsOn;
    const nextShadowSize = tier === 'high' ? 2048 : 1024;
    if (
      shadowsOn &&
      (this.sunKeyLight.shadow.mapSize.x !== nextShadowSize ||
        this.sunKeyLight.shadow.mapSize.y !== nextShadowSize)
    ) {
      this.sunKeyLight.shadow.mapSize.set(nextShadowSize, nextShadowSize);
      this.sunKeyLight.shadow.map?.dispose();
      this.sunKeyLight.shadow.map = null;
    }

    const suppress = this.shouldSuppressMotion();
    this.controls.enableDamping = !this.isSoftwareGl && !suppress;
    this.ocean.setQualityTier(tier, this.reducedMotion);
    this.world.setLowSpecMode(suppress);
    this.chunkManager.setLowSpec(tier === 'low');
    this.setupPostProcessing(w, h);
    this.applyAtmosphere(this.darkTheme);

    // Rebuild player & colleague 3D rigs when quality tier changes (updates low-tier simplified 3D material & avatar cap)
    const nextSimplified = tier === 'low';
    if (nextSimplified !== this.lastSimplifiedMaterial) {
      this.lastSimplifiedMaterial = nextSimplified;
      this.scene.remove(this.playerRig.group);
      this.playerRig.dispose();
      this.playerRig = buildHumanoidEngineerAvatar({
        isPartner: false,
        shirtHex: '#0284c7',
        contactShadowTex: this.textures.contactShadow,
        isCurrentUser: true,
        modelVariantIndex: 0,
        simplifiedMaterial: nextSimplified,
      });
      this.playerRig.group.position.set(this.playerPos.x, this.playerPos.y, this.playerPos.z);
      this.playerRig.group.rotation.y = this.playerPos.heading;
      this.scene.add(this.playerRig.group);
      if (this.hubPlacements.length > 0) {
        this.world.syncHubBuildings(this.hubPlacements, nextSimplified);
      }
    }
    this.rebuildPeopleScene();
    this.refreshBatchStats();
    this.renderFrame();
  }

  public setLowSpecMode(enabled: boolean): void {
    this.setQualityTier(enabled ? 'low' : 'high', true);
  }

  public setShipDisplayPrefs(prefs: ShipDisplayPrefsMap): void {
    this.shipDisplayPrefs = prefs;
    this.world.applyShipDisplayPrefs(prefs);
    this.emitLabels();
    this.renderFrame();
  }

  public setSelectedShipId(shipId: string | null): void {
    this.world.setSelectedShipId(shipId);
    this.renderFrame();
  }

  public getRenderMetrics(): RenderMetrics {
    return {
      drawCalls: this.renderer.info.render.calls,
      peakDrawCalls: this.peakDrawCalls,
      triangles: this.renderer.info.render.triangles,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
      fps: this.measuredFps,
      frameTimeMs: Number(this.avgFrameTimeMs.toFixed(2)),
      lowSpec: this.qualityTier === 'low',
      qualityTier: this.qualityTier,
      canvasWidth: this.renderer.domElement.width,
      canvasHeight: this.renderer.domElement.height,
      activeChunks: this.chunkManager.activeChunkCount,
      batching: { ...this.batchStats },
    };
  }

  public setProjects(ships: HarborShip[]): void {
    assertValidShipBerths(ships, {
      throwOnViolation: false,
      warnInDev: import.meta.env.DEV,
    });
    this.occlusionController.restoreAll();
    this.verticalPropOcclusionController.restoreAll();
    this.world.syncProjectShips(ships, this.qualityTier === 'low', this.shipDisplayPrefs);
    this.refreshBatchStats();
    this.emitLabels();
    this.renderFrame();
  }

  public setHubBuildings(chips: HubModuleChipItem[]): void {
    this.verticalPropOcclusionController.restoreAll();
    this.hubPlacements = assignHubBuildingSlots(chips);
    this.activeColliders = [
      ...HARBOR_ALL_OBSTACLES,
      ...buildHubBuildingColliders(this.hubPlacements),
    ];
    this.world.syncHubBuildings(this.hubPlacements, this.qualityTier === 'low');

    // Keep player & colleagues clear of newly placed hub buildings / scaffolding (>= 1.5m for player)
    const safePlayer = resolveAvatarPropClearance(
      { x: this.playerPos.x, z: this.playerPos.z },
      this.activeColliders,
      [],
      Math.max(AVATAR_PROP_MIN_CLEARANCE, PLAYER_POLE_MIN_CLEARANCE),
    );
    this.playerPos.x = safePlayer.x;
    this.playerPos.z = safePlayer.z;
    this.playerPos.y = sampleHarborElevation(this.playerPos.x, this.playerPos.z);
    this.playerRig.group.position.set(this.playerPos.x, this.playerPos.y, this.playerPos.z);
    this.playerHalo.position.set(this.playerPos.x, this.playerPos.y + 0.05, this.playerPos.z);

    if (this.allPeople.length > 0) {
      this.rebuildPeopleScene();
    }
    this.refreshBatchStats();
    this.emitLabels();
    this.renderFrame();
  }

  public inspectHubBuildings(): HubBuildingSceneAudit {
    return {
      count: this.world.hubBuildings.length,
      buildings: this.world.hubBuildings.map((rt) => ({
        moduleId: rt.placement.moduleId,
        name: rt.placement.chip.name,
        status: rt.placement.chip.status,
        lotId: rt.placement.lot.lotId,
        x: rt.placement.lot.centerX,
        z: rt.placement.lot.centerZ,
        hasScaffolding: Boolean(rt.group.getObjectByName('hub-building-scaffolding')),
        lightsOn: Boolean(rt.group.getObjectByName('hub-building-cornice-light')),
        signText: rt.placement.appearance.signBannerText,
        entryUrl: rt.placement.chip.entryUrl,
      })),
    };
  }

  private disposePeopleBatches(): void {
    if (this.presenceRingBatch) {
      this.peopleRoot.remove(this.presenceRingBatch);
      this.presenceRingBatch.geometry.dispose();
      (this.presenceRingBatch.material as THREE.Material).dispose();
      this.presenceRingBatch = null;
    }
    if (this.npcShadowBatch) {
      this.peopleRoot.remove(this.npcShadowBatch);
      this.npcShadowBatch.geometry.dispose();
      (this.npcShadowBatch.material as THREE.Material).dispose();
      this.npcShadowBatch = null;
    }
  }

  public setPeople(people: HarborPerson[]): void {
    this.allPeople = people;
    this.rebuildPeopleScene();
    this.refreshBatchStats();
    this.emitLabels();
    this.renderFrame();
  }

  private rebuildPeopleScene(): void {
    this.disposePeopleBatches();
    for (const rt of this.personRuntimes) {
      this.peopleRoot.remove(rt.rig.group);
      rt.rig.dispose();
      rt.hitProxy.geometry.dispose();
      (rt.hitProxy.material as THREE.Material).dispose();
    }
    this.personRuntimes = [];
    this.personHitProxies = [];

    // 1:1 presence matching:
    //   - Excludes current user (playerRig) and 'leave' (연차) colleagues from 3D quay
    //   - Applies per-quality-tier avatar cap (high=16, medium=10, low=3) & tracks overflow ("외 n명")
    const selection = selectVisibleQuayColleagues(this.allPeople, this.qualityTier);
    this.lastOverflowCount = selection.overflowCount;
    this.lastOnLeaveCount = selection.onLeaveCount;

    // Separate walking/standing colleagues so they never clip into buildings, benches, water, or each other;
    // keep seated 'away' colleagues locked cleanly onto their exact physical quay bench slots.
    const seatedAway = selection.visible.filter((p) => p.presenceStatus === 'away');
    const walkingOrIdle = resolveAvatarSpawnOverlaps(
      selection.visible.filter((p) => p.presenceStatus !== 'away'),
      this.activeColliders,
    );
    const orderedVisible = [...walkingOrIdle, ...seatedAway];
    const simplified = this.qualityTier === 'low';

    const hitGeo = new THREE.CylinderGeometry(0.95, 0.95, 2.3, 8);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    const ringSpecs: Array<{ x: number; y: number; z: number; colorHex: number }> = [];
    const shadowPositions: Array<{ x: number; y: number; z: number; scale: number }> = [];

    orderedVisible.forEach((person, idx) => {
      const isSeated = person.presenceStatus === 'away';
      const rig = buildHumanoidEngineerAvatar({
        isPartner: person.isPartner,
        shirtHex: person.shirtHex,
        contactShadowTex: this.textures.contactShadow,
        skipContactShadow: true,
        modelVariantIndex: idx + 1,
        simplifiedMaterial: simplified,
      });
      const y = sampleHarborElevation(person.position.x, person.position.z);
      rig.group.position.set(person.position.x, y, person.position.z);
      rig.group.rotation.y = isSeated ? 0 : person.facingYaw;

      // Apply immediate seated pose on frame 0 so away colleagues sit cleanly on the quay bench
      if (isSeated) {
        rig.updateAnimation(0, 0, 'sit', true);
      }

      const hitProxy = new THREE.Mesh(hitGeo.clone(), hitMat.clone());
      hitProxy.position.set(0, isSeated ? 0.95 : 1.15, 0);
      hitProxy.userData.personSub = person.sub;
      rig.group.add(hitProxy);
      this.personHitProxies.push(hitProxy);

      const ringColorHex =
        person.presenceStatus === 'online'
          ? 0x10b981
          : person.presenceStatus === 'away'
            ? 0xf59e0b
            : 0x64748b;

      ringSpecs.push({
        x: person.position.x,
        y: y + 0.055,
        z: person.position.z,
        colorHex: ringColorHex,
      });
      shadowPositions.push({
        x: person.position.x,
        y,
        z: person.position.z,
        scale: isSeated ? 1.85 : 2.35,
      });

      this.peopleRoot.add(rig.group);
      this.personRuntimes.push({
        person,
        rig,
        hitProxy,
        phase: idx * 0.85,
        instanceIdx: idx,
        homeX: person.position.x,
        homeZ: person.position.z,
        curX: person.position.x,
        curZ: person.position.z,
        heading: isSeated ? 0 : person.facingYaw,
        patrolDir: idx % 2 === 0 ? 1 : -1,
        patrolRange: person.presenceStatus === 'online' ? 4.6 + (idx % 3) * 1.4 : 0,
        isSeated,
      });
    });

    this.presenceRingBatch = createInstancedRingBatch(ringSpecs, {
      innerRadius: 1.25,
      outerRadius: 1.72,
      segments: 24,
      opacity: 0.92,
      polygonOffset: true,
    });
    if (this.presenceRingBatch) {
      this.peopleRoot.add(this.presenceRingBatch);
    }

    this.npcShadowBatch = createInstancedContactShadowBatch(
      shadowPositions,
      this.textures.contactShadow,
    );
    if (this.npcShadowBatch) {
      this.peopleRoot.add(this.npcShadowBatch);
    }

    hitGeo.dispose();
    hitMat.dispose();
  }

  public setCameraPreset(preset: CameraPreset): void {
    this.focusedPersonSub = null;
    this.cameraPreset = preset;
    this.snapCameraToPreset(preset);
  }

  public returnToHomeHarbor(durationMs = 480): void {
    this.focusedPersonSub = null;
    this.cameraPreset = 'harbor';
    const toTarget = new THREE.Vector3(0, 3.0, 22);
    const toPos = new THREE.Vector3(0, 58, 162);

    if (durationMs <= 0 || this.reducedMotion) {
      this.snapCameraToPreset('harbor');
      return;
    }

    this.cameraTween = {
      startMs: performance.now(),
      durationMs,
      fromPos: this.camera.position.clone(),
      toPos,
      fromTarget: this.controls.target.clone(),
      toTarget,
    };
    this.updateCloseRangeShadowRig();
    this.emitLabels();
  }

  public panCameraToWorld(x: number, z: number): void {
    this.cameraTween = null;
    this.focusedPersonSub = null;
    const dx = x - this.controls.target.x;
    const dz = z - this.controls.target.z;
    this.controls.target.set(x, 3.0, z);
    this.camera.position.x += dx;
    this.camera.position.z += dz;
    const clamped = clampCameraCollision(this.camera.position, this.activeColliders);
    this.camera.position.set(clamped.x, clamped.y, clamped.z);
    this.controls.update();
    this.chunkManager.update(this.controls.target.x, this.controls.target.z, this.elapsedTotal);
    this.ocean.update(this.elapsedTotal, this.controls.target.x, this.controls.target.z);
    this.updateSceneOcclusion();
    this.updateCloseRangeShadowRig();
    this.callbacks.onCameraTargetUpdated?.({
      x: this.controls.target.x,
      z: this.controls.target.z,
    });
    this.emitLabels();
    this.renderFrame();
  }

  /**
   * Updates both Stage 10 ship superstructure occlusion (opacity 0.25) and Stage 12 vertical prop
   * sightline occlusion (lamp posts, flagpoles, pillars, scaffolding, signboards -> opacity 0.15)
   * between the camera and the active character/target, restoring automatically once clear.
   */
  private updateSceneOcclusion(): void {
    this.occlusionController.update(
      this.camera.position,
      this.controls.target,
      this.world.occludableShipSuperstructures,
    );

    if (this.focusedPersonSub !== null) {
      const focused = this.personRuntimes.find((r) => r.person.sub === this.focusedPersonSub);
      if (focused) {
        const y = sampleHarborElevation(focused.curX, focused.curZ);
        _scratchOcclusionTarget.set(
          focused.curX,
          y + (focused.isSeated ? 1.25 : WORKER_CHEST_HEIGHT_OFFSET),
          focused.curZ,
        );
      } else {
        _scratchOcclusionTarget.copy(this.controls.target);
      }
    } else {
      _scratchOcclusionTarget.copy(this.controls.target);
    }

    this.verticalPropOcclusionController.update(
      this.camera.position,
      _scratchOcclusionTarget,
      this.world.occludableVerticalProps,
      OCCLUDED_VERTICAL_PROP_OPACITY,
      {
        corridorRadius: 0.75,
        verticalProbeOffsets: [0, 1.15, -1.05],
      },
    );
  }

  /**
   * Stage 11–12 Close-Zoom Framing Guard:
   * During free mouse-wheel / orbit zoom (when not in `focusPerson` mode), keeps the target anchored
   * to quay worker chest height (anchoring Harbor View zoom directly onto `playerPos` in the open plaza)
   * and restricts polar angle + distance floor so the full worker body and surrounding quay stay inside
   * the viewport with water coverage <= 40% and zero ground/water clip.
   * Preserves Stage 10's `focusPerson` (3–6m front pose) completely untouched.
   */
  private applyCloseZoomFraming(): void {
    if (this.focusedPersonSub !== null) {
      this.controls.minDistance = CAMERA_MIN_DISTANCE;
      const focusedDist = this.camera.position.distanceTo(this.controls.target);
      const focusedBounds = computePolarAngleBoundsForDistance(focusedDist);
      this.controls.minPolarAngle = focusedBounds.minPolarAngle;
      this.controls.maxPolarAngle = focusedBounds.maxPolarAngle;

      const focused = this.personRuntimes.find((r) => r.person.sub === this.focusedPersonSub);
      if (focused) {
        const personY = sampleHarborElevation(focused.curX, focused.curZ);
        this.controls.target.y = personY + (focused.isSeated ? 1.25 : WORKER_CHEST_HEIGHT_OFFSET);
      }
      const clampedCam = clampCameraCollision(this.camera.position, this.activeColliders);
      this.camera.position.set(clampedCam.x, clampedCam.y, clampedCam.z);
      this.camera.lookAt(this.controls.target);
      return;
    }

    this.controls.minDistance = CAMERA_WHEEL_MIN_DISTANCE;
    const dist = this.camera.position.distanceTo(this.controls.target);
    const bounds = computePolarAngleBoundsForDistance(dist);
    this.controls.minPolarAngle = bounds.minPolarAngle;
    this.controls.maxPolarAngle = bounds.maxPolarAngle;

    // Anchor over-water close zoom directly onto the player character in the open central plaza
    const framed = clampCloseZoomCameraFraming(
      this.camera.position,
      this.controls.target,
      { x: this.playerPos.x, z: this.playerPos.z },
      this.activeColliders,
    );
    this.controls.target.set(framed.targetPos.x, framed.targetPos.y, framed.targetPos.z);
    this.camera.position.set(framed.cameraPos.x, framed.cameraPos.y, framed.cameraPos.z);
    if (framed.closeBlend > 0) {
      this.camera.lookAt(this.controls.target);
    }
  }

  public zoomBy(factor: number): void {
    const minDist =
      this.focusedPersonSub !== null ? CAMERA_MIN_DISTANCE : CAMERA_WHEEL_MIN_DISTANCE;
    _scratchOffset.subVectors(this.camera.position, this.controls.target);
    _scratchOffset.multiplyScalar(factor);
    const len = THREE.MathUtils.clamp(_scratchOffset.length(), minDist, 800);
    _scratchOffset.setLength(len);
    this.camera.position.copy(this.controls.target).add(_scratchOffset);
    this.applyCloseZoomFraming();
    this.controls.update();
    this.applyCloseZoomFraming();
    this.syncAvatarLodsNow();
    this.updateSceneOcclusion();
    this.updateCloseRangeShadowRig();
    this.emitLabels();
    this.renderFrame();
  }

  public setZoomDistance(distance: number): void {
    this.cameraTween = null;
    const minDist =
      this.focusedPersonSub !== null ? CAMERA_MIN_DISTANCE : CAMERA_WHEEL_MIN_DISTANCE;
    _scratchOffset.subVectors(this.camera.position, this.controls.target);
    if (_scratchOffset.lengthSq() < 1e-4) {
      _scratchOffset.set(0, 58, 140);
    }
    const len = THREE.MathUtils.clamp(distance, minDist, 800);
    _scratchOffset.setLength(len);
    this.camera.position.copy(this.controls.target).add(_scratchOffset);
    this.applyCloseZoomFraming();
    this.controls.update();
    this.applyCloseZoomFraming();
    this.syncAvatarLodsNow();
    this.updateSceneOcclusion();
    this.updateCloseRangeShadowRig();
    this.emitLabels();
    this.renderFrame();
  }

  public focusPlayerCloseUp(distance = CAMERA_PERSON_FOCUS_DEFAULT_DIST): void {
    this.cameraTween = null;
    this.focusedPersonSub = null;
    const d = THREE.MathUtils.clamp(distance, CAMERA_MIN_DISTANCE, 60);
    const pose = computePersonFocusCameraPose(
      { x: this.playerPos.x, y: this.playerPos.y, z: this.playerPos.z },
      this.playerPos.heading,
      false,
      this.activeColliders,
      d,
    );
    this.controls.minDistance = CAMERA_MIN_DISTANCE;
    this.controls.target.set(pose.targetPos.x, pose.targetPos.y, pose.targetPos.z);
    this.camera.position.set(pose.cameraPos.x, pose.cameraPos.y, pose.cameraPos.z);
    this.controls.update();
    this.syncAvatarLodsNow();
    this.updateSceneOcclusion();
    this.updateCloseRangeShadowRig();
    this.emitLabels();
    this.renderFrame();
  }

  private syncAvatarLodsNow(): void {
    const pDist = this.camera.position.distanceTo(this.playerRig.group.position);
    this.playerRig.updateLod(pDist);
    for (const rt of this.personRuntimes) {
      const dist = this.camera.position.distanceTo(rt.rig.group.position);
      rt.rig.updateLod(dist);
    }
  }

  public inspectAvatarSceneGraph(): AvatarSceneGraphAudit {
    let avatarSpriteCount = 0;
    const countSpritesAndMeshes = (root: THREE.Object3D) => {
      let meshes = 0;
      root.traverse((obj) => {
        if ((obj as THREE.Sprite).isSprite) avatarSpriteCount += 1;
        if ((obj as THREE.Mesh).isMesh) meshes += 1;
      });
      return meshes;
    };

    const playerMeshCount = countSpritesAndMeshes(this.playerRig.group);
    let minColleagueMeshCount = Number.POSITIVE_INFINITY;
    let allAvatarsVisible = this.playerRig.group.visible;
    let walkingCount = 0;
    let sittingCount = 0;

    for (const rt of this.personRuntimes) {
      const c = countSpritesAndMeshes(rt.rig.group);
      if (c < minColleagueMeshCount) minColleagueMeshCount = c;
      if (!rt.rig.group.visible) allAvatarsVisible = false;
      if (rt.isSeated) sittingCount += 1;
      else if (rt.person.presenceStatus === 'online') walkingCount += 1;
    }

    return {
      avatarCount: 1 + this.personRuntimes.length,
      playerMeshCount,
      minColleagueMeshCount: Number.isFinite(minColleagueMeshCount) ? minColleagueMeshCount : playerMeshCount,
      avatarSpriteCount,
      cameraDistanceToPlayer: Number(
        this.camera.position.distanceTo(this.playerRig.group.position).toFixed(2),
      ),
      allAvatarsVisible,
      renderedColleagueCount: this.personRuntimes.length,
      walkingCount,
      sittingCount,
      overflowCount: this.lastOverflowCount,
      onLeaveExcludedCount: this.lastOnLeaveCount,
      simplifiedMaterialActive: this.lastSimplifiedMaterial,
      focusedPersonSub: this.focusedPersonSub,
      occludedSuperstructureCount: this.occlusionController.getOccludedCount(),
      closeRangeShadowActive: this.closeRangeShadowActive,
      cameraMinDistance: this.controls.minDistance,
    };
  }

  public focusShip(projectId: string): void {
    const found = this.world.dockedShips.find((d) => d.ship.id === projectId);
    if (!found) return;
    this.cameraTween = null;
    this.controls.target.set(found.ship.berthX, 4.5, found.ship.berthZ);
    this.camera.position.set(found.ship.berthX + 18, 22, found.ship.berthZ + 32);
    this.controls.update();
    this.emitLabels();
    this.renderFrame();
  }

  public boardShip(projectId: string, durationMs = 600): void {
    const found = this.world.dockedShips.find((d) => d.ship.id === projectId);
    if (!found) return;

    const toTarget = new THREE.Vector3(found.ship.berthX, 6.2, found.ship.berthZ);
    const toPos = new THREE.Vector3(found.ship.berthX + 14, 17.5, found.ship.berthZ + 25);

    this.walkPath = [];
    this.waypointMarker.visible = false;
    this.playerPos.x = found.ship.boardingPoint.x;
    this.playerPos.z = found.ship.boardingPoint.z;
    this.playerPos.y = sampleHarborElevation(this.playerPos.x, this.playerPos.z);
    this.playerPos.heading = 0;
    this.playerRig.group.position.set(this.playerPos.x, this.playerPos.y, this.playerPos.z);
    this.playerHalo.position.set(this.playerPos.x, this.playerPos.y + 0.05, this.playerPos.z);
    this.callbacks.onPlayerPoseUpdated?.({
      x: this.playerPos.x,
      z: this.playerPos.z,
      heading: this.playerPos.heading,
    });

    if (durationMs <= 0 || this.reducedMotion) {
      this.cameraTween = null;
      this.controls.target.copy(toTarget);
      this.camera.position.copy(toPos);
      this.controls.update();
      this.emitLabels();
      this.renderFrame();
      return;
    }

    this.cameraTween = {
      startMs: performance.now(),
      durationMs,
      fromPos: this.camera.position.clone(),
      toPos,
      fromTarget: this.controls.target.clone(),
      toTarget,
    };
  }

  public disembarkToHarbor(durationMs = 450): void {
    const toTarget = new THREE.Vector3(0, 3.0, 22);
    const toPos = new THREE.Vector3(0, 58, 162);

    if (durationMs <= 0 || this.reducedMotion) {
      this.cameraTween = null;
      this.controls.target.copy(toTarget);
      this.camera.position.copy(toPos);
      this.controls.update();
      this.emitLabels();
      this.renderFrame();
      return;
    }

    this.cameraTween = {
      startMs: performance.now(),
      durationMs,
      fromPos: this.camera.position.clone(),
      toPos,
      fromTarget: this.controls.target.clone(),
      toTarget,
    };
  }

  public walkToPoint(x: number, z: number): void {
    const path = findQuayPath(
      { x: this.playerPos.x, z: this.playerPos.z },
      { x, z },
    );
    if (path.length > 0) {
      this.walkPath = path;
      const dest = path[path.length - 1];
      const y = sampleHarborElevation(dest.x, dest.z);
      this.waypointMarker.position.set(dest.x, y + 0.06, dest.z);
      this.waypointMarker.visible = true;
    }
  }

  public isPersonFocused(): boolean {
    return this.focusedPersonSub !== null;
  }

  public focusPerson(sub: string, durationMs = 580): void {
    const found = this.personRuntimes.find((r) => r.person.sub === sub);
    if (!found) return;
    this.focusedPersonSub = sub;
    this.controls.minDistance = CAMERA_MIN_DISTANCE;
    const focusBounds = computePolarAngleBoundsForDistance(CAMERA_PERSON_FOCUS_DEFAULT_DIST);
    this.controls.minPolarAngle = focusBounds.minPolarAngle;
    this.controls.maxPolarAngle = focusBounds.maxPolarAngle;

    const personY = sampleHarborElevation(found.curX, found.curZ);
    const pose = computePersonFocusCameraPose(
      { x: found.curX, y: personY, z: found.curZ },
      found.heading,
      found.isSeated,
      this.activeColliders,
      CAMERA_PERSON_FOCUS_DEFAULT_DIST,
    );

    // Turn standing colleague gently toward the camera so face & workwear detail read cleanly
    if (!found.isSeated) {
      found.heading = Math.atan2(pose.cameraPos.x - found.curX, pose.cameraPos.z - found.curZ);
      found.rig.group.rotation.y = found.heading;
    }

    const toTarget = new THREE.Vector3(pose.targetPos.x, pose.targetPos.y, pose.targetPos.z);
    const toPos = new THREE.Vector3(pose.cameraPos.x, pose.cameraPos.y, pose.cameraPos.z);

    this.hoveredLabelId = `person:${sub}`;

    if (durationMs <= 0 || this.reducedMotion) {
      this.cameraTween = null;
      this.controls.target.copy(toTarget);
      this.camera.position.copy(toPos);
      this.controls.update();
      this.syncAvatarLodsNow();
      this.updateSceneOcclusion();
      this.updateCloseRangeShadowRig();
      this.emitLabels();
      this.renderFrame();
      return;
    }

    this.cameraTween = {
      startMs: performance.now(),
      durationMs,
      fromPos: this.camera.position.clone(),
      toPos,
      fromTarget: this.controls.target.clone(),
      toTarget,
    };
    this.updateCloseRangeShadowRig();
    this.emitLabels();
  }

  private snapCameraToPreset(preset: CameraPreset): void {
    this.cameraTween = null;
    this.focusedPersonSub = null;
    if (preset === 'overview') {
      // Wide panoramic vista framing Home Harbor, 씨스타호, FD-01 & outer bay
      this.controls.target.set(0, 2.5, 28);
      this.camera.position.set(0, 88, 206);
    } else if (preset === 'quay') {
      this.controls.target.set(
        this.playerPos.x,
        this.playerPos.y + WORKER_CHEST_HEIGHT_OFFSET,
        this.playerPos.z,
      );
      this.camera.position.set(this.playerPos.x + 11, this.playerPos.y + 10.5, this.playerPos.z + 18);
    } else {
      // Default establishing shot framing North Quay, visible walking avatars,
      // Hero 씨스타호 (white+blue) & Floating Dock FD-01 (wide twin-wall dock) dead center in front of Central Quay,
      // plus all 4 business ships, Goliath cranes & background vessels
      this.controls.target.set(0, 3.0, 22);
      this.camera.position.set(0, 58, 162);
    }
    this.controls.update();
    this.chunkManager.update(this.controls.target.x, this.controls.target.z, this.elapsedTotal);
    this.ocean.update(this.elapsedTotal, this.controls.target.x, this.controls.target.z);
    this.updateSceneOcclusion();
    this.updateCloseRangeShadowRig();
    this.callbacks.onCameraTargetUpdated?.({
      x: this.controls.target.x,
      z: this.controls.target.z,
    });
    this.emitLabels();
    this.renderFrame();
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
      return;
    }
    this.keys.add(e.code);
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private handleWindowBlur = (): void => {
    this.keys.clear();
  };

  private handlePointerDown = (e: PointerEvent): void => {
    this.pointerDownPos.x = e.clientX;
    this.pointerDownPos.y = e.clientY;
  };

  private handlePointerMove = (e: PointerEvent): void => {
    const now = performance.now();
    if (now - this.lastHoverProbeMs < 75) return;
    this.lastHoverProbeMs = now;

    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    _scratchMouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    _scratchMouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(_scratchMouse, this.camera);

    let nextHover: string | null = null;
    const personHits = this.raycaster.intersectObjects(this.personHitProxies, false);
    if (personHits.length > 0) {
      const sub = (personHits[0].object.userData as { personSub?: string }).personSub;
      if (sub) nextHover = `person:${sub}`;
    } else {
      const shipHits = this.raycaster.intersectObjects(this.world.clickableShipProxies, false);
      if (shipHits.length > 0) {
        const id = (shipHits[0].object.userData as { projectId?: string }).projectId;
        if (id) nextHover = `ship:${id}`;
      } else {
        const decoHits = this.raycaster.intersectObjects(
          this.world.clickableDecorativeShipProxies,
          false,
        );
        if (decoHits.length > 0) {
          const id = (decoHits[0].object.userData as { decorativeShipId?: string })
            .decorativeShipId;
          if (id) nextHover = `deco:${id}`;
        } else {
          const portalHits = this.raycaster.intersectObjects(
            this.world.clickablePortalProxies,
            false,
          );
          if (portalHits.length > 0) {
            const id = (portalHits[0].object.userData as { portalId?: string }).portalId;
            if (id) nextHover = `portal:${id}`;
          } else {
            const hubHits = this.raycaster.intersectObjects(
              this.world.clickableHubBuildingProxies,
              false,
            );
            if (hubHits.length > 0) {
              const modId = (hubHits[0].object.userData as { hubModuleId?: string }).hubModuleId;
              if (modId) nextHover = `hub:${modId}`;
            }
          }
        }
      }
    }

    this.renderer.domElement.style.cursor = nextHover ? 'pointer' : 'grab';
    if (nextHover !== this.hoveredLabelId) {
      this.hoveredLabelId = nextHover;
      this.emitLabels();
    }
  };

  private handlePointerUp = (e: PointerEvent): void => {
    const dist = Math.hypot(e.clientX - this.pointerDownPos.x, e.clientY - this.pointerDownPos.y);
    if (dist > 6) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    _scratchMouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    _scratchMouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(_scratchMouse, this.camera);

    // 1. People avatars -> Unified Entity Action Popup
    const personHits = this.raycaster.intersectObjects(this.personHitProxies, false);
    if (personHits.length > 0) {
      const sub = (personHits[0].object.userData as { personSub?: string }).personSub;
      if (sub) {
        this.callbacks.onPersonClicked(sub, { x: e.clientX, y: e.clientY });
        return;
      }
    }

    // 2. Docked SEDMS business project ships -> Unified Entity Action Popup
    const shipHits = this.raycaster.intersectObjects(this.world.clickableShipProxies, false);
    if (shipHits.length > 0) {
      const projectId = (shipHits[0].object.userData as { projectId?: string }).projectId;
      if (projectId) {
        this.callbacks.onShipClicked(projectId, { x: e.clientX, y: e.clientY });
        return;
      }
    }

    // 3. Decorative Hero/Scenery ships (씨스타호, FD-01, etc.) -> Decorative rename/rotate popup (zero SEDMS links)
    const decoHits = this.raycaster.intersectObjects(
      this.world.clickableDecorativeShipProxies,
      false,
    );
    if (decoHits.length > 0) {
      const decoId = (decoHits[0].object.userData as { decorativeShipId?: string })
        .decorativeShipId;
      const found = this.world.decorativeVessels.find((d) => d.spec.id === decoId);
      if (found) {
        this.callbacks.onDecorativeShipClicked?.(
          {
            id: found.spec.id,
            defaultName: found.spec.defaultName,
            subtitle: found.spec.subtitle,
            x: found.anchor.position.x,
            z: found.anchor.position.z,
            defaultYawDeg: found.spec.defaultYawDeg,
            halfLength: found.spec.halfLength,
            halfBeam: found.spec.halfBeam,
          },
          { x: e.clientX, y: e.clientY },
        );
        return;
      }
    }

    // 4. SGW portal pavilions
    const portalHits = this.raycaster.intersectObjects(this.world.clickablePortalProxies, false);
    if (portalHits.length > 0) {
      const portalId = (portalHits[0].object.userData as { portalId?: PortalBuildingSpec['id'] })
        .portalId;
      if (portalId) {
        this.callbacks.onPortalClicked(portalId);
        return;
      }
    }

    // 4b. Hub Module Harbor Buildings (360 · SECAD · PDF · 메일 · SEcMS & future registry systems)
    const hubHits = this.raycaster.intersectObjects(this.world.clickableHubBuildingProxies, false);
    if (hubHits.length > 0) {
      const hubModuleId = (hubHits[0].object.userData as { hubModuleId?: string }).hubModuleId;
      if (hubModuleId) {
        this.callbacks.onHubBuildingClicked?.(hubModuleId, { x: e.clientX, y: e.clientY });
        return;
      }
    }

    // 5. Click-to-walk on quay
    if (this.raycaster.ray.intersectPlane(_quayPlane, _scratchHit)) {
      const path = findQuayPath(
        { x: this.playerPos.x, z: this.playerPos.z },
        { x: _scratchHit.x, z: _scratchHit.z },
      );
      if (path.length > 0) {
        this.walkPath = path;
        const dest = path[path.length - 1];
        this.waypointMarker.position.set(
          dest.x,
          sampleHarborElevation(dest.x, dest.z) + 0.06,
          dest.z,
        );
        this.waypointMarker.visible = true;
      }
    }
  };

  private handleContextLost = (e: Event): void => {
    e.preventDefault();
    if (this.contextLost) return;
    this.contextLost = true;
    cancelAnimationFrame(this.frameId);
    window.clearTimeout(this.softTimerId);
    this.callbacks.onContextLost?.();
  };

  private handleContextRestored = (): void => {
    if (this.disposed) return;
    this.contextLost = false;
    this.applyAtmosphere(this.darkTheme);
    this.handleResize();
    this.lastFrameMs = performance.now();
    this.tick();
    this.callbacks.onContextRestored?.();
  };

  private handleResize(): void {
    if (this.disposed) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const pr = resolvePixelRatioForQuality(this.qualityTier, window.devicePixelRatio || 1);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h);
    if (this.composer) {
      this.composer.setPixelRatio(pr);
      this.composer.setSize(w, h);
    }
    if (this.bloomPass) {
      this.bloomPass.resolution.set(Math.max(1, Math.floor(w / 2)), Math.max(1, Math.floor(h / 2)));
    }
    if (this.smaaPass) {
      this.smaaPass.setSize(Math.max(1, Math.floor(w * pr)), Math.max(1, Math.floor(h * pr)));
    }
    this.emitLabels();
    this.renderFrame();
  }

  private updatePlayerMovement(dt: number): void {
    let moveX = 0;
    let moveZ = 0;
    const fwd =
      (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0) -
      (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0);
    const strafe =
      (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) -
      (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);

    // Shift + WASD pans the camera freely across the infinite coastline (Requirement #11)
    const freePanMode =
      this.keys.has('ShiftLeft') ||
      this.keys.has('ShiftRight') ||
      Math.hypot(this.controls.target.x, this.controls.target.z) > 130;

    if ((fwd !== 0 || strafe !== 0) && freePanMode) {
      this.camera.getWorldDirection(_scratchForward);
      _scratchForward.y = 0;
      if (_scratchForward.lengthSq() > 0.001) _scratchForward.normalize();
      _scratchRight.crossVectors(_scratchForward, _scratchCamUp).normalize();
      const panSpeed = 65 * dt;
      const dx = (_scratchForward.x * fwd + _scratchRight.x * strafe) * panSpeed;
      const dz = (_scratchForward.z * fwd + _scratchRight.z * strafe) * panSpeed;
      this.controls.target.x += dx;
      this.controls.target.z += dz;
      this.camera.position.x += dx;
      this.camera.position.z += dz;
      this.playerPos.speed = 0;
    } else if (fwd !== 0 || strafe !== 0) {
      this.walkPath = [];
      this.waypointMarker.visible = false;
      this.camera.getWorldDirection(_scratchForward);
      _scratchForward.y = 0;
      if (_scratchForward.lengthSq() > 0.001) _scratchForward.normalize();
      _scratchRight.crossVectors(_scratchForward, _scratchCamUp).normalize();
      moveX = _scratchForward.x * fwd + _scratchRight.x * strafe;
      moveZ = _scratchForward.z * fwd + _scratchRight.z * strafe;
    } else if (this.walkPath.length > 0) {
      const next = this.walkPath[0];
      const dx = next.x - this.playerPos.x;
      const dz = next.z - this.playerPos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.65) {
        this.walkPath.shift();
        if (this.walkPath.length === 0) this.waypointMarker.visible = false;
      } else {
        moveX = dx / dist;
        moveZ = dz / dist;
      }
    }

    const mag = Math.hypot(moveX, moveZ);
    if (mag > 0.01) {
      const speed = 10.5;
      const nx = moveX / mag;
      const nz = moveZ / mag;
      const peers = this.personRuntimes.map((r) => ({
        x: r.curX,
        z: r.curZ,
      }));
      // Full physical collision resolution: wall sliding, water stop, peer separation (Req #17)
      const resolved = resolveAvatarPhysicsMovement(
        { x: this.playerPos.x, z: this.playerPos.z },
        { x: this.playerPos.x + nx * speed * dt, z: this.playerPos.z + nz * speed * dt },
        peers,
        this.activeColliders,
      );
      this.playerPos.x = resolved.x;
      this.playerPos.z = resolved.z;
      this.playerPos.y = sampleHarborElevation(resolved.x, resolved.z);
      this.playerPos.heading = Math.atan2(nx, nz);
      this.playerPos.speed = speed;
    } else {
      this.playerPos.speed = 0;
    }

    this.playerRig.group.position.set(this.playerPos.x, this.playerPos.y, this.playerPos.z);
    this.playerRig.group.rotation.y = this.playerPos.heading;
    this.playerHalo.position.set(this.playerPos.x, this.playerPos.y + 0.05, this.playerPos.z);

    // Distance-based LOD for player avatar
    const playerCamDist = this.camera.position.distanceTo(this.playerRig.group.position);
    this.playerRig.updateLod(playerCamDist);
    this.playerRig.updateAnimation(
      dt,
      this.elapsedTotal,
      this.playerPos.speed > 0.2 ? 'run' : 'idle',
      this.shouldSuppressMotion(),
    );
  }

  private projectToScreen(
    x: number,
    y: number,
    z: number,
  ): { x: number; y: number; visible: boolean; distance: number } {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    const distance = this.camera.position.distanceTo(_scratchProj.set(x, y, z));
    _scratchProj.project(this.camera);
    const visible =
      _scratchProj.z >= -1 &&
      _scratchProj.z <= 1 &&
      _scratchProj.x >= -1.02 &&
      _scratchProj.x <= 1.02 &&
      _scratchProj.y >= -1.02 &&
      _scratchProj.y <= 1.02;
    return {
      x: (_scratchProj.x * 0.5 + 0.5) * w,
      y: (-_scratchProj.y * 0.5 + 0.5) * h,
      visible,
      distance,
    };
  }

  /**
   * Minimal, non-cluttering 2D markers (Requirements #6 & #18):
   *   - Default state shows ONLY tiny unobtrusive dots (`showText: false`) for business ships & Hero landmarks.
   *   - Hovering any ship, person, or portal reveals a single concise name tooltip (`showText: true`).
   *   - Overlapping & distant markers are culled so floating balloons NEVER cover the 3D harbor!
   */
  private emitLabels(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    const candidates: ProjectedLabel[] = [];

    // 1. Currently hovered entity always gets priority with concise text tooltip
    if (this.hoveredLabelId?.startsWith('person:')) {
      const sub = this.hoveredLabelId.slice(7);
      const rt = this.personRuntimes.find((r) => r.person.sub === sub);
      if (rt) {
        const y = sampleHarborElevation(rt.curX, rt.curZ);
        const p = this.projectToScreen(rt.curX, y + (rt.isSeated ? 2.6 : 3.2), rt.curZ);
        candidates.push({
          id: `person:${rt.person.sub}`,
          text: rt.person.name,
          subText: `${rt.person.dept} · ${rt.person.presenceLabelKo}`,
          kind:
            rt.person.presenceStatus === 'away'
              ? 'person-away'
              : rt.person.isPartner
                ? 'person-partner'
                : rt.person.presenceStatus === 'online'
                  ? 'person-online'
                  : 'person-offline',
          showText: true,
          ...p,
        });
      }
    } else if (this.hoveredLabelId?.startsWith('portal:')) {
      const portalId = this.hoveredLabelId.slice(7);
      const b = PORTAL_BUILDINGS.find((item) => item.id === portalId);
      if (b) {
        const p = this.projectToScreen(b.centerX, 8.8, b.centerZ);
        candidates.push({
          id: `portal:${b.id}`,
          text: b.label,
          kind: 'portal',
          accentHex: b.accentHex,
          showText: true,
          ...p,
        });
      }
    } else if (this.hoveredLabelId?.startsWith('hub:')) {
      const modId = this.hoveredLabelId.slice(4);
      const hb = this.world.hubBuildings.find((item) => item.placement.moduleId === modId);
      if (hb) {
        const p = this.projectToScreen(
          hb.placement.lot.centerX,
          9.6,
          hb.placement.lot.centerZ,
        );
        candidates.push({
          id: `hub:${hb.placement.moduleId}`,
          text: hb.placement.chip.name,
          subText: hb.placement.appearance.signBannerText,
          kind: 'hub-building',
          accentHex: hb.placement.appearance.accentHex,
          showText: true,
          ...p,
        });
      }
    } else if (this.hoveredLabelId?.startsWith('deco:')) {
      const decoId = this.hoveredLabelId.slice(5);
      const deco = this.world.decorativeVessels.find((d) => d.spec.id === decoId);
      if (deco) {
        const customName = this.shipDisplayPrefs[deco.spec.id]?.customName;
        const p = this.projectToScreen(deco.anchor.position.x, 16.5, deco.anchor.position.z);
        candidates.push({
          id: `deco:${deco.spec.id}`,
          text: customName || deco.spec.defaultName,
          subText: deco.spec.subtitle,
          kind: 'deco-ship',
          accentHex: deco.spec.isHero ? '#f59e0b' : '#94a3b8',
          showText: true,
          ...p,
        });
      }
    }

    // 2. Business SEDMS Ships — tiny dot marker by default; short name ONLY when hovered
    for (const item of this.world.dockedShips) {
      const id = `ship:${item.ship.id}`;
      const p = this.projectToScreen(item.ship.berthX, 17.6, item.ship.berthZ);
      if (p.distance > 420) continue;
      const customName = this.shipDisplayPrefs[item.ship.id]?.customName;
      candidates.push({
        id,
        text: customName || item.ship.name,
        subText: customName ? item.ship.name : item.ship.code,
        kind: 'ship',
        accentHex: item.ship.accentHex,
        showText: this.hoveredLabelId === id,
        ...p,
      });
    }

    // 3. Hero Decorative Landmarks (씨스타호, FD-01) — tiny amber dot only (no text unless hovered)
    for (const deco of this.world.decorativeVessels) {
      if (!deco.spec.isHero) continue;
      const id = `deco:${deco.spec.id}`;
      if (id === this.hoveredLabelId) continue;
      const p = this.projectToScreen(deco.anchor.position.x, 16.5, deco.anchor.position.z);
      if (p.distance > 380) continue;
      const customName = this.shipDisplayPrefs[deco.spec.id]?.customName;
      candidates.push({
        id,
        text: customName || deco.spec.defaultName,
        subText: deco.spec.subtitle,
        kind: 'deco-ship',
        accentHex: '#f59e0b',
        showText: false,
        ...p,
      });
    }

    const cleanLabels = declutterProjectedLabels(candidates, w, h);
    this.callbacks.onLabelsUpdated(cleanLabels);
  }

  private renderFrame(): void {
    if (this.contextLost || this.disposed) return;
    const t0 = performance.now();
    this.renderer.info.reset();
    if (this.composer && this.qualityTier === 'high' && !this.isSoftwareGl) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    const frameMs = performance.now() - t0;
    this.avgFrameTimeMs =
      this.avgFrameTimeMs === 0 ? frameMs : this.avgFrameTimeMs * 0.85 + frameMs * 0.15;
    if (this.renderer.info.render.calls > this.peakDrawCalls) {
      this.peakDrawCalls = this.renderer.info.render.calls;
    }

    // Evaluate real 3-second average frame time auto-downgrade (Requirement #1)
    if (!this.autoQualityEvaluated && !this.userLockedQuality && !this.isSoftwareGl) {
      this.autoQualitySamplesMs.push(frameMs);
      const elapsed = performance.now() - this.autoQualityStartMs;
      if (elapsed >= 3000 && this.autoQualitySamplesMs.length >= 10) {
        this.autoQualityEvaluated = true;
        const meanMs =
          this.autoQualitySamplesMs.reduce((acc, v) => acc + v, 0) /
          this.autoQualitySamplesMs.length;
        const nextTier = evaluateAutoQualityDowngrade({
          currentTier: this.qualityTier,
          userLockedTier: this.userLockedQuality,
          measuredElapsedMs: elapsed,
          avgFrameTimeMs: meanMs,
        });
        if (nextTier !== this.qualityTier) {
          this.setQualityTier(nextTier, false);
          this.callbacks.onQualityAutoDowngraded?.(nextTier, meanMs);
        }
      }
    }
  }

  private scheduleNextTick(): void {
    if (this.disposed || this.contextLost) return;
    if (this.isSoftwareGl) {
      // Pace software WebGL cleanly with fenceSync + 60ms pause so headless browser never starves
      const gl = this.renderer.getContext() as WebGL2RenderingContext;
      if (typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (this.disposed || this.contextLost) {
            if (sync) gl.deleteSync(sync);
            return;
          }
          const status = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
          if (status === gl.UNSIGNALED) {
            this.softTimerId = window.setTimeout(poll, 8);
          } else {
            if (sync) gl.deleteSync(sync);
            this.softTimerId = window.setTimeout(() => {
              this.frameId = requestAnimationFrame(this.tick);
            }, 55);
          }
        };
        this.softTimerId = window.setTimeout(poll, 8);
      } else {
        this.softTimerId = window.setTimeout(() => {
          this.frameId = requestAnimationFrame(this.tick);
        }, 70);
      }
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  }

  private tick = (): void => {
    if (this.disposed || this.contextLost) return;

    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastFrameMs) / 1000));
    this.lastFrameMs = now;
    this.elapsedTotal += dt;

    if (this.cameraTween) {
      const elapsed = now - this.cameraTween.startMs;
      const rawT = Math.min(1, Math.max(0, elapsed / this.cameraTween.durationMs));
      const eased = 1 - Math.pow(1 - rawT, 3);
      this.camera.position.lerpVectors(this.cameraTween.fromPos, this.cameraTween.toPos, eased);
      this.controls.target.lerpVectors(
        this.cameraTween.fromTarget,
        this.cameraTween.toTarget,
        eased,
      );
      if (rawT >= 1) {
        this.cameraTween = null;
      }
    }

    this.controls.update();

    // Keep orbit target & camera strictly above quay deck and water surface
    const targetGroundY = sampleHarborElevation(this.controls.target.x, this.controls.target.z);
    const minTargetY = targetGroundY > 0.1 ? targetGroundY + 0.2 : 0.6;
    if (this.controls.target.y < minTargetY) {
      this.controls.target.y = minTargetY;
    }

    // Apply Stage 11 close-zoom full-body framing & water-ratio guard during free zoom (preserving focusPerson & tweens)
    if (!this.cameraTween) {
      this.applyCloseZoomFraming();
    } else {
      const clampedCam = clampCameraCollision(this.camera.position, this.activeColliders);
      this.camera.position.set(clampedCam.x, clampedCam.y, clampedCam.z);
    }

    // Dynamically fade occluding ship superstructures (0.25) & vertical props (0.15) and boost close-range shadows
    this.updateSceneOcclusion();
    this.updateCloseRangeShadowRig();

    this.updatePlayerMovement(dt);

    // Stream infinite 200x200m chunks around camera focus & update endless ocean
    this.chunkManager.update(this.controls.target.x, this.controls.target.z, this.elapsedTotal);
    this.ocean.update(this.elapsedTotal, this.controls.target.x, this.controls.target.z);

    const suppressMotion = this.shouldSuppressMotion();
    let anyNpcMoved = false;
    for (const rt of this.personRuntimes) {
      const distToPlayer = Math.hypot(
        rt.curX - this.playerPos.x,
        rt.curZ - this.playerPos.z,
      );
      const isFocusedTarget = rt.person.sub === this.focusedPersonSub;

      let action: AvatarActionState = 'idle';
      if (rt.isSeated) {
        action = 'sit';
      } else if (isFocusedTarget) {
        action = 'idle';
      } else if (rt.person.presenceStatus === 'online' && distToPlayer < 7.5) {
        action = 'wave';
      } else if (!suppressMotion && rt.person.presenceStatus === 'online' && rt.patrolRange > 0.5) {
        // Gentle quay-only patrol walk — strictly clamped to concrete quay (zero water/building/bench clipping)
        const walkSpeed = 1.55;
        const desiredX = rt.curX + rt.patrolDir * walkSpeed * dt;
        const desiredZ = rt.homeZ;
        const otherPeers: Array<{ x: number; z: number }> = [
          { x: this.playerPos.x, z: this.playerPos.z },
        ];
        for (const other of this.personRuntimes) {
          if (other !== rt) otherPeers.push({ x: other.curX, z: other.curZ });
        }
        const resolved = resolveAvatarPhysicsMovement(
          { x: rt.curX, z: rt.curZ },
          { x: desiredX, z: desiredZ },
          otherPeers,
          this.activeColliders,
        );
        const movedDist = Math.hypot(resolved.x - rt.curX, resolved.z - rt.curZ);
        if (
          movedDist < walkSpeed * dt * 0.25 ||
          Math.abs(resolved.x - rt.homeX) >= rt.patrolRange
        ) {
          rt.patrolDir = rt.patrolDir === 1 ? -1 : 1;
        } else {
          rt.curX = resolved.x;
          rt.curZ = resolved.z;
          rt.heading = rt.patrolDir > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
          const y = sampleHarborElevation(rt.curX, rt.curZ);
          rt.rig.group.position.set(rt.curX, y, rt.curZ);
          rt.rig.group.rotation.y = rt.heading;
          anyNpcMoved = true;

          if (this.presenceRingBatch) {
            _scratchInstDummy.position.set(rt.curX, y + 0.055, rt.curZ);
            _scratchInstDummy.rotation.set(0, 0, 0);
            _scratchInstDummy.scale.set(1, 1, 1);
            _scratchInstDummy.updateMatrix();
            this.presenceRingBatch.setMatrixAt(rt.instanceIdx, _scratchInstDummy.matrix);
          }
          if (this.npcShadowBatch) {
            _scratchInstDummy.position.set(rt.curX, y + 0.03, rt.curZ);
            _scratchInstDummy.rotation.set(0, 0, 0);
            _scratchInstDummy.scale.set(2.35, 1, 2.35);
            _scratchInstDummy.updateMatrix();
            this.npcShadowBatch.setMatrixAt(rt.instanceIdx, _scratchInstDummy.matrix);
          }
        }
        action = 'run';
      }

      const dist = this.camera.position.distanceTo(rt.rig.group.position);
      rt.rig.updateLod(dist);
      rt.rig.updateAnimation(dt, this.elapsedTotal + rt.phase, action, suppressMotion);
    }
    if (anyNpcMoved) {
      if (this.presenceRingBatch) this.presenceRingBatch.instanceMatrix.needsUpdate = true;
      if (this.npcShadowBatch) this.npcShadowBatch.instanceMatrix.needsUpdate = true;
    }

    this.world.update(dt, this.elapsedTotal, suppressMotion, this.reducedMotion);

    this.renderFrame();
    this.frameCountWindow += 1;

    if (now - this.lastMetricsEmitMs >= 500) {
      const elapsedSec = Math.max(0.001, (now - this.lastMetricsEmitMs) / 1000);
      if (this.lastMetricsEmitMs > 0) {
        this.measuredFps = Math.min(120, Math.round(this.frameCountWindow / elapsedSec));
      }
      this.frameCountWindow = 0;
      this.lastMetricsEmitMs = now;
      this.callbacks.onRenderMetricsUpdated?.(this.getRenderMetrics());
    }

    if (now - this.lastLabelEmitMs >= 120) {
      this.lastLabelEmitMs = now;
      this.emitLabels();
      this.callbacks.onPlayerPoseUpdated?.({
        x: this.playerPos.x,
        z: this.playerPos.z,
        heading: this.playerPos.heading,
      });
      this.callbacks.onCameraTargetUpdated?.({
        x: this.controls.target.x,
        z: this.controls.target.z,
      });
    }

    this.scheduleNextTick();
  };

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    window.clearTimeout(this.softTimerId);
    this.resizeObserver.disconnect();
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleWindowBlur);
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.removeEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.removeEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.handleContextRestored);

    this.occlusionController.restoreAll();
    this.verticalPropOcclusionController.restoreAll();
    this.disposePeopleBatches();
    for (const rt of this.personRuntimes) {
      rt.rig.dispose();
      rt.hitProxy.geometry.dispose();
      (rt.hitProxy.material as THREE.Material).dispose();
    }
    if (this.composer) {
      this.composer.dispose();
      this.composer = null;
    }
    if (this.composerRT) {
      this.composerRT.dispose();
      this.composerRT = null;
    }
    this.skyDome.mesh.geometry.dispose();
    (this.skyDome.mesh.material as THREE.Material).dispose();
    this.controls.dispose();
    this.chunkManager.dispose();
    this.world.dispose();
    this.ocean.dispose();
    this.textures.dispose();
    this.playerRig.dispose();
    if (this.envRT) this.envRT.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
