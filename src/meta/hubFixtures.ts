/**
 * Pseudonym-only `/api/meta/*` preview fixtures used EXCLUSIVELY in `'preview'` mode.
 *
 * STRICT HONESTY & PRIVACY RULES:
 *   - NEVER imported or returned when `runtimeEnv === 'sgw'`.
 *   - Zero real names, real emails, customer orgs, hull numbers, or internal domains.
 *   - 7 modules: `sgw` & `sedms` are `active` / `warn`; `secms`, `s360`, `secad`, `pdf`, `mail`
 *     are strictly `planned` with empty `kpi: {}`, `updatedAt: null`, and `entryUrl: null`.
 *   - SEDMS entry/deep links strictly follow `/api/sedms-sso?return=...`.
 */

import type {
  MetaCablesKeyResponse,
  MetaDrawingsFilter,
  MetaDrawingsKeyResponse,
  MetaHubSummaryResponse,
  MetaItemsSearchResponse,
  MetaKeyItem,
  MetaModuleId,
  MetaModuleStatus,
  MetaRegistryModule,
  MetaRegistryResponse,
  MetaReportJsonResponse,
  ModuleStatusSummary,
} from './hubTypes';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function isoAgo(nowMs: number, offsetMs: number): string {
  return new Date(nowMs - offsetMs).toISOString();
}

export const PREVIEW_HUB_PROJECT_IDS = ['proj01', 'proj02'] as const;
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
      name: 'SECMS 케이블',
      status: 'planned',
      capabilities: [],
      entryUrl: null,
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
  sgwSummaryText: string;
  sedmsSummaryText: string;
  sgwKpi: Record<string, number | string>;
  sedmsKpi: Record<string, number | string>;
  sgwItems: MetaKeyItem[];
  drawingItems: MetaKeyItem[];
}

function buildProjectDataset(projectId: string, nowMs: number): PreviewProjectDataset {
  if (projectId === 'proj02') {
    const sedmsProjectEntry = '/api/sedms-sso?return=%2Fproject%2Fproj02';
    return {
      sgwStatus: 'active',
      sedmsStatus: 'active',
      sgwSummaryText: '협업 스레드 정상 운영 중 (미확인 알림 1건)',
      sedmsSummaryText: '최근 7일 도면 개정 4건 · 승인 대기 1건',
      sgwKpi: { activeMembers: 3, openTasks: 2, notices: 1 },
      sedmsKpi: { recentDrawings: 4, pendingApprovals: 1, urgentItems: 0 },
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
          id: 'sedms-proj02-dwg-01',
          moduleId: 'sedms',
          category: 'drawing',
          code: 'DWG-21',
          title: 'proj02 선체 구획 일반배치 개정안',
          metric: 'Rev.02',
          severity: 'normal',
          updatedAt: isoAgo(nowMs, 4 * HOUR_MS),
          deepLinkUrl: sedmsProjectEntry,
        },
        {
          id: 'sedms-proj02-dwg-02',
          moduleId: 'sedms',
          category: 'drawing',
          code: 'DWG-22',
          title: 'proj02 갑판 의장 배치 검토본',
          metric: '승인 대기',
          severity: 'warn',
          updatedAt: isoAgo(nowMs, 18 * HOUR_MS),
          deepLinkUrl: sedmsProjectEntry,
        },
        {
          id: 'sedms-proj02-dwg-03',
          moduleId: 'sedms',
          category: 'drawing',
          code: 'DWG-23',
          title: 'proj02 배관 계통도 최종 배포본',
          metric: '승인 완료',
          severity: 'normal',
          updatedAt: isoAgo(nowMs, 2 * DAY_MS),
          deepLinkUrl: sedmsProjectEntry,
        },
      ],
    };
  }

  if (projectId === 'proj01') {
    const sedmsProjectEntry = '/api/sedms-sso?return=%2Fproject%2Fproj01';
    return {
      sgwStatus: 'active',
      sedmsStatus: 'warn',
      sgwSummaryText: '접속 동료 4명 · 진행 작업 3건',
      sedmsSummaryText: '긴급 검토 1건 · 승인 대기 2건 확인 필요',
      sgwKpi: { activeMembers: 4, openTasks: 3, notices: 2 },
      sedmsKpi: { recentDrawings: 6, pendingApprovals: 2, urgentItems: 1 },
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
          id: 'sedms-proj01-dwg-01',
          moduleId: 'sedms',
          category: 'drawing',
          code: 'DWG-01',
          title: 'proj01 기관실 주배관 배치도 긴급 수정',
          metric: '긴급 검토',
          severity: 'urgent',
          updatedAt: isoAgo(nowMs, 1 * HOUR_MS),
          deepLinkUrl: sedmsProjectEntry,
        },
        {
          id: 'sedms-proj01-dwg-02',
          moduleId: 'sedms',
          category: 'drawing',
          code: 'DWG-02',
          title: 'proj01 화물창 구조 보강 상세도',
          metric: '승인 대기',
          severity: 'warn',
          updatedAt: isoAgo(nowMs, 6 * HOUR_MS),
          deepLinkUrl: sedmsProjectEntry,
        },
        {
          id: 'sedms-proj01-dwg-03',
          moduleId: 'sedms',
          category: 'drawing',
          code: 'DWG-03',
          title: 'proj01 조타실 콘솔 배치 검토본',
          metric: '승인 대기',
          severity: 'warn',
          updatedAt: isoAgo(nowMs, 14 * HOUR_MS),
          deepLinkUrl: sedmsProjectEntry,
        },
        {
          id: 'sedms-proj01-dwg-04',
          moduleId: 'sedms',
          category: 'drawing',
          code: 'DWG-04',
          title: 'proj01 일반배치 최신 배포본',
          metric: 'Rev.04',
          severity: 'normal',
          updatedAt: isoAgo(nowMs, 2 * DAY_MS),
          deepLinkUrl: sedmsProjectEntry,
        },
      ],
    };
  }

  // Other valid preview projects (e.g. proj03, proj04): honest idle/planned state without fabricated counts
  return {
    sgwStatus: 'idle',
    sedmsStatus: 'idle',
    sgwSummaryText: '최근 활동 없음',
    sedmsSummaryText: '등록된 핵심 도면 항목 없음',
    sgwKpi: { activeMembers: 0, openTasks: 0 },
    sedmsKpi: { recentDrawings: 0, pendingApprovals: 0 },
    sgwItems: [],
    drawingItems: [],
  };
}

export function getPreviewHubSummary(
  projectId: string,
  nowMs = Date.now(),
): MetaHubSummaryResponse {
  const ds = buildProjectDataset(projectId, nowMs);
  const sedmsEntry = `/api/sedms-sso?return=${encodeURIComponent(`/project/${projectId}`)}`;
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
      kpi: ds.sedmsKpi,
      updatedAt: isoAgo(nowMs, 15 * 60 * 1000),
      entryUrl: sedmsEntry,
    },
    makePlannedSummary('secms'),
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

  let filtered = ds.drawingItems;
  if (filter === 'urgent') {
    filtered = filtered.filter((item) => item.severity === 'urgent');
  } else if (filter === 'pending') {
    filtered = filtered.filter((item) => item.severity === 'warn' || item.severity === 'urgent');
  }

  return {
    status: ds.sedmsStatus,
    items: filtered.slice(0, limit),
  };
}

export function getPreviewKeyCables(
  _projectId: string,
  _options?: { warnPct?: number; limit?: number; nowMs?: number },
): MetaCablesKeyResponse {
  // Honest preview fixture: secms is 'planned', so zero fabricated cable items are emitted.
  return {
    status: 'planned',
    items: [],
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
    else moduleStatuses[modId] = 'planned';
  }

  const allItems: MetaKeyItem[] = [];
  if (moduleSet.has('sgw')) allItems.push(...ds.sgwItems);
  if (moduleSet.has('sedms')) allItems.push(...ds.drawingItems);

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

  return {
    reportVersion: '1.0',
    projectId,
    rangeDays,
    generatedAt: new Date(nowMs).toISOString(),
    executiveKpi: {
      activeModules: 2,
      plannedModules: 5,
      recentDrawings: ds.sedmsKpi.recentDrawings ?? 0,
      pendingApprovals: ds.sedmsKpi.pendingApprovals ?? 0,
      openTasks: ds.sgwKpi.openTasks ?? 0,
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
      { moduleId: 'secms', status: 'planned', highlights: [] },
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
    ...Object.entries(report.executiveKpi).map(([k, v]) => `- ${k}: ${v}`),
    '',
    '## 모듈별 요약',
  ];

  for (const section of report.sections) {
    lines.push(`### ${section.moduleId} (${section.status})`);
    if (section.highlights.length === 0) {
      lines.push(section.status === 'planned' ? '- 준비 중' : '- 주요 항목 없음');
    } else {
      for (const item of section.highlights) {
        lines.push(`- [${item.code}] ${item.title} (${item.metric})`);
      }
    }
    lines.push('');
  }

  return lines.join('\n').trim() + '\n';
}
