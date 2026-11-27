import type { PortalBuildingSpec } from '../core/navMeshEngine';
import type { HarborPerson, HarborShip } from '../mapping';
import type { ShipDisplayPrefsMap } from '../shipDisplayPrefs';

export type CameraPreset = 'harbor' | 'overview' | 'quay';

export type QualityTier = 'high' | 'medium' | 'low';

export type AtmospherePreset = 'day' | 'sunset';

export interface ProjectedLabel {
  id: string;
  text: string;
  subText?: string;
  kind:
    | 'ship'
    | 'deco-ship'
    | 'person-online'
    | 'person-offline'
    | 'person-partner'
    | 'portal';
  accentHex?: string;
  x: number;
  y: number;
  visible: boolean;
  /** True when hovered or explicitly focused — shows short text tooltip; otherwise tiny dot marker only. */
  showText: boolean;
  /** Distance from camera in meters (used for distance culling & compacting). */
  distance: number;
}

export interface RenderBatchMetrics {
  instancedMeshCount: number;
  totalInstances: number;
  mergedMeshCount: number;
  mergedSourceMeshes: number;
  savedDrawCalls: number;
}

export interface RenderMetrics {
  drawCalls: number;
  peakDrawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  fps: number;
  frameTimeMs: number;
  lowSpec: boolean;
  qualityTier: QualityTier;
  canvasWidth: number;
  canvasHeight: number;
  activeChunks: number;
  batching: RenderBatchMetrics;
}

export interface ScreenAnchorPoint {
  x: number;
  y: number;
}

export interface ClickedDecorativeShip {
  id: string;
  defaultName: string;
  subtitle: string;
  x: number;
  z: number;
  defaultYawDeg: number;
  halfLength: number;
  halfBeam: number;
}

export interface HarborSceneCallbacks {
  onShipClicked: (projectId: string, screenPos: ScreenAnchorPoint) => void;
  onDecorativeShipClicked?: (ship: ClickedDecorativeShip, screenPos: ScreenAnchorPoint) => void;
  onPersonClicked: (sub: string, screenPos: ScreenAnchorPoint) => void;
  onPortalClicked: (portalId: PortalBuildingSpec['id']) => void;
  onLabelsUpdated: (labels: ProjectedLabel[]) => void;
  onPlayerPoseUpdated?: (pose: { x: number; z: number; heading: number }) => void;
  onCameraTargetUpdated?: (target: { x: number; z: number }) => void;
  onRenderMetricsUpdated?: (metrics: RenderMetrics) => void;
  onQualityAutoDowngraded?: (nextTier: QualityTier, avgFrameMs: number) => void;
  onContextLost?: () => void;
  onContextRestored?: () => void;
}

export interface HarborSceneInitOptions {
  lowSpec?: boolean;
  qualityTier?: QualityTier;
  userSelectedQuality?: boolean;
  reducedMotion?: boolean;
  darkTheme?: boolean;
  shipDisplayPrefs?: ShipDisplayPrefsMap;
}

export interface HarborSceneHandle {
  setThemeMode(dark: boolean): void;
  setReducedMotion(enabled: boolean): void;
  setLowSpecMode(enabled: boolean): void;
  setQualityTier(tier: QualityTier, userInitiated?: boolean): void;
  setShipDisplayPrefs(prefs: ShipDisplayPrefsMap): void;
  setSelectedShipId(shipId: string | null): void;
  getRenderMetrics(): RenderMetrics;
  setProjects(ships: HarborShip[]): void;
  setPeople(people: HarborPerson[]): void;
  setCameraPreset(preset: CameraPreset): void;
  returnToHomeHarbor(): void;
  panCameraToWorld(x: number, z: number): void;
  zoomBy(factor: number): void;
  focusShip(projectId: string): void;
  boardShip(projectId: string, durationMs?: number): void;
  disembarkToHarbor(durationMs?: number): void;
  walkToPoint(x: number, z: number): void;
  focusPerson(sub: string): void;
  dispose(): void;
}

export interface HarborSceneModule {
  HarborSceneController: new (
    container: HTMLElement,
    callbacks: HarborSceneCallbacks,
    initialOptions?: HarborSceneInitOptions,
  ) => HarborSceneHandle;
}
