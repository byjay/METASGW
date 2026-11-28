import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OnboardPanel } from '../components/OnboardPanel';
import { RadialActionMenu } from '../components/RadialActionMenu';
import { ShipKeyItemsTab } from '../components/ShipKeyItemsTab';
import { mapEmployeesToHarborPeople, mapProjectsToHarborShips } from '../mapping';
import {
  getPreviewDemoEmployees,
  getPreviewDemoPresence,
  getPreviewDemoProjects,
} from '../previewFixtures';
import {
  getPreviewHubRegistry,
  getPreviewKeyCables,
  getPreviewKeyDrawings,
  getPreviewSearchItems,
} from './hubFixtures';
import type { MetaCablesKeyResponse, MetaDrawingsKeyResponse, MetaKeyItem } from './hubTypes';
import {
  combineKeyItemSources,
  countKeyItemsByFilter,
  filterKeyItems,
  formatRelativeUpdatedAt,
  getNonNormalModuleNotices,
  KEY_ITEMS_SEARCH_DEBOUNCE_MS,
  resolveKeyItemLink,
} from './keyItemsModel';

const FIXED_NOW_MS = Date.parse('2026-05-01T12:00:00.000Z');

function assertEveryButtonHasAriaLabel(html: string, context: string): void {
  const buttonMatches = html.match(/<button\b[^>]*>/g) ?? [];
  assert.ok(buttonMatches.length > 0, `${context}: expected at least one button`);
  for (const tag of buttonMatches) {
    assert.match(tag, /aria-label="[^"]+"/, `${context}: button missing aria-label: ${tag}`);
  }
}

test('Stage 3: combineKeyItemSources combines SEDMS drawings + SEcMS cables and emits 0 fake rows for planned modules', () => {
  const drawings = getPreviewKeyDrawings('proj01', { nowMs: FIXED_NOW_MS });
  const cables = getPreviewKeyCables('proj01', { nowMs: FIXED_NOW_MS });

  const combined = combineKeyItemSources(drawings, cables);
  assert.equal(combined.moduleStatuses.sedms, 'warn');
  assert.equal(combined.moduleStatuses.secms, 'active');
  assert.equal(combined.items.length, 7); // 4 drawings + 3 cables
  assert.equal(combined.items[0].code, 'DWG-01');
  assert.equal(combined.items[0].severity, null);

  // Even if a faulty non-normal response carried stray items, honest combiner drops them
  const fakePlannedCables: MetaCablesKeyResponse = {
    status: 'planned',
    items: [
      {
        id: 'fake-cbl-01',
        moduleId: 'secms',
        category: 'cable',
        code: 'CBL-01',
        title: 'should not render',
        metric: '미포설',
        severity: null,
        updatedAt: '2026-05-01T10:00:00.000Z',
        deepLinkUrl: null,
      },
    ],
  };
  const guarded = combineKeyItemSources(drawings, fakePlannedCables);
  assert.equal(guarded.items.filter((i) => i.category === 'cable').length, 0);
});

test('Stage 3: filterKeyItems & countKeyItemsByFilter accurately handle 전체/도면/케이블/긴급', () => {
  const sampleItems: MetaKeyItem[] = [
    {
      id: 'item-dwg-01',
      moduleId: 'sedms',
      category: 'drawing',
      code: 'DWG-01',
      title: '배관 배치도 긴급 검토',
      metric: '긴급 검토',
      severity: 'urgent',
      updatedAt: '2026-05-01T11:00:00.000Z',
      deepLinkUrl: '/api/sedms-sso?return=%2Fproject%2Fproj01',
    },
    {
      id: 'item-dwg-02',
      moduleId: 'sedms',
      category: 'drawing',
      code: 'DWG-02',
      title: '갑판 의장 배치도',
      metric: 'Rev.02',
      severity: 'normal',
      updatedAt: '2026-05-01T09:00:00.000Z',
      deepLinkUrl: '/api/sedms-sso?return=%2Fproject%2Fproj01',
    },
    {
      id: 'item-cbl-01',
      moduleId: 'secms',
      category: 'cable',
      code: 'CBL-01',
      title: '주전원 트레이 과밀 구간',
      metric: '94%',
      severity: 'urgent',
      updatedAt: '2026-05-01T10:30:00.000Z',
      deepLinkUrl: null,
    },
  ];

  const counts = countKeyItemsByFilter(sampleItems);
  assert.deepEqual(counts, { all: 3, drawing: 2, cable: 1, urgent: 2 });
  assert.equal(filterKeyItems(sampleItems, 'all').length, 3);
  assert.equal(filterKeyItems(sampleItems, 'drawing').length, 2);
  assert.equal(filterKeyItems(sampleItems, 'cable').length, 1);
  assert.equal(filterKeyItems(sampleItems, 'urgent').length, 2);
  assert.equal(KEY_ITEMS_SEARCH_DEBOUNCE_MS, 300);
});

test('Stage 3: formatRelativeUpdatedAt renders accurate Korean relative timestamps and 날짜 없음 for null', () => {
  assert.equal(formatRelativeUpdatedAt('2026-05-01T11:59:35.000Z', FIXED_NOW_MS), '방금 전');
  assert.equal(formatRelativeUpdatedAt('2026-05-01T11:42:00.000Z', FIXED_NOW_MS), '18분 전');
  assert.equal(formatRelativeUpdatedAt('2026-05-01T09:00:00.000Z', FIXED_NOW_MS), '3시간 전');
  assert.equal(formatRelativeUpdatedAt('2026-04-29T12:00:00.000Z', FIXED_NOW_MS), '2일 전');
  assert.equal(formatRelativeUpdatedAt(null, FIXED_NOW_MS), '날짜 없음');
  assert.equal(formatRelativeUpdatedAt('invalid-date', FIXED_NOW_MS), '날짜 없음');
});

test('Stage 3: getNonNormalModuleNotices surfaces honest status cards and unsearched systems', () => {
  const registry = getPreviewHubRegistry();

  // Browse mode: sedms active/warn, secms planned
  const browseNoticesAll = getNonNormalModuleNotices(
    { sedms: 'warn', secms: 'planned' },
    { filter: 'all', isSearchMode: false, registry },
  );
  assert.equal(browseNoticesAll.length, 1);
  assert.equal(browseNoticesAll[0].moduleId, 'secms');
  assert.equal(browseNoticesAll[0].statusLabel, '준비 중');

  // Browse mode filtered to drawing hides secms notice
  const browseNoticesDrawing = getNonNormalModuleNotices(
    { sedms: 'warn', secms: 'planned' },
    { filter: 'drawing', isSearchMode: false, registry },
  );
  assert.equal(browseNoticesDrawing.length, 0);

  // Browse mode with nosource & unavailable
  const drawingsNoSource: MetaDrawingsKeyResponse = { status: 'nosource', items: [] };
  const cablesUnavailable: MetaCablesKeyResponse = { status: 'unavailable', items: [] };
  const combined = combineKeyItemSources(drawingsNoSource, cablesUnavailable);
  const errorNotices = getNonNormalModuleNotices(combined.moduleStatuses, {
    filter: 'all',
    isSearchMode: false,
    registry,
  });
  assert.equal(errorNotices.find((n) => n.moduleId === 'sedms')?.statusLabel, '원천 없음');
  assert.equal(errorNotices.find((n) => n.moduleId === 'secms')?.statusLabel, '일시 오류');

  // Search mode: returns all non-normal modules from search response ("검색 안 된 시스템")
  const searchRes = getPreviewSearchItems('proj01', { q: '배관', nowMs: FIXED_NOW_MS });
  const unsearched = getNonNormalModuleNotices(
    { ...searchRes.modules, futuremod: 'planned' },
    { isSearchMode: true, registry },
  );
  assert.equal(unsearched.length, 5); // s360, secad, pdf, mail, futuremod
  assert.ok(unsearched.some((n) => n.moduleId === 's360' && n.statusLabel === '준비 중'));
  assert.ok(unsearched.some((n) => n.moduleId === 'futuremod' && n.moduleName === 'futuremod'));
});

test('Stage 3: resolveKeyItemLink uses server-provided safe deepLinkUrl only and disables null/unsafe URLs', () => {
  const safe = resolveKeyItemLink({ deepLinkUrl: '/api/sedms-sso?return=%2Fproject%2Fproj01' });
  assert.equal(safe.disabled, false);
  assert.equal(safe.href, '/api/sedms-sso?return=%2Fproject%2Fproj01');

  const missing = resolveKeyItemLink({ deepLinkUrl: null });
  assert.equal(missing.disabled, true);
  assert.equal(missing.href, null);
  assert.ok(missing.disabledReason);

  const unsafe = resolveKeyItemLink({ deepLinkUrl: 'javascript:alert(1)' });
  assert.equal(unsafe.disabled, true);
  assert.equal(unsafe.href, null);
});

test('Stage 3: ShipKeyItemsTab, OnboardPanel, and RadialActionMenu tabs SSR & aria-label compliance', () => {
  const registry = getPreviewHubRegistry();
  const ships = mapProjectsToHarborShips(getPreviewDemoProjects(FIXED_NOW_MS), FIXED_NOW_MS);
  const people = mapEmployeesToHarborPeople(
    getPreviewDemoEmployees(),
    getPreviewDemoPresence(FIXED_NOW_MS),
    'user01',
    FIXED_NOW_MS,
  );

  // 1) ShipKeyItemsTab standalone SSR
  const keyItemsHtml = renderToStaticMarkup(
    React.createElement(ShipKeyItemsTab, {
      projectId: 'proj01',
      runtimeEnv: 'preview',
      registry,
      onPreviewLinkBlocked: () => {},
    }),
  );
  assert.match(keyItemsHtml, /data-testid="key-items-search-input"/);
  assert.match(keyItemsHtml, /data-testid="key-items-filter-all"/);
  assert.match(keyItemsHtml, /data-testid="key-items-filter-drawing"/);
  assert.match(keyItemsHtml, /data-testid="key-items-filter-cable"/);
  assert.match(keyItemsHtml, /data-testid="key-items-filter-urgent"/);
  assertEveryButtonHasAriaLabel(keyItemsHtml, 'ShipKeyItemsTab');

  // 2) OnboardPanel renders [개요] & [핵심 항목] tabs + existing overview intact
  const onboardHtml = renderToStaticMarkup(
    React.createElement(OnboardPanel, {
      ship: ships[0],
      phase: 'onboard',
      runtimeEnv: 'preview',
      hubRegistry: registry,
      onPreviewLinkBlocked: () => {},
      onDisembark: () => {},
    }),
  );
  assert.match(onboardHtml, /data-testid="onboard-tab-overview"/);
  assert.match(onboardHtml, /data-testid="onboard-tab-key-items"/);
  assert.match(onboardHtml, /SEDMS 에서 열기/);
  assertEveryButtonHasAriaLabel(onboardHtml, 'OnboardPanel');

  // 3) RadialActionMenu renders tabs ONLY for business ships, NEVER decorative ships or people
  const businessPopupHtml = renderToStaticMarkup(
    React.createElement(RadialActionMenu, {
      target: { kind: 'ship', ship: ships[0], anchor: { x: 640, y: 400 } },
      runtimeEnv: 'preview',
      hubRegistry: registry,
      onBoardShip: () => {},
      onRenameShip: () => ({ ok: true }),
      onRotateShipStep: () => {},
      onPreviewLinkBlocked: () => {},
      onClose: () => {},
    }),
  );
  assert.match(businessPopupHtml, /data-testid="radial-tab-overview"/);
  assert.match(businessPopupHtml, /data-testid="radial-tab-key-items"/);
  assertEveryButtonHasAriaLabel(businessPopupHtml, 'RadialActionMenu(ship)');

  const decoPopupHtml = renderToStaticMarkup(
    React.createElement(RadialActionMenu, {
      target: {
        kind: 'decorative-ship',
        ship: {
          id: 'hero-seastar',
          defaultName: '씨스타호',
          subtitle: '본항 마스코트 선박',
          x: 0,
          z: 0,
          defaultYawDeg: 90,
          halfLength: 16,
          halfBeam: 4.5,
        },
        anchor: { x: 640, y: 400 },
      },
      runtimeEnv: 'preview',
      hubRegistry: registry,
      onPreviewLinkBlocked: () => {},
      onClose: () => {},
    }),
  );
  assert.doesNotMatch(decoPopupHtml, /data-testid="radial-tab-key-items"/);
  assertEveryButtonHasAriaLabel(decoPopupHtml, 'RadialActionMenu(decorative-ship)');

  const personPopupHtml = renderToStaticMarkup(
    React.createElement(RadialActionMenu, {
      target: { kind: 'person', person: people[0], anchor: { x: 640, y: 400 } },
      runtimeEnv: 'preview',
      hubRegistry: registry,
      onPreviewLinkBlocked: () => {},
      onClose: () => {},
    }),
  );
  assert.doesNotMatch(personPopupHtml, /data-testid="radial-tab-key-items"/);
  assertEveryButtonHasAriaLabel(personPopupHtml, 'RadialActionMenu(person)');
});
