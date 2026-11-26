import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Anchor, Info } from 'lucide-react';
import {
  BOARDING_TRANSITION_MS,
  createInitialBoardingState,
  findNearestBoardableShip,
  transitionBoardingState,
  type BoardingState,
} from './boardingState';
import { AccessibleListView } from './components/AccessibleListView';
import { BottomControlDock } from './components/BottomControlDock';
import { HarborMiniMap } from './components/HarborMiniMap';
import {
  AuthGateOverlay,
  PersonActionModal,
} from './components/HarborOverlays';
import { HudTopBar } from './components/HudTopBar';
import { OnboardPanel } from './components/OnboardPanel';
import { PeopleFinderDrawer } from './components/PeopleFinderDrawer';
import { RadialActionMenu, type RadialTarget } from './components/RadialActionMenu';
import type { PortalBuildingSpec } from './core/navMeshEngine';
import {
  navigateSafely,
  SGW_LOGIN_REDIRECT_URL,
  SGW_PORTAL_LINKS,
} from './deepLink';
import {
  detectDeviceProfile,
  subscribeReducedMotion,
} from './deviceProfile';
import {
  mapEmployeesToHarborPeople,
  mapProjectsToHarborShips,
  type HarborPerson,
  type HarborShip,
} from './mapping';
import {
  detectRuntimeEnv,
  PREVIEW_SGW_ONLY_TOAST,
} from './runtimeEnv';
import {
  HarborSceneController,
  type CameraPreset,
  type ProjectedLabel,
  type RenderMetrics,
} from './scene/HarborScene';
import {
  fetchAuthMe,
  fetchEmployees,
  fetchPresence,
  fetchSedmsProjects,
  postAuthLogout,
  postPresenceHeartbeat,
  type SedmsProject,
  type SgwEmployee,
  type SgwPresenceEntry,
  type SgwUser,
} from './sgwAdapter';

type AuthGateStatus =
  | 'loading'
  | 'authenticated'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'error';

type ProjectsLoadState = 'loading' | 'ready' | 'pending' | 'forbidden' | 'error';

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

export function App() {
  const runtimeEnv = useMemo(() => detectRuntimeEnv(), []);
  const isPreviewMode = runtimeEnv === 'preview';

  const deviceProfile = useMemo(() => detectDeviceProfile(), []);
  const webglSupported = deviceProfile.webglSupported;
  const [viewMode, setViewMode] = useState<'3d' | '2d'>(() => deviceProfile.initialViewMode);
  const [lowSpecMode, setLowSpecMode] = useState<boolean>(() => deviceProfile.recommendLowSpec);
  const [reducedMotion, setReducedMotion] = useState<boolean>(() => deviceProfile.reducedMotion);
  const [darkTheme, setDarkTheme] = useState<boolean>(false);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('harbor');

  const [authStatus, setAuthStatus] = useState<AuthGateStatus>('loading');
  const [authMessage, setAuthMessage] = useState<string>('SGW 세션 상태를 확인하고 있습니다...');
  const [currentUser, setCurrentUser] = useState<SgwUser | null>(null);

  const [employees, setEmployees] = useState<SgwEmployee[]>([]);
  const [presenceEntries, setPresenceEntries] = useState<SgwPresenceEntry[]>([]);
  const [projects, setProjects] = useState<SedmsProject[]>([]);
  const [projectsState, setProjectsState] = useState<ProjectsLoadState>('loading');
  const [projectsMessage, setProjectsMessage] = useState<string>('');

  // Connection & sync status (never hide polling failures)
  const [syncDisconnected, setSyncDisconnected] = useState<boolean>(false);
  const [lastSyncedAtMs, setLastSyncedAtMs] = useState<number | null>(null);
  const [clockNowMs, setClockNowMs] = useState<number>(() => Date.now());

  const [labels, setLabels] = useState<ProjectedLabel[]>([]);
  const [playerPose, setPlayerPose] = useState<{ x: number; z: number; heading: number }>({
    x: 0,
    z: -10.5,
    heading: 0,
  });
  const [boardingState, setBoardingState] = useState<BoardingState>(createInitialBoardingState);
  const [selectedPerson, setSelectedPerson] = useState<HarborPerson | null>(null);
  const [radialTarget, setRadialTarget] = useState<RadialTarget | null>(null);
  const [renderMetrics, setRenderMetrics] = useState<RenderMetrics | null>(null);
  const [peopleDrawerOpen, setPeopleDrawerOpen] = useState<boolean>(false);
  const [minimapOpen, setMinimapOpen] = useState<boolean>(() => isDesktopViewport());
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<HarborSceneController | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const boardingTimerRef = useRef<number | null>(null);
  const reducedMotionRef = useRef<boolean>(reducedMotion);

  useEffect(() => {
    reducedMotionRef.current = reducedMotion;
  }, [reducedMotion]);

  const showPreviewBlockedToast = useCallback((featureLabel: string) => {
    setToastMessage(`${PREVIEW_SGW_ONLY_TOAST} — ${featureLabel}`);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, TOAST_DURATION_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
      if (boardingTimerRef.current !== null) window.clearTimeout(boardingTimerRef.current);
    };
  }, []);

  useEffect(() => {
    return subscribeReducedMotion((nextReduced) => {
      setReducedMotion(nextReduced);
      if (nextReduced) {
        setLowSpecMode(true);
      }
    });
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

  const peopleBySubRef = useRef<Map<string, HarborPerson>>(new Map());
  const shipsByIdRef = useRef<Map<string, HarborShip>>(new Map());
  const mappedShipsRef = useRef<HarborShip[]>(mappedShips);

  useEffect(() => {
    peopleBySubRef.current = new Map(mappedPeople.map((p) => [p.sub, p]));
  }, [mappedPeople]);

  useEffect(() => {
    shipsByIdRef.current = new Map(mappedShips.map((s) => [s.id, s]));
    mappedShipsRef.current = mappedShips;
  }, [mappedShips]);

  // Boarding flow helpers
  const startBoardingShip = useCallback((shipId: string) => {
    if (!shipsByIdRef.current.has(shipId)) return;
    if (boardingTimerRef.current !== null) {
      window.clearTimeout(boardingTimerRef.current);
      boardingTimerRef.current = null;
    }

    const isReduced = reducedMotionRef.current;
    setSelectedPerson(null);
    setRadialTarget(null);
    setPeopleDrawerOpen(false);
    setBoardingState((prev) =>
      transitionBoardingState(prev, {
        type: 'REQUEST_BOARD',
        shipId,
        reducedMotion: isReduced,
      }),
    );

    sceneRef.current?.boardShip(shipId, isReduced ? 0 : BOARDING_TRANSITION_MS);

    if (!isReduced) {
      boardingTimerRef.current = window.setTimeout(() => {
        setBoardingState((prev) =>
          transitionBoardingState(prev, { type: 'COMPLETE_BOARDING' }),
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
    setBoardingState((prev) => transitionBoardingState(prev, { type: 'DISEMBARK' }));
    sceneRef.current?.disembarkToHarbor(reducedMotionRef.current ? 0 : 450);
  }, []);

  // Update proximity prompt whenever avatar moves or ships change
  useEffect(() => {
    const nearest = findNearestBoardableShip(playerPose, mappedShips);
    setBoardingState((prev) =>
      transitionBoardingState(prev, {
        type: 'PROXIMITY_CHANGED',
        nearbyShipId: nearest?.id ?? null,
      }),
    );
  }, [playerPose, mappedShips]);

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
        if (radialTarget) {
          setRadialTarget(null);
          return;
        }
        handleDisembark();
        setSelectedPerson(null);
        setPeopleDrawerOpen(false);
        return;
      }

      if (inInput) return;

      // Ignore Enter when focused on a button/link/minimap so native activation runs cleanly
      const isInteractiveFocus =
        target &&
        (target.tagName === 'BUTTON' ||
          target.tagName === 'A' ||
          target.getAttribute('role') === 'application');

      if (
        (e.key === 'e' || e.key === 'E' || (e.key === 'Enter' && !isInteractiveFocus)) &&
        boardingState.phase === 'harbor' &&
        boardingState.nearbyShipId &&
        !selectedPerson &&
        !radialTarget
      ) {
        e.preventDefault();
        startBoardingShip(boardingState.nearbyShipId);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [boardingState, selectedPerson, radialTarget, startBoardingShip, handleDisembark]);

  const loadProjects = useCallback(
    async (forceRefresh = false) => {
      setProjectsState('loading');
      const res = await fetchSedmsProjects({ runtimeEnv, forceRefresh });
      if (res.status === 'ready') {
        setProjects(res.projects);
        setProjectsState('ready');
        setProjectsMessage('');
        setSyncDisconnected(false);
        setLastSyncedAtMs(Date.now());
      } else if (res.status === 'pending') {
        setProjects([]);
        setProjectsState('pending');
        setProjectsMessage(res.message);
        setSyncDisconnected(false);
        setLastSyncedAtMs(Date.now());
      } else if (res.status === 'forbidden') {
        setProjects([]);
        setProjectsState('forbidden');
        setProjectsMessage(res.message);
      } else if (res.status === 'unauthenticated') {
        window.location.replace(SGW_LOGIN_REDIRECT_URL);
      } else {
        setProjects([]);
        setProjectsState('error');
        setProjectsMessage(res.message);
        setSyncDisconnected(true);
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
      setLastSyncedAtMs(Date.now());
    } else if (presRes.status === 'error') {
      setSyncDisconnected(true);
      setClockNowMs(Date.now());
    }
  }, [runtimeEnv]);

  const bootstrapSession = useCallback(async () => {
    setAuthStatus('loading');
    setAuthMessage('SGW 세션 상태를 확인하고 있습니다...');
    const authRes = await fetchAuthMe({ runtimeEnv });

    if (authRes.status === 'authenticated') {
      setCurrentUser(authRes.user);
      setAuthStatus('authenticated');
      await Promise.all([loadDirectoryAndPresence(), loadProjects(false)]);
      if (runtimeEnv === 'sgw') {
        void postPresenceHeartbeat({ runtimeEnv });
      }
      return;
    }

    if (authRes.status === 'unauthenticated') {
      setAuthStatus('unauthenticated');
      setAuthMessage('SGW 로그인이 필요합니다. 로그인 화면으로 이동합니다...');
      window.location.replace(authRes.redirectUrl);
      return;
    }

    setCurrentUser(null);
    setAuthStatus(authRes.status);
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
            setLastSyncedAtMs(Date.now());
          } else if (res.status === 'unauthenticated') {
            window.location.replace(SGW_LOGIN_REDIRECT_URL);
          } else {
            setSyncDisconnected(true);
            setClockNowMs(Date.now());
          }
        })
        .catch(() => {
          setSyncDisconnected(true);
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

  // Mount & manage 3D Harbor Scene strictly when in 3D mode & authenticated
  useEffect(() => {
    if (authStatus !== 'authenticated' || viewMode !== '3d' || !webglSupported) {
      if (sceneRef.current) {
        sceneRef.current.dispose();
        sceneRef.current = null;
      }
      setLabels([]);
      return;
    }

    const container = canvasContainerRef.current;
    if (!container) return;

    const controller = new HarborSceneController(
      container,
      {
        onShipClicked: (projectId, screenPos) => {
          const ship = shipsByIdRef.current.get(projectId);
          if (ship) {
            setSelectedPerson(null);
            setRadialTarget({ kind: 'ship', ship, anchor: screenPos });
          }
        },
        onPersonClicked: (sub, screenPos) => {
          const found = peopleBySubRef.current.get(sub);
          if (found) {
            setSelectedPerson(null);
            setRadialTarget({ kind: 'person', person: found, anchor: screenPos });
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
        onRenderMetricsUpdated: (metrics) => {
          if (import.meta.env.DEV) {
            setRenderMetrics(metrics);
          }
        },
      },
      { lowSpec: lowSpecMode, reducedMotion, darkTheme },
    );

    sceneRef.current = controller;
    controller.setProjects(mappedShips);
    controller.setPeople(mappedPeople);

    return () => {
      controller.dispose();
      if (sceneRef.current === controller) {
        sceneRef.current = null;
      }
    };
  }, [authStatus, viewMode, webglSupported, handlePortalNavigate, startBoardingShip]);

  // Sync dynamic ships & people into 3D scene
  useEffect(() => {
    sceneRef.current?.setProjects(mappedShips);
  }, [mappedShips]);

  useEffect(() => {
    sceneRef.current?.setPeople(mappedPeople);
  }, [mappedPeople]);

  useEffect(() => {
    sceneRef.current?.setLowSpecMode(lowSpecMode);
  }, [lowSpecMode]);

  useEffect(() => {
    sceneRef.current?.setReducedMotion(reducedMotion);
  }, [reducedMotion]);

  useEffect(() => {
    sceneRef.current?.setThemeMode(darkTheme);
  }, [darkTheme]);

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

  const handleLabelClick = useCallback(
    (label: ProjectedLabel) => {
      if (label.id.startsWith('ship:')) {
        const id = label.id.slice(5);
        const ship = shipsByIdRef.current.get(id);
        if (ship) {
          setRadialTarget({ kind: 'ship', ship, anchor: { x: label.x, y: label.y } });
        }
      } else if (label.id.startsWith('person:')) {
        const sub = label.id.slice(7);
        const person = peopleBySubRef.current.get(sub);
        if (person) {
          setRadialTarget({ kind: 'person', person, anchor: { x: label.x, y: label.y } });
        }
      } else if (label.id.startsWith('portal:')) {
        const portalId = label.id.slice(7) as PortalBuildingSpec['id'];
        handlePortalNavigate(portalId);
      }
    },
    [handlePortalNavigate],
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

  const activeBoardedShip = useMemo(() => {
    if (boardingState.phase === 'harbor') return null;
    return mappedShips.find((s) => s.id === boardingState.shipId) ?? null;
  }, [boardingState, mappedShips]);

  const nearbyBoardableShip = useMemo(() => {
    if (boardingState.phase !== 'harbor' || !boardingState.nearbyShipId) return null;
    return mappedShips.find((s) => s.id === boardingState.nearbyShipId) ?? null;
  }, [boardingState, mappedShips]);

  if (authStatus !== 'authenticated' || !currentUser) {
    return (
      <AuthGateOverlay
        status={authStatus === 'authenticated' ? 'loading' : authStatus}
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
        lowSpecMode={lowSpecMode}
        darkTheme={darkTheme}
        cameraPreset={cameraPreset}
        onlineCount={onlineCount}
        projectCount={mappedShips.length}
        syncDisconnected={syncDisconnected}
        lastSyncedAtMs={lastSyncedAtMs}
        nowMs={clockNowMs}
        renderMetrics={renderMetrics}
        showDebugMetrics={import.meta.env.DEV}
        onRetrySync={() => {
          void Promise.all([loadDirectoryAndPresence(), loadProjects(true)]);
        }}
        onToggleViewMode={(next) => {
          if (next === '3d' && !webglSupported) return;
          setRadialTarget(null);
          setViewMode(next);
        }}
        onToggleLowSpec={() => setLowSpecMode((v) => !v)}
        onToggleTheme={() => setDarkTheme((v) => !v)}
        onCycleCamera={handleCycleCamera}
        onZoom={(factor) => sceneRef.current?.zoomBy(factor)}
        onLogout={() => {
          void handleLogout();
        }}
        onPreviewLinkBlocked={showPreviewBlockedToast}
      />

      {viewMode === '3d' && webglSupported ? (
        <div className="relative h-screen w-screen overflow-hidden">
          <div
            ref={canvasContainerRef}
            className="h-full w-full"
            aria-label="메타SGW 3D 항구 캔버스"
          />

          {/* Projected interactive 3D labels (hidden while onboard dialog is open) */}
          {boardingState.phase === 'harbor' && (
            <div className="pointer-events-none fixed inset-0 z-20 overflow-hidden">
              {labels.map((label) => {
                if (!label.visible) return null;
                if (label.y < 84 || label.y > window.innerHeight - 96) return null;
                return (
                  <button
                    key={label.id}
                    type="button"
                    onClick={() => handleLabelClick(label)}
                    aria-label={label.subText ? `${label.text} (${label.subText})` : label.text}
                    style={{
                      transform: `translate3d(${Math.round(label.x)}px, ${Math.round(label.y)}px, 0) translate(-50%, -100%)`,
                    }}
                    className={`pointer-events-auto absolute left-0 top-0 rounded-lg border px-2 py-1 text-left shadow-lg transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-sky-400 ${
                      label.kind === 'ship'
                        ? 'border-sky-400/70 bg-slate-950/94 text-white'
                        : label.kind === 'portal'
                          ? 'border-slate-500/70 bg-slate-950/92 text-slate-100'
                          : label.kind === 'person-partner'
                            ? 'border-amber-400/70 bg-slate-950/92 text-amber-100'
                            : label.kind === 'person-online'
                              ? 'border-emerald-400/70 bg-slate-950/92 text-emerald-100'
                              : 'border-slate-600/70 bg-slate-950/88 text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold leading-tight whitespace-nowrap">
                      {label.kind === 'person-online' && (
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
                      )}
                      {label.kind === 'ship' && label.accentHex && (
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: label.accentHex }}
                          aria-hidden="true"
                        />
                      )}
                      <span>{label.text}</span>
                    </div>
                    {label.subText && (
                      <div className="text-[10px] text-slate-300 whitespace-nowrap">
                        {label.subText}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Proximity Boarding Prompt: E: 승선 / Enter */}
          {nearbyBoardableShip &&
            boardingState.phase === 'harbor' &&
            !selectedPerson &&
            !peopleDrawerOpen && (
              <div className="pointer-events-none fixed inset-x-0 bottom-28 sm:bottom-20 z-30 flex justify-center px-3">
                <button
                  type="button"
                  data-testid="boarding-proximity-prompt"
                  onClick={() => startBoardingShip(nearbyBoardableShip.id)}
                  aria-label={`${nearbyBoardableShip.name} (${nearbyBoardableShip.code}) 승선하기 (단축키 E 또는 Enter)`}
                  className="pointer-events-auto inline-flex items-center gap-2 rounded-xl border border-sky-400/70 bg-sky-700 px-4 py-2 text-xs sm:text-sm font-bold text-white shadow-2xl hover:bg-sky-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
                >
                  <Anchor className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    E: 승선 / Enter — {nearbyBoardableShip.name} ({nearbyBoardableShip.code})
                  </span>
                </button>
              </div>
            )}

          <HarborMiniMap
            open={minimapOpen && boardingState.phase === 'harbor'}
            ships={mappedShips}
            people={mappedPeople}
            playerPose={playerPose}
            activeShipId={activeBoardedShip?.id ?? nearbyBoardableShip?.id ?? null}
            onSelectShip={handleSelectShipFromUi}
            onWalkToQuay={(x, z) => sceneRef.current?.walkToPoint(x, z)}
            onClose={() => setMinimapOpen(false)}
          />

          <PeopleFinderDrawer
            open={peopleDrawerOpen}
            runtimeEnv={runtimeEnv}
            people={mappedPeople}
            onClose={() => setPeopleDrawerOpen(false)}
            onFocusPerson={handleFocusPerson3D}
            onSelectPerson={(p) => setSelectedPerson(p)}
            onPreviewLinkBlocked={showPreviewBlockedToast}
          />

          <BottomControlDock
            ships={mappedShips}
            projectsState={projectsState}
            projectsMessage={projectsMessage}
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
            onSwitchTo2D={() => setViewMode('2d')}
          />
        </div>
      ) : (
        <AccessibleListView
          user={currentUser}
          runtimeEnv={runtimeEnv}
          ships={mappedShips}
          projectsState={projectsState}
          projectsMessage={projectsMessage}
          people={mappedPeople}
          webglSupported={webglSupported}
          onRefreshProjects={() => {
            if (isPreviewMode) {
              showPreviewBlockedToast('실시간 프로젝트 새로고침');
            } else {
              void loadProjects(true);
            }
          }}
          onSelectShip={handleSelectShipFromUi}
          onSelectPerson={(person) => setSelectedPerson(person)}
          onPreviewLinkBlocked={showPreviewBlockedToast}
        />
      )}

      <RadialActionMenu
        target={radialTarget}
        runtimeEnv={runtimeEnv}
        onBoardShip={startBoardingShip}
        onPreviewLinkBlocked={showPreviewBlockedToast}
        onClose={() => setRadialTarget(null)}
      />

      <OnboardPanel
        ship={activeBoardedShip}
        phase={boardingState.phase}
        runtimeEnv={runtimeEnv}
        onPreviewLinkBlocked={showPreviewBlockedToast}
        onDisembark={handleDisembark}
      />

      <PersonActionModal
        person={selectedPerson}
        runtimeEnv={runtimeEnv}
        canFocus3D={viewMode === '3d' && webglSupported}
        onFocus3D={handleFocusPerson3D}
        onPreviewLinkBlocked={showPreviewBlockedToast}
        onClose={() => setSelectedPerson(null)}
      />

      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          data-testid="preview-sgw-only-toast"
          className="fixed left-1/2 top-24 sm:top-16 z-50 flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-2 rounded-xl border border-amber-400/60 bg-slate-950/96 px-4 py-2.5 text-xs font-semibold text-amber-100 shadow-2xl"
        >
          <Info className="h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
          <span className="truncate">{toastMessage}</span>
        </div>
      )}
    </div>
  );
}

export default App;
