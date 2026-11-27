import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Anchor, ExternalLink, Info } from 'lucide-react';
import {
  BOARDING_TRANSITION_MS,
  createInitialProjectSessionState,
  findNearestBoardableShip,
  transitionProjectSessionState,
  type HarborProjectSessionState,
} from './boardingState';
import { AccessibleListView } from './components/AccessibleListView';
import {
  AuthGateOverlay,
  PersonActionModal,
} from './components/HarborOverlays';
import { HudTopBar } from './components/HudTopBar';
import type { RadialTarget } from './components/RadialActionMenu';
import type { PortalBuildingSpec } from './core/navMeshEngine';
import {
  isSafeNavigationUrl,
  navigateSafely,
  SEDMS_PROJECTS_LOGIN_URL,
  SGW_LOGIN_REDIRECT_URL,
  SGW_PORTAL_LINKS,
} from './deepLink';

const BottomControlDock = lazy(() =>
  import('./components/BottomControlDock').then((m) => ({ default: m.BottomControlDock })),
);
const HarborMiniMap = lazy(() =>
  import('./components/HarborMiniMap').then((m) => ({ default: m.HarborMiniMap })),
);
const OnboardPanel = lazy(() =>
  import('./components/OnboardPanel').then((m) => ({ default: m.OnboardPanel })),
);
const PeopleFinderDrawer = lazy(() =>
  import('./components/PeopleFinderDrawer').then((m) => ({ default: m.PeopleFinderDrawer })),
);
const RadialActionMenu = lazy(() =>
  import('./components/RadialActionMenu').then((m) => ({ default: m.RadialActionMenu })),
);
const ReportModal = lazy(() =>
  import('./ui/ReportModal').then((m) => ({ default: m.ReportModal })),
);
import {
  detectDeviceProfile,
  subscribeReducedMotion,
} from './deviceProfile';
import type { AppErrorCode } from './errorCatalog';
import {
  assertValidShipBerths,
  mapEmployeesToHarborPeople,
  mapProjectsToHarborShips,
  type HarborPerson,
  type HarborShip,
} from './mapping';
import {
  HUB_POLL_INTERVAL_MS,
  mergeHubModuleChips,
} from './meta/hubChipModel';
import type { MetaHubSummaryResponse, MetaRegistryResponse } from './meta/hubTypes';
import {
  createProjectRequestCoordinator,
  fetchMetaHubSummary,
  fetchMetaRegistry,
  type ProjectRequestCoordinator,
} from './meta/metaClient';
import {
  detectRuntimeEnv,
  PREVIEW_SGW_ONLY_TOAST,
} from './runtimeEnv';
import { loadHarborSceneModule } from './scene/harborSceneLoader';
import type {
  CameraPreset,
  ClickedDecorativeShip,
  HarborSceneHandle,
  ProjectedLabel,
  QualityTier,
  RenderMetrics,
} from './scene/harborSceneTypes';
import { HOME_HARBOR_DECORATIVE_VESSELS } from './scene/sceneryCatalog';
import {
  fetchAuthMe,
  fetchEmployees,
  fetchPresence,
  fetchSedmsProjects,
  postAuthLogout,
  postPresenceHeartbeat,
  SEDMS_UNAVAILABLE_MESSAGE,
  SEDMS_UNMAPPED_MESSAGE,
  type SedmsProject,
  type SgwEmployee,
  type SgwPresenceEntry,
  type SgwUser,
} from './sgwAdapter';
import {
  applyShipCustomName,
  applyShipCustomYaw,
  checkShipRotationCollision,
  computeQuayParallelSnapYawDeg,
  loadShipDisplayPrefs,
  saveShipDisplayPrefs,
  stepShipYawDegrees,
  type ShipDisplayPrefsMap,
  type ShipFootprintCollider,
} from './shipDisplayPrefs';
import {
  createInitialWebGLViewState,
  transitionWebGLViewState,
  type WebGLViewState,
} from './webglContextState';

type AuthGateStatus =
  | 'loading'
  | 'authenticated'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'error';

type ProjectsLoadState =
  | 'loading'
  | 'ready'
  | 'unmapped'
  | 'unavailable'
  | 'pending'
  | 'forbidden'
  | 'error';

const PRESENCE_POLL_MS = 12_000;
const TOAST_DURATION_MS = 3_500;
const CAMERA_ORDER: CameraPreset[] = ['harbor', 'overview', 'quay'];

const PORTAL_LABEL: Record<PortalBuildingSpec['id'], string> = {
  talk: 'SGTALK · SGW 비서',
  nas: 'SGW NAS',
  bmail: 'bmail',
  admin: 'SGW 관리자',
};

function isDesktopViewport(): boolean {
  if (typeof window === 'undefined') return true;
  return window.innerWidth >= 768;
}

function buildDecorativeShipMap(): Map<string, ClickedDecorativeShip> {
  const map = new Map<string, ClickedDecorativeShip>();
  for (const spec of HOME_HARBOR_DECORATIVE_VESSELS) {
    map.set(spec.id, {
      id: spec.id,
      defaultName: spec.defaultName,
      subtitle: spec.subtitle,
      x: spec.x,
      z: spec.z,
      defaultYawDeg: spec.defaultYawDeg,
      halfLength: spec.halfLength,
      halfBeam: spec.halfBeam,
    });
  }
  return map;
}

export function App() {
  const runtimeEnv = useMemo(() => detectRuntimeEnv(), []);
  const isPreviewMode = runtimeEnv === 'preview';

  const deviceProfile = useMemo(() => detectDeviceProfile(), []);
  const webglSupported = deviceProfile.webglSupported;
  const [webglState, setWebglState] = useState<WebGLViewState>(() =>
    createInitialWebGLViewState(deviceProfile.webglSupported, deviceProfile.initialViewMode),
  );
  const viewMode = webglState.viewMode;
  const webglContextLost = webglState.contextHealth === 'lost';

  // 3-tier graphics quality (default 'high' per Requirement #1)
  const [qualityTier, setQualityTier] = useState<QualityTier>(() => deviceProfile.initialQualityTier);
  const [userSelectedQuality, setUserSelectedQuality] = useState<boolean>(false);
  const lowSpecMode = qualityTier === 'low';

  const [reducedMotion, setReducedMotion] = useState<boolean>(() => deviceProfile.reducedMotion);
  const [darkTheme, setDarkTheme] = useState<boolean>(false);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('harbor');

  // Local UI display preferences for ship names & rotations (non-PII, isolated in shipDisplayPrefs.ts)
  const [shipDisplayPrefs, setShipDisplayPrefs] = useState<ShipDisplayPrefsMap>(() =>
    loadShipDisplayPrefs(),
  );
  const [rotationWarning, setRotationWarning] = useState<string | null>(null);

  const [authStatus, setAuthStatus] = useState<AuthGateStatus>('loading');
  const [authErrorCode, setAuthErrorCode] = useState<AppErrorCode | null>(null);
  const [authMessage, setAuthMessage] = useState<string>('SGW 세션 상태를 확인하고 있습니다...');
  const [currentUser, setCurrentUser] = useState<SgwUser | null>(null);

  const [employees, setEmployees] = useState<SgwEmployee[]>([]);
  const [presenceEntries, setPresenceEntries] = useState<SgwPresenceEntry[]>([]);
  const [projects, setProjects] = useState<SedmsProject[]>([]);
  const [projectsState, setProjectsState] = useState<ProjectsLoadState>('loading');
  const [projectsErrorCode, setProjectsErrorCode] = useState<AppErrorCode | null>(null);
  const [projectsMessage, setProjectsMessage] = useState<string>('');

  // Connection & sync status (never hide polling failures)
  const [syncDisconnected, setSyncDisconnected] = useState<boolean>(false);
  const [syncErrorCode, setSyncErrorCode] = useState<AppErrorCode | null>(null);
  const [lastSyncedAtMs, setLastSyncedAtMs] = useState<number | null>(null);
  const [clockNowMs, setClockNowMs] = useState<number>(() => Date.now());

  const [labels, setLabels] = useState<ProjectedLabel[]>([]);
  const [playerPose, setPlayerPose] = useState<{ x: number; z: number; heading: number }>({
    x: 0,
    z: -10.5,
    heading: 0,
  });
  const [cameraWorldTarget, setCameraWorldTarget] = useState<{ x: number; z: number }>({
    x: 0,
    z: 6,
  });
  const [projectSession, setProjectSession] = useState<HarborProjectSessionState>(
    createInitialProjectSessionState,
  );
  const [renderMetrics, setRenderMetrics] = useState<RenderMetrics | null>(null);
  const [sceneReady3D, setSceneReady3D] = useState<boolean>(false);
  const [sceneLoading3D, setSceneLoading3D] = useState<boolean>(false);
  const [peopleDrawerOpen, setPeopleDrawerOpen] = useState<boolean>(false);
  const [minimapOpen, setMinimapOpen] = useState<boolean>(() => isDesktopViewport());
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Unified /api/meta/* Hub status chip state (Stage 2/5) & Report Modal (Stage 4/5)
  const [hubRegistry, setHubRegistry] = useState<MetaRegistryResponse | null>(null);
  const [hubSummary, setHubSummary] = useState<MetaHubSummaryResponse | null>(null);
  const [hubRefreshing, setHubRefreshing] = useState<boolean>(false);
  const [reportModalProjectId, setReportModalProjectId] = useState<string | null>(null);

  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<HarborSceneHandle | null>(null);
  const hubCoordinatorRef = useRef<ProjectRequestCoordinator | null>(null);
  if (!hubCoordinatorRef.current) {
    hubCoordinatorRef.current = createProjectRequestCoordinator(null);
  }
  const toastTimerRef = useRef<number | null>(null);
  const boardingTimerRef = useRef<number | null>(null);
  const reducedMotionRef = useRef<boolean>(reducedMotion);
  const qualityTierRef = useRef<QualityTier>(qualityTier);
  const userSelectedQualityRef = useRef<boolean>(userSelectedQuality);
  const shipDisplayPrefsRef = useRef<ShipDisplayPrefsMap>(shipDisplayPrefs);

  const decorativeById = useMemo(() => buildDecorativeShipMap(), []);

  useEffect(() => {
    reducedMotionRef.current = reducedMotion;
  }, [reducedMotion]);

  useEffect(() => {
    qualityTierRef.current = qualityTier;
  }, [qualityTier]);

  useEffect(() => {
    userSelectedQualityRef.current = userSelectedQuality;
  }, [userSelectedQuality]);

  useEffect(() => {
    shipDisplayPrefsRef.current = shipDisplayPrefs;
  }, [shipDisplayPrefs]);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, TOAST_DURATION_MS);
  }, []);

  const showPreviewBlockedToast = useCallback(
    (featureLabel: string) => {
      showToast(`${PREVIEW_SGW_ONLY_TOAST} — ${featureLabel}`);
    },
    [showToast],
  );

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
      if (boardingTimerRef.current !== null) window.clearTimeout(boardingTimerRef.current);
    };
  }, []);

  useEffect(() => {
    return subscribeReducedMotion((nextReduced) => {
      setReducedMotion(nextReduced);
    });
  }, []);

  useEffect(() => {
    const onResize = () => {
      if (!isDesktopViewport()) {
        setMinimapOpen(false);
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Refresh relative "n분 전" clock while disconnected
  useEffect(() => {
    if (!syncDisconnected) return;
    const id = window.setInterval(() => setClockNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [syncDisconnected]);

  const mappedPeople = useMemo(
    () =>
      mapEmployeesToHarborPeople(
        employees,
        presenceEntries,
        currentUser?.sub ?? null,
        Date.now(),
      ),
    [employees, presenceEntries, currentUser],
  );

  const mappedShips = useMemo(() => mapProjectsToHarborShips(projects), [projects]);

  const peopleBySub = useMemo(
    () => new Map(mappedPeople.map((p) => [p.sub, p])),
    [mappedPeople],
  );
  const shipsById = useMemo(
    () => new Map(mappedShips.map((s) => [s.id, s])),
    [mappedShips],
  );

  const peopleBySubRef = useRef<Map<string, HarborPerson>>(peopleBySub);
  const shipsByIdRef = useRef<Map<string, HarborShip>>(shipsById);

  useEffect(() => {
    peopleBySubRef.current = peopleBySub;
  }, [peopleBySub]);

  useEffect(() => {
    shipsByIdRef.current = shipsById;
    if (mappedShips.length > 0) {
      assertValidShipBerths(mappedShips, {
        throwOnViolation: false,
        warnInDev: import.meta.env.DEV,
      });
    }
    setProjectSession((prev) =>
      transitionProjectSessionState(prev, {
        type: 'SYNC_SHIPS',
        shipsById,
      }),
    );
  }, [mappedShips, shipsById]);

  // Build OBB collision footprints for ALL business ships + decorative vessels
  const buildAllShipColliders = useCallback(
    (prefs: ShipDisplayPrefsMap): ShipFootprintCollider[] => {
      const colliders: ShipFootprintCollider[] = [];
      for (const ship of shipsByIdRef.current.values()) {
        const defaultYawDeg = 90;
        const yawDeg = prefs[ship.id]?.yawDeg ?? defaultYawDeg;
        colliders.push({
          id: ship.id,
          centerX: ship.berthX,
          centerZ: ship.berthZ,
          halfLength: 14.2,
          halfBeam: 5.4,
          yawDeg,
        });
      }
      for (const spec of HOME_HARBOR_DECORATIVE_VESSELS) {
        const yawDeg = prefs[spec.id]?.yawDeg ?? spec.defaultYawDeg;
        colliders.push({
          id: spec.id,
          centerX: spec.x,
          centerZ: spec.z,
          halfLength: spec.halfLength,
          halfBeam: spec.halfBeam,
          yawDeg,
        });
      }
      return colliders;
    },
    [],
  );

  const handleRenameShip = useCallback(
    (shipId: string, rawName: string): { ok: boolean; reason?: string } => {
      const res = applyShipCustomName(shipDisplayPrefsRef.current, shipId, rawName);
      if (!res.ok) {
        return { ok: false, reason: res.reason };
      }
      setShipDisplayPrefs(res.next);
      saveShipDisplayPrefs(res.next);
      showToast(res.cleared ? '선박 이름을 원래 이름으로 되돌렸습니다.' : '선박 표시 이름을 저장했습니다.');
      return { ok: true };
    },
    [showToast],
  );

  const tryApplyShipRotation = useCallback(
    (shipId: string, nextYawDeg: number) => {
      const prefs = shipDisplayPrefsRef.current;
      const allColliders = buildAllShipColliders(prefs);
      const targetCollider = allColliders.find((c) => c.id === shipId);
      if (!targetCollider) return;

      const others = allColliders.filter((c) => c.id !== shipId);
      const check = checkShipRotationCollision(targetCollider, nextYawDeg, others);
      if (!check.ok) {
        setRotationWarning(check.reason);
        showToast(check.reason);
        return;
      }

      setRotationWarning(null);
      const next = applyShipCustomYaw(prefs, shipId, nextYawDeg);
      setShipDisplayPrefs(next);
      saveShipDisplayPrefs(next);
    },
    [buildAllShipColliders, showToast],
  );

  const getShipCurrentYawDeg = useCallback(
    (shipId: string, prefs: ShipDisplayPrefsMap): number => {
      const saved = prefs[shipId]?.yawDeg;
      if (typeof saved === 'number' && Number.isFinite(saved)) return saved;
      const biz = shipsByIdRef.current.get(shipId);
      if (biz) return 90;
      const deco = decorativeById.get(shipId);
      if (deco) return deco.defaultYawDeg;
      return 0;
    },
    [decorativeById],
  );

  const handleRotateShipStep = useCallback(
    (shipId: string, deltaSteps: number) => {
      const currentDeg = getShipCurrentYawDeg(shipId, shipDisplayPrefsRef.current);
      const nextDeg = stepShipYawDegrees(currentDeg, deltaSteps);
      tryApplyShipRotation(shipId, nextDeg);
    },
    [getShipCurrentYawDeg, tryApplyShipRotation],
  );

  const handleRotateShipAbsolute = useCallback(
    (shipId: string, nextYawDeg: number) => {
      tryApplyShipRotation(shipId, nextYawDeg);
    },
    [tryApplyShipRotation],
  );

  const handleSnapShipParallel = useCallback(
    (shipId: string) => {
      const currentDeg = getShipCurrentYawDeg(shipId, shipDisplayPrefsRef.current);
      const biz = shipsByIdRef.current.get(shipId);
      const deco = decorativeById.get(shipId);
      const cx = biz ? biz.berthX : deco ? deco.x : 0;
      const cz = biz ? biz.berthZ : deco ? deco.z : 20;
      const snappedDeg = computeQuayParallelSnapYawDeg(cx, cz, currentDeg);
      tryApplyShipRotation(shipId, snappedDeg);
    },
    [decorativeById, getShipCurrentYawDeg, tryApplyShipRotation],
  );

  // Atomic project boarding / switching flow (clears previous project cache in 1 transition)
  const startBoardingShip = useCallback((shipId: string) => {
    const ship = shipsByIdRef.current.get(shipId);
    if (!ship) return;
    if (boardingTimerRef.current !== null) {
      window.clearTimeout(boardingTimerRef.current);
      boardingTimerRef.current = null;
    }

    const isReduced = reducedMotionRef.current;
    setPeopleDrawerOpen(false);
    setRotationWarning(null);
    setProjectSession((prev) =>
      transitionProjectSessionState(prev, {
        type: 'BOARD_OR_SWITCH_SHIP',
        ship,
        reducedMotion: isReduced,
      }),
    );

    sceneRef.current?.boardShip(ship.id, isReduced ? 0 : BOARDING_TRANSITION_MS);

    if (!isReduced) {
      boardingTimerRef.current = window.setTimeout(() => {
        setProjectSession((prev) =>
          transitionProjectSessionState(prev, {
            type: 'COMPLETE_BOARDING',
            shipsById: shipsByIdRef.current,
          }),
        );
        boardingTimerRef.current = null;
      }, BOARDING_TRANSITION_MS);
    }
  }, []);

  const handleDisembark = useCallback(() => {
    if (boardingTimerRef.current !== null) {
      window.clearTimeout(boardingTimerRef.current);
      boardingTimerRef.current = null;
    }
    setRotationWarning(null);
    setProjectSession((prev) =>
      transitionProjectSessionState(prev, { type: 'DISEMBARK' }),
    );
    sceneRef.current?.disembarkToHarbor(reducedMotionRef.current ? 0 : 450);
  }, []);

  // Update proximity prompt whenever avatar moves or ships change
  useEffect(() => {
    const nearest = findNearestBoardableShip(playerPose, mappedShips);
    setProjectSession((prev) =>
      transitionProjectSessionState(prev, {
        type: 'PROXIMITY_CHANGED',
        nearbyShipId: nearest?.id ?? null,
      }),
    );
  }, [playerPose, mappedShips]);

  const boardingState = projectSession.boarding;

  const selectedPerson = useMemo<HarborPerson | null>(() => {
    if (!projectSession.selectedPersonSub) return null;
    return peopleBySub.get(projectSession.selectedPersonSub) ?? null;
  }, [projectSession.selectedPersonSub, peopleBySub]);

  const radialTarget = useMemo<RadialTarget | null>(() => {
    const snap = projectSession.radialTarget;
    if (!snap) return null;
    if (snap.kind === 'ship') {
      const ship = shipsById.get(snap.targetId);
      return ship ? { kind: 'ship', ship, anchor: snap.anchor } : null;
    }
    if (snap.kind === 'decorative-ship') {
      const deco = decorativeById.get(snap.targetId);
      return deco ? { kind: 'decorative-ship', ship: deco, anchor: snap.anchor } : null;
    }
    const person = peopleBySub.get(snap.targetId);
    return person ? { kind: 'person', person, anchor: snap.anchor } : null;
  }, [projectSession.radialTarget, shipsById, decorativeById, peopleBySub]);

  // Clear rotation warning when popup closes or target switches
  useEffect(() => {
    setRotationWarning(null);
  }, [projectSession.radialTarget?.targetId, projectSession.radialTarget?.kind]);

  // Highlight selected/boarded ship with glowing 3D LiDAR point-cloud scan effect (#10)
  const activeBoardedShip = projectSession.panelShipSnapshot;
  useEffect(() => {
    const selectedId =
      radialTarget?.kind === 'ship'
        ? radialTarget.ship.id
        : radialTarget?.kind === 'decorative-ship'
          ? radialTarget.ship.id
          : activeBoardedShip?.id ?? null;
    sceneRef.current?.setSelectedShipId(selectedId);
  }, [radialTarget, activeBoardedShip]);

  // Active project for /api/meta/hub/summary (current selected/boarded project, fallback to first project)
  const hubTargetProjectId = useMemo<string | null>(() => {
    if (activeBoardedShip) return activeBoardedShip.id;
    if (radialTarget?.kind === 'ship') return radialTarget.ship.id;
    if (projectSession.minimapSelectedShipId && shipsById.has(projectSession.minimapSelectedShipId)) {
      return projectSession.minimapSelectedShipId;
    }
    return mappedShips[0]?.id ?? null;
  }, [activeBoardedShip, radialTarget, projectSession.minimapSelectedShipId, shipsById, mappedShips]);

  const hubProjectLabel = useMemo<string | null>(() => {
    if (!hubTargetProjectId) return null;
    const ship = shipsById.get(hubTargetProjectId);
    if (!ship) return hubTargetProjectId;
    return shipDisplayPrefs[ship.id]?.customName || ship.name || ship.code;
  }, [hubTargetProjectId, shipsById, shipDisplayPrefs]);

  const hubChips = useMemo(
    () => mergeHubModuleChips(hubRegistry, hubSummary),
    [hubRegistry, hubSummary],
  );

  const loadHubRegistry = useCallback(async () => {
    const res = await fetchMetaRegistry({ runtimeEnv });
    if (res.ok) {
      setHubRegistry(res.data);
    } else if (res.code === 'ERR_AUTH_REQUIRED') {
      window.location.replace(res.redirectUrl ?? SGW_LOGIN_REDIRECT_URL);
    }
  }, [runtimeEnv]);

  const loadHubSummary = useCallback(
    async (projectId: string, refresh: 0 | 1) => {
      const coordinator = hubCoordinatorRef.current;
      if (!coordinator) return;
      coordinator.switchProject(projectId);
      setHubRefreshing(true);
      const outcome = await coordinator.run(projectId, 'hub-summary', (signal) =>
        fetchMetaHubSummary({ project: projectId, refresh }, { runtimeEnv, signal }),
      );
      if (outcome.stale || !outcome.result) {
        return;
      }
      setHubRefreshing(false);
      const res = outcome.result;
      if (res.ok) {
        setHubSummary(res.data);
        return;
      }
      if (res.code === 'ERR_AUTH_REQUIRED') {
        window.location.replace(res.redirectUrl ?? SGW_LOGIN_REDIRECT_URL);
      } else if (res.code === 'ERR_RATE_LIMITED') {
        // Keep previously cached hubSummary intact on 429
        showToast('요청이 많습니다. 잠시 후 다시 시도해 주세요.');
      } else if (res.code === 'ERR_PROJECT_FORBIDDEN') {
        showToast('접근 권한이 없는 프로젝트입니다. 허용된 프로젝트를 선택해 주세요.');
      } else if (refresh === 1 && res.code !== 'ERR_ABORTED') {
        showToast(res.message);
      }
    },
    [runtimeEnv, showToast],
  );

  // Load /api/meta/registry once after authentication
  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    void loadHubRegistry();
  }, [authStatus, loadHubRegistry]);

  // Load /api/meta/hub/summary on project switch + 45s visibility-aware auto-refresh
  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    const coordinator = hubCoordinatorRef.current;
    if (!hubTargetProjectId) {
      coordinator?.cancelAll();
      setHubSummary(null);
      setHubRefreshing(false);
      return;
    }

    void loadHubSummary(hubTargetProjectId, 0);

    let timerId: number | null = null;
    const startTimer = () => {
      if (timerId !== null) window.clearInterval(timerId);
      timerId = window.setInterval(() => {
        if (!document.hidden) {
          void loadHubSummary(hubTargetProjectId, 0);
        }
      }, HUB_POLL_INTERVAL_MS);
    };

    const handleVisibility = () => {
      if (document.hidden) {
        if (timerId !== null) {
          window.clearInterval(timerId);
          timerId = null;
        }
      } else {
        void loadHubSummary(hubTargetProjectId, 0);
        startTimer();
      }
    };

    if (!document.hidden) {
      startTimer();
    }
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (timerId !== null) window.clearInterval(timerId);
      document.removeEventListener('visibilitychange', handleVisibility);
      coordinator?.cancelAll();
    };
  }, [authStatus, hubTargetProjectId, loadHubSummary]);

  const handleRefreshHub = useCallback(() => {
    void loadHubRegistry();
    if (hubTargetProjectId) {
      void loadHubSummary(hubTargetProjectId, 1);
    }
  }, [hubTargetProjectId, loadHubRegistry, loadHubSummary]);

  // Keyboard shortcuts: E / Enter to board nearby ship; Escape to disembark or close overlays
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT');

      if (e.key === 'Escape') {
        if (reportModalProjectId) {
          setReportModalProjectId(null);
          return;
        }
        if (projectSession.radialTarget) {
          setProjectSession((prev) =>
            transitionProjectSessionState(prev, { type: 'CLOSE_RADIAL' }),
          );
          return;
        }
        handleDisembark();
        setPeopleDrawerOpen(false);
        return;
      }

      if (inInput) return;

      const isInteractiveFocus =
        target &&
        (target.tagName === 'BUTTON' ||
          target.tagName === 'A' ||
          target.getAttribute('role') === 'application');

      if (
        (e.key === 'e' || e.key === 'E' || (e.key === 'Enter' && !isInteractiveFocus)) &&
        boardingState.phase === 'harbor' &&
        boardingState.nearbyShipId &&
        !projectSession.selectedPersonSub &&
        !projectSession.radialTarget &&
        !reportModalProjectId
      ) {
        e.preventDefault();
        startBoardingShip(boardingState.nearbyShipId);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    boardingState,
    projectSession.selectedPersonSub,
    projectSession.radialTarget,
    reportModalProjectId,
    startBoardingShip,
    handleDisembark,
  ]);

  const loadProjects = useCallback(
    async (forceRefresh = false) => {
      setProjectsState('loading');
      setProjectsErrorCode(null);
      const res = await fetchSedmsProjects({ runtimeEnv, forceRefresh });
      if (res.status === 'ready') {
        setProjects(res.projects);
        setProjectsState('ready');
        setProjectsErrorCode(null);
        setProjectsMessage('');
        setSyncDisconnected(false);
        setSyncErrorCode(null);
        setLastSyncedAtMs(Date.now());
      } else if (res.status === 'unmapped') {
        setProjects([]);
        setProjectsState('unmapped');
        setProjectsErrorCode(null);
        setProjectsMessage(res.message);
        setSyncDisconnected(false);
        setSyncErrorCode(null);
        setLastSyncedAtMs(Date.now());
      } else if (res.status === 'unavailable') {
        setProjects([]);
        setProjectsState('unavailable');
        setProjectsErrorCode(null);
        setProjectsMessage(res.message);
        setSyncDisconnected(false);
        setSyncErrorCode(null);
        setLastSyncedAtMs(Date.now());
      } else if (res.status === 'pending') {
        setProjects([]);
        setProjectsState('pending');
        setProjectsErrorCode(res.errorCode);
        setProjectsMessage(res.message);
        setSyncDisconnected(false);
        setSyncErrorCode(null);
        setLastSyncedAtMs(Date.now());
      } else if (res.status === 'forbidden') {
        setProjects([]);
        setProjectsState('forbidden');
        setProjectsErrorCode(res.errorCode);
        setProjectsMessage(res.message);
      } else if (res.status === 'unauthenticated') {
        window.location.replace(SGW_LOGIN_REDIRECT_URL);
      } else {
        setProjects([]);
        setProjectsState('error');
        setProjectsErrorCode(res.errorCode);
        setProjectsMessage(res.message);
        setSyncDisconnected(true);
        setSyncErrorCode(res.errorCode);
        setClockNowMs(Date.now());
      }
    },
    [runtimeEnv],
  );

  const loadDirectoryAndPresence = useCallback(async () => {
    const [empRes, presRes] = await Promise.all([
      fetchEmployees({ runtimeEnv }),
      fetchPresence({ runtimeEnv }),
    ]);
    if (empRes.status === 'unauthenticated' || presRes.status === 'unauthenticated') {
      window.location.replace(SGW_LOGIN_REDIRECT_URL);
      return;
    }
    if (empRes.status === 'ok') {
      setEmployees(empRes.employees);
    }
    if (presRes.status === 'ok') {
      setPresenceEntries(presRes.entries);
      setSyncDisconnected(false);
      setSyncErrorCode(null);
      setLastSyncedAtMs(Date.now());
    } else if (presRes.status === 'error') {
      setSyncDisconnected(true);
      setSyncErrorCode(presRes.errorCode);
      setClockNowMs(Date.now());
    }
  }, [runtimeEnv]);

  const bootstrapSession = useCallback(async () => {
    setAuthStatus('loading');
    setAuthErrorCode(null);
    setAuthMessage('SGW 세션 상태를 확인하고 있습니다...');
    const authRes = await fetchAuthMe({ runtimeEnv });

    if (authRes.status === 'authenticated') {
      setCurrentUser(authRes.user);
      setAuthStatus('authenticated');
      setAuthErrorCode(null);
      await Promise.all([loadDirectoryAndPresence(), loadProjects(false)]);
      if (runtimeEnv === 'sgw') {
        void postPresenceHeartbeat({ runtimeEnv });
      }
      return;
    }

    if (authRes.status === 'unauthenticated') {
      setAuthStatus('unauthenticated');
      setAuthErrorCode(authRes.errorCode);
      setAuthMessage(authRes.message);
      window.location.replace(authRes.redirectUrl);
      return;
    }

    setCurrentUser(null);
    setAuthStatus(authRes.status);
    setAuthErrorCode(authRes.errorCode);
    setAuthMessage(authRes.message);
  }, [loadDirectoryAndPresence, loadProjects, runtimeEnv]);

  useEffect(() => {
    void bootstrapSession();
  }, [bootstrapSession]);

  // 12-second presence polling + heartbeat (SGW runtime only; never hide failures)
  useEffect(() => {
    if (authStatus !== 'authenticated' || runtimeEnv !== 'sgw') return;

    let timerId: number | null = null;

    const runTick = () => {
      if (document.hidden) return;
      void postPresenceHeartbeat({ runtimeEnv: 'sgw' });
      void fetchPresence({ runtimeEnv: 'sgw' })
        .then((res) => {
          if (res.status === 'ok') {
            setPresenceEntries(res.entries);
            setSyncDisconnected(false);
            setSyncErrorCode(null);
            setLastSyncedAtMs(Date.now());
          } else if (res.status === 'unauthenticated') {
            window.location.replace(SGW_LOGIN_REDIRECT_URL);
          } else {
            setSyncDisconnected(true);
            setSyncErrorCode(res.errorCode);
            setClockNowMs(Date.now());
          }
        })
        .catch(() => {
          setSyncDisconnected(true);
          setSyncErrorCode('network_offline');
          setClockNowMs(Date.now());
        });
    };

    const startPolling = () => {
      if (timerId !== null) window.clearInterval(timerId);
      timerId = window.setInterval(runTick, PRESENCE_POLL_MS);
    };

    const handleVisibility = () => {
      if (document.hidden) {
        if (timerId !== null) {
          window.clearInterval(timerId);
          timerId = null;
        }
      } else {
        runTick();
        startPolling();
      }
    };

    startPolling();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (timerId !== null) window.clearInterval(timerId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [authStatus, runtimeEnv]);

  const handlePortalNavigate = useCallback(
    (portalId: PortalBuildingSpec['id']) => {
      if (isPreviewMode) {
        showPreviewBlockedToast(PORTAL_LABEL[portalId]);
        return;
      }
      if (portalId === 'talk') navigateSafely(SGW_PORTAL_LINKS.talkHome);
      else if (portalId === 'nas') navigateSafely(SGW_PORTAL_LINKS.nas);
      else if (portalId === 'bmail') navigateSafely(SGW_PORTAL_LINKS.bmail);
      else if (portalId === 'admin') navigateSafely(SGW_PORTAL_LINKS.admin);
    },
    [isPreviewMode, showPreviewBlockedToast],
  );

  // Keep 3D canvas mounted while in 3D mode OR while waiting for `webglcontextrestored`.
  // Dynamically imports Three.js + HarborSceneController in the background so the initial screen
  // (auth gate, HUD, 2D list) renders immediately with zero Three.js in the entry bundle.
  const shouldKeep3DMounted =
    authStatus === 'authenticated' &&
    webglSupported &&
    (webglState.viewMode === '3d' ||
      (webglState.contextHealth === 'lost' && webglState.fallbackReason === 'context_lost'));

  useEffect(() => {
    if (!shouldKeep3DMounted) {
      if (sceneRef.current) {
        sceneRef.current.dispose();
        sceneRef.current = null;
      }
      setSceneReady3D(false);
      setSceneLoading3D(false);
      setLabels([]);
      return;
    }

    let cancelled = false;
    let mountedController: HarborSceneHandle | null = null;
    setSceneLoading3D(true);
    setSceneReady3D(false);

    void loadHarborSceneModule()
      .then(({ HarborSceneController }) => {
        if (cancelled) return;
        const container = canvasContainerRef.current;
        if (!container) return;

        const controller = new HarborSceneController(
          container,
          {
            onShipClicked: (projectId, screenPos) => {
              if (shipsByIdRef.current.has(projectId)) {
                setProjectSession((prev) =>
                  transitionProjectSessionState(prev, {
                    type: 'OPEN_RADIAL',
                    target: { kind: 'ship', targetId: projectId, anchor: screenPos },
                  }),
                );
              }
            },
            onDecorativeShipClicked: (ship, screenPos) => {
              setProjectSession((prev) =>
                transitionProjectSessionState(prev, {
                  type: 'OPEN_RADIAL',
                  target: { kind: 'decorative-ship', targetId: ship.id, anchor: screenPos },
                }),
              );
            },
            onPersonClicked: (sub, screenPos) => {
              if (peopleBySubRef.current.has(sub)) {
                setProjectSession((prev) =>
                  transitionProjectSessionState(prev, {
                    type: 'OPEN_RADIAL',
                    target: { kind: 'person', targetId: sub, anchor: screenPos },
                  }),
                );
              }
            },
            onPortalClicked: (portalId) => {
              handlePortalNavigate(portalId);
            },
            onLabelsUpdated: (nextLabels) => {
              setLabels(nextLabels);
            },
            onPlayerPoseUpdated: (pose) => {
              setPlayerPose((prev) => {
                if (Math.hypot(prev.x - pose.x, prev.z - pose.z) < 0.08) return prev;
                return pose;
              });
            },
            onCameraTargetUpdated: (target) => {
              setCameraWorldTarget((prev) => {
                if (Math.hypot(prev.x - target.x, prev.z - target.z) < 0.25) return prev;
                return target;
              });
            },
            onRenderMetricsUpdated: (metrics) => {
              if (import.meta.env.DEV) {
                setRenderMetrics(metrics);
              }
            },
            onQualityAutoDowngraded: (nextTier) => {
              setQualityTier(nextTier);
              showToast('프레임 안정화를 위해 3D 그래픽 품질을 보통(중)으로 조정했습니다.');
            },
            onContextLost: () => {
              setProjectSession((prev) =>
                transitionProjectSessionState(prev, { type: 'CLOSE_RADIAL' }),
              );
              setWebglState((prev) =>
                transitionWebGLViewState(prev, { type: 'CONTEXT_LOST' }),
              );
            },
            onContextRestored: () => {
              setWebglState((prev) =>
                transitionWebGLViewState(prev, { type: 'CONTEXT_RESTORED' }),
              );
            },
          },
          {
            qualityTier: qualityTierRef.current,
            userSelectedQuality: userSelectedQualityRef.current,
            lowSpec: qualityTierRef.current === 'low',
            reducedMotion: reducedMotionRef.current,
            darkTheme,
            shipDisplayPrefs: shipDisplayPrefsRef.current,
          },
        );

        mountedController = controller;
        sceneRef.current = controller;
        controller.setProjects(Array.from(shipsByIdRef.current.values()));
        controller.setPeople(Array.from(peopleBySubRef.current.values()));
        controller.setShipDisplayPrefs(shipDisplayPrefsRef.current);
        setSceneLoading3D(false);
        setSceneReady3D(true);
      })
      .catch(() => {
        if (cancelled) return;
        setSceneLoading3D(false);
        setSceneReady3D(false);
        setWebglState((prev) => transitionWebGLViewState(prev, { type: 'LOAD_FAILED' }));
      });

    return () => {
      cancelled = true;
      if (mountedController) {
        mountedController.dispose();
        if (sceneRef.current === mountedController) {
          sceneRef.current = null;
        }
      }
      setSceneReady3D(false);
      setSceneLoading3D(false);
    };
  }, [shouldKeep3DMounted, webglState.retryNonce, handlePortalNavigate, showToast]);

  // Sync dynamic ships, people, quality tier, display prefs, reduced motion, theme into 3D scene
  useEffect(() => {
    sceneRef.current?.setProjects(mappedShips);
  }, [mappedShips]);

  useEffect(() => {
    sceneRef.current?.setPeople(mappedPeople);
  }, [mappedPeople]);

  useEffect(() => {
    sceneRef.current?.setQualityTier(qualityTier, userSelectedQuality);
  }, [qualityTier, userSelectedQuality]);

  useEffect(() => {
    sceneRef.current?.setShipDisplayPrefs(shipDisplayPrefs);
  }, [shipDisplayPrefs]);

  useEffect(() => {
    sceneRef.current?.setReducedMotion(reducedMotion);
  }, [reducedMotion]);

  useEffect(() => {
    sceneRef.current?.setThemeMode(darkTheme);
  }, [darkTheme]);

  // Dev-only inspection hook for automated visual & performance QA (stripped in prod build)
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const win = window as unknown as Record<string, unknown>;
    win.__METASGW_QA__ = {
      getMetrics: () => sceneRef.current?.getRenderMetrics() ?? null,
      setQualityTier: (tier: QualityTier) => {
        setUserSelectedQuality(true);
        setQualityTier(tier);
        sceneRef.current?.setQualityTier(tier, true);
      },
      setThemeMode: (dark: boolean) => {
        setDarkTheme(dark);
        sceneRef.current?.setThemeMode(dark);
      },
      panTo: (x: number, z: number) => {
        sceneRef.current?.panCameraToWorld(x, z);
      },
      returnHome: () => {
        sceneRef.current?.returnToHomeHarbor();
      },
      openShipPopup: (shipId: string) => {
        if (shipsByIdRef.current.has(shipId)) {
          setProjectSession((prev) =>
            transitionProjectSessionState(prev, {
              type: 'OPEN_RADIAL',
              target: { kind: 'ship', targetId: shipId, anchor: { x: 640, y: 400 } },
            }),
          );
        } else if (decorativeById.has(shipId)) {
          setProjectSession((prev) =>
            transitionProjectSessionState(prev, {
              type: 'OPEN_RADIAL',
              target: { kind: 'decorative-ship', targetId: shipId, anchor: { x: 640, y: 400 } },
            }),
          );
        }
      },
      closePopup: () => {
        setProjectSession((prev) =>
          transitionProjectSessionState(prev, { type: 'CLOSE_RADIAL' }),
        );
      },
      boardShip: (shipId: string) => startBoardingShip(shipId),
      openReport: (shipId?: string) => {
        const nextId = shipId ?? hubTargetProjectId;
        if (nextId) setReportModalProjectId(nextId);
      },
      closeReport: () => setReportModalProjectId(null),
      renameShip: (shipId: string, name: string) => handleRenameShip(shipId, name),
      rotateShipStep: (shipId: string, steps: number) => handleRotateShipStep(shipId, steps),
      snapShipParallel: (shipId: string) => handleSnapShipParallel(shipId),
    };
    return () => {
      delete win.__METASGW_QA__;
    };
  }, [
    decorativeById,
    hubTargetProjectId,
    startBoardingShip,
    handleRenameShip,
    handleRotateShipStep,
    handleSnapShipParallel,
  ]);

  const handleSelectQualityTier = useCallback((nextTier: QualityTier) => {
    setUserSelectedQuality(true);
    setQualityTier(nextTier);
    sceneRef.current?.setQualityTier(nextTier, true);
  }, []);

  const handleToggleLowSpec = useCallback(() => {
    setUserSelectedQuality(true);
    setQualityTier((prev) => {
      const next: QualityTier = prev === 'low' ? 'high' : 'low';
      sceneRef.current?.setQualityTier(next, true);
      return next;
    });
  }, []);

  const handleCycleCamera = useCallback(() => {
    setCameraPreset((prev) => {
      const next = CAMERA_ORDER[(CAMERA_ORDER.indexOf(prev) + 1) % CAMERA_ORDER.length];
      sceneRef.current?.setCameraPreset(next);
      return next;
    });
  }, []);

  const handleLogout = useCallback(async () => {
    if (isPreviewMode) {
      showPreviewBlockedToast('SGW 로그아웃');
      return;
    }
    await postAuthLogout({ runtimeEnv });
    window.location.replace('/');
  }, [isPreviewMode, runtimeEnv, showPreviewBlockedToast]);

  const handleSelectShipFromUi = useCallback(
    (ship: HarborShip) => {
      startBoardingShip(ship.id);
    },
    [startBoardingShip],
  );

  const handleFocusPerson3D = useCallback((sub: string) => {
    sceneRef.current?.focusPerson(sub);
  }, []);

  const handleSelectPersonFromDrawer = useCallback((person: HarborPerson) => {
    setPeopleDrawerOpen(false);
    setProjectSession((prev) =>
      transitionProjectSessionState(prev, {
        type: 'OPEN_RADIAL',
        target: {
          kind: 'person',
          targetId: person.sub,
          anchor: {
            x: typeof window !== 'undefined' ? Math.round(window.innerWidth * 0.5) : 640,
            y: typeof window !== 'undefined' ? Math.round(window.innerHeight * 0.45) : 360,
          },
        },
      }),
    );
  }, []);

  const handleRetry3D = useCallback(() => {
    setProjectSession((prev) =>
      transitionProjectSessionState(prev, { type: 'CLOSE_RADIAL' }),
    );
    setWebglState((prev) => transitionWebGLViewState(prev, { type: 'RETRY_3D' }));
  }, []);

  const handleToggleViewMode = useCallback((next: '3d' | '2d') => {
    setProjectSession((prev) =>
      transitionProjectSessionState(prev, { type: 'CLOSE_RADIAL' }),
    );
    setWebglState((prev) =>
      transitionWebGLViewState(prev, { type: 'SET_VIEW_MODE', next }),
    );
  }, []);

  const handleLabelClick = useCallback(
    (label: ProjectedLabel) => {
      if (label.id.startsWith('ship:')) {
        const id = label.id.slice(5);
        if (shipsByIdRef.current.has(id)) {
          setProjectSession((prev) =>
            transitionProjectSessionState(prev, {
              type: 'OPEN_RADIAL',
              target: { kind: 'ship', targetId: id, anchor: { x: label.x, y: label.y } },
            }),
          );
        }
      } else if (label.id.startsWith('deco:') || label.id.startsWith('deco-ship:')) {
        const id = label.id.startsWith('deco:') ? label.id.slice(5) : label.id.slice(10);
        if (decorativeById.has(id)) {
          setProjectSession((prev) =>
            transitionProjectSessionState(prev, {
              type: 'OPEN_RADIAL',
              target: { kind: 'decorative-ship', targetId: id, anchor: { x: label.x, y: label.y } },
            }),
          );
        }
      } else if (label.id.startsWith('person:')) {
        const sub = label.id.slice(7);
        if (peopleBySubRef.current.has(sub)) {
          setProjectSession((prev) =>
            transitionProjectSessionState(prev, {
              type: 'OPEN_RADIAL',
              target: { kind: 'person', targetId: sub, anchor: { x: label.x, y: label.y } },
            }),
          );
        }
      } else if (label.id.startsWith('portal:')) {
        const portalId = label.id.slice(7) as PortalBuildingSpec['id'];
        handlePortalNavigate(portalId);
      }
    },
    [decorativeById, handlePortalNavigate],
  );

  const handleTogglePeopleDrawer = useCallback(() => {
    setPeopleDrawerOpen((prev) => {
      const next = !prev;
      if (next && !isDesktopViewport()) {
        setMinimapOpen(false);
      }
      return next;
    });
  }, []);

  const handleToggleMinimap = useCallback(() => {
    setMinimapOpen((prev) => {
      const next = !prev;
      if (next && !isDesktopViewport()) {
        setPeopleDrawerOpen(false);
      }
      return next;
    });
  }, []);

  const onlineCount = useMemo(
    () => mappedPeople.filter((p) => p.online).length,
    [mappedPeople],
  );

  const nearbyBoardableShip = useMemo(() => {
    if (boardingState.phase !== 'harbor' || !boardingState.nearbyShipId) return null;
    return shipsById.get(boardingState.nearbyShipId) ?? null;
  }, [boardingState, shipsById]);

  const activeRadialShipId =
    radialTarget?.kind === 'ship'
      ? radialTarget.ship.id
      : radialTarget?.kind === 'decorative-ship'
        ? radialTarget.ship.id
        : null;
  const activeRadialCustomName = activeRadialShipId
    ? shipDisplayPrefs[activeRadialShipId]?.customName
    : undefined;
  const activeRadialYawDeg = activeRadialShipId
    ? getShipCurrentYawDeg(activeRadialShipId, shipDisplayPrefs)
    : undefined;

  if (authStatus !== 'authenticated' || !currentUser) {
    return (
      <AuthGateOverlay
        status={authStatus === 'authenticated' ? 'loading' : authStatus}
        errorCode={authErrorCode}
        message={authMessage}
        onRetry={() => {
          void bootstrapSession();
        }}
      />
    );
  }

  return (
    <div className={`relative min-h-screen w-full ${darkTheme ? 'dark' : ''} bg-slate-950`}>
      <HudTopBar
        user={currentUser}
        runtimeEnv={runtimeEnv}
        viewMode={viewMode}
        webglSupported={webglSupported}
        webglContextLost={webglContextLost}
        lowSpecMode={lowSpecMode}
        qualityTier={qualityTier}
        darkTheme={darkTheme}
        cameraPreset={cameraPreset}
        onlineCount={onlineCount}
        projectCount={mappedShips.length}
        syncDisconnected={syncDisconnected}
        syncErrorCode={syncErrorCode}
        lastSyncedAtMs={lastSyncedAtMs}
        nowMs={clockNowMs}
        renderMetrics={renderMetrics}
        showDebugMetrics={import.meta.env.DEV}
        onRetrySync={() => {
          void Promise.all([loadDirectoryAndPresence(), loadProjects(true)]);
        }}
        onRetry3D={handleRetry3D}
        onToggleViewMode={handleToggleViewMode}
        onToggleLowSpec={handleToggleLowSpec}
        onSelectQualityTier={handleSelectQualityTier}
        onToggleTheme={() => setDarkTheme((v) => !v)}
        onCycleCamera={handleCycleCamera}
        onZoom={(factor) => sceneRef.current?.zoomBy(factor)}
        onLogout={() => {
          void handleLogout();
        }}
        onPreviewLinkBlocked={showPreviewBlockedToast}
        hubChips={hubChips}
        hubProjectLabel={hubProjectLabel}
        hubRefreshing={hubRefreshing}
        onRefreshHub={handleRefreshHub}
        onOpenReport={
          hubTargetProjectId
            ? () => setReportModalProjectId(hubTargetProjectId)
            : undefined
        }
      />

      {shouldKeep3DMounted && (
        <div
          className={
            viewMode === '3d' && sceneReady3D
              ? 'fixed inset-0 h-dvh w-screen overflow-hidden bg-slate-950'
              : 'hidden'
          }
          aria-hidden={viewMode !== '3d' || !sceneReady3D}
        >
          <div
            ref={canvasContainerRef}
            className="block h-full w-full"
            aria-label="메타SGW 3D 항구 캔버스"
          />

          {/* Clean minimal 3D markers: tiny dot by default, short tooltip ONLY on hover (Requirements #6 & #18) */}
          {viewMode === '3d' && sceneReady3D && boardingState.phase === 'harbor' && (
            <div className="pointer-events-none fixed inset-0 z-20 overflow-hidden">
              {labels.map((label) => {
                if (!label.visible) return null;
                if (!label.showText) {
                  const dotColor =
                    label.kind === 'ship'
                      ? label.accentHex ?? '#38bdf8'
                      : label.kind === 'deco-ship'
                        ? '#fbbf24'
                        : label.kind === 'person-online'
                          ? '#34d399'
                          : label.kind === 'person-partner'
                            ? '#f59e0b'
                            : '#94a3b8';
                  return (
                    <button
                      key={label.id}
                      type="button"
                      onClick={() => handleLabelClick(label)}
                      aria-label={label.subText ? `${label.text} (${label.subText})` : label.text}
                      title={label.text}
                      style={{
                        transform: `translate3d(${Math.round(label.x)}px, ${Math.round(label.y)}px, 0) translate(-50%, -50%)`,
                      }}
                      className="pointer-events-auto absolute left-0 top-0 flex h-5 w-5 items-center justify-center rounded-full transition hover:scale-125 focus-visible:outline-2 focus-visible:outline-sky-400"
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full border border-white/90 shadow-md"
                        style={{ backgroundColor: dotColor }}
                        aria-hidden="true"
                      />
                    </button>
                  );
                }

                return (
                  <button
                    key={label.id}
                    type="button"
                    onClick={() => handleLabelClick(label)}
                    aria-label={label.subText ? `${label.text} (${label.subText})` : label.text}
                    style={{
                      transform: `translate3d(${Math.round(label.x)}px, ${Math.round(label.y)}px, 0) translate(-50%, -100%)`,
                    }}
                    className={`pointer-events-auto absolute left-0 top-0 inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold leading-tight shadow-md transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-sky-400 whitespace-nowrap ${
                      label.kind === 'ship'
                        ? 'border-sky-400/70 bg-slate-950/90 text-white'
                        : label.kind === 'deco-ship'
                          ? 'border-amber-400/70 bg-slate-950/90 text-amber-100'
                          : label.kind === 'portal'
                            ? 'border-slate-500/70 bg-slate-950/88 text-slate-100'
                            : label.kind === 'person-partner'
                              ? 'border-amber-400/70 bg-slate-950/90 text-amber-100'
                              : label.kind === 'person-online'
                                ? 'border-emerald-400/70 bg-slate-950/90 text-emerald-100'
                                : 'border-slate-600/70 bg-slate-950/85 text-slate-200'
                    }`}
                  >
                    {label.kind === 'person-online' && (
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" aria-hidden="true" />
                    )}
                    {(label.kind === 'ship' || label.kind === 'deco-ship') && label.accentHex && (
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: label.accentHex }}
                        aria-hidden="true"
                      />
                    )}
                    <span>{label.text}</span>
                    {label.subText && (
                      <span className="text-[10px] font-normal text-slate-300">{label.subText}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Proximity Boarding Prompt: E: 승선 / Enter */}
          {viewMode === '3d' &&
            sceneReady3D &&
            nearbyBoardableShip &&
            boardingState.phase === 'harbor' &&
            !selectedPerson &&
            !radialTarget &&
            !peopleDrawerOpen && (
              <div className="pointer-events-none fixed inset-x-0 bottom-28 sm:bottom-20 z-30 flex justify-center px-3">
                <button
                  type="button"
                  data-testid="boarding-proximity-prompt"
                  onClick={() => startBoardingShip(nearbyBoardableShip.id)}
                  aria-label={`${shipDisplayPrefs[nearbyBoardableShip.id]?.customName ?? nearbyBoardableShip.name} (${nearbyBoardableShip.code}) 승선하기 (단축키 E 또는 Enter)`}
                  className="pointer-events-auto inline-flex items-center gap-2 rounded-xl border border-sky-400/70 bg-sky-700 px-4 py-2 text-xs sm:text-sm font-bold text-white shadow-2xl hover:bg-sky-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
                >
                  <Anchor className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    E: 승선 / Enter —{' '}
                    {shipDisplayPrefs[nearbyBoardableShip.id]?.customName ?? nearbyBoardableShip.name} (
                    {nearbyBoardableShip.code})
                  </span>
                </button>
              </div>
            )}

          {viewMode === '3d' &&
            sceneReady3D &&
            boardingState.phase === 'harbor' &&
            (projectsState === 'unmapped' || projectsState === 'unavailable') && (
              <div className="pointer-events-none fixed inset-x-0 top-24 sm:top-16 z-30 flex justify-center px-3">
                <div
                  role="status"
                  data-testid={
                    projectsState === 'unmapped'
                      ? 'harbor-projects-unmapped-banner'
                      : 'harbor-projects-unavailable-banner'
                  }
                  className="pointer-events-auto inline-flex flex-wrap items-center justify-center gap-2.5 rounded-xl border border-sky-400/50 bg-slate-950/92 px-3.5 py-2 text-xs font-semibold text-slate-100 shadow-xl"
                >
                  <span>
                    {projectsState === 'unmapped' ? SEDMS_UNMAPPED_MESSAGE : SEDMS_UNAVAILABLE_MESSAGE}
                  </span>
                  {projectsState === 'unmapped' && (
                    <a
                      href={isSafeNavigationUrl(SEDMS_PROJECTS_LOGIN_URL) ? SEDMS_PROJECTS_LOGIN_URL : '/'}
                      onClick={(e) => {
                        if (isPreviewMode) {
                          e.preventDefault();
                          showPreviewBlockedToast('SEDMS 열기');
                        }
                      }}
                      aria-label="SEDMS 열기"
                      className="inline-flex min-h-[32px] items-center gap-1 rounded-lg bg-sky-700 px-3 py-1 text-xs font-bold text-white hover:bg-sky-600 focus-visible:outline-2 focus-visible:outline-sky-300"
                    >
                      <span>SEDMS 열기</span>
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  )}
                </div>
              </div>
            )}

          {viewMode === '3d' && sceneReady3D && (
            <Suspense fallback={null}>
              <HarborMiniMap
                open={minimapOpen && boardingState.phase === 'harbor'}
                ships={mappedShips}
                people={mappedPeople}
                playerPose={playerPose}
                cameraWorldTarget={cameraWorldTarget}
                shipDisplayPrefs={shipDisplayPrefs}
                activeShipId={projectSession.minimapSelectedShipId ?? nearbyBoardableShip?.id ?? null}
                onSelectShip={handleSelectShipFromUi}
                onWalkToQuay={(x, z) => sceneRef.current?.walkToPoint(x, z)}
                onPanToWorld={(x, z) => sceneRef.current?.panCameraToWorld(x, z)}
                onReturnHome={() => sceneRef.current?.returnToHomeHarbor()}
                onClose={() => setMinimapOpen(false)}
              />

              <PeopleFinderDrawer
                open={peopleDrawerOpen}
                runtimeEnv={runtimeEnv}
                people={mappedPeople}
                onClose={() => setPeopleDrawerOpen(false)}
                onFocusPerson={handleFocusPerson3D}
                onSelectPerson={handleSelectPersonFromDrawer}
                onPreviewLinkBlocked={showPreviewBlockedToast}
              />

              <BottomControlDock
                ships={mappedShips}
                projectsState={projectsState}
                projectsMessage={projectsMessage}
                projectsErrorCode={projectsErrorCode}
                runtimeEnv={runtimeEnv}
                onlineCount={onlineCount}
                totalPeopleCount={mappedPeople.length}
                peopleDrawerOpen={peopleDrawerOpen}
                minimapOpen={minimapOpen}
                boardedShipId={activeBoardedShip?.id ?? null}
                onSelectShip={handleSelectShipFromUi}
                onRefreshProjects={() => {
                  if (isPreviewMode) {
                    showPreviewBlockedToast('실시간 프로젝트 새로고침');
                  } else {
                    void loadProjects(true);
                  }
                }}
                onTogglePeopleDrawer={handleTogglePeopleDrawer}
                onToggleMinimap={handleToggleMinimap}
                onSwitchTo2D={() => handleToggleViewMode('2d')}
                onPreviewLinkBlocked={showPreviewBlockedToast}
              />
            </Suspense>
          )}
        </div>
      )}

      {(viewMode === '2d' || !webglSupported || !sceneReady3D) && (
        <AccessibleListView
          user={currentUser}
          runtimeEnv={runtimeEnv}
          ships={mappedShips}
          projectsState={projectsState}
          projectsMessage={projectsMessage}
          projectsErrorCode={projectsErrorCode}
          people={mappedPeople}
          webglSupported={webglSupported}
          webglContextLost={webglContextLost}
          webglFallbackReason={webglState.fallbackReason}
          sceneLoading3D={sceneLoading3D}
          onRetry3D={handleRetry3D}
          onRefreshProjects={() => {
            if (isPreviewMode) {
              showPreviewBlockedToast('실시간 프로젝트 새로고침');
            } else {
              void loadProjects(true);
            }
          }}
          onSelectShip={handleSelectShipFromUi}
          onSelectPerson={(person) =>
            setProjectSession((prev) =>
              transitionProjectSessionState(prev, { type: 'SELECT_PERSON', sub: person.sub }),
            )
          }
          onPreviewLinkBlocked={showPreviewBlockedToast}
        />
      )}

      {/* Single Unified Entity Action Popup (Ship / Decorative Ship / Person — Requirements #6, #15, #18, #19) */}
      <Suspense fallback={null}>
        {radialTarget && (
          <RadialActionMenu
            target={radialTarget}
            runtimeEnv={runtimeEnv}
            hubRegistry={hubRegistry}
            customShipName={activeRadialCustomName}
            currentYawDeg={activeRadialYawDeg}
            rotationWarning={rotationWarning}
            onBoardShip={startBoardingShip}
            onFocusPerson3D={viewMode === '3d' ? handleFocusPerson3D : undefined}
            onHighlightShip={(shipId) => sceneRef.current?.setSelectedShipId(shipId)}
            onOpenReport={(shipId) => setReportModalProjectId(shipId)}
            onToast={showToast}
            onRenameShip={handleRenameShip}
            onRotateShipStep={handleRotateShipStep}
            onRotateShipAbsolute={handleRotateShipAbsolute}
            onSnapShipParallel={handleSnapShipParallel}
            onPreviewLinkBlocked={showPreviewBlockedToast}
            onClose={() =>
              setProjectSession((prev) =>
                transitionProjectSessionState(prev, { type: 'CLOSE_RADIAL' }),
              )
            }
          />
        )}

        {activeBoardedShip && (
          <OnboardPanel
            key={`${activeBoardedShip.id}:${projectSession.projectSessionEpoch}`}
            ship={activeBoardedShip}
            customDisplayName={shipDisplayPrefs[activeBoardedShip.id]?.customName}
            phase={boardingState.phase}
            runtimeEnv={runtimeEnv}
            hubRegistry={hubRegistry}
            onHighlightShip={(shipId) => sceneRef.current?.setSelectedShipId(shipId)}
            onOpenReport={(shipId) => setReportModalProjectId(shipId)}
            onToast={showToast}
            onPreviewLinkBlocked={showPreviewBlockedToast}
            onDisembark={handleDisembark}
          />
        )}

        {reportModalProjectId && (
          <ReportModal
            open={Boolean(reportModalProjectId)}
            projectId={reportModalProjectId}
            projectName={
              shipsById.get(reportModalProjectId)
                ? shipDisplayPrefs[reportModalProjectId]?.customName ||
                  shipsById.get(reportModalProjectId)?.name
                : reportModalProjectId
            }
            runtimeEnv={runtimeEnv}
            registry={hubRegistry}
            onClose={() => setReportModalProjectId(null)}
            onPreviewLinkBlocked={showPreviewBlockedToast}
            onToast={showToast}
          />
        )}
      </Suspense>

      {/* PersonActionModal only used from 2D list view so 3D never stacks 2 overlapping popups */}
      <PersonActionModal
        person={viewMode === '2d' ? selectedPerson : null}
        runtimeEnv={runtimeEnv}
        canFocus3D={false}
        onFocus3D={handleFocusPerson3D}
        onPreviewLinkBlocked={showPreviewBlockedToast}
        onClose={() =>
          setProjectSession((prev) =>
            transitionProjectSessionState(prev, { type: 'SELECT_PERSON', sub: null }),
          )
        }
      />

      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          data-testid="preview-sgw-only-toast"
          className="fixed left-1/2 top-32 sm:top-24 z-50 flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-2 rounded-xl border border-amber-400/60 bg-slate-950/96 px-4 py-2.5 text-xs font-semibold text-amber-100 shadow-2xl"
        >
          <Info className="h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
          <span className="truncate">{toastMessage}</span>
        </div>
      )}
    </div>
  );
}

export default App;
