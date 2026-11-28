import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ShipKeyItemsTab } from '../components/ShipKeyItemsTab';
import { ReportModal } from '../ui/ReportModal';
import {
  getPreviewHubRegistry,
  getPreviewKeyCables,
  getPreviewKeyDrawings,
  getPreviewReportJson,
  getPreviewReportMarkdown,
} from './hubFixtures';
import {
  formatNullableKpiValue,
  NULL_KPI_PLACEHOLDER,
  shouldRenderItemSeverityBadge,
  type MetaCablesKeyResponse,
  type MetaDrawingsKeyResponse,
  type MetaReportJsonResponse,
} from './hubTypes';
import {
  countCableItemsByStatus,
  DRAWINGS_URGENT_UNSUPPORTED_MESSAGE,
  extractCableProgressSummary,
  filterCableItemsByStatus,
  formatRelativeUpdatedAt,
  getSecmsLinkRequirement,
} from './keyItemsModel';
import {
  fetchMetaKeyCables,
  fetchMetaKeyDrawings,
  type MetaFetchLike,
} from './metaClient';
import { formatExecutiveKpiCards } from './reportModel';

const FIXED_NOW_MS = Date.parse('2026-11-27T12:00:00.000Z');

describe('Stage 6: Finalized SEDMS & SEcMS real response contract', () => {
  it('1) SEDMS drawings/key: preserves null KPIs ("—"), severity:null (hidden badge), updatedAt:null ("날짜 없음"), opaque "도번|목록종류" id, and filter=urgent unsupported:true', async () => {
    // Preview fixtures (proj01 normal)
    const latest = getPreviewKeyDrawings('proj01', { filter: 'latest', nowMs: FIXED_NOW_MS });
    assert.equal(latest.kpi?.drawingRevisionCount, 14);
    assert.equal(latest.kpi?.drawingPendingApproval, 2);
    assert.equal(latest.kpi?.urgentComments, null);
    assert.equal(formatNullableKpiValue(latest.kpi?.urgentComments), NULL_KPI_PLACEHOLDER);
    assert.ok(latest.items.some((item) => item.id === 'DWG-01|rev'));
    assert.ok(latest.items.every((item) => item.severity === null));
    assert.ok(latest.items.some((item) => item.updatedAt === null));

    const urgent = getPreviewKeyDrawings('proj01', { filter: 'urgent', nowMs: FIXED_NOW_MS });
    assert.deepEqual(urgent.items, []);
    assert.equal(urgent.unsupported, true);

    // SGW mode parser preserves kpi nulls, severity:null, unsupported:true, opaque id
    const mockFetch: MetaFetchLike = async (input) => {
      const url = String(input);
      if (url.includes('filter=urgent')) {
        return new Response(
          JSON.stringify({
            status: 'active',
            items: [],
            unsupported: true,
            kpi: { drawingRevisionCount: 9, drawingPendingApproval: 1, urgentComments: null },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({
          status: 'active',
          kpi: { drawingRevisionCount: 9, drawingPendingApproval: 1, urgentComments: null },
          items: [
            {
              id: 'DWG-99|rev',
              moduleId: 'sedms',
              category: 'drawing',
              code: 'DWG-99',
              title: 'SGW 실도면 항목',
              metric: 'Rev.01',
              severity: null,
              updatedAt: null,
              deepLinkUrl: '/api/sedms-sso?return=%2Fproject%2Fproj01',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };

    const sgwLatest = await fetchMetaKeyDrawings(
      { project: 'proj01', filter: 'latest' },
      { runtimeEnv: 'sgw', fetchImpl: mockFetch },
    );
    assert.equal(sgwLatest.ok, true);
    if (sgwLatest.ok) {
      assert.equal(sgwLatest.data.kpi?.urgentComments, null);
      assert.equal(sgwLatest.data.items[0].id, 'DWG-99|rev');
      assert.equal(sgwLatest.data.items[0].severity, null);
      assert.equal(sgwLatest.data.items[0].updatedAt, null);
      assert.equal(formatRelativeUpdatedAt(sgwLatest.data.items[0].updatedAt), '날짜 없음');
    }

    const sgwUrgent = await fetchMetaKeyDrawings(
      { project: 'proj01', filter: 'urgent' },
      { runtimeEnv: 'sgw', fetchImpl: mockFetch },
    );
    assert.equal(sgwUrgent.ok, true);
    if (sgwUrgent.ok) {
      assert.deepEqual(sgwUrgent.data.items, []);
      assert.equal(sgwUrgent.data.unsupported, true);
    }
  });

  it('2) SEcMS cables/key: renders progress bar for normal numbers, "—" when cablesLaid/cablesTotal is null, filters 미포설/포설 중, and surfaces SEcMS link card on nosource+entryUrl', async () => {
    // 2a) Normal progress (proj01: 82/120 -> 68%)
    const cNormal = getPreviewKeyCables('proj01', { nowMs: FIXED_NOW_MS });
    const progNormal = extractCableProgressSummary(cNormal);
    assert.equal(progNormal.hasNumbers, true);
    assert.equal(progNormal.cablesLaid, 82);
    assert.equal(progNormal.cablesTotal, 120);
    assert.equal(progNormal.progressPct, 68);
    assert.equal(progNormal.displayText, '82 / 120 (68%)');
    assert.equal(cNormal.kpi?.cableTrayWarningCount, null);

    // Cable status sub-filters (미포설 / 포설 중)
    assert.deepEqual(countCableItemsByStatus(cNormal.items), { all: 3, unlaid: 2, laying: 1 });
    assert.equal(filterCableItemsByStatus(cNormal.items, 'unlaid').length, 2);
    assert.equal(filterCableItemsByStatus(cNormal.items, 'laying').length, 1);

    // 2b) Null progress (proj02: cablesLaid: null -> hasNumbers: false, "—", NO progress bar)
    const cNull = getPreviewKeyCables('proj02', { nowMs: FIXED_NOW_MS });
    const progNull = extractCableProgressSummary(cNull);
    assert.equal(progNull.hasNumbers, false);
    assert.equal(progNull.progressPct, null);
    assert.equal(progNull.displayText, NULL_KPI_PLACEHOLDER);

    // 2c) SEcMS nosource + entryUrl '/api/secms-link' (proj03) -> link required card
    const cNoSource = getPreviewKeyCables('proj03', { nowMs: FIXED_NOW_MS });
    const linkReq = getSecmsLinkRequirement(cNoSource);
    assert.equal(linkReq.required, true);
    assert.equal(linkReq.entryUrl, '/api/secms-link');
    assert.equal(linkReq.message, 'SEcMS 계정 연결이 필요합니다');
    assert.equal(linkReq.buttonLabel, 'SEcMS 연결');

    // 2d) SEcMS planned (proj04) -> link NOT required, status planned
    const cPlanned = getPreviewKeyCables('proj04', { nowMs: FIXED_NOW_MS });
    assert.equal(cPlanned.status, 'planned');
    assert.equal(getSecmsLinkRequirement(cPlanned).required, false);

    // 2e) SGW mode fetchMetaKeyCables preserves kpi nulls & sanitized entryUrl
    const mockCableFetch: MetaFetchLike = async () =>
      new Response(
        JSON.stringify({
          status: 'nosource',
          entryUrl: '/api/secms-link',
          kpi: { cablePullProgressPct: null, cablesTotal: null, cablesLaid: null, cableTrayWarningCount: null },
          items: [],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    const sgwCable = await fetchMetaKeyCables(
      { project: 'proj03' },
      { runtimeEnv: 'sgw', fetchImpl: mockCableFetch },
    );
    assert.equal(sgwCable.ok, true);
    if (sgwCable.ok) {
      assert.equal(sgwCable.data.status, 'nosource');
      assert.equal(sgwCable.data.entryUrl, '/api/secms-link');
      assert.equal(sgwCable.data.kpi?.cablesLaid, null);
      assert.equal(getSecmsLinkRequirement(sgwCable.data).required, true);
    }
  });

  it('3) ShipKeyItemsTab SSR: renders progress bar (normal), "—" (null), SEcMS link button (nosource), urgent unsupported notice, hidden severity badges, and "날짜 없음"', () => {
    const registry = getPreviewHubRegistry();

    // 3a) proj01 normal: progress bar + hidden severity badges + "날짜 없음" + cable sub-filters
    const normalHtml = renderToStaticMarkup(
      React.createElement(ShipKeyItemsTab, {
        projectId: 'proj01',
        runtimeEnv: 'preview',
        registry,
        initialDrawings: getPreviewKeyDrawings('proj01', { nowMs: FIXED_NOW_MS }),
        initialCables: getPreviewKeyCables('proj01', { nowMs: FIXED_NOW_MS }),
        initialFilter: 'cable',
        onPreviewLinkBlocked: () => {},
      }),
    );
    assert.match(normalHtml, /data-testid="cable-progress-bar"/);
    assert.match(normalHtml, /82 \/ 120 \(68%\)/);
    assert.match(normalHtml, /data-testid="cable-subfilter-unlaid"/);
    assert.match(normalHtml, /data-testid="cable-subfilter-laying"/);
    assert.match(normalHtml, /날짜 없음/);
    assert.doesNotMatch(normalHtml, /data-testid="key-item-severity-/);

    // 3b) proj02 null progress: NO progress bar, renders "—" with title="원천 없음"
    const nullProgHtml = renderToStaticMarkup(
      React.createElement(ShipKeyItemsTab, {
        projectId: 'proj02',
        runtimeEnv: 'preview',
        registry,
        initialDrawings: getPreviewKeyDrawings('proj02', { nowMs: FIXED_NOW_MS }),
        initialCables: getPreviewKeyCables('proj02', { nowMs: FIXED_NOW_MS }),
        initialFilter: 'all',
        onPreviewLinkBlocked: () => {},
      }),
    );
    assert.doesNotMatch(nullProgHtml, /data-testid="cable-progress-bar"/);
    assert.match(nullProgHtml, /data-testid="cable-progress-null"/);
    assert.match(nullProgHtml, /title="원천 없음"/);
    assert.match(nullProgHtml, /—/);

    // 3c) proj03 nosource + entryUrl '/api/secms-link': renders SEcMS link card + [SEcMS 연결] anchor
    const noSourceHtml = renderToStaticMarkup(
      React.createElement(ShipKeyItemsTab, {
        projectId: 'proj03',
        runtimeEnv: 'sgw',
        registry,
        initialDrawings: getPreviewKeyDrawings('proj03', { nowMs: FIXED_NOW_MS }),
        initialCables: getPreviewKeyCables('proj03', { nowMs: FIXED_NOW_MS }),
        initialFilter: 'all',
        onPreviewLinkBlocked: () => {},
      }),
    );
    assert.match(noSourceHtml, /data-testid="secms-link-required-card"/);
    assert.match(noSourceHtml, /SEcMS 계정 연결이 필요합니다/);
    assert.match(noSourceHtml, /data-testid="secms-link-btn"/);
    assert.match(noSourceHtml, /href="\/api\/secms-link"/);
    assert.match(noSourceHtml, /SEcMS 연결/);

    // 3d) filter=urgent with unsupported:true -> "SEDMS 에 긴급 구분이 없습니다" (NOT generic empty box)
    const urgentUnsupportedDrawings: MetaDrawingsKeyResponse = {
      status: 'warn',
      items: [],
      unsupported: true,
    };
    const urgentHtml = renderToStaticMarkup(
      React.createElement(ShipKeyItemsTab, {
        projectId: 'proj01',
        runtimeEnv: 'preview',
        registry,
        initialDrawings: urgentUnsupportedDrawings,
        initialCables: { status: 'planned', items: [] } as MetaCablesKeyResponse,
        initialFilter: 'urgent',
        initialUrgentUnsupported: true,
        onPreviewLinkBlocked: () => {},
      }),
    );
    assert.match(urgentHtml, /data-testid="key-items-urgent-unsupported"/);
    assert.ok(urgentHtml.includes(DRAWINGS_URGENT_UNSUPPORTED_MESSAGE));
    assert.doesNotMatch(urgentHtml, /data-testid="key-items-empty"/);
  });

  it('4) ReportModal & reportModel: never hides null KPIs; renders "—" + "원천 없음" tooltip and hides null severity badges', () => {
    const cards = formatExecutiveKpiCards({
      drawingRevisionCount: 14,
      urgentComments: null,
      cablePullProgressPct: 68,
      cableTrayWarningCount: null,
    });
    assert.equal(cards.length, 4);

    const urgentCard = cards.find((c) => c.key === 'urgentComments');
    assert.equal(urgentCard?.value, NULL_KPI_PLACEHOLDER);
    assert.equal(urgentCard?.isNull, true);
    assert.equal(urgentCard?.tooltip, '원천 없음');

    const pctCard = cards.find((c) => c.key === 'cablePullProgressPct');
    assert.equal(pctCard?.value, '68%');
    assert.equal(pctCard?.isNull, false);

    // ReportModal SSR with proj02 (cablePullProgressPct: null, urgentComments: null, cableTrayWarningCount: null)
    const registry = getPreviewHubRegistry();
    const reportProj02 = getPreviewReportJson('proj02', 7, FIXED_NOW_MS);
    const html = renderToStaticMarkup(
      React.createElement(ReportModal, {
        open: true,
        projectId: 'proj02',
        projectName: 'proj02',
        runtimeEnv: 'preview',
        registry,
        initialReport: reportProj02,
        onClose: () => {},
        onPreviewLinkBlocked: () => {},
      }),
    );

    assert.match(html, /data-testid="report-kpi-urgentComments"[^>]*data-null="true"[^>]*title="원천 없음"/);
    assert.match(html, /data-testid="report-kpi-cableTrayWarningCount"[^>]*data-null="true"[^>]*title="원천 없음"/);
    assert.match(html, /data-testid="report-kpi-cablePullProgressPct"[^>]*data-null="true"[^>]*title="원천 없음"/);
    assert.match(html, /data-testid="report-kpi-nosource-urgentComments"/);
    assert.match(html, /날짜 없음/);
    // SEDMS/SEcMS severity:null items do NOT render severity badges, while SGW items still do
    assert.doesNotMatch(html, /data-testid="report-item-severity-DWG-21\|rev"/);
    assert.match(html, /data-testid="report-item-severity-sgw-proj02-task-01"/);

    // Markdown export also prints "— (원천 없음)" instead of "null"
    const md = getPreviewReportMarkdown('proj02', 7, FIXED_NOW_MS);
    assert.ok(md.includes('urgentComments: — (원천 없음)'));
    assert.equal(md.includes(': null'), false);
  });

  it('5) severityProvided: false suppresses ALL severity badges (including "일반") in ShipKeyItemsTab, ReportModal, and metaClient', async () => {
    // 5a) Preview fixtures mark SEDMS drawing items with severityProvided: false
    const previewDrawings = getPreviewKeyDrawings('proj01', { nowMs: FIXED_NOW_MS });
    assert.ok(previewDrawings.items.length > 0);
    assert.ok(previewDrawings.items.every((item) => item.severityProvided === false));

    // 5b) Helper strictly rejects severityProvided: false even when severity === 'normal' | 'warn' | 'urgent'
    assert.equal(shouldRenderItemSeverityBadge({ severity: 'normal', severityProvided: false }), false);
    assert.equal(shouldRenderItemSeverityBadge({ severity: 'warn', severityProvided: false }), false);
    assert.equal(shouldRenderItemSeverityBadge({ severity: 'urgent', severityProvided: false }), false);
    assert.equal(shouldRenderItemSeverityBadge({ severity: null, severityProvided: false }), false);
    assert.equal(shouldRenderItemSeverityBadge({ severity: 'normal', severityProvided: true }), true);
    assert.equal(shouldRenderItemSeverityBadge({ severity: 'normal' }), true);
    assert.equal(shouldRenderItemSeverityBadge({ severity: null }), false);

    // 5c) metaClient preserves severityProvided: false from real SGW server payload (even if severity === 'normal')
    const mockFetch: MetaFetchLike = async () =>
      new Response(
        JSON.stringify({
          status: 'active',
          items: [
            {
              id: 'DWG-88|rev',
              moduleId: 'sedms',
              category: 'drawing',
              code: 'DWG-88',
              title: '심각도 미제공 도면',
              metric: 'Rev.02',
              severity: 'normal',
              severityProvided: false,
              updatedAt: '2026-11-27T10:00:00.000Z',
              deepLinkUrl: '/api/sedms-sso?return=%2Fproject%2Fproj01',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );

    const fetched = await fetchMetaKeyDrawings(
      { project: 'proj01', filter: 'latest' },
      { runtimeEnv: 'sgw', fetchImpl: mockFetch },
    );
    assert.equal(fetched.ok, true);
    assert.ok(fetched.ok);
    assert.equal(fetched.data.items[0].severity, 'normal');
    assert.equal(fetched.data.items[0].severityProvided, false);

    // 5d) ShipKeyItemsTab renders ZERO severity badge (not even "일반") when severityProvided === false
    const tabHtml = renderToStaticMarkup(
      React.createElement(ShipKeyItemsTab, {
        projectId: 'proj01',
        runtimeEnv: 'sgw',
        registry: getPreviewHubRegistry(),
        initialDrawings: fetched.data,
        initialCables: { status: 'planned', items: [] },
        initialFilter: 'drawing',
        onPreviewLinkBlocked: () => {},
      }),
    );
    assert.match(tabHtml, /DWG-88/);
    assert.doesNotMatch(tabHtml, /data-testid="key-item-severity-DWG-88\|rev"/);
    assert.doesNotMatch(tabHtml, />일반</);

    // 5e) ReportModal renders ZERO severity badge (desktop & mobile, not even "일반") for severityProvided === false,
    //     while still rendering severity badges for items that genuinely provide severity
    const reportWithUnprovided: MetaReportJsonResponse = {
      reportVersion: '1.0',
      projectId: 'proj01',
      rangeDays: 7,
      generatedAt: '2026-11-27T12:00:00.000Z',
      executiveKpi: { drawingRevisionCount: 1, urgentComments: null },
      sections: [
        {
          moduleId: 'sedms',
          status: 'active',
          highlights: [
            {
              id: 'DWG-88|rev',
              moduleId: 'sedms',
              category: 'drawing',
              code: 'DWG-88',
              title: '심각도 미제공 도면',
              metric: 'Rev.02',
              severity: 'normal',
              severityProvided: false,
              updatedAt: '2026-11-27T10:00:00.000Z',
              deepLinkUrl: '/api/sedms-sso?return=%2Fproject%2Fproj01',
            },
          ],
        },
        {
          moduleId: 'sgw',
          status: 'active',
          highlights: [
            {
              id: 'sgw-task-88',
              moduleId: 'sgw',
              category: 'task',
              code: 'TSK-88',
              title: '심각도 제공 작업',
              metric: '진행 중',
              severity: 'warn',
              severityProvided: true,
              updatedAt: '2026-11-27T11:00:00.000Z',
              deepLinkUrl: '/talk/',
            },
          ],
        },
      ],
      unavailableModules: [],
      integrity: { maskedResidue: 0, sourceHonesty: true },
    };

    const reportHtml = renderToStaticMarkup(
      React.createElement(ReportModal, {
        open: true,
        projectId: 'proj01',
        projectName: 'proj01',
        runtimeEnv: 'sgw',
        registry: getPreviewHubRegistry(),
        initialReport: reportWithUnprovided,
        onClose: () => {},
        onPreviewLinkBlocked: () => {},
      }),
    );
    assert.match(reportHtml, /DWG-88/);
    assert.doesNotMatch(reportHtml, /data-testid="report-item-severity-DWG-88\|rev"/);
    assert.doesNotMatch(reportHtml, /data-testid="report-mobile-item-severity-DWG-88\|rev"/);
    assert.doesNotMatch(reportHtml, />일반</);
    assert.match(reportHtml, /data-testid="report-item-severity-sgw-task-88"/);
    assert.match(reportHtml, /data-testid="report-mobile-item-severity-sgw-task-88"/);
  });
});
