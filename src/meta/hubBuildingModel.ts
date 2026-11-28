/**
 * Deterministic 3D Harbor Building layout & visual appearance model for `/api/meta/*` Hub modules (Stage 8).
 *
 * Pure module (zero Three.js / DOM dependencies) so layout determinism, collision footprints,
 * and status-driven visual appearances (`planned` scaffolding vs `active` lit windows)
 * can be unit-tested directly and shared across 3D scene, minimap, and UI cards.
 *
 * DESIGN INVARIANTS:
 *   - Existing SGW Portal Pavilions (`talk`, `nas`, `bmail`, `admin`) and docked SEDMS project ships
 *     remain 100% untouched.
 *   - `s360`, `secad`, `pdf`, `mail` (plus `secms` and ANY newly registered module in `/api/meta/registry`)
 *     are placed onto collision-free quay/pier building lots without modifying UI or scene code.
 *   - Slot assignment is strictly deterministic per `moduleId` (independent of server array order).
 */

import type { ObstacleBox2D } from '../core/navMeshEngine';
import type { HubModuleChipItem } from './hubChipModel';
import { getMetaModuleStatusLabel, type MetaModuleId, type MetaModuleStatus } from './hubTypes';

export type HubBuildingArchetype =
  | 'control-tower'
  | 'engineering-hall'
  | 'warehouse'
  | 'comms-hub';

export interface HubBuildingLotSpec {
  lotId: string;
  labelKo: string;
  centerX: number;
  centerZ: number;
  width: number;
  depth: number;
  /** Y-axis rotation in radians (`0` faces +Z south toward the harbor water). */
  facingYaw: number;
  archetype: HubBuildingArchetype;
}

export interface HubBuildingAppearance {
  status: MetaModuleStatus;
  statusLabel: string;
  /** True strictly when `status === 'planned'` — mounts 3D steel scaffolding + cones + barrier. */
  hasScaffolding: boolean;
  /** True for operational normal states (`active` / `warn` / `idle`) — illuminates interior windows & cornice. */
  lightsOn: boolean;
  /** Concise signboard banner text (`"준비 중"` for planned, `"정상 운영"` for active, etc.). */
  signBannerText: string;
  accentHex: string;
  beaconColorHex: number;
  windowEmissiveIntensity: number;
  wallColorHex: number;
  roofColorHex: number;
}

export interface HubBuildingPlacement {
  moduleId: MetaModuleId;
  chip: HubModuleChipItem;
  lot: HubBuildingLotSpec;
  archetype: HubBuildingArchetype;
  appearance: HubBuildingAppearance;
}

/**
 * Modules already represented by dedicated core harbor landmarks:
 *   - `sgw` -> existing 4 SGW Portal Pavilions (SGTALK / SGW NAS / bmail / SGW 관리)
 *   - `sedms` -> docked SEDMS business project ships
 * All other registry modules (`s360`, `secad`, `pdf`, `mail`, `secms`, and any future system)
 * automatically receive a 3D harbor building on an empty lot.
 */
export const HUB_BUILDING_EXCLUDED_MODULE_IDS: ReadonlySet<string> = new Set([
  'sgw',
  'sedms',
]);

/**
 * 13 pre-validated, collision-free Harbor Building Lots on North Quay & Outfitting Piers.
 * Every footprint maintains clear setbacks from:
 *   - Existing 4 PORTAL_BUILDINGS (`x in [-42..42], z in [-30.5..-21.5]`)
 *   - Twin Goliath Crane bogies (`x in [-50.5..-37.5]` & `[37.5..50.5], z in [-44..-35]`)
 *   - Yard Container Stacks (`x in [-70..-54]` & `[54..70], z in [-36.2..-28.8]`)
 *   - Planter Trees, Quay Benches (`z = -5.8`), Streetlights, and Pier Lighthouses (`z = 34.5`).
 */
export const HUB_BUILDING_LOTS: readonly HubBuildingLotSpec[] = [
  // Slots 0..4: Prime Harbor Boulevard & Waterfront Wing Lots
  {
    lotId: 'lot-west-wing',
    labelKo: '서측 안벽 관제 구역',
    centerX: -81.0,
    centerZ: -22.5,
    width: 10.6,
    depth: 7.8,
    facingYaw: 0,
    archetype: 'control-tower',
  },
  {
    lotId: 'lot-east-wing',
    labelKo: '동측 안벽 설계 구역',
    centerX: 81.0,
    centerZ: -22.5,
    width: 10.6,
    depth: 7.8,
    facingYaw: 0,
    archetype: 'engineering-hall',
  },
  {
    lotId: 'lot-center-west',
    labelKo: '중앙 서편 창고 구역',
    centerX: -22.0,
    centerZ: -40.5,
    width: 10.6,
    depth: 7.8,
    facingYaw: 0,
    archetype: 'warehouse',
  },
  {
    lotId: 'lot-center-east',
    labelKo: '중앙 동편 통신·관제 구역',
    centerX: 22.0,
    centerZ: -40.5,
    width: 10.6,
    depth: 7.8,
    facingYaw: 0,
    archetype: 'comms-hub',
  },
  {
    lotId: 'lot-center-mid',
    labelKo: '중앙 후면 지원동 구역',
    centerX: 0.0,
    centerZ: -40.5,
    width: 10.6,
    depth: 7.8,
    facingYaw: 0,
    archetype: 'warehouse',
  },
  // Slots 5..12: Empty Expansion Lots (auto-allocated to newly added registry modules)
  {
    lotId: 'lot-west-rear',
    labelKo: '서측 후면 확장 부지 A',
    centerX: -81.0,
    centerZ: -39.5,
    width: 10.6,
    depth: 7.8,
    facingYaw: 0,
    archetype: 'warehouse',
  },
  {
    lotId: 'lot-east-rear',
    labelKo: '동측 후면 확장 부지 B',
    centerX: 81.0,
    centerZ: -39.5,
    width: 10.6,
    depth: 7.8,
    facingYaw: 0,
    archetype: 'control-tower',
  },
  {
    lotId: 'lot-west-apron',
    labelKo: '서측 크레인 옆 확장 부지 C',
    centerX: -62.0,
    centerZ: -42.0,
    width: 10.0,
    depth: 7.2,
    facingYaw: 0,
    archetype: 'engineering-hall',
  },
  {
    lotId: 'lot-east-apron',
    labelKo: '동측 크레인 옆 확장 부지 D',
    centerX: 62.0,
    centerZ: -42.0,
    width: 10.0,
    depth: 7.2,
    facingYaw: 0,
    archetype: 'comms-hub',
  },
  {
    lotId: 'lot-west-pier',
    labelKo: '서측 의장 부두 확장 부지 E',
    centerX: -86.0,
    centerZ: 19.5,
    width: 8.4,
    depth: 7.6,
    facingYaw: Math.PI / 2,
    archetype: 'warehouse',
  },
  {
    lotId: 'lot-east-pier',
    labelKo: '동측 의장 부두 확장 부지 F',
    centerX: 86.0,
    centerZ: 19.5,
    width: 8.4,
    depth: 7.6,
    facingYaw: -Math.PI / 2,
    archetype: 'control-tower',
  },
  {
    lotId: 'lot-west-front-wing',
    labelKo: '서측 전면 안벽 확장 부지 G',
    centerX: -81.0,
    centerZ: -10.5,
    width: 9.6,
    depth: 6.8,
    facingYaw: 0,
    archetype: 'comms-hub',
  },
  {
    lotId: 'lot-east-front-wing',
    labelKo: '동측 전면 안벽 확장 부지 H',
    centerX: 81.0,
    centerZ: -10.5,
    width: 9.6,
    depth: 6.8,
    facingYaw: 0,
    archetype: 'warehouse',
  },
];

const PREFERRED_SLOT_BY_MODULE_ID: Readonly<Record<string, { lotIndex: number; archetype: HubBuildingArchetype }>> = {
  s360: { lotIndex: 0, archetype: 'control-tower' },
  secad: { lotIndex: 1, archetype: 'engineering-hall' },
  pdf: { lotIndex: 2, archetype: 'warehouse' },
  mail: { lotIndex: 3, archetype: 'comms-hub' },
  secms: { lotIndex: 4, archetype: 'warehouse' },
};

const ARCHETYPE_CYCLE: readonly HubBuildingArchetype[] = [
  'warehouse',
  'control-tower',
  'engineering-hall',
  'comms-hub',
];

/**
 * Deterministic 32-bit FNV-1a hash used to map any newly added `moduleId`
 * to a stable empty harbor building lot without modifying frontend code.
 */
export function hashModuleIdDeterministic(moduleId: string): number {
  let hash = 2166136261;
  const normalized = moduleId.trim().toLowerCase();
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Derives honest 3D building appearance from `/api/meta/registry` + `/api/meta/hub/summary` status:
 *   - `planned`: 3D construction scaffolding + `"준비 중"` signboard + unlit facade
 *   - `active`: warm illuminated windows + bright operational roof strip + emerald beacon
 *   - `warn`: illuminated windows + amber caution beacon
 *   - `idle`: low standby illumination + sky-blue beacon
 *   - `nosource`: dimmed standby building + `"원천 없음"` sign
 *   - `unavailable`: dimmed building + rose fault beacon + `"일시 오류"` sign
 */
export function resolveHubBuildingAppearance(status: MetaModuleStatus): HubBuildingAppearance {
  const statusLabel = getMetaModuleStatusLabel(status);
  switch (status) {
    case 'planned':
      return {
        status,
        statusLabel,
        hasScaffolding: true,
        lightsOn: false,
        signBannerText: '준비 중',
        accentHex: '#f59e0b',
        beaconColorHex: 0xf59e0b,
        windowEmissiveIntensity: 0,
        wallColorHex: 0x8795a6,
        roofColorHex: 0x475569,
      };
    case 'active':
      return {
        status,
        statusLabel,
        hasScaffolding: false,
        lightsOn: true,
        signBannerText: '운영 중',
        accentHex: '#10b981',
        beaconColorHex: 0x34d399,
        windowEmissiveIntensity: 0.72,
        wallColorHex: 0xcbd5e1,
        roofColorHex: 0x0f766e,
      };
    case 'warn':
      return {
        status,
        statusLabel,
        hasScaffolding: false,
        lightsOn: true,
        signBannerText: '주의',
        accentHex: '#f59e0b',
        beaconColorHex: 0xf59e0b,
        windowEmissiveIntensity: 0.58,
        wallColorHex: 0xcbd5e1,
        roofColorHex: 0xb45309,
      };
    case 'idle':
      return {
        status,
        statusLabel,
        hasScaffolding: false,
        lightsOn: true,
        signBannerText: '대기',
        accentHex: '#38bdf8',
        beaconColorHex: 0x38bdf8,
        windowEmissiveIntensity: 0.28,
        wallColorHex: 0xbac6d4,
        roofColorHex: 0x1e3a5f,
      };
    case 'nosource':
      return {
        status,
        statusLabel,
        hasScaffolding: false,
        lightsOn: false,
        signBannerText: '원천 없음',
        accentHex: '#64748b',
        beaconColorHex: 0x64748b,
        windowEmissiveIntensity: 0.03,
        wallColorHex: 0x94a3b8,
        roofColorHex: 0x334155,
      };
    case 'unavailable':
      return {
        status,
        statusLabel,
        hasScaffolding: false,
        lightsOn: false,
        signBannerText: '일시 오류',
        accentHex: '#f43f5e',
        beaconColorHex: 0xf43f5e,
        windowEmissiveIntensity: 0.04,
        wallColorHex: 0x94a3b8,
        roofColorHex: 0x881337,
      };
  }
}

function createOverflowRearLot(overflowIndex: number, moduleId: string): HubBuildingLotSpec {
  const hash = hashModuleIdDeterministic(moduleId);
  const side = overflowIndex % 2 === 0 ? -1 : 1;
  const tier = Math.floor(overflowIndex / 2);
  const centerX = side * (22 + tier * 16);
  const centerZ = -56.0;
  return {
    lotId: `lot-overflow-${overflowIndex}`,
    labelKo: `후면 확장 부지 #${overflowIndex + 1}`,
    centerX,
    centerZ,
    width: 10.0,
    depth: 7.4,
    facingYaw: 0,
    archetype: ARCHETYPE_CYCLE[hash % ARCHETYPE_CYCLE.length],
  };
}

/**
 * Deterministically assigns each eligible Hub module chip to a unique harbor building lot.
 *
 * Guarantees:
 *   1. `sgw` and `sedms` are skipped (existing portal buildings & SEDMS ships stay untouched).
 *   2. Known core systems (`s360`, `secad`, `pdf`, `mail`, `secms`) claim their dedicated prime lots.
 *   3. Any unknown/new `moduleId` added dynamically by `/api/meta/registry` is hashed deterministically
 *      (sorted by `moduleId` so server array ordering never shifts building positions) into an empty lot.
 */
export function assignHubBuildingSlots(
  chips: readonly HubModuleChipItem[],
  lots: readonly HubBuildingLotSpec[] = HUB_BUILDING_LOTS,
): HubBuildingPlacement[] {
  const eligibleById = new Map<string, HubModuleChipItem>();
  for (const chip of chips) {
    const key = chip.moduleId.trim();
    if (!key || HUB_BUILDING_EXCLUDED_MODULE_IDS.has(key)) continue;
    if (!eligibleById.has(key)) {
      eligibleById.set(key, chip);
    }
  }

  const occupied = new Set<number>();
  const placementsById = new Map<string, HubBuildingPlacement>();

  // Pass 1: Preferred prime lots for known systems (deterministic order)
  const preferredKeys = Object.keys(PREFERRED_SLOT_BY_MODULE_ID).sort();
  for (const modId of preferredKeys) {
    const chip = eligibleById.get(modId);
    if (!chip) continue;
    const pref = PREFERRED_SLOT_BY_MODULE_ID[modId];
    if (pref.lotIndex < lots.length && !occupied.has(pref.lotIndex)) {
      occupied.add(pref.lotIndex);
      const lot = lots[pref.lotIndex];
      placementsById.set(modId, {
        moduleId: chip.moduleId,
        chip,
        lot,
        archetype: pref.archetype,
        appearance: resolveHubBuildingAppearance(chip.status),
      });
    }
  }

  // Pass 2: Any newly added / remaining modules hashed deterministically into free lots
  const remainingIds = Array.from(eligibleById.keys())
    .filter((id) => !placementsById.has(id))
    .sort((a, b) => a.localeCompare(b));

  let overflowIdx = 0;
  for (const modId of remainingIds) {
    const chip = eligibleById.get(modId)!;
    const hash = hashModuleIdDeterministic(modId);
    let assignedLot: HubBuildingLotSpec | null = null;

    if (lots.length > 0 && occupied.size < lots.length) {
      const start = hash % lots.length;
      for (let probe = 0; probe < lots.length; probe += 1) {
        const candidateIdx = (start + probe) % lots.length;
        if (!occupied.has(candidateIdx)) {
          occupied.add(candidateIdx);
          assignedLot = lots[candidateIdx];
          break;
        }
      }
    }

    if (!assignedLot) {
      assignedLot = createOverflowRearLot(overflowIdx, modId);
      overflowIdx += 1;
    }

    placementsById.set(modId, {
      moduleId: chip.moduleId,
      chip,
      lot: assignedLot,
      archetype: assignedLot.archetype,
      appearance: resolveHubBuildingAppearance(chip.status),
    });
  }

  // Preserve registry order in returned array while keeping deterministic lot assignments
  const ordered: HubBuildingPlacement[] = [];
  for (const chip of chips) {
    const placed = placementsById.get(chip.moduleId.trim());
    if (placed) {
      ordered.push(placed);
      placementsById.delete(chip.moduleId.trim());
    }
  }
  return ordered;
}

/**
 * Generates 2D AABB colliders for all placed Hub buildings (accounts for 90° pier rotation
 * and extra clearance when construction scaffolding is mounted).
 */
export function buildHubBuildingColliders(
  placements: readonly HubBuildingPlacement[],
): ObstacleBox2D[] {
  return placements.map((p) => {
    const rotated = Math.abs(Math.sin(p.lot.facingYaw)) > 0.7;
    const halfX = (rotated ? p.lot.depth : p.lot.width) * 0.5;
    const halfZ = (rotated ? p.lot.width : p.lot.depth) * 0.5;
    // Planned scaffolding extends +0.48m around poles and +0.99m at front barrier/cones
    const pad = p.appearance.hasScaffolding ? 1.05 : 0.25;
    return {
      id: `hub_building_${p.moduleId}`,
      minX: p.lot.centerX - halfX - pad,
      maxX: p.lot.centerX + halfX + pad,
      minZ: p.lot.centerZ - halfZ - pad,
      maxZ: p.lot.centerZ + halfZ + pad,
    };
  });
}
