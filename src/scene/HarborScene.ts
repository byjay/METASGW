import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import {
  findQuayPath,
  PORTAL_BUILDINGS,
  resolveQuayMovement,
  sampleQuaySurfaceHeight,
  type PortalBuildingSpec,
  type Vec2,
} from '../core/navMeshEngine';
import type { HarborPerson, HarborShip } from '../mapping';
import { buildHarborAvatar, type BuiltHumanoidRig } from './humanoidAvatar';
import { createMaritimeOcean, type OceanWaterSystem } from './oceanShader';
import { buildShipyardWorld, type ShipyardWorldHandles } from './shipyardWorld';
import { createHarborTextures, type HarborTexturePack } from './textures';

export type CameraPreset = 'harbor' | 'overview' | 'quay';

export interface ProjectedLabel {
  id: string;
  text: string;
  subText?: string;
  kind: 'ship' | 'person-online' | 'person-offline' | 'person-partner' | 'portal';
  accentHex?: string;
  x: number;
  y: number;
  visible: boolean;
}

export interface RenderMetrics {
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  fps: number;
  lowSpec: boolean;
}

export interface ScreenAnchorPoint {
  x: number;
  y: number;
}

export interface HarborSceneCallbacks {
  onShipClicked: (projectId: string, screenPos: ScreenAnchorPoint) => void;
  onPersonClicked: (sub: string, screenPos: ScreenAnchorPoint) => void;
  onPortalClicked: (portalId: PortalBuildingSpec['id']) => void;
  onLabelsUpdated: (labels: ProjectedLabel[]) => void;
  onPlayerPoseUpdated?: (pose: { x: number; z: number; heading: number }) => void;
  onRenderMetricsUpdated?: (metrics: RenderMetrics) => void;
}

interface PersonNpcRuntime {
  person: HarborPerson;
  rig: BuiltHumanoidRig;
  hitProxy: THREE.Mesh;
  presenceRing: THREE.Mesh;
  phase: number;
}

const _scratchProj = new THREE.Vector3();
const _scratchMouse = new THREE.Vector2();
const _scratchHit = new THREE.Vector3();
const _quayPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.61);
const _sunVec = new THREE.Vector3();
const _scratchForward = new THREE.Vector3();
const _scratchRight = new THREE.Vector3();
const _scratchCamUp = new THREE.Vector3(0, 1, 0);

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

export class HarborSceneController {
  private container: HTMLElement;
  private callbacks: HarborSceneCallbacks;
  private isSoftwareGl: boolean;
  private lowSpecMode: boolean;
  private reducedMotion = false;
  private darkTheme = false;
  private cameraPreset: CameraPreset = 'harbor';

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private sky: Sky;
  private textures: HarborTexturePack;
  private envRT: THREE.WebGLRenderTarget | null = null;
  private sunKeyLight!: THREE.DirectionalLight;
  private hemiFillLight!: THREE.HemisphereLight;
  private ambientLight!: THREE.AmbientLight;

  private ocean: OceanWaterSystem;
  private world: ShipyardWorldHandles;

  private playerRig: BuiltHumanoidRig;
  private playerPos = { x: 0, y: 1.61, z: -10.5, heading: 0, speed: 0 };
  private walkPath: Vec2[] = [];
  private waypointMarker: THREE.Mesh;
  private playerHalo: THREE.Mesh;

  private personRuntimes: PersonNpcRuntime[] = [];
  private personHitProxies: THREE.Object3D[] = [];
  private peopleRoot = new THREE.Group();

  private keys = new Set<string>();
  private raycaster = new THREE.Raycaster();
  private pointerDownPos = { x: 0, y: 0 };
  private cameraZoomScale = 1.0;
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
  private lastFrameMs = performance.now();
  private elapsedTotal = 0;
  private lastLabelEmitMs = 0;
  private lastMetricsEmitMs = 0;
  private frameCountWindow = 0;
  private measuredFps = 60;
  private disposed = false;

  constructor(
    container: HTMLElement,
    callbacks: HarborSceneCallbacks,
    initialOptions?: { lowSpec?: boolean; reducedMotion?: boolean; darkTheme?: boolean },
  ) {
    this.container = container;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareWebGL();
    this.lowSpecMode = initialOptions?.lowSpec ?? false;
    this.reducedMotion = initialOptions?.reducedMotion ?? false;
    this.darkTheme = initialOptions?.darkTheme ?? false;

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl && !this.lowSpecMode,
      powerPreference: this.lowSpecMode ? 'low-power' : 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.renderer.setPixelRatio(
      this.isSoftwareGl || this.lowSpecMode ? 1 : Math.min(window.devicePixelRatio, 1.5),
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl && !this.lowSpecMode;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.sky = new Sky();
    this.sky.scale.setScalar(1000);
    this.scene.add(this.sky);

    this.camera = new THREE.PerspectiveCamera(46, w / h, 0.4, 700);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = !this.isSoftwareGl && !this.lowSpecMode && !this.reducedMotion;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = true;
    this.controls.maxPolarAngle = Math.PI * 0.46;
    this.controls.minPolarAngle = 0.18;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 170;

    this.textures = createHarborTextures(this.renderer.capabilities.getMaxAnisotropy());
    this.setupLighting();

    this.ocean = createMaritimeOcean(this.lowSpecMode || this.reducedMotion);
    this.scene.add(this.ocean.mesh);

    this.world = buildShipyardWorld(this.scene, this.textures);
    this.world.setLowSpecMode(this.lowSpecMode || this.reducedMotion);

    this.scene.add(this.peopleRoot);

    this.playerRig = buildHarborAvatar({
      isPartner: false,
      shirtHex: '#0284c7',
      contactShadowTex: this.textures.contactShadow,
      isCurrentUser: true,
    });
    this.playerRig.group.position.set(this.playerPos.x, this.playerPos.y, this.playerPos.z);
    this.scene.add(this.playerRig.group);

    const haloGeo = new THREE.RingGeometry(0.95, 1.28, 28);
    haloGeo.rotateX(-Math.PI / 2);
    this.playerHalo = new THREE.Mesh(
      haloGeo,
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
      }),
    );
    this.playerHalo.position.set(this.playerPos.x, this.playerPos.y + 0.06, this.playerPos.z);
    this.scene.add(this.playerHalo);

    const wpGeo = new THREE.RingGeometry(0.5, 0.8, 24);
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

    this.applyAtmosphere(this.darkTheme);
    this.snapCameraToPreset(this.cameraPreset);

    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleWindowBlur);
    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.addEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);

    this.renderFrame();
    this.lastFrameMs = performance.now();
    this.tick();
  }

  private setupLighting(): void {
    this.sunKeyLight = new THREE.DirectionalLight(0xfffaf0, 2.0);
    this.sunKeyLight.position.set(55, 85, 68);
    if (!this.isSoftwareGl && !this.lowSpecMode) {
      this.sunKeyLight.castShadow = true;
      this.sunKeyLight.shadow.mapSize.set(1024, 1024);
      const d = 110;
      this.sunKeyLight.shadow.camera.left = -d;
      this.sunKeyLight.shadow.camera.right = d;
      this.sunKeyLight.shadow.camera.top = d;
      this.sunKeyLight.shadow.camera.bottom = -d;
      this.sunKeyLight.shadow.camera.near = 10;
      this.sunKeyLight.shadow.camera.far = 260;
      this.sunKeyLight.shadow.bias = -0.0005;
    }
    this.scene.add(this.sunKeyLight);

    this.hemiFillLight = new THREE.HemisphereLight(0xeef7ff, 0x64748b, 1.35);
    this.scene.add(this.hemiFillLight);

    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.58);
    this.scene.add(this.ambientLight);
  }

  private applyAtmosphere(dark: boolean): void {
    this.darkTheme = dark;
    const skyUniforms = this.sky.material.uniforms;
    const elevation = dark ? 6 : 44;
    const azimuth = dark ? 38 : 32;
    const fogHex = dark ? 0x0f1d35 : 0xcde2f5;
    const fogDensity = dark ? 0.0026 : 0.0014;

    if (dark) {
      skyUniforms['turbidity'].value = 8.5;
      skyUniforms['rayleigh'].value = 3.0;
      skyUniforms['mieCoefficient'].value = 0.007;
      skyUniforms['mieDirectionalG'].value = 0.82;
      this.sunKeyLight.color.setHex(0x93c5fd);
      this.sunKeyLight.intensity = 1.1;
      this.hemiFillLight.color.setHex(0x3b5b87);
      this.hemiFillLight.groundColor.setHex(0x16243a);
      this.hemiFillLight.intensity = 1.0;
      this.ambientLight.intensity = 0.4;
    } else {
      skyUniforms['turbidity'].value = 2.4;
      skyUniforms['rayleigh'].value = 1.15;
      skyUniforms['mieCoefficient'].value = 0.003;
      skyUniforms['mieDirectionalG'].value = 0.74;
      this.sunKeyLight.color.setHex(0xfffaf0);
      this.sunKeyLight.intensity = 2.05;
      this.hemiFillLight.color.setHex(0xf0f8ff);
      this.hemiFillLight.groundColor.setHex(0x64748b);
      this.hemiFillLight.intensity = 1.35;
      this.ambientLight.intensity = 0.6;
    }

    const phi = THREE.MathUtils.degToRad(90 - elevation);
    const theta = THREE.MathUtils.degToRad(azimuth);
    _sunVec.setFromSphericalCoords(1, phi, theta);
    skyUniforms['sunPosition'].value.copy(_sunVec);
    this.sunKeyLight.position.copy(_sunVec).multiplyScalar(110);

    this.scene.fog = new THREE.FogExp2(fogHex, fogDensity);
    this.ocean.setAtmosphere({
      sunDir: _sunVec,
      sunColor: dark ? 0x93c5fd : 0xfffaf0,
      deepColor: dark ? 0x082242 : 0x0e5e8c,
      shallowColor: dark ? 0x114266 : 0x1896b8,
      horizonColor: dark ? 0x1d3a61 : 0xb5dbf7,
      fogColor: fogHex,
      fogDensity,
    });

    if (!this.lowSpecMode) {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      const envScene = new THREE.Scene();
      const envSky = new Sky();
      envSky.scale.setScalar(100);
      Object.keys(skyUniforms).forEach((k) => {
        if (envSky.material.uniforms[k]) {
          envSky.material.uniforms[k].value = skyUniforms[k].value;
        }
      });
      envScene.add(envSky);
      if (this.envRT) this.envRT.dispose();
      this.envRT = pmrem.fromScene(envScene, 0.04);
      this.scene.environment = this.envRT.texture;
      this.scene.environmentIntensity = dark ? 0.35 : 0.55;
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
    return this.lowSpecMode || this.reducedMotion;
  }

  public setReducedMotion(enabled: boolean): void {
    this.reducedMotion = enabled;
    const suppress = this.shouldSuppressMotion();
    this.controls.enableDamping = !this.isSoftwareGl && !suppress;
    this.ocean.setLowSpec(suppress);
    this.world.setLowSpecMode(suppress);
    this.renderFrame();
  }

  public setLowSpecMode(enabled: boolean): void {
    this.lowSpecMode = enabled;
    const suppress = this.shouldSuppressMotion();
    this.renderer.setPixelRatio(
      this.isSoftwareGl || enabled ? 1 : Math.min(window.devicePixelRatio, 1.5),
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl && !enabled;
    this.sunKeyLight.castShadow = !this.isSoftwareGl && !enabled;
    this.controls.enableDamping = !this.isSoftwareGl && !suppress;
    this.ocean.setLowSpec(suppress);
    this.world.setLowSpecMode(suppress);
    this.applyAtmosphere(this.darkTheme);
    this.renderFrame();
  }

  public getRenderMetrics(): RenderMetrics {
    return {
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
      fps: this.measuredFps,
      lowSpec: this.lowSpecMode,
    };
  }

  public setProjects(ships: HarborShip[]): void {
    this.world.syncProjectShips(ships, this.lowSpecMode);
    this.emitLabels();
    this.renderFrame();
  }

  public setPeople(people: HarborPerson[]): void {
    for (const rt of this.personRuntimes) {
      this.peopleRoot.remove(rt.rig.group);
      this.peopleRoot.remove(rt.presenceRing);
      rt.rig.dispose();
      rt.hitProxy.geometry.dispose();
      (rt.hitProxy.material as THREE.Material).dispose();
      rt.presenceRing.geometry.dispose();
      (rt.presenceRing.material as THREE.Material).dispose();
    }
    this.personRuntimes = [];
    this.personHitProxies = [];

    const hitGeo = new THREE.CylinderGeometry(0.95, 0.95, 2.4, 8);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });

    people.forEach((person, idx) => {
      if (person.isCurrentUser) {
        return;
      }

      const rig = buildHarborAvatar({
        isPartner: person.isPartner,
        shirtHex: person.shirtHex,
        contactShadowTex: this.textures.contactShadow,
      });
      const y = sampleQuaySurfaceHeight(person.position.x, person.position.z);
      rig.group.position.set(person.position.x, y, person.position.z);
      rig.group.rotation.y = person.facingYaw;

      const hitProxy = new THREE.Mesh(hitGeo.clone(), hitMat.clone());
      hitProxy.position.set(0, 1.2, 0);
      hitProxy.userData.personSub = person.sub;
      rig.group.add(hitProxy);
      this.personHitProxies.push(hitProxy);

      const presenceRing = new THREE.Mesh(
        new THREE.RingGeometry(0.78, 1.04, 24),
        new THREE.MeshBasicMaterial({
          color: person.online ? 0x10b981 : 0x64748b,
          transparent: true,
          opacity: person.online ? 0.9 : 0.35,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      presenceRing.rotation.x = -Math.PI / 2;
      presenceRing.position.set(person.position.x, y + 0.05, person.position.z);

      this.peopleRoot.add(rig.group);
      this.peopleRoot.add(presenceRing);
      this.personRuntimes.push({ person, rig, hitProxy, presenceRing, phase: idx * 0.8 });
    });

    hitGeo.dispose();
    hitMat.dispose();
    this.emitLabels();
    this.renderFrame();
  }

  public setCameraPreset(preset: CameraPreset): void {
    this.cameraPreset = preset;
    this.cameraZoomScale = 1.0;
    this.snapCameraToPreset(preset);
  }

  public zoomBy(factor: number): void {
    this.cameraZoomScale = THREE.MathUtils.clamp(this.cameraZoomScale * factor, 0.55, 2.2);
    const offset = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
    offset.multiplyScalar(factor);
    const len = THREE.MathUtils.clamp(offset.length(), 10, 165);
    offset.setLength(len);
    this.camera.position.copy(this.controls.target).add(offset);
    this.controls.update();
    this.emitLabels();
    this.renderFrame();
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

  /**
   * Smoothly transitions the camera onto the vessel deck over `durationMs` (600ms default,
   * or 0ms instant snap when reduced-motion is enabled).
   */
  public boardShip(projectId: string, durationMs = 600): void {
    const found = this.world.dockedShips.find((d) => d.ship.id === projectId);
    if (!found) return;

    const toTarget = new THREE.Vector3(found.ship.berthX, 6.2, found.ship.berthZ);
    const toPos = new THREE.Vector3(found.ship.berthX + 12, 16.5, found.ship.berthZ + 22);

    // Move avatar to the ship's quay boarding point so disembark resumes nearby
    this.walkPath = [];
    this.waypointMarker.visible = false;
    this.playerPos.x = found.ship.boardingPoint.x;
    this.playerPos.z = found.ship.boardingPoint.z;
    this.playerPos.heading = 0;
    this.playerRig.group.position.set(this.playerPos.x, this.playerPos.y, this.playerPos.z);
    this.playerHalo.position.set(this.playerPos.x, this.playerPos.y + 0.04, this.playerPos.z);
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
    const toTarget = new THREE.Vector3(0, 2.0, 14);
    const toPos = new THREE.Vector3(16, 52, 102);

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
      this.waypointMarker.position.set(dest.x, 1.66, dest.z);
      this.waypointMarker.visible = true;
    }
  }

  public focusPerson(sub: string): void {
    const found = this.personRuntimes.find((r) => r.person.sub === sub);
    if (!found) return;
    const { x, z } = found.person.position;
    const y = sampleQuaySurfaceHeight(x, z);
    this.controls.target.set(x, y + 1.5, z);
    this.camera.position.set(x + 10, y + 11, z + 14);
    this.controls.update();

    const path = findQuayPath({ x: this.playerPos.x, z: this.playerPos.z }, { x: x + 1.8, z: z + 1.8 });
    if (path.length > 0) {
      this.walkPath = path;
      const dest = path[path.length - 1];
      this.waypointMarker.position.set(dest.x, 1.66, dest.z);
      this.waypointMarker.visible = true;
    }
    this.emitLabels();
    this.renderFrame();
  }

  private snapCameraToPreset(preset: CameraPreset): void {
    if (preset === 'overview') {
      this.controls.target.set(0, 2, 16);
      this.camera.position.set(0, 82, 108);
    } else if (preset === 'quay') {
      this.controls.target.set(this.playerPos.x, this.playerPos.y + 1.4, this.playerPos.z);
      this.camera.position.set(this.playerPos.x + 14, this.playerPos.y + 13, this.playerPos.z + 20);
    } else {
      // Default balanced harbor view framing quay portals, people, cranes, and all 4 docked project ships
      this.controls.target.set(0, 2.0, 14);
      this.camera.position.set(16, 52, 102);
    }
    this.controls.update();
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

  private handlePointerUp = (e: PointerEvent): void => {
    const dist = Math.hypot(e.clientX - this.pointerDownPos.x, e.clientY - this.pointerDownPos.y);
    if (dist > 6) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    _scratchMouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    _scratchMouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(_scratchMouse, this.camera);

    // 1. People avatars -> open Radial Menu at click screen point
    const personHits = this.raycaster.intersectObjects(this.personHitProxies, false);
    if (personHits.length > 0) {
      const sub = (personHits[0].object.userData as { personSub?: string }).personSub;
      if (sub) {
        this.callbacks.onPersonClicked(sub, { x: e.clientX, y: e.clientY });
        return;
      }
    }

    // 2. Docked SEDMS project ships -> open Radial Menu at click screen point
    const shipHits = this.raycaster.intersectObjects(this.world.clickableShipProxies, false);
    if (shipHits.length > 0) {
      const projectId = (shipHits[0].object.userData as { projectId?: string }).projectId;
      if (projectId) {
        this.callbacks.onShipClicked(projectId, { x: e.clientX, y: e.clientY });
        return;
      }
    }

    // 3. SGW portal pavilions
    const portalHits = this.raycaster.intersectObjects(this.world.clickablePortalProxies, false);
    if (portalHits.length > 0) {
      const portalId = (portalHits[0].object.userData as { portalId?: PortalBuildingSpec['id'] }).portalId;
      if (portalId) {
        this.callbacks.onPortalClicked(portalId);
        return;
      }
    }

    // 4. Click-to-walk on quay
    if (this.raycaster.ray.intersectPlane(_quayPlane, _scratchHit)) {
      const path = findQuayPath(
        { x: this.playerPos.x, z: this.playerPos.z },
        { x: _scratchHit.x, z: _scratchHit.z },
      );
      if (path.length > 0) {
        this.walkPath = path;
        const dest = path[path.length - 1];
        this.waypointMarker.position.set(dest.x, 1.66, dest.z);
        this.waypointMarker.visible = true;
      }
    }
  };

  private handleContextLost = (e: Event): void => {
    e.preventDefault();
  };

  private handleResize(): void {
    if (this.disposed) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.emitLabels();
    this.renderFrame();
  }

  private updatePlayerMovement(dt: number): void {
    let moveX = 0;
    let moveZ = 0;
    const fwd = (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0) -
      (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0);
    const strafe = (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) -
      (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);

    if (fwd !== 0 || strafe !== 0) {
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
      const speed = 11.5;
      const nx = moveX / mag;
      const nz = moveZ / mag;
      const resolved = resolveQuayMovement(
        { x: this.playerPos.x, z: this.playerPos.z },
        { x: this.playerPos.x + nx * speed * dt, z: this.playerPos.z + nz * speed * dt },
      );
      this.playerPos.x = resolved.x;
      this.playerPos.z = resolved.z;
      this.playerPos.heading = Math.atan2(nx, nz);
      this.playerPos.speed = speed;
    } else {
      this.playerPos.speed = 0;
    }

    this.playerRig.group.position.set(this.playerPos.x, this.playerPos.y, this.playerPos.z);
    this.playerRig.group.rotation.y = this.playerPos.heading;
    this.playerHalo.position.set(this.playerPos.x, this.playerPos.y + 0.04, this.playerPos.z);
    this.playerRig.updateAnimation(
      dt,
      this.elapsedTotal,
      this.playerPos.speed > 0.2 ? 'run' : 'idle',
      this.shouldSuppressMotion(),
    );
  }

  private projectToScreen(x: number, y: number, z: number): { x: number; y: number; visible: boolean } {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    _scratchProj.set(x, y, z).project(this.camera);
    const visible =
      _scratchProj.z >= -1 &&
      _scratchProj.z <= 1 &&
      _scratchProj.x >= -1.05 &&
      _scratchProj.x <= 1.05 &&
      _scratchProj.y >= -1.05 &&
      _scratchProj.y <= 1.05;
    return {
      x: (_scratchProj.x * 0.5 + 0.5) * w,
      y: (-_scratchProj.y * 0.5 + 0.5) * h,
      visible,
    };
  }

  private emitLabels(): void {
    const labels: ProjectedLabel[] = [];

    for (const item of this.world.dockedShips) {
      const p = this.projectToScreen(item.ship.berthX, 15.2, item.ship.berthZ);
      labels.push({
        id: `ship:${item.ship.id}`,
        text: item.ship.name,
        subText: `${item.ship.code} · ${item.ship.status}`,
        kind: 'ship',
        accentHex: item.ship.accentHex,
        ...p,
      });
    }

    for (const rt of this.personRuntimes) {
      const p = this.projectToScreen(rt.person.position.x, 4.4, rt.person.position.z);
      labels.push({
        id: `person:${rt.person.sub}`,
        text: rt.person.name,
        subText: `${rt.person.dept} · ${rt.person.online ? '접속 중' : '오프라인'}`,
        kind: rt.person.isPartner
          ? 'person-partner'
          : rt.person.online
            ? 'person-online'
            : 'person-offline',
        ...p,
      });
    }

    for (const b of PORTAL_BUILDINGS) {
      const p = this.projectToScreen(b.centerX, 8.2, b.centerZ);
      labels.push({
        id: `portal:${b.id}`,
        text: b.label,
        subText: b.subtitle,
        kind: 'portal',
        accentHex: b.accentHex,
        ...p,
      });
    }

    this.callbacks.onLabelsUpdated(labels);
  }

  private renderFrame(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private tick = (): void => {
    if (this.disposed) return;
    this.frameId = requestAnimationFrame(this.tick);

    const now = performance.now();
    if ((this.isSoftwareGl || this.lowSpecMode) && now - this.lastFrameMs < 95) {
      return;
    }
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
    this.updatePlayerMovement(dt);

    const suppressMotion = this.shouldSuppressMotion();
    for (const rt of this.personRuntimes) {
      rt.rig.updateAnimation(dt, this.elapsedTotal + rt.phase, 'idle', suppressMotion);
    }

    if (!suppressMotion) {
      this.ocean.update(this.elapsedTotal);
    }
    this.world.update(dt, this.elapsedTotal, suppressMotion);

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
    }
  };

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    this.resizeObserver.disconnect();
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleWindowBlur);
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.removeEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);

    this.controls.dispose();
    this.world.dispose();
    this.ocean.dispose();
    this.textures.dispose();
    this.playerRig.dispose();
    if (this.envRT) this.envRT.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
