import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { detectRuntimeEnv } from '../runtimeEnv';
import { ReportModal } from '../ui/ReportModal';
import { mergeHubModuleChips, summarizeHubChips } from './hubChipModel';
import type {
  MetaCablesKeyResponse,
  MetaClientResult,
  MetaDrawingsKeyResponse,
  MetaHubSummaryResponse,
  MetaItemsSearchResponse,
  MetaRegistryResponse,
  MetaReportJsonResponse,
} from './hubTypes';
import {
  combineKeyItemSources,
  filterKeyItems,
  getNonNormalModuleNotices,
  resolveKeyItemLink,
} from './keyItemsModel';
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
import {
  formatExecutiveKpiCards,
  isReportIntegrityVerified,
  resolveUnavailableModuleNames,
} from './reportModel';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

describe('Stage 5/5 Unified Hub E2E integration, dual-runtime & error-injection suite', () => {
  it('1) separates preview vs sgw runtime paths across all 6 /api/meta/* endpoints', async () => {
    assert.equal(detectRuntimeEnv({ hostname: 'localhost', pathname: '/' }), 'preview');
    assert.equal(detectRuntimeEnv({ hostname: 'localhost', pathname: '/meta/' }), 'sgw');
    assert.equal(detectRuntimeEnv({ hostname: 'sgw.internal.example', pathname: '/meta/' }), 'sgw');

    // Preview mode must NEVER invoke fetch
    let previewFetchCalls = 0;
    const forbiddenFetch: MetaFetchLike = async () => {
      previewFetchCalls += 1;
      throw new Error('fetch should not be called in preview mode');
    };

    const pReg = await fetchMetaRegistry({ runtimeEnv: 'preview', fetchImpl: forbiddenFetch });
    const pSum = await fetchMetaHubSummary(
      { project: 'proj01', refresh: 0 },
      { runtimeEnv: 'preview', fetchImpl: forbiddenFetch },
    );
    const pDwg = await fetchMetaKeyDrawings(
      { project: 'proj01', limit: 20, filter: 'latest' },
      { runtimeEnv: 'preview', fetchImpl: forbiddenFetch },
    );
    const pCbl = await fetchMetaKeyCables(
      { project: 'proj01', warnPct: 85, limit: 30 },
      { runtimeEnv: 'preview', fetchImpl: forbiddenFetch },
    );
    const pSrch = await searchMetaItems(
      { project: 'proj01', q: '배관' },
      { runtimeEnv: 'preview', fetchImpl: forbiddenFetch },
    );
    const pRepJson = await generateMetaReport(
      { project: 'proj01', days: 7, format: 'json' },
      { runtimeEnv: 'preview', fetchImpl: forbiddenFetch },
    );
    const pRepMd = await generateMetaReport(
      { project: 'proj01', days: 7, format: 'md' },
      { runtimeEnv: 'preview', fetchImpl: forbiddenFetch },
    );

    assert.equal(previewFetchCalls, 0);
    assert.equal(pReg.ok && pReg.runtimeEnv === 'preview', true);
    assert.equal(pSum.ok && pSum.runtimeEnv === 'preview', true);
    assert.equal(pDwg.ok && pDwg.runtimeEnv === 'preview', true);
    assert.equal(pCbl.ok && pCbl.runtimeEnv === 'preview', true);
    assert.equal(pSrch.ok && pSrch.runtimeEnv === 'preview', true);
    assert.equal(pRepJson.ok && pRepJson.runtimeEnv === 'preview', true);
    assert.equal(pRepMd.ok && pRepMd.runtimeEnv === 'preview', true);

    // SGW mode must invoke same-origin fetch on all 6 endpoints and NEVER fall back to preview fixtures
    const visitedUrls: string[] = [];
    const sgwFetch: MetaFetchLike = async (input, init) => {
      const url = String(input);
      visitedUrls.push(url);
      assert.equal(init?.credentials, 'same-origin');
      assert.equal(
        new Headers(init?.headers).get('Authorization'),
        null,
        'SGW mode must never send Authorization headers',
      );

      if (url === '/api/meta/registry') {
        return jsonResponse({
          modules: [
            {
              moduleId: 'sgw',
              name: 'SGW 그룹웨어',
              status: 'active',
              capabilities: ['search', 'report'],
              entryUrl: '/talk/',
            },
            {
              moduleId: 'sedms',
              name: 'SEDMS 도면관리',
              status: 'active',
              capabilities: ['drawings', 'search', 'report'],
              entryUrl: '/api/sedms-sso?return=%2Fprojects',
            },
          ],
        });
      }
      if (url.startsWith('/api/meta/hub/summary?')) {
        return jsonResponse({
          projectId: 'proj01',
          generatedAt: '2026-11-27T04:00:00.000Z',
          modules: [
            {
              moduleId: 'sgw',
              status: 'active',
              summaryText: '접속 4명',
              kpi: { online: 4 },
              updatedAt: '2026-11-27T04:00:00.000Z',
              entryUrl: '/talk/',
            },
            {
              moduleId: 'sedms',
              status: 'active',
              summaryText: '도면 18건',
              kpi: { drawings: 18 },
              updatedAt: '2026-11-27T04:00:00.000Z',
              entryUrl: '/api/sedms-sso?return=%2Fproject%2Fproj01',
            },
          ],
        });
      }
      if (url.startsWith('/api/meta/drawings/key?')) {
        return jsonResponse({
          status: 'active',
          items: [
            {
              id: 'dwg-sgw-01',
              moduleId: 'sedms',
              category: 'drawing',
              code: 'DWG-PIPE-01',
              title: '기관실 배관 계통도',
              metric: 'Rev.02',
              severity: 'warn',
              updatedAt: '2026-11-27T03:40:00.000Z',
              deepLinkUrl: '/api/sedms-sso?return=%2Fproject%2Fproj01',
            },
          ],
        });
      }
      if (url.startsWith('/api/meta/cables/key?')) {
        return jsonResponse({ status: 'planned', items: [] });
      }
      if (url.startsWith('/api/meta/items/search?')) {
        return jsonResponse({
          items: [
            {
              id: 'dwg-sgw-01',
              moduleId: 'sedms',
              category: 'drawing',
              code: 'DWG-PIPE-01',
              title: '기관실 배관 계통도',
              metric: 'Rev.02',
              severity: 'warn',
              updatedAt: '2026-11-27T03:40:00.000Z',
              deepLinkUrl: '/api/sedms-sso?return=%2Fproject%2Fproj01',
            },
          ],
          modules: { sgw: 'active', sedms: 'active', secms: 'planned' },
        });
      }
      if (url.includes('format=md')) {
        return new Response('# SGW 프로젝트 리포트\n\n- 정상 수신', {
          status: 200,
          headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
        });
      }
      if (url.startsWith('/api/meta/reports/generate?')) {
        return jsonResponse({
          reportVersion: '1.0',
          projectId: 'proj01',
          rangeDays: 14,
          generatedAt: '2026-11-27T04:00:00.000Z',
          executiveKpi: { activeModules: 2, recentDrawings: 18 },
          sections: [
            {
              moduleId: 'sedms',
              status: 'active',
              highlights: [
                {
                  id: 'dwg-sgw-01',
                  moduleId: 'sedms',
                  category: 'drawing',
                  code: 'DWG-PIPE-01',
                  title: '기관실 배관 계통도',
                  metric: 'Rev.02',
                  severity: 'warn',
                  updatedAt: '2026-11-27T03:40:00.000Z',
                  deepLinkUrl: '/api/sedms-sso?return=%2Fproject%2Fproj01',
                },
              ],
            },
          ],
          unavailableModules: [],
          integrity: { maskedResidue: 0, sourceHonesty: true },
        });
      }
      return jsonResponse({ error: 'unexpected' }, 404);
    };

    const sReg = await fetchMetaRegistry({ runtimeEnv: 'sgw', fetchImpl: sgwFetch });
    const sSum = await fetchMetaHubSummary(
      { project: 'proj01', refresh: 1 },
      { runtimeEnv: 'sgw', fetchImpl: sgwFetch },
    );
    const sDwg = await fetchMetaKeyDrawings(
      { project: 'proj01', limit: 20, filter: 'pending' },
      { runtimeEnv: 'sgw', fetchImpl: sgwFetch },
    );
    const sCbl = await fetchMetaKeyCables(
      { project: 'proj01', warnPct: 85, limit: 30 },
      { runtimeEnv: 'sgw', fetchImpl: sgwFetch },
    );
    const sSrch = await searchMetaItems(
      { project: 'proj01', q: '배관', modules: ['sgw', 'sedms'] },
      { runtimeEnv: 'sgw', fetchImpl: sgwFetch },
    );
    const sRepJson = await generateMetaReport(
      { project: 'proj01', days: 14, format: 'json' },
      { runtimeEnv: 'sgw', fetchImpl: sgwFetch },
    );
    const sRepMd = await generateMetaReport(
      { project: 'proj01', days: 14, format: 'md' },
      { runtimeEnv: 'sgw', fetchImpl: sgwFetch },
    );

    assert.equal(visitedUrls.length, 7);
    assert.equal(sReg.ok && sReg.runtimeEnv === 'sgw', true);
    assert.equal(sSum.ok && sSum.runtimeEnv === 'sgw', true);
    assert.equal(sDwg.ok && sDwg.runtimeEnv === 'sgw', true);
    assert.equal(sCbl.ok && sCbl.runtimeEnv === 'sgw' && sCbl.data.status === 'planned', true);
    assert.equal(sSrch.ok && sSrch.runtimeEnv === 'sgw' && sSrch.data.items.length === 1, true);
    assert.equal(sRepJson.ok && sRepJson.runtimeEnv === 'sgw', true);
    assert.equal(sRepMd.ok && sRepMd.runtimeEnv === 'sgw' && sRepMd.data.format === 'md', true);
  });

  it('2) injects 401 ERR_AUTH_REQUIRED across all 6 endpoints and redirects to /?next=/meta/', async () => {
    const fetch401: MetaFetchLike = async () =>
      jsonResponse({ code: 'ERR_AUTH_REQUIRED', message: '세션이 만료되었습니다.' }, 401);

    const results = await Promise.all([
      fetchMetaRegistry({ runtimeEnv: 'sgw', fetchImpl: fetch401 }),
      fetchMetaHubSummary({ project: 'proj01' }, { runtimeEnv: 'sgw', fetchImpl: fetch401 }),
      fetchMetaKeyDrawings({ project: 'proj01' }, { runtimeEnv: 'sgw', fetchImpl: fetch401 }),
      fetchMetaKeyCables({ project: 'proj01' }, { runtimeEnv: 'sgw', fetchImpl: fetch401 }),
      searchMetaItems({ project: 'proj01', q: '배관' }, { runtimeEnv: 'sgw', fetchImpl: fetch401 }),
      generateMetaReport({ project: 'proj01', days: 7, format: 'json' }, { runtimeEnv: 'sgw', fetchImpl: fetch401 }),
      generateMetaReport({ project: 'proj01', days: 7, format: 'md' }, { runtimeEnv: 'sgw', fetchImpl: fetch401 }),
    ]);

    for (const res of results) {
      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.code, 'ERR_AUTH_REQUIRED');
        assert.equal(res.httpStatus, 401);
        assert.equal(res.redirectUrl, '/?next=/meta/');
      }
    }
  });

  it('3) injects 403 ERR_PROJECT_FORBIDDEN and surfaces project-selection guidance', async () => {
    const fetch403: MetaFetchLike = async () =>
      jsonResponse({ code: 'ERR_PROJECT_FORBIDDEN' }, 403);

    const sumRes = await fetchMetaHubSummary(
      { project: 'proj02' },
      { runtimeEnv: 'sgw', fetchImpl: fetch403 },
    );
    const dwgRes = await fetchMetaKeyDrawings(
      { project: 'proj02' },
      { runtimeEnv: 'sgw', fetchImpl: fetch403 },
    );
    const repRes = await generateMetaReport(
      { project: 'proj02', days: 7, format: 'json' },
      { runtimeEnv: 'sgw', fetchImpl: fetch403 },
    );

    for (const res of [sumRes, dwgRes, repRes]) {
      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.code, 'ERR_PROJECT_FORBIDDEN');
        assert.equal(res.httpStatus, 403);
        assert.ok(
          res.message.includes('허용된 프로젝트'),
          `Expected project guidance message, got: ${res.message}`,
        );
      }
    }
  });

  it('4) injects 429 ERR_RATE_LIMITED and preserves cached summary/items/report view with retry notice', async () => {
    let callPhase: 'initial' | 'rate_limited' = 'initial';

    const phasedFetch: MetaFetchLike = async (input) => {
      if (callPhase === 'rate_limited') {
        return jsonResponse({ code: 'ERR_RATE_LIMITED' }, 429);
      }
      const url = String(input);
      if (url.startsWith('/api/meta/hub/summary?')) {
        return jsonResponse({
          projectId: 'proj01',
          generatedAt: '2026-11-27T04:00:00.000Z',
          modules: [
            {
              moduleId: 'sgw',
              status: 'active',
              summaryText: '접속 5명',
              kpi: { online: 5 },
              updatedAt: '2026-11-27T04:00:00.000Z',
              entryUrl: '/talk/',
            },
          ],
        });
      }
      if (url.startsWith('/api/meta/reports/generate?')) {
        return jsonResponse({
          reportVersion: '1.0',
          projectId: 'proj01',
          rangeDays: 7,
          generatedAt: '2026-11-27T04:00:00.000Z',
          executiveKpi: { activeModules: 1 },
          sections: [{ moduleId: 'sgw', status: 'active', highlights: [] }],
          unavailableModules: [],
          integrity: { maskedResidue: 0, sourceHonesty: true },
        });
      }
      return jsonResponse({ status: 'active', items: [] });
    };

    // Initial successful load populates cached UI state
    let cachedSummary: MetaHubSummaryResponse | null = null;
    let cachedReport: MetaReportJsonResponse | null = null;

    const firstSum = await fetchMetaHubSummary(
      { project: 'proj01', refresh: 0 },
      { runtimeEnv: 'sgw', fetchImpl: phasedFetch },
    );
    assert.equal(firstSum.ok, true);
    if (firstSum.ok) cachedSummary = firstSum.data;

    const firstRep = await generateMetaReport(
      { project: 'proj01', days: 7, format: 'json' },
      { runtimeEnv: 'sgw', fetchImpl: phasedFetch },
    );
    assert.equal(firstRep.ok && firstRep.data.format === 'json', true);
    if (firstRep.ok && firstRep.data.format === 'json') cachedReport = firstRep.data.report;

    // Subsequent refresh triggers 429 -> keepCachedView = true + "잠시 후 다시" message
    callPhase = 'rate_limited';
    const retrySum = await fetchMetaHubSummary(
      { project: 'proj01', refresh: 1 },
      { runtimeEnv: 'sgw', fetchImpl: phasedFetch },
    );
    const retryRep = await generateMetaReport(
      { project: 'proj01', days: 14, format: 'json' },
      { runtimeEnv: 'sgw', fetchImpl: phasedFetch },
    );

    assert.equal(retrySum.ok, false);
    if (!retrySum.ok) {
      assert.equal(retrySum.code, 'ERR_RATE_LIMITED');
      assert.equal(retrySum.keepCachedView, true);
      assert.ok(retrySum.message.includes('잠시 후 다시'));
      // Cache-preservation contract: only overwrite cache when !keepCachedView
      if (!retrySum.keepCachedView) cachedSummary = null;
    }

    assert.equal(retryRep.ok, false);
    if (!retryRep.ok) {
      assert.equal(retryRep.code, 'ERR_RATE_LIMITED');
      assert.equal(retryRep.keepCachedView, true);
      assert.ok(retryRep.message.includes('잠시 후 다시'));
      if (!retryRep.keepCachedView) cachedReport = null;
    }

    // Previously loaded views remain intact
    assert.equal(cachedSummary?.projectId, 'proj01');
    assert.equal(cachedSummary?.modules[0]?.summaryText, '접속 5명');
    assert.equal(cachedReport?.projectId, 'proj01');
    assert.equal(cachedReport?.executiveKpi.activeModules, 1);
  });

  it('5) handles partial failure (1 module unavailable in HTTP 200) honestly across HUD chips, Key Items, Search, and ReportModal', async () => {
    const registry: MetaRegistryResponse = {
      modules: [
        {
          moduleId: 'sgw',
          name: 'SGW 그룹웨어',
          status: 'active',
          capabilities: ['summary', 'search', 'report'],
          entryUrl: '/talk/',
        },
        {
          moduleId: 'sedms',
          name: 'SEDMS 도면관리',
          status: 'active',
          capabilities: ['drawings', 'search', 'report'],
          entryUrl: '/api/sedms-sso?return=%2Fprojects',
        },
        {
          moduleId: 'secms',
          name: 'SECMS 케이블',
          status: 'active',
          capabilities: ['cables', 'search'],
          entryUrl: '/secms/',
        },
        {
          moduleId: 'pdf',
          name: 'PDF 검토실',
          status: 'planned',
          capabilities: [],
          entryUrl: null,
        },
      ],
    };

    // 5a) HUD Summary with sedms = unavailable (no fake numbers, null entryUrl)
    const partialSummary: MetaHubSummaryResponse = {
      projectId: 'proj01',
      generatedAt: '2026-11-27T04:05:00.000Z',
      modules: [
        {
          moduleId: 'sgw',
          status: 'active',
          summaryText: '접속 6명',
          kpi: { online: 6 },
          updatedAt: '2026-11-27T04:05:00.000Z',
          entryUrl: '/talk/',
        },
        {
          moduleId: 'sedms',
          status: 'unavailable',
          summaryText: '',
          kpi: {},
          updatedAt: null,
          entryUrl: null,
        },
        {
          moduleId: 'secms',
          status: 'warn',
          summaryText: '주의 트레이 2건',
          kpi: { warnTrays: 2 },
          updatedAt: '2026-11-27T04:02:00.000Z',
          entryUrl: '/secms/proj01',
        },
        {
          moduleId: 'pdf',
          status: 'planned',
          summaryText: '준비 중',
          kpi: {},
          updatedAt: null,
          entryUrl: null,
        },
      ],
    };

    const chips = mergeHubModuleChips(registry, partialSummary);
    const sgwChip = chips.find((c) => c.moduleId === 'sgw');
    const sedmsChip = chips.find((c) => c.moduleId === 'sedms');
    const secmsChip = chips.find((c) => c.moduleId === 'secms');
    const pdfChip = chips.find((c) => c.moduleId === 'pdf');

    assert.equal(sgwChip?.disabled, false);
    assert.equal(sgwChip?.entryUrl, '/talk/');
    assert.equal(sedmsChip?.status, 'unavailable');
    assert.equal(sedmsChip?.statusLabel, '일시 오류');
    assert.equal(sedmsChip?.disabled, true);
    assert.deepEqual(sedmsChip?.kpi, {});
    assert.equal(secmsChip?.status, 'warn');
    assert.equal(secmsChip?.disabled, false);
    assert.equal(pdfChip?.status, 'planned');
    assert.equal(pdfChip?.statusLabel, '준비 중');
    assert.equal(pdfChip?.disabled, true);

    const summaryStats = summarizeHubChips(chips);
    assert.equal(summaryStats.unavailableCount, 1);
    assert.ok(summaryStats.mobileSummaryLabel.includes('일시 오류 1'));

    // 5b) Key Items: drawings = unavailable, cables = warn with 1 real item -> cable item renders, sedms shows honest notice
    const drawingsRes: MetaDrawingsKeyResponse = {
      status: 'unavailable',
      items: [
        // Even if server erroneously included an item with status='unavailable', combineKeyItemSources drops it honestly
        {
          id: 'ghost-dwg',
          moduleId: 'sedms',
          category: 'drawing',
          code: 'GHOST-01',
          title: '무시되어야 할 항목',
          metric: '0',
          severity: 'normal',
          updatedAt: null,
          deepLinkUrl: null,
        },
      ],
    };
    const cablesRes: MetaCablesKeyResponse = {
      status: 'warn',
      items: [
        {
          id: 'cbl-01',
          moduleId: 'secms',
          category: 'cable',
          code: 'TRAY-DECK-02',
          title: '상갑판 주간선 케이블 트레이',
          metric: '91%',
          severity: 'urgent',
          updatedAt: '2026-11-27T04:01:00.000Z',
          deepLinkUrl: '/secms/proj01/tray/02',
        },
      ],
    };

    const combined = combineKeyItemSources(drawingsRes, cablesRes);
    assert.equal(combined.items.length, 1);
    assert.equal(combined.items[0].code, 'TRAY-DECK-02');
    assert.equal(filterKeyItems(combined.items, 'urgent').length, 1);
    assert.equal(resolveKeyItemLink(combined.items[0]).disabled, false);

    const browseNotices = getNonNormalModuleNotices(combined.moduleStatuses, {
      filter: 'all',
      isSearchMode: false,
      registry,
    });
    assert.equal(browseNotices.length, 1);
    assert.equal(browseNotices[0].moduleId, 'sedms');
    assert.equal(browseNotices[0].moduleName, 'SEDMS 도면관리');
    assert.equal(browseNotices[0].statusLabel, '일시 오류');

    // 5c) Search response with partial failure -> "검색 안 된 시스템" includes unavailable + planned modules
    const searchRes: MetaItemsSearchResponse = {
      items: [
        {
          id: 'cbl-01',
          moduleId: 'secms',
          category: 'cable',
          code: 'TRAY-DECK-02',
          title: '상갑판 주간선 케이블 트레이',
          metric: '91%',
          severity: 'urgent',
          updatedAt: '2026-11-27T04:01:00.000Z',
          deepLinkUrl: '/secms/proj01/tray/02',
        },
      ],
      modules: {
        sgw: 'active',
        secms: 'warn',
        sedms: 'unavailable',
        pdf: 'planned',
      },
    };
    const unsearched = getNonNormalModuleNotices(searchRes.modules, {
      isSearchMode: true,
      registry,
    });
    assert.deepEqual(
      unsearched.map((n) => `${n.moduleId}:${n.statusLabel}`).sort(),
      ['pdf:준비 중', 'sedms:일시 오류'],
    );

    // 5d) ReportModal with partial unavailable module + integrity checks
    const partialReport: MetaReportJsonResponse = {
      reportVersion: '1.0',
      projectId: 'proj01',
      rangeDays: 7,
      generatedAt: '2026-11-27T04:05:00.000Z',
      executiveKpi: { activeModules: 2, cableWarnings: 1 },
      sections: [
        {
          moduleId: 'secms',
          status: 'warn',
          highlights: [cablesRes.items[0]],
        },
        {
          moduleId: 'sedms',
          status: 'unavailable',
          highlights: [],
        },
      ],
      unavailableModules: ['sedms'],
      integrity: { maskedResidue: 0, sourceHonesty: true },
    };

    assert.deepEqual(resolveUnavailableModuleNames(partialReport.unavailableModules, registry), [
      'SEDMS 도면관리',
    ]);
    assert.equal(formatExecutiveKpiCards(partialReport.executiveKpi).length, 2);
    assert.equal(isReportIntegrityVerified(partialReport.integrity), true);
    assert.equal(
      isReportIntegrityVerified({ maskedResidue: 1, sourceHonesty: true }),
      false,
    );

    const htmlVerified = renderToStaticMarkup(
      React.createElement(ReportModal, {
        open: true,
        projectId: 'proj01',
        projectName: '테스트 선박 01',
        runtimeEnv: 'sgw',
        registry,
        initialReport: partialReport,
        onClose: () => {},
        onPreviewLinkBlocked: () => {},
        onAuthRequired: () => {},
      }),
    );
    assert.ok(htmlVerified.includes('일부 시스템 일시 오류:'));
    assert.ok(htmlVerified.includes('SEDMS 도면관리'));
    assert.ok(htmlVerified.includes('TRAY-DECK-02'));
    assert.ok(htmlVerified.includes('검증됨'));

    // Unverified integrity (maskedResidue > 0) must NOT show "검증됨"
    const htmlUnverified = renderToStaticMarkup(
      React.createElement(ReportModal, {
        open: true,
        projectId: 'proj01',
        projectName: '테스트 선박 01',
        runtimeEnv: 'sgw',
        registry,
        initialReport: {
          ...partialReport,
          integrity: { maskedResidue: 2, sourceHonesty: true },
        },
        onClose: () => {},
        onPreviewLinkBlocked: () => {},
        onAuthRequired: () => {},
      }),
    );
    assert.equal(htmlUnverified.includes('검증됨'), false);
    assert.ok(htmlUnverified.includes('검토 필요'));
    assert.ok(htmlUnverified.includes('report-integrity-unverified'));
  });

  it('6) enforces project-switch abort isolation and lazy-loading code-split boundaries in App.tsx', async () => {
    // Coordinator aborts in-flight project A requests when switching to project B
    const coordinator = createProjectRequestCoordinator('proj01');
    let abortedA = false;
    const inflightA = coordinator.run<MetaHubSummaryResponse>('proj01', 'summary', (signal) => {
      return new Promise<MetaClientResult<MetaHubSummaryResponse>>((resolvePromise) => {
        signal.addEventListener('abort', () => {
          abortedA = true;
          resolvePromise({
            ok: false,
            code: 'ERR_ABORTED',
            aborted: true,
            message: 'aborted',
          });
        });
      });
    });

    coordinator.switchProject('proj02');
    const outcomeA = await inflightA;
    assert.equal(abortedA, true);
    assert.equal(outcomeA.stale, true);
    assert.equal(outcomeA.result, null);
    assert.equal(coordinator.getActiveProjectId(), 'proj02');

    // Static code-split guard: heavy hub/3D modules must stay lazily loaded from App.tsx
    const appSource = readFileSync(resolve(process.cwd(), 'src', 'App.tsx'), 'utf8');
    assert.ok(
      appSource.includes("const ReportModal = lazy(() =>") &&
        appSource.includes("import('./ui/ReportModal')"),
      'ReportModal must remain React.lazy code-split in App.tsx',
    );
    assert.ok(
      appSource.includes("const RadialActionMenu = lazy(() =>") &&
        appSource.includes("const OnboardPanel = lazy(() =>"),
      'RadialActionMenu and OnboardPanel must remain React.lazy code-split in App.tsx',
    );
    assert.ok(
      appSource.includes("import { loadHarborSceneModule } from './scene/harborSceneLoader'"),
      '3D HarborScene must remain dynamically loaded via harborSceneLoader',
    );
    assert.equal(
      /import\s+[^;]*ShipKeyItemsTab/.test(appSource),
      false,
      'App.tsx must not statically import ShipKeyItemsTab (kept inside lazy popup/onboard chunks)',
    );
    assert.equal(
      /from\s+['"]three['"]/.test(appSource),
      false,
      'App.tsx must never statically import three',
    );
  });
});
