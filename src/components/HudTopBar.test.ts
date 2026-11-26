import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PREVIEW_DEMO_BANNER_TEXT } from '../runtimeEnv';
import type { SgwUser } from '../sgwAdapter';
import { HudTopBar, type HudTopBarProps } from './HudTopBar';

const SAMPLE_USER: SgwUser = {
  sub: 'user01',
  name: 'user01',
  dept: 'dept01',
  title: '매니저',
  role: 'member',
  isPartner: false,
};

function createProps(
  runtimeEnv: 'sgw' | 'preview',
  overrides: Partial<HudTopBarProps> = {},
): HudTopBarProps {
  return {
    user: SAMPLE_USER,
    runtimeEnv,
    viewMode: '3d',
    webglSupported: true,
    lowSpecMode: false,
    darkTheme: false,
    cameraPreset: 'harbor',
    onlineCount: 4,
    projectCount: 4,
    syncDisconnected: false,
    lastSyncedAtMs: null,
    nowMs: 1_700_000_000_000,
    onRetrySync: () => {},
    onToggleViewMode: () => {},
    onToggleLowSpec: () => {},
    onToggleTheme: () => {},
    onCycleCamera: () => {},
    onZoom: () => {},
    onLogout: () => {},
    onPreviewLinkBlocked: () => {},
    ...overrides,
  };
}

test('HudTopBar displays the preview demo badge and harbor KPI counts in preview mode', () => {
  const html = renderToStaticMarkup(React.createElement(HudTopBar, createProps('preview')));
  assert.ok(
    html.includes(PREVIEW_DEMO_BANNER_TEXT),
    `Expected preview badge "${PREVIEW_DEMO_BANNER_TEXT}" to be rendered in preview mode`,
  );
  assert.ok(html.includes('data-testid="preview-demo-badge"'));
  assert.ok(html.includes('내 프로젝트 4'));
  assert.ok(html.includes('접속 동료 4'));
  assert.ok(!html.includes('data-testid="connection-lost-badge"'));
});

test('HudTopBar never displays the preview demo badge in sgw mode', () => {
  const html = renderToStaticMarkup(React.createElement(HudTopBar, createProps('sgw')));
  assert.ok(
    !html.includes(PREVIEW_DEMO_BANNER_TEXT),
    `Preview badge "${PREVIEW_DEMO_BANNER_TEXT}" must NOT appear in sgw mode`,
  );
  assert.ok(!html.includes('data-testid="preview-demo-badge"'));
});

test('HudTopBar surfaces polling failures with "연결 끊김 — 마지막 갱신 n분 전" alert banner', () => {
  const now = 1_700_000_300_000;
  const html = renderToStaticMarkup(
    React.createElement(
      HudTopBar,
      createProps('sgw', {
        syncDisconnected: true,
        lastSyncedAtMs: now - 3 * 60_000 - 15_000,
        nowMs: now,
      }),
    ),
  );
  assert.ok(html.includes('data-testid="connection-lost-badge"'));
  assert.ok(html.includes('role="alert"'));
  assert.ok(
    html.includes('연결 끊김 — 마지막 갱신 3분 전'),
    `Expected disconnected banner text with elapsed minutes, got: ${html}`,
  );
});
