/**
 * METASGW x SGW Unified Hub (`/api/meta/*`) DTO Contract (v1.0 + Stage 6 finalized SEDMS/SEcMS rules).
 *
 * Pure type definitions & status/null honesty helpers shared across the hub client,
 * preview fixtures, and UI views.
 */

import type { RuntimeEnv } from '../runtimeEnv';

export type MetaModuleId =
  | 'sgw'
  | 'sedms'
  | 'secms'
  | 's360'
  | 'secad'
  | 'pdf'
  | 'mail'
  | string;

export type MetaModuleStatus =
  | 'active'
  | 'idle'
  | 'warn'
  | 'planned'
  | 'nosource'
  | 'unavailable';

export type MetaItemCategory =
  | 'drawing'
  | 'cable'
  | 'scan360'
  | 'cad3d'
  | 'pdf'
  | 'task'
  | 'notice';

export type MetaItemSeverity = 'normal' | 'warn' | 'urgent';

/** Null KPI numbers must be rendered as em-dash ("—"), never fabricated as 0. */
export const NULL_KPI_PLACEHOLDER = '—';

export type MetaKpiValue = number | string | null;
export type MetaKpiMap = Record<string, MetaKpiValue>;

export interface ModuleStatusSummary {
  moduleId: MetaModuleId;
  status: MetaModuleStatus;
  summaryText: string;
  kpi: MetaKpiMap;
  updatedAt: string | null;
  entryUrl: string | null;
}

export interface MetaKeyItem {
  /** Opaque server-supplied identifier (e.g. SEDMS "도번|목록종류"); never parse client-side. */
  id: string;
  moduleId: MetaModuleId;
  category: MetaItemCategory;
  code: string;
  title: string;
  metric: string | number;
  /** Null when the source system (SEDMS/SEcMS) has no severity concept — hide badge when null. */
  severity: MetaItemSeverity | null;
  /** False when the source system (e.g. SEDMS) provides no severity; suppress all severity badges including '일반'. */
  severityProvided?: boolean;
  /** Null when source lacks a date — render "날짜 없음". */
  updatedAt: string | null;
  deepLinkUrl: string | null;
}

/** GET /api/meta/registry */
export interface MetaRegistryModule {
  moduleId: MetaModuleId;
  name: string;
  status: MetaModuleStatus;
  capabilities: string[];
  entryUrl: string | null;
}

export interface MetaRegistryResponse {
  modules: MetaRegistryModule[];
}

/** GET /api/meta/hub/summary?project=<id>&refresh=0|1 */
export interface MetaHubSummaryResponse {
  projectId: string;
  generatedAt: string;
  modules: ModuleStatusSummary[];
}

/** GET /api/meta/drawings/key?project=&limit=20&filter=latest|pending|urgent */
export type MetaDrawingsFilter = 'latest' | 'pending' | 'urgent';

export interface MetaDrawingsKeyKpi {
  drawingRevisionCount?: number | null;
  drawingPendingApproval?: number | null;
  urgentComments?: number | null;
  [key: string]: MetaKpiValue | undefined;
}

export interface MetaDrawingsKeyResponse {
  status: MetaModuleStatus;
  items: MetaKeyItem[];
  kpi?: MetaDrawingsKeyKpi;
  /** True when the source (SEDMS) does not support the requested filter (e.g. filter=urgent). */
  unsupported?: boolean;
}

/** GET /api/meta/cables/key?project=&warnPct=85&limit=30 */
export interface MetaCablesKeyKpi {
  cablePullProgressPct?: number | null;
  cablesTotal?: number | null;
  cablesLaid?: number | null;
  cableTrayWarningCount?: number | null;
  [key: string]: MetaKpiValue | undefined;
}

export interface MetaCablesKeyResponse {
  status: MetaModuleStatus;
  items: MetaKeyItem[];
  kpi?: MetaCablesKeyKpi;
  /** Server-supplied account-link or entry URL (e.g. '/api/secms-link' when status==='nosource'). */
  entryUrl?: string | null;
}

/** GET /api/meta/items/search?project=&q=&modules=sgw,sedms */
export interface MetaItemsSearchResponse {
  items: MetaKeyItem[];
  modules: Record<string, MetaModuleStatus>;
}

/** GET /api/meta/reports/generate?project=&days=7&format=json|md */
export type MetaReportFormat = 'json' | 'md';

export interface MetaReportSection {
  moduleId: MetaModuleId;
  status: MetaModuleStatus;
  highlights: MetaKeyItem[];
}

export interface MetaReportIntegrity {
  maskedResidue: number;
  sourceHonesty: boolean;
}

export interface MetaReportJsonResponse {
  reportVersion: string;
  projectId: string;
  rangeDays: number;
  generatedAt: string;
  executiveKpi: MetaKpiMap;
  sections: MetaReportSection[];
  unavailableModules: MetaModuleId[];
  integrity: MetaReportIntegrity;
}

export type MetaReportResultData =
  | { format: 'json'; report: MetaReportJsonResponse }
  | { format: 'md'; markdown: string };

/** Typed client error codes (never throws — always returned as { ok: false, code }) */
export type MetaErrorCode =
  | 'ERR_AUTH_REQUIRED'
  | 'ERR_INVALID_PROJECT_ID'
  | 'ERR_PROJECT_FORBIDDEN'
  | 'ERR_RATE_LIMITED'
  | 'ERR_TIMEOUT'
  | 'ERR_ABORTED'
  | 'ERR_NETWORK'
  | 'ERR_INVALID_RESPONSE'
  | 'ERR_SERVER';

export interface MetaClientSuccess<T> {
  ok: true;
  data: T;
  runtimeEnv: RuntimeEnv;
}

export interface MetaClientError {
  ok: false;
  code: MetaErrorCode;
  message: string;
  httpStatus?: number;
  redirectUrl?: string;
  keepCachedView?: boolean;
  aborted?: boolean;
}

export type MetaClientResult<T> = MetaClientSuccess<T> | MetaClientError;

export const META_MODULE_STATUS_LABELS: Readonly<Record<MetaModuleStatus, string>> = {
  active: '정상',
  idle: '대기',
  warn: '주의',
  planned: '준비 중',
  nosource: '원천 없음',
  unavailable: '일시 오류',
};

export function getMetaModuleStatusLabel(status: MetaModuleStatus): string {
  return META_MODULE_STATUS_LABELS[status] ?? '일시 오류';
}

export function isNormalModuleStatus(status: MetaModuleStatus): boolean {
  return status === 'active' || status === 'idle' || status === 'warn';
}

/**
 * Formats a nullable KPI value honestly: `null`/`undefined`/non-finite => "—", never 0.
 */
export function formatNullableKpiValue(
  value: MetaKpiValue | undefined,
  options?: { suffix?: string },
): string {
  if (value === null || value === undefined) return NULL_KPI_PLACEHOLDER;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return NULL_KPI_PLACEHOLDER;
    const formatted = value.toLocaleString('ko-KR');
    return options?.suffix ? `${formatted}${options.suffix}` : formatted;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : NULL_KPI_PLACEHOLDER;
}

/**
 * Returns true ONLY when the source system actually provides severity (`severityProvided !== false`)
 * AND `severity` is non-null. Suppresses all badges (including '일반') when `severityProvided === false`.
 */
export function shouldRenderItemSeverityBadge(
  item: Pick<MetaKeyItem, 'severity' | 'severityProvided'>,
): boolean {
  if (item.severityProvided === false) return false;
  return item.severity !== null;
}

