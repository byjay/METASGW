import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { contrastRatio, meetsWcagAA, UI_CONTRAST_PAIRS } from './a11yContrast';
import { AccessibleListView } from './components/AccessibleListView';
import { BottomControlDock } from './components/BottomControlDock';
import { HarborMiniMap } from './components/HarborMiniMap';
import { AuthGateOverlay, PersonActionModal, ShipBriefingModal } from './components/HarborOverlays';
import { HudTopBar } from './components/HudTopBar';
import { OnboardPanel } from './components/OnboardPanel';
import { PeopleFinderDrawer } from './components/PeopleFinderDrawer';
import { RadialActionMenu } from './components/RadialActionMenu';
import { mapEmployeesToHarborPeople, mapProjectsToHarborShips } from './mapping';
import {
  getPreviewDemoEmployees,
  getPreviewDemoPresence,
  getPreviewDemoProjects,
  getPreviewDemoUser,
} from './previewFixtures';

function assertEveryButtonHasAriaLabel(html: string, componentName: string): void {
  const buttons = html.match(/<button\b[^>]*>/g) ?? [];
  assert.ok(buttons.length > 0, `${componentName} should render at least one <button>`);
  for (const tag of buttons) {
    assert.ok(
      /\baria-label="[^"]+"/.test(tag),
      `${componentName} rendered a <button> without aria-label: ${tag}`,
    );
  }
}

describe('Accessibility: WCAG 2.1 AA contrast, aria-labels, keyboard 2D navigation & reduced motion', () => {
  it('satisfies WCAG 2.1 AA >= 4.5:1 contrast ratio on all active UI color token pairs', () => {
    for (const pair of UI_CONTRAST_PAIRS) {
      const ratio = contrastRatio(pair.foregroundHex, pair.backgroundHex);
      assert.ok(
        meetsWcagAA(pair.foregroundHex, pair.backgroundHex, pair.minRatio),
        `${pair.name} contrast ${ratio.toFixed(2)}:1 is below ${pair.minRatio}:1`,
      );
    }
    // Sanity check: old sky-600 (#0284c7) with white was < 4.5:1 while upgraded sky-700 (#0369a1) passes
    assert.equal(meetsWcagAA('#ffffff', '#0284c7', 4.5), false);
    assert.equal(meetsWcagAA('#ffffff', '#0369a1', 4.5), true);
  });

  it('renders explicit aria-label on every button across HUD, Dock, Quick Radar, RadialMenu, Drawer, Minimap, OnboardPanel, and Modals', () => {
    const now = 1_700_000_000_000;
    const user = getPreviewDemoUser();
    const ships = mapProjectsToHarborShips(getPreviewDemoProjects(now), now);
    const people = mapEmployeesToHarborPeople(
      getPreviewDemoEmployees(),
      getPreviewDemoPresence(now),
      user.sub,
      now,
    );
    const noop = () => {};

    const hudHtmlProd = renderToStaticMarkup(
      React.createElement(HudTopBar, {
        user,
        runtimeEnv: 'preview',
        viewMode: '3d',
        webglSupported: true,
        lowSpecMode: false,
        darkTheme: false,
        cameraPreset: 'harbor',
        onlineCount: 4,
        projectCount: ships.length,
        syncDisconnected: true,
        lastSyncedAtMs: now - 120_000,
        nowMs: now,
        showDebugMetrics: false,
        renderMetrics: {
          drawCalls: 92,
          triangles: 48200,
          geometries: 54,
          textures: 8,
          fps: 60,
          lowSpec: false,
        },
        onRetrySync: noop,
        onToggleViewMode: noop,
        onToggleLowSpec: noop,
        onToggleTheme: noop,
        onCycleCamera: noop,
        onZoom: noop,
        onLogout: noop,
        onPreviewLinkBlocked: noop,
      }),
    );
    assertEveryButtonHasAriaLabel(hudHtmlProd, 'HudTopBar');
    assert.ok(hudHtmlProd.includes('3D 맵'), 'HudTopBar must show 3D 맵 toggle');
    assert.ok(hudHtmlProd.includes('빠른 레이더'), 'HudTopBar must show 빠른 레이더 toggle');
    assert.equal(
      hudHtmlProd.includes('data-testid="hud-debug-metrics"'),
      false,
      'HUD debug metrics must stay hidden when showDebugMetrics is false',
    );

    const hudHtmlDev = renderToStaticMarkup(
      React.createElement(HudTopBar, {
        user,
        runtimeEnv: 'preview',
        viewMode: '3d',
        webglSupported: true,
        lowSpecMode: false,
        darkTheme: false,
        cameraPreset: 'harbor',
        onlineCount: 4,
        projectCount: ships.length,
        syncDisconnected: false,
        lastSyncedAtMs: now,
        nowMs: now,
        showDebugMetrics: true,
        renderMetrics: {
          drawCalls: 92,
          triangles: 48200,
          geometries: 54,
          textures: 8,
          fps: 60,
          lowSpec: false,
        },
        onRetrySync: noop,
        onToggleViewMode: noop,
        onToggleLowSpec: noop,
        onToggleTheme: noop,
        onCycleCamera: noop,
        onZoom: noop,
        onLogout: noop,
        onPreviewLinkBlocked: noop,
      }),
    );
    assert.ok(
      hudHtmlDev.includes('data-testid="hud-debug-metrics"'),
      'HUD debug metrics must render when showDebugMetrics is true',
    );
    assert.ok(hudHtmlDev.includes('DC 92'));

    const dockHtml = renderToStaticMarkup(
      React.createElement(BottomControlDock, {
        ships,
        projectsState: 'ready',
        projectsMessage: '',
        onlineCount: 4,
        totalPeopleCount: people.length,
        peopleDrawerOpen: false,
        minimapOpen: true,
        onSelectShip: noop,
        onRefreshProjects: noop,
        onTogglePeopleDrawer: noop,
        onToggleMinimap: noop,
        onSwitchTo2D: noop,
      }),
    );
    assertEveryButtonHasAriaLabel(dockHtml, 'BottomControlDock');

    const listHtml = renderToStaticMarkup(
      React.createElement(AccessibleListView, {
        user,
        runtimeEnv: 'preview',
        ships,
        projectsState: 'ready',
        projectsMessage: '',
        people,
        webglSupported: true,
        onRefreshProjects: noop,
        onSelectShip: noop,
        onSelectPerson: noop,
        onPreviewLinkBlocked: noop,
      }),
    );
    assertEveryButtonHasAriaLabel(listHtml, 'AccessibleListView');
    assert.ok(listHtml.includes('id="main-content"'), '2D view must expose #main-content landmark');
    assert.ok(listHtml.includes('본문으로 건너뛰기'), '2D view must provide keyboard skip link');
    assert.ok(listHtml.includes('data-kbd-item="true"'), '2D view must expose roving keyboard items');
    assert.ok(listHtml.includes('data-testid="radar-tap-talk"'), 'Quick Radar must provide 1-tap 대화');
    assert.ok(listHtml.includes('data-testid="radar-tap-nas"'), 'Quick Radar must provide 1-tap 파일');
    assert.ok(listHtml.includes('data-testid="radar-tap-sedms"'), 'Quick Radar must provide 1-tap 도면');
    assert.ok(listHtml.includes('data-testid="radar-tap-mail"'), 'Quick Radar must provide 1-tap 메일');

    const radialShipHtml = renderToStaticMarkup(
      React.createElement(RadialActionMenu, {
        target: { kind: 'ship', ship: ships[0], anchor: { x: 640, y: 400 } },
        runtimeEnv: 'preview',
        viewportSize: { width: 1280, height: 800 },
        onBoardShip: noop,
        onPreviewLinkBlocked: noop,
        onClose: noop,
      }),
    );
    assertEveryButtonHasAriaLabel(radialShipHtml, 'RadialActionMenu(ship)');

    const radialPersonHtml = renderToStaticMarkup(
      React.createElement(RadialActionMenu, {
        target: { kind: 'person', person: people[1], anchor: { x: 300, y: 300 } },
        runtimeEnv: 'preview',
        viewportSize: { width: 375, height: 812 },
        onPreviewLinkBlocked: noop,
        onClose: noop,
      }),
    );
    assertEveryButtonHasAriaLabel(radialPersonHtml, 'RadialActionMenu(person)');

    const drawerHtml = renderToStaticMarkup(
      React.createElement(PeopleFinderDrawer, {
        open: true,
        runtimeEnv: 'preview',
        people,
        onClose: noop,
        onFocusPerson: noop,
        onSelectPerson: noop,
        onPreviewLinkBlocked: noop,
      }),
    );
    assertEveryButtonHasAriaLabel(drawerHtml, 'PeopleFinderDrawer');

    const minimapHtml = renderToStaticMarkup(
      React.createElement(HarborMiniMap, {
        open: true,
        ships,
        people,
        playerPose: { x: 0, z: -8, heading: 0 },
        activeShipId: ships[0].id,
        onSelectShip: noop,
        onWalkToQuay: noop,
        onClose: noop,
      }),
    );
    assertEveryButtonHasAriaLabel(minimapHtml, 'HarborMiniMap');

    const onboardHtml = renderToStaticMarkup(
      React.createElement(OnboardPanel, {
        ship: ships[0],
        phase: 'onboard',
        runtimeEnv: 'preview',
        onPreviewLinkBlocked: noop,
        onDisembark: noop,
      }),
    );
    assertEveryButtonHasAriaLabel(onboardHtml, 'OnboardPanel');
    assert.ok(onboardHtml.includes('role="dialog"') && onboardHtml.includes('aria-modal="true"'));
    assert.ok(onboardHtml.includes('SEDMS 에서 열기'));
    assert.ok(onboardHtml.includes('팀 채팅'));
    assert.ok(onboardHtml.includes('NAS 폴더'));
    assert.ok(onboardHtml.includes('하선'));

    const shipModalHtml = renderToStaticMarkup(
      React.createElement(ShipBriefingModal, {
        ship: ships[0],
        runtimeEnv: 'preview',
        onPreviewLinkBlocked: noop,
        onClose: noop,
      }),
    );
    assertEveryButtonHasAriaLabel(shipModalHtml, 'ShipBriefingModal');
    assert.ok(shipModalHtml.includes('role="dialog"') && shipModalHtml.includes('aria-modal="true"'));

    const personModalHtml = renderToStaticMarkup(
      React.createElement(PersonActionModal, {
        person: people[1],
        runtimeEnv: 'preview',
        canFocus3D: true,
        onFocus3D: noop,
        onPreviewLinkBlocked: noop,
        onClose: noop,
      }),
    );
    assertEveryButtonHasAriaLabel(personModalHtml, 'PersonActionModal');
    assert.ok(personModalHtml.includes('role="dialog"') && personModalHtml.includes('aria-modal="true"'));

    const lostListHtml = renderToStaticMarkup(
      React.createElement(AccessibleListView, {
        user,
        runtimeEnv: 'sgw',
        ships: [],
        projectsState: 'error',
        projectsMessage: '',
        projectsErrorCode: 'rate_limited',
        people,
        webglSupported: true,
        webglContextLost: true,
        onRetry3D: noop,
        onRefreshProjects: noop,
        onSelectShip: noop,
        onSelectPerson: noop,
        onPreviewLinkBlocked: noop,
      }),
    );
    assertEveryButtonHasAriaLabel(lostListHtml, 'AccessibleListView(webglContextLost+error)');

    const authOverlayHtml = renderToStaticMarkup(
      React.createElement(AuthGateOverlay, {
        status: 'error',
        errorCode: 'server_error',
        message: '',
        onRetry: noop,
      }),
    );
    assertEveryButtonHasAriaLabel(authOverlayHtml, 'AuthGateOverlay(error)');
  });

  it('defines prefers-reduced-motion media query in global CSS', () => {
    const css = readFileSync(resolve(process.cwd(), 'src', 'index.css'), 'utf8');
    assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'));
  });
});
