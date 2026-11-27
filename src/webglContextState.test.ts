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
    assert.ok(sceneSrc.includes("removeEventListener('webglcontextlost'"));
    assert.ok(sceneSrc.includes("removeEventListener('webglcontextrestored'"));
  });

  it('stays in 2D mode on LOAD_FAILED (3D dynamic import error) and allows explicit RETRY_3D', () => {
    const initial = createInitialWebGLViewState(true, '3d');
    const failed = transitionWebGLViewState(initial, { type: 'LOAD_FAILED' });
    assert.equal(failed.viewMode, '2d');
    assert.equal(failed.contextHealth, 'lost');
    assert.equal(failed.fallbackReason, 'load_failed');
    assert.equal(failed.autoRestoreTo3D, false);

    // Context restored should not flip back when failure was chunk load error
    const stillIn2D = transitionWebGLViewState(failed, { type: 'CONTEXT_RESTORED' });
    assert.equal(stillIn2D.viewMode, '2d');

    // Explicit user retry bumps retryNonce and returns to 3D mode
    const retried = transitionWebGLViewState(failed, { type: 'RETRY_3D' });
    assert.equal(retried.viewMode, '3d');
    assert.equal(retried.contextHealth, 'active');
    assert.equal(retried.fallbackReason, null);
    assert.equal(retried.retryNonce, 1);
  });

  it('renders load_failed fallback notice and 3D background-loading banner in AccessibleListView', () => {
    const user = getPreviewDemoUser();
    const noop = () => {};

    const loadFailedHtml = renderToStaticMarkup(
      React.createElement(AccessibleListView, {
        user,
        runtimeEnv: 'preview',
        ships: [],
        projectsState: 'ready',
        projectsMessage: '',
        people: [],
        webglSupported: true,
        webglContextLost: true,
        webglFallbackReason: 'load_failed',
        onRetry3D: noop,
        onRefreshProjects: noop,
        onSelectShip: noop,
        onSelectPerson: noop,
        onPreviewLinkBlocked: noop,
      }),
    );
    assert.ok(loadFailedHtml.includes('data-testid="webgl-context-lost-banner"'));
    assert.ok(loadFailedHtml.includes('3D 항구 모듈을 불러오지 못해 2D 목록 모드를 유지합니다.'));
    assert.ok(loadFailedHtml.includes(WEBGL_RETRY_BUTTON_LABEL));

    const loadingHtml = renderToStaticMarkup(
      React.createElement(AccessibleListView, {
        user,
        runtimeEnv: 'preview',
        ships: [],
        projectsState: 'ready',
        projectsMessage: '',
        people: [],
        webglSupported: true,
        sceneLoading3D: true,
        onRefreshProjects: noop,
        onSelectShip: noop,
        onSelectPerson: noop,
        onPreviewLinkBlocked: noop,
      }),
    );
    assert.ok(loadingHtml.includes('data-testid="scene-3d-loading-banner"'));
  });

  it('recovers cleanly on retry when dynamic 3D chunk loader fails first', async () => {
    const { loadHarborSceneModule, resetHarborSceneModuleCache } = await import(
      './scene/harborSceneLoader'
    );
    resetHarborSceneModuleCache();
    let attempts = 0;
    const flakyImporter = async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('simulated chunk load failure');
      }
      return { HarborSceneController: class {} } as unknown as Awaited<
        ReturnType<typeof loadHarborSceneModule>
      >;
    };

    await assert.rejects(() => loadHarborSceneModule(flakyImporter), /simulated chunk load failure/);
    const mod = await loadHarborSceneModule(flakyImporter);
    assert.equal(attempts, 2);
    assert.ok(mod.HarborSceneController);
  });

  it('keeps initial entry chunk (App.tsx & HudTopBar.tsx) free of static three/HarborScene imports', () => {
    const appSrc = readFileSync(resolve(process.cwd(), 'src', 'App.tsx'), 'utf8');
    const hudSrc = readFileSync(resolve(process.cwd(), 'src', 'components', 'HudTopBar.tsx'), 'utf8');

    assert.equal(/from\s+['"]three['"]/.test(appSrc), false, 'App.tsx must not statically import three');
    assert.equal(
      /from\s+['"]\.\/scene\/HarborScene['"]/.test(appSrc),
      false,
      'App.tsx must load HarborScene dynamically via harborSceneLoader',
    );
    assert.ok(appSrc.includes('loadHarborSceneModule'), 'App.tsx must use loadHarborSceneModule');
    assert.equal(/from\s+['"]three['"]/.test(hudSrc), false, 'HudTopBar.tsx must not import three');
    assert.equal(
      /from\s+['"]\.\.\/scene\/HarborScene['"]/.test(hudSrc),
      false,
      'HudTopBar.tsx must import types from harborSceneTypes instead of HarborScene',
    );
  });
});

