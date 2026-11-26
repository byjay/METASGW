import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { AccessibleListView } from './components/AccessibleListView';
import { BottomControlDock } from './components/BottomControlDock';
import {
  AuthGateOverlay,
  PersonActionModal,
  ShipBriefingModal,
} from './components/HarborOverlays';
import { HudTopBar } from './components/HudTopBar';
import { PeopleFinderDrawer } from './components/PeopleFinderDrawer';
import type { PortalBuildingSpec } from './core/navMeshEngine';
import {
  navigateSafely,
  SGW_LOGIN_REDIRECT_URL,
  SGW_PORTAL_LINKS,
} from './deepLink';
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
  isWebGLAvailable,
  type CameraPreset,
  type ProjectedLabel,
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

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function App() {
  const runtimeEnv = useMemo(() => detectRuntimeEnv(), []);
  const isPreviewMode = runtimeEnv === 'preview';

  const webglSupported = useMemo(() => isWebGLAvailable(), []);
  const [viewMode, setViewMode] = useState<'3d' | '2d'>(() => (webglSupported ? '3d' : '2d'));
  const [lowSpecMode, setLowSpecMode] = useState<boolean>(() => prefersReducedMotion());
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

  const [labels, setLabels] = useState<ProjectedLabel[]>([]);
  const [selectedShip, setSelectedShip] = useState<HarborShip | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<HarborPerson | null>(null);
  const [peopleDrawerOpen, setPeopleDrawerOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<HarborSceneController | null>(null);
  const toastTimerRef = useRef<number | null>(null);

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
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

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

  useEffect(() => {
    peopleBySubRef.current = new Map(mappedPeople.map((p) => [p.sub, p]));
  }, [mappedPeople]);

  useEffect(() => {
    shipsByIdRef.current = new Map(mappedShips.map((s) => [s.id, s]));
  }, [mappedShips]);

  const loadProjects = useCallback(
    async (forceRefresh = false) => {
      setProjectsState('loading');
      const res = await fetchSedmsProjects({ runtimeEnv, forceRefresh });
      if (res.status === 'ready') {
        setProjects(res.projects);
        setProjectsState('ready');
        setProjectsMessage('');
      } else if (res.status === 'pending') {
        setProjects([]);
        setProjectsState('pending');
        setProjectsMessage(res.message);
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

  // 12-second presence polling + heartbeat (SGW runtime only; paused when tab is hidden)
  useEffect(() => {
    if (authStatus !== 'authenticated' || runtimeEnv !== 'sgw') return;

    let timerId: number | null = null;

    const runTick = () => {
      if (document.hidden) return;
      void postPresenceHeartbeat({ runtimeEnv: 'sgw' });
      void fetchPresence({ runtimeEnv: 'sgw' }).then((res) => {
        if (res.status === 'ok') {
          setPresenceEntries(res.entries);
        } else if (res.status === 'unauthenticated') {
          window.location.replace(SGW_LOGIN_REDIRECT_URL);
        }
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
        onShipClicked: (projectId) => {
          const found = shipsByIdRef.current.get(projectId);
          if (found) setSelectedShip(found);
        },
        onPersonClicked: (sub) => {
          const found = peopleBySubRef.current.get(sub);
          if (found) setSelectedPerson(found);
        },
        onPortalClicked: (portalId) => {
          handlePortalNavigate(portalId);
        },
        onLabelsUpdated: (nextLabels) => {
          setLabels(nextLabels);
        },
      },
      { lowSpec: lowSpecMode, darkTheme },
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
  }, [authStatus, viewMode, webglSupported, handlePortalNavigate]);

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

  const handleSelectShipFromDock = useCallback((ship: HarborShip) => {
    sceneRef.current?.focusShip(ship.id);
    setSelectedShip(ship);
  }, []);

  const handleFocusPerson3D = useCallback((sub: string) => {
    sceneRef.current?.focusPerson(sub);
  }, []);

  const handleLabelClick = useCallback(
    (label: ProjectedLabel) => {
      if (label.id.startsWith('ship:')) {
        const id = label.id.slice(5);
        const ship = shipsByIdRef.current.get(id);
        if (ship) handleSelectShipFromDock(ship);
      } else if (label.id.startsWith('person:')) {
        const sub = label.id.slice(7);
        const person = peopleBySubRef.current.get(sub);
        if (person) setSelectedPerson(person);
      } else if (label.id.startsWith('portal:')) {
        const portalId = label.id.slice(7) as PortalBuildingSpec['id'];
        handlePortalNavigate(portalId);
      }
    },
    [handlePortalNavigate, handleSelectShipFromDock],
  );

  const onlineCount = useMemo(
    () => mappedPeople.filter((p) => p.online).length,
    [mappedPeople],
  );

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
        onToggleViewMode={(next) => {
          if (next === '3d' && !webglSupported) return;
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

          {/* Projected interactive 3D labels */}
          <div className="pointer-events-none fixed inset-0 z-20 overflow-hidden">
            {labels.map((label) => {
              if (!label.visible) return null;
              if (label.y < 60 || label.y > window.innerHeight - 76) return null;
              return (
                <button
                  key={label.id}
                  type="button"
                  onClick={() => handleLabelClick(label)}
                  style={{
                    transform: `translate3d(${Math.round(label.x)}px, ${Math.round(label.y)}px, 0) translate(-50%, -100%)`,
                  }}
                  className={`pointer-events-auto absolute left-0 top-0 rounded-lg border px-2.5 py-1 text-left shadow-lg backdrop-blur-xs transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-sky-400 ${
                    label.kind === 'ship'
                      ? 'border-sky-400/60 bg-slate-950/90 text-white'
                      : label.kind === 'portal'
                        ? 'border-slate-500/70 bg-slate-950/88 text-slate-100'
                        : label.kind === 'person-partner'
                          ? 'border-amber-400/60 bg-slate-950/88 text-amber-100'
                          : label.kind === 'person-online'
                            ? 'border-emerald-400/60 bg-slate-950/88 text-emerald-100'
                            : 'border-slate-600/60 bg-slate-950/75 text-slate-300'
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
            onSelectShip={handleSelectShipFromDock}
            onRefreshProjects={() => {
              if (isPreviewMode) {
                showPreviewBlockedToast('실시간 프로젝트 새로고침');
              } else {
                void loadProjects(true);
              }
            }}
            onTogglePeopleDrawer={() => setPeopleDrawerOpen((v) => !v)}
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
          onSelectShip={(ship) => setSelectedShip(ship)}
          onSelectPerson={(person) => setSelectedPerson(person)}
          onPreviewLinkBlocked={showPreviewBlockedToast}
        />
      )}

      <ShipBriefingModal
        ship={selectedShip}
        runtimeEnv={runtimeEnv}
        onPreviewLinkBlocked={showPreviewBlockedToast}
        onClose={() => setSelectedShip(null)}
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
          className="fixed left-1/2 top-16 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-amber-400/60 bg-slate-950/95 px-4 py-2.5 text-xs font-semibold text-amber-100 shadow-2xl backdrop-blur-md"
        >
          <Info className="h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}

export default App;
