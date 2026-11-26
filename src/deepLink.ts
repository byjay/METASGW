/**
 * SGW · SEDMS · SGTALK · bmail deep-link builders & URL safety guard.
 *
 * FROZEN CONTRACT (§9):
 *   - SEDMS entry MUST use `/api/sedms-sso?return=<allowed-path>`
 *   - Allowed return paths: `/projects`, `/project/<id>`, `/app`
 *   - Never rename the `return` query parameter.
 */

const SAFE_PROJECT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SAFE_SUB_RE = /^[A-Za-z0-9._:@-]{1,128}$/;

export const SGW_LOGIN_REDIRECT_URL = '/?next=/meta/';

export const SGW_PORTAL_LINKS = {
  talkHome: '/talk/',
  talkAiAssistant: '/talk/',
  nas: '/nas/',
  bmail: 'bmail://inbox',
  admin: '/admin/',
  sedmsProjects: '/api/sedms-sso?return=%2Fprojects',
} as const;

/**
 * Validates that a navigation URL is safe against XSS / protocol injection.
 * Allows:
 *   - Same-origin root-relative paths starting with single `/` (rejects `//`)
 *   - Explicit `http:`, `https:`, and `bmail:` schemes
 * Rejects:
 *   - `javascript:`, `data:`, `vbscript:`, `file:`, `blob:`, control chars, empty strings
 */
export function isSafeNavigationUrl(rawUrl: string): boolean {
  if (typeof rawUrl !== 'string') return false;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 2048) return false;

  // Reject ASCII control characters & whitespace injection inside URL
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) return false;

  // Root-relative same-origin path (must NOT be protocol-relative //)
  if (trimmed.startsWith('/')) {
    return !trimmed.startsWith('//') && !trimmed.startsWith('/\\');
  }

  try {
    const parsed = new URL(trimmed);
    return (
      parsed.protocol === 'https:' ||
      parsed.protocol === 'http:' ||
      parsed.protocol === 'bmail:'
    );
  } catch {
    return false;
  }
}

export function isValidProjectId(projectId: string): boolean {
  if (typeof projectId !== 'string') return false;
  if (projectId === '.' || projectId === '..' || projectId.includes('..')) return false;
  return SAFE_PROJECT_ID_RE.test(projectId);
}

/**
 * Frozen contract: builds `/api/sedms-sso?return=<encodedPath>` strictly for
 * `/projects`, `/project/<id>`, or `/app`.
 */
export function buildSedmsReturnUrl(
  target: { kind: 'projects' } | { kind: 'app' } | { kind: 'project'; projectId: string },
): string {
  let returnPath: string;
  if (target.kind === 'projects') {
    returnPath = '/projects';
  } else if (target.kind === 'app') {
    returnPath = '/app';
  } else {
    if (!isValidProjectId(target.projectId)) {
      throw new Error(`Invalid SEDMS project id: ${target.projectId}`);
    }
    returnPath = `/project/${target.projectId}`;
  }
  return `/api/sedms-sso?return=${encodeURIComponent(returnPath)}`;
}

export function buildSedmsProjectUrl(projectId: string): string {
  return buildSedmsReturnUrl({ kind: 'project', projectId });
}

export function buildTalkDmUrl(sub: string): string {
  const clean = sub.trim();
  if (!SAFE_SUB_RE.test(clean)) {
    return SGW_PORTAL_LINKS.talkHome;
  }
  return `/talk/?dm=${encodeURIComponent(clean)}`;
}

export function buildTalkRoomUrl(roomId: string): string {
  const clean = roomId.trim();
  if (!SAFE_SUB_RE.test(clean)) {
    return SGW_PORTAL_LINKS.talkHome;
  }
  return `/talk/?room=${encodeURIComponent(clean)}`;
}

/**
 * Performs safe same-window navigation on explicit user interaction.
 * New-tab opening is handled declaratively via `<a target="_blank" rel="noopener noreferrer">`.
 */
export function navigateSafely(url: string): boolean {
  if (!isSafeNavigationUrl(url)) {
    return false;
  }
  if (typeof window === 'undefined') {
    return true;
  }
  window.location.assign(url);
  return true;
}
