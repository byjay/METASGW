/**
 * Single runtime environment detector for METASGW.
 *
 * - 'sgw': Production / staging hosted under SGW (`sgw.seastar.work`,
 *   `*.sgw-seastar-work.pages.dev`, or mounted under `/meta/`).
 * - 'preview': Standalone preview environments (AI Studio preview, localhost, etc.)
 *   where no SGW backend exists.
 */

export type RuntimeEnv = 'sgw' | 'preview';

export const PREVIEW_DEMO_BANNER_TEXT = '데모 — 가명 데이터, SGW 미연결';
export const PREVIEW_SGW_ONLY_TOAST = 'SGW 에서만 동작';

export interface RuntimeEnvInput {
  hostname?: string;
  pathname?: string;
  baseUrl?: string;
}

function isSgwHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  if (!host) return false;
  if (host === 'sgw.seastar.work') return true;
  if (host === 'sgw-seastar-work.pages.dev') return true;
  if (host.endsWith('.sgw-seastar-work.pages.dev')) return true;
  return false;
}

function isMetaBase(baseUrl: string, pathname: string): boolean {
  const cleanBase = baseUrl.trim();
  const cleanPath = pathname.trim();
  if (cleanBase === '/meta/' || cleanBase === '/meta') return true;
  if (cleanPath === '/meta' || cleanPath.startsWith('/meta/')) return true;
  return false;
}

function readBrowserRuntimeInput(): RuntimeEnvInput {
  const metaEnv = (import.meta as unknown as { env?: { BASE_URL?: string } }).env;
  const baseUrl = typeof metaEnv?.BASE_URL === 'string' ? metaEnv.BASE_URL : '/';
  if (typeof window === 'undefined' || !window.location) {
    return { hostname: '', pathname: '/', baseUrl };
  }
  return {
    hostname: window.location.hostname || '',
    pathname: window.location.pathname || '/',
    baseUrl,
  };
}

/**
 * Determines whether METASGW is running inside SGW ('sgw') or standalone preview ('preview').
 */
export function detectRuntimeEnv(input?: RuntimeEnvInput): RuntimeEnv {
  const resolved = input ?? readBrowserRuntimeInput();
  const hostname = resolved.hostname ?? '';
  const pathname = resolved.pathname ?? '/';
  const baseUrl = resolved.baseUrl ?? '/';

  if (isSgwHost(hostname) || isMetaBase(baseUrl, pathname)) {
    return 'sgw';
  }
  return 'preview';
}
