/**
 * SGW API Integration & Two-Way Communication Verifier.
 *
 * SECURITY CONTRACT:
 *   - Makes ZERO direct `fetch()` calls; delegates 100% through `src/sgwAdapter.ts`
 *     and `src/meta/metaClient.ts` (preserving same-origin cookie auth, zero Authorization
 *     headers, zero client-claimed identity bodies, and 4s AbortController timeout).
 *   - Verifies both directions of SGW communication:
 *       * Inbound (SGW -> Client): `/auth/me`, `/api/employees`, `/api/presence` GET,
 *         `/api/gateway/sedms/projects`, `/api/meta/registry`, `/api/meta/hub/summary`,
 *         `/api/meta/drawings/key`, `/api/meta/cables/key`, `/api/meta/items/search`,
 *         `/api/meta/reports/generate`.
 *       * Outbound (Client -> SGW) & Roundtrip: `POST /api/presence` heartbeat followed by
 *         `GET /api/presence` reflection check + `GET /api/meta/hub/summary?refresh=1` force sync.
 */

import { detectRuntimeEnv, type RuntimeEnv } from '../runtimeEnv';
import {
  fetchAuthMe,
  fetchEmployees,
  fetchPresence,
  fetchSedmsProjects,
  postPresenceHeartbeat,
  type FetchLike,
} from '../sgwAdapter';
import {
  fetchMetaHubSummary,
  fetchMetaKeyCables,
  fetchMetaKeyDrawings,
  fetchMetaRegistry,
  generateMetaReport,
  searchMetaItems,
  type MetaFetchLike,
} from './metaClient';

export type VerificationCheckStatus = 'pass' | 'warn' | 'fail';

export interface SgwVerificationStep {
  id: string;
  endpoint: string;
  direction: 'inbound' | 'outbound' | 'roundtrip';
  label: string;
  status: VerificationCheckStatus;
  latencyMs: number;
  detail: string;
}

export interface SgwTwoWayVerificationReport {
  runtimeEnv: RuntimeEnv;
  executedAtIso: string;
  projectId: string;
  totalDurationMs: number;
  passCount: number;
  warnCount: number;
  failCount: number;
  twoWayPresenceOk: boolean;
  hubRefreshRoundtripOk: boolean;
  steps: SgwVerificationStep[];
}

export interface SgwVerificationOptions {
  runtimeEnv?: RuntimeEnv;
  projectId?: string;
  fetchImpl?: FetchLike & MetaFetchLike;
  nowMs?: number;
}

function nowTime(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

/**
 * Runs a complete non-destructive SGW API & two-way communication check across all 11 endpoints.
 */
export async function runSgwTwoWayVerification(
  options?: SgwVerificationOptions,
): Promise<SgwTwoWayVerificationReport> {
  const runtimeEnv = options?.runtimeEnv ?? detectRuntimeEnv();
  const fetchImpl = options?.fetchImpl;
  const startedAt = nowTime();
  const steps: SgwVerificationStep[] = [];

  let currentSub: string | null = null;
  let resolvedProjectId = options?.projectId?.trim() || '';

  // 1. GET /auth/me (Inbound Session Auth)
  {
    const t0 = nowTime();
    const res = await fetchAuthMe({ runtimeEnv, fetchImpl });
    const latencyMs = Math.max(0, Math.round(nowTime() - t0));
    if (res.status === 'authenticated') {
      currentSub = res.user.sub;
      steps.push({
        id: 'auth-me',
        endpoint: 'GET /auth/me',
        direction: 'inbound',
        label: 'SGW 세션 인증 확인',
        status: 'pass',
        latencyMs,
        detail: `${res.user.name} (${res.user.dept} · ${res.user.role})`,
      });
    } else {
      steps.push({
        id: 'auth-me',
        endpoint: 'GET /auth/me',
        direction: 'inbound',
        label: 'SGW 세션 인증 확인',
        status: 'fail',
        latencyMs,
        detail: `${res.status}: ${res.message}`,
      });
    }
  }

  // 2. GET /api/employees (Inbound Directory)
  {
    const t0 = nowTime();
    const res = await fetchEmployees({ runtimeEnv, fetchImpl });
    const latencyMs = Math.max(0, Math.round(nowTime() - t0));
    if (res.status === 'ok') {
      steps.push({
        id: 'employees',
        endpoint: 'GET /api/employees',
        direction: 'inbound',
        label: '사내 직원 디렉터리 (sub 키)',
        status: 'pass',
        latencyMs,
        detail: `${res.employees.length}명 수신 완료`,
      });
    } else {
      steps.push({
        id: 'employees',
        endpoint: 'GET /api/employees',
        direction: 'inbound',
        label: '사내 직원 디렉터리 (sub 키)',
        status: 'fail',
        latencyMs,
        detail: res.status === 'unauthenticated' ? '401 세션 만료' : res.message,
      });
    }
  }

  // 3. POST /api/presence (Outbound Heartbeat — Client -> SGW)
  let heartbeatOk = false;
  {
    const t0 = nowTime();
    heartbeatOk = await postPresenceHeartbeat({ runtimeEnv, fetchImpl });
    const latencyMs = Math.max(0, Math.round(nowTime() - t0));
    steps.push({
      id: 'presence-post',
      endpoint: 'POST /api/presence',
      direction: 'outbound',
      label: '상호 교신 송신 (하트비트)',
      status: heartbeatOk ? 'pass' : 'fail',
      latencyMs,
      detail: heartbeatOk
        ? '동일 오리진 쿠키 기반 무본문 하트비트 송신 성공'
        : '하트비트 송신 실패 (네트워크 또는 401/5xx)',
    });
  }

  // 4. GET /api/presence (Inbound Presence Sync & Self-Reflection Check)
  let presenceReceiveOk = false;
  let selfReflected = false;
  {
    const t0 = nowTime();
    const res = await fetchPresence({ runtimeEnv, fetchImpl, nowMs: options?.nowMs });
    const latencyMs = Math.max(0, Math.round(nowTime() - t0));
    if (res.status === 'ok') {
      presenceReceiveOk = true;
      selfReflected = currentSub ? res.entries.some((e) => e.sub === currentSub) : res.entries.length > 0;
      steps.push({
        id: 'presence-get',
        endpoint: 'GET /api/presence',
        direction: 'roundtrip',
        label: '상호 교신 수신 (접속 동기화)',
        status: selfReflected ? 'pass' : 'warn',
        latencyMs,
        detail: selfReflected
          ? `${res.entries.length}명 상태 수신 · 본인(${currentSub ?? '-'}) 반영 확인`
          : `${res.entries.length}명 상태 수신 · 본인 하트비트 반영 대기 중`,
      });
    } else {
      steps.push({
        id: 'presence-get',
        endpoint: 'GET /api/presence',
        direction: 'roundtrip',
        label: '상호 교신 수신 (접속 동기화)',
        status: 'fail',
        latencyMs,
        detail: res.status === 'unauthenticated' ? '401 세션 만료' : res.message,
      });
    }
  }

  // 5. GET /api/gateway/sedms/projects (SEDMS Gateway)
  {
    const t0 = nowTime();
    const res = await fetchSedmsProjects({
      runtimeEnv,
      fetchImpl,
      forceRefresh: true,
      nowMs: options?.nowMs,
    });
    const latencyMs = Math.max(0, Math.round(nowTime() - t0));
    if (res.status === 'ready') {
      if (!resolvedProjectId && res.projects[0]) {
        resolvedProjectId = res.projects[0].id;
      }
      steps.push({
        id: 'sedms-projects',
        endpoint: 'GET /api/gateway/sedms/projects',
        direction: 'inbound',
        label: 'SEDMS 프로젝트 게이트웨이',
        status: 'pass',
        latencyMs,
        detail: `매핑됨 · 프로젝트 ${res.projects.length}건 수신`,
      });
    } else if (res.status === 'unmapped' || res.status === 'unavailable' || res.status === 'pending') {
      steps.push({
        id: 'sedms-projects',
        endpoint: 'GET /api/gateway/sedms/projects',
        direction: 'inbound',
        label: 'SEDMS 프로젝트 게이트웨이',
        status: 'warn',
        latencyMs,
        detail: `${res.status}: ${res.message}`,
      });
    } else {
      steps.push({
        id: 'sedms-projects',
        endpoint: 'GET /api/gateway/sedms/projects',
        direction: 'inbound',
        label: 'SEDMS 프로젝트 게이트웨이',
        status: 'fail',
        latencyMs,
        detail: `${res.status}: ${res.message}`,
      });
    }
  }

  if (!resolvedProjectId) {
    resolvedProjectId = 'proj01';
  }

  // 6. GET /api/meta/registry
  {
    const t0 = nowTime();
    const res = await fetchMetaRegistry({ runtimeEnv, fetchImpl });
    const latencyMs = Math.max(0, Math.round(nowTime() - t0));
    if (res.ok) {
      steps.push({
        id: 'meta-registry',
        endpoint: 'GET /api/meta/registry',
        direction: 'inbound',
        label: '통합 허브 레지스트리 (v1.0)',
        status: 'pass',
        latencyMs,
        detail: `모듈 ${res.data.modules.length}개 등록 (${res.data.modules.map((m) => m.moduleId).join(', ')})`,
      });
    } else {
      steps.push({
        id: 'meta-registry',
        endpoint: 'GET /api/meta/registry',
        direction: 'inbound',
        label: '통합 허브 레지스트리 (v1.0)',
        status: 'fail',
        latencyMs,
        detail: `${res.code}: ${res.message}`,
      });
    }
  }

  // 7. GET /api/meta/hub/summary?project=<id>&refresh=1 (Force Refresh Roundtrip)
  let hubRefreshRoundtripOk = false;
  {
    const t0 = nowTime();
    const res = await fetchMetaHubSummary(
      { project: resolvedProjectId, refresh: 1 },
      { runtimeEnv, fetchImpl, nowMs: options?.nowMs },
    );
    const latencyMs = Math.max(0, Math.round(nowTime() - t0));
    if (res.ok) {
      hubRefreshRoundtripOk = true;
      const normalCount = res.data.modules.filter(
        (m) => m.status === 'active' || m.status === 'idle' || m.status === 'warn',
      ).length;
      steps.push({
        id: 'meta-hub-summary',
        endpoint: `GET /api/meta/hub/summary?project=${resolvedProjectId}&refresh=1`,
        direction: 'roundtrip',
        label: '허브 요약 강제 갱신 교신',
        status: 'pass',
        latencyMs,
        detail: `모듈 ${res.data.modules.length}개 중 정상 계열 ${normalCount}개 · 생성시각 수신`,
      });
    } else {
      steps.push({
        id: 'meta-hub-summary',
        endpoint: `GET /api/meta/hub/summary?project=${resolvedProjectId}&refresh=1`,
        direction: 'roundtrip',
        label: '허브 요약 강제 갱신 교신',
        status: res.code === 'ERR_RATE_LIMITED' ? 'warn' : 'fail',
        latencyMs,
        detail: `${res.code}: ${res.message}`,
      });
    }
  }

  // 8. GET /api/meta/drawings/key
  {
    const t0 = nowTime();
    const res = await fetchMetaKeyDrawings(
      { project: resolvedProjectId, limit: 10, filter: 'latest' },
      { runtimeEnv, fetchImpl, nowMs: options?.nowMs },
    );
    const latencyMs = Math.max(0, Math.round(nowTime() - t0));
    if (res.ok) {
      steps.push({
        id: 'meta-drawings',
        endpoint: `GET /api/meta/drawings/key?project=${resolvedProjectId}`,
        direction: 'inbound',
        label: 'SEDMS 핵심 도면 계약',
        status: res.data.status === 'unavailable' ? 'warn' : 'pass',
        latencyMs,
        detail: `status=${res.data.status} · 항목 ${res.data.items.length}건`,
      });
    } else {
      steps.push({
        id: 'meta-drawings',
        endpoint: `GET /api/meta/drawings/key?project=${resolvedProjectId}`,
        direction: 'inbound',
        label: 'SEDMS 핵심 도면 계약',
        status: 'fail',
        latencyMs,
        detail: `${res.code}: ${res.message}`,
      });
    }
  }

  // 9. GET /api/meta/cables/key
  {
    const t0 = nowTime();
    const res = await fetchMetaKeyCables(
      { project: resolvedProjectId, warnPct: 85, limit: 10 },
      { runtimeEnv, fetchImpl, nowMs: options?.nowMs },
    );
    const latencyMs = Math.max(0, Math.round(nowTime() - t0));
    if (res.ok) {
      steps.push({
        id: 'meta-cables',
        endpoint: `GET /api/meta/cables/key?project=${resolvedProjectId}`,
        direction: 'inbound',
        label: 'SEcMS 핵심 케이블 계약',
        status: res.data.status === 'unavailable' ? 'warn' : 'pass',
        latencyMs,
        detail: `status=${res.data.status} · 항목 ${res.data.items.length}건`,
      });
    } else {
      steps.push({
        id: 'meta-cables',
        endpoint: `GET /api/meta/cables/key?project=${resolvedProjectId}`,
        direction: 'inbound',
        label: 'SEcMS 핵심 케이블 계약',
        status: 'fail',
        latencyMs,
        detail: `${res.code}: ${res.message}`,
      });
    }
  }

  // 10. GET /api/meta/items/search
  {
    const t0 = nowTime();
    const res = await searchMetaItems(
      { project: resolvedProjectId, q: 'DWG' },
      { runtimeEnv, fetchImpl, nowMs: options?.nowMs },
    );
    const latencyMs = Math.max(0, Math.round(nowTime() - t0));
    if (res.ok) {
      steps.push({
        id: 'meta-search',
        endpoint: `GET /api/meta/items/search?project=${resolvedProjectId}&q=DWG`,
        direction: 'roundtrip',
        label: '허브 통합 검색 질의·응답',
        status: 'pass',
        latencyMs,
        detail: `검색 결과 ${res.data.items.length}건 · 응답 모듈 ${Object.keys(res.data.modules).length}개`,
      });
    } else {
      steps.push({
        id: 'meta-search',
        endpoint: `GET /api/meta/items/search?project=${resolvedProjectId}&q=DWG`,
        direction: 'roundtrip',
        label: '허브 통합 검색 질의·응답',
        status: 'fail',
        latencyMs,
        detail: `${res.code}: ${res.message}`,
      });
    }
  }

  // 11. GET /api/meta/reports/generate (JSON + Integrity check)
  {
    const t0 = nowTime();
    const res = await generateMetaReport(
      { project: resolvedProjectId, days: 7, format: 'json' },
      { runtimeEnv, fetchImpl, nowMs: options?.nowMs },
    );
    const latencyMs = Math.max(0, Math.round(nowTime() - t0));
    if (res.ok && res.data.format === 'json') {
      const { maskedResidue, sourceHonesty } = res.data.report.integrity;
      const verified = maskedResidue === 0 && sourceHonesty;
      steps.push({
        id: 'meta-report',
        endpoint: `GET /api/meta/reports/generate?project=${resolvedProjectId}&days=7&format=json`,
        direction: 'roundtrip',
        label: '통합 리포트 생성 · 무결성 검증',
        status: verified ? 'pass' : 'warn',
        latencyMs,
        detail: `섹션 ${res.data.report.sections.length}개 · maskedResidue=${maskedResidue} · sourceHonesty=${String(sourceHonesty)}`,
      });
    } else {
      steps.push({
        id: 'meta-report',
        endpoint: `GET /api/meta/reports/generate?project=${resolvedProjectId}&days=7&format=json`,
        direction: 'roundtrip',
        label: '통합 리포트 생성 · 무결성 검증',
        status: 'fail',
        latencyMs,
        detail: res.ok ? '예기치 않은 형식 응답' : `${res.code}: ${res.message}`,
      });
    }
  }

  const passCount = steps.filter((s) => s.status === 'pass').length;
  const warnCount = steps.filter((s) => s.status === 'warn').length;
  const failCount = steps.filter((s) => s.status === 'fail').length;

  return {
    runtimeEnv,
    executedAtIso: new Date(options?.nowMs ?? Date.now()).toISOString(),
    projectId: resolvedProjectId,
    totalDurationMs: Math.max(0, Math.round(nowTime() - startedAt)),
    passCount,
    warnCount,
    failCount,
    twoWayPresenceOk: heartbeatOk && presenceReceiveOk,
    hubRefreshRoundtripOk,
    steps,
  };
}
