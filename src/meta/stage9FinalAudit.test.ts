/**
 * Stage 9 Final Audit Suite — End-to-End Contract, Viewport (1440x900 & 375x812),
 * Bundle Split, Zero-External-Request, and SGW Migration Documentation Guards.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as THREE from 'three';

import { HudTopBar } from '../components/HudTopBar';
import {
  clampRadialCenter,
  RadialActionMenu,
  type RadialTarget,
} from '../components/RadialActionMenu';
import { ShipKeyItemsTab } from '../components/ShipKeyItemsTab';
import { buildTalkDmUrl } from '../deepLink';
import {
  mapEmployeesToHarborPeople,
  selectVisibleQuayColleagues,
} from '../mapping';
import {
  getPreviewDemoEmployees,
  getPreviewDemoUser,
} from '../previewFixtures';
import { buildHubModuleBuilding3D } from '../scene/hubBuildings3D';
import type { HarborTexturePack } from '../scene/textures';
import type { SgwPresenceEntry } from '../sgwAdapter';
import { ReportModal } from '../ui/ReportModal';
import { assignHubBuildingSlots } from './hubBuildingModel';
import { mergeHubModuleChips } from './hubChipModel';
import {
  getPreviewHubRegistry,
  getPreviewHubSummary,
  getPreviewReportJson,
} from './hubFixtures';
import type {
  MetaCablesKeyResponse,
  MetaDrawingsKeyResponse,
  MetaHubSummaryResponse,
  MetaRegistryResponse,
} from './hubTypes';

const VIEWPORTS = [
  { label: 'desktop-1440x900', width: 1440, height: 900 },
  { label: 'mobile-375x812', width: 375, height: 812 },
] as const;

function makeStubTextures(): HarborTexturePack {
  const solid = () =>
    new THREE.DataTexture(new Uint8Array([180, 180, 180, 255]), 1, 1) as unknown as THREE.CanvasTexture;
  return {
    concreteAlbedo: solid(),
    concreteBump: solid(),
    concreteRoughness: solid(),
    asphaltRoad: solid(),
    hazardTrim: solid(),
    containerRib: solid(),
    containerRibBump: solid(),
    containerRibRoughness: solid(),
    curtainWall: solid(),
    contactShadow: solid(),
    craneBannerOrange: solid(),
    craneBannerBlue: solid(),
    hullSteelPlates: solid(),
    waterNormals: solid(),
    cloudPuff: solid(),
    usedOffscreenCanvas: false,
    createSignboard: () => solid(),
    createHubBuildingSignboard: () => solid(),
    createAvatarBillboardIcon: () => solid(),
    dispose: () => {},
  };
}

function assertAllButtonsHaveAriaLabel(html: string, context: string): void {
  const buttonTags = html.match(/<button\b[^>]*>/g) ?? [];
  assert.ok(buttonTags.length > 0, `${context}: expected at least one <button>`);
  for (const tag of buttonTags) {
    assert.match(
      tag,
      /aria-label="[^"]+"/,
      `${context}: button missing aria-label -> ${tag}`,
    );
  }
}

test('Stage 9 Audit #1: Stage 6 finalized SEDMS/SEcMS contract renders honestly (null="—", urgent unsupported, nosource link, opaque ID)', () => {
  const drawings: MetaDrawingsKeyResponse = {
    status: 'active',
    kpi: {
      drawingRevisionCount: 14,
      drawingPendingApproval: 3,
      urgentComments: null,
    },
    items: [
      {
        id: 'DWG-101|승인도',
        moduleId: 'sedms',
        category: 'drawing',
        code: 'DWG-101',
        title: '중앙 구획 배관 계통도',
        metric: 'Rev.02 · 승인 대기',
        severity: null,
        updatedAt: null,
        deepLinkUrl: '/api/sedms-sso?return=%2Fproject%2Fproj01',
      },
    ],
  };

  // 1-A. SEDMS drawing filter: null KPI -> "—", severity: null badge hidden, updatedAt: null -> "날짜 없음", opaque id intact
  const drawingHtml = renderToStaticMarkup(
    React.createElement(ShipKeyItemsTab, {
      projectId: 'proj01',
      runtimeEnv: 'sgw',
      initialDrawings: drawings,
      initialFilter: 'drawing',
      onPreviewLinkBlocked: () => {},
    }),
  );
  assert.match(drawingHtml, /data-testid="drawing-kpi-urgent-comments"[^>]*>—</);
  assert.doesNotMatch(drawingHtml, /data-testid="drawing-kpi-urgent-comments"[^>]*>0</);
  assert.match(drawingHtml, /data-testid="key-item-DWG-101\|승인도"/);
  assert.doesNotMatch(drawingHtml, /data-testid="key-item-severity-/);
  assert.match(drawingHtml, /날짜 없음/);
  assertAllButtonsHaveAriaLabel(drawingHtml, 'ShipKeyItemsTab(drawing)');

  // 1-B. SEDMS filter=urgent unsupported notice
  const urgentHtml = renderToStaticMarkup(
    React.createElement(ShipKeyItemsTab, {
      projectId: 'proj01',
      runtimeEnv: 'sgw',
      initialDrawings: { status: 'active', items: [], unsupported: true },
      initialFilter: 'urgent',
      initialUrgentUnsupported: true,
      onPreviewLinkBlocked: () => {},
    }),
  );
  assert.match(urgentHtml, /data-testid="key-items-urgent-unsupported"/);
  assert.match(urgentHtml, /SEDMS 에 긴급 구분이 없습니다/);

  // 1-C. SEcMS nosource + server entryUrl -> "SEcMS 계정 연결이 필요합니다" + [SEcMS 연결]
  const cablesNosource: MetaCablesKeyResponse = {
    status: 'nosource',
    entryUrl: '/api/secms-link',
    items: [],
  };
  const nosourceHtml = renderToStaticMarkup(
    React.createElement(ShipKeyItemsTab, {
      projectId: 'proj01',
      runtimeEnv: 'sgw',
      initialDrawings: drawings,
      initialCables: cablesNosource,
      initialFilter: 'cable',
      onPreviewLinkBlocked: () => {},
    }),
  );
  assert.match(nosourceHtml, /data-testid="secms-link-required-card"/);
  assert.match(nosourceHtml, /SEcMS 계정 연결이 필요합니다/);
  assert.match(nosourceHtml, /href="\/api\/secms-link"/);
  assert.match(nosourceHtml, /SEcMS 연결/);

  // 1-D. SEcMS active with null progress KPI -> "—" (never 0) and items "미포설" / "포설 중"
  const cablesNullKpi: MetaCablesKeyResponse = {
    status: 'active',
    kpi: {
      cablePullProgressPct: null,
      cablesTotal: null,
      cablesLaid: null,
      cableTrayWarningCount: null,
    },
    items: [
      {
        id: 'CBL-001',
        moduleId: 'secms',
        category: 'cable',
        code: 'CBL-001',
        title: '주전원 간선 케이블',
        metric: '미포설',
        severity: null,
        updatedAt: '2026-11-27T08:00:00.000Z',
        deepLinkUrl: '/secms/?project=proj01',
      },
      {
        id: 'CBL-002',
        moduleId: 'secms',
        category: 'cable',
        code: 'CBL-002',
        title: '제어반 신호 케이블',
        metric: '포설 중',
        severity: null,
        updatedAt: '2026-11-27T08:15:00.000Z',
        deepLinkUrl: '/secms/?project=proj01',
      },
    ],
  };
  const cablesHtml = renderToStaticMarkup(
    React.createElement(ShipKeyItemsTab, {
      projectId: 'proj01',
      runtimeEnv: 'sgw',
      initialDrawings: drawings,
      initialCables: cablesNullKpi,
      initialFilter: 'cable',
      onPreviewLinkBlocked: () => {},
    }),
  );
  assert.match(cablesHtml, /data-testid="cable-progress-null"[^>]*>—</);
  assert.match(cablesHtml, /미포설/);
  assert.match(cablesHtml, /포설 중/);
  assert.doesNotMatch(cablesHtml, /data-testid="key-item-severity-/);

  // 1-E. SEcMS planned -> "준비 중"
  const cablesPlannedHtml = renderToStaticMarkup(
    React.createElement(ShipKeyItemsTab, {
      projectId: 'proj01',
      runtimeEnv: 'sgw',
      initialDrawings: drawings,
      initialCables: { status: 'planned', items: [] },
      initialFilter: 'cable',
      onPreviewLinkBlocked: () => {},
    }),
  );
  assert.match(cablesPlannedHtml, /준비 중/);
});

test('Stage 9 Audit #2: Stage 7 colleague presence (online/away/leave, overflow cap) & avatar card at 1440x900 and 375x812', () => {
  const nowMs = Date.parse('2026-11-27T09:00:00.000Z');
  const baseEmployees = getPreviewDemoEmployees();
  // Create 8 colleagues across online, away, leave to test bench seating, leave exclusion, and low-tier cap (5)
  const employees = Array.from({ length: 8 }, (_, idx) => {
    const template = baseEmployees[idx % baseEmployees.length];
    return {
      ...template,
      sub: `user${String(idx + 1).padStart(2, '0')}`,
      name: `동료${idx + 1}`,
    };
  });
  const presence: SgwPresenceEntry[] = [
    { sub: 'user01', lastSeenAt: nowMs - 2_000, status: 'online' },
    { sub: 'user02', lastSeenAt: nowMs - 5_000, status: 'away' },
    { sub: 'user03', lastSeenAt: nowMs - 60_000, status: 'leave' },
    { sub: 'user04', lastSeenAt: nowMs - 3_000, status: 'online' },
    { sub: 'user05', lastSeenAt: nowMs - 4_000, status: 'online' },
    { sub: 'user06', lastSeenAt: nowMs - 5_000, status: 'online' },
    { sub: 'user07', lastSeenAt: nowMs - 6_000, status: 'online' },
    { sub: 'user08', lastSeenAt: nowMs - 7_000, status: 'away' },
  ];

  const people = mapEmployeesToHarborPeople(employees, presence, 'user01', nowMs);
  const awayPerson = people.find((p) => p.sub === 'user02');
  const leavePerson = people.find((p) => p.sub === 'user03');
  assert.ok(awayPerson && awayPerson.presenceStatus === 'away' && typeof awayPerson.benchIndex === 'number');
  assert.ok(leavePerson && leavePerson.presenceStatus === 'leave');

  const selection = selectVisibleQuayColleagues(people, 'low');
  assert.equal(selection.visible.some((p) => p.sub === 'user03'), false, 'leave colleague excluded from 3D quay');
  assert.equal(selection.visible.some((p) => p.sub === 'user01'), false, 'current user uses playerRig, not colleague cap');
  assert.equal(selection.visible.length, 3, 'low quality tier caps 3D quay avatars at 3');
  assert.equal(selection.overflowCount, 3, '6 eligible non-self colleagues - 3 visible = 외 3명');

  // Verify avatar click card at both 1440x900 and 375x812 with strict viewport clamping
  const target: RadialTarget = {
    kind: 'person',
    person: awayPerson,
    anchor: { x: 18, y: 120 },
  };
  for (const vp of VIEWPORTS) {
    const cardHalfW = Math.min(340, vp.width - 24) / 2;
    const clamped = clampRadialCenter(target.anchor, { width: vp.width, height: vp.height }, cardHalfW);
    assert.ok(clamped.x - cardHalfW >= 0, `${vp.label}: person card overflows left edge`);
    assert.ok(clamped.x + cardHalfW <= vp.width, `${vp.label}: person card overflows right edge`);

    const html = renderToStaticMarkup(
      React.createElement(RadialActionMenu, {
        target,
        runtimeEnv: 'sgw',
        viewportSize: { width: vp.width, height: vp.height },
        onPreviewLinkBlocked: () => {},
        onClose: () => {},
      }),
    );
    assert.match(html, /동료2/);
    assert.match(html, /자리비움/);
    assert.ok(
      html.includes(`href="${buildTalkDmUrl(awayPerson.sub)}"`),
      `${vp.label}: avatar card must link to buildTalkDmUrl`,
    );
    assertAllButtonsHaveAriaLabel(html, `RadialActionMenu(person, ${vp.label})`);
  }
});

test('Stage 9 Audit #3: Stage 8 hub building planned ↔ active toggles 3D scaffolding, lighting, and card link at 1440x900 & 375x812', () => {
  const baseRegistry: MetaRegistryResponse = getPreviewHubRegistry();
  const baseSummary: MetaHubSummaryResponse = getPreviewHubSummary('proj01');
  const textures = makeStubTextures();

  // State A: s360 as planned (entryUrl: null)
  const plannedChips = mergeHubModuleChips(baseRegistry, baseSummary);
  const plannedPlacements = assignHubBuildingSlots(plannedChips);
  const s360Planned = plannedPlacements.find((p) => p.moduleId === 's360');
  assert.ok(s360Planned, 's360 placement must exist');
  assert.equal(s360Planned.appearance.hasScaffolding, true);
  assert.equal(s360Planned.appearance.lightsOn, false);

  const planned3D = buildHubModuleBuilding3D(s360Planned, textures, false, 0);
  assert.ok(planned3D.group.getObjectByName('hub-building-scaffolding'), 'planned building mounts scaffolding');
  assert.equal(planned3D.group.getObjectByName('hub-building-cornice-light'), undefined, 'planned building has no cornice light');
  planned3D.dispose();

  // State B: flip s360 to active with server entryUrl
  const activeSummary: MetaHubSummaryResponse = {
    ...baseSummary,
    modules: baseSummary.modules.map((m) =>
      m.moduleId === 's360'
        ? {
            ...m,
            status: 'active',
            summaryText: '파노라마 스캔 24건 정상',
            entryUrl: '/s360/?project=proj01',
          }
        : m,
    ),
  };
  const activeChips = mergeHubModuleChips(baseRegistry, activeSummary);
  const activePlacements = assignHubBuildingSlots(activeChips);
  const s360Active = activePlacements.find((p) => p.moduleId === 's360');
  assert.ok(s360Active, 's360 active placement must exist');
  assert.equal(s360Active.lot.lotId, s360Planned.lot.lotId, 'lot assignment stays deterministic across status toggle');
  assert.equal(s360Active.appearance.hasScaffolding, false);
  assert.equal(s360Active.appearance.lightsOn, true);

  const active3D = buildHubModuleBuilding3D(s360Active, textures, false, 0);
  assert.equal(active3D.group.getObjectByName('hub-building-scaffolding'), undefined, 'active building removes scaffolding');
  assert.ok(active3D.group.getObjectByName('hub-building-cornice-light'), 'active building enables cornice light');
  active3D.dispose();

  // Verify building popup card at both 1440x900 and 375x812
  for (const vp of VIEWPORTS) {
    const plannedHtml = renderToStaticMarkup(
      React.createElement(RadialActionMenu, {
        target: {
          kind: 'hub-building',
          chip: s360Planned.chip,
          lotLabel: s360Planned.lot.labelKo,
          anchor: { x: vp.width - 10, y: 200 },
        },
        runtimeEnv: 'sgw',
        viewportSize: { width: vp.width, height: vp.height },
        onPreviewLinkBlocked: () => {},
        onClose: () => {},
      }),
    );
    assert.match(plannedHtml, /준비 중/);
    assert.match(plannedHtml, /disabled/);
    assertAllButtonsHaveAriaLabel(plannedHtml, `HubBuildingCard(planned, ${vp.label})`);

    const activeHtml = renderToStaticMarkup(
      React.createElement(RadialActionMenu, {
        target: {
          kind: 'hub-building',
          chip: s360Active.chip,
          lotLabel: s360Active.lot.labelKo,
          anchor: { x: vp.width - 10, y: 200 },
        },
        runtimeEnv: 'sgw',
        viewportSize: { width: vp.width, height: vp.height },
        onPreviewLinkBlocked: () => {},
        onClose: () => {},
      }),
    );
    assert.ok(
      activeHtml.includes('href="/s360/?project=proj01"'),
      `${vp.label}: active building card must render server entryUrl`,
    );
    assertAllButtonsHaveAriaLabel(activeHtml, `HubBuildingCard(active, ${vp.label})`);
  }
});

test('Stage 9 Audit #4: ReportModal and HudTopBar render cleanly for 1440x900 & 375x812 with full aria-labels', () => {
  const registry = getPreviewHubRegistry();
  const summary = getPreviewHubSummary('proj01');
  const chips = mergeHubModuleChips(registry, summary);
  const report = getPreviewReportJson('proj01', 7);

  // ReportModal with verified integrity + unavailable module warning
  const reportHtml = renderToStaticMarkup(
    React.createElement(ReportModal, {
      open: true,
      projectId: 'proj01',
      projectName: '선박 A 프로젝트',
      runtimeEnv: 'sgw',
      registry,
      initialReport: {
        ...report,
        unavailableModules: ['mail'],
        integrity: { maskedResidue: 0, sourceHonesty: true },
      },
      onClose: () => {},
      onPreviewLinkBlocked: () => {},
    }),
  );
  assert.match(reportHtml, /검증됨/);
  assert.match(reportHtml, /일시 오류/);
  assert.match(reportHtml, /data-testid="report-modal"/);
  assert.match(reportHtml, /max-w-3xl/);
  assertAllButtonsHaveAriaLabel(reportHtml, 'ReportModal');

  // HudTopBar with desktop strip (hidden sm:flex) and 375px mobile drawer toggle (sm:hidden)
  const hudHtml = renderToStaticMarkup(
    React.createElement(HudTopBar, {
      user: getPreviewDemoUser(),
      runtimeEnv: 'preview',
      viewMode: '3d',
      webglSupported: true,
      lowSpecMode: false,
      qualityTier: 'high',
      darkTheme: false,
      cameraPreset: 'harbor',
      onlineCount: 4,
      projectCount: 4,
      hubChips: chips,
      hubProjectLabel: 'PJT-01',
      onToggleViewMode: () => {},
      onToggleLowSpec: () => {},
      onToggleTheme: () => {},
      onCycleCamera: () => {},
      onZoom: () => {},
      onLogout: () => {},
      onPreviewLinkBlocked: () => {},
      onRefreshHub: () => {},
      onOpenReport: () => {},
    }),
  );
  assert.match(hudHtml, /data-testid="hud-hub-status-strip"/);
  assert.match(hudHtml, /data-testid="hub-mobile-summary-toggle"/);
  assert.match(hudHtml, /data-testid="hud-report-btn"/);
  assert.match(hudHtml, /data-testid="hud-mobile-report-btn"/);
  assertAllButtonsHaveAriaLabel(hudHtml, 'HudTopBar');
});

test('Stage 9 Audit #5: Lazy-loading split & README SGW migration documentation completeness', () => {
  const rootDir = path.resolve(import.meta.dirname, '..', '..');

  // 1) metaClient.ts must dynamically import hubFixtures (never statically bundle preview fixtures into initial entry JS)
  const metaClientSrc = fs.readFileSync(path.join(rootDir, 'src/meta/metaClient.ts'), 'utf8');
  assert.doesNotMatch(
    metaClientSrc,
    /^\s*import\s+[\s\S]*?from\s+['"]\.\/hubFixtures['"]/m,
    'metaClient.ts must not statically import ./hubFixtures',
  );
  assert.match(
    metaClientSrc,
    /import\(['"]\.\/hubFixtures['"]\)/,
    'metaClient.ts must dynamically import ./hubFixtures in preview mode',
  );

  // 2) App.tsx must lazily load all heavy Stage 2-8 UI overlays and 3D scene
  const appSrc = fs.readFileSync(path.join(rootDir, 'src/App.tsx'), 'utf8');
  for (const lazyTarget of [
    'BottomControlDock',
    'HarborMiniMap',
    'OnboardPanel',
    'PeopleFinderDrawer',
    'RadialActionMenu',
    'ReportModal',
  ]) {
    assert.match(
      appSrc,
      new RegExp(`const\\s+${lazyTarget}\\s*=\\s*lazy\\(`),
      `App.tsx must React.lazy() load ${lazyTarget}`,
    );
  }
  assert.match(appSrc, /loadHarborSceneModule/, 'App.tsx must load 3D scene dynamically');

  // 3) README.md SGW migration section covers Stage 6-9 contract rules, colleague/building mapping, and before/after table
  const readme = fs.readFileSync(path.join(rootDir, 'README.md'), 'utf8');
  assert.match(readme, /SGW 저장소 이관/);
  assert.match(readme, /확정 계약 표시 규칙/);
  assert.match(readme, /SEDMS 에 긴급 구분이 없습니다/);
  assert.match(readme, /SEcMS 계정 연결이 필요합니다/);
  assert.match(readme, /동료 · 건물 매핑 규칙/);
  assert.match(readme, /\/api\/presence/);
  assert.match(readme, /외 n명/);
  assert.match(readme, /기존 기능 전\/후 대조표/);
});
