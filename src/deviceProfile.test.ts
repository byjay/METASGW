import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  detectDeviceProfile,
  isSoftwareWebGLRendererName,
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
  it('keeps full 3D mode on high-spec hardware with hardware WebGL', () => {
    const profile = detectDeviceProfile(highSpecSignals());
    assert.equal(profile.recommendLowSpec, false);
    assert.equal(profile.reducedMotion, false);
    assert.equal(profile.webglSupported, true);
    assert.equal(profile.initialViewMode, '3d');
    assert.deepEqual(profile.reasons, []);
  });

  it('enables low-spec mode when hardwareConcurrency <= 4', () => {
    const profile = detectDeviceProfile(highSpecSignals({ hardwareConcurrency: 4 }));
    assert.equal(profile.recommendLowSpec, true);
    assert.ok(profile.reasons.includes('low-cpu-cores'));
    assert.equal(profile.initialViewMode, '3d');
  });

  it('enables low-spec mode when deviceMemory <= 4 GB', () => {
    const profile = detectDeviceProfile(highSpecSignals({ deviceMemory: 4 }));
    assert.equal(profile.recommendLowSpec, true);
    assert.ok(profile.reasons.includes('low-device-memory'));
  });

  it('enables low-spec and reducedMotion when prefers-reduced-motion is active', () => {
    const profile = detectDeviceProfile(highSpecSignals({ prefersReducedMotion: true }));
    assert.equal(profile.recommendLowSpec, true);
    assert.equal(profile.reducedMotion, true);
    assert.ok(profile.reasons.includes('prefers-reduced-motion'));
  });

  it('enables low-spec mode on software WebGL renderers or small MAX_TEXTURE_SIZE', () => {
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
});
