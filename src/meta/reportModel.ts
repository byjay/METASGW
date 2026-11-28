/**
 * Pure presentation & filename helpers for the Unified Hub Report Modal (Stage 4 + Stage 6).
 *
 * Guarantees:
 *   - Only KPI keys actually present in `executiveKpi` are rendered (never fabricates absent keys).
 *   - Null KPI values are NEVER hidden or coerced to 0: rendered as "—" with "원천 없음" tooltip.
 *   - Integrity badge shows "검증됨" strictly when `integrity.maskedResidue === 0`.
 *   - Download filename strictly follows `report-<projectId>-<YYYY-MM-DD>.md`.
 */

import {
  NULL_KPI_PLACEHOLDER,
  type MetaKpiMap,
  type MetaModuleId,
  type MetaRegistryResponse,
  type MetaReportIntegrity,
} from './hubTypes';
import { resolveMetaModuleName } from './keyItemsModel';

export const REPORT_RANGE_DAYS_OPTIONS = [7, 14, 30] as const;
export type ReportRangeDays = (typeof REPORT_RANGE_DAYS_OPTIONS)[number];

export interface ExecutiveKpiCardItem {
  key: string;
  label: string;
  value: string;
  /** True when the server returned `null` (no data source) — rendered as "—" with "원천 없음" tooltip. */
  isNull: boolean;
  tooltip: string | null;
}

const KNOWN_KPI_LABELS: Readonly<Record<string, string>> = {
  activeModules: '가동 시스템',
  plannedModules: '준비 중 시스템',
  unavailableModules: '일시 오류 시스템',
  drawingRevisionCount: '개정 도면',
  drawingPendingApproval: '결재 진행 도면',
  urgentComments: '긴급 코멘트',
  cablePullProgressPct: '케이블 포설 진척률',
  cablesTotal: '전체 케이블',
  cablesLaid: '포설 완료 케이블',
  cableTrayWarningCount: '트레이 경고',
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

const PERCENT_KPI_KEYS = new Set<string>(['cablePullProgressPct']);

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
 * - Strictly omits absent (`undefined`) keys — zero fabricated metrics.
 * - Preserves `null` KPIs as value `"—"` with `isNull: true` and `tooltip: "원천 없음"` (never hidden, never 0).
 */
export function formatExecutiveKpiCards(
  executiveKpi: Readonly<MetaKpiMap> | null | undefined,
): ExecutiveKpiCardItem[] {
  if (!executiveKpi) return [];
  const cards: ExecutiveKpiCardItem[] = [];
  for (const [key, rawVal] of Object.entries(executiveKpi)) {
    if (rawVal === undefined) continue;
    const label = KNOWN_KPI_LABELS[key] ?? humanizeUnknownKpiKey(key);

    if (rawVal === null) {
      cards.push({
        key,
        label,
        value: NULL_KPI_PLACEHOLDER,
        isNull: true,
        tooltip: '원천 없음',
      });
      continue;
    }

    if (typeof rawVal === 'number') {
      if (!Number.isFinite(rawVal)) {
        cards.push({
          key,
          label,
          value: NULL_KPI_PLACEHOLDER,
          isNull: true,
          tooltip: '원천 없음',
        });
        continue;
      }
      const formatted = rawVal.toLocaleString('ko-KR');
      const valueStr = PERCENT_KPI_KEYS.has(key) ? `${formatted}%` : formatted;
      cards.push({
        key,
        label,
        value: valueStr,
        isNull: false,
        tooltip: null,
      });
      continue;
    }

    const trimmed = String(rawVal).trim();
    if (!trimmed) continue;
    cards.push({
      key,
      label,
      value: trimmed,
      isNull: false,
      tooltip: null,
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
