import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HudHubStatusStrip } from '../components/HudHubStatusStrip';
import { OnboardPanel } from '../components/OnboardPanel';
import { RadialActionMenu } from '../components/RadialActionMenu';
import { mapEmployeesToHarborPeople, mapProjectsToHarborShips } from '../mapping';
import { mergeHubModuleChips } from '../meta/hubChipModel';
import {
  getPreviewHubRegistry,
  getPreviewHubSummary,
  getPreviewReportJson,
} from '../meta/hubFixtures';
import type { MetaReportJsonResponse } from '../meta/hubTypes';
import {
  buildReportDownloadFilename,
  formatExecutiveKpiCards,
  isReportIntegrityVerified,
  resolveUnavailableModuleNames,
} from '../meta/reportModel';
import {
  getPreviewDemoEmployees,
  getPreviewDemoPresence,
  getPreviewDemoProjects,
} from '../previewFixtures';
import { ReportModal } from './ReportModal';

const FIXED_NOW_MS = Date.parse('2026-05-01T12:00:00.000Z');

function assertEveryButtonHasAriaLabel(html: string, context: string): void {
  const buttonMatches = html.match(/<button\b[^>]*>/g) ?? [];
  assert.ok(buttonMatches.length > 0, `${context}: expected at least one button`);
  for (const tag of buttonMatches) {
    assert.match(tag, /aria-label="[^"]+"/, `${context}: button missing aria-label: ${tag}`);
  }
}

test('Stage 4: formatExecutiveKpiCards maps known labels, humanizes future keys, and omits absent keys', () => {
  const cards = formatExecutiveKpiCards({
    activeModules: 2,
    recentDrawings: 6,
    customMetricCount: 11,
  });

  assert.equal(cards.length, 3);
  assert.deepEqual(
    cards.map((c) => [c.key, c.label, c.value]),
    [
      ['activeModules', '가동 시스템', '2'],
      ['recentDrawings', '최근 도면', '6'],
      ['customMetricCount', 'Custom Metric Count', '11'],
    ],
  );
  // Absent keys must never be fabricated
  assert.equal(cards.some((c) => c.key === 'cableWarnings'), false);
  assert.deepEqual(formatExecutiveKpiCards({}), []);
});

test('Stage 4: isReportIntegrityVerified returns true strictly when maskedResidue === 0', () => {
  assert.equal(isReportIntegrityVerified({ maskedResidue: 0, sourceHonesty: true }), true);
  assert.equal(isReportIntegrityVerified({ maskedResidue: 1, sourceHonesty: true }), false);
  assert.equal(isReportIntegrityVerified({ maskedResidue: -1, sourceHonesty: true }), false);
  assert.equal(isReportIntegrityVerified(null), false);
});

test('Stage 4: buildReportDownloadFilename follows report-<projectId>-<YYYY-MM-DD>.md strictly', () => {
  assert.equal(
    buildReportDownloadFilename('proj01', '2026-05-01T09:30:00.000Z', FIXED_NOW_MS),
    'report-proj01-2026-05-01.md',
  );
  assert.equal(
    buildReportDownloadFilename('proj_02', null, FIXED_NOW_MS),
    'report-proj_02-2026-05-01.md',
  );
  // Sanitizes unexpected chars cleanly
  assert.equal(
    buildReportDownloadFilename('../proj03', '2026-05-01T00:00:00.000Z', FIXED_NOW_MS),
    'report-proj03-2026-05-01.md',
  );
});

test('Stage 4: resolveUnavailableModuleNames maps registry names and preserves unknown module IDs', () => {
  const registry = getPreviewHubRegistry();
  const names = resolveUnavailableModuleNames(['sedms', 'secms', 'futuremod', 'sedms'], registry);
  assert.deepEqual(names, ['SEDMS 도면관리', 'SEcMS 케이블', 'futuremod']);
  assert.deepEqual(resolveUnavailableModuleNames([], registry), []);
});

test('Stage 4: ReportModal SSR renders KPI cards, module sections, verified badge (maskedResidue===0), unavailable warning, and aria-labels', () => {
  const registry = getPreviewHubRegistry();
  const verifiedReport = getPreviewReportJson('proj01', 7, FIXED_NOW_MS);

  const verifiedHtml = renderToStaticMarkup(
    React.createElement(ReportModal, {
      open: true,
      projectId: 'proj01',
      projectName: 'proj01',
      runtimeEnv: 'preview',
      registry,
      initialReport: verifiedReport,
      onClose: () => {},
      onPreviewLinkBlocked: () => {},
    }),
  );

  assert.match(verifiedHtml, /data-testid="report-modal"/);
  assert.match(verifiedHtml, /data-testid="report-integrity-verified"/);
  assert.match(verifiedHtml, /검증됨/);
  assert.doesNotMatch(verifiedHtml, /data-testid="report-unavailable-warning"/);
  assert.match(verifiedHtml, /data-testid="report-kpi-activeModules"/);
  assert.match(verifiedHtml, /data-testid="report-days-7"/);
  assert.match(verifiedHtml, /data-testid="report-days-14"/);
  assert.match(verifiedHtml, /data-testid="report-days-30"/);
  assert.match(verifiedHtml, /data-testid="report-copy-md"/);
  assert.match(verifiedHtml, /data-testid="report-download-md"/);
  assert.match(verifiedHtml, /data-testid="report-section-sedms"/);
  assertEveryButtonHasAriaLabel(verifiedHtml, 'ReportModal(verified)');

  // Unverified integrity (maskedResidue > 0) + unavailableModules warning line
  const warnReport: MetaReportJsonResponse = {
    ...verifiedReport,
    unavailableModules: ['sedms'],
    integrity: { maskedResidue: 2, sourceHonesty: false },
  };
  const warnHtml = renderToStaticMarkup(
    React.createElement(ReportModal, {
      open: true,
      projectId: 'proj01',
      projectName: 'proj01',
      runtimeEnv: 'sgw',
      registry,
      initialReport: warnReport,
      onClose: () => {},
      onPreviewLinkBlocked: () => {},
    }),
  );
  assert.doesNotMatch(warnHtml, /data-testid="report-integrity-verified"/);
  assert.match(warnHtml, /data-testid="report-integrity-unverified"/);
  assert.match(warnHtml, /data-testid="report-unavailable-warning"/);
  assert.match(warnHtml, /SEDMS 도면관리/);
  assertEveryButtonHasAriaLabel(warnHtml, 'ReportModal(unverified+unavailable)');
});

test('Stage 4: Report trigger buttons render with aria-label on HUD, OnboardPanel, and business ship popup only', () => {
  const registry = getPreviewHubRegistry();
  const summary = getPreviewHubSummary('proj01', FIXED_NOW_MS);
  const chips = mergeHubModuleChips(registry, summary);
  const ships = mapProjectsToHarborShips(getPreviewDemoProjects(FIXED_NOW_MS), FIXED_NOW_MS);
  const people = mapEmployeesToHarborPeople(
    getPreviewDemoEmployees(),
    getPreviewDemoPresence(FIXED_NOW_MS),
    'user01',
    FIXED_NOW_MS,
  );

  const hudHtml = renderToStaticMarkup(
    React.createElement(HudHubStatusStrip, {
      chips,
      runtimeEnv: 'preview',
      projectLabel: 'proj01',
      onRefresh: () => {},
      onOpenReport: () => {},
      onPreviewLinkBlocked: () => {},
    }),
  );
  assert.match(hudHtml, /data-testid="hud-report-btn"/);
  assert.match(hudHtml, /data-testid="hud-mobile-report-btn"/);
  assertEveryButtonHasAriaLabel(hudHtml, 'HudHubStatusStrip(report)');

  const onboardHtml = renderToStaticMarkup(
    React.createElement(OnboardPanel, {
      ship: ships[0],
      phase: 'onboard',
      runtimeEnv: 'preview',
      hubRegistry: registry,
      onOpenReport: () => {},
      onPreviewLinkBlocked: () => {},
      onDisembark: () => {},
    }),
  );
  assert.match(onboardHtml, /data-testid="onboard-report-btn"/);
  assertEveryButtonHasAriaLabel(onboardHtml, 'OnboardPanel(report)');

  const shipPopupHtml = renderToStaticMarkup(
    React.createElement(RadialActionMenu, {
      target: { kind: 'ship', ship: ships[0], anchor: { x: 640, y: 400 } },
      runtimeEnv: 'preview',
      hubRegistry: registry,
      onOpenReport: () => {},
      onPreviewLinkBlocked: () => {},
      onClose: () => {},
    }),
  );
  assert.match(shipPopupHtml, /data-testid="radial-report-btn"/);
  assertEveryButtonHasAriaLabel(shipPopupHtml, 'RadialActionMenu(ship+report)');

  const personPopupHtml = renderToStaticMarkup(
    React.createElement(RadialActionMenu, {
      target: { kind: 'person', person: people[0], anchor: { x: 640, y: 400 } },
      runtimeEnv: 'preview',
      hubRegistry: registry,
      onOpenReport: () => {},
      onPreviewLinkBlocked: () => {},
      onClose: () => {},
    }),
  );
  assert.doesNotMatch(personPopupHtml, /data-testid="radial-report-btn"/);
});
