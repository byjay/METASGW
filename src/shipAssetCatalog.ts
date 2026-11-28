/**
 * Reusable Harbor Ship Asset Library & Project Conversion Engine.
 *
 * Allows saving EVERY ship in the harbor (all 13 built-in 3D naval archetypes,
 * business project ships, and decorative showcase vessels) as reusable assets
 * and adding any saved asset directly as a new harbor project ship.
 */

import { isValidProjectId } from './deepLink';
import type { HarborShip } from './mapping';
import type { DecorativeVesselSpec, DecorativeVesselType } from './scene/sceneryCatalog';
import { VESSEL_SILHOUETTE_IDS, type VesselSilhouetteId } from './scene/projectVesselTypes';
import {
  normalizeDegrees,
  validateShipDisplayName,
  type AddedProjectShipRecord,
  type SavedShipAssetRecord,
  type ShipDisplayPrefsMap,
} from './shipDisplayPrefs';

export interface BuiltinShipAssetMeta {
  vesselType: VesselSilhouetteId;
  labelKo: string;
  categoryKo: string;
  summaryKo: string;
  defaultYawDeg: number;
}

export const BUILTIN_SHIP_ASSET_CATALOG: readonly BuiltinShipAssetMeta[] = [
  {
    vesselType: 'lng_carrier',
    labelKo: 'LNG 운반선',
    categoryKo: '가스선',
    summaryKo: '모스/멤브레인 화물창 대형 LNG 운반선',
    defaultYawDeg: 90,
  },
  {
    vesselType: 'container_ship',
    labelKo: '컨테이너선',
    categoryKo: '상선',
    summaryKo: '다단 컨테이너 적재 대형 선박',
    defaultYawDeg: 90,
  },
  {
    vesselType: 'vlcc_tanker',
    labelKo: 'VLCC 원유운반선',
    categoryKo: '탱커',
    summaryKo: '갑판 배관·매니폴드 탑재 대형 유조선',
    defaultYawDeg: 90,
  },
  {
    vesselType: 'bulk_carrier',
    labelKo: '벌크 화물선',
    categoryKo: '상선',
    summaryKo: '해치 커버·갑판 크레인 탑재 살물선',
    defaultYawDeg: 90,
  },
  {
    vesselType: 'seastar_flagship',
    labelKo: '씨스타 기함 (플래그십)',
    categoryKo: '대표 선박',
    summaryKo: '화이트 선체·로열 블루 스트라이프 대표선',
    defaultYawDeg: 90,
  },
  {
    vesselType: 'floating_dock',
    labelKo: '대형 플로팅 도크',
    categoryKo: '도크/특수',
    summaryKo: '양측 윙월·도크 크레인 장착 부유식 도크',
    defaultYawDeg: 270,
  },
  {
    vesselType: 'wtiv_jackup',
    labelKo: '해상풍력 설치선 (WTIV)',
    categoryKo: '해양플랜트',
    summaryKo: '4각 잭업 레그·대형 붐 크레인 설치선',
    defaultYawDeg: 90,
  },
  {
    vesselType: 'fpso_offshore',
    labelKo: '해양플랜트 FPSO',
    categoryKo: '해양플랜트',
    summaryKo: '상부 공정 모듈·플레어 타워 탑재 부유식 생산설비',
    defaultYawDeg: 90,
  },
  {
    vesselType: 'cruise_liner',
    labelKo: '대형 크루즈 여객선',
    categoryKo: '여객선',
    summaryKo: '다층 객실 데크·전망 라운지 여객선',
    defaultYawDeg: 90,
  },
  {
    vesselType: 'roro_car_carrier',
    labelKo: '자동차 운반선 (PCTC)',
    categoryKo: '상선',
    summaryKo: '하이 프리보드 박스형 차량 운반선',
    defaultYawDeg: 90,
  },
  {
    vesselType: 'icebreaker_research',
    labelKo: '극지 쇄빙 연구선',
    categoryKo: '특수선',
    summaryKo: '헬리데크·관측 마스트 장착 쇄빙 연구선',
    defaultYawDeg: 90,
  },
  {
    vesselType: 'naval_vessel',
    labelKo: '해양 경비·특수함',
    categoryKo: '특수선',
    summaryKo: '스텔스 상부구조·레이더 마스트 특수선',
    defaultYawDeg: 90,
  },
  {
    vesselType: 'harbor_tug',
    labelKo: '항만 예인선',
    categoryKo: '작업선',
    summaryKo: '강력 펜더·조타실 장착 항만 지원 작업선',
    defaultYawDeg: 45,
  },
];

const VALID_VESSEL_SET = new Set<string>(VESSEL_SILHOUETTE_IDS);

export function isValidVesselSilhouetteId(value: string): value is VesselSilhouetteId {
  return VALID_VESSEL_SET.has(value);
}

export function getVesselAssetMeta(vesselType: string): BuiltinShipAssetMeta {
  return (
    BUILTIN_SHIP_ASSET_CATALOG.find((item) => item.vesselType === vesselType) ??
    BUILTIN_SHIP_ASSET_CATALOG[0]
  );
}

/**
 * Returns default built-in ship assets (13 naval archetypes) so the library is never empty.
 */
export function buildDefaultBuiltinShipAssets(): SavedShipAssetRecord[] {
  return BUILTIN_SHIP_ASSET_CATALOG.map((meta) => ({
    assetId: `asset-builtin-${meta.vesselType}`,
    name: meta.labelKo,
    vesselType: meta.vesselType,
    defaultYawDeg: meta.defaultYawDeg,
    sourceKind: 'builtin',
    note: meta.summaryKo,
    savedAt: '2026-11-28',
  }));
}

/**
 * Merges built-in archetypes with user/admin-saved harbor ship assets (deduplicated by assetId).
 */
export function mergeShipAssetLibrary(
  savedAssets: readonly SavedShipAssetRecord[],
): SavedShipAssetRecord[] {
  const map = new Map<string, SavedShipAssetRecord>();
  for (const builtin of buildDefaultBuiltinShipAssets()) {
    map.set(builtin.assetId, builtin);
  }
  for (const saved of savedAssets) {
    if (!saved.assetId || !isValidVesselSilhouetteId(saved.vesselType)) continue;
    map.set(saved.assetId, saved);
  }
  return Array.from(map.values());
}

/**
 * Resolves the effective 3D vessel silhouette for a business project ship.
 */
export function resolveProjectShipSilhouette(
  shipId: string,
  hullStyleIndex: number,
  prefs?: ShipDisplayPrefsMap,
  addedProjectShips?: readonly AddedProjectShipRecord[],
): VesselSilhouetteId {
  const prefType = prefs?.[shipId]?.vesselAssetId;
  if (prefType && isValidVesselSilhouetteId(prefType)) {
    return prefType;
  }
  const added = addedProjectShips?.find((p) => p.id === shipId);
  if (added && isValidVesselSilhouetteId(added.vesselType)) {
    return added.vesselType;
  }
  const primaryOrder: VesselSilhouetteId[] = [
    'lng_carrier',
    'container_ship',
    'vlcc_tanker',
    'bulk_carrier',
    'wtiv_jackup',
    'fpso_offshore',
    'cruise_liner',
    'roro_car_carrier',
    'icebreaker_research',
    'naval_vessel',
  ];
  return primaryOrder[Math.abs(hullStyleIndex) % primaryOrder.length];
}

/**
 * Captures a single harbor project ship or decorative ship as a reusable Ship Asset.
 */
export function createAssetRecordFromShip(input: {
  sourceShipId: string;
  sourceKind: 'project' | 'decorative';
  name: string;
  vesselType: VesselSilhouetteId | DecorativeVesselType;
  yawDeg: number;
  note?: string;
  nowIsoDate?: string;
}): SavedShipAssetRecord {
  const safeId = input.sourceShipId.replace(/[^A-Za-z0-9_-]/g, '-');
  const validated = validateShipDisplayName(input.name);
  const cleanName = validated.ok && !validated.cleared ? validated.value : input.sourceShipId;
  return {
    assetId: `asset-ship-${safeId}`,
    name: cleanName,
    vesselType: isValidVesselSilhouetteId(input.vesselType) ? input.vesselType : 'lng_carrier',
    defaultYawDeg: normalizeDegrees(input.yawDeg),
    sourceShipId: input.sourceShipId,
    sourceKind: input.sourceKind,
    note: input.note?.trim() || getVesselAssetMeta(input.vesselType).summaryKo,
    savedAt: input.nowIsoDate ?? new Date().toISOString().slice(0, 10),
  };
}

/**
 * Snapshots EVERY ship currently in the harbor (all business project ships + all decorative vessels)
 * into reusable Ship Assets without duplicating existing IDs.
 */
export function saveAllHarborShipsAsAssets(
  existingSaved: readonly SavedShipAssetRecord[],
  projectShips: readonly HarborShip[],
  decorativeShips: readonly DecorativeVesselSpec[],
  prefs: ShipDisplayPrefsMap,
  addedProjects: readonly AddedProjectShipRecord[] = [],
  nowIsoDate?: string,
): { assets: SavedShipAssetRecord[]; newlySavedCount: number; totalSavedCount: number } {
  const byId = new Map<string, SavedShipAssetRecord>();
  for (const item of existingSaved) {
    byId.set(item.assetId, item);
  }

  let newlySavedCount = 0;

  for (const ship of projectShips) {
    const silhouette = resolveProjectShipSilhouette(ship.id, ship.hullStyleIndex, prefs, addedProjects);
    const displayName = prefs[ship.id]?.customName || ship.name || ship.code;
    const yawDeg = prefs[ship.id]?.yawDeg ?? 90;
    const rec = createAssetRecordFromShip({
      sourceShipId: ship.id,
      sourceKind: 'project',
      name: `${displayName} 에셋`,
      vesselType: silhouette,
      yawDeg,
      note: `${ship.code} · ${getVesselAssetMeta(silhouette).labelKo}`,
      nowIsoDate,
    });
    if (!byId.has(rec.assetId)) newlySavedCount += 1;
    byId.set(rec.assetId, rec);
  }

  for (const deco of decorativeShips) {
    const displayName = prefs[deco.id]?.customName || deco.defaultName;
    const yawDeg = prefs[deco.id]?.yawDeg ?? deco.defaultYawDeg;
    const rec = createAssetRecordFromShip({
      sourceShipId: deco.id,
      sourceKind: 'decorative',
      name: displayName,
      vesselType: deco.vesselType,
      yawDeg,
      note: `${deco.subtitle} · ${getVesselAssetMeta(deco.vesselType).labelKo}`,
      nowIsoDate,
    });
    if (!byId.has(rec.assetId)) newlySavedCount += 1;
    byId.set(rec.assetId, rec);
  }

  const assets = Array.from(byId.values());
  return {
    assets,
    newlySavedCount,
    totalSavedCount: assets.length,
  };
}

export interface AddProjectFromAssetInput {
  asset: SavedShipAssetRecord;
  projectId: string;
  projectCode: string;
  projectName: string;
  role?: string;
  status?: 'active' | 'review' | 'hold' | 'completed';
  existingProjectIds: ReadonlySet<string>;
  nowIsoDate?: string;
}

export type AddProjectFromAssetResult =
  | { ok: true; record: AddedProjectShipRecord }
  | { ok: false; reason: string };

/**
 * Validates and builds a new Harbor Project Ship record spawned from a saved Ship Asset.
 */
export function createProjectFromShipAsset(
  input: AddProjectFromAssetInput,
): AddProjectFromAssetResult {
  const cleanId = input.projectId.trim();
  if (!isValidProjectId(cleanId)) {
    return {
      ok: false,
      reason: '프로젝트 ID는 영문/숫자로 시작하는 1~128자(영문, 숫자, ., _, -)만 허용됩니다.',
    };
  }
  if (input.existingProjectIds.has(cleanId)) {
    return {
      ok: false,
      reason: `이미 동일한 프로젝트 ID(${cleanId})가 항구에 정박해 있습니다.`,
    };
  }

  const nameCheck = validateShipDisplayName(input.projectName);
  if (!nameCheck.ok || nameCheck.cleared) {
    return {
      ok: false,
      reason: nameCheck.ok ? '프로젝트 표시 이름을 입력해 주세요.' : nameCheck.reason,
    };
  }

  const codeClean = input.projectCode.trim().toUpperCase().replace(/[^A-Z0-9._-]/g, '-');
  const finalCode = codeClean.length > 0 ? codeClean.slice(0, 24) : cleanId.toUpperCase().slice(0, 24);
  const vesselType = isValidVesselSilhouetteId(input.asset.vesselType)
    ? input.asset.vesselType
    : 'lng_carrier';

  return {
    ok: true,
    record: {
      id: cleanId,
      code: finalCode,
      name: nameCheck.value,
      role: (input.role ?? 'manager').trim() || 'manager',
      status: input.status ?? 'active',
      updated_at: input.nowIsoDate ?? new Date().toISOString().slice(0, 10),
      vesselType,
      assetId: input.asset.assetId,
    },
  };
}
