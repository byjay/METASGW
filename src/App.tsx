/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ENGINEERING_MODULES,
  FLEET_SHIPS,
  TENANT_PROJECTS,
  type ActorRoleType,
  type MemberRole,
  type ModuleId,
  type ProjectTenant,
  type ShipId,
} from './config/fleetConfig';
import {
  createPartnerInviteRecord,
  revokeMembershipFourStep,
  validateMetaspaceAccess,
  type AuditLogEntry,
  type PartnerInvite,
  type ProjectMembership,
} from './core/securityEngine';
import {
  HarborSceneController,
  type AppModeState,
  type AvatarMode,
  type CameraPreset,
  type HarborTelemetry,
  type ProjectedLabel,
  type TimeOfDayMode,
} from './scene/HarborScene';
import type { RpgActionState, VrmExpression } from './scene/humanoidAvatar';
import type { PointCloudColorMode } from './scene/pointCloudSystem';
import { TitleOverlay } from './components/TitleOverlay';
import { HudTopBar } from './components/HudTopBar';
import { BottomControlDock, type ActiveDrawerTab } from './components/BottomControlDock';
import { ModuleCatalogDrawer, ShipSelectorDrawer } from './components/ShipAndModuleDrawers';
import { EngineeringModal } from './components/EngineeringModal';
import {
  SgTalkEgoDrawer,
  type ChatMessageItem,
  type WorkOrderItem,
} from './components/SgTalkEgoDrawer';
import { SecurityPartnerDrawer } from './components/SecurityPartnerDrawer';
import { GlobalSkillsDrawer, GovernanceQaDrawer } from './components/GovernanceAndSkillsModals';

const INITIAL_TELEMETRY: HarborTelemetry = {
  playerPos: { x: 0, z: -15.5 },
  playerY: 1.6,
  speedKnots: 0,
  headingDeg: 0,
  actionState: 'idle',
  avatarMode: 'humanoid',
  insideBuildingId: null,
  insideBuildingName: null,
  lipSyncMode: 'off',
  lipSyncVolume: 0,
  vrmModelName: 'SGW 내장 VRM 스펙 엔지니어 (본사)',
  pointCloudLabel: 'H1042_LNG_Bow_Scan.e57 (14,000 pts)',
  spatialPan: 0,
  proximity: {
    mode: 'idle',
    peers: [],
    activeZone: null,
    livekitRoomKey: null,
    audioMutedBySilentZone: false,
  },
  dhtInterestCount: 0,
  predictedZoneName: null,
  fpsEstimate: 60,
};

const INITIAL_MESSAGES: ChatMessageItem[] = [
  {
    id: 'msg-1',
    projectId: 'H1042',
    room: '#프로젝트-공지',
    sender: '김선장 PM',
    actorRole: 'employee',
    text: '메타SGW 3D RPG 항구 세션이 개설되었습니다. F/E 키로 각 도크 모듈을 열 수 있습니다.',
    time: '09:10',
  },
  {
    id: 'msg-2',
    projectId: 'H1042',
    room: '#도면-리뷰',
    sender: '이설계 선임',
    actorRole: 'employee',
    text: 'DWG-H1042-0218 배전반 도면 Rev.03 업로드 완료했습니다. 도면이 부두에서 확인 부탁드립니다.',
    time: '10:05',
  },
  {
    id: 'msg-3',
    projectId: 'H1042',
    room: '#배선-협업',
    sender: '박전장 책임',
    actorRole: 'employee',
    text: 'CT-E101 트레이 부하 68% 정상 확인. 협력사 검토자는 읽기 전용 뷰어로 배정됩니다.',
    time: '10:18',
  },
  {
    id: 'msg-4',
    projectId: 'P209',
    room: '#프로젝트-공지',
    sender: '김선장 PM',
    actorRole: 'employee',
    text: 'P209 해상풍력 설치선 격리 공간입니다. H1042 데이터와 DB/룸 키가 완전 분리되어 있습니다.',
    time: '09:30',
  },
];

const INITIAL_WORK_ORDERS: WorkOrderItem[] = [
  {
    id: 'WO-101',
    projectId: 'H1042',
    title: 'NO.1 화물창 방벽 도면 Rev.04 최종 승인',
    assignee: '도면이 (이설계)',
    zone: 'SEDMS 도면 구역',
    status: 'awaiting_review',
  },
  {
    id: 'WO-102',
    projectId: 'H1042',
    title: 'FARO 360 선수 블록 스캔 .e57 변환 및 협력사 공유',
    assignee: '둘레호 (정측량)',
    zone: 'FARO 360 스캔 구역',
    status: 'in_progress',
  },
  {
    id: 'WO-201',
    projectId: 'P209',
    title: '잭업 레그 전장 케이블 트레이 간섭 점검',
    assignee: '줄줄이 (박전장)',
    zone: 'SEcMS 배선 구역',
    status: 'in_progress',
  },
];

const INITIAL_MEMBERSHIPS: ProjectMembership[] = [
  {
    membershipId: 'mem-1',
    tenantId: 'seastar',
    projectId: 'H1042',
    actorId: 'emp-captain',
    actorType: 'employee',
    displayLabel: '김선장 PM',
    orgLabel: '본사 프로젝트 총괄',
    memberRole: 'admin',
    status: 'active',
    tokenVersion: 1,
    expiresAt: '상시',
  },
  {
    membershipId: 'mem-2',
    tenantId: 'seastar',
    projectId: 'H1042',
    actorId: 'partner-kr-01',
    actorType: 'partner',
    displayLabel: '한검토 검사관',
    orgLabel: '대한선급 KR',
    memberRole: 'reviewer',
    status: 'active',
    tokenVersion: 1,
    expiresAt: '2026-12-15',
  },
  {
    membershipId: 'mem-3',
    tenantId: 'seastar',
    projectId: 'H1042',
    actorId: 'partner-scan-02',
    actorType: 'partner',
    displayLabel: '정측량 기사',
    orgLabel: '해양3D측량(협력사)',
    memberRole: 'viewer',
    status: 'active',
    tokenVersion: 1,
    expiresAt: '2026-12-08',
  },
  {
    membershipId: 'mem-4',
    tenantId: 'seastar',
    projectId: 'P209',
    actorId: 'partner-wind-01',
    actorType: 'partner',
    displayLabel: '윤감리',
    orgLabel: '오프쇼어 감리단',
    memberRole: 'reviewer',
    status: 'active',
    tokenVersion: 1,
    expiresAt: '2026-12-20',
  },
];

function nowTimeStr(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(
    d.getSeconds(),
  ).padStart(2, '0')}`;
}

export default function App() {
  const initialAutostart =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('autostart') === '1';

  const [appMode, setAppMode] = useState<AppModeState>(initialAutostart ? 'playing' : 'title');
  const [project, setProject] = useState<ProjectTenant>(TENANT_PROJECTS[0]);
  const [actorRole, setActorRole] = useState<ActorRoleType>('employee');
  const [activeShipId, setActiveShipId] = useState<ShipId>('tug_captain');
  const [avatarMode, setAvatarMode] = useState<AvatarMode>('humanoid');
  const [vrmExpression, setVrmExpression] = useState<VrmExpression>('neutral');
  const [manualAction, setManualAction] = useState<RpgActionState | null>(null);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('quarter');
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDayMode>('golden');
  const [pointCloudColorMode, setPointCloudColorMode] = useState<PointCloudColorMode>('elevation');
  const [darkUi, setDarkUi] = useState<boolean>(true);
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);
  const [activeDrawer, setActiveDrawer] = useState<ActiveDrawerTab>('none');
  const [openModuleId, setOpenModuleId] = useState<ModuleId | null>(null);
  const [udpBlocked, setUdpBlocked] = useState<boolean>(false);

  const [telemetry, setTelemetry] = useState<HarborTelemetry>(INITIAL_TELEMETRY);
  const [messages, setMessages] = useState<ChatMessageItem[]>(INITIAL_MESSAGES);
  const [workOrders, setWorkOrders] = useState<WorkOrderItem[]>(INITIAL_WORK_ORDERS);
  const [memberships, setMemberships] = useState<ProjectMembership[]>(INITIAL_MEMBERSHIPS);
  const [invites, setInvites] = useState<PartnerInvite[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([
    {
      id: 'aud-init',
      timestamp: nowTimeStr(),
      tenantId: 'seastar',
      projectId: 'H1042',
      actorId: 'emp-captain',
      eventType: 'ROOM_ENTER',
      severity: 'info',
      summary: '3D RPG 메타스페이스 초기화 완료 (/space/seastar/H1042 · 전체관리 + Role 1~3 활성)',
    },
  ]);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<HarborSceneController | null>(null);
  const labelLayerRef = useRef<HTMLDivElement | null>(null);
  const labelNodesRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const telemetryRef = useRef<HarborTelemetry>(INITIAL_TELEMETRY);
  const appModeRef = useRef<AppModeState>(appMode);

  const pushAudit = useCallback(
    (
      eventType: AuditLogEntry['eventType'],
      severity: AuditLogEntry['severity'],
      summary: string,
      overrideProject?: ProjectTenant,
    ) => {
      const targetProj = overrideProject ?? project;
      setAuditLogs((prev) => [
        {
          id: `aud-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
          timestamp: nowTimeStr(),
          tenantId: targetProj.tenantId,
          projectId: targetProj.projectId,
          actorId: actorRole === 'employee' ? 'emp-captain' : 'partner-guest',
          eventType,
          severity,
          summary,
        },
        ...prev.slice(0, 49),
      ]);
    },
    [project, actorRole],
  );

  const showNotice = useCallback((msg: string) => {
    setStatusNotice(msg);
    window.setTimeout(() => {
      setStatusNotice((curr) => (curr === msg ? null : curr));
    }, 3400);
  }, []);

  // Keep body data-state & html dark class synced
  useEffect(() => {
    document.body.dataset.state = appMode;
    appModeRef.current = appMode;
    sceneRef.current?.setAppMode(appMode);
  }, [appMode]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkUi);
  }, [darkUi]);

  // Mount Three.js WebGL scene ONCE inside dedicated isolated ref container
  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const controller = new HarborSceneController(mount, {
      onTelemetry: (next) => {
        telemetryRef.current = next;
        setTelemetry(next);
      },
      onZoneClicked: (modId) => {
        setOpenModuleId(modId);
        setActiveDrawer('none');
      },
      onLabelsUpdated: (labels: ProjectedLabel[]) => {
        const container = labelLayerRef.current;
        if (!container) return;
        const map = labelNodesRef.current;
        const shouldShow = appModeRef.current === 'playing';

        const activeIds = new Set<string>();
        for (const lbl of labels) {
          activeIds.add(lbl.id);
          let el = map.get(lbl.id);
          if (!el) {
            el = document.createElement('div');
            el.className =
              'absolute -translate-x-1/2 -translate-y-full pointer-events-none select-none px-2 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap border shadow-sm';
            container.appendChild(el);
            map.set(lbl.id, el);
          }

          if (!shouldShow || !lbl.visible) {
            el.style.display = 'none';
            continue;
          }

          el.style.display = 'block';
          el.style.transform = `translate3d(${Math.round(lbl.x)}px, ${Math.round(lbl.y)}px, 0) translate(-50%, -100%)`;

          if (lbl.kind === 'ship-employee') {
            el.style.background = lbl.isPlayer ? 'rgba(0, 68, 170, 0.94)' : 'rgba(15, 23, 42, 0.9)';
            el.style.borderColor = '#38bdf8';
            el.style.color = '#f8fafc';
          } else if (lbl.kind === 'ship-partner') {
            el.style.background = 'rgba(120, 53, 15, 0.94)';
            el.style.borderColor = '#f59e0b';
            el.style.color = '#fef3c7';
          } else if (lbl.kind === 'zone-silent') {
            el.style.background = 'rgba(30, 41, 59, 0.92)';
            el.style.borderColor = '#f59e0b';
            el.style.color = '#fde68a';
          } else {
            el.style.background = 'rgba(15, 23, 42, 0.88)';
            el.style.borderColor = 'rgba(148, 163, 184, 0.5)';
            el.style.color = '#e2e8f0';
          }

          el.textContent = lbl.text;
        }
        map.forEach((node, id) => {
          if (!activeIds.has(id)) {
            node.style.display = 'none';
          }
        });
      },
    });

    if (initialAutostart) {
      controller.setAppMode('playing');
    }
    sceneRef.current = controller;

    return () => {
      controller.dispose();
      sceneRef.current = null;
      labelNodesRef.current.forEach((node) => node.remove());
      labelNodesRef.current.clear();
    };
  }, [initialAutostart]);

  // Global keyboard shortcuts (E/F interact with nearby dock, H hide/show dock, Escape close modal/drawer)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return;
      }
      if (appModeRef.current !== 'playing') return;

      if (e.code === 'KeyH') {
        setDockCollapsed((prev) => !prev);
      } else if (e.code === 'KeyE' || e.code === 'KeyF') {
        const zone = telemetryRef.current.proximity.activeZone;
        if (zone) {
          setOpenModuleId(zone.moduleId);
          setActiveDrawer('none');
        }
      } else if (e.code === 'Escape') {
        if (openModuleId) {
          setOpenModuleId(null);
        } else if (activeDrawer !== 'none') {
          setActiveDrawer('none');
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openModuleId, activeDrawer]);

  const handleStart = useCallback(() => {
    document.body.dataset.state = 'playing';
    (document.activeElement as HTMLElement | null)?.blur?.();
    setAppMode('playing');
    sceneRef.current?.setAppMode('playing');
  }, []);

  const handleChangeProject = (nextProj: ProjectTenant) => {
    // 4-step purge when switching projects
    if (openModuleId) {
      setOpenModuleId(null);
    }
    sessionStorage.clear();
    setProject(nextProj);
    sceneRef.current?.setTenantContext(nextProj.tenantId, nextProj.projectId);
    pushAudit(
      'ROOM_ENTER',
      'info',
      `프로젝트 전환 완료 (/space/${nextProj.tenantId}/${nextProj.projectId}) · 이전 세션 4단계 파기`,
      nextProj,
    );
    showNotice(`격리 프로젝트 전환: ${nextProj.name}`);
  };

  const handleToggleRole = (nextRole: ActorRoleType) => {
    setActorRole(nextRole);
    sceneRef.current?.setActorRole(nextRole);
    showNotice(
      nextRole === 'employee'
        ? '■ [본사] 임직원 권한으로 전환되었습니다.'
        : '◆ [협력] 외부 협력사 권한(읽기 전용 · ViewerFX · EGO 차단)으로 전환되었습니다.',
    );
  };

  const handleCycleCamera = () => {
    const order: CameraPreset[] = ['quarter', 'shoulder', 'overview', 'pointcloud'];
    const next = order[(order.indexOf(cameraPreset) + 1) % order.length];
    setCameraPreset(next);
    sceneRef.current?.setCameraPreset(next);
    if (next === 'pointcloud') {
      showNotice('FARO 360 네이티브 3D WebGL 점군 시점으로 전환되었습니다.');
    }
  };

  const handleCycleTimeOfDay = () => {
    const order: TimeOfDayMode[] = ['golden', 'day', 'night'];
    const next = order[(order.indexOf(timeOfDay) + 1) % order.length];
    setTimeOfDay(next);
    sceneRef.current?.setTimeOfDay(next);
    const lbl = next === 'golden' ? '골든아워 조선소' : next === 'day' ? '주간 조선소' : '야간 야드 조명';
    showNotice(`조선소 조명 전환: ${lbl}`);
  };

  const handleToggleAvatarMode = () => {
    const next: AvatarMode = avatarMode === 'ship' ? 'humanoid' : 'ship';
    setAvatarMode(next);
    sceneRef.current?.setAvatarMode(next);
    showNotice(
      next === 'humanoid'
        ? '직원 보행 모드 — 넓어진 항구 안벽과 6개 건물 내부로 자유롭게 입장할 수 있습니다.'
        : '8종 선박 항해 모드 — 항구 수로에서 선박을 직접 조타합니다.',
    );
  };

  const handleUploadVrmFile = useCallback(
    async (file: File) => {
      if (!sceneRef.current) return;
      try {
        showNotice(`${file.name} 3D VRM/GLB 캐릭터를 불러오는 중...`);
        const loadedName = await sceneRef.current.loadExternalVrmFile(file);
        setAvatarMode('humanoid');
        showNotice(`3D 캐릭터 적용 완료: ${loadedName}`);
      } catch {
        showNotice('VRM/GLB 파일 파싱에 실패했습니다. 유효한 .vrm 또는 .glb 파일인지 확인해 주세요.');
      }
    },
    [showNotice],
  );

  const handleUploadPointCloudFile = useCallback(
    async (file: File) => {
      if (!sceneRef.current) return;
      try {
        showNotice(`${file.name} 3D 점군 데이터를 파싱하는 중...`);
        const res = await sceneRef.current.loadPointCloudFile(file);
        setCameraPreset('pointcloud');
        showNotice(`3D 점군 로드 완료: ${res.sourceLabel}`);
      } catch {
        showNotice('점군 파일(.ply / .xyz / .pts) 로드에 실패했습니다.');
      }
    },
    [showNotice],
  );

  const handleToggleMicLipSync = async () => {
    if (!sceneRef.current) return;
    if (telemetry.lipSyncMode === 'mic') {
      sceneRef.current.stopLipSync();
      showNotice('마이크 FFT 립싱크를 종료했습니다.');
    } else {
      const res = await sceneRef.current.enableLiveMicLipSync();
      showNotice(res.message);
    }
  };

  const handleToggleDemoVoice = () => {
    if (!sceneRef.current) return;
    if (telemetry.lipSyncMode === 'demo_voice') {
      sceneRef.current.stopLipSync();
      showNotice('음성 립싱크 테스트를 종료했습니다.');
    } else {
      sceneRef.current.enableDemoVoiceLipSync();
      showNotice('5모음(A/I/U/E/O) 포먼트 음성 립싱크 테스트를 시작했습니다.');
    }
  };

  const handleWalkIntoBuilding = (modId: ModuleId) => {
    setAvatarMode('humanoid');
    sceneRef.current?.walkIntoBuilding(modId, false);
    const mod = ENGINEERING_MODULES.find((m) => m.moduleId === modId);
    if (mod) showNotice(`${mod.displayName} 건물 정문으로 걸어 들어갑니다 (진입 시 지붕 자동 열림).`);
  };

  const handleCloseModuleWithPurge = (modId: ModuleId) => {
    window.postMessage({ ns: 'sgw:v1', event: 'SGW_SESSION_TERMINATE', timestamp: Date.now(), data: { modId } }, '*');
    sessionStorage.clear();
    setOpenModuleId(null);
    pushAudit(
      'MODULE_SESSION_PURGED',
      'info',
      `${modId.toUpperCase()} 종료 → SGW_SESSION_TERMINATE + sessionStorage 4단계 파기 완료`,
    );
    showNotice(`${modId.toUpperCase()} 모듈 세션 4단계 파기 완료`);
  };

  const handleSelectShip = (shipId: ShipId) => {
    setActiveShipId(shipId);
    setAvatarMode('ship');
    sceneRef.current?.setAvatarMode('ship');
    sceneRef.current?.selectActiveShip(shipId);
    const ship = FLEET_SHIPS.find((s) => s.id === shipId);
    if (ship) showNotice(`${ship.name} (${ship.vesselType}) 조타석에 탑승했습니다.`);
  };

  const handleSailToModule = (modId: ModuleId) => {
    setAvatarMode('ship');
    sceneRef.current?.setAvatarMode('ship');
    sceneRef.current?.sailToModule(modId, false);
    const mod = ENGINEERING_MODULES.find((m) => m.moduleId === modId);
    if (mod) showNotice(`${mod.displayName} 부두로 선박 자동 항해를 시작합니다.`);
  };

  const handleSendMessage = (room: string, text: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `msg-${Date.now()}`,
        projectId: project.projectId,
        room,
        sender: actorRole === 'employee' ? '나 (본사)' : '나 (외부 협력사)',
        actorRole,
        text,
        time: nowTimeStr().slice(0, 5),
      },
    ]);
  };

  const handleCreateWorkOrder = (title: string, zone: string) => {
    setWorkOrders((prev) => [
      {
        id: `WO-${Date.now().toString(36).toUpperCase()}`,
        projectId: project.projectId,
        title,
        assignee: actorRole === 'employee' ? '본사 담당자' : '협력사 검토자',
        zone,
        status: 'in_progress',
      },
      ...prev,
    ]);
  };

  const handleAdvanceWorkOrder = (id: string) => {
    setWorkOrders((prev) =>
      prev.map((w) => {
        if (w.id !== id) return w;
        const nextStatus =
          w.status === 'in_progress' ? 'awaiting_review' : w.status === 'awaiting_review' ? 'done' : 'in_progress';
        return { ...w, status: nextStatus };
      }),
    );
  };

  const handleCreateInvite = (orgLabel: string, email: string, memberRole: MemberRole) => {
    const record = createPartnerInviteRecord({
      tenantId: project.tenantId,
      projectId: project.projectId,
      orgLabel,
      email,
      memberRole,
    });
    setInvites((prev) => [record, ...prev]);
    pushAudit(
      'PARTNER_INVITE_CREATED',
      'info',
      `외부 협력사 1회용 초대 발급: ${record.orgLabel} (${record.emailMasked}) · OTP ${record.otpCode}`,
    );
    showNotice(`${orgLabel} 1회용 초대 링크 및 OTP(${record.otpCode})가 발급되었습니다.`);
  };

  const handleRevokeMembership = (membershipId: string) => {
    const target = memberships.find((m) => m.membershipId === membershipId);
    if (!target) return;
    const { updated, steps } = revokeMembershipFourStep(target);
    setMemberships((prev) => prev.map((m) => (m.membershipId === membershipId ? updated : m)));
    pushAudit('PARTNER_REVOKED', 'blocked', `${target.displayLabel} 4단계 즉시 권한 회수: ${steps.join(' → ')}`);
    showNotice(`${target.displayLabel} 권한이 4단계 즉시 차단(4401)되었습니다.`);
  };

  const handleToggleUdpBlocked = () => {
    const next = !udpBlocked;
    setUdpBlocked(next);
    if (next) {
      pushAudit(
        'TURN_443_FALLBACK',
        'warn',
        'UDP 12547 방화벽 차단 감지 → 680ms 만에 TURN TCP 443 (HTTPS 위장) 릴레이 자동 전환 완료',
      );
      showNotice('UDP 12547 차단 감지: TURN TCP 443 (HTTPS) 릴레이로 자동 우회되었습니다.');
    } else {
      showNotice('WebRTC STUN UDP 12547 직접 연결이 복구되었습니다.');
    }
  };

  const handleSimulateCrossTenant = () => {
    const otherPid = project.projectId === 'F310' ? 'H1042' : 'F310';
    const check = validateMetaspaceAccess({
      path: `/space/${project.tenantId}/${otherPid}`,
      sessionTenantId: project.tenantId,
      sessionProjectId: project.projectId,
      actorId: actorRole === 'employee' ? 'emp-captain' : 'partner-guest',
      isRevoked: false,
    });
    pushAudit(
      'CROSS_TENANT_ATTEMPT',
      'blocked',
      `SEC-01 타 프로젝트(/space/${project.tenantId}/${otherPid}) 접근 시도 → HTTP ${check.status} (${check.code}) 차단`,
    );
    showNotice(`SEC-01 차단 확인: HTTP ${check.status} (${check.code}) 및 감사 로그 적재`);
  };

  const handleDropOnViewport = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.vrm') || lower.endsWith('.glb') || lower.endsWith('.gltf')) {
      void handleUploadVrmFile(file);
    } else if (lower.endsWith('.ply') || lower.endsWith('.xyz') || lower.endsWith('.pts')) {
      void handleUploadPointCloudFile(file);
    }
  };

  return (
    <main
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDropOnViewport}
      className="relative w-screen h-screen overflow-hidden select-none bg-slate-950"
    >
      {/* Dedicated isolated Three.js WebGL Mount Container */}
      <div
        ref={canvasMountRef}
        data-testid="metasgw-3d-canvas-host"
        className="fixed inset-0 w-full h-full z-0"
      />

      {/* Projected 3D Staff, Ship & Zone Labels Layer (Direct DOM updates, zero React 60Hz re-render) */}
      <div ref={labelLayerRef} className="fixed inset-0 z-10 pointer-events-none overflow-hidden" />

      {/* Title Screen Live World Camera Tour */}
      {appMode === 'title' && (
        <TitleOverlay
          selectedProject={project}
          onSelectProject={setProject}
          actorRole={actorRole}
          onSelectActorRole={handleToggleRole}
          onStart={handleStart}
        />
      )}

      {/* Playing HUD & Workspaces */}
      {appMode === 'playing' && (
        <>
          <HudTopBar
            project={project}
            onChangeProject={handleChangeProject}
            actorRole={actorRole}
            onToggleRole={handleToggleRole}
            avatarMode={avatarMode}
            onToggleAvatarMode={handleToggleAvatarMode}
            telemetry={telemetry}
            cameraPreset={cameraPreset}
            onCycleCamera={handleCycleCamera}
            timeOfDay={timeOfDay}
            onCycleTimeOfDay={handleCycleTimeOfDay}
            darkUi={darkUi}
            onToggleDarkUi={() => setDarkUi((d) => !d)}
            udpBlocked={udpBlocked}
          />

          {/* Ephemeral Event Toast Notice (Top-Center below HUD) */}
          {statusNotice && (
            <div
              role="status"
              aria-live="polite"
              className="fixed top-28 sm:top-16 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-xl bg-slate-950/94 text-slate-100 border border-sky-500/70 text-xs font-semibold shadow-lg max-w-[92vw] text-center"
            >
              {statusNotice}
            </div>
          )}

          {/* Mobile Touch D-Pad (Visible on narrow touch viewports when no drawer is open) */}
          {activeDrawer === 'none' && !openModuleId && (
            <div className="fixed bottom-24 right-3 z-20 flex sm:hidden flex-col items-center gap-1 pointer-events-auto">
              <button
                type="button"
                aria-label="전진"
                onPointerDown={() => sceneRef.current?.setVirtualInput(1, 0)}
                onPointerUp={() => sceneRef.current?.setVirtualInput(0, 0)}
                onPointerLeave={() => sceneRef.current?.setVirtualInput(0, 0)}
                className="w-11 h-11 rounded-xl bg-slate-950/90 text-white border border-slate-700 font-bold text-sm"
              >
                ▲
              </button>
              <div className="flex gap-1">
                <button
                  type="button"
                  aria-label="좌이동"
                  onPointerDown={() => sceneRef.current?.setVirtualInput(0, 1)}
                  onPointerUp={() => sceneRef.current?.setVirtualInput(0, 0)}
                  onPointerLeave={() => sceneRef.current?.setVirtualInput(0, 0)}
                  className="w-11 h-11 rounded-xl bg-slate-950/90 text-white border border-slate-700 font-bold text-sm"
                >
                  ◀
                </button>
                <button
                  type="button"
                  aria-label="후진"
                  onPointerDown={() => sceneRef.current?.setVirtualInput(-0.8, 0)}
                  onPointerUp={() => sceneRef.current?.setVirtualInput(0, 0)}
                  onPointerLeave={() => sceneRef.current?.setVirtualInput(0, 0)}
                  className="w-11 h-11 rounded-xl bg-slate-950/90 text-white border border-slate-700 font-bold text-sm"
                >
                  ▼
                </button>
                <button
                  type="button"
                  aria-label="우이동"
                  onPointerDown={() => sceneRef.current?.setVirtualInput(0, -1)}
                  onPointerUp={() => sceneRef.current?.setVirtualInput(0, 0)}
                  onPointerLeave={() => sceneRef.current?.setVirtualInput(0, 0)}
                  className="w-11 h-11 rounded-xl bg-slate-950/90 text-white border border-slate-700 font-bold text-sm"
                >
                  ▶
                </button>
              </div>
            </div>
          )}

          {/* Unified Collapsible Bottom Control Dock */}
          <BottomControlDock
            activeTab={activeDrawer}
            onSelectTab={setActiveDrawer}
            collapsed={dockCollapsed}
            onToggleCollapse={() => setDockCollapsed((c) => !c)}
            nearbyZone={telemetry.proximity.activeZone}
            onOpenModule={(modId) => {
              setOpenModuleId(modId);
              setActiveDrawer('none');
            }}
            unreadCount={messages.filter((m) => m.projectId === project.projectId).length}
            darkUi={darkUi}
          />

          {/* Focused Workspace Drawers */}
          {activeDrawer === 'ships' && (
            <ShipSelectorDrawer
              activeShipId={activeShipId}
              actorRole={actorRole}
              avatarMode={avatarMode}
              onChangeAvatarMode={(mode) => {
                setAvatarMode(mode);
                sceneRef.current?.setAvatarMode(mode);
              }}
              vrmExpression={vrmExpression}
              onChangeExpression={(expr) => {
                setVrmExpression(expr);
                sceneRef.current?.setVrmExpression(expr);
              }}
              manualAction={manualAction}
              onChangeManualAction={(act) => {
                setManualAction(act);
                sceneRef.current?.setManualAction(act);
              }}
              vrmModelName={telemetry.vrmModelName}
              onUploadVrmFile={handleUploadVrmFile}
              lipSyncMode={telemetry.lipSyncMode}
              lipSyncVolume={telemetry.lipSyncVolume}
              onToggleMicLipSync={handleToggleMicLipSync}
              onToggleDemoVoice={handleToggleDemoVoice}
              onSelectShip={handleSelectShip}
              onSailToModule={handleSailToModule}
              onClose={() => setActiveDrawer('none')}
              darkUi={darkUi}
            />
          )}

          {activeDrawer === 'modules' && (
            <ModuleCatalogDrawer
              actorRole={actorRole}
              pointCloudLabel={telemetry.pointCloudLabel}
              pointCloudColorMode={pointCloudColorMode}
              onChangePointCloudColorMode={(mode) => {
                setPointCloudColorMode(mode);
                sceneRef.current?.setPointCloudColorMode(mode);
              }}
              onUploadPointCloudFile={handleUploadPointCloudFile}
              onOpenModule={(modId) => setOpenModuleId(modId)}
              onWalkIntoBuilding={handleWalkIntoBuilding}
              onSailToModule={handleSailToModule}
              onClose={() => setActiveDrawer('none')}
              darkUi={darkUi}
            />
          )}

          {activeDrawer === 'sgtalk' && (
            <SgTalkEgoDrawer
              project={project}
              actorRole={actorRole}
              messages={messages}
              onSendMessage={handleSendMessage}
              workOrders={workOrders}
              onCreateWorkOrder={handleCreateWorkOrder}
              onAdvanceWorkOrder={handleAdvanceWorkOrder}
              onAuditTrigger={(ev, summary) => pushAudit(ev, 'blocked', summary)}
              onClose={() => setActiveDrawer('none')}
              darkUi={darkUi}
            />
          )}

          {activeDrawer === 'security' && (
            <SecurityPartnerDrawer
              project={project}
              memberships={memberships}
              invites={invites}
              auditLogs={auditLogs}
              udpBlocked={udpBlocked}
              onToggleUdpBlocked={handleToggleUdpBlocked}
              onCreateInvite={handleCreateInvite}
              onRevokeMembership={handleRevokeMembership}
              onSimulateCrossTenant={handleSimulateCrossTenant}
              onClose={() => setActiveDrawer('none')}
              darkUi={darkUi}
            />
          )}

          {activeDrawer === 'qa' && (
            <GovernanceQaDrawer
              project={project}
              telemetry={telemetry}
              onClose={() => setActiveDrawer('none')}
              darkUi={darkUi}
            />
          )}

          {activeDrawer === 'skills' && (
            <GlobalSkillsDrawer onClose={() => setActiveDrawer('none')} darkUi={darkUi} />
          )}

          {/* Full Engineering Module Modal */}
          {openModuleId && (
            <EngineeringModal
              moduleId={openModuleId}
              project={project}
              actorRole={actorRole}
              onCloseWithPurge={handleCloseModuleWithPurge}
              darkUi={darkUi}
            />
          )}
        </>
      )}
    </main>
  );
}
