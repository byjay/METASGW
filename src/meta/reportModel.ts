/**
 * Pure presentation & filename helpers for the Unified Hub Report Modal (Stage 4/5).
 *
 * Guarantees:
 *   - Only KPI keys actually present in `executiveKpi` are rendered (never fabricates missing keys).
 *   - Integrity badge shows "검증됨" strictly when `integrity.maskedResidue === 0`.
 *   - Download filename strictly follows `report-<projectId>-<YYYY-MM-DD>.md`.
 */

import type {
  MetaModuleId,
  MetaReportIntegrity,
  MetaRegistryResponse,
} from './hubTypes';
import { resolveMetaModuleName } from './keyItemsModel';

export const REPORT_RANGE_DAYS_OPTIONS = [7, 14, 30] as const;
export type ReportRangeDays = (typeof REPORT_RANGE_DAYS_OPTIONS)[number];

export interface ExecutiveKpiCardItem {
  key: string;
  label: string;
  value: string;
}

const KNOWN_KPI_LABELS: Readonly<Record<string, string>> = {
  activeModules: '가동 시스템',
  plannedModules: '준비 중 시스템',
  unavailableModules: '일시 오류 시스템',
  recentDrawings: '최근 도면',
  pendingApprovals: '승인 대기',
  urgentItems: '긴급 항목',
  openTasks: '진행 작업',
  activeMembers: '활동 인원',
  notices: '공지 사항',
  cableWarnings: '케이블 주의',
  totalHighlights: '핵심 항목',
  totalItems: '전체 항목',
  completedTasks: '완료 작업',
  drawingsCount: '도면 수',
  cablesCount: '케이블 수',
};

function humanizeUnknownKpiKey(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
  if (!spaced) return key;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Converts `executiveKpi` into display cards using human-readable labels.
 * Strictly omits absent keys — zero fabricated metrics.
 */
export function formatExecutiveKpiCards(
  executiveKpi: Readonly<Record<string, number | string>> | null | undefined,
): ExecutiveKpiCardItem[] {
  if (!executiveKpi) return [];
  const cards: ExecutiveKpiCardItem[] = [];
  for (const [key, rawVal] of Object.entries(executiveKpi)) {
    if (rawVal === undefined || rawVal === null) continue;
    const valueStr =
      typeof rawVal === 'number'
        ? Number.isFinite(rawVal)
          ? rawVal.toLocaleString('ko-KR')
          : ''
        : String(rawVal).trim();
    if (!valueStr) continue;
    cards.push({
      key,
      label: KNOWN_KPI_LABELS[key] ?? humanizeUnknownKpiKey(key),
      value: valueStr,
    });
  }
  return cards;
}

/**
 * Returns true ONLY when `integrity.maskedResidue === 0`.
 */
export function isReportIntegrityVerified(
  integrity: MetaReportIntegrity | null | undefined,
): boolean {
  return Boolean(integrity && integrity.maskedResidue === 0);
}

/**
 * Formats report download filename strictly as `report-<projectId>-<YYYY-MM-DD>.md`.
 */
export function buildReportDownloadFilename(
  projectId: string,
  generatedAtIso?: string | null,
  nowMs = Date.now(),
): string {
  const safeProject = projectId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'project';
  let datePart = new Date(nowMs).toISOString().slice(0, 10);
  if (generatedAtIso) {
    const parsed = Date.parse(generatedAtIso);
    if (Number.isFinite(parsed)) {
      datePart = new Date(parsed).toISOString().slice(0, 10);
    }
  }
  return `report-${safeProject}-${datePart}.md`;
}

/**
 * Resolves unavailable module IDs into display names for the report warning line.
 */
export function resolveUnavailableModuleNames(
  unavailableModules: readonly MetaModuleId[] | null | undefined,
  registry?: MetaRegistryResponse | null,
): string[] {
  if (!unavailableModules || unavailableModules.length === 0) return [];
  const unique = Array.from(new Set(unavailableModules));
  return unique.map((modId) => resolveMetaModuleName(modId, registry));
}

/**
 * Formats an ISO timestamp for display inside the ReportModal header.
 */
export function formatReportGeneratedAt(iso: string | null | undefined): string {
  if (!iso) return '-';
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return iso;
  const d = new Date(parsed);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
