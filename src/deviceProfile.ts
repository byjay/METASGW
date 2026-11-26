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

export interface DeviceProfileResult {
  recommendLowSpec: boolean;
  reducedMotion: boolean;
  webglSupported: boolean;
  isSoftwareWebGL: boolean;
  initialViewMode: '3d' | '2d';
  reasons: LowSpecReason[];
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
 * Pure decision function for default low-spec & 2D fallback modes.
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
