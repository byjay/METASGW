export type ActorRoleType = 'employee' | 'partner';
export type MemberRole = 'admin' | 'engineer' | 'reviewer' | 'viewer';

export type ShipId =
  | 'tug_captain'
  | 'sedms_container'
  | 'secms_cable'
  | 'faro_survey'
  | 'secad_lng'
  | 'pdf_sail'
  | 'mail_ferry'
  | 'patrol_guard';

export type ModuleId = 'sedms' | 'secms' | 'faro360' | 'secad' | 'pdfview' | 'bmail';

export type PointCloudFormat =
  | '.fls'
  | '.pts'
  | '.ptx'
  | '.ptz'
  | '.xyz'
  | '.e57'
  | '.cpe'
  | '.sfm'
  | '.las'
  | '.laz';

export interface ShipConfig {
  id: ShipId;
  name: string;
  vesselType: string;
  roleTitle: string;
  zoneId: string;
  hullColor: number;
  accentColor: number;
  homePos: { x: number; z: number };
  heading: number;
  defaultActorRole: ActorRoleType;
  crewName: string;
  description: string;
}

export interface ModulePartnerPolicy {
  readOnly: boolean;
  watermark: boolean;
  targetDomain: string;
  fallbackViewerUrl?: string;
  allowedFormats?: PointCloudFormat[];
}

export interface EngineeringModuleConfig {
  moduleId: ModuleId;
  displayName: string;
  shortName: string;
  associatedShipId: ShipId;
  zoneId: string;
  zoneType: 'website' | 'conference' | 'silent' | 'proximity';
  silent: boolean;
  embedMode: 'modal' | 'coWebsite';
  ssoEndpoint: string;
  allowedRoles: MemberRole[];
  partnerPolicy: ModulePartnerPolicy;
  sandbox: string;
  featurePolicy: string;
  dockPos: { x: number; z: number };
  berthPos: { x: number; z: number };
  dockColor: string;
  summary: string;
}

export interface ProjectTenant {
  tenantId: string;
  projectId: string;
  name: string;
  vesselClass: string;
  mapSlug: string;
  livekitPrefix: string;
  sgtalkChannelId: string;
  allowPartner: boolean;
  maxOccupancy: number;
}

export interface AgentRoleSpec {
  roleNumber: number;
  title: string;
  leadDomain: string;
  ownedPaths: string[];
  forbiddenRule: string;
  keyInterfaces: string[];
  phaseTarget: string;
}

export interface RoadmapPhase {
  phase: string;
  title: string;
  period: string;
  status: 'completed' | 'active' | 'scheduled';
  deliverables: string[];
}

export const TENANT_PROJECTS: ProjectTenant[] = [
  {
    tenantId: 'seastar',
    projectId: 'H1042',
    name: 'H1042 174K LNG 운반선',
    vesselClass: '174,000m³ LNG Carrier',
    mapSlug: 'project_dock_h1042',
    livekitPrefix: 'lk-seastar-H1042',
    sgtalkChannelId: 'ch-H1042-main',
    allowPartner: true,
    maxOccupancy: 50,
  },
  {
    tenantId: 'seastar',
    projectId: 'P209',
    name: 'P209 해상풍력 설치선(WTIV)',
    vesselClass: 'Offshore Wind Turbine Vessel',
    mapSlug: 'project_dock_p209',
    livekitPrefix: 'lk-seastar-P209',
    sgtalkChannelId: 'ch-P209-main',
    allowPartner: true,
    maxOccupancy: 50,
  },
  {
    tenantId: 'seastar',
    projectId: 'F310',
    name: 'F310 차세대 친환경 특수선',
    vesselClass: 'Dual-Fuel Special Vessel',
    mapSlug: 'project_dock_f310',
    livekitPrefix: 'lk-seastar-F310',
    sgtalkChannelId: 'ch-F310-main',
    allowPartner: false,
    maxOccupancy: 50,
  },
];

export interface HarborStaffConfig {
  id: string;
  name: string;
  title: string;
  actorRole: ActorRoleType;
  homePos: { x: number; z: number };
  patrolTarget?: { x: number; z: number };
  facing: number;
  action: 'idle' | 'run' | 'work' | 'talk';
  stationLabel: string;
}

// Connected SGW/SGS employees & external partners rendered as live 3D Humanoid people across the harbor & inside buildings
export const CONNECTED_HARBOR_STAFF: HarborStaffConfig[] = [
  {
    id: 'staff_pm',
    name: '김선장 PM',
    title: '프로젝트 총괄',
    actorRole: 'employee',
    homePos: { x: -7.5, z: -15.8 },
    patrolTarget: { x: 10.5, z: -15.8 },
    facing: Math.PI * 0.5,
    action: 'run',
    stationLabel: '중앙 안벽 산책로',
  },
  {
    id: 'staff_sedms',
    name: '이설계 선임',
    title: 'SEDMS 도면 검토',
    actorRole: 'employee',
    homePos: { x: -48.0, z: -26.4 },
    facing: Math.PI,
    action: 'work',
    stationLabel: 'SEDMS 도면센터 실내',
  },
  {
    id: 'staff_secms',
    name: '박전장 책임',
    title: 'SEcMS 전장 관제',
    actorRole: 'employee',
    homePos: { x: -24.2, z: -26.2 },
    facing: Math.PI,
    action: 'work',
    stationLabel: 'SEcMS 전장관제실 실내',
  },
  {
    id: 'staff_faro',
    name: '정측량 기사',
    title: 'FARO 360 스캔',
    actorRole: 'partner',
    homePos: { x: 2.2, z: -25.8 },
    facing: -Math.PI * 0.35,
    action: 'talk',
    stationLabel: 'FARO 360 스캔돔 실내',
  },
  {
    id: 'staff_secad',
    name: '최구조 수석',
    title: 'SECAD 3D 간섭검토',
    actorRole: 'employee',
    homePos: { x: 24.0, z: -26.4 },
    facing: Math.PI,
    action: 'work',
    stationLabel: 'SECAD 3D 연구실 실내',
  },
  {
    id: 'staff_pdf',
    name: '한검토 검사관',
    title: '선급 도서 열람',
    actorRole: 'partner',
    homePos: { x: 48.0, z: -26.2 },
    facing: Math.PI,
    action: 'work',
    stationLabel: 'PDF VIEW 정숙도서관',
  },
  {
    id: 'staff_bmail',
    name: '오공문 대리',
    title: 'bmail 대외 공문',
    actorRole: 'employee',
    homePos: { x: -65.4, z: 10.0 },
    facing: Math.PI * 0.5,
    action: 'work',
    stationLabel: 'bmail 통신관제실 실내',
  },
  {
    id: 'staff_lng',
    name: '강보안 감사관',
    title: 'LNG 의장안벽 순찰',
    actorRole: 'employee',
    homePos: { x: 69.5, z: -6.0 },
    patrolTarget: { x: 69.5, z: 22.0 },
    facing: 0,
    action: 'run',
    stationLabel: '동측 174K LNG 의장안벽',
  },
];

// Canonical 8-ship registry moored in the 2X Expanded Shipyard Harbor Basin
export const FLEET_SHIPS: ShipConfig[] = [
  {
    id: 'tug_captain',
    name: '끌배',
    vesselType: '예인선',
    roleTitle: '총괄 팀장',
    zoneId: 'spawn_main',
    hullColor: 0x1e3a5f,
    accentColor: 0xea580c,
    homePos: { x: 0, z: 16 },
    heading: Math.PI,
    defaultActorRole: 'employee',
    crewName: '김선장 PM',
    description: '항구 중앙 수로에서 전체 프로젝트 공정과 선박 배치를 총괄 지휘합니다.',
  },
  {
    id: 'sedms_container',
    name: '도면이',
    vesselType: '컨테이너선',
    roleTitle: 'SEDMS 도면 전담',
    zoneId: 'zone_sedms_review',
    hullColor: 0x1d4ed8,
    accentColor: 0x0ea5e9,
    homePos: { x: -48, z: -5.5 },
    heading: Math.PI * 0.12,
    defaultActorRole: 'employee',
    crewName: '이설계 선임',
    description: 'SEDMS 선박 도면 리비전 검토 및 협력사 워터마크 배포를 담당합니다.',
  },
  {
    id: 'secms_cable',
    name: '줄줄이',
    vesselType: '케이블선',
    roleTitle: 'SEcMS 배선 전담',
    zoneId: 'zone_secms_panel',
    hullColor: 0x0f766e,
    accentColor: 0xf59e0b,
    homePos: { x: -24, z: -5.5 },
    heading: Math.PI * 0.06,
    defaultActorRole: 'employee',
    crewName: '박전장 책임',
    description: 'SEcMS 전장 케이블 트레이 경로 및 부하 계통을 제어합니다.',
  },
  {
    id: 'faro_survey',
    name: '둘레호',
    vesselType: '관측선',
    roleTitle: '360 파노라마 전담',
    zoneId: 'zone_s360_spot',
    hullColor: 0xf1f5f9,
    accentColor: 0x0284c7,
    homePos: { x: 0, z: -5.5 },
    heading: 0,
    defaultActorRole: 'partner',
    crewName: '정측량 (협력사)',
    description: 'FARO 360 점군 스캔과 외부 협력사 ViewerFX 자동 분기를 지원합니다.',
  },
  {
    id: 'secad_lng',
    name: '삼차원호',
    vesselType: 'LNG선',
    roleTitle: 'SECAD 3D 도크 전담',
    zoneId: 'zone_secad_dock',
    hullColor: 0x0c4a6e,
    accentColor: 0x38bdf8,
    homePos: { x: 24, z: -5.5 },
    heading: -Math.PI * 0.06,
    defaultActorRole: 'employee',
    crewName: '최구조 수석',
    description: 'SECAD 3D 선체 블록 조립 및 간섭 체크를 수행합니다.',
  },
  {
    id: 'pdf_sail',
    name: '종이배',
    vesselType: '범선',
    roleTitle: 'PDF 열람 전담',
    zoneId: 'zone_pdf_reading',
    hullColor: 0x334155,
    accentColor: 0xf8fafc,
    homePos: { x: 46, z: -5.5 },
    heading: -Math.PI * 0.14,
    defaultActorRole: 'partner',
    crewName: '한검토 (선급)',
    description: '정숙 집중 구역(Silent Focus Zone)에서 승인 문서를 열람합니다.',
  },
  {
    id: 'mail_ferry',
    name: '편지호',
    vesselType: '우편 페리',
    roleTitle: 'bmail 허브',
    zoneId: 'zone_mail_dock',
    hullColor: 0x1e40af,
    accentColor: 0xfbbf24,
    homePos: { x: -46, z: 10 },
    heading: Math.PI * 0.5,
    defaultActorRole: 'employee',
    crewName: '오공문 대리',
    description: 'SGTALK와 연동된 bmail 공식 발신 및 대외 수신함을 관리합니다.',
  },
  {
    id: 'patrol_guard',
    name: '살피미',
    vesselType: '순찰정',
    roleTitle: '외곽 정찰/리뷰',
    zoneId: 'patrol_channel',
    hullColor: 0x0f172a,
    accentColor: 0xf97316,
    homePos: { x: 26, z: 24 },
    heading: -Math.PI * 0.6,
    defaultActorRole: 'employee',
    crewName: '강보안 감사관',
    description: '외곽 방파제 수로를 순찰하며 멀티테넌트 격리 및 감사 로그를 감시합니다.',
  },
];

export const ENGINEERING_MODULES: EngineeringModuleConfig[] = [
  {
    moduleId: 'sedms',
    displayName: 'SEDMS 도면 관리',
    shortName: 'SEDMS',
    associatedShipId: 'sedms_container',
    zoneId: 'zone_sedms_review',
    zoneType: 'conference',
    silent: false,
    embedMode: 'modal',
    ssoEndpoint: '/api/sedms-sso',
    allowedRoles: ['admin', 'engineer', 'reviewer', 'viewer'],
    partnerPolicy: {
      readOnly: true,
      watermark: true,
      targetDomain: 'fence.sedms.app',
    },
    sandbox: 'allow-scripts allow-same-origin allow-forms',
    featurePolicy: "camera 'none'; microphone 'none'",
    dockPos: { x: -48, z: -25.5 },
    berthPos: { x: -48, z: -6.5 },
    dockColor: '#0284c7',
    summary: '선체·의장 도면 리비전 승인, 마크업 비교 및 협력사 워터마크 배포',
  },
  {
    moduleId: 'secms',
    displayName: 'SEcMS 배선 제어',
    shortName: 'SEcMS',
    associatedShipId: 'secms_cable',
    zoneId: 'zone_secms_panel',
    zoneType: 'website',
    silent: false,
    embedMode: 'modal',
    ssoEndpoint: '/api/secms-sso',
    allowedRoles: ['admin', 'engineer'],
    partnerPolicy: {
      readOnly: true,
      watermark: true,
      targetDomain: 'secms.seastar.work',
    },
    sandbox: 'allow-scripts allow-same-origin',
    featurePolicy: "camera 'none'; microphone 'none'",
    dockPos: { x: -24, z: -25.5 },
    berthPos: { x: -24, z: -6.5 },
    dockColor: '#0d9488',
    summary: '전장 케이블 트레이 라우팅, 결선표 및 구역별 전력 부하 제어',
  },
  {
    moduleId: 'faro360',
    displayName: 'FARO 360 / ViewerFX',
    shortName: 'FARO 360',
    associatedShipId: 'faro_survey',
    zoneId: 'zone_s360_spot',
    zoneType: 'conference',
    silent: false,
    embedMode: 'coWebsite',
    ssoEndpoint: '/api/faro-sso',
    allowedRoles: ['admin', 'engineer', 'reviewer', 'viewer'],
    partnerPolicy: {
      readOnly: true,
      watermark: true,
      targetDomain: 'viewerfx.seastar.work',
      fallbackViewerUrl: 'https://viewerfx.seastar.work/view',
      allowedFormats: ['.e57', '.las', '.laz'],
    },
    sandbox: 'allow-scripts allow-same-origin allow-downloads',
    featurePolicy: "camera 'autoplay'; microphone 'autoplay'; fullscreen 'self'",
    dockPos: { x: 0, z: -25.5 },
    berthPos: { x: 0, z: -6.5 },
    dockColor: '#2563eb',
    summary: '10종 점군(.fls~.laz) 스트리밍, ScanPlan 2D 정렬 및 협력사 ViewerFX 자동 분기',
  },
  {
    moduleId: 'secad',
    displayName: 'SECAD 3D 도크',
    shortName: 'SECAD 3D',
    associatedShipId: 'secad_lng',
    zoneId: 'zone_secad_dock',
    zoneType: 'conference',
    silent: false,
    embedMode: 'modal',
    ssoEndpoint: '/api/secad-sso',
    allowedRoles: ['admin', 'engineer', 'reviewer'],
    partnerPolicy: {
      readOnly: true,
      watermark: true,
      targetDomain: 'secad.seastar.work',
    },
    sandbox: 'allow-scripts allow-same-origin',
    featurePolicy: "camera 'none'; microphone 'none'",
    dockPos: { x: 24, z: -25.5 },
    berthPos: { x: 24, z: -6.5 },
    dockColor: '#0369a1',
    summary: 'LNG 화물창·엔진룸 3D 블록 단면 검토 및 배관 간섭 측정',
  },
  {
    moduleId: 'pdfview',
    displayName: 'PDF VIEW 열람실',
    shortName: 'PDF VIEW',
    associatedShipId: 'pdf_sail',
    zoneId: 'zone_pdf_reading',
    zoneType: 'silent',
    silent: true,
    embedMode: 'modal',
    ssoEndpoint: '/api/pdf-sso',
    allowedRoles: ['admin', 'engineer', 'reviewer', 'viewer'],
    partnerPolicy: {
      readOnly: true,
      watermark: true,
      targetDomain: 'docs.seastar.work',
    },
    sandbox: 'allow-scripts allow-same-origin',
    featurePolicy: "camera 'none'; microphone 'none'",
    dockPos: { x: 48, z: -25.5 },
    berthPos: { x: 46, z: -6.5 },
    dockColor: '#475569',
    summary: '정숙 집중 구역(Silent Focus Zone) — 진입 시 근접 음성 자동 소멸',
  },
  {
    moduleId: 'bmail',
    displayName: 'bmail 공식 허브',
    shortName: 'bmail',
    associatedShipId: 'mail_ferry',
    zoneId: 'zone_mail_dock',
    zoneType: 'website',
    silent: false,
    embedMode: 'modal',
    ssoEndpoint: '/api/bmail-sso',
    allowedRoles: ['admin', 'engineer'],
    partnerPolicy: {
      readOnly: true,
      watermark: false,
      targetDomain: 'bmail.seastar.work',
    },
    sandbox: 'allow-scripts allow-same-origin',
    featurePolicy: "camera 'none'; microphone 'none'",
    dockPos: { x: -65, z: 10 },
    berthPos: { x: -46, z: 10 },
    dockColor: '#b45309',
    summary: 'SGTALK 브리지 연동 공식 프로젝트 공문 및 선주/선급 메일 발신',
  },
];

export const ALL_POINT_CLOUD_FORMATS: PointCloudFormat[] = [
  '.fls',
  '.pts',
  '.ptx',
  '.ptz',
  '.xyz',
  '.e57',
  '.cpe',
  '.sfm',
  '.las',
  '.laz',
];

export const AGENT_ROLES: AgentRoleSpec[] = [
  {
    roleNumber: 1,
    title: '인프라·보안·멀티테넌트 아키텍트',
    leadDomain: 'Traefik 샌드박싱 · D1/KV · DHT AoI · STUN/TURN 443',
    ownedPaths: ['/server/network/*', '/server/dht/*', '/server/webrtc/*', 'd1/metaspace_tenants.sql'],
    forbiddenRule: '/client/*, /assets/* 수정 금지',
    keyInterfaces: ['IDHTNode', 'INetworkConfig(TURN 443)', 'enforceMetaspaceScope'],
    phaseTarget: 'Phase 1',
  },
  {
    roleNumber: 2,
    title: 'SGTALK·EGO·커뮤니케이션 리드',
    leadDomain: '카카오톡 완전 제거 · 영구 채팅 SoT · NAS 가드 · EGO 4중 경계',
    ownedPaths: ['/SGTALK/server/*', '/server/db/schema.sql', 'egoAgent.ts', 'messagingService.ts'],
    forbiddenRule: 'STUN/TURN 서버 설정, 아바타 스프라이트 수정 금지',
    keyInterfaces: ['MessagingService', 'EgoAgentGuard', 'chat_rooms / work_orders'],
    phaseTarget: 'Phase 2',
  },
  {
    roleNumber: 3,
    title: '게임월드·선박아바타·UX 리드',
    leadDomain: '3D 항구 도크 · 8종 복합 선박 아바타 · 접근성 4.5:1 · 375px 반응형',
    ownedPaths: ['/client/avatar/*', '/client/ui/*', '/client/scenes/*', '/assets/sprites/*'],
    forbiddenRule: '백엔드 시그널링, Colyseus DHT, Tiled 파서 침범 금지',
    keyInterfaces: ['DynamicAvatarContainer', 'IAvatarCompositeConfig', 'ShipFactory'],
    phaseTarget: 'Phase 2',
  },
  {
    roleNumber: 4,
    title: '엔지니어링 모듈 통합 리드',
    leadDomain: 'Zero-Code 레지스트리 · SEDMS/SEcMS/FARO/ViewerFX · PostMessageGuard',
    ownedPaths: ['/client/map/*', '/client/faro/*', 'fleet.config.json', 'postMessageGuard.ts'],
    forbiddenRule: '/shared/rpc/*, 메인 루프, 아바타 합성 수정 금지',
    keyInterfaces: ['IFAROAssetBinding', 'PostMessageGuard', 'purgeModuleSession'],
    phaseTarget: 'Phase 3',
  },
  {
    roleNumber: 5,
    title: '통합 PM·QA·미디어 SFU·파이프라인 리드',
    leadDomain: 'LiveKit 프록시미티 버블 · Silent Zone · SEC-01~05 · CI/CD 게이트',
    ownedPaths: ['/server/media/*', '/client/media/*', '/config/rtc/*', 'check.mjs / shoot.mjs'],
    forbiddenRule: '3D 씬 조작, 점군 로더, 아바타 합성 수정 금지',
    keyInterfaces: ['IProximityManager', 'IRTCFallbackDetector', 'deploy_metaspace.yml'],
    phaseTarget: 'Phase 4',
  },
];

export const ROADMAP_PHASES: RoadmapPhase[] = [
  {
    phase: 'Phase 1',
    title: '인프라 & 멀티테넌트 격리',
    period: '2026-11-26 ~ 12-10',
    status: 'completed',
    deliverables: ['@sg/contracts 정본', 'D1/KV 멀티테넌트 스키마', 'Traefik + LiveKit TURN 443'],
  },
  {
    phase: 'Phase 2',
    title: '선박 아바타 & SGTALK 단일화',
    period: '2026-12-11 ~ 01-07',
    status: 'completed',
    deliverables: ['8종 선박 3D 복합 모델', '카톡 의존성 완전 제거', 'EGO 4중 보안 경계'],
  },
  {
    phase: 'Phase 3',
    title: '엔지니어링 6대 모듈 연동',
    period: '2027-01-08 ~ 02-04',
    status: 'active',
    deliverables: ['SEDMS/SEcMS SSO', 'FARO 360 ↔ ViewerFX 분기', 'PostMessageGuard 4단계 파기'],
  },
  {
    phase: 'Phase 4',
    title: '외부 협력사 포털 & QA 오픈',
    period: '2027-02-05 ~ 02-26',
    status: 'scheduled',
    deliverables: ['1회용 초대 & 원클릭 Revoke', 'SEC-01~05 침투 테스트', '카나리 배포 10%→100%'],
  },
];
