/**
 * Single source of truth mapping SGW/SEDMS API responses into 3D/2D Harbor view models.
 *
 * CONTRACT RULES (§4, §6):
 *   - People are keyed strictly by `sub`.
 *   - Ships are derived ONLY from returned SEDMS projects (zero fabricated ships).
 *   - Project `name` is rendered verbatim (no guessed vessel class or customer org).
 *   - Missing fields display `'없음'` rather than placeholder business copy.
 *   - Vessel appearance (status color, signal flag, 7-day deck lights) is derived exclusively here.
 */

import type { SedmsProject, SgwEmployee, SgwPresenceEntry } from './sgwAdapter';

export const PRESENCE_TTL_MS = 30_000;
export const DECK_LIGHTS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

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
export type ShipFlagPattern = 'pennant' | 'swallowtail' | 'striped' | 'checkered' | 'plain';

export interface ShipAppearanceRule {
  statusTone: ProjectStatusTone;
  statusLabelKo: string;
  flagHex: string;
  hullAccentHex: string;
  flagPattern: ShipFlagPattern;
  hasDeckLights: boolean;
}

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
  boardingPoint: { x: number; z: number };
  hullStyleIndex: number;
  accentHex: string;
  appearance: ShipAppearanceRule;
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

const STATUS_STYLE_TABLE: Record<
  ProjectStatusTone,
  { statusLabelKo: string; flagHex: string; hullAccentHex: string; flagPattern: ShipFlagPattern }
> = {
  active: {
    statusLabelKo: '진행',
    flagHex: '#0ea5e9',
    hullAccentHex: '#0284c7',
    flagPattern: 'pennant',
  },
  review: {
    statusLabelKo: '검토',
    flagHex: '#f59e0b',
    hullAccentHex: '#d97706',
    flagPattern: 'swallowtail',
  },
  hold: {
    statusLabelKo: '보류',
    flagHex: '#ef4444',
    hullAccentHex: '#dc2626',
    flagPattern: 'striped',
  },
  completed: {
    statusLabelKo: '완료',
    flagHex: '#10b981',
    hullAccentHex: '#059669',
    flagPattern: 'checkered',
  },
  neutral: {
    statusLabelKo: '기타',
    flagHex: '#64748b',
    hullAccentHex: '#475569',
    flagPattern: 'plain',
  },
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

/**
 * Parses an updated_at string (ISO date or timestamp) and determines whether
 * the project was updated within the last 7 days (inclusive) relative to `nowMs`.
 */
export function isUpdatedWithinDays(
  updatedAt: string | undefined,
  nowMs = Date.now(),
  windowMs = DECK_LIGHTS_WINDOW_MS,
): boolean {
  if (!updatedAt || typeof updatedAt !== 'string') return false;
  const trimmed = updatedAt.trim();
  if (!trimmed || trimmed === '없음') return false;

  // Date-only ISO strings (YYYY-MM-DD) are treated as end-of-day UTC for inclusive 7-day check
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? `${trimmed}T12:00:00.000Z`
    : trimmed;

  const parsedMs = Date.parse(normalized);
  if (Number.isNaN(parsedMs)) return false;
  const ageMs = nowMs - parsedMs;
  return ageMs >= -24 * 60 * 60 * 1000 && ageMs <= windowMs;
}

/**
 * Single source of truth for vessel appearance derived purely from `status` and `updated_at`.
 */
export function deriveShipAppearance(
  status: string,
  updatedAt: string | undefined,
  nowMs = Date.now(),
): ShipAppearanceRule {
  const statusTone = resolveProjectStatusTone(status);
  const style = STATUS_STYLE_TABLE[statusTone];
  return {
    statusTone,
    statusLabelKo: style.statusLabelKo,
    flagHex: style.flagHex,
    hullAccentHex: style.hullAccentHex,
    flagPattern: style.flagPattern,
    hasDeckLights: isUpdatedWithinDays(updatedAt, nowMs),
  };
}

/**
 * Formats the HUD disconnected banner showing elapsed minutes since the last successful sync.
 */
export function formatDisconnectedBanner(
  lastSyncedAtMs: number | null,
  nowMs = Date.now(),
): string {
  if (lastSyncedAtMs === null || !Number.isFinite(lastSyncedAtMs)) {
    return '연결 끊김 — 마지막 갱신 0분 전';
  }
  const elapsedMinutes = Math.max(0, Math.floor((nowMs - lastSyncedAtMs) / 60_000));
  return `연결 끊김 — 마지막 갱신 ${elapsedMinutes}분 전`;
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
 * Maps SEDMS projects into collision-free water berths with derived appearance & boarding points.
 * For 4 projects uses a balanced 2x2 basin formation so all 4 vessels stay framed
 * inside the harbor viewport with generous clearance from the quay wall and each other.
 */
export function mapProjectsToHarborShips(
  projects: SedmsProject[],
  nowMs = Date.now(),
): HarborShip[] {
  if (projects.length === 0) return [];

  const count = projects.length;
  const maxPerRow = count === 4 ? 2 : 3;
  const spacingX = count === 4 ? 62 : 46;

  return projects.map((project, idx) => {
    const row = Math.floor(idx / maxPerRow);
    const col = idx % maxPerRow;
    const itemsInRow = Math.min(maxPerRow, count - row * maxPerRow);

    const startX = -((itemsInRow - 1) * spacingX) / 2;
    const berthX = startX + col * spacingX;
    // Quay wall ends at z=-2.5; Hero 씨스타호 & FD-01 occupy z=15.5..17.5.
    // Business project ships moor cleanly in the main foreground basin starting at z=45.
    const berthZ = 45 + row * 26;

    const appearance = deriveShipAppearance(project.status, project.updated_at, nowMs);
    const hash = stableHash(project.id);

    // Safe quay-apron boarding point directly in front of each vessel berth
    const boardingX = Math.max(-56, Math.min(56, berthX + (row > 0 ? (col === 0 ? -8 : 8) : 0)));
    const boardingZ = -4.2;

    return {
      id: project.id,
      code: project.code || project.id,
      name: project.name,
      role: project.role || '없음',
      status: project.status || '없음',
      statusTone: appearance.statusTone,
      updatedAt: project.updated_at || '없음',
      berthLabel: `B-${String(idx + 1).padStart(2, '0')}`,
      berthX,
      berthZ,
      boardingPoint: { x: boardingX, z: boardingZ },
      hullStyleIndex: (hash + idx) % 10,
      accentHex: appearance.flagHex,
      appearance,
    };
  });
}

/**
 * Physical harbor basin water zone & vessel footprint constants (must match shipyardWorld.ts geometry).
 * - North quay concrete wall ends at z = -2.5 (fenders extend to z = -2.0).
 * - West / East pier inner walls sit at x = -75.0 and x = +75.0 for z in [-2.5, 37.5].
 * - Docked vessels lie parallel to the quay (length ~44m along X, beam ~17m along Z).
 */
export const HARBOR_WATER_ZONE = {
  northQuayWallZ: -2.5,
  westPierInnerX: -75.0,
  eastPierInnerX: 75.0,
  pierMaxZ: 37.5,
  minWaterZ: -2.0,
  maxWaterZ: 140.0,
  minOpenWaterX: -140.0,
  maxOpenWaterX: 140.0,
} as const;

export const SHIP_BERTH_FOOTPRINT = {
  halfLengthX: 21.5,
  halfBeamZ: 8.2,
  minGapMeters: 1.0,
} as const;

export interface BerthValidationViolation {
  kind: 'outside_water_zone' | 'quay_overlap' | 'pier_overlap' | 'ship_overlap' | 'invalid_boarding_point';
  shipId: string;
  otherShipId?: string;
  detail: string;
}

export interface BerthValidationResult {
  ok: boolean;
  violations: BerthValidationViolation[];
}

/**
 * Validates that every docked ship sits strictly inside the harbor water zone,
 * clears the north quay and west/east piers, does not overlap any other ship,
 * and exposes a safe quay-side boarding point.
 */
export function validateShipBerths(ships: readonly HarborShip[]): BerthValidationResult {
  const violations: BerthValidationViolation[] = [];
  const halfX = SHIP_BERTH_FOOTPRINT.halfLengthX;
  const halfZ = SHIP_BERTH_FOOTPRINT.halfBeamZ;
  const gap = SHIP_BERTH_FOOTPRINT.minGapMeters;

  for (const ship of ships) {
    const minX = ship.berthX - halfX;
    const maxX = ship.berthX + halfX;
    const minZ = ship.berthZ - halfZ;
    const maxZ = ship.berthZ + halfZ;

    // 1. North quay collision / water-zone check
    if (minZ < HARBOR_WATER_ZONE.minWaterZ + gap) {
      violations.push({
        kind: 'quay_overlap',
        shipId: ship.id,
        detail: `Ship ${ship.id} north hull edge (${minZ.toFixed(1)}m) intrudes into quay wall (z <= ${HARBOR_WATER_ZONE.northQuayWallZ}m)`,
      });
    }

    if (
      maxZ > HARBOR_WATER_ZONE.maxWaterZ ||
      minX < HARBOR_WATER_ZONE.minOpenWaterX ||
      maxX > HARBOR_WATER_ZONE.maxOpenWaterX
    ) {
      violations.push({
        kind: 'outside_water_zone',
        shipId: ship.id,
        detail: `Ship ${ship.id} footprint [${minX.toFixed(1)}..${maxX.toFixed(1)}, ${minZ.toFixed(1)}..${maxZ.toFixed(1)}] exceeds harbor water zone`,
      });
    }

    // 2. West / East pier collision check when ship Z overlaps pier range [-2.5, 37.5]
    if (minZ <= HARBOR_WATER_ZONE.pierMaxZ) {
      if (minX < HARBOR_WATER_ZONE.westPierInnerX + gap) {
        violations.push({
          kind: 'pier_overlap',
          shipId: ship.id,
          detail: `Ship ${ship.id} west edge (${minX.toFixed(1)}m) overlaps west pier (x <= ${HARBOR_WATER_ZONE.westPierInnerX}m)`,
        });
      }
      if (maxX > HARBOR_WATER_ZONE.eastPierInnerX - gap) {
        violations.push({
          kind: 'pier_overlap',
          shipId: ship.id,
          detail: `Ship ${ship.id} east edge (${maxX.toFixed(1)}m) overlaps east pier (x >= ${HARBOR_WATER_ZONE.eastPierInnerX}m)`,
        });
      }
    }

    // 3. Boarding point must remain on the walkable north quay
    if (ship.boardingPoint.z >= HARBOR_WATER_ZONE.northQuayWallZ) {
      violations.push({
        kind: 'invalid_boarding_point',
        shipId: ship.id,
        detail: `Ship ${ship.id} boardingPoint.z (${ship.boardingPoint.z}) is not on the north quay`,
      });
    }
  }

  // 4. Pairwise ship-to-ship AABB non-overlap check
  for (let i = 0; i < ships.length; i += 1) {
    for (let j = i + 1; j < ships.length; j += 1) {
      const a = ships[i];
      const b = ships[j];
      const dx = Math.abs(a.berthX - b.berthX);
      const dz = Math.abs(a.berthZ - b.berthZ);
      const minCenterX = halfX * 2 + gap;
      const minCenterZ = halfZ * 2 + gap;
      if (dx < minCenterX && dz < minCenterZ) {
        violations.push({
          kind: 'ship_overlap',
          shipId: a.id,
          otherShipId: b.id,
          detail: `Ships ${a.id} and ${b.id} overlap (dx=${dx.toFixed(1)}m < ${minCenterX}m, dz=${dz.toFixed(1)}m < ${minCenterZ}m)`,
        });
      }
    }
  }

  return {
    ok: violations.length === 0,
    violations,
  };
}

/**
 * Boot-time berth placement assertion.
 * - When `throwOnViolation` is true (default for tests), throws an Error detailing all violations.
 * - When `warnInDev` is true and `throwOnViolation` is false (runtime boot), logs a console.warn in DEV mode.
 */
export function assertValidShipBerths(
  ships: readonly HarborShip[],
  options?: { throwOnViolation?: boolean; warnInDev?: boolean; logger?: (msg: string, detail: unknown) => void },
): BerthValidationResult {
  const result = validateShipBerths(ships);
  if (!result.ok) {
    const summary = result.violations.map((v) => v.detail).join('; ');
    if (options?.warnInDev) {
      const log = options.logger ?? console.warn;
      log('[METASGW] 선박 배치 검증 실패 (수역/부두/선박 겹침):', result.violations);
    }
    if (options?.throwOnViolation ?? true) {
      throw new Error(`Invalid ship berth placement: ${summary}`);
    }
  }
  return result;
}

