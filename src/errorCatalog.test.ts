import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AccessibleListView } from './components/AccessibleListView';
import { AuthGateOverlay } from './components/HarborOverlays';
import {
  ERROR_CATALOG,
  getErrorDescriptor,
  mapHttpStatusToErrorCode,
  type AppErrorCode,
} from './errorCatalog';
import { getPreviewDemoUser } from './previewFixtures';

describe('errorCatalog: single source of truth for 401/403/404/429/5xx/network error guidance', () => {
  it('maps HTTP statuses and network errors to exact catalog descriptors and next-step actions', () => {
    assert.equal(mapHttpStatusToErrorCode(401), 'unauthorized');
    assert.equal(mapHttpStatusToErrorCode(403), 'forbidden');
    assert.equal(mapHttpStatusToErrorCode(404), 'not_found');
    assert.equal(mapHttpStatusToErrorCode(429), 'rate_limited');
    assert.equal(mapHttpStatusToErrorCode(500), 'server_error');
    assert.equal(mapHttpStatusToErrorCode(502), 'server_error');
    assert.equal(mapHttpStatusToErrorCode(503), 'server_error');
    assert.equal(mapHttpStatusToErrorCode(0), 'network_offline');

    assert.equal(getErrorDescriptor(401).nextActionLabel, '로그인');
    assert.equal(getErrorDescriptor(401).actionKind, 'login');

    assert.equal(getErrorDescriptor(403).nextActionLabel, '권한 요청');
    assert.equal(getErrorDescriptor(403).actionKind, 'request_access');

    assert.equal(getErrorDescriptor(404).nextActionLabel, '권한 요청');
    assert.equal(getErrorDescriptor(404).actionKind, 'request_access');

    assert.equal(getErrorDescriptor(429).nextActionLabel, '잠시 후 재시도');
    assert.equal(getErrorDescriptor(429).actionKind, 'retry');

    assert.equal(getErrorDescriptor(503).nextActionLabel, '잠시 후 재시도');
    assert.equal(getErrorDescriptor(503).actionKind, 'retry');

    assert.equal(getErrorDescriptor('network_offline').nextActionLabel, '잠시 후 재시도');
    assert.equal(getErrorDescriptor('network_offline').actionKind, 'retry');

    const allCodes: AppErrorCode[] = [
      'unauthorized',
      'forbidden',
      'not_found',
      'rate_limited',
      'server_error',
      'network_offline',
    ];
    for (const code of allCodes) {
      const desc = ERROR_CATALOG[code];
      assert.ok(desc.title.length > 0);
      assert.ok(desc.message.length > 0);
      assert.ok(desc.nextActionLabel.length > 0);
    }
  });

  it('renders unified errorCatalog title, message, and next action in AuthGateOverlay across error codes', () => {
    const cases: Array<{
      status: 'unauthenticated' | 'forbidden' | 'not_found' | 'error';
      errorCode: AppErrorCode;
    }> = [
      { status: 'unauthenticated', errorCode: 'unauthorized' },
      { status: 'forbidden', errorCode: 'forbidden' },
      { status: 'not_found', errorCode: 'not_found' },
      { status: 'error', errorCode: 'rate_limited' },
      { status: 'error', errorCode: 'server_error' },
      { status: 'error', errorCode: 'network_offline' },
    ];

    for (const tc of cases) {
      const desc = getErrorDescriptor(tc.errorCode);
      const html = renderToStaticMarkup(
        React.createElement(AuthGateOverlay, {
          status: tc.status,
          errorCode: tc.errorCode,
          message: desc.message,
          onRetry: () => {},
        }),
      );
      assert.ok(html.includes(desc.title), `AuthGateOverlay(${tc.errorCode}) must include title`);
      assert.ok(html.includes(desc.message), `AuthGateOverlay(${tc.errorCode}) must include message`);
      assert.ok(
        html.includes(desc.nextActionLabel),
        `AuthGateOverlay(${tc.errorCode}) must include next action "${desc.nextActionLabel}"`,
      );
    }
  });

  it('renders unified errorCatalog copy in AccessibleListView for pending(404), forbidden(403), rate_limited(429), and network errors', () => {
    const user = getPreviewDemoUser();
    const noop = () => {};

    const cases: Array<{
      projectsState: 'pending' | 'forbidden' | 'error';
      projectsErrorCode: AppErrorCode;
    }> = [
      { projectsState: 'pending', projectsErrorCode: 'not_found' },
      { projectsState: 'forbidden', projectsErrorCode: 'forbidden' },
      { projectsState: 'error', projectsErrorCode: 'rate_limited' },
      { projectsState: 'error', projectsErrorCode: 'server_error' },
      { projectsState: 'error', projectsErrorCode: 'network_offline' },
    ];

    for (const tc of cases) {
      const desc = getErrorDescriptor(tc.projectsErrorCode);
      const html = renderToStaticMarkup(
        React.createElement(AccessibleListView, {
          user,
          runtimeEnv: 'sgw',
          ships: [],
          projectsState: tc.projectsState,
          projectsMessage: desc.message,
          projectsErrorCode: tc.projectsErrorCode,
          people: [],
          webglSupported: true,
          onRefreshProjects: noop,
          onSelectShip: noop,
          onSelectPerson: noop,
          onPreviewLinkBlocked: noop,
        }),
      );
      assert.ok(
        html.includes(desc.title),
        `AccessibleListView(${tc.projectsErrorCode}) must include title "${desc.title}"`,
      );
      assert.ok(
        html.includes(desc.message),
        `AccessibleListView(${tc.projectsErrorCode}) must include message`,
      );
      assert.ok(
        html.includes(desc.nextActionLabel),
        `AccessibleListView(${tc.projectsErrorCode}) must include nextActionLabel "${desc.nextActionLabel}"`,
      );
    }
  });

  it('verifies every adapter and error-rendering UI screen imports errorCatalog as the single source', () => {
    const requiredConsumers = [
      'src/sgwAdapter.ts',
      'src/components/HarborOverlays.tsx',
      'src/components/AccessibleListView.tsx',
      'src/components/BottomControlDock.tsx',
      'src/components/HudTopBar.tsx',
    ];
    for (const relPath of requiredConsumers) {
      const content = readFileSync(resolve(process.cwd(), relPath), 'utf8');
      assert.ok(
        content.includes('errorCatalog'),
        `${relPath} must source error copy & actions from errorCatalog.ts`,
      );
    }
  });
});
