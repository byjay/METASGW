/**
 * METASGW x SGW Unified Hub (`/api/meta/*`) DTO Contract (v1.0).
 *
 * Pure type definitions & status honesty helpers shared across the hub client,
 * preview fixtures, and upcoming UI views.
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

export interface ModuleStatusSummary {
  moduleId: MetaModuleId;
  status: MetaModuleStatus;
  summaryText: string;
  kpi: Record<string, number | string>;
  updatedAt: string | null;
  entryUrl: string | null;
}

export interface MetaKeyItem {
  id: string;
  moduleId: MetaModuleId;
  category: MetaItemCategory;
  code: string;
  title: string;
  metric: string | number;
  severity: MetaItemSeverity;
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

export interface MetaDrawingsKeyResponse {
  status: MetaModuleStatus;
  items: MetaKeyItem[];
}

/** GET /api/meta/cables/key?project=&warnPct=85&limit=30 */
export interface MetaCablesKeyResponse {
  status: MetaModuleStatus;
  items: MetaKeyItem[];
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
  executiveKpi: Record<string, number | string>;
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
