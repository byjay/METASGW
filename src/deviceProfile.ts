/**
 * Automatic device performance & accessibility profile detector.
 * Evaluates hardwareConcurrency, deviceMemory, WebGL renderer capabilities,
 * and `prefers-reduced-motion` to pick safe defaults on first load.
 */

export type LowSpecReason =
  | 'prefers-reduced-motion'
  | 'low-cpu-cores'
  | 'low-device-memory'
  | 'software-webgl'
  | 'low-webgl-texture-limit'
  | 'no-webgl';

export interface WebGLProbeResult {
  supported: boolean;
  isSoftwareRenderer: boolean;
  maxTextureSize: number;
  rendererName: string;
}

export interface DeviceCapabilitySignals {
  prefersReducedMotion: boolean;
  hardwareConcurrency?: number;
  deviceMemory?: number;
  webgl: WebGLProbeResult;
}

export type QualityTier = 'high' | 'medium' | 'low';

export interface DeviceProfileResult {
  recommendLowSpec: boolean;
  initialQualityTier: QualityTier;
  reducedMotion: boolean;
  webglSupported: boolean;
  isSoftwareWebGL: boolean;
  initialViewMode: '3d' | '2d';
  reasons: LowSpecReason[];
}

/**
 * Computes effective renderer pixel ratio strictly per 3-tier quality policy:
 *   - 'high': full native DPR up to 2.0 (at dpr=1, canvas === 1:1 CSS size!)
 *   - 'medium': native DPR up to 1.5 (never below 1.0)
 *   - 'low': 0.75 resolution scale (ONLY tier that downscales canvas)
 */
export function resolvePixelRatioForQuality(tier: QualityTier, devicePixelRatio = 1): number {
  const safeDpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  if (tier === 'low') return 0.75;
  if (tier === 'medium') return Math.max(1, Math.min(safeDpr, 1.5));
  return Math.max(1, Math.min(safeDpr, 2));
}

/**
 * Maximum number of 3D colleague avatars rendered simultaneously on the quay per quality tier.
 * Colleagues beyond this cap are summarized via the unobtrusive "외 n명" indicator and remain
 * fully accessible in the 2D list and PeopleFinderDrawer.
 * NOTE: On 'low' tier we cap avatar count and use simplified 3D materials — NEVER 2D sprites.
 */
export function resolveAvatarCapForQuality(tier: QualityTier): number {
  if (tier === 'low') return 3;
  if (tier === 'medium') return 10;
  return 16;
}

/**
 * Pure runtime auto-downgrade evaluator (Requirement #1):
 * - Only runs if the user has NOT manually locked a quality tier.
 * - After measuring the first 3 seconds of actual frame times, if avgFrameMs > 33ms
 *   while on 'high', steps down ONE tier to 'medium' (never jumps straight to 'low').
 */
export function evaluateAutoQualityDowngrade(params: {
  currentTier: QualityTier;
  userLockedTier: boolean;
  measuredElapsedMs: number;
  avgFrameTimeMs: number;
}): QualityTier {
  if (params.userLockedTier) return params.currentTier;
  if (params.currentTier !== 'high') return params.currentTier;
  if (params.measuredElapsedMs < 3000) return params.currentTier;
  if (params.avgFrameTimeMs > 33) return 'medium';
  return 'high';
}

const SOFTWARE_RENDERER_RE =
  /SwiftShader|llvmpipe|softpipe|Software|Basic Render|ANGLE.*Google/i;

export function isSoftwareWebGLRendererName(rendererName: string): boolean {
  return SOFTWARE_RENDERER_RE.test(rendererName);
}

export function probeBrowserWebGL(): WebGLProbeResult {
  if (typeof document === 'undefined') {
    return { supported: false, isSoftwareRenderer: true, maxTextureSize: 0, rendererName: '' };
  }
  try {
    const canvas = document.createElement('canvas');
    const gl =
      (canvas.getContext('webgl2') as WebGL2RenderingContext | null) ||
      (canvas.getContext('webgl') as WebGLRenderingContext | null);
    if (!gl) {
      return { supported: false, isSoftwareRenderer: true, maxTextureSize: 0, rendererName: '' };
    }
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const rendererName = String(gl.getParameter(param) || '');
    const maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return {
      supported: true,
      isSoftwareRenderer: isSoftwareWebGLRendererName(rendererName),
      maxTextureSize,
      rendererName,
    };
  } catch {
    return { supported: false, isSoftwareRenderer: true, maxTextureSize: 0, rendererName: '' };
  }
}

export function readBrowserDeviceSignals(): DeviceCapabilitySignals {
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const nav =
    typeof navigator !== 'undefined'
      ? (navigator as Navigator & { deviceMemory?: number })
      : undefined;

  return {
    prefersReducedMotion,
    hardwareConcurrency:
      typeof nav?.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : undefined,
    deviceMemory: typeof nav?.deviceMemory === 'number' ? nav.deviceMemory : undefined,
    webgl: probeBrowserWebGL(),
  };
}

/**
 * Pure decision function for default quality profile & 2D fallback modes.
 * Per Requirement #1: default 3D graphics quality ALWAYS starts at 'high' (full 1:1+ resolution)
 * and only steps down one notch to 'medium' if real 3-second frame timing exceeds 33ms.
 */
export function detectDeviceProfile(signals?: DeviceCapabilitySignals): DeviceProfileResult {
  const s = signals ?? readBrowserDeviceSignals();
  const reasons: LowSpecReason[] = [];

  if (s.prefersReducedMotion) {
    reasons.push('prefers-reduced-motion');
  }
  if (typeof s.hardwareConcurrency === 'number' && s.hardwareConcurrency > 0 && s.hardwareConcurrency <= 4) {
    reasons.push('low-cpu-cores');
  }
  if (typeof s.deviceMemory === 'number' && s.deviceMemory > 0 && s.deviceMemory <= 4) {
    reasons.push('low-device-memory');
  }
  if (!s.webgl.supported) {
    reasons.push('no-webgl');
  } else {
    if (s.webgl.isSoftwareRenderer) {
      reasons.push('software-webgl');
    }
    if (s.webgl.maxTextureSize > 0 && s.webgl.maxTextureSize < 4096) {
      reasons.push('low-webgl-texture-limit');
    }
  }

  return {
    recommendLowSpec: reasons.length > 0,
    initialQualityTier: 'high',
    reducedMotion: s.prefersReducedMotion,
    webglSupported: s.webgl.supported,
    isSoftwareWebGL: s.webgl.isSoftwareRenderer,
    initialViewMode: s.webgl.supported ? '3d' : '2d',
    reasons,
  };
}

export function subscribeReducedMotion(listener: (reduced: boolean) => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  const onChange = (e: MediaQueryListEvent) => listener(e.matches);
  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }
  return () => {};
}
