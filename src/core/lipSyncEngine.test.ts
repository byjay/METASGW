import test from 'node:test';
import assert from 'node:assert/strict';
import { computeVisemesFromSpectrum, smoothVisemes, ZERO_VISEMES } from './lipSyncEngine';

test('computeVisemesFromSpectrum returns ZERO_VISEMES below noise gate', () => {
  const quiet = new Uint8Array(128).fill(4);
  const res = computeVisemesFromSpectrum(quiet, 48000, 256, 0.08);
  assert.deepEqual(res, ZERO_VISEMES);
});

test('computeVisemesFromSpectrum distinguishes low-F1 ou vs mid-F1 aa vs high-F2 ih vowels', () => {
  // 48000 / 256 = 187.5 Hz per bin
  // Low F1 (220-520 Hz) -> bins 1..2
  const ouBins = new Uint8Array(128);
  ouBins[1] = 220;
  ouBins[2] = 210;
  const ouVis = computeVisemesFromSpectrum(ouBins, 48000, 256);
  assert.ok(ouVis.volume > 0.15);
  assert.ok(ouVis.ou > ouVis.ih);

  // High F2 (1850-3400 Hz) + natural F1 fundamental (bin 2) -> vowel 'ih'/'ee'
  const ihBins = new Uint8Array(128);
  ihBins[2] = 160;
  for (let i = 10; i <= 18; i++) ihBins[i] = 220;
  const ihVis = computeVisemesFromSpectrum(ihBins, 48000, 256);
  assert.ok(ihVis.volume > 0.2);
  assert.ok(ihVis.ih > ouVis.ih);
  assert.ok(ihVis.ee > 0.2);

  // Mid F1 + Low F2 (520-1850 Hz) -> bins 3..9
  const aaBins = new Uint8Array(128);
  for (let i = 3; i <= 9; i++) aaBins[i] = 230;
  const aaVis = computeVisemesFromSpectrum(aaBins, 48000, 256);
  assert.ok(aaVis.aa > 0.4);
});

test('smoothVisemes applies smooth exponential attack and release damping', () => {
  const target = { aa: 0.9, ih: 0.2, ou: 0.1, ee: 0.3, oh: 0.4, volume: 0.85 };
  const attackStep = smoothVisemes(ZERO_VISEMES, target, 0.05);
  assert.ok(attackStep.aa > 0.4 && attackStep.aa < 0.9);

  const releaseStep = smoothVisemes(target, ZERO_VISEMES, 0.05);
  assert.ok(releaseStep.aa < 0.9 && releaseStep.aa > 0.2);
});
