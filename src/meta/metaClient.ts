/**
 * Unified SGW Meta Hub API Client (`/api/meta/*`, contract v1.0).
 *
 * SECURITY & RUNTIME CONTRACT:
 *   - Same-origin cookie auth ONLY (`credentials: 'same-origin'`, zero `Authorization` headers).
 *   - Runtime split via `detectRuntimeEnv()`:
 *       * `'sgw'`: calls real `/api/meta/*` via `fetch`. NEVER falls back to preview fixtures.
 *       * `'preview'`: returns DTO-identical pseudonym fixtures from `hubFixtures.ts` without network calls.
 *   - Every request enforces a 4-second `AbortController` timeout (`META_REQUEST_TIMEOUT_MS = 4000`).
 *   - Never throws; maps every HTTP / timeout / abort / network failure into typed `{ ok: false, code }`.
 *   - Never constructs deep-link URLs client-side; validates server-supplied `entryUrl` / `deepLinkUrl`
 *     with `isSafeNavigationUrl` and coerces unsafe values to `null`.
 */

import { isSafeNavigationUrl, isValidProjectId, SGW_LOGIN_REDIRECT_URL } from '../deepLink';
import { detectRuntimeEnv, type RuntimeEnv } from '../runtimeEnv';
import {
  getPreviewHubRegistry,
  getPreviewHubSummary,
  getPreviewKeyCables,
  getPreviewKeyDrawings,
  getPreviewReportJson,
  getPreviewReportMarkdown,
  getPreviewSearchItems,
} from './hubFixtures';
import type {
  MetaCablesKeyResponse,
  MetaClientError,
  MetaClientResult,
  MetaDrawingsFilter,
  MetaDrawingsKeyResponse,
  MetaErrorCode,
  MetaHubSummaryResponse,
  MetaItemCategory,
  MetaItemSeverity,
  MetaItemsSearchResponse,
  MetaKeyItem,
  MetaKpiMap,
  MetaModuleId,
  MetaModuleStatus,
  MetaRegistryModule,
  MetaRegistryResponse,
  MetaReportFormat,
  MetaReportJsonResponse,
  MetaReportResultData,
  MetaReportSection,
  ModuleStatusSummary,
} from './hubTypes';

export const META_REQUEST_TIMEOUT_MS = 4_000;

export type MetaFetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface MetaClientOptions {
  fetchImpl?: MetaFetchLike;
  runtimeEnv?: RuntimeEnv;
  signal?: AbortSignal;
  timeoutMs?: number;
  nowMs?: number;
}

const VALID_MODULE_STATUSES = new Set<MetaModuleStatus>([
  'active',
  'idle',
  'warn',
  'planned',
  'nosource',
  'unavailable',
]);

const VALID_ITEM_CATEGORIES = new Set<MetaItemCategory>([
  'drawing',
  'cable',
  'scan360',
  'cad3d',
  'pdf',
  'task',
  'notice',
]);

const VALID_ITEM_SEVERITIES = new Set<MetaItemSeverity>(['normal', 'warn', 'urgent']);

function resolveEnv(options?: MetaClientOptions): RuntimeEnv {
  return options?.runtimeEnv ?? detectRuntimeEnv();
}

function getFetch(options?: MetaClientOptions): MetaFetchLike {
  if (options?.fetchImpl) return options.fetchImpl;
  return globalThis.fetch.bind(globalThis);
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function asNullableString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeServerUrl(value: unknown): string | null {
  const raw = asNullableString(value);
  if (!raw) return null;
  return isSafeNavigationUrl(raw) ? raw : null;
}

function normalizeStatus(value: unknown): MetaModuleStatus {
  if (typeof value === 'string' && VALID_MODULE_STATUSES.has(value as MetaModuleStatus)) {
    return value as MetaModuleStatus;
  }
  return 'unavailable';
}

function normalizeCategory(value: unknown): MetaItemCategory {
  if (typeof value === 'string' && VALID_ITEM_CATEGORIES.has(value as MetaItemCategory)) {
    return value as MetaItemCategory;
  }
  return 'notice';
}

function normalizeSeverity(value: unknown): MetaItemSeverity | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (typeof value === 'string' && VALID_ITEM_SEVERITIES.has(value as MetaItemSeverity)) {
    return value as MetaItemSeverity;
  }
  return null;
}

function normalizeKpiMap(raw: unknown): MetaKpiMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: MetaKpiMap = {};
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (val === null) {
      out[key] = null;
    } else if (typeof val === 'number' && Number.isFinite(val)) {
      out[key] = val;
    } else if (typeof val === 'string') {
      out[key] = val;
    }
  }
  return out;
}

function normalizeKeyItem(raw: unknown): MetaKeyItem | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const id = asString(r.id);
  const moduleId = asString(r.moduleId);
  if (!id || !moduleId) return null;

  const rawMetric = r.metric;
  const metric: string | number =
    typeof rawMetric === 'number' && Number.isFinite(rawMetric)
      ? rawMetric
      : asString(rawMetric, '');

  return {
    id,
    moduleId,
    category: normalizeCategory(r.category),
    code: asString(r.code, id),
    title: asString(r.title, id),
    metric,
    severity: normalizeSeverity(r.severity),
    updatedAt: asNullableString(r.updatedAt),
    deepLinkUrl: sanitizeServerUrl(r.deepLinkUrl),
  };
}

function normalizeKeyItems(raw: unknown): MetaKeyItem[] {
  if (!Array.isArray(raw)) return [];
  const items: MetaKeyItem[] = [];
  for (const entry of raw) {
    const normalized = normalizeKeyItem(entry);
    if (normalized) items.push(normalized);
  }
  return items;
}

function normalizeModuleSummary(raw: unknown): ModuleStatusSummary | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const moduleId = asString(r.moduleId);
  if (!moduleId) return null;
  return {
    moduleId,
    status: normalizeStatus(r.status),
    summaryText: asString(r.summaryText, ''),
    kpi: normalizeKpiMap(r.kpi),
    updatedAt: asNullableString(r.updatedAt),
    entryUrl: sanitizeServerUrl(r.entryUrl),
  };
}

function isJsonContentType(res: Response): boolean {
  const ct = res.headers?.get?.('content-type') ?? '';
  return ct.toLowerCase().includes('application/json') || ct.toLowerCase().includes('+json');
}

function mapHttpAndBodyToMetaError(
  status: number,
  bodyCode?: string,
  bodyMessage?: string,
): MetaClientError {
  if (status === 401 || bodyCode === 'ERR_AUTH_REQUIRED') {
    return {
      ok: false,
      code: 'ERR_AUTH_REQUIRED',
      httpStatus: status || 401,
      redirectUrl: SGW_LOGIN_REDIRECT_URL,
      message: bodyMessage || 'SGW 로그인이 필요합니다.',
    };
  }
  if (status === 400 || bodyCode === 'ERR_INVALID_PROJECT_ID') {
    return {
      ok: false,
      code: 'ERR_INVALID_PROJECT_ID',
      httpStatus: status || 400,
      message: bodyMessage || '올바르지 않은 프로젝트 식별자입니다.',
    };
  }
  if (status === 403 || bodyCode === 'ERR_PROJECT_FORBIDDEN') {
    return {
      ok: false,
      code: 'ERR_PROJECT_FORBIDDEN',
      httpStatus: status || 403,
      message: bodyMessage || '접근 권한이 없는 프로젝트입니다. 허용된 프로젝트를 선택해 주세요.',
    };
  }
  if (status === 429 || bodyCode === 'ERR_RATE_LIMITED') {
    return {
      ok: false,
      code: 'ERR_RATE_LIMITED',
      httpStatus: status || 429,
      keepCachedView: true,
      message: bodyMessage || '요청이 많습니다. 잠시 후 다시 시도해 주세요.',
    };
  }
  return {
    ok: false,
    code: 'ERR_SERVER',
    httpStatus: status,
    message: bodyMessage || '허브 서버 응답 처리 중 일시 오류가 발생했습니다.',
  };
}

function invalidProjectError(projectId: string): MetaClientError {
  return {
    ok: false,
    code: 'ERR_INVALID_PROJECT_ID',
    httpStatus: 400,
    message: `올바르지 않은 프로젝트 식별자입니다: ${projectId || '(빈 값)'}`,
  };
}

function abortedError(reason: 'timeout' | 'aborted', timeoutMs: number): MetaClientError {
  if (reason === 'timeout') {
    return {
      ok: false,
      code: 'ERR_TIMEOUT',
      aborted: true,
      message: `요청 시간이 초과되었습니다 (${Math.round(timeoutMs / 1000)}초).`,
    };
  }
  return {
    ok: false,
    code: 'ERR_ABORTED',
    aborted: true,
    message: '요청이 취소되었습니다.',
  };
}

async function readErrorPayload(res: Response): Promise<{ code?: string; message?: string }> {
  try {
    if (!isJsonContentType(res)) return {};
    const parsed = (await res.json()) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== 'object') return {};
    const code = asString(parsed.code ?? parsed.error);
    const message = asString(parsed.message);
    return {
      code: code || undefined,
      message: message || undefined,
    };
  } catch {
    return {};
  }
}

async function executeMetaFetch(
  url: string,
  accept: string,
  options?: MetaClientOptions,
): Promise<{ ok: true; response: Response } | MetaClientError> {
  const timeoutMs =
    typeof options?.timeoutMs === 'number' && options.timeoutMs > 0
      ? options.timeoutMs
      : META_REQUEST_TIMEOUT_MS;

  if (options?.signal?.aborted) {
    return abortedError('aborted', timeoutMs);
  }

  const controller = new AbortController();
  let timedOut = false;
  let externalAborted = false;

  const onExternalAbort = () => {
    externalAborted = true;
    controller.abort();
  };
  options?.signal?.addEventListener('abort', onExternalAbort, { once: true });

  const timerId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const fetchFn = getFetch(options);
    const response = await fetchFn(url, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: accept },
      signal: controller.signal,
    });

    if (!response.ok) {
      const errPayload = await readErrorPayload(response);
      return mapHttpAndBodyToMetaError(response.status, errPayload.code, errPayload.message);
    }

    return { ok: true, response };
  } catch (err) {
    if (timedOut) {
      return abortedError('timeout', timeoutMs);
    }
    if (externalAborted || (err instanceof Error && err.name === 'AbortError')) {
      return abortedError('aborted', timeoutMs);
    }
    return {
      ok: false,
      code: 'ERR_NETWORK',
      message: '네트워크 연결 상태를 확인해 주세요.',
    };
  } finally {
    clearTimeout(timerId);
    options?.signal?.removeEventListener('abort', onExternalAbort);
  }
}

async function fetchMetaJson<T>(
  url: string,
  parse: (payload: Record<string, unknown>) => T | null,
  options?: MetaClientOptions,
): Promise<MetaClientResult<T>> {
  const res = await executeMetaFetch(url, 'application/json', options);
  if (!res.ok) return res;

  if (!isJsonContentType(res.response)) {
    return {
      ok: false,
      code: 'ERR_INVALID_RESPONSE',
      httpStatus: res.response.status,
      message: '허브 응답 형식이 올바르지 않습니다 (JSON 아님).',
    };
  }

  try {
    const raw = (await res.response.json()) as unknown;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return {
        ok: false,
        code: 'ERR_INVALID_RESPONSE',
        httpStatus: res.response.status,
        message: '허브 JSON 응답 구조가 올바르지 않습니다.',
      };
    }
    const parsed = parse(raw as Record<string, unknown>);
    if (!parsed) {
      return {
        ok: false,
        code: 'ERR_INVALID_RESPONSE',
        httpStatus: res.response.status,
        message: '허브 응답 필수 필드가 누락되었습니다.',
      };
    }
    return { ok: true, data: parsed, runtimeEnv: 'sgw' };
  } catch {
    return {
      ok: false,
      code: 'ERR_INVALID_RESPONSE',
      httpStatus: res.response.status,
      message: '허브 JSON 파싱에 실패했습니다.',
    };
  }
}

// ============================================================================
// 6 UNIFIED `/api/meta/*` HUB ENDPOINTS
// ============================================================================

/**
 * 1) GET /api/meta/registry
 */
export async function fetchMetaRegistry(
  options?: MetaClientOptions,
): Promise<MetaClientResult<MetaRegistryResponse>> {
  const env = resolveEnv(options);
  if (options?.signal?.aborted) {
    return abortedError('aborted', options.timeoutMs ?? META_REQUEST_TIMEOUT_MS);
  }
  if (env === 'preview') {
    return { ok: true, data: getPreviewHubRegistry(), runtimeEnv: 'preview' };
  }

  return fetchMetaJson<MetaRegistryResponse>(
    '/api/meta/registry',
    (raw) => {
      if (!Array.isArray(raw.modules)) return null;
      const modules: MetaRegistryModule[] = [];
      for (const entry of raw.modules) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
        const r = entry as Record<string, unknown>;
        const moduleId = asString(r.moduleId);
        if (!moduleId) continue;
        const capabilities = Array.isArray(r.capabilities)
          ? r.capabilities.filter((c): c is string => typeof c === 'string')
          : [];
        modules.push({
          moduleId,
          name: asString(r.name, moduleId),
          status: normalizeStatus(r.status),
          capabilities,
          entryUrl: sanitizeServerUrl(r.entryUrl),
        });
      }
      return { modules };
    },
    options,
  );
}

/**
 * 2) GET /api/meta/hub/summary?project=<id>&refresh=0|1
 */
export async function fetchMetaHubSummary(
  params: { project: string; refresh?: 0 | 1 | boolean },
  options?: MetaClientOptions,
): Promise<MetaClientResult<MetaHubSummaryResponse>> {
  if (!isValidProjectId(params.project)) {
    return invalidProjectError(params.project);
  }
  const env = resolveEnv(options);
  if (options?.signal?.aborted) {
    return abortedError('aborted', options.timeoutMs ?? META_REQUEST_TIMEOUT_MS);
  }
  if (env === 'preview') {
    return {
      ok: true,
      data: getPreviewHubSummary(params.project, options?.nowMs),
      runtimeEnv: 'preview',
    };
  }

  const refreshFlag = params.refresh === 1 || params.refresh === true ? '1' : '0';
  const qs = new URLSearchParams({
    project: params.project,
    refresh: refreshFlag,
  });

  return fetchMetaJson<MetaHubSummaryResponse>(
    `/api/meta/hub/summary?${qs.toString()}`,
    (raw) => {
      if (!Array.isArray(raw.modules)) return null;
      const modules: ModuleStatusSummary[] = [];
      for (const entry of raw.modules) {
        const normalized = normalizeModuleSummary(entry);
        if (normalized) modules.push(normalized);
      }
      return {
        projectId: asString(raw.projectId, params.project),
        generatedAt: asString(raw.generatedAt, new Date(options?.nowMs ?? Date.now()).toISOString()),
        modules,
      };
    },
    options,
  );
}

/**
 * 3) GET /api/meta/drawings/key?project=&limit=20&filter=latest|pending|urgent
 */
export async function fetchMetaKeyDrawings(
  params: { project: string; limit?: number; filter?: MetaDrawingsFilter },
  options?: MetaClientOptions,
): Promise<MetaClientResult<MetaDrawingsKeyResponse>> {
  if (!isValidProjectId(params.project)) {
    return invalidProjectError(params.project);
  }
  const env = resolveEnv(options);
  if (options?.signal?.aborted) {
    return abortedError('aborted', options.timeoutMs ?? META_REQUEST_TIMEOUT_MS);
  }

  const limit = Math.max(1, Math.min(100, Math.round(params.limit ?? 20)));
  const filter: MetaDrawingsFilter = params.filter ?? 'latest';

  if (env === 'preview') {
    return {
      ok: true,
      data: getPreviewKeyDrawings(params.project, { limit, filter, nowMs: options?.nowMs }),
      runtimeEnv: 'preview',
    };
  }

  const qs = new URLSearchParams({
    project: params.project,
    limit: String(limit),
    filter,
  });

  return fetchMetaJson<MetaDrawingsKeyResponse>(
    `/api/meta/drawings/key?${qs.toString()}`,
    (raw) => {
      if (!Array.isArray(raw.items)) return null;
      const out: MetaDrawingsKeyResponse = {
        status: normalizeStatus(raw.status),
        items: normalizeKeyItems(raw.items),
      };
      if (raw.kpi && typeof raw.kpi === 'object' && !Array.isArray(raw.kpi)) {
        out.kpi = normalizeKpiMap(raw.kpi);
      }
      if (raw.unsupported === true) {
        out.unsupported = true;
      }
      return out;
    },
    options,
  );
}

/**
 * 4) GET /api/meta/cables/key?project=&warnPct=85&limit=30
 */
export async function fetchMetaKeyCables(
  params: { project: string; warnPct?: number; limit?: number },
  options?: MetaClientOptions,
): Promise<MetaClientResult<MetaCablesKeyResponse>> {
  if (!isValidProjectId(params.project)) {
    return invalidProjectError(params.project);
  }
  const env = resolveEnv(options);
  if (options?.signal?.aborted) {
    return abortedError('aborted', options.timeoutMs ?? META_REQUEST_TIMEOUT_MS);
  }

  const warnPct = Math.max(1, Math.min(100, Math.round(params.warnPct ?? 85)));
  const limit = Math.max(1, Math.min(100, Math.round(params.limit ?? 30)));

  if (env === 'preview') {
    return {
      ok: true,
      data: getPreviewKeyCables(params.project, { warnPct, limit, nowMs: options?.nowMs }),
      runtimeEnv: 'preview',
    };
  }

  const qs = new URLSearchParams({
    project: params.project,
    warnPct: String(warnPct),
    limit: String(limit),
  });

  return fetchMetaJson<MetaCablesKeyResponse>(
    `/api/meta/cables/key?${qs.toString()}`,
    (raw) => {
      if (!Array.isArray(raw.items)) return null;
      const out: MetaCablesKeyResponse = {
        status: normalizeStatus(raw.status),
        items: normalizeKeyItems(raw.items),
      };
      if (raw.kpi && typeof raw.kpi === 'object' && !Array.isArray(raw.kpi)) {
        out.kpi = normalizeKpiMap(raw.kpi);
      }
      if ('entryUrl' in raw) {
        out.entryUrl = sanitizeServerUrl(raw.entryUrl);
      }
      return out;
    },
    options,
  );
}

/**
 * 5) GET /api/meta/items/search?project=&q=&modules=sgw,sedms
 */
export async function searchMetaItems(
  params: { project: string; q: string; modules?: MetaModuleId[] },
  options?: MetaClientOptions,
): Promise<MetaClientResult<MetaItemsSearchResponse>> {
  if (!isValidProjectId(params.project)) {
    return invalidProjectError(params.project);
  }
  const env = resolveEnv(options);
  if (options?.signal?.aborted) {
    return abortedError('aborted', options.timeoutMs ?? META_REQUEST_TIMEOUT_MS);
  }

  const cleanModules = (params.modules ?? [])
    .map((m) => m.trim())
    .filter((m) => m.length > 0);

  if (env === 'preview') {
    return {
      ok: true,
      data: getPreviewSearchItems(params.project, {
        q: params.q,
        modules: cleanModules.length > 0 ? cleanModules : undefined,
        nowMs: options?.nowMs,
      }),
      runtimeEnv: 'preview',
    };
  }

  const qs = new URLSearchParams({
    project: params.project,
    q: params.q,
  });
  if (cleanModules.length > 0) {
    qs.set('modules', cleanModules.join(','));
  }

  return fetchMetaJson<MetaItemsSearchResponse>(
    `/api/meta/items/search?${qs.toString()}`,
    (raw) => {
      if (!Array.isArray(raw.items)) return null;
      const modules: Record<string, MetaModuleStatus> = {};
      if (raw.modules && typeof raw.modules === 'object' && !Array.isArray(raw.modules)) {
        for (const [modId, modStatus] of Object.entries(raw.modules as Record<string, unknown>)) {
          modules[modId] = normalizeStatus(modStatus);
        }
      }
      return {
        items: normalizeKeyItems(raw.items),
        modules,
      };
    },
    options,
  );
}

/**
 * 6) GET /api/meta/reports/generate?project=&days=7&format=json|md
 */
export async function generateMetaReport(
  params: { project: string; days?: number; format?: MetaReportFormat },
  options?: MetaClientOptions,
): Promise<MetaClientResult<MetaReportResultData>> {
  if (!isValidProjectId(params.project)) {
    return invalidProjectError(params.project);
  }
  const env = resolveEnv(options);
  if (options?.signal?.aborted) {
    return abortedError('aborted', options.timeoutMs ?? META_REQUEST_TIMEOUT_MS);
  }

  const days = Math.max(1, Math.min(90, Math.round(params.days ?? 7)));
  const format: MetaReportFormat = params.format === 'md' ? 'md' : 'json';

  if (env === 'preview') {
    if (format === 'md') {
      return {
        ok: true,
        data: { format: 'md', markdown: getPreviewReportMarkdown(params.project, days, options?.nowMs) },
        runtimeEnv: 'preview',
      };
    }
    return {
      ok: true,
      data: { format: 'json', report: getPreviewReportJson(params.project, days, options?.nowMs) },
      runtimeEnv: 'preview',
    };
  }

  const qs = new URLSearchParams({
    project: params.project,
    days: String(days),
    format,
  });
  const url = `/api/meta/reports/generate?${qs.toString()}`;

  if (format === 'md') {
    const res = await executeMetaFetch(url, 'text/markdown, text/plain', options);
    if (!res.ok) return res;
    try {
      const markdown = await res.response.text();
      return {
        ok: true,
        data: { format: 'md', markdown },
        runtimeEnv: 'sgw',
      };
    } catch {
      return {
        ok: false,
        code: 'ERR_INVALID_RESPONSE',
        httpStatus: res.response.status,
        message: '마크다운 리포트 응답을 읽지 못했습니다.',
      };
    }
  }

  const jsonRes = await fetchMetaJson<MetaReportJsonResponse>(
    url,
    (raw) => {
      if (!Array.isArray(raw.sections)) return null;
      const sections: MetaReportSection[] = [];
      for (const entry of raw.sections) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
        const r = entry as Record<string, unknown>;
        const moduleId = asString(r.moduleId);
        if (!moduleId) continue;
        sections.push({
          moduleId,
          status: normalizeStatus(r.status),
          highlights: normalizeKeyItems(r.highlights),
        });
      }
      const unavailableModules = Array.isArray(raw.unavailableModules)
        ? raw.unavailableModules.filter((m): m is string => typeof m === 'string')
        : [];
      const rawIntegrity =
        raw.integrity && typeof raw.integrity === 'object' && !Array.isArray(raw.integrity)
          ? (raw.integrity as Record<string, unknown>)
          : {};
      const rawResidue = rawIntegrity.maskedResidue;
      const maskedResidue =
        typeof rawResidue === 'number' && Number.isFinite(rawResidue)
          ? rawResidue
          : rawResidue === false
            ? 0
            : rawResidue === true
              ? 1
              : -1;
      return {
        reportVersion: asString(raw.reportVersion, '1.0'),
        projectId: asString(raw.projectId, params.project),
        rangeDays:
          typeof raw.rangeDays === 'number' && Number.isFinite(raw.rangeDays)
            ? raw.rangeDays
            : days,
        generatedAt: asString(
          raw.generatedAt,
          new Date(options?.nowMs ?? Date.now()).toISOString(),
        ),
        executiveKpi: normalizeKpiMap(raw.executiveKpi),
        sections,
        unavailableModules,
        integrity: {
          maskedResidue,
          sourceHonesty: rawIntegrity.sourceHonesty !== false,
        },
      };
    },
    options,
  );

  if (!jsonRes.ok) return jsonRes;
  return {
    ok: true,
    data: { format: 'json', report: jsonRes.data },
    runtimeEnv: jsonRes.runtimeEnv,
  };
}

// ============================================================================
// PROJECT-SWITCH REQUEST COORDINATOR (ANTI-RACE CONDITION UTILITY)
// ============================================================================

export interface CoordinatedRequestOutcome<T> {
  stale: boolean;
  projectId: string;
  result: MetaClientResult<T> | null;
}

export interface ProjectRequestCoordinator {
  /** Active project ID (null if none selected yet). */
  getActiveProjectId: () => string | null;
  /** Switches active project, immediately aborting all in-flight requests from the previous project. */
  switchProject: (nextProjectId: string | null) => void;
  /**
   * Executes a request bound to `projectId` and optional `channelKey` (e.g. `'summary'`, `'search'`).
   * - If another request on the same `channelKey` is in-flight, aborts the earlier one.
   * - If the active project changes while in-flight, aborts the signal and discards any late result
   *   (`{ stale: true, result: null }`).
   */
  run: <T>(
    projectId: string,
    channelKey: string,
    executor: (signal: AbortSignal) => Promise<MetaClientResult<T>>,
  ) => Promise<CoordinatedRequestOutcome<T>>;
  /** Aborts all currently tracked requests and invalidates pending completions. */
  cancelAll: () => void;
}

export function createProjectRequestCoordinator(
  initialProjectId: string | null = null,
): ProjectRequestCoordinator {
  let activeProjectId: string | null = initialProjectId;
  let projectGeneration = 0;
  let requestSeq = 0;
  const activeControllers = new Set<AbortController>();
  const channelControllers = new Map<string, { seq: number; controller: AbortController }>();
  const channelLatestSeq = new Map<string, number>();

  const abortAllActive = () => {
    for (const ctrl of activeControllers) {
      ctrl.abort();
    }
    activeControllers.clear();
    channelControllers.clear();
    channelLatestSeq.clear();
  };

  return {
    getActiveProjectId: () => activeProjectId,

    switchProject: (nextProjectId: string | null) => {
      if (nextProjectId === activeProjectId) return;
      activeProjectId = nextProjectId;
      projectGeneration += 1;
      abortAllActive();
    },

    run: async <T>(
      projectId: string,
      channelKey: string,
      executor: (signal: AbortSignal) => Promise<MetaClientResult<T>>,
    ): Promise<CoordinatedRequestOutcome<T>> => {
      // Auto-initialize active project if none set yet; otherwise reject mismatched project immediately
      if (activeProjectId === null) {
        activeProjectId = projectId;
      } else if (activeProjectId !== projectId) {
        return { stale: true, projectId, result: null };
      }

      const capturedGeneration = projectGeneration;
      const seq = ++requestSeq;

      // Supersede any in-flight request on the same channel (e.g. rapid search / filter toggle)
      const prevChannel = channelControllers.get(channelKey);
      if (prevChannel) {
        prevChannel.controller.abort();
        activeControllers.delete(prevChannel.controller);
      }

      const controller = new AbortController();
      activeControllers.add(controller);
      channelControllers.set(channelKey, { seq, controller });
      channelLatestSeq.set(channelKey, seq);

      try {
        const result = await executor(controller.signal);
        const isStale =
          capturedGeneration !== projectGeneration ||
          activeProjectId !== projectId ||
          channelLatestSeq.get(channelKey) !== seq;

        if (isStale) {
          return { stale: true, projectId, result: null };
        }
        return { stale: false, projectId, result };
      } finally {
        activeControllers.delete(controller);
        const currentChannel = channelControllers.get(channelKey);
        if (currentChannel?.seq === seq) {
          channelControllers.delete(channelKey);
        }
      }
    },

    cancelAll: () => {
      projectGeneration += 1;
      abortAllActive();
    },
  };
}

export type { MetaErrorCode };
