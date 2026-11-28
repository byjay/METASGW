/**
 * Pure presentation, filtering, relative-time, cable-progress, and module-honesty helpers
 * for the Ship "핵심 항목" tab (Stage 3 + Stage 6 finalized SEDMS/SEcMS contract).
 *
 * Strictly data-driven:
 *   - Never fabricates placeholder rows for `planned` / `nosource` / `unavailable` modules.
 *   - Never fabricates 0 for `null` KPI numbers (renders "—").
 *   - Never parses opaque `item.id` strings (e.g. SEDMS `"도번|목록종류"`).
 *   - Never constructs `deepLinkUrl` / `entryUrl` client-side; validates server-supplied URLs only.
 */

import { isSafeNavigationUrl } from '../deepLink';
import {
  getMetaModuleStatusLabel,
  isNormalModuleStatus,
  NULL_KPI_PLACEHOLDER,
  shouldRenderItemSeverityBadge,
  type MetaCablesKeyResponse,
  type MetaDrawingsKeyResponse,
  type MetaItemCategory,
  type MetaItemSeverity,
  type MetaKeyItem,
  type MetaModuleId,
  type MetaModuleStatus,
  type MetaRegistryResponse,
} from './hubTypes';

export const KEY_ITEMS_SEARCH_DEBOUNCE_MS = 300;
export const DRAWINGS_URGENT_UNSUPPORTED_MESSAGE = 'SEDMS 에 긴급 구분이 없습니다';
export const SECMS_LINK_REQUIRED_MESSAGE = 'SEcMS 계정 연결이 필요합니다';
export const SECMS_LINK_BUTTON_LABEL = 'SEcMS 연결';

export type KeyItemsFilter = 'all' | 'drawing' | 'cable' | 'urgent';

export interface KeyItemsFilterOption {
  id: KeyItemsFilter;
  label: string;
}

export const KEY_ITEMS_FILTER_OPTIONS: readonly KeyItemsFilterOption[] = [
  { id: 'all', label: '전체' },
  { id: 'drawing', label: '도면' },
  { id: 'cable', label: '케이블' },
  { id: 'urgent', label: '긴급' },
];

export type CableStatusSubFilter = 'all' | 'unlaid' | 'laying';

export interface CableStatusSubFilterOption {
  id: CableStatusSubFilter;
  label: string;
}

export const CABLE_STATUS_SUBFILTER_OPTIONS: readonly CableStatusSubFilterOption[] = [
  { id: 'all', label: '전체' },
  { id: 'unlaid', label: '미포설' },
  { id: 'laying', label: '포설 중' },
];

export interface CableProgressSummary {
  /** True ONLY when both cablesLaid and cablesTotal are non-null finite numbers with cablesTotal > 0. */
  hasNumbers: boolean;
  cablesLaid: number | null;
  cablesTotal: number | null;
  progressPct: number | null;
  /** Formatted ratio string (e.g. "82 / 120 (68%)") or "—" when missing. */
  displayText: string;
}

export interface SecmsLinkRequirement {
  required: boolean;
  entryUrl: string | null;
  message: string;
  buttonLabel: string;
}

export interface ModuleStatusNotice {
  moduleId: MetaModuleId;
  moduleName: string;
  status: MetaModuleStatus;
  statusLabel: string;
  description: string;
}

export interface ResolvedKeyItemLink {
  href: string | null;
  disabled: boolean;
  disabledReason: string | null;
}

export interface CombinedKeyItemsResult {
  items: MetaKeyItem[];
  moduleStatuses: Record<string, MetaModuleStatus>;
}

const DEFAULT_MODULE_NAMES: Readonly<Record<string, string>> = {
  sgw: 'SGW 그룹웨어',
  sedms: 'SEDMS 도면관리',
  secms: 'SEcMS 케이블',
  s360: '360° 현장스캔',
  secad: '3D CAD 뷰어',
  pdf: 'PDF 검토실',
  mail: '업무 메일',
};

const MODULE_NON_NORMAL_DESCRIPTION: Readonly<Record<'planned' | 'nosource' | 'unavailable', string>> = {
  planned: '연동 예정 시스템입니다. 준비가 완료되면 자동으로 표시됩니다.',
  nosource: '이 프로젝트에 연결된 원천 데이터가 없습니다.',
  unavailable: '일시적으로 응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요.',
};

const SEVERITY_PRIORITY: Readonly<Record<MetaItemSeverity, number>> = {
  urgent: 0,
  warn: 1,
  normal: 2,
};

export const SEVERITY_LABEL_KO: Readonly<Record<MetaItemSeverity, string>> = {
  urgent: '긴급',
  warn: '주의',
  normal: '일반',
};

export const CATEGORY_LABEL_KO: Readonly<Record<MetaItemCategory, string>> = {
  drawing: '도면',
  cable: '케이블',
  scan360: '360° 스캔',
  cad3d: '3D CAD',
  pdf: 'PDF',
  task: '작업',
  notice: '공지',
};

export function resolveMetaModuleName(
  moduleId: MetaModuleId,
  registry?: MetaRegistryResponse | null,
): string {
  const fromRegistry = registry?.modules.find((m) => m.moduleId === moduleId)?.name;
  if (fromRegistry && fromRegistry.trim().length > 0) {
    return fromRegistry.trim();
  }
  return DEFAULT_MODULE_NAMES[moduleId] ?? moduleId;
}

function parseTimestampMs(iso: string | null): number {
  if (!iso) return 0;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Formats an ISO timestamp into concise Korean relative time (`방금 전`, `12분 전`, `3시간 전`, `2일 전`).
 * When `updatedAt` is null or invalid, returns `"날짜 없음"` per finalized Stage 6 contract.
 */
export function formatRelativeUpdatedAt(updatedAt: string | null, nowMs = Date.now()): string {
  if (!updatedAt) return '날짜 없음';
  const ts = Date.parse(updatedAt);
  if (!Number.isFinite(ts)) return '날짜 없음';

  const diffSec = Math.max(0, Math.floor((nowMs - ts) / 1000));
  if (diffSec < 60) return '방금 전';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}시간 전`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}일 전`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}개월 전`;
  return `${Math.floor(diffDays / 365)}년 전`;
}

function getSeverityRank(item: Pick<MetaKeyItem, 'severity' | 'severityProvided'>): number {
  if (!shouldRenderItemSeverityBadge(item) || item.severity === null) return 3;
  return SEVERITY_PRIORITY[item.severity] ?? 3;
}

/**
 * Sorts `MetaKeyItem` entries by severity (`urgent` > `warn` > `normal` > `null`/unprovided), then newest `updatedAt`.
 */
export function sortKeyItems(items: readonly MetaKeyItem[]): MetaKeyItem[] {
  return [...items].sort((a, b) => {
    const sevDiff = getSeverityRank(a) - getSeverityRank(b);
    if (sevDiff !== 0) return sevDiff;
    const timeDiff = parseTimestampMs(b.updatedAt) - parseTimestampMs(a.updatedAt);
    if (timeDiff !== 0) return timeDiff;
    return a.code.localeCompare(b.code);
  });
}

/**
 * Combines `/api/meta/drawings/key` and `/api/meta/cables/key` responses without fabricating items.
 * Non-normal module responses emit zero items and record their honest status in `moduleStatuses`.
 * Treats every `item.id` as an opaque deduplication key (never parses `"도번|목록종류"`).
 */
export function combineKeyItemSources(
  drawings: MetaDrawingsKeyResponse | null,
  cables: MetaCablesKeyResponse | null,
): CombinedKeyItemsResult {
  const moduleStatuses: Record<string, MetaModuleStatus> = {};
  const combined: MetaKeyItem[] = [];
  const seenIds = new Set<string>();

  if (drawings) {
    moduleStatuses.sedms = drawings.status;
    if (isNormalModuleStatus(drawings.status)) {
      for (const item of drawings.items) {
        if (!seenIds.has(item.id)) {
          seenIds.add(item.id);
          combined.push(item);
        }
      }
    }
  }

  if (cables) {
    moduleStatuses.secms = cables.status;
    if (isNormalModuleStatus(cables.status)) {
      for (const item of cables.items) {
        if (!seenIds.has(item.id)) {
          seenIds.add(item.id);
          combined.push(item);
        }
      }
    }
  }

  return {
    items: sortKeyItems(combined),
    moduleStatuses,
  };
}

/**
 * Filters `MetaKeyItem` list according to the active tab chip (`전체` / `도면` / `케이블` / `긴급`).
 */
export function filterKeyItems(
  items: readonly MetaKeyItem[],
  filter: KeyItemsFilter,
): MetaKeyItem[] {
  if (filter === 'all') return [...items];
  if (filter === 'drawing') return items.filter((item) => item.category === 'drawing');
  if (filter === 'cable') return items.filter((item) => item.category === 'cable');
  return items.filter((item) => shouldRenderItemSeverityBadge(item) && item.severity === 'urgent');
}

/**
 * Filters cable items by SEcMS status (`전체` / `미포설` / `포설 중`).
 */
export function filterCableItemsByStatus(
  items: readonly MetaKeyItem[],
  subFilter: CableStatusSubFilter,
): MetaKeyItem[] {
  if (subFilter === 'all') return [...items];
  const target = subFilter === 'unlaid' ? '미포설' : '포설 중';
  return items.filter(
    (item) => item.category === 'cable' && String(item.metric).trim() === target,
  );
}

/**
 * Counts cable items by SEcMS metric status (`미포설` / `포설 중`).
 */
export function countCableItemsByStatus(
  items: readonly MetaKeyItem[],
): Record<CableStatusSubFilter, number> {
  let all = 0;
  let unlaid = 0;
  let laying = 0;
  for (const item of items) {
    if (item.category !== 'cable') continue;
    all += 1;
    const metric = String(item.metric).trim();
    if (metric === '미포설') unlaid += 1;
    else if (metric === '포설 중') laying += 1;
  }
  return { all, unlaid, laying };
}

/**
 * Extracts cable laying progress strictly from `cablesLaid` and `cablesTotal`.
 * If either value is `null` (or `cablesTotal <= 0`), returns `hasNumbers: false` and `displayText: "—"`
 * so the UI renders "—" instead of a progress bar (never fabricates 0).
 */
export function extractCableProgressSummary(
  cables: MetaCablesKeyResponse | null | undefined,
): CableProgressSummary {
  const kpi = cables?.kpi;
  const rawLaid = kpi?.cablesLaid;
  const rawTotal = kpi?.cablesTotal;
  const rawPct = kpi?.cablePullProgressPct;

  const cablesLaid =
    typeof rawLaid === 'number' && Number.isFinite(rawLaid) && rawLaid >= 0 ? rawLaid : null;
  const cablesTotal =
    typeof rawTotal === 'number' && Number.isFinite(rawTotal) && rawTotal >= 0 ? rawTotal : null;

  if (cablesLaid === null || cablesTotal === null || cablesTotal <= 0) {
    return {
      hasNumbers: false,
      cablesLaid,
      cablesTotal,
      progressPct: null,
      displayText: NULL_KPI_PLACEHOLDER,
    };
  }

  const computedPct =
    typeof rawPct === 'number' && Number.isFinite(rawPct)
      ? Math.round(Math.max(0, Math.min(100, rawPct)))
      : Math.round(Math.max(0, Math.min(100, (cablesLaid / cablesTotal) * 100)));

  return {
    hasNumbers: true,
    cablesLaid,
    cablesTotal,
    progressPct: computedPct,
    displayText: `${cablesLaid.toLocaleString('ko-KR')} / ${cablesTotal.toLocaleString('ko-KR')} (${computedPct}%)`,
  };
}

/**
 * Detects SEcMS account-linking requirement strictly when `status === 'nosource'`
 * AND server supplied a safe `entryUrl` (e.g. `'/api/secms-link'`).
 */
export function getSecmsLinkRequirement(
  cables: MetaCablesKeyResponse | null | undefined,
): SecmsLinkRequirement {
  const rawUrl = typeof cables?.entryUrl === 'string' ? cables.entryUrl.trim() : '';
  const validUrl = rawUrl && isSafeNavigationUrl(rawUrl) ? rawUrl : null;

  if (cables?.status === 'nosource' && validUrl) {
    return {
      required: true,
      entryUrl: validUrl,
      message: SECMS_LINK_REQUIRED_MESSAGE,
      buttonLabel: SECMS_LINK_BUTTON_LABEL,
    };
  }

  return {
    required: false,
    entryUrl: null,
    message: SECMS_LINK_REQUIRED_MESSAGE,
    buttonLabel: SECMS_LINK_BUTTON_LABEL,
  };
}

/**
 * Computes per-filter counts for the filter chips.
 */
export function countKeyItemsByFilter(
  items: readonly MetaKeyItem[],
): Record<KeyItemsFilter, number> {
  let drawing = 0;
  let cable = 0;
  let urgent = 0;
  for (const item of items) {
    if (item.category === 'drawing') drawing += 1;
    if (item.category === 'cable') cable += 1;
    if (shouldRenderItemSeverityBadge(item) && item.severity === 'urgent') urgent += 1;
  }
  return {
    all: items.length,
    drawing,
    cable,
    urgent,
  };
}

/**
 * Extracts honest non-normal (`planned` / `nosource` / `unavailable`) module status cards.
 * - In browse mode (drawings/key + cables/key): filters relevant modules for `도면` (`sedms`) or `케이블` (`secms`).
 * - In search mode (`items/search`): returns EVERY non-normal module from `response.modules`
 *   so the UI can explicitly display **"검색 안 된 시스템"**.
 */
export function getNonNormalModuleNotices(
  moduleStatuses: Readonly<Record<string, MetaModuleStatus>>,
  options?: {
    filter?: KeyItemsFilter;
    isSearchMode?: boolean;
    registry?: MetaRegistryResponse | null;
  },
): ModuleStatusNotice[] {
  const filter = options?.filter ?? 'all';
  const isSearchMode = options?.isSearchMode ?? false;
  const registry = options?.registry ?? null;

  const notices: ModuleStatusNotice[] = [];
  for (const [moduleId, status] of Object.entries(moduleStatuses)) {
    if (isNormalModuleStatus(status)) continue;

    if (!isSearchMode) {
      if (filter === 'drawing' && moduleId !== 'sedms') continue;
      if (filter === 'cable' && moduleId !== 'secms') continue;
    }

    const nonNormalStatus = status as 'planned' | 'nosource' | 'unavailable';
    notices.push({
      moduleId,
      moduleName: resolveMetaModuleName(moduleId, registry),
      status,
      statusLabel: getMetaModuleStatusLabel(status),
      description: MODULE_NON_NORMAL_DESCRIPTION[nonNormalStatus],
    });
  }

  return notices;
}

/**
 * Strictly validates server-provided `deepLinkUrl` (never constructs URLs client-side).
 */
export function resolveKeyItemLink(item: Pick<MetaKeyItem, 'deepLinkUrl'>): ResolvedKeyItemLink {
  const raw = typeof item.deepLinkUrl === 'string' ? item.deepLinkUrl.trim() : '';
  if (!raw || !isSafeNavigationUrl(raw)) {
    return {
      href: null,
      disabled: true,
      disabledReason: '연결 경로가 제공되지 않아 이동할 수 없습니다.',
    };
  }
  return {
    href: raw,
    disabled: false,
    disabledReason: null,
  };
}
