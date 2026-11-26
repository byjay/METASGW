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

function createProps(runtimeEnv: 'sgw' | 'preview'): HudTopBarProps {
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
    onToggleViewMode: () => {},
    onToggleLowSpec: () => {},
    onToggleTheme: () => {},
    onCycleCamera: () => {},
    onZoom: () => {},
    onLogout: () => {},
    onPreviewLinkBlocked: () => {},
  };
}

test('HudTopBar displays the preview demo badge in preview mode', () => {
  const html = renderToStaticMarkup(React.createElement(HudTopBar, createProps('preview')));
  assert.ok(
    html.includes(PREVIEW_DEMO_BANNER_TEXT),
    `Expected preview badge "${PREVIEW_DEMO_BANNER_TEXT}" to be rendered in preview mode`,
  );
  assert.ok(html.includes('data-testid="preview-demo-badge"'));
});

test('HudTopBar never displays the preview demo badge in sgw mode', () => {
  const html = renderToStaticMarkup(React.createElement(HudTopBar, createProps('sgw')));
  assert.ok(
    !html.includes(PREVIEW_DEMO_BANNER_TEXT),
    `Preview badge "${PREVIEW_DEMO_BANNER_TEXT}" must NOT appear in sgw mode`,
  );
  assert.ok(!html.includes('data-testid="preview-demo-badge"'));
});
