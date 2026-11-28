/**
 * Pseudonym-only `/api/meta/*` preview fixtures used EXCLUSIVELY in `'preview'` mode.
 *
 * STRICT HONESTY & PRIVACY RULES:
 *   - NEVER imported or returned when `runtimeEnv === 'sgw'`.
 *   - Zero real names, real emails, customer orgs, hull numbers, or internal domains.
 *   - Stage 6 finalized SEDMS/SEcMS response shapes covered across proj01..proj04:
 *       * proj01 (정상): SEDMS drawings (kpi with urgentComments:null, severity:null, opaque "도번|목록종류" ID,
 *         updatedAt:null sample, filter=urgent -> { items:[], unsupported:true }) + SEcMS cables (진척률 82/120,
 *         cableTrayWarningCount:null, 미포설·포설 중 items, severity:null).
 *       * proj02 (null KPI): SEcMS cables with cablesLaid:null & cablePullProgressPct:null (renders "—" instead of bar).
 *       * proj03 (nosource + entryUrl): SEcMS status:'nosource' + entryUrl:'/api/secms-link' (계정 연결 필요 카드).
 *       * proj04 (planned): SEcMS status:'planned' + entryUrl:null (준비 중).
 *   - SEDMS entry/deep links strictly follow `/api/sedms-sso?return=...`.
 */

import {
  formatNullableKpiValue,
  type MetaCablesKeyKpi,
  type MetaCablesKeyResponse,
  type MetaDrawingsFilter,
  type MetaDrawingsKeyKpi,
  type MetaDrawingsKeyResponse,
  type MetaHubSummaryResponse,
  type MetaItemsSearchResponse,
  type MetaKeyItem,
  type MetaKpiMap,
  type MetaModuleId,
  type MetaModuleStatus,
  type MetaRegistryModule,
  type MetaRegistryResponse,
  type MetaReportJsonResponse,
  type ModuleStatusSummary,
} from './hubTypes';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function isoAgo(nowMs: number, offsetMs: number): string {
  return new Date(nowMs - offsetMs).toISOString();
}

export const PREVIEW_HUB_PROJECT_IDS = ['proj01', 'proj02', 'proj03', 'proj04'] as const;
export type PreviewHubProjectId = (typeof PREVIEW_HUB_PROJECT_IDS)[number];

export function getPreviewHubRegistry(): MetaRegistryResponse {
  const modules: MetaRegistryModule[] = [
    {
      moduleId: 'sgw',
      name: 'SGW 그룹웨어',
      status: 'active',
      capabilities: ['summary', 'search', 'report'],
      entryUrl: '/talk/',
    },
    {
      moduleId: 'sedms',
      name: 'SEDMS 도면관리',
      status: 'warn',
      capabilities: ['summary', 'drawings', 'search', 'report'],
      entryUrl: '/api/sedms-sso?return=%2Fprojects',
    },
    {
      moduleId: 'secms',
      name: 'SEcMS 케이블',
      status: 'active',
      capabilities: ['summary', 'cables', 'search', 'report'],
      entryUrl: '/api/secms-link',
    },
    {
      moduleId: 's360',
      name: '360° 현장스캔',
      status: 'planned',
      capabilities: [],
      entryUrl: null,
    },
    {
      moduleId: 'secad',
      name: '3D CAD 뷰어',
      status: 'planned',
      capabilities: [],
      entryUrl: null,
    },
    {
      moduleId: 'pdf',
      name: 'PDF 검토실',
      status: 'planned',
      capabilities: [],
      entryUrl: null,
    },
    {
      moduleId: 'mail',
      name: '업무 메일',
      status: 'planned',
      capabilities: [],
      entryUrl: null,
    },
  ];
  return { modules };
}

function makePlannedSummary(moduleId: MetaModuleId): ModuleStatusSummary {
  return {
    moduleId,
    status: 'planned',
    summaryText: '준비 중',
    kpi: {},
    updatedAt: null,
    entryUrl: null,
  };
}

interface PreviewProjectDataset {
  sgwStatus: MetaModuleStatus;
  sedmsStatus: MetaModuleStatus;
  secmsStatus: MetaModuleStatus;
  sgwSummaryText: string;
  sedmsSummaryText: string;
  secmsSummaryText: string;
  secmsEntryUrl: string | null;
  sgwKpi: MetaKpiMap;
  sedmsKpi: MetaDrawingsKeyKpi;
  secmsKpi: MetaCablesKeyKpi;
  sgwItems: MetaKeyItem[];
  drawingItems: MetaKeyItem[];
  cableItems: MetaKeyItem[];
}

function buildProjectDataset(projectId: string, nowMs: number): PreviewProjectDataset {
  // proj01: 정상 케이스 (SEDMS 도면 + SEcMS 케이블 진척률 82/120, severity null, updatedAt null 샘플 포함)
  if (projectId === 'proj01') {
    const sedmsProjectEntry = '/api/sedms-sso?return=%2Fproject%2Fproj01';
    const secmsProjectEntry = '/api/secms-link';
    return {
      sgwStatus: 'active',
      sedmsStatus: 'warn',
      secmsStatus: 'active',
      sgwSummaryText: '접속 동료 4명 · 진행 작업 3건',
      sedmsSummaryText: '개정 도면 14건 · 결재 진행 2건',
      secmsSummaryText: '케이블 포설 82/120 (68%)',
      secmsEntryUrl: secmsProjectEntry,
      sgwKpi: { activeMembers: 4, openTasks: 3, notices: 2 },
      sedmsKpi: {
        drawingRevisionCount: 14,
        drawingPendingApproval: 2,
        urgentComments: null,
      },
      secmsKpi: {
        cablePullProgressPct: 68,
        cablesTotal: 120,
        cablesLaid: 82,
        cableTrayWarningCount: null,
      },
      sgwItems: [
        {
          id: 'sgw-proj01-task-01',
          moduleId: 'sgw',
          category: 'task',
          code: 'TSK-01',
          title: 'proj01 주요 도면 회람 확인 (dept01)',
          metric: '진행 중',
          severity: 'warn',
          updatedAt: isoAgo(nowMs, 2 * HOUR_MS),
          deepLinkUrl: '/talk/',
        },
        {
          id: 'sgw-proj01-notice-01',
          moduleId: 'sgw',
          category: 'notice',
          code: 'NTC-01',
          title: 'proj01 주간 공정 점검 공지',
          metric: '공지',
          severity: 'normal',
          updatedAt: isoAgo(nowMs, 10 * HOUR_MS),
          deepLinkUrl: '/talk/',
        },
      ],
      drawingItems: [
        {
          id: 'DWG-01|rev',
          moduleId: 'sedms',
          category: 'drawing',
          code: 'DWG-01',
          title: 'proj01 기관실 주배관 배치도 개정안',
          metric: '결재 진행',
          severity: null,
          updatedAt: isoAgo(nowMs, 1 * HOUR_MS),
          deepLinkUrl: sedmsProjectEntry,
        },
        {
          id: 'DWG-02|approval',
          moduleId: 'sedms',
          category: 'drawing',
          code: 'DWG-02',
          title: 'proj01 화물창 구조 보강 상세도',
          metric: '결재 진행',
          severity: null,
          updatedAt: isoAgo(nowMs, 6 * HOUR_MS),
          deepLinkUrl: sedmsProjectEntry,
        },
        {
          id: 'DWG-03|rev',
          moduleId: 'sedms',
          category: 'drawing',
          code: 'DWG-03',
          title: 'proj01 조타실 콘솔 배치 검토본',
          metric: 'Rev.03',
          severity: null,
          updatedAt: isoAgo(nowMs, 14 * HOUR_MS),
          deepLinkUrl: sedmsProjectEntry,
        },
        {
          id: 'DWG-04|latest',
          moduleId: 'sedms',
          category: 'drawing',
          code: 'DWG-04',
          title: 'proj01 일반배치 최신 배포본',
          metric: 'Rev.04',
          severity: null,
          updatedAt: null,
          deepLinkUrl: sedmsProjectEntry,
        },
      ],
      cableItems: [
        {
          id: 'CBL-01|unlaid',
          moduleId: 'secms',
          category: 'cable',
          code: 'CBL-01',
          title: 'proj01 기관실 주전원 간선 케이블',
          metric: '미포설',
          severity: null,
          updatedAt: isoAgo(nowMs, 3 * HOUR_MS),
          deepLinkUrl: secmsProjectEntry,
        },
        {
          id: 'CBL-02|laying',
          moduleId: 'secms',
          category: 'cable',
          code: 'CBL-02',
          title: 'proj01 조타실 제어 계장 케이블',
          metric: '포설 중',
          severity: null,
          updatedAt: isoAgo(nowMs, 8 * HOUR_MS),
          deepLinkUrl: secmsProjectEntry,
        },
        {
          id: 'CBL-03|unlaid',
          moduleId: 'secms',
          category: 'cable',
          code: 'CBL-03',
          title: 'proj01 갑판 조명 분기 케이블',
          metric: '미포설',
          severity: null,
          updatedAt: null,
          deepLinkUrl: secmsProjectEntry,
        },
      ],
    };
  }

  // proj02: null KPI 케이스 (cablesLaid: null, cablePullProgressPct: null -> 막대 대신 "—")
  if (projectId === 'proj02') {
    const sedmsProjectEntry = '/api/sedms-sso?return=%2Fproject%2Fproj02';
    const secmsProjectEntry = '/api/secms-link';
    return {
      sgwStatus: 'active',
      sedmsStatus: 'active',
      secmsStatus: 'active',
      sgwSummaryText: '협업 스레드 정상 운영 중 (미확인 알림 1건)',
      sedmsSummaryText: '개정 도면 4건 · 결재 진행 1건',
      secmsSummaryText: '케이블 총 90본 (포설 진척 집계 없음)',
      secmsEntryUrl: secmsProjectEntry,
      sgwKpi: { activeMembers: 3, openTasks: 2, notices: 1 },
      sedmsKpi: {
        drawingRevisionCount: 4,
        drawingPendingApproval: 1,
        urgentComments: null,
      },
      secmsKpi: {
        cablePullProgressPct: null,
        cablesTotal: 90,
        cablesLaid: null,
        cableTrayWarningCount: null,
      },
      sgwItems: [
        {
          id: 'sgw-proj02-task-01',
          moduleId: 'sgw',
          category: 'task',
          code: 'TSK-21',
          title: 'proj02 공정 회의록 검토 (dept02)',
          metric: '진행 중',
          severity: 'normal',
          updatedAt: isoAgo(nowMs, 3 * HOUR_MS),
          deepLinkUrl: '/talk/',
        },
        {
          id: 'sgw-proj02-notice-01',
          moduleId: 'sgw',
          category: 'notice',
          code: 'NTC-21',
          title: 'proj02 주간 설계 동기화 안내',
          metric: '공지',
          severity: 'normal',
          updatedAt: isoAgo(nowMs, 1 * DAY_MS),
          deepLinkUrl: '/talk/',
        },
      ],
      drawingItems: [
        {
          id: 'DWG-21|rev',
          moduleId: 'sedms',
          category: 'drawing',
          code: 'DWG-21',
          title: 'proj02 선체 구획 일반배치 개정안',
          metric: 'Rev.02',
          severity: null,
          updatedAt: isoAgo(nowMs, 4 * HOUR_MS),
          deepLinkUrl: sedmsProjectEntry,
        },
        {
          id: 'DWG-22|approval',
          moduleId: 'sedms',
          category: 'drawing',
          code: 'DWG-22',
          title: 'proj02 갑판 의장 배치 검토본',
          metric: '결재 진행',
          severity: null,
          updatedAt: isoAgo(nowMs, 18 * HOUR_MS),
          deepLinkUrl: sedmsProjectEntry,
        },
        {
          id: 'DWG-23|latest',
          moduleId: 'sedms',
          category: 'drawing',
          code: 'DWG-23',
          title: 'proj02 배관 계통도 최종 배포본',
          metric: '승인 완료',
          severity: null,
          updatedAt: null,
          deepLinkUrl: sedmsProjectEntry,
        },
      ],
      cableItems: [
        {
          id: 'CBL-21|unlaid',
          moduleId: 'secms',
          category: 'cable',
          code: 'CBL-21',
          title: 'proj02 선수 추진기 전원 케이블',
          metric: '미포설',
          severity: null,
          updatedAt: isoAgo(nowMs, 5 * HOUR_MS),
          deepLinkUrl: secmsProjectEntry,
        },
        {
          id: 'CBL-22|laying',
          moduleId: 'secms',
          category: 'cable',
          code: 'CBL-22',
          title: 'proj02 화물창 감시 통신 케이블',
          metric: '포설 중',
          severity: null,
          updatedAt: null,
          deepLinkUrl: secmsProjectEntry,
        },
      ],
    };
  }

  // proj03: SEcMS nosource + entryUrl '/api/secms-link' (계정 연결 필요 카드 + [SEcMS 연결] 버튼)
  if (projectId === 'proj03') {
    const sedmsProjectEntry = '/api/sedms-sso?return=%2Fproject%2Fproj03';
    return {
      sgwStatus: 'idle',
      sedmsStatus: 'active',
      secmsStatus: 'nosource',
      sgwSummaryText: '최근 활동 없음',
      sedmsSummaryText: '개정 도면 1건 · 결재 진행 0건',
      secmsSummaryText: 'SEcMS 계정 연결이 필요합니다',
      secmsEntryUrl: '/api/secms-link',
      sgwKpi: { activeMembers: 0, openTasks: 0 },
      sedmsKpi: {
        drawingRevisionCount: 1,
        drawingPendingApproval: 0,
        urgentComments: null,
      },
      secmsKpi: {
        cablePullProgressPct: null,
        cablesTotal: null,
        cablesLaid: null,
        cableTrayWarningCount: null,
      },
      sgwItems: [],
      drawingItems: [
        {
          id: 'DWG-31|latest',
          moduleId: 'sedms',
          category: 'drawing',
          code: 'DWG-31',
          title: 'proj03 기본 구조 단면도',
          metric: 'Rev.01',
          severity: null,
          updatedAt: isoAgo(nowMs, 2 * DAY_MS),
          deepLinkUrl: sedmsProjectEntry,
        },
      ],
      cableItems: [],
    };
  }

  // proj04 & other valid projects: SEcMS planned (준비 중) + honest idle state
  return {
    sgwStatus: 'idle',
    sedmsStatus: 'idle',
    secmsStatus: 'planned',
    sgwSummaryText: '최근 활동 없음',
    sedmsSummaryText: '등록된 핵심 도면 항목 없음',
    secmsSummaryText: '준비 중',
    secmsEntryUrl: null,
    sgwKpi: { activeMembers: 0, openTasks: 0 },
    sedmsKpi: {
      drawingRevisionCount: 0,
      drawingPendingApproval: 0,
      urgentComments: null,
    },
    secmsKpi: {},
    sgwItems: [],
    drawingItems: [],
    cableItems: [],
  };
}

export function getPreviewHubSummary(
  projectId: string,
  nowMs = Date.now(),
): MetaHubSummaryResponse {
  const ds = buildProjectDataset(projectId, nowMs);
  const sedmsEntry = `/api/sedms-sso?return=${encodeURIComponent(`/project/${projectId}`)}`;
  const secmsSummary: ModuleStatusSummary =
    ds.secmsStatus === 'planned'
      ? makePlannedSummary('secms')
      : {
          moduleId: 'secms',
          status: ds.secmsStatus,
          summaryText: ds.secmsSummaryText,
          kpi: ds.secmsKpi as MetaKpiMap,
          updatedAt: ds.secmsStatus === 'nosource' ? null : isoAgo(nowMs, 20 * 60 * 1000),
          entryUrl: ds.secmsEntryUrl,
        };

  const modules: ModuleStatusSummary[] = [
    {
      moduleId: 'sgw',
      status: ds.sgwStatus,
      summaryText: ds.sgwSummaryText,
      kpi: ds.sgwKpi,
      updatedAt: isoAgo(nowMs, 5 * 60 * 1000),
      entryUrl: '/talk/',
    },
    {
      moduleId: 'sedms',
      status: ds.sedmsStatus,
      summaryText: ds.sedmsSummaryText,
      kpi: ds.sedmsKpi as MetaKpiMap,
      updatedAt: isoAgo(nowMs, 15 * 60 * 1000),
      entryUrl: sedmsEntry,
    },
    secmsSummary,
    makePlannedSummary('s360'),
    makePlannedSummary('secad'),
    makePlannedSummary('pdf'),
    makePlannedSummary('mail'),
  ];

  return {
    projectId,
    generatedAt: new Date(nowMs).toISOString(),
    modules,
  };
}

export function getPreviewKeyDrawings(
  projectId: string,
  options?: { limit?: number; filter?: MetaDrawingsFilter; nowMs?: number },
): MetaDrawingsKeyResponse {
  const nowMs = options?.nowMs ?? Date.now();
  const filter = options?.filter ?? 'latest';
  const limit = Math.max(1, Math.min(100, options?.limit ?? 20));
  const ds = buildProjectDataset(projectId, nowMs);

  // Finalized SEDMS rule: filter=urgent -> { items: [], unsupported: true }
  if (filter === 'urgent') {
    return {
      status: ds.sedmsStatus,
      items: [],
      kpi: ds.sedmsKpi,
      unsupported: true,
    };
  }

  let filtered = ds.drawingItems;
  if (filter === 'pending') {
    filtered = filtered.filter((item) => String(item.metric).includes('결재'));
  }

  return {
    status: ds.sedmsStatus,
    items: filtered.slice(0, limit),
    kpi: ds.sedmsKpi,
  };
}

export function getPreviewKeyCables(
  projectId: string,
  options?: { warnPct?: number; limit?: number; nowMs?: number },
): MetaCablesKeyResponse {
  const nowMs = options?.nowMs ?? Date.now();
  const limit = Math.max(1, Math.min(100, options?.limit ?? 30));
  const ds = buildProjectDataset(projectId, nowMs);

  if (ds.secmsStatus === 'planned') {
    return {
      status: 'planned',
      items: [],
      entryUrl: null,
    };
  }

  if (ds.secmsStatus === 'nosource') {
    return {
      status: 'nosource',
      items: [],
      kpi: ds.secmsKpi,
      entryUrl: ds.secmsEntryUrl,
    };
  }

  return {
    status: ds.secmsStatus,
    items: ds.cableItems.slice(0, limit),
    kpi: ds.secmsKpi,
    entryUrl: ds.secmsEntryUrl,
  };
}

export function getPreviewSearchItems(
  projectId: string,
  options?: { q?: string; modules?: MetaModuleId[]; nowMs?: number },
): MetaItemsSearchResponse {
  const nowMs = options?.nowMs ?? Date.now();
  const ds = buildProjectDataset(projectId, nowMs);
  const requested =
    options?.modules && options.modules.length > 0
      ? options.modules
      : (['sgw', 'sedms', 'secms', 's360', 'secad', 'pdf', 'mail'] as MetaModuleId[]);

  const moduleSet = new Set<string>(requested);
  const moduleStatuses: Record<string, MetaModuleStatus> = {};
  for (const modId of requested) {
    if (modId === 'sgw') moduleStatuses[modId] = ds.sgwStatus;
    else if (modId === 'sedms') moduleStatuses[modId] = ds.sedmsStatus;
    else if (modId === 'secms') moduleStatuses[modId] = ds.secmsStatus;
    else moduleStatuses[modId] = 'planned';
  }

  const allItems: MetaKeyItem[] = [];
  if (moduleSet.has('sgw')) allItems.push(...ds.sgwItems);
  if (moduleSet.has('sedms')) allItems.push(...ds.drawingItems);
  if (moduleSet.has('secms') && (ds.secmsStatus === 'active' || ds.secmsStatus === 'idle' || ds.secmsStatus === 'warn')) {
    allItems.push(...ds.cableItems);
  }

  const query = (options?.q ?? '').trim().toLowerCase();
  const matched = query
    ? allItems.filter(
        (item) =>
          item.code.toLowerCase().includes(query) ||
          item.title.toLowerCase().includes(query) ||
          String(item.metric).toLowerCase().includes(query),
      )
    : allItems;

  return {
    items: matched,
    modules: moduleStatuses,
  };
}

export function getPreviewReportJson(
  projectId: string,
  days = 7,
  nowMs = Date.now(),
): MetaReportJsonResponse {
  const rangeDays = Math.max(1, Math.min(90, Math.round(days)));
  const ds = buildProjectDataset(projectId, nowMs);
  const secmsActive = ds.secmsStatus === 'active' || ds.secmsStatus === 'warn';
  const plannedCount = ds.secmsStatus === 'planned' ? 5 : 4;
  const activeCount = (ds.sgwStatus === 'active' || ds.sgwStatus === 'warn' ? 1 : 0)
    + (ds.sedmsStatus === 'active' || ds.sedmsStatus === 'warn' ? 1 : 0)
    + (secmsActive ? 1 : 0);

  return {
    reportVersion: '1.0',
    projectId,
    rangeDays,
    generatedAt: new Date(nowMs).toISOString(),
    executiveKpi: {
      activeModules: activeCount,
      plannedModules: plannedCount,
      drawingRevisionCount: ds.sedmsKpi.drawingRevisionCount ?? null,
      drawingPendingApproval: ds.sedmsKpi.drawingPendingApproval ?? null,
      urgentComments: null,
      cablePullProgressPct: ds.secmsKpi.cablePullProgressPct ?? null,
      cableTrayWarningCount: null,
      openTasks: ds.sgwKpi.openTasks ?? null,
    },
    sections: [
      {
        moduleId: 'sgw',
        status: ds.sgwStatus,
        highlights: ds.sgwItems.slice(0, 5),
      },
      {
        moduleId: 'sedms',
        status: ds.sedmsStatus,
        highlights: ds.drawingItems.slice(0, 5),
      },
      {
        moduleId: 'secms',
        status: ds.secmsStatus,
        highlights: secmsActive ? ds.cableItems.slice(0, 5) : [],
      },
      { moduleId: 's360', status: 'planned', highlights: [] },
      { moduleId: 'secad', status: 'planned', highlights: [] },
      { moduleId: 'pdf', status: 'planned', highlights: [] },
      { moduleId: 'mail', status: 'planned', highlights: [] },
    ],
    unavailableModules: [],
    integrity: {
      maskedResidue: 0,
      sourceHonesty: true,
    },
  };
}

export function getPreviewReportMarkdown(
  projectId: string,
  days = 7,
  nowMs = Date.now(),
): string {
  const report = getPreviewReportJson(projectId, days, nowMs);
  const lines: string[] = [
    `# ${report.projectId} 통합 주간 리포트 (최근 ${report.rangeDays}일)`,
    '',
    `- 생성 시각: ${report.generatedAt}`,
    `- 리포트 버전: v${report.reportVersion}`,
    `- 원천 정직성: ${report.integrity.sourceHonesty ? '검증됨' : '확인 필요'}`,
    '',
    '## 핵심 지표',
    ...Object.entries(report.executiveKpi).map(([k, v]) =>
      v === null ? `- ${k}: — (원천 없음)` : `- ${k}: ${formatNullableKpiValue(v)}`,
    ),
    '',
    '## 모듈별 요약',
  ];

  for (const section of report.sections) {
    lines.push(`### ${section.moduleId} (${section.status})`);
    if (section.highlights.length === 0) {
      lines.push(
        section.status === 'planned'
          ? '- 준비 중'
          : section.status === 'nosource'
            ? '- 원천 없음'
            : '- 주요 항목 없음',
      );
    } else {
      for (const item of section.highlights) {
        lines.push(`- [${item.code}] ${item.title} (${item.metric})`);
      }
    }
    lines.push('');
  }

  return lines.join('\n').trim() + '\n';
}
