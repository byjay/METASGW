import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectRuntimeEnv,
  PREVIEW_DEMO_BANNER_TEXT,
  PREVIEW_SGW_ONLY_TOAST,
} from './runtimeEnv.ts';

describe('runtimeEnv detection', () => {
  it('returns sgw for production host, Pages preview subdomain, or /meta/ base', () => {
    assert.equal(detectRuntimeEnv({ hostname: 'sgw.seastar.work', pathname: '/', baseUrl: '/' }), 'sgw');
    assert.equal(
      detectRuntimeEnv({ hostname: 'b014340c.sgw-seastar-work.pages.dev', pathname: '/', baseUrl: '/' }),
      'sgw',
    );
    assert.equal(
      detectRuntimeEnv({ hostname: 'SGW.SEASTAR.WORK', pathname: '/meta/', baseUrl: '/meta/' }),
      'sgw',
    );
    assert.equal(
      detectRuntimeEnv({ hostname: 'localhost', pathname: '/meta/', baseUrl: '/' }),
      'sgw',
    );
    assert.equal(
      detectRuntimeEnv({ hostname: 'localhost', pathname: '/', baseUrl: '/meta/' }),
      'sgw',
    );
  });

  it('returns preview for AI Studio preview hosts and localhost root', () => {
    assert.equal(
      detectRuntimeEnv({
        hostname: 'ais-dev-example.asia-east1.run.app',
        pathname: '/',
        baseUrl: '/',
      }),
      'preview',
    );
    assert.equal(
      detectRuntimeEnv({
        hostname: 'ais-pre-example.asia-east1.run.app',
        pathname: '/',
        baseUrl: '/',
      }),
      'preview',
    );
    assert.equal(
      detectRuntimeEnv({ hostname: 'localhost', pathname: '/', baseUrl: '/' }),
      'preview',
    );
    assert.equal(
      detectRuntimeEnv({ hostname: '127.0.0.1', pathname: '/', baseUrl: '/' }),
      'preview',
    );
  });

  it('exports required Korean preview banner and toast copy', () => {
    assert.equal(PREVIEW_DEMO_BANNER_TEXT, '데모 — 가명 데이터, SGW 미연결');
    assert.equal(PREVIEW_SGW_ONLY_TOAST, 'SGW 에서만 동작');
  });
});
