import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

/**
 * SGW integration build script (mirrors SGW_V0/scripts/build-talk.mjs).
 * 1) Type-checks & runs unit tests
 * 2) Builds static SPA with base="/meta/"
 * 3) Verifies dist/index.html contains /meta/ asset paths and zero external CDN links
 * 4) If deployed inside SGW_V0 repo (../app/build/web exists), copies dist/ to ../app/build/web/meta/
 */
const root = process.cwd();

function runStep(label, args, extraEnv = {}) {
  console.log(`\n[build-meta] ${label}`);
  const res = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
  if (res.status !== 0) {
    console.error(`[build-meta] FAILED: ${label}`);
    process.exit(res.status ?? 1);
  }
}

const tscBin = resolve(root, 'node_modules', 'typescript', 'bin', 'tsc');
const viteBin = resolve(root, 'node_modules', 'vite', 'bin', 'vite.js');

runStep('Type check (tsc --noEmit)', [tscBin, '--noEmit']);
runStep('Unit tests (scripts/run-tests.mjs)', [resolve(root, 'scripts', 'run-tests.mjs')]);
runStep('Vite static build (base=/meta/)', [viteBin, 'build'], { VITE_META_BASE: '/meta/' });

const distDir = resolve(root, 'dist');
const distIndex = resolve(distDir, 'index.html');
if (!existsSync(distIndex)) {
  console.error('[build-meta] dist/index.html was not produced.');
  process.exit(1);
}

const html = readFileSync(distIndex, 'utf8');
if (!html.includes('/meta/')) {
  console.error('[build-meta] Built index.html does not reference /meta/ base path.');
  process.exit(1);
}
if (/fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr|unpkg\.com|cdnjs\.cloudflare/i.test(html)) {
  console.error('[build-meta] External CDN link detected in dist/index.html.');
  process.exit(1);
}

const sgwWebRoot = resolve(root, '..', 'app', 'build', 'web');
if (existsSync(sgwWebRoot)) {
  const targetDir = resolve(sgwWebRoot, 'meta');
  rmSync(targetDir, { recursive: true, force: true });
  mkdirSync(targetDir, { recursive: true });
  cpSync(distDir, targetDir, { recursive: true });
  console.log(`[build-meta] Copied static bundle to ${targetDir}`);
} else {
  console.log('[build-meta] Standalone mode: dist/ ready for SGW ../app/build/web/meta/ deployment.');
}
