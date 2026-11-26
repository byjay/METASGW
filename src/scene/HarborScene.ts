import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  CONNECTED_HARBOR_STAFF,
  ENGINEERING_MODULES,
  FLEET_SHIPS,
  type ActorRoleType,
  type HarborStaffConfig,
  type ModuleId,
  type ShipId,
} from '../config/fleetConfig';
import {
  evaluateProximityState,
  HarborDHTNode,
  type ProximityState,
  type SpatialAgent,
  type Vec2,
} from '../core/spatialEngine';
import {
  findQuayPath,
  getBuildingContainingPoint,
  resolveQuayMovement,
  resolveShipNavCollision,
  sampleQuaySurfaceHeight,
  WALK_IN_BUILDINGS,
} from '../core/navMeshEngine';
import {
  VrmAudioLipSyncController,
  type LipSyncMode,
  type VrmVisemeWeights,
} from '../core/lipSyncEngine';
import { buildCompositeShipMesh, type BuiltShipRig } from './shipModels';
import {
  buildHumanoidEngineerAvatar,
  loadExternalVrmOrGlbAvatar,
  type BuiltHumanoidRig,
  type RpgActionState,
  type VrmExpression,
} from './humanoidAvatar';
import { createHarborTextures, type HarborTexturePack } from './textures';
import { createMaritimeOcean, type OceanWaterSystem } from './oceanShader';
import { buildShipyardWorld, type ShipyardWorldHandles } from './shipyardWorld';
import {
  createNativeFaroPointCloud,
  type NativePointCloudSystem,
  type PointCloudColorMode,
} from './pointCloudSystem';

export type CameraPreset = 'quarter' | 'shoulder' | 'overview' | 'pointcloud';
export type AvatarMode = 'ship' | 'humanoid';
export type AppModeState = 'title' | 'playing';
export type TimeOfDayMode = 'golden' | 'day' | 'night';

export interface ProjectedLabel {
  id: string;
  text: string;
  subText?: string;
  kind: 'ship-employee' | 'ship-partner' | 'zone' | 'zone-silent';
  x: number;
  y: number;
  visible: boolean;
  isPlayer?: boolean;
}

export interface HarborTelemetry {
  playerPos: Vec2;
  playerY: number;
  speedKnots: number;
  headingDeg: number;
  actionState: RpgActionState;
  avatarMode: AvatarMode;
  insideBuildingId: ModuleId | null;
  insideBuildingName: string | null;
  lipSyncMode: LipSyncMode;
  lipSyncVolume: number;
  vrmModelName: string;
  pointCloudLabel: string;
  spatialPan: number;
  proximity: ProximityState;
  dhtInterestCount: number;
  predictedZoneName: string | null;
  fpsEstimate: number;
}

export interface HarborSceneCallbacks {
  onTelemetry: (telemetry: HarborTelemetry) => void;
  onZoneClicked: (moduleId: ModuleId) => void;
  onLabelsUpdated: (labels: ProjectedLabel[]) => void;
}

interface StaffNpcRuntime {
  cfg: HarborStaffConfig;
  rig: BuiltHumanoidRig;
  x: number;
  y: number;
  z: number;
  heading: number;
  phase: number;
}

// Pre-allocated scratch objects (Zero GC inside render loop)
const _scratchTarget = new THREE.Vector3();
const _scratchCamPos = new THREE.Vector3();
const _scratchProj = new THREE.Vector3();
const _scratchMouse = new THREE.Vector2();
const _scratchForward = new THREE.Vector3();
const _scratchRight = new THREE.Vector3();
const _scratchCamForward = new THREE.Vector3();
const _scratchCamUp = new THREE.Vector3(0, 1, 0);
const _waterPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _quayPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.61);
const _scratchHit = new THREE.Vector3();
const _sunVec = new THREE.Vector3();

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export class HarborSceneController {
  private container: HTMLElement;
  private callbacks: HarborSceneCallbacks;
  private isSoftwareGl: boolean;

  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private sky: Sky;
  private textures: HarborTexturePack;
  private envRT: THREE.WebGLRenderTarget | null = null;
  private sunKeyLight!: THREE.DirectionalLight;
  private hemiFillLight!: THREE.HemisphereLight;
  private rimLight!: THREE.DirectionalLight;

  private ocean: OceanWaterSystem;
  private world: ShipyardWorldHandles;
  private pointCloud: NativePointCloudSystem;

  private shipRigs = new Map<ShipId, BuiltShipRig>();
  private shipPositions = new Map<ShipId, { x: number; z: number; heading: number; speed: number; vx: number; vz: number }>();
  private staffNpcs: StaffNpcRuntime[] = [];

  private raycaster = new THREE.Raycaster();
  private playerHalo: THREE.Mesh;
  private waypointMarker: THREE.Mesh;

  private humanoidRig: BuiltHumanoidRig | null = null;
  // Default spawn: Central Harbor Promenade right in front of FARO 360 open glass entrance!
  private humanoidPos = { x: 0, y: 1.61, z: -15.5, heading: 0, speed: 0 };
  private avatarMode: AvatarMode = 'humanoid';
  private manualAction: RpgActionState | null = null;
  private vrmExpression: VrmExpression = 'neutral';
  private lipSync = new VrmAudioLipSyncController();
  private lastVisemes: VrmVisemeWeights = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0, volume: 0 };

  private activeShipId: ShipId = 'tug_captain';
  private actorRole: ActorRoleType = 'employee';
  private tenantId = 'seastar';
  private projectId = 'H1042';
  private appMode: AppModeState = 'title';
  private cameraPreset: CameraPreset = 'quarter';
  private timeOfDay: TimeOfDayMode = 'golden';

  // Offset-tracking Quarter-View RPG camera state (NO permanent orbit lock!)
  private cameraOffset = new THREE.Vector3(12, 14, 17);
  private isPointerOrbiting = false;
  private insideBuildingId: ModuleId | null = null;

  private keys = new Set<string>();
  private virtualInput = { forward: 0, turn: 0 };
  private walkPath: Vec2[] = [];
  private autopilotTarget: Vec2 | null = null;
  private pendingModuleOnArrival: ModuleId | null = null;

  private dht = new HarborDHTNode();
  private lastFrameMs = performance.now();
  private frameId = 0;
  private disposed = false;
  private lastTelemetryTime = 0;
  private elapsedTotal = 0;

  private pointerDownPos = { x: 0, y: 0 };
  private resizeObserver: ResizeObserver;

  constructor(container: HTMLElement, callbacks: HarborSceneCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareWebGL();

    // 1. Renderer setup with Software WebGL guard & ACESFilmicToneMapping
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    container.appendChild(this.renderer.domElement);

    // 2. Scene + Physically-Based Preetham Sky + Fog
    this.scene = new THREE.Scene();
    this.sky = new Sky();
    this.sky.scale.setScalar(900);
    this.scene.add(this.sky);

    // 3. Camera & OrbitControls (Offset-tracking spherical RPG camera)
    this.camera = new THREE.PerspectiveCamera(46, w / h, 0.5, 620);
    this.camera.position.set(16, 17, 26);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.07;
    this.controls.enablePan = false;
    this.controls.maxPolarAngle = Math.PI * 0.46;
    this.controls.minPolarAngle = 0.24;
    this.controls.minDistance = 8.5;
    this.controls.maxDistance = 125;
    this.controls.target.set(0, 2.4, -15.5);

    this.controls.addEventListener('start', () => {
      this.isPointerOrbiting = true;
    });
    this.controls.addEventListener('end', () => {
      this.isPointerOrbiting = false;
      // Preserve user's chosen orbit angle & zoom distance as the new RPG follow offset!
      if (this.appMode === 'playing' && (this.cameraPreset === 'quarter' || this.cameraPreset === 'shoulder')) {
        this.cameraOffset.subVectors(this.camera.position, this.controls.target);
        const len = this.cameraOffset.length();
        if (len < 9) this.cameraOffset.setLength(9);
        if (len > 48) this.cameraOffset.setLength(48);
      }
    });

    // 4. Lighting, Ocean, 2X Walk-In Shipyard World, Point Cloud, 8 Ships, Player & 8 Staff Humanoids
    this.textures = createHarborTextures(this.renderer.capabilities.getMaxAnisotropy());
    this.setupLighting();

    this.ocean = createMaritimeOcean(this.isSoftwareGl);
    this.scene.add(this.ocean.mesh);

    this.world = buildShipyardWorld(this.scene, this.textures);
    this.pointCloud = createNativeFaroPointCloud(this.scene);

    // Player Selection Halo Ring + Click-to-Move Glowing Waypoint Ring
    const haloGeo = new THREE.RingGeometry(1.15, 1.48, 32);
    haloGeo.rotateX(-Math.PI / 2);
    this.playerHalo = new THREE.Mesh(
      haloGeo,
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.playerHalo.position.set(0, 1.65, -15.5);
    this.scene.add(this.playerHalo);

    const wpGeo = new THREE.RingGeometry(0.55, 0.88, 28);
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

    this.buildFleetShips();
    this.buildHumanoidAvatar();
    this.buildConnectedStaffNpcs();

    // Apply Golden Hour Maritime Atmosphere + Sky-derived PMREM
    this.applyAtmosphere(this.timeOfDay);

    // 5. GPU Post-Processing (EffectComposer + UnrealBloomPass + OutputPass on Hardware GPU ONLY)
    if (!this.isSoftwareGl) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.24, 0.45, 0.92);
      this.composer.addPass(this.bloomPass);
      this.composer.addPass(new OutputPass());
      this.renderer.compile(this.scene, this.camera);
    }

    // 6. Event Listeners
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleWindowBlur);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.addEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);

    // Initial immediate frame so canvas is crisp from frame 0
    this.camera.lookAt(this.controls.target);
    this.renderFrame();
    this.lastFrameMs = performance.now();
    this.tick();
  }

  private setupLighting(): void {
    this.sunKeyLight = new THREE.DirectionalLight(0xffe9c4, 2.25);
    this.sunKeyLight.position.set(55, 58, 42);
    if (!this.isSoftwareGl) {
      this.sunKeyLight.castShadow = true;
      this.sunKeyLight.shadow.mapSize.width = 2048;
      this.sunKeyLight.shadow.mapSize.height = 2048;
      this.sunKeyLight.shadow.camera.near = 10;
      this.sunKeyLight.shadow.camera.far = 220;
      const d = 88;
      this.sunKeyLight.shadow.camera.left = -d;
      this.sunKeyLight.shadow.camera.right = d;
      this.sunKeyLight.shadow.camera.top = d;
      this.sunKeyLight.shadow.camera.bottom = -d;
      this.sunKeyLight.shadow.bias = -0.0005;
      this.sunKeyLight.shadow.normalBias = 0.025;
    }
    this.scene.add(this.sunKeyLight);

    this.hemiFillLight = new THREE.HemisphereLight(0xb8dcff, 0x16324f, 0.88);
    this.hemiFillLight.position.set(0, 80, 0);
    this.scene.add(this.hemiFillLight);

    this.rimLight = new THREE.DirectionalLight(0xbae6fd, 0.58);
    this.rimLight.position.set(-48, 28, -56);
    this.scene.add(this.rimLight);
  }

  private applyAtmosphere(mode: TimeOfDayMode): void {
    this.timeOfDay = mode;
    const skyUniforms = this.sky.material.uniforms;

    let elevation = 18;
    let azimuth = 142;
    let fogHex = 0xc9dceb;
    let fogDensity = 0.0036;

    if (mode === 'golden') {
      elevation = 14.5;
      azimuth = 136;
      skyUniforms['turbidity'].value = 5.2;
      skyUniforms['rayleigh'].value = 2.1;
      skyUniforms['mieCoefficient'].value = 0.0055;
      skyUniforms['mieDirectionalG'].value = 0.82;
      fogHex = 0xd4d4d8;
      fogDensity = 0.0034;
      this.sunKeyLight.color.setHex(0xffdfa8);
      this.sunKeyLight.intensity = 2.35;
      this.hemiFillLight.color.setHex(0xb4d5f5);
      this.hemiFillLight.groundColor.setHex(0x1f364d);
      this.hemiFillLight.intensity = 0.92;
      this.renderer.toneMappingExposure = 1.04;
      if (this.bloomPass) this.bloomPass.strength = 0.24;
    } else if (mode === 'day') {
      elevation = 38;
      azimuth = 152;
      skyUniforms['turbidity'].value = 3.2;
      skyUniforms['rayleigh'].value = 1.35;
      skyUniforms['mieCoefficient'].value = 0.004;
      skyUniforms['mieDirectionalG'].value = 0.78;
      fogHex = 0xc5dff2;
      fogDensity = 0.0032;
      this.sunKeyLight.color.setHex(0xfff6e5);
      this.sunKeyLight.intensity = 2.45;
      this.hemiFillLight.color.setHex(0xd4ecff);
      this.hemiFillLight.groundColor.setHex(0x1c3d5a);
      this.hemiFillLight.intensity = 1.0;
      this.renderer.toneMappingExposure = 1.02;
      if (this.bloomPass) this.bloomPass.strength = 0.16;
    } else {
      // Dramatic Night Smart Shipyard with glowing floodlights, welding arcs & illuminated hall windows
      elevation = 1.2;
      azimuth = 128;
      skyUniforms['turbidity'].value = 10.0;
      skyUniforms['rayleigh'].value = 3.6;
      skyUniforms['mieCoefficient'].value = 0.01;
      skyUniforms['mieDirectionalG'].value = 0.88;
      fogHex = 0x0b1628;
      fogDensity = 0.0048;
      this.sunKeyLight.color.setHex(0x7aa2d8);
      this.sunKeyLight.intensity = 0.82;
      this.hemiFillLight.color.setHex(0x28456c);
      this.hemiFillLight.groundColor.setHex(0x091322);
      this.hemiFillLight.intensity = 0.85;
      this.renderer.toneMappingExposure = 1.15;
      if (this.bloomPass) this.bloomPass.strength = 0.42;
    }

    const phi = THREE.MathUtils.degToRad(90 - elevation);
    const theta = THREE.MathUtils.degToRad(azimuth);
    _sunVec.setFromSphericalCoords(1, phi, theta);
    skyUniforms['sunPosition'].value.copy(_sunVec);
    this.sunKeyLight.position.copy(_sunVec).multiplyScalar(95);

    this.scene.fog = new THREE.FogExp2(fogHex, fogDensity);
    this.ocean.setAtmosphere({
      sunDir: _sunVec,
      sunColor: mode === 'night' ? 0x93c5fd : mode === 'golden' ? 0xffe4b5 : 0xfff8e8,
      deepColor: mode === 'night' ? 0x051a33 : 0x0c4a6e,
      shallowColor: mode === 'night' ? 0x0d3654 : 0x117a96,
      horizonColor: mode === 'night' ? 0x162d4d : mode === 'golden' ? 0xb5cfe3 : 0xa5d2f2,
      fogColor: fogHex,
      fogDensity,
    });

    // Generate clean Sky-derived PMREM (Zero studio-box glare!)
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const skyEnvScene = new THREE.Scene();
    const envSky = new Sky();
    envSky.scale.setScalar(100);
    Object.keys(skyUniforms).forEach((k) => {
      if (envSky.material.uniforms[k]) {
        envSky.material.uniforms[k].value = skyUniforms[k].value;
      }
    });
    skyEnvScene.add(envSky);
    if (this.envRT) this.envRT.dispose();
    this.envRT = pmrem.fromScene(skyEnvScene, 0.04);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = mode === 'night' ? 0.35 : 0.62;
    pmrem.dispose();
  }

  private buildFleetShips(): void {
    FLEET_SHIPS.forEach((ship) => {
      const roleForShip = ship.id === this.activeShipId ? this.actorRole : ship.defaultActorRole;
      const rig = buildCompositeShipMesh(ship, roleForShip, this.textures.contactShadow, this.textures.containerRib);
      rig.group.position.set(ship.homePos.x, 0, ship.homePos.z);
      rig.group.rotation.y = ship.heading;
      this.scene.add(rig.group);
      this.shipRigs.set(ship.id, rig);
      this.shipPositions.set(ship.id, {
        x: ship.homePos.x,
        z: ship.homePos.z,
        heading: ship.heading,
        speed: 0,
        vx: 0,
        vz: 0,
      });
    });
  }

  private buildHumanoidAvatar(): void {
    if (this.humanoidRig) {
      this.scene.remove(this.humanoidRig.group);
      this.humanoidRig.dispose();
    }
    const rig = buildHumanoidEngineerAvatar(this.actorRole, this.textures.contactShadow);
    rig.group.position.set(this.humanoidPos.x, this.humanoidPos.y, this.humanoidPos.z);
    rig.group.rotation.y = this.humanoidPos.heading;
    this.scene.add(rig.group);
    this.humanoidRig = rig;
  }

  /**
   * Spawns live connected SGW/SGS employees & external partners as 3D Humanoid people
   * walking on the harbor promenade, East LNG pier, and working INSIDE all 6 engineering buildings!
   */
  private buildConnectedStaffNpcs(): void {
    this.staffNpcs.forEach((npc) => {
      this.scene.remove(npc.rig.group);
      npc.rig.dispose();
    });
    this.staffNpcs = CONNECTED_HARBOR_STAFF.map((cfg, idx) => {
      const rig = buildHumanoidEngineerAvatar(cfg.actorRole, this.textures.contactShadow);
      const y = sampleQuaySurfaceHeight(cfg.homePos.x, cfg.homePos.z);
      rig.group.position.set(cfg.homePos.x, y, cfg.homePos.z);
      rig.group.rotation.y = cfg.facing;
      this.scene.add(rig.group);
      return {
        cfg,
        rig,
        x: cfg.homePos.x,
        y,
        z: cfg.homePos.z,
        heading: cfg.facing,
        phase: idx * 1.17,
      };
    });
  }

  // --- Public API consumed by React UI ---

  public setAppMode(mode: AppModeState): void {
    this.appMode = mode;
    if (mode === 'playing') {
      this.cameraPreset = 'quarter';
      this.cameraOffset.set(11.5, 13.5, 16.5);
      this.keys.clear();
    }
  }

  public setTimeOfDay(mode: TimeOfDayMode): void {
    this.applyAtmosphere(mode);
  }

  public setAvatarMode(mode: AvatarMode): void {
    this.avatarMode = mode;
    this.autopilotTarget = null;
    this.walkPath = [];
    this.waypointMarker.visible = false;
    this.pendingModuleOnArrival = null;
    if (mode === 'humanoid') {
      this.cameraOffset.set(11.5, 13.5, 16.5);
    } else {
      this.cameraOffset.set(15, 16, 22);
    }
  }

  public setVrmExpression(expr: VrmExpression): void {
    this.vrmExpression = expr;
  }

  public setManualAction(action: RpgActionState | null): void {
    this.manualAction = action;
  }

  public async enableLiveMicLipSync(): Promise<{ mode: LipSyncMode; message: string }> {
    return this.lipSync.enableLiveMic();
  }

  public enableDemoVoiceLipSync(): void {
    this.lipSync.enableDemoVoice();
  }

  public stopLipSync(): void {
    this.lipSync.stop();
  }

  public async loadExternalVrmFile(file: File): Promise<string> {
    const nextRig = await loadExternalVrmOrGlbAvatar(file, this.textures.contactShadow);
    if (this.humanoidRig) {
      this.scene.remove(this.humanoidRig.group);
      this.humanoidRig.dispose();
    }
    nextRig.group.position.set(this.humanoidPos.x, this.humanoidPos.y, this.humanoidPos.z);
    nextRig.group.rotation.y = this.humanoidPos.heading;
    this.scene.add(nextRig.group);
    this.humanoidRig = nextRig;
    this.setAvatarMode('humanoid');
    return nextRig.vrmModelName;
  }

  public async loadPointCloudFile(file: File): Promise<{ pointCount: number; sourceLabel: string }> {
    const res = await this.pointCloud.loadFromFile(file);
    this.setCameraPreset('pointcloud');
    return res;
  }

  public setPointCloudColorMode(mode: PointCloudColorMode): void {
    this.pointCloud.setColorMode(mode);
  }

  public setTenantContext(tenantId: string, projectId: string): void {
    this.tenantId = tenantId;
    this.projectId = projectId;
  }

  public setActorRole(role: ActorRoleType): void {
    if (this.actorRole === role) return;
    this.actorRole = role;
    this.rebuildShipRig(this.activeShipId, role);
    if (!this.humanoidRig?.isExternalVrm) {
      this.buildHumanoidAvatar();
    }
  }

  public selectActiveShip(shipId: ShipId): void {
    if (this.activeShipId === shipId) return;
    const prevId = this.activeShipId;
    const prevCfg = FLEET_SHIPS.find((s) => s.id === prevId);
    this.activeShipId = shipId;
    this.autopilotTarget = null;
    this.pendingModuleOnArrival = null;

    if (prevCfg) this.rebuildShipRig(prevId, prevCfg.defaultActorRole);
    this.rebuildShipRig(shipId, this.actorRole);
  }

  public walkIntoBuilding(moduleId: ModuleId, autoOpenOnArrival = false): void {
    const b = WALK_IN_BUILDINGS.find((x) => x.moduleId === moduleId);
    if (!b) return;
    this.setAvatarMode('humanoid');
    this.walkPath = findQuayPath({ x: this.humanoidPos.x, z: this.humanoidPos.z }, b.interiorCenter);
    this.pendingModuleOnArrival = autoOpenOnArrival ? moduleId : null;
    if (this.walkPath.length > 0) {
      const dest = this.walkPath[this.walkPath.length - 1];
      this.waypointMarker.position.set(dest.x, sampleQuaySurfaceHeight(dest.x, dest.z) + 0.05, dest.z);
      this.waypointMarker.visible = true;
    }
  }

  public sailToModule(moduleId: ModuleId, autoOpenOnArrival = false): void {
    const mod = ENGINEERING_MODULES.find((m) => m.moduleId === moduleId);
    if (!mod) return;
    if (this.avatarMode === 'humanoid') {
      this.walkIntoBuilding(moduleId, autoOpenOnArrival);
      return;
    }
    this.autopilotTarget = { x: mod.berthPos.x, z: mod.berthPos.z };
    this.pendingModuleOnArrival = autoOpenOnArrival ? moduleId : null;
  }

  public setCameraPreset(preset: CameraPreset): void {
    this.cameraPreset = preset;
    if (preset === 'quarter') {
      this.cameraOffset.set(11.5, 13.5, 16.5);
    }
  }

  public setVirtualInput(forward: number, turn: number): void {
    this.virtualInput.forward = forward;
    this.virtualInput.turn = turn;
  }

  private rebuildShipRig(shipId: ShipId, role: ActorRoleType): void {
    const cfg = FLEET_SHIPS.find((s) => s.id === shipId);
    const oldRig = this.shipRigs.get(shipId);
    const state = this.shipPositions.get(shipId);
    if (!cfg || !oldRig || !state) return;

    this.scene.remove(oldRig.group);
    const newRig = buildCompositeShipMesh(cfg, role, this.textures.contactShadow, this.textures.containerRib);
    newRig.group.position.set(state.x, 0, state.z);
    newRig.group.rotation.y = state.heading;
    this.scene.add(newRig.group);
    this.shipRigs.set(shipId, newRig);
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
    this.virtualInput.forward = 0;
    this.virtualInput.turn = 0;
  };

  private handleVisibilityChange = (): void => {
    if (document.hidden) this.keys.clear();
  };

  private handlePointerDown = (e: PointerEvent): void => {
    this.pointerDownPos.x = e.clientX;
    this.pointerDownPos.y = e.clientY;
  };

  private handlePointerUp = (e: PointerEvent): void => {
    if (this.appMode !== 'playing') return;
    const dist = Math.hypot(e.clientX - this.pointerDownPos.x, e.clientY - this.pointerDownPos.y);
    if (dist > 6) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    _scratchMouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    _scratchMouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(_scratchMouse, this.camera);

    // 1. Check water berth beacons
    const hits = this.raycaster.intersectObjects(this.world.clickableProxies, false);
    if (hits.length > 0) {
      const modId = hits[0].object.userData.moduleId as ModuleId | undefined;
      if (modId) {
        if (this.avatarMode === 'humanoid') {
          this.walkIntoBuilding(modId, true);
        } else {
          const activeState = this.shipPositions.get(this.activeShipId);
          const mod = ENGINEERING_MODULES.find((m) => m.moduleId === modId);
          if (activeState && mod) {
            const d = Math.hypot(activeState.x - mod.berthPos.x, activeState.z - mod.berthPos.z);
            if (d <= 10.5) this.callbacks.onZoneClicked(modId);
            else this.sailToModule(modId, true);
          }
        }
        return;
      }
    }

    // 2. Click-to-Move: Humanoid walks on 2X Quay & straight inside buildings via A* NavMesh!
    if (this.avatarMode === 'humanoid') {
      if (this.raycaster.ray.intersectPlane(_quayPlane, _scratchHit)) {
        const path = findQuayPath(
          { x: this.humanoidPos.x, z: this.humanoidPos.z },
          { x: _scratchHit.x, z: _scratchHit.z },
        );
        if (path.length > 0) {
          this.walkPath = path;
          this.pendingModuleOnArrival = null;
          const dest = path[path.length - 1];
          this.waypointMarker.position.set(dest.x, sampleQuaySurfaceHeight(dest.x, dest.z) + 0.05, dest.z);
          this.waypointMarker.visible = true;
        }
      }
    } else if (this.raycaster.ray.intersectPlane(_waterPlane, _scratchHit)) {
      const clamped = resolveShipNavCollision({ x: _scratchHit.x, z: _scratchHit.z });
      this.autopilotTarget = clamped;
      this.pendingModuleOnArrival = null;
      this.waypointMarker.position.set(clamped.x, 0.14, clamped.z);
      this.waypointMarker.visible = true;
    }
  };

  private handleContextLost = (e: Event): void => {
    e.preventDefault();
  };

  private handleResize(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    if (w <= 0 || h <= 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.composer) this.composer.setSize(w, h);
    this.renderFrame();
  }

  private updateSimulation(dt: number): void {
    this.elapsedTotal += dt;
    this.ocean.update(this.elapsedTotal);
    this.pointCloud.update(dt, this.elapsedTotal);

    const playerState = this.shipPositions.get(this.activeShipId);
    let currentAction: RpgActionState = this.manualAction ?? 'idle';

    // 1. Player Movement (Camera-Relative 8-Way WASD + Walk-In NavMesh + A* Click-to-Move)
    if (this.appMode === 'playing' && this.avatarMode === 'humanoid') {
      let inputFwd = this.virtualInput.forward;
      let inputRight = -this.virtualInput.turn;
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) inputFwd += 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) inputFwd -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) inputRight += 1;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) inputRight -= 1;

      const inputMag = Math.hypot(inputFwd, inputRight);
      if (inputMag > 0.05) {
        this.manualAction = null;
        this.walkPath = [];
        this.pendingModuleOnArrival = null;
        this.waypointMarker.visible = false;

        // Camera-relative horizontal basis so W ALWAYS moves away from camera, A left, D right!
        this.camera.getWorldDirection(_scratchForward);
        _scratchForward.y = 0;
        if (_scratchForward.lengthSq() < 0.0001) _scratchForward.set(0, 0, -1);
        _scratchForward.normalize();
        _scratchRight.crossVectors(_scratchForward, _scratchCamUp).normalize();

        const moveX = (_scratchForward.x * inputFwd + _scratchRight.x * inputRight) / Math.max(1, inputMag);
        const moveZ = (_scratchForward.z * inputFwd + _scratchRight.z * inputRight) / Math.max(1, inputMag);

        const moveSpeed = 9.2;
        this.humanoidPos.speed = THREE.MathUtils.damp(this.humanoidPos.speed, moveSpeed, 10, dt);

        const next = resolveQuayMovement(
          { x: this.humanoidPos.x, z: this.humanoidPos.z },
          {
            x: this.humanoidPos.x + moveX * this.humanoidPos.speed * dt,
            z: this.humanoidPos.z + moveZ * this.humanoidPos.speed * dt,
          },
        );
        this.humanoidPos.x = next.x;
        this.humanoidPos.z = next.z;
        this.humanoidPos.y = THREE.MathUtils.damp(
          this.humanoidPos.y,
          sampleQuaySurfaceHeight(next.x, next.z),
          14,
          dt,
        );

        // Smooth shortest-arc yaw facing movement direction (avatar faces +Z locally)
        const targetYaw = Math.atan2(moveX, moveZ);
        let diff = targetYaw - this.humanoidPos.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.humanoidPos.heading += diff * (1 - Math.exp(-12 * dt));
        currentAction = 'run';
      } else if (this.walkPath.length > 0) {
        const wp = this.walkPath[0];
        const dx = wp.x - this.humanoidPos.x;
        const dz = wp.z - this.humanoidPos.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.48) {
          this.walkPath.shift();
          if (this.walkPath.length === 0) {
            this.waypointMarker.visible = false;
            this.humanoidPos.speed = 0;
            const arriveMod = this.pendingModuleOnArrival;
            this.pendingModuleOnArrival = null;
            if (arriveMod) this.callbacks.onZoneClicked(arriveMod);
          }
        } else {
          const stepSpeed = 9.4;
          this.humanoidPos.speed = THREE.MathUtils.damp(this.humanoidPos.speed, stepSpeed, 10, dt);
          const nx = dx / dist;
          const nz = dz / dist;
          const next = resolveQuayMovement(
            { x: this.humanoidPos.x, z: this.humanoidPos.z },
            {
              x: this.humanoidPos.x + nx * this.humanoidPos.speed * dt,
              z: this.humanoidPos.z + nz * this.humanoidPos.speed * dt,
            },
          );
          this.humanoidPos.x = next.x;
          this.humanoidPos.z = next.z;
          this.humanoidPos.y = THREE.MathUtils.damp(
            this.humanoidPos.y,
            sampleQuaySurfaceHeight(next.x, next.z),
            14,
            dt,
          );
          const targetYaw = Math.atan2(nx, nz);
          let diff = targetYaw - this.humanoidPos.heading;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          this.humanoidPos.heading += diff * (1 - Math.exp(-12 * dt));
          currentAction = 'run';
        }
      } else {
        this.humanoidPos.speed = THREE.MathUtils.damp(this.humanoidPos.speed, 0, 12, dt);
        currentAction = this.manualAction ?? 'idle';
      }
    } else if (playerState && this.appMode === 'playing') {
      let forwardInput = this.virtualInput.forward;
      let turnInput = this.virtualInput.turn;
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) forwardInput += 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) forwardInput -= 0.7;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) turnInput += 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) turnInput -= 1;

      if (Math.abs(forwardInput) > 0.05 || Math.abs(turnInput) > 0.05) {
        this.autopilotTarget = null;
        this.pendingModuleOnArrival = null;
        this.waypointMarker.visible = false;
        const targetSpeed = THREE.MathUtils.clamp(forwardInput, -0.7, 1) * 10.5;
        playerState.speed = THREE.MathUtils.damp(playerState.speed, targetSpeed, 4.5, dt);
        playerState.heading += turnInput * 2.15 * dt;
        currentAction = 'run';
      } else if (this.autopilotTarget) {
        const dx = this.autopilotTarget.x - playerState.x;
        const dz = this.autopilotTarget.z - playerState.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 1.5) {
          playerState.speed = THREE.MathUtils.damp(playerState.speed, 0, 6.0, dt);
          const arriveModule = this.pendingModuleOnArrival;
          this.autopilotTarget = null;
          this.pendingModuleOnArrival = null;
          this.waypointMarker.visible = false;
          if (arriveModule) this.callbacks.onZoneClicked(arriveModule);
        } else {
          const desiredHeading = Math.atan2(-dx, -dz);
          let diff = desiredHeading - playerState.heading;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          playerState.heading += THREE.MathUtils.clamp(diff, -2.6 * dt, 2.6 * dt);
          playerState.speed = THREE.MathUtils.damp(playerState.speed, Math.min(9.5, dist * 1.4), 4.2, dt);
          currentAction = 'run';
        }
      } else {
        playerState.speed = THREE.MathUtils.damp(playerState.speed, 0, 3.8, dt);
      }

      playerState.vx = -Math.sin(playerState.heading) * playerState.speed;
      playerState.vz = -Math.cos(playerState.heading) * playerState.speed;

      const otherVesselPos: Vec2[] = [];
      this.shipPositions.forEach((st, id) => {
        if (id !== this.activeShipId) otherVesselPos.push({ x: st.x, z: st.z });
      });
      const nextClamped = resolveShipNavCollision(
        { x: playerState.x + playerState.vx * dt, z: playerState.z + playerState.vz * dt },
        otherVesselPos,
      );
      playerState.x = nextClamped.x;
      playerState.z = nextClamped.z;
    }

    // 2. Detect if Humanoid is inside any of the 6 Walk-In Buildings (triggers Automatic RPG Roof Cutaway!)
    this.insideBuildingId =
      this.avatarMode === 'humanoid'
        ? getBuildingContainingPoint(this.humanoidPos.x, this.humanoidPos.z)
        : null;

    // 3. Update Shipyard World (Roof Cutaway, Lighthouse, FARO scanners, Welding Sparks, Buoys, Clouds)
    this.world.update(dt, this.elapsedTotal, this.timeOfDay === 'night', this.insideBuildingId);

    // Pulse waypoint marker if visible
    if (this.waypointMarker.visible) {
      const s = 1 + Math.sin(this.elapsedTotal * 6.5) * 0.16;
      this.waypointMarker.scale.set(s, s, 1);
    }

    // 4. Sample Real Web Audio FFT 5-Vowel Lip-Sync & Update Player Humanoid VRM Rig
    const inSilent = this.insideBuildingId === 'pdfview';
    this.lipSync.setSilentZoneMuted(inSilent);
    const forceTalkPreview = this.vrmExpression === 'talk' || currentAction === 'talk';
    this.lastVisemes = this.lipSync.sample(dt, this.elapsedTotal, forceTalkPreview);

    if (this.humanoidRig) {
      this.humanoidRig.group.position.set(this.humanoidPos.x, this.humanoidPos.y, this.humanoidPos.z);
      this.humanoidRig.group.rotation.y = this.humanoidPos.heading;
      this.humanoidRig.updateAnimation(
        dt,
        this.elapsedTotal,
        this.avatarMode === 'humanoid' ? currentAction : this.manualAction ?? 'idle',
        this.vrmExpression,
        this.lastVisemes,
      );
    }

    // 5. Animate all 8 Connected SGW/SGS Humanoid Colleagues (promenade patrol + inside 6 buildings!)
    for (let i = 0; i < this.staffNpcs.length; i++) {
      const npc = this.staffNpcs[i];
      if (npc.cfg.patrolTarget) {
        const cycle = (Math.sin(this.elapsedTotal * 0.24 + npc.phase) + 1) * 0.5;
        const nextX = THREE.MathUtils.lerp(npc.cfg.homePos.x, npc.cfg.patrolTarget.x, cycle);
        const nextZ = THREE.MathUtils.lerp(npc.cfg.homePos.z, npc.cfg.patrolTarget.z, cycle);
        const dx = nextX - npc.x;
        const dz = nextZ - npc.z;
        if (Math.hypot(dx, dz) > 0.0005) {
          npc.heading = Math.atan2(dx, dz);
        }
        npc.x = nextX;
        npc.z = nextZ;
        npc.y = sampleQuaySurfaceHeight(npc.x, npc.z);
      }
      npc.rig.group.position.set(npc.x, npc.y, npc.z);
      npc.rig.group.rotation.y = npc.heading;
      npc.rig.updateAnimation(
        dt,
        this.elapsedTotal + npc.phase,
        npc.cfg.patrolTarget ? 'run' : npc.cfg.action,
        npc.cfg.action === 'talk' ? 'talk' : 'neutral',
      );
    }

    // 6. Autonomous Patrol Boat (살피미) + Buoyancy Animation for all 8 Canonical Ships
    if (this.activeShipId !== 'patrol_guard') {
      const patrolState = this.shipPositions.get('patrol_guard');
      if (patrolState) {
        const t = this.elapsedTotal * 0.2;
        const targetX = Math.cos(t) * 34;
        const targetZ = 24 + Math.sin(t * 2) * 7.5;
        const dx = targetX - patrolState.x;
        const dz = targetZ - patrolState.z;
        patrolState.vx = dx / Math.max(dt, 0.016);
        patrolState.vz = dz / Math.max(dt, 0.016);
        patrolState.x = targetX;
        patrolState.z = targetZ;
        patrolState.heading = Math.atan2(-dx, -dz);
        patrolState.speed = 4.2;
      }
    }

    FLEET_SHIPS.forEach((ship, index) => {
      const rig = this.shipRigs.get(ship.id);
      const st = this.shipPositions.get(ship.id);
      if (!rig || !st) return;

      const bobY = Math.sin(this.elapsedTotal * 1.9 + index * 0.9) * 0.08;
      const pitch = Math.cos(this.elapsedTotal * 1.4 + index) * 0.025;
      const roll = Math.sin(this.elapsedTotal * 1.6 + index * 1.3) * 0.03;

      rig.group.position.set(st.x, bobY, st.z);
      rig.group.rotation.set(pitch, st.heading, roll);

      if (rig.radarPart) rig.radarPart.rotation.y += dt * (ship.id === 'faro_survey' ? 2.6 : 0.9);
      const wakeScale = 1 + Math.min(Math.abs(st.speed) * 0.04, 0.35);
      rig.wakeMesh.scale.set(wakeScale, wakeScale, 1);

      if (ship.id === this.activeShipId) {
        if (this.avatarMode === 'humanoid') {
          this.playerHalo.position.set(this.humanoidPos.x, this.humanoidPos.y + 0.04, this.humanoidPos.z);
          this.playerHalo.scale.setScalar(1.0);
        } else {
          this.playerHalo.position.set(st.x, 0.08, st.z);
          this.playerHalo.scale.setScalar(2.1);
        }
      }
    });

    // 7. Offset-Tracking Quarter-View / Shoulder / Overview / PointCloud Camera Choreography
    const focusX = this.avatarMode === 'humanoid' ? this.humanoidPos.x : (playerState?.x ?? 0);
    const focusY = this.avatarMode === 'humanoid' ? this.humanoidPos.y + 1.35 : 1.5;
    const focusZ = this.avatarMode === 'humanoid' ? this.humanoidPos.z : (playerState?.z ?? 0);
    const activeHeading = this.avatarMode === 'humanoid' ? this.humanoidPos.heading : (playerState?.heading ?? 0);

    if (this.appMode === 'title') {
      // Sweeping grand vista showcasing BOTH the Walk-In Halls + Twin Goliath Cranes AND the 52m 174K LNG Carrier
      const orbitAngle = this.elapsedTotal * 0.1;
      _scratchCamPos.set(
        -10 + Math.sin(orbitAngle) * 32,
        25 + Math.sin(orbitAngle * 0.7) * 3.0,
        52 + Math.cos(orbitAngle) * 14,
      );
      _scratchTarget.set(14, 3.2, -5);
      const k = 1 - Math.exp(-2.2 * dt);
      this.camera.position.lerp(_scratchCamPos, k);
      this.controls.target.lerp(_scratchTarget, k);
      this.camera.lookAt(this.controls.target);
    } else if (!this.isPointerOrbiting) {
      const k = 1 - Math.exp(-6.2 * dt);
      if (this.cameraPreset === 'quarter') {
        // Auto-zoom gently when inside a walk-in building so the furnished room is crystal clear!
        const indoorScale = this.insideBuildingId ? 0.72 : 1.0;
        _scratchTarget.set(focusX, focusY, focusZ);
        _scratchCamPos.set(
          focusX + this.cameraOffset.x * indoorScale,
          Math.max(4.5, focusY + this.cameraOffset.y * indoorScale),
          focusZ + this.cameraOffset.z * indoorScale,
        );
      } else if (this.cameraPreset === 'shoulder') {
        const backDist = this.avatarMode === 'humanoid' ? 7.5 : 11.5;
        const dirSign = this.avatarMode === 'humanoid' ? -1 : 1;
        const backX = Math.sin(activeHeading) * backDist * dirSign;
        const backZ = Math.cos(activeHeading) * backDist * dirSign;
        _scratchTarget.set(focusX - backX * 0.45, focusY + 0.6, focusZ - backZ * 0.45);
        _scratchCamPos.set(focusX + backX, focusY + 3.4, focusZ + backZ);
      } else if (this.cameraPreset === 'pointcloud') {
        const pcAngle = this.elapsedTotal * 0.25;
        _scratchTarget.set(0, 10.2, -25.5);
        _scratchCamPos.set(Math.sin(pcAngle) * 11.5, 13.0, -25.5 + Math.cos(pcAngle) * 11.5);
      } else {
        // Grand Overview of the entire 2X Shipyard Harbor!
        _scratchTarget.set(4, 1.5, -4);
        _scratchCamPos.set(4, 72, 74);
      }

      this.camera.position.lerp(_scratchCamPos, k);
      this.controls.target.lerp(_scratchTarget, k);
      this.controls.update();
    } else {
      this.controls.update();
    }

    // Sync Web Audio API 3D Spatial AudioListener with Three.js camera
    this.camera.getWorldDirection(_scratchCamForward);
    this.lipSync.syncSpatialListener(this.camera.position, _scratchCamForward, _scratchCamUp);

    // 8. Throttled Telemetry + Projected 2D Labels (~6 Hz)
    const now = performance.now();
    if (now - this.lastTelemetryTime >= 160 && playerState) {
      this.lastTelemetryTime = now;

      const otherAgents: SpatialAgent[] = [];
      // Register all 8 live Humanoid Colleagues as spatial agents!
      this.staffNpcs.forEach((npc) => {
        const agent: SpatialAgent = {
          id: npc.cfg.id,
          shipId: 'tug_captain',
          name: npc.cfg.name,
          actorRole: npc.cfg.actorRole,
          position: { x: npc.x, z: npc.z },
          velocity: { x: 0, z: 0 },
        };
        this.dht.upsertAgent(agent);
        otherAgents.push(agent);
      });

      FLEET_SHIPS.forEach((ship) => {
        const st = this.shipPositions.get(ship.id);
        if (!st) return;
        const agent: SpatialAgent = {
          id: ship.id,
          shipId: ship.id,
          name: ship.name,
          actorRole: ship.id === this.activeShipId ? this.actorRole : ship.defaultActorRole,
          position: { x: st.x, z: st.z },
          velocity: { x: st.vx, z: st.vz },
        };
        this.dht.upsertAgent(agent);
        if (this.avatarMode === 'ship' && ship.id !== this.activeShipId) {
          otherAgents.push(agent);
        }
      });

      const proximity = evaluateProximityState({
        playerPos: { x: focusX, z: focusZ },
        otherAgents,
        tenantId: this.tenantId,
        projectId: this.projectId,
        bubbleRadius: 13.5,
        zoneRadius: 8.6,
      });

      // Keep Silent Zone mute synced even when sailing near PDF VIEW berth
      if (proximity.audioMutedBySilentZone) {
        this.lipSync.setSilentZoneMuted(true);
      }

      let spatialPan = 0;
      if (proximity.peers.length > 0) {
        const firstPeer = otherAgents.find((a) => a.id === proximity.peers[0].id);
        if (firstPeer) {
          spatialPan = Math.round(THREE.MathUtils.clamp((firstPeer.position.x - focusX) / 14, -1, 1) * 100) / 100;
        }
      }

      const interest = this.dht.getInterest(this.activeShipId, 28);
      const predicted = this.dht.predictNextInterestZone(this.activeShipId, {
        x: playerState.vx,
        z: playerState.vz,
      });

      const insideMod = this.insideBuildingId
        ? ENGINEERING_MODULES.find((m) => m.moduleId === this.insideBuildingId) ?? null
        : null;

      this.callbacks.onTelemetry({
        playerPos: { x: Math.round(focusX * 10) / 10, z: Math.round(focusZ * 10) / 10 },
        playerY: Math.round(this.humanoidPos.y * 10) / 10,
        speedKnots: Math.round(
          Math.abs(this.avatarMode === 'humanoid' ? this.humanoidPos.speed : playerState.speed) * 2.2,
        ),
        headingDeg: Math.round((((-activeHeading * 180) / Math.PI) % 360 + 360) % 360),
        actionState: currentAction,
        avatarMode: this.avatarMode,
        insideBuildingId: this.insideBuildingId,
        insideBuildingName: insideMod?.displayName ?? null,
        lipSyncMode: this.lipSync.getMode(),
        lipSyncVolume: Math.round(this.lastVisemes.volume * 100),
        vrmModelName: this.humanoidRig?.vrmModelName ?? 'SGW 내장 VRM 엔지니어',
        pointCloudLabel: this.pointCloud.sourceLabel,
        spatialPan,
        proximity,
        dhtInterestCount: interest.length,
        predictedZoneName: predicted.nearestModule?.shortName ?? null,
        fpsEstimate: dt > 0 ? Math.min(60, Math.round(1 / dt)) : 60,
      });

      this.emitProjectedLabels();
    }
  }

  private emitProjectedLabels(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    const labels: ProjectedLabel[] = [];

    const pushProjected = (
      id: string,
      text: string,
      kind: ProjectedLabel['kind'],
      wx: number,
      wy: number,
      wz: number,
      isPlayer = false,
    ) => {
      _scratchProj.set(wx, wy, wz).project(this.camera);
      const onScreen = _scratchProj.z >= -1 && _scratchProj.z <= 1;
      const sx = (_scratchProj.x * 0.5 + 0.5) * w;
      const sy = (-_scratchProj.y * 0.5 + 0.5) * h;
      const inBounds = onScreen && sx > 64 && sx < w - 64 && sy > 76 && sy < h - 88;
      labels.push({ id, text, kind, x: sx, y: sy, visible: inBounds, isPlayer });
    };

    // 1. Player Humanoid Nameplate
    const playerPrefix = this.actorRole === 'employee' ? '■ [본사]' : '◆ [협력]';
    pushProjected(
      'player-humanoid',
      `${playerPrefix} 나 (SGS 접속)`,
      this.actorRole === 'employee' ? 'ship-employee' : 'ship-partner',
      this.humanoidPos.x,
      this.humanoidPos.y + 3.0,
      this.humanoidPos.z,
      true,
    );

    // 2. Live 3D Humanoid Connected Colleagues (clean proximity culling: show outdoor staff within 32m, indoor staff when within 20m or inside same building!)
    const focusX = this.avatarMode === 'humanoid' ? this.humanoidPos.x : (this.shipPositions.get(this.activeShipId)?.x ?? 0);
    const focusZ = this.avatarMode === 'humanoid' ? this.humanoidPos.z : (this.shipPositions.get(this.activeShipId)?.z ?? 0);

    for (const npc of this.staffNpcs) {
      const distToPlayer = Math.hypot(npc.x - focusX, npc.z - focusZ);
      const npcBuilding = getBuildingContainingPoint(npc.x, npc.z);
      const visibleNpc = npcBuilding
        ? this.insideBuildingId === npcBuilding || distToPlayer <= 18
        : distToPlayer <= 34;
      if (!visibleNpc) continue;
      const pfx = npc.cfg.actorRole === 'employee' ? '■ [본사]' : '◆ [협력]';
      pushProjected(
        `npc-${npc.cfg.id}`,
        `${pfx} ${npc.cfg.name}`,
        npc.cfg.actorRole === 'employee' ? 'ship-employee' : 'ship-partner',
        npc.x,
        npc.y + 2.95,
        npc.z,
      );
    }

    // 3. 8 Canonical Ships Nameplates (shown cleanly in Ship mode or when nearby)
    FLEET_SHIPS.forEach((ship) => {
      const st = this.shipPositions.get(ship.id);
      if (!st) return;
      const isPlayerShip = this.avatarMode === 'ship' && ship.id === this.activeShipId;
      const distToPlayer = Math.hypot(st.x - focusX, st.z - focusZ);
      if (!isPlayerShip && distToPlayer > 36) return;
      const role = ship.id === this.activeShipId ? this.actorRole : ship.defaultActorRole;
      const prefix = role === 'employee' ? '■ [본사]' : '◆ [협력]';
      pushProjected(
        `ship-${ship.id}`,
        `${prefix} ${ship.name}`,
        role === 'employee' ? 'ship-employee' : 'ship-partner',
        st.x,
        3.2,
        st.z,
        isPlayerShip,
      );
    });

    // Note: The 6 Walk-In Engineering Halls display crisp illuminated 3D architectural Korean+English signboards directly on their fascias (zero overlapping floating DOM zone tags!).

    this.callbacks.onLabelsUpdated(labels);
  }

  private renderFrame(): void {
    if (this.composer && !this.isSoftwareGl) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext();
    if (!this.isSoftwareGl || !(gl instanceof WebGL2RenderingContext)) {
      this.frameId = requestAnimationFrame(cb);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    if (!sync) {
      this.frameId = requestAnimationFrame(cb);
      return;
    }
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        gl.deleteSync(sync);
        return;
      }
      const status = gl.clientWaitSync(sync, 0, 0);
      if (status === gl.TIMEOUT_EXPIRED) {
        setTimeout(poll, 4);
        return;
      }
      gl.deleteSync(sync);
      this.frameId = requestAnimationFrame(cb);
    };
    setTimeout(poll, 0);
  }

  private tick = (): void => {
    if (this.disposed) return;
    const now = performance.now();
    const dt = Math.min((now - this.lastFrameMs) / 1000, 0.05);
    this.lastFrameMs = now;

    this.updateSimulation(dt);
    this.renderFrame();
    this.afterDraw(this.tick);
  };

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    this.resizeObserver.disconnect();
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleWindowBlur);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.removeEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);

    this.controls.dispose();
    this.lipSync.dispose();
    this.ocean.dispose();
    this.pointCloud.dispose();
    if (this.humanoidRig) this.humanoidRig.dispose();
    this.staffNpcs.forEach((n) => n.rig.dispose());
    if (this.envRT) this.envRT.dispose();
    if (this.composer) this.composer.dispose();
    this.textures.dispose();
    this.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh;
        m.geometry?.dispose();
        if (Array.isArray(m.material)) m.material.forEach((mm) => mm.dispose());
        else m.material?.dispose();
      }
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
