import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isSafeNavigationUrl, SGW_LOGIN_REDIRECT_URL } from '../deepLink';
import { PREVIEW_HUB_PROJECT_IDS } from './hubFixtures';
import { getMetaModuleStatusLabel, type MetaClientResult } from './hubTypes';
import {
  createProjectRequestCoordinator,
  fetchMetaHubSummary,
  fetchMetaKeyCables,
  fetchMetaKeyDrawings,
  fetchMetaRegistry,
  generateMetaReport,
  searchMetaItems,
  type MetaFetchLike,
} from './metaClient';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

describe('METASGW /api/meta/* Hub Client (Stage 1/5)', () => {
  it('preview mode: returns DTO-shaped pseudonym fixtures across all 6 endpoints without calling fetch', async () => {
    let fetchCalled = 0;
    const forbiddenFetch: MetaFetchLike = async () => {
      fetchCalled += 1;
      throw new Error('fetch must not be called in preview mode');
    };

    const opts = { runtimeEnv: 'preview' as const, fetchImpl: forbiddenFetch, nowMs: Date.parse('2026-11-27T00:00:00.000Z') };

    // 1. Registry (7 modules: sgw/sedms active/warn, 5 modules planned)
    const reg = await fetchMetaRegistry(opts);
    assert.equal(reg.ok, true);
    if (!reg.ok) return;
    assert.equal(reg.runtimeEnv, 'preview');
    assert.equal(reg.data.modules.length, 7);
    const byId = new Map(reg.data.modules.map((m) => [m.moduleId, m]));
    assert.equal(byId.get('sgw')?.status, 'active');
    assert.equal(byId.get('sedms')?.status, 'warn');
    for (const plannedId of ['secms', 's360', 'secad', 'pdf', 'mail']) {
      assert.equal(byId.get(plannedId)?.status, 'planned');
      assert.equal(byId.get(plannedId)?.entryUrl, null);
    }

    // 2. Hub summary for both preview projects (proj01 & proj02)
    assert.deepEqual([...PREVIEW_HUB_PROJECT_IDS], ['proj01', 'proj02']);
    const sum1 = await fetchMetaHubSummary({ project: 'proj01', refresh: 0 }, opts);
    const sum2 = await fetchMetaHubSummary({ project: 'proj02', refresh: 1 }, opts);
    assert.equal(sum1.ok, true);
    assert.equal(sum2.ok, true);
    if (!sum1.ok || !sum2.ok) return;
    assert.equal(sum1.data.projectId, 'proj01');
    assert.equal(sum2.data.projectId, 'proj02');
    assert.equal(sum1.data.modules.length, 7);
    assert.notEqual(sum1.data.modules[1].status, sum2.data.modules[1].status); // proj01 warn vs proj02 active
    for (const mod of sum1.data.modules) {
      if (mod.status === 'planned') {
        assert.equal(mod.summaryText, getMetaModuleStatusLabel('planned'));
        assert.deepEqual(mod.kpi, {});
        assert.equal(mod.entryUrl, null);
      }
      if (mod.entryUrl !== null) {
        assert.equal(isSafeNavigationUrl(mod.entryUrl), true);
      }
    }

    // 3. Key drawings (latest / pending / urgent filters)
    const dwgUrgent = await fetchMetaKeyDrawings({ project: 'proj01', limit: 20, filter: 'urgent' }, opts);
    assert.equal(dwgUrgent.ok, true);
    if (!dwgUrgent.ok) return;
    assert.ok(dwgUrgent.data.items.length >= 1);
    assert.ok(dwgUrgent.data.items.every((item) => item.severity === 'urgent'));
    assert.ok(
      dwgUrgent.data.items.every(
        (item) => item.deepLinkUrl === null || item.deepLinkUrl.startsWith('/api/sedms-sso?return='),
      ),
    );

    // 4. Key cables (honestly planned -> empty items, zero fake counts)
    const cables = await fetchMetaKeyCables({ project: 'proj01', warnPct: 85, limit: 30 }, opts);
    assert.equal(cables.ok, true);
    if (!cables.ok) return;
    assert.equal(cables.data.status, 'planned');
    assert.deepEqual(cables.data.items, []);

    // 5. Search items across modules
    const search = await searchMetaItems({ project: 'proj01', q: 'DWG', modules: ['sgw', 'sedms'] }, opts);
    assert.equal(search.ok, true);
    if (!search.ok) return;
    assert.ok(search.data.items.length >= 1);
    assert.equal(search.data.modules.sgw, 'active');
    assert.equal(search.data.modules.sedms, 'warn');

    // 6. Reports (json + md)
    const repJson = await generateMetaReport({ project: 'proj01', days: 7, format: 'json' }, opts);
    assert.equal(repJson.ok, true);
    if (!repJson.ok || repJson.data.format !== 'json') return;
    assert.equal(repJson.data.report.projectId, 'proj01');
    assert.equal(repJson.data.report.rangeDays, 7);
    assert.equal(repJson.data.report.integrity.sourceHonesty, true);
    assert.equal(repJson.data.report.integrity.maskedResidue, 0);

    const repMd = await generateMetaReport({ project: 'proj02', days: 14, format: 'md' }, opts);
    assert.equal(repMd.ok, true);
    if (!repMd.ok || repMd.data.format !== 'md') return;
    assert.ok(repMd.data.markdown.includes('# proj02'));

    assert.equal(fetchCalled, 0);
  });

  it('sgw mode: calls real /api/meta/* endpoints with credentials same-origin, zero Authorization headers, and preserves 200 partial unavailable status', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const mockFetch: MetaFetchLike = async (input, init) => {
      const url = String(input);
      calls.push({ url, init });

      if (url === '/api/meta/registry') {
        return jsonResponse({
          modules: [
            { moduleId: 'sgw', name: 'SGW', status: 'active', capabilities: ['summary'], entryUrl: '/talk/' },
            { moduleId: 'sedms', name: 'SEDMS', status: 'unavailable', capabilities: [], entryUrl: null },
          ],
        });
      }
      if (url.startsWith('/api/meta/hub/summary?')) {
        return jsonResponse({
          projectId: 'proj01',
          generatedAt: '2026-11-27T00:00:00.000Z',
          modules: [
            {
              moduleId: 'sgw',
              status: 'active',
              summaryText: '정상',
              kpi: { openTasks: 2 },
              updatedAt: '2026-11-27T00:00:00.000Z',
              entryUrl: '/talk/',
            },
            {
              moduleId: 'sedms',
              status: 'unavailable',
              summaryText: '일시 오류',
              kpi: {},
              updatedAt: null,
              entryUrl: 'javascript:alert(1)', // unsafe URL must be sanitized to null
            },
          ],
        });
      }
      if (url.startsWith('/api/meta/drawings/key?')) {
        return jsonResponse({
          status: 'active',
          items: [
            {
              id: 'item-1',
              moduleId: 'sedms',
              category: 'drawing',
              code: 'DWG-01',
              title: '도면 테스트',
              metric: 'Rev.01',
              severity: 'warn',
              updatedAt: '2026-11-27T00:00:00.000Z',
              deepLinkUrl: '/api/sedms-sso?return=%2Fproject%2Fproj01',
            },
          ],
        });
      }
      if (url.startsWith('/api/meta/cables/key?')) {
        return jsonResponse({ status: 'nosource', items: [] });
      }
      if (url.startsWith('/api/meta/items/search?')) {
        return jsonResponse({ items: [], modules: { sgw: 'active', sedms: 'unavailable' } });
      }
      if (url.startsWith('/api/meta/reports/generate?') && url.includes('format=md')) {
        return new Response('# proj01 report\n', {
          status: 200,
          headers: { 'content-type': 'text/markdown; charset=utf-8' },
        });
      }
      if (url.startsWith('/api/meta/reports/generate?')) {
        return jsonResponse({
          reportVersion: '1.0',
          projectId: 'proj01',
          rangeDays: 7,
          generatedAt: '2026-11-27T00:00:00.000Z',
          executiveKpi: { total: 1 },
          sections: [{ moduleId: 'sgw', status: 'active', highlights: [] }],
          unavailableModules: ['sedms'],
          integrity: { maskedResidue: 0, sourceHonesty: true },
        });
      }
      return jsonResponse({ code: 'ERR_SERVER' }, 500);
    };

    const opts = { runtimeEnv: 'sgw' as const, fetchImpl: mockFetch };

    const reg = await fetchMetaRegistry(opts);
    const sum = await fetchMetaHubSummary({ project: 'proj01', refresh: 1 }, opts);
    const dwg = await fetchMetaKeyDrawings({ project: 'proj01', limit: 20, filter: 'pending' }, opts);
    const cab = await fetchMetaKeyCables({ project: 'proj01', warnPct: 85, limit: 30 }, opts);
    const src = await searchMetaItems({ project: 'proj01', q: '배관', modules: ['sgw', 'sedms'] }, opts);
    const rJson = await generateMetaReport({ project: 'proj01', days: 7, format: 'json' }, opts);
    const rMd = await generateMetaReport({ project: 'proj01', days: 7, format: 'md' }, opts);

    assert.equal(reg.ok, true);
    assert.equal(sum.ok, true);
    assert.equal(dwg.ok, true);
    assert.equal(cab.ok, true);
    assert.equal(src.ok, true);
    assert.equal(rJson.ok, true);
    assert.equal(rMd.ok, true);

    // Partial failure in 200 summary stays ok:true with status:'unavailable' and unsafe URL coerced to null
    if (sum.ok) {
      const sedms = sum.data.modules.find((m) => m.moduleId === 'sedms');
      assert.equal(sedms?.status, 'unavailable');
      assert.equal(sedms?.entryUrl, null);
    }
    if (cab.ok) {
      assert.equal(cab.data.status, 'nosource');
    }
    if (rJson.ok && rJson.data.format === 'json') {
      assert.deepEqual(rJson.data.report.unavailableModules, ['sedms']);
    }
    if (rMd.ok && rMd.data.format === 'md') {
      assert.equal(rMd.data.markdown, '# proj01 report\n');
    }

    assert.equal(calls.length, 7);
    assert.ok(calls[1].url.includes('refresh=1'));
    assert.ok(calls[2].url.includes('limit=20') && calls[2].url.includes('filter=pending'));
    assert.ok(calls[3].url.includes('warnPct=85') && calls[3].url.includes('limit=30'));
    assert.ok(calls[4].url.includes('modules=sgw%2Csedms'));
    for (const c of calls) {
      assert.equal(c.init?.credentials, 'same-origin');
      const headers = new Headers(c.init?.headers);
      assert.equal(headers.has('authorization'), false);
    }
  });

  it('maps 401/400/403/429/500/HTML/network errors into typed {ok:false, code} without throwing', async () => {
    const runWithStatus = async (status: number, body: unknown, ct = 'application/json') => {
      const mockFetch: MetaFetchLike = async () =>
        new Response(typeof body === 'string' ? body : JSON.stringify(body), {
          status,
          headers: { 'content-type': ct },
        });
      return fetchMetaHubSummary(
        { project: 'proj01' },
        { runtimeEnv: 'sgw', fetchImpl: mockFetch },
      );
    };

    const r401 = await runWithStatus(401, { code: 'ERR_AUTH_REQUIRED' });
    assert.equal(r401.ok, false);
    if (!r401.ok) {
      assert.equal(r401.code, 'ERR_AUTH_REQUIRED');
      assert.equal(r401.redirectUrl, SGW_LOGIN_REDIRECT_URL);
    }

    const r400 = await runWithStatus(400, { code: 'ERR_INVALID_PROJECT_ID' });
    assert.equal(r400.ok, false);
    if (!r400.ok) assert.equal(r400.code, 'ERR_INVALID_PROJECT_ID');

    // Client-side invalid project ID rejected cleanly without calling fetch
    const rInvalidLocal = await fetchMetaHubSummary(
      { project: '../bad' },
      {
        runtimeEnv: 'sgw',
        fetchImpl: async () => {
          throw new Error('should not fetch invalid project id');
        },
      },
    );
    assert.equal(rInvalidLocal.ok, false);
    if (!rInvalidLocal.ok) assert.equal(rInvalidLocal.code, 'ERR_INVALID_PROJECT_ID');

    const r403 = await runWithStatus(403, { code: 'ERR_PROJECT_FORBIDDEN' });
    assert.equal(r403.ok, false);
    if (!r403.ok) {
      assert.equal(r403.code, 'ERR_PROJECT_FORBIDDEN');
      assert.ok(r403.message.includes('허용'));
    }

    const r429 = await runWithStatus(429, { code: 'ERR_RATE_LIMITED' });
    assert.equal(r429.ok, false);
    if (!r429.ok) {
      assert.equal(r429.code, 'ERR_RATE_LIMITED');
      assert.equal(r429.keepCachedView, true);
      assert.ok(r429.message.includes('잠시 후 다시'));
    }

    const rHtml = await runWithStatus(200, '<html>login</html>', 'text/html');
    assert.equal(rHtml.ok, false);
    if (!rHtml.ok) assert.equal(rHtml.code, 'ERR_INVALID_RESPONSE');

    const rNet = await fetchMetaHubSummary(
      { project: 'proj01' },
      {
        runtimeEnv: 'sgw',
        fetchImpl: async () => {
          throw new TypeError('Failed to fetch');
        },
      },
    );
    assert.equal(rNet.ok, false);
    if (!rNet.ok) assert.equal(rNet.code, 'ERR_NETWORK');
  });

  it('aborts hung requests via AbortController timeout and returns ERR_TIMEOUT', async () => {
    let sawAbort = false;
    const hangingFetch: MetaFetchLike = (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          sawAbort = true;
          const err = new Error('Aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });

    const res = await fetchMetaRegistry({
      runtimeEnv: 'sgw',
      fetchImpl: hangingFetch,
      timeoutMs: 35,
    });

    assert.equal(sawAbort, true);
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.code, 'ERR_TIMEOUT');
      assert.equal(res.aborted, true);
    }
  });

  it('cancels in-flight requests cleanly when caller AbortSignal aborts (ERR_ABORTED)', async () => {
    const controller = new AbortController();
    const slowFetch: MetaFetchLike = (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('Aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });

    const pending = fetchMetaKeyDrawings(
      { project: 'proj01' },
      { runtimeEnv: 'sgw', fetchImpl: slowFetch, signal: controller.signal, timeoutMs: 2000 },
    );

    setTimeout(() => controller.abort(), 15);
    const res = await pending;
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.code, 'ERR_ABORTED');
      assert.equal(res.aborted, true);
    }
  });

  it('createProjectRequestCoordinator: aborts previous project requests on project switch and discards late stale results', async () => {
    const coordinator = createProjectRequestCoordinator('proj01');
    let proj01Aborted = false;
    let releaseSlowProj01!: () => void;

    // Simulate a slow proj01 request that ignores abort and resolves late
    const p1Promise = coordinator.run('proj01', 'summary', (signal) => {
      signal.addEventListener('abort', () => {
        proj01Aborted = true;
      });
      return new Promise<MetaClientResult<{ projectId: string }>>((resolve) => {
        releaseSlowProj01 = () =>
          resolve({
            ok: true,
            runtimeEnv: 'preview',
            data: { projectId: 'proj01' },
          });
      });
    });

    // User switches project to proj02 before proj01 finishes
    coordinator.switchProject('proj02');
    assert.equal(proj01Aborted, true);
    assert.equal(coordinator.getActiveProjectId(), 'proj02');

    // Fire proj02 request and resolve it
    const p2Outcome = await coordinator.run('proj02', 'summary', async () => ({
      ok: true,
      runtimeEnv: 'preview',
      data: { projectId: 'proj02' },
    }));
    assert.equal(p2Outcome.stale, false);
    assert.equal(p2Outcome.result?.ok, true);
    if (p2Outcome.result?.ok) {
      assert.equal(p2Outcome.result.data.projectId, 'proj02');
    }

    // Now the late proj01 response finally arrives -> MUST be discarded as stale
    releaseSlowProj01();
    const p1Outcome = await p1Promise;
    assert.equal(p1Outcome.stale, true);
    assert.equal(p1Outcome.result, null);

    // Same-channel rapid superseding within the same project (e.g. rapid search typing)
    let firstSearchAborted = false;
    let releaseFirstSearch!: () => void;
    const s1 = coordinator.run('proj02', 'search', (signal) => {
      signal.addEventListener('abort', () => {
        firstSearchAborted = true;
      });
      return new Promise<MetaClientResult<string>>((resolve) => {
        releaseFirstSearch = () => resolve({ ok: true, runtimeEnv: 'preview', data: 'old-query' });
      });
    });

    const s2 = await coordinator.run('proj02', 'search', async () => ({
      ok: true,
      runtimeEnv: 'preview',
      data: 'new-query',
    }));
    assert.equal(firstSearchAborted, true);
    assert.equal(s2.stale, false);
    if (s2.result?.ok) assert.equal(s2.result.data, 'new-query');

    releaseFirstSearch();
    const s1Out = await s1;
    assert.equal(s1Out.stale, true);
    assert.equal(s1Out.result, null);
  });
});
