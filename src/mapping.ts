/**
 * Single source of truth mapping SGW/SEDMS API responses into 3D/2D Harbor view models.
 *
 * CONTRACT RULES (§4, §6):
 *   - People are keyed strictly by `sub`.
 *   - Ships are derived ONLY from returned SEDMS projects (zero fabricated ships).
 *   - Project `name` is rendered verbatim (no guessed vessel class or customer org).
 *   - Missing fields display `'없음'` rather than placeholder business copy.
 */

import type { SedmsProject, SgwEmployee, SgwPresenceEntry } from './sgwAdapter';

export const PRESENCE_TTL_MS = 30_000;

export interface HarborPerson {
  sub: string;
  name: string;
  dept: string;
  title: string;
  role: string;
  isPartner: boolean;
  isCurrentUser: boolean;
  online: boolean;
  position: { x: number; y: number; z: number };
  facingYaw: number;
  shirtHex: string;
  accentHex: string;
}

export type ProjectStatusTone = 'active' | 'review' | 'hold' | 'completed' | 'neutral';

export interface HarborShip {
  id: string;
  code: string;
  name: string;
  role: string;
  status: string;
  statusTone: ProjectStatusTone;
  updatedAt: string;
  berthLabel: string;
  berthX: number;
  berthZ: number;
  hullStyleIndex: number;
  accentHex: string;
}

const EMPLOYEE_SHIRT_PALETTE = [
  '#1d4ed8',
  '#0f766e',
  '#4338ca',
  '#0369a1',
  '#334155',
  '#047857',
];

const PARTNER_SHIRT_HEX = '#c2410c';

const STATUS_ACCENT_HEX: Record<ProjectStatusTone, string> = {
  active: '#0ea5e9',
  review: '#f59e0b',
  hold: '#ef4444',
  completed: '#10b981',
  neutral: '#64748b',
};

function stableHash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function resolveProjectStatusTone(status: string): ProjectStatusTone {
  const normalized = status.trim().toLowerCase();
  if (
    normalized.includes('complete') ||
    normalized.includes('done') ||
    normalized.includes('deliver') ||
    normalized.includes('완료') ||
    normalized.includes('인도')
  ) {
    return 'completed';
  }
  if (
    normalized.includes('active') ||
    normalized.includes('open') ||
    normalized.includes('progress') ||
    normalized.includes('진행') ||
    normalized.includes('운영')
  ) {
    return 'active';
  }
  if (
    normalized.includes('review') ||
    normalized.includes('pending') ||
    normalized.includes('approval') ||
    normalized.includes('검토') ||
    normalized.includes('결재')
  ) {
    return 'review';
  }
  if (
    normalized.includes('hold') ||
    normalized.includes('pause') ||
    normalized.includes('block') ||
    normalized.includes('보류') ||
    normalized.includes('중단')
  ) {
    return 'hold';
  }
  return 'neutral';
}

export function isPresenceOnline(
  entry: SgwPresenceEntry | undefined,
  nowMs: number,
): boolean {
  if (!entry) return false;
  if (entry.lastSeenAt > 0) {
    return nowMs - entry.lastSeenAt <= PRESENCE_TTL_MS && entry.online !== false;
  }
  return entry.online === true;
}

/**
 * Deterministic safe boardwalk slots on the quay apron (`z` in [-11.5, -4.5]),
 * guaranteed collision-free with buildings (`z < -20`) and water (`z >= -2.5`).
 */
const QUAY_AVATAR_SLOTS: ReadonlyArray<{ x: number; z: number; yaw: number }> = [
  { x: -16, z: -5.4, yaw: 0.2 },
  { x: -6, z: -6.2, yaw: -0.1 },
  { x: 6, z: -5.2, yaw: -0.25 },
  { x: 16, z: -6.0, yaw: 0.3 },
  { x: -24, z: -7.6, yaw: 0.4 },
  { x: 24, z: -7.4, yaw: -0.4 },
  { x: -18, z: -10.4, yaw: 0.15 },
  { x: -8, z: -10.8, yaw: 0.0 },
  { x: 4, z: -10.2, yaw: -0.1 },
  { x: 14, z: -10.6, yaw: -0.2 },
  { x: 22, z: -10.4, yaw: -0.35 },
  { x: -28, z: -5.0, yaw: 0.5 },
];

export function mapEmployeesToHarborPeople(
  employees: SgwEmployee[],
  presenceEntries: SgwPresenceEntry[],
  currentUserSub: string | null,
  nowMs = Date.now(),
): HarborPerson[] {
  const presenceBySub = new Map<string, SgwPresenceEntry>();
  for (const entry of presenceEntries) {
    presenceBySub.set(entry.sub, entry);
  }

  return employees.map((emp, idx) => {
    const slot = QUAY_AVATAR_SLOTS[idx % QUAY_AVATAR_SLOTS.length];
    const rowOffset = Math.floor(idx / QUAY_AVATAR_SLOTS.length);
    const hash = stableHash(emp.sub);
    const isCurrentUser = currentUserSub !== null && emp.sub === currentUserSub;
    const online = isCurrentUser || isPresenceOnline(presenceBySub.get(emp.sub), nowMs);

    return {
      sub: emp.sub,
      name: emp.name || emp.sub,
      dept: emp.dept || '없음',
      title: emp.title || '없음',
      role: emp.role || 'member',
      isPartner: emp.isPartner,
      isCurrentUser,
      online,
      position: {
        x: slot.x + rowOffset * 1.8,
        y: 1.61,
        z: Math.max(-13.5, slot.z - rowOffset * 1.4),
      },
      facingYaw: slot.yaw,
      shirtHex: emp.isPartner
        ? PARTNER_SHIRT_HEX
        : EMPLOYEE_SHIRT_PALETTE[hash % EMPLOYEE_SHIRT_PALETTE.length],
      accentHex: emp.isPartner ? '#fb923c' : '#38bdf8',
    };
  });
}

/**
 * Maps SEDMS projects into collision-free water berths.
 * For 4 projects uses a balanced 2x2 basin formation so all 4 vessels stay framed
 * inside the harbor viewport with generous clearance from the quay wall and each other.
 */
export function mapProjectsToHarborShips(projects: SedmsProject[]): HarborShip[] {
  if (projects.length === 0) return [];

  const count = projects.length;
  const maxPerRow = count === 4 ? 2 : 3;
  const spacingX = count === 4 ? 52 : 46;

  return projects.map((project, idx) => {
    const row = Math.floor(idx / maxPerRow);
    const col = idx % maxPerRow;
    const itemsInRow = Math.min(maxPerRow, count - row * maxPerRow);

    const startX = -((itemsInRow - 1) * spacingX) / 2;
    const berthX = startX + col * spacingX;
    // Quay wall ends at z=-2.5. Row 0 at z=20.5 guarantees >= 15m clear water channel.
    const berthZ = 20.5 + row * 26;

    const tone = resolveProjectStatusTone(project.status);
    const hash = stableHash(project.id);

    return {
      id: project.id,
      code: project.code || project.id,
      name: project.name,
      role: project.role || '없음',
      status: project.status || '없음',
      statusTone: tone,
      updatedAt: project.updated_at || '없음',
      berthLabel: `B-${String(idx + 1).padStart(2, '0')}`,
      berthX,
      berthZ,
      hullStyleIndex: (hash + idx) % 10,
      accentHex: STATUS_ACCENT_HEX[tone],
    };
  });
}
