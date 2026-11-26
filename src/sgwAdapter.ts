/**
 * Single SGW & SEDMS API adapter for METASGW.
 *
 * CONTRACT RULES (§3, §4, §7):
 *   - Every network `fetch()` in METASGW lives exclusively in this file.
 *   - Always sends `credentials: 'same-origin'` (reuses HttpOnly SGW session cookie).
 *   - NEVER sends `Authorization` headers.
 *   - NEVER reads/writes tokens or user PII in localStorage/sessionStorage/IndexedDB.
 *   - NEVER sends client-claimed identity fields (`userId`, `senderId`, `role`) in request bodies.
 *   - STRICT RUNTIME SPLIT:
 *       * 'preview': returns pseudonym fixtures without making network calls.
 *       * 'sgw': NEVER uses preview fixtures under any circumstance (401→redirect, 403/404→error notice).
 */

import { SGW_LOGIN_REDIRECT_URL } from './deepLink';
import {
  getPreviewDemoEmployees,
  getPreviewDemoPresence,
  getPreviewDemoProjects,
  getPreviewDemoUser,
} from './previewFixtures';
import { detectRuntimeEnv, type RuntimeEnv } from './runtimeEnv';

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface AdapterOptions {
  fetchImpl?: FetchLike;
  runtimeEnv?: RuntimeEnv;
  nowMs?: number;
}

export interface SgwUser {
  sub: string;
  name: string;
  dept: string;
  title: string;
  role: string;
  isPartner: boolean;
}

export type AuthMeResult =
  | { status: 'authenticated'; user: SgwUser; runtimeEnv: RuntimeEnv }
  | { status: 'unauthenticated'; redirectUrl: string; runtimeEnv: 'sgw' }
  | { status: 'forbidden'; message: string; runtimeEnv: 'sgw' }
  | { status: 'not_found'; message: string; runtimeEnv: 'sgw' }
  | { status: 'error'; message: string; runtimeEnv: 'sgw' };

export interface SgwEmployee {
  sub: string;
  name: string;
  dept: string;
  title: string;
  role: string;
  isPartner: boolean;
}

export interface SgwPresenceEntry {
  sub: string;
  lastSeenAt: number;
  online?: boolean;
}

export interface SedmsProject {
  id: string;
  code: string;
  name: string;
  role: string;
  status: string;
  updated_at: string;
}

export type SedmsProjectsResult =
  | { status: 'ready'; projects: SedmsProject[]; cached: boolean }
  | { status: 'pending'; message: string; projects: [] }
  | { status: 'unauthenticated'; redirectUrl: string; projects: [] }
  | { status: 'forbidden'; message: string; projects: [] }
  | { status: 'error'; message: string; projects: [] };

const PROJECTS_CACHE_TTL_MS = 60_000;

let projectsCache: { fetchedAt: number; projects: SedmsProject[] } | null = null;

export function resetProjectsCache(): void {
  projectsCache = null;
}

function resolveEnv(opts?: AdapterOptions): RuntimeEnv {
  return opts?.runtimeEnv ?? detectRuntimeEnv();
}

function getDefaultFetch(fetchImpl?: FetchLike): FetchLike {
  if (fetchImpl) return fetchImpl;
  return globalThis.fetch.bind(globalThis);
}

function asCleanString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  }
  return fallback;
}

function isJsonResponse(res: Response): boolean {
  const ct = res.headers?.get?.('content-type') ?? '';
  return ct.toLowerCase().includes('application/json') || ct.toLowerCase().includes('+json');
}

function normalizeUserRecord(raw: Record<string, unknown>): SgwUser | null {
  const sub = asCleanString(raw.sub);
  if (!sub) return null;

  const role = asCleanString(raw.role, 'member');
  const isPartner =
    typeof raw.isPartner === 'boolean'
      ? raw.isPartner
      : role.toLowerCase() === 'partner' || role.toLowerCase() === 'external';

  return {
    sub,
    name: asCleanString(raw.name, sub),
    dept: asCleanString(raw.dept, '없음'),
    title: asCleanString(raw.title, '없음'),
    role,
    isPartner,
  };
}

/**
 * Checks the current SGW session via `GET /auth/me`.
 * In 'preview' mode, returns the pseudonym demo user without network calls.
 * In 'sgw' mode, strictly calls `/auth/me` and NEVER falls back to demo fixtures.
 */
export async function fetchAuthMe(opts?: AdapterOptions): Promise<AuthMeResult> {
  const env = resolveEnv(opts);
  if (env === 'preview') {
    return { status: 'authenticated', user: getPreviewDemoUser(), runtimeEnv: 'preview' };
  }

  const doFetch = getDefaultFetch(opts?.fetchImpl);
  try {
    const res = await doFetch('/auth/me', {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });

    if (res.status === 401) {
      return { status: 'unauthenticated', redirectUrl: SGW_LOGIN_REDIRECT_URL, runtimeEnv: 'sgw' };
    }
    if (res.status === 403) {
      return { status: 'forbidden', message: '권한 없음', runtimeEnv: 'sgw' };
    }
    if (res.status === 404) {
      return { status: 'not_found', message: '없거나 권한 없음', runtimeEnv: 'sgw' };
    }
    if (!res.ok) {
      return { status: 'error', message: `인증 상태 확인 실패 (${res.status})`, runtimeEnv: 'sgw' };
    }

    if (!isJsonResponse(res)) {
      return { status: 'error', message: 'SGW 인증 응답 형식이 올바르지 않습니다.', runtimeEnv: 'sgw' };
    }

    const payload = (await res.json()) as Record<string, unknown>;
    const candidate =
      payload && typeof payload.user === 'object' && payload.user !== null
        ? (payload.user as Record<string, unknown>)
        : payload;

    const user = normalizeUserRecord(candidate);
    if (!user) {
      return { status: 'error', message: 'SGW 세션에 사용자 식별자(sub)가 없습니다.', runtimeEnv: 'sgw' };
    }

    return { status: 'authenticated', user, runtimeEnv: 'sgw' };
  } catch {
    return { status: 'error', message: 'SGW 세션 서버에 연결할 수 없습니다.', runtimeEnv: 'sgw' };
  }
}

/**
 * Logs out of the SGW session via `POST /api/auth/logout`.
 */
export async function postAuthLogout(opts?: AdapterOptions): Promise<boolean> {
  resetProjectsCache();
  if (resolveEnv(opts) === 'preview') {
    return false;
  }

  const doFetch = getDefaultFetch(opts?.fetchImpl);
  try {
    const res = await doFetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Loads the SGW employee directory via `GET /api/employees`.
 * Keyed strictly by `sub` (never `employee_id` or `name`).
 */
export async function fetchEmployees(
  opts?: AdapterOptions,
): Promise<{ status: 'ok'; employees: SgwEmployee[] } | { status: 'unauthenticated' } | { status: 'error'; employees: [] }> {
  if (resolveEnv(opts) === 'preview') {
    return { status: 'ok', employees: getPreviewDemoEmployees() };
  }

  const doFetch = getDefaultFetch(opts?.fetchImpl);
  try {
    const res = await doFetch('/api/employees', {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });

    if (res.status === 401) {
      return { status: 'unauthenticated' };
    }
    if (!res.ok || !isJsonResponse(res)) {
      return { status: 'error', employees: [] };
    }

    const data = (await res.json()) as unknown;
    const list: unknown[] = Array.isArray(data)
      ? data
      : data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>).employees)
        ? ((data as Record<string, unknown>).employees as unknown[])
        : data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>).items)
          ? ((data as Record<string, unknown>).items as unknown[])
          : [];

    const seen = new Set<string>();
    const employees: SgwEmployee[] = [];
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const user = normalizeUserRecord(item as Record<string, unknown>);
      if (!user || seen.has(user.sub)) continue;
      seen.add(user.sub);
      employees.push(user);
    }

    return { status: 'ok', employees };
  } catch {
    return { status: 'error', employees: [] };
  }
}

function parseTimestampMs(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw < 1_000_000_000_000 ? raw * 1000 : raw;
  }
  if (typeof raw === 'string') {
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

/**
 * Loads online presence list via `GET /api/presence`.
 */
export async function fetchPresence(
  opts?: AdapterOptions,
): Promise<{ status: 'ok'; entries: SgwPresenceEntry[] } | { status: 'unauthenticated' } | { status: 'error'; entries: [] }> {
  if (resolveEnv(opts) === 'preview') {
    return { status: 'ok', entries: getPreviewDemoPresence(opts?.nowMs) };
  }

  const doFetch = getDefaultFetch(opts?.fetchImpl);
  try {
    const res = await doFetch('/api/presence', {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });

    if (res.status === 401) {
      return { status: 'unauthenticated' };
    }
    if (!res.ok || !isJsonResponse(res)) {
      return { status: 'error', entries: [] };
    }

    const data = (await res.json()) as unknown;
    const list: unknown[] = Array.isArray(data)
      ? data
      : data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>).online)
        ? ((data as Record<string, unknown>).online as unknown[])
        : data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>).items)
          ? ((data as Record<string, unknown>).items as unknown[])
          : data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>).users)
            ? ((data as Record<string, unknown>).users as unknown[])
            : [];

    const entries: SgwPresenceEntry[] = [];
    for (const item of list) {
      if (typeof item === 'string' && item.trim()) {
        entries.push({ sub: item.trim(), lastSeenAt: Date.now(), online: true });
        continue;
      }
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const sub = asCleanString(rec.sub);
      if (!sub) continue;
      const lastSeenAt = parseTimestampMs(
        rec.lastSeenAt ?? rec.last_seen_at ?? rec.updated_at ?? rec.ts ?? rec.seenAt,
      );
      const online = typeof rec.online === 'boolean' ? rec.online : undefined;
      entries.push({ sub, lastSeenAt, online });
    }

    return { status: 'ok', entries };
  } catch {
    return { status: 'error', entries: [] };
  }
}

/**
 * Sends a presence heartbeat via `POST /api/presence`.
 * Intentionally sends NO identity claims in body (server derives user from session cookie).
 */
export async function postPresenceHeartbeat(opts?: AdapterOptions): Promise<boolean> {
  if (resolveEnv(opts) === 'preview') {
    return true;
  }

  const doFetch = getDefaultFetch(opts?.fetchImpl);
  try {
    const res = await doFetch('/api/presence', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    return res.ok;
  } catch {
    return false;
  }
}

function normalizeProjectRecord(raw: Record<string, unknown>): SedmsProject | null {
  const id = asCleanString(raw.id);
  const name = asCleanString(raw.name);
  if (!id || !name) return null;

  return {
    id,
    code: asCleanString(raw.code, id),
    name,
    role: asCleanString(raw.role, '없음'),
    status: asCleanString(raw.status, '없음'),
    updated_at: asCleanString(raw.updated_at, '없음'),
  };
}

/**
 * Loads the current user's SEDMS projects via `GET /api/gateway/sedms/projects`.
 * Caches successful results for 60 seconds in 'sgw' mode.
 * Returns `pending` ("프로젝트 연결 준비 중") on 404/501 without fabricating data.
 */
export async function fetchSedmsProjects(
  opts?: AdapterOptions & { forceRefresh?: boolean },
): Promise<SedmsProjectsResult> {
  if (resolveEnv(opts) === 'preview') {
    return { status: 'ready', projects: getPreviewDemoProjects(), cached: false };
  }

  const now = opts?.nowMs ?? Date.now();
  if (
    !opts?.forceRefresh &&
    projectsCache &&
    now - projectsCache.fetchedAt < PROJECTS_CACHE_TTL_MS
  ) {
    return { status: 'ready', projects: projectsCache.projects, cached: true };
  }

  const doFetch = getDefaultFetch(opts?.fetchImpl);
  try {
    const res = await doFetch('/api/gateway/sedms/projects', {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });

    if (res.status === 401) {
      return { status: 'unauthenticated', redirectUrl: SGW_LOGIN_REDIRECT_URL, projects: [] };
    }
    if (res.status === 403) {
      return { status: 'forbidden', message: '권한 없음', projects: [] };
    }
    if (res.status === 404 || res.status === 501) {
      return { status: 'pending', message: '프로젝트 연결 준비 중', projects: [] };
    }
    if (!res.ok || !isJsonResponse(res)) {
      return { status: 'pending', message: '프로젝트 연결 준비 중', projects: [] };
    }

    const data = (await res.json()) as unknown;
    const list: unknown[] = Array.isArray(data)
      ? data
      : data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>).projects)
        ? ((data as Record<string, unknown>).projects as unknown[])
        : data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>).items)
          ? ((data as Record<string, unknown>).items as unknown[])
          : [];

    const projects: SedmsProject[] = [];
    const seen = new Set<string>();
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const proj = normalizeProjectRecord(item as Record<string, unknown>);
      if (!proj || seen.has(proj.id)) continue;
      seen.add(proj.id);
      projects.push(proj);
    }

    projectsCache = { fetchedAt: now, projects };
    return { status: 'ready', projects, cached: false };
  } catch {
    return { status: 'pending', message: '프로젝트 연결 준비 중', projects: [] };
  }
}
