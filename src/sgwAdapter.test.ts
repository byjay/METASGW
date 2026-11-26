import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getErrorDescriptor } from './errorCatalog.ts';
import {
  fetchAuthMe,
  fetchEmployees,
  fetchPresence,
  fetchSedmsProjects,
  postAuthLogout,
  postPresenceHeartbeat,
  resetProjectsCache,
  type FetchLike,
} from './sgwAdapter.ts';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

describe('sgwAdapter strict sgw vs preview runtime separation', () => {
  beforeEach(() => {
    resetProjectsCache();
  });

  it('in sgw mode: handles /auth/me 200 with credentials: same-origin and no Authorization header', async () => {
    let capturedInit: RequestInit | undefined;
    const mockFetch: FetchLike = async (_input, init) => {
      capturedInit = init;
      return jsonResponse({
        sub: 'staff99',
        name: 'staff99',
        dept: 'dept99',
        title: 'lead',
        role: 'member',
      });
    };

    const result = await fetchAuthMe({ fetchImpl: mockFetch, runtimeEnv: 'sgw' });
    assert.equal(result.status, 'authenticated');
    if (result.status === 'authenticated') {
      assert.equal(result.user.sub, 'staff99');
      assert.equal(result.runtimeEnv, 'sgw');
    }
    assert.equal(capturedInit?.credentials, 'same-origin');
    const headers = (capturedInit?.headers ?? {}) as Record<string, string>;
    assert.equal('Authorization' in headers, false);
    assert.equal('authorization' in headers, false);
  });

  it('in sgw mode: NEVER falls back to demo fixtures on 401, 403, 404, HTML, or network error', async () => {
    const r401 = await fetchAuthMe({
      runtimeEnv: 'sgw',
      fetchImpl: async () => jsonResponse({ error: 'unauthorized' }, 401),
    });
    assert.equal(r401.status, 'unauthenticated');
    if (r401.status === 'unauthenticated') {
      assert.equal(r401.redirectUrl, '/?next=/meta/');
    }

    const r403 = await fetchAuthMe({
      runtimeEnv: 'sgw',
      fetchImpl: async () => jsonResponse({ error: 'forbidden' }, 403),
    });
    assert.equal(r403.status, 'forbidden');

    const r404 = await fetchAuthMe({
      runtimeEnv: 'sgw',
      fetchImpl: async () => new Response('Not Found', { status: 404, headers: { 'content-type': 'text/plain' } }),
    });
    assert.equal(r404.status, 'not_found');

    const rHtml = await fetchAuthMe({
      runtimeEnv: 'sgw',
      fetchImpl: async () => new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    });
    assert.equal(rHtml.status, 'error');

    const rErr = await fetchAuthMe({
      runtimeEnv: 'sgw',
      fetchImpl: async () => {
        throw new Error('network down');
      },
    });
    assert.equal(rErr.status, 'error');

    // Projects in sgw mode MUST return pending/empty on 404 — never preview proj01~proj04!
    const projPending = await fetchSedmsProjects({
      runtimeEnv: 'sgw',
      fetchImpl: async () => jsonResponse({ error: 'not_implemented' }, 404),
    });
    assert.equal(projPending.status, 'pending');
    assert.equal(projPending.projects.length, 0);

    // Employees in sgw mode MUST return empty on error — never preview user01~user05!
    const empErr = await fetchEmployees({
      runtimeEnv: 'sgw',
      fetchImpl: async () => jsonResponse({ error: 'err' }, 500),
    });
    assert.equal(empErr.status, 'error');
    if (empErr.status === 'error') {
      assert.equal(empErr.employees.length, 0);
    }
  });

  it('in preview mode: returns pseudonym fixtures (user01~user05, dept01~dept03, proj01~proj04) without calling fetch', async () => {
    let fetchCalls = 0;
    const forbiddenFetch: FetchLike = async () => {
      fetchCalls += 1;
      throw new Error('fetch must not be called in preview mode');
    };

    const auth = await fetchAuthMe({ runtimeEnv: 'preview', fetchImpl: forbiddenFetch });
    assert.equal(auth.status, 'authenticated');
    if (auth.status === 'authenticated') {
      assert.equal(auth.user.sub, 'user01');
      assert.equal(auth.runtimeEnv, 'preview');
    }

    const emp = await fetchEmployees({ runtimeEnv: 'preview', fetchImpl: forbiddenFetch });
    assert.equal(emp.status, 'ok');
    if (emp.status === 'ok') {
      assert.equal(emp.employees.length, 5);
      const depts = new Set(emp.employees.map((e) => e.dept));
      assert.deepEqual([...depts].sort(), ['dept01', 'dept02', 'dept03']);
    }

    const pres = await fetchPresence({ runtimeEnv: 'preview', fetchImpl: forbiddenFetch, nowMs: 1_700_000_000_000 });
    assert.equal(pres.status, 'ok');
    if (pres.status === 'ok') {
      assert.equal(pres.entries.length, 5);
    }

    const proj = await fetchSedmsProjects({ runtimeEnv: 'preview', fetchImpl: forbiddenFetch });
    assert.equal(proj.status, 'ready');
    assert.equal(proj.projects.length, 4);
    const statuses = new Set(proj.projects.map((p) => p.status));
    assert.ok(statuses.size >= 4, 'Demo projects must have diverse statuses');
    assert.equal(fetchCalls, 0);
  });

  it('in sgw mode: caches /api/gateway/sedms/projects for 60s and sends empty body for heartbeat/logout', async () => {
    let calls = 0;
    const mockFetch: FetchLike = async () => {
      calls += 1;
      return jsonResponse([
        { id: 'p01', code: 'P-01', name: 'p01-name', role: 'member', status: 'active', updated_at: '2026-11-26' },
      ]);
    };

    const first = await fetchSedmsProjects({ runtimeEnv: 'sgw', fetchImpl: mockFetch, nowMs: 1000 });
    assert.equal(first.status, 'ready');
    assert.equal(first.cached, false);

    const second = await fetchSedmsProjects({ runtimeEnv: 'sgw', fetchImpl: mockFetch, nowMs: 30_000 });
    assert.equal(second.status, 'ready');
    assert.equal(second.cached, true);
    assert.equal(calls, 1);

    let heartbeatBody: BodyInit | null | undefined = 'unset';
    const hbOk = await postPresenceHeartbeat({
      runtimeEnv: 'sgw',
      fetchImpl: async (_url, init) => {
        heartbeatBody = init?.body;
        assert.equal(init?.credentials, 'same-origin');
        return jsonResponse({ ok: true });
      },
    });
    assert.equal(hbOk, true);
    assert.equal(heartbeatBody, undefined);

    const logoutOk = await postAuthLogout({
      runtimeEnv: 'sgw',
      fetchImpl: async (_url, init) => {
        assert.equal(init?.credentials, 'same-origin');
        assert.equal(init?.body, undefined);
        return jsonResponse({ ok: true });
      },
    });
    assert.equal(logoutOk, true);
  });

  it('in sgw mode: returns unified errorCatalog codes and messages for 401/403/404/429/5xx/network across all endpoints', async () => {
    const auth429 = await fetchAuthMe({
      runtimeEnv: 'sgw',
      fetchImpl: async () => jsonResponse({ error: 'too_many' }, 429),
    });
    assert.equal(auth429.status, 'error');
    if (auth429.status === 'error') {
      assert.equal(auth429.errorCode, 'rate_limited');
      assert.equal(auth429.message, getErrorDescriptor('rate_limited').message);
    }

    const proj503 = await fetchSedmsProjects({
      runtimeEnv: 'sgw',
      forceRefresh: true,
      fetchImpl: async () => jsonResponse({ error: 'unavailable' }, 503),
    });
    assert.equal(proj503.status, 'error');
    if (proj503.status === 'error') {
      assert.equal(proj503.errorCode, 'server_error');
      assert.equal(proj503.message, getErrorDescriptor('server_error').message);
    }

    const presOffline = await fetchPresence({
      runtimeEnv: 'sgw',
      fetchImpl: async () => {
        throw new Error('offline');
      },
    });
    assert.equal(presOffline.status, 'error');
    if (presOffline.status === 'error') {
      assert.equal(presOffline.errorCode, 'network_offline');
      assert.equal(presOffline.message, getErrorDescriptor('network_offline').message);
    }
  });
});
