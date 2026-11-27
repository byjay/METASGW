import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  detectDeviceProfile,
  evaluateAutoQualityDowngrade,
  isSoftwareWebGLRendererName,
  resolvePixelRatioForQuality,
  type DeviceCapabilitySignals,
} from './deviceProfile';

function highSpecSignals(overrides?: Partial<DeviceCapabilitySignals>): DeviceCapabilitySignals {
  return {
    prefersReducedMotion: false,
    hardwareConcurrency: 8,
    deviceMemory: 16,
    webgl: {
      supported: true,
      isSoftwareRenderer: false,
      maxTextureSize: 16384,
      rendererName: 'ANGLE (NVIDIA RTX 4060)',
    },
    ...overrides,
  };
}

describe('deviceProfile low-spec & reduced-motion auto detection', () => {
  it('keeps full 3D mode and default high quality on high-spec hardware with hardware WebGL', () => {
    const profile = detectDeviceProfile(highSpecSignals());
    assert.equal(profile.recommendLowSpec, false);
    assert.equal(profile.initialQualityTier, 'high');
    assert.equal(profile.reducedMotion, false);
    assert.equal(profile.webglSupported, true);
    assert.equal(profile.initialViewMode, '3d');
    assert.deepEqual(profile.reasons, []);
  });

  it('enables low-spec hint when hardwareConcurrency <= 4 while keeping default initialQualityTier high', () => {
    const profile = detectDeviceProfile(highSpecSignals({ hardwareConcurrency: 4 }));
    assert.equal(profile.recommendLowSpec, true);
    assert.equal(profile.initialQualityTier, 'high');
    assert.ok(profile.reasons.includes('low-cpu-cores'));
    assert.equal(profile.initialViewMode, '3d');
  });

  it('enables low-spec hint when deviceMemory <= 4 GB', () => {
    const profile = detectDeviceProfile(highSpecSignals({ deviceMemory: 4 }));
    assert.equal(profile.recommendLowSpec, true);
    assert.ok(profile.reasons.includes('low-device-memory'));
  });

  it('enables reducedMotion when prefers-reduced-motion is active', () => {
    const profile = detectDeviceProfile(highSpecSignals({ prefersReducedMotion: true }));
    assert.equal(profile.recommendLowSpec, true);
    assert.equal(profile.reducedMotion, true);
    assert.ok(profile.reasons.includes('prefers-reduced-motion'));
  });

  it('identifies software WebGL renderers or small MAX_TEXTURE_SIZE', () => {
    assert.equal(isSoftwareWebGLRendererName('Google SwiftShader'), true);
    assert.equal(isSoftwareWebGLRendererName('llvmpipe (LLVM 15)'), true);
    assert.equal(isSoftwareWebGLRendererName('Apple M3 GPU'), false);

    const soft = detectDeviceProfile(
      highSpecSignals({
        webgl: {
          supported: true,
          isSoftwareRenderer: true,
          maxTextureSize: 8192,
          rendererName: 'Google SwiftShader',
        },
      }),
    );
    assert.equal(soft.recommendLowSpec, true);
    assert.equal(soft.isSoftwareWebGL, true);
    assert.ok(soft.reasons.includes('software-webgl'));

    const smallTex = detectDeviceProfile(
      highSpecSignals({
        webgl: {
          supported: true,
          isSoftwareRenderer: false,
          maxTextureSize: 2048,
          rendererName: 'Integrated GPU',
        },
      }),
    );
    assert.equal(smallTex.recommendLowSpec, true);
    assert.ok(smallTex.reasons.includes('low-webgl-texture-limit'));
  });

  it('falls back to 2d view mode when WebGL is unavailable', () => {
    const profile = detectDeviceProfile(
      highSpecSignals({
        webgl: {
          supported: false,
          isSoftwareRenderer: true,
          maxTextureSize: 0,
          rendererName: '',
        },
      }),
    );
    assert.equal(profile.webglSupported, false);
    assert.equal(profile.initialViewMode, '2d');
    assert.equal(profile.recommendLowSpec, true);
    assert.ok(profile.reasons.includes('no-webgl'));
  });

  it('enforces 1:1+ canvas resolution in high/medium and downscales ONLY in low tier', () => {
    assert.equal(resolvePixelRatioForQuality('high', 1), 1);
    assert.equal(resolvePixelRatioForQuality('high', 2), 2);
    assert.equal(resolvePixelRatioForQuality('high', 3), 2);
    assert.equal(resolvePixelRatioForQuality('medium', 1), 1);
    assert.equal(resolvePixelRatioForQuality('medium', 2), 1.5);
    assert.equal(resolvePixelRatioForQuality('low', 1), 0.75);
    assert.equal(resolvePixelRatioForQuality('low', 2), 0.75);
  });

  it('auto-downgrades high -> medium ONLY after 3s with avgFrameTimeMs > 33ms, respecting user lock', () => {
    // Before 3s elapsed -> stay high
    assert.equal(
      evaluateAutoQualityDowngrade({
        currentTier: 'high',
        userLockedTier: false,
        measuredElapsedMs: 2500,
        avgFrameTimeMs: 50,
      }),
      'high',
    );
    // After 3s with smooth frames (<= 33ms) -> stay high
    assert.equal(
      evaluateAutoQualityDowngrade({
        currentTier: 'high',
        userLockedTier: false,
        measuredElapsedMs: 3200,
        avgFrameTimeMs: 16.6,
      }),
      'high',
    );
    // After 3s with slow frames (> 33ms) -> step down one notch to medium
    assert.equal(
      evaluateAutoQualityDowngrade({
        currentTier: 'high',
        userLockedTier: false,
        measuredElapsedMs: 3200,
        avgFrameTimeMs: 42,
      }),
      'medium',
    );
    // User manually locked 'high' -> never auto-downgrade
    assert.equal(
      evaluateAutoQualityDowngrade({
        currentTier: 'high',
        userLockedTier: true,
        measuredElapsedMs: 5000,
        avgFrameTimeMs: 60,
      }),
      'high',
    );
  });
});
