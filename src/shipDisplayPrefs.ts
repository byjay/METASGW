/**
 * Local UI display preferences for ship names & headings (non-PII, non-token).
 *
 * CONTRACT RULES (§15, §19):
 *   - Business SEDMS project data is NEVER mutated; custom names act strictly as
 *     a local "내 화면 표시 이름" overlay while keeping the original name as subtitle.
 *   - Decorative ships (e.g., 씨스타호, FD-01, scenery vessels) can be renamed/rotated freely.
 *   - Names must be 1..30 characters after trimming, plain text only (zero HTML interpretation).
 *   - Clearing the custom name reverts to the original default name.
 *   - Rotations are checked via Oriented Bounding Box (OBB) SAT collision against
 *     quay walls, piers, floating dock, and all other ships — colliding rotations
 *     are rejected and rolled back without saving.
 *   - All localStorage reads/writes are wrapped in try/catch for private/restricted browsers.
 */

export const SHIP_DISPLAY_PREFS_STORAGE_KEY = 'metasgw.shipDisplayPrefs.v1';
export const SHIP_ASSETS_STORAGE_KEY = 'metasgw.shipAssets.v1';
export const ADDED_PROJECTS_STORAGE_KEY = 'metasgw.addedProjects.v1';
export const MAX_SHIP_NAME_LENGTH = 30;
export const ROTATION_STEP_DEG = 15;

export interface ShipDisplayPrefEntry {
  customName?: string;
  yawDeg?: number;
  vesselAssetId?: string;
}

export type ShipDisplayPrefsMap = Record<string, ShipDisplayPrefEntry>;

export interface SavedShipAssetRecord {
  assetId: string;
  name: string;
  vesselType: string;
  defaultYawDeg: number;
  sourceShipId?: string;
  sourceKind: 'builtin' | 'project' | 'decorative' | 'custom';
  note?: string;
  savedAt: string;
}

export interface AddedProjectShipRecord {
  id: string;
  code: string;
  name: string;
  role: string;
  status: string;
  updated_at: string;
  vesselType: string;
  assetId: string;
}

export interface ShipFootprintCollider {
  id: string;
  centerX: number;
  centerZ: number;
  halfLength: number; // along local forward/back axis (when yaw=0, local Z; when yaw=90°, world X)
  halfBeam: number;   // along local port/starboard axis
  yawDeg: number;
}

export interface StaticObstacleRect {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export type ShipNameValidationResult =
  | { ok: true; value: string; cleared: boolean }
  | { ok: false; reason: string };

/**
 * Validates and normalizes a custom display name (1..30 chars, plain text, no control chars).
 * Empty string explicitly signals "reset to original name".
 */
export function validateShipDisplayName(raw: string): ShipNameValidationResult {
  if (typeof raw !== 'string') {
    return { ok: false, reason: '이름은 문자열이어야 합니다.' };
  }
  // Strip ASCII control characters & collapse newlines to spaces (plain text only)
  const cleaned = raw.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (cleaned.length === 0) {
    return { ok: true, value: '', cleared: true };
  }
  const chars = Array.from(cleaned);
  if (chars.length > MAX_SHIP_NAME_LENGTH) {
    return {
      ok: false,
      reason: `선박 이름은 최대 ${MAX_SHIP_NAME_LENGTH}자까지 입력할 수 있습니다.`,
    };
  }
  return { ok: true, value: cleaned, cleared: false };
}

/**
 * Normalizes any angle in degrees into [0, 360).
 */
export function normalizeDegrees(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  const mod = ((deg % 360) + 360) % 360;
  return Math.round(mod * 100) / 100;
}

/**
 * Steps yaw by +15° or -15° (Q/E keyboard control).
 */
export function stepShipYawDegrees(currentDeg: number, deltaSteps: number): number {
  const snapped = Math.round(currentDeg / ROTATION_STEP_DEG) * ROTATION_STEP_DEG;
  return normalizeDegrees(snapped + deltaSteps * ROTATION_STEP_DEG);
}

/**
 * Computes the parallel-to-nearest-quay snap heading ("정박 방향 맞추기"):
 * - Ships near West/East pier walls (|x| >= 58 and z <= 48) align North-South (0° or 180°).
 * - Ships facing the North quay wall align East-West (90° or 270°).
 * Chooses whichever parallel heading is closest to `currentDeg` so the ship flips minimally.
 */
export function computeQuayParallelSnapYawDeg(
  centerX: number,
  centerZ: number,
  currentDeg: number,
): number {
  const nearSidePier = Math.abs(centerX) >= 58 && centerZ <= 52;
  const candidates = nearSidePier ? [0, 180] : [90, 270];
  const cur = normalizeDegrees(currentDeg);

  let best = candidates[0];
  let bestDelta = 360;
  for (const cand of candidates) {
    const rawDiff = Math.abs(cur - cand);
    const angularDiff = Math.min(rawDiff, 360 - rawDiff);
    if (angularDiff < bestDelta) {
      bestDelta = angularDiff;
      best = cand;
    }
  }
  return best;
}

interface Vec2 {
  x: number;
  z: number;
}

function getObbCorners(box: ShipFootprintCollider): Vec2[] {
  // In Three.js, rotation.y = yawRad rotates local -Z (bow) toward (-sin(yaw), -cos(yaw))
  // Local +X (beam) rotates toward (cos(yaw), -sin(yaw))
  const rad = (box.yawDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const axisX = { x: cos, z: -sin }; // local +X (beam)
  const axisZ = { x: sin, z: cos };  // local +Z (length)

  const bx = axisX.x * box.halfBeam;
  const bz = axisX.z * box.halfBeam;
  const lx = axisZ.x * box.halfLength;
  const lz = axisZ.z * box.halfLength;

  return [
    { x: box.centerX + bx + lx, z: box.centerZ + bz + lz },
    { x: box.centerX - bx + lx, z: box.centerZ - bz + lz },
    { x: box.centerX - bx - lx, z: box.centerZ - bz - lz },
    { x: box.centerX + bx - lx, z: box.centerZ + bz - lz },
  ];
}

function getRectCorners(rect: StaticObstacleRect): Vec2[] {
  return [
    { x: rect.minX, z: rect.minZ },
    { x: rect.maxX, z: rect.minZ },
    { x: rect.maxX, z: rect.maxZ },
    { x: rect.minX, z: rect.maxZ },
  ];
}

function getPolygonAxes(corners: Vec2[]): Vec2[] {
  const axes: Vec2[] = [];
  for (let i = 0; i < 2; i += 1) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    const ex = b.x - a.x;
    const ez = b.z - a.z;
    const len = Math.hypot(ex, ez);
    if (len > 1e-6) {
      axes.push({ x: -ez / len, z: ex / len });
    }
  }
  return axes;
}

function projectPolygon(corners: Vec2[], axis: Vec2): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const c of corners) {
    const p = c.x * axis.x + c.z * axis.z;
    if (p < min) min = p;
    if (p > max) max = p;
  }
  return { min, max };
}

/**
 * 2D Separating Axis Theorem (SAT) overlap test for convex polygons (OBB vs OBB / OBB vs AABB).
 */
export function polygonsOverlap2D(a: Vec2[], b: Vec2[], padding = 0): boolean {
  const axes = [...getPolygonAxes(a), ...getPolygonAxes(b)];
  for (const axis of axes) {
    const pa = projectPolygon(a, axis);
    const pb = projectPolygon(b, axis);
    if (pa.max + padding < pb.min || pb.max + padding < pa.min) {
      return false;
    }
  }
  return true;
}

/**
 * Static harbor solid walls (North Quay, West Pier, East Pier) that rotating ships must never collide with.
 */
export const HARBOR_MARINE_STRUCTURE_COLLIDERS: readonly StaticObstacleRect[] = [
  { id: 'north_quay', minX: -94.2, maxX: 94.2, minZ: -48.5, maxZ: -2.0 },
  { id: 'west_pier', minX: -94.2, maxX: -74.5, minZ: -2.5, maxZ: 38.0 },
  { id: 'east_pier', minX: 74.5, maxX: 94.2, minZ: -2.5, maxZ: 38.0 },
];

export interface RotationCollisionCheckResult {
  ok: boolean;
  collidedWithId: string | null;
  reason: string;
}

/**
 * Checks whether rotating `candidate` to `nextYawDeg` collides with any quay/pier structure
 * or any other ship / floating dock footprint.
 */
export function checkShipRotationCollision(
  candidate: ShipFootprintCollider,
  nextYawDeg: number,
  otherShips: readonly ShipFootprintCollider[],
  staticStructures: readonly StaticObstacleRect[] = HARBOR_MARINE_STRUCTURE_COLLIDERS,
  clearanceMeters = 0.8,
): RotationCollisionCheckResult {
  const rotated: ShipFootprintCollider = {
    ...candidate,
    yawDeg: normalizeDegrees(nextYawDeg),
  };
  const candCorners = getObbCorners(rotated);

  for (const wall of staticStructures) {
    if (polygonsOverlap2D(candCorners, getRectCorners(wall), clearanceMeters)) {
      return {
        ok: false,
        collidedWithId: wall.id,
        reason: '안벽 또는 부두 구조물과 겹쳐 회전할 수 없습니다. 원래 방향으로 되돌립니다.',
      };
    }
  }

  for (const other of otherShips) {
    if (other.id === candidate.id) continue;
    if (polygonsOverlap2D(candCorners, getObbCorners(other), clearanceMeters)) {
      return {
        ok: false,
        collidedWithId: other.id,
        reason: '다른 선박 또는 플로팅 도크와 겹쳐 회전할 수 없습니다. 원래 방향으로 되돌립니다.',
      };
    }
  }

  return { ok: true, collidedWithId: null, reason: '' };
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

function getSafeStorage(explicit?: StorageLike | null): StorageLike | null {
  if (explicit !== undefined) return explicit;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

export function loadShipDisplayPrefs(storageOverride?: StorageLike | null): ShipDisplayPrefsMap {
  const store = getSafeStorage(storageOverride);
  if (!store) return {};
  try {
    const raw = store.getItem(SHIP_DISPLAY_PREFS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: ShipDisplayPrefsMap = {};
    for (const [id, entry] of Object.entries(parsed as Record<string, unknown>)) {
      if (!id || !entry || typeof entry !== 'object') continue;
      const rec = entry as Record<string, unknown>;
      const cleanEntry: ShipDisplayPrefEntry = {};
      if (typeof rec.customName === 'string') {
        const v = validateShipDisplayName(rec.customName);
        if (v.ok && !v.cleared) {
          cleanEntry.customName = v.value;
        }
      }
      if (typeof rec.yawDeg === 'number' && Number.isFinite(rec.yawDeg)) {
        cleanEntry.yawDeg = normalizeDegrees(rec.yawDeg);
      }
      if (typeof rec.vesselAssetId === 'string' && /^[a-z0-9_]{2,40}$/.test(rec.vesselAssetId.trim())) {
        cleanEntry.vesselAssetId = rec.vesselAssetId.trim();
      }
      if (
        cleanEntry.customName !== undefined ||
        cleanEntry.yawDeg !== undefined ||
        cleanEntry.vesselAssetId !== undefined
      ) {
        out[id] = cleanEntry;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function saveShipDisplayPrefs(
  prefs: ShipDisplayPrefsMap,
  storageOverride?: StorageLike | null,
): boolean {
  const store = getSafeStorage(storageOverride);
  if (!store) return false;
  try {
    store.setItem(SHIP_DISPLAY_PREFS_STORAGE_KEY, JSON.stringify(prefs));
    return true;
  } catch {
    return false;
  }
}

export function applyShipCustomName(
  prefs: ShipDisplayPrefsMap,
  shipId: string,
  rawName: string,
): { ok: true; next: ShipDisplayPrefsMap; cleared: boolean } | { ok: false; reason: string } {
  const check = validateShipDisplayName(rawName);
  if (!check.ok) return check;

  const next: ShipDisplayPrefsMap = { ...prefs };
  const existing = next[shipId] ? { ...next[shipId] } : {};

  if (check.cleared) {
    delete existing.customName;
  } else {
    existing.customName = check.value;
  }

  if (
    existing.customName === undefined &&
    existing.yawDeg === undefined &&
    existing.vesselAssetId === undefined
  ) {
    delete next[shipId];
  } else {
    next[shipId] = existing;
  }

  return { ok: true, next, cleared: check.cleared };
}

export function applyShipCustomYaw(
  prefs: ShipDisplayPrefsMap,
  shipId: string,
  yawDeg: number | null,
): ShipDisplayPrefsMap {
  const next: ShipDisplayPrefsMap = { ...prefs };
  const existing = next[shipId] ? { ...next[shipId] } : {};

  if (yawDeg === null || !Number.isFinite(yawDeg)) {
    delete existing.yawDeg;
  } else {
    existing.yawDeg = normalizeDegrees(yawDeg);
  }

  if (
    existing.customName === undefined &&
    existing.yawDeg === undefined &&
    existing.vesselAssetId === undefined
  ) {
    delete next[shipId];
  } else {
    next[shipId] = existing;
  }

  return next;
}

export function applyShipVesselAsset(
  prefs: ShipDisplayPrefsMap,
  shipId: string,
  vesselAssetId: string | null,
): ShipDisplayPrefsMap {
  const next: ShipDisplayPrefsMap = { ...prefs };
  const existing = next[shipId] ? { ...next[shipId] } : {};

  if (!vesselAssetId || !/^[a-z0-9_]{2,40}$/.test(vesselAssetId.trim())) {
    delete existing.vesselAssetId;
  } else {
    existing.vesselAssetId = vesselAssetId.trim();
  }

  if (
    existing.customName === undefined &&
    existing.yawDeg === undefined &&
    existing.vesselAssetId === undefined
  ) {
    delete next[shipId];
  } else {
    next[shipId] = existing;
  }

  return next;
}

export function loadSavedShipAssets(storageOverride?: StorageLike | null): SavedShipAssetRecord[] {
  const store = getSafeStorage(storageOverride);
  if (!store) return [];
  try {
    const raw = store.getItem(SHIP_ASSETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: SavedShipAssetRecord[] = [];
    const seen = new Set<string>();
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const r = item as Record<string, unknown>;
      const assetId = typeof r.assetId === 'string' ? r.assetId.trim() : '';
      const name = typeof r.name === 'string' ? r.name.trim() : '';
      const vesselType = typeof r.vesselType === 'string' ? r.vesselType.trim() : '';
      if (!assetId || !name || !vesselType || seen.has(assetId)) continue;
      seen.add(assetId);
      const sourceKind =
        r.sourceKind === 'builtin' ||
        r.sourceKind === 'project' ||
        r.sourceKind === 'decorative' ||
        r.sourceKind === 'custom'
          ? r.sourceKind
          : 'custom';
      out.push({
        assetId,
        name: name.slice(0, MAX_SHIP_NAME_LENGTH + 8),
        vesselType,
        defaultYawDeg:
          typeof r.defaultYawDeg === 'number' && Number.isFinite(r.defaultYawDeg)
            ? normalizeDegrees(r.defaultYawDeg)
            : 90,
        sourceShipId: typeof r.sourceShipId === 'string' ? r.sourceShipId.trim() : undefined,
        sourceKind,
        note: typeof r.note === 'string' ? r.note.trim().slice(0, 120) : undefined,
        savedAt: typeof r.savedAt === 'string' ? r.savedAt.trim().slice(0, 32) : '2026-11-28',
      });
    }
    return out;
  } catch {
    return [];
  }
}

export function saveSavedShipAssets(
  assets: readonly SavedShipAssetRecord[],
  storageOverride?: StorageLike | null,
): boolean {
  const store = getSafeStorage(storageOverride);
  if (!store) return false;
  try {
    store.setItem(SHIP_ASSETS_STORAGE_KEY, JSON.stringify(assets));
    return true;
  } catch {
    return false;
  }
}

export function loadAddedProjectShips(storageOverride?: StorageLike | null): AddedProjectShipRecord[] {
  const store = getSafeStorage(storageOverride);
  if (!store) return [];
  try {
    const raw = store.getItem(ADDED_PROJECTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: AddedProjectShipRecord[] = [];
    const seen = new Set<string>();
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const r = item as Record<string, unknown>;
      const id = typeof r.id === 'string' ? r.id.trim() : '';
      const name = typeof r.name === 'string' ? r.name.trim() : '';
      const vesselType = typeof r.vesselType === 'string' ? r.vesselType.trim() : '';
      if (!id || !name || !vesselType || seen.has(id)) continue;
      seen.add(id);
      out.push({
        id,
        code: typeof r.code === 'string' && r.code.trim() ? r.code.trim().slice(0, 24) : id,
        name: name.slice(0, MAX_SHIP_NAME_LENGTH),
        role: typeof r.role === 'string' && r.role.trim() ? r.role.trim().slice(0, 24) : 'manager',
        status: typeof r.status === 'string' && r.status.trim() ? r.status.trim().slice(0, 24) : 'active',
        updated_at:
          typeof r.updated_at === 'string' && r.updated_at.trim()
            ? r.updated_at.trim().slice(0, 24)
            : '2026-11-28',
        vesselType,
        assetId: typeof r.assetId === 'string' ? r.assetId.trim() : `asset-builtin-${vesselType}`,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export function saveAddedProjectShips(
  records: readonly AddedProjectShipRecord[],
  storageOverride?: StorageLike | null,
): boolean {
  const store = getSafeStorage(storageOverride);
  if (!store) return false;
  try {
    store.setItem(ADDED_PROJECTS_STORAGE_KEY, JSON.stringify(records));
    return true;
  } catch {
    return false;
  }
}
