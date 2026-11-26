import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AccessibleListView } from './components/AccessibleListView';
import { HudTopBar } from './components/HudTopBar';
import { getPreviewDemoUser } from './previewFixtures';
import {
  createInitialWebGLViewState,
  transitionWebGLViewState,
  WEBGL_RETRY_BUTTON_LABEL,
} from './webglContextState';

describe('webglContextState: automatic 2D fallback on webglcontextlost and recovery on webglcontextrestored', () => {
  it('switches automatically to 2D on CONTEXT_LOST and restores 3D on CONTEXT_RESTORED', () => {
    const initial = createInitialWebGLViewState(true, '3d');
    assert.equal(initial.viewMode, '3d');
    assert.equal(initial.contextHealth, 'active');

    const lost = transitionWebGLViewState(initial, { type: 'CONTEXT_LOST' });
    assert.equal(lost.viewMode, '2d');
    assert.equal(lost.contextHealth, 'lost');
    assert.equal(lost.autoRestoreTo3D, true);

    const restored = transitionWebGLViewState(lost, { type: 'CONTEXT_RESTORED' });
    assert.equal(restored.viewMode, '3d');
    assert.equal(restored.contextHealth, 'active');
    assert.equal(restored.autoRestoreTo3D, false);
  });

  it('bumps retryNonce and returns to 3D when user clicks "3D 를 다시 시도" (RETRY_3D)', () => {
    const initial = createInitialWebGLViewState(true, '3d');
    const lost = transitionWebGLViewState(initial, { type: 'CONTEXT_LOST' });
    assert.equal(lost.retryNonce, 0);

    const retried = transitionWebGLViewState(lost, { type: 'RETRY_3D' });
    assert.equal(retried.viewMode, '3d');
    assert.equal(retried.contextHealth, 'active');
    assert.equal(retried.retryNonce, 1);

    // Selecting 3D via mode toggle while contextHealth === 'lost' also triggers retryNonce
    const lostAgain = transitionWebGLViewState(retried, { type: 'CONTEXT_LOST' });
    const retriedViaToggle = transitionWebGLViewState(lostAgain, {
      type: 'SET_VIEW_MODE',
      next: '3d',
    });
    assert.equal(retriedViaToggle.viewMode, '3d');
    assert.equal(retriedViaToggle.contextHealth, 'active');
    assert.equal(retriedViaToggle.retryNonce, 2);
  });

  it('stays locked to 2D when WebGL is unsupported', () => {
    const unsupported = createInitialWebGLViewState(false, '3d');
    assert.equal(unsupported.viewMode, '2d');
    assert.equal(unsupported.contextHealth, 'unsupported');
    assert.deepEqual(
      transitionWebGLViewState(unsupported, { type: 'RETRY_3D' }),
      unsupported,
    );
    assert.deepEqual(
      transitionWebGLViewState(unsupported, { type: 'CONTEXT_RESTORED' }),
      unsupported,
    );
  });

  it('renders "3D 를 다시 시도" button in 2D fallback view and HUD when webglContextLost is true', () => {
    const user = getPreviewDemoUser();
    const noop = () => {};

    const lostListHtml = renderToStaticMarkup(
      React.createElement(AccessibleListView, {
        user,
        runtimeEnv: 'preview',
        ships: [],
        projectsState: 'ready',
        projectsMessage: '',
        people: [],
        webglSupported: true,
        webglContextLost: true,
        onRetry3D: noop,
        onRefreshProjects: noop,
        onSelectShip: noop,
        onSelectPerson: noop,
        onPreviewLinkBlocked: noop,
      }),
    );
    assert.ok(lostListHtml.includes('data-testid="webgl-context-lost-banner"'));
    assert.ok(lostListHtml.includes('data-testid="retry-3d-button"'));
    assert.ok(lostListHtml.includes(WEBGL_RETRY_BUTTON_LABEL));

    const normalListHtml = renderToStaticMarkup(
      React.createElement(AccessibleListView, {
        user,
        runtimeEnv: 'preview',
        ships: [],
        projectsState: 'ready',
        projectsMessage: '',
        people: [],
        webglSupported: true,
        webglContextLost: false,
        onRetry3D: noop,
        onRefreshProjects: noop,
        onSelectShip: noop,
        onSelectPerson: noop,
        onPreviewLinkBlocked: noop,
      }),
    );
    assert.equal(normalListHtml.includes('data-testid="retry-3d-button"'), false);

    const hudLostHtml = renderToStaticMarkup(
      React.createElement(HudTopBar, {
        user,
        runtimeEnv: 'preview',
        viewMode: '2d',
        webglSupported: true,
        webglContextLost: true,
        lowSpecMode: false,
        darkTheme: false,
        cameraPreset: 'harbor',
        onlineCount: 1,
        projectCount: 0,
        onRetry3D: noop,
        onToggleViewMode: noop,
        onToggleLowSpec: noop,
        onToggleTheme: noop,
        onCycleCamera: noop,
        onZoom: noop,
        onLogout: noop,
        onPreviewLinkBlocked: noop,
      }),
    );
    assert.ok(hudLostHtml.includes(WEBGL_RETRY_BUTTON_LABEL));
  });

  it('wires webglcontextlost and webglcontextrestored listeners in HarborScene.ts', () => {
    const sceneSrc = readFileSync(
      resolve(process.cwd(), 'src', 'scene', 'HarborScene.ts'),
      'utf8',
    );
    assert.ok(sceneSrc.includes("addEventListener('webglcontextlost'"));
    assert.ok(sceneSrc.includes("addEventListener('webglcontextrestored'"));
    assert.ok(sceneSrc.includes('removeEventListener(\'webglcontextlost\''));
    assert.ok(sceneSrc.includes('removeEventListener(\'webglcontextrestored\''));
  });
});
