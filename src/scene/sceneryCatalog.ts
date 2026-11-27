/**
 * Pure Decorative Harbor Scenery Catalog (Requirement #9 & #13).
 *
 * STRICT SEPARATION CONTRACT:
 *   - Every vessel here has `isDecorative: true` and NEVER represents an SEDMS project,
 *     employee, customer, or business record.
 *   - Zero real hull numbers, zero real customer/shipyard identifiers.
 *   - Hero showcase landmarks:
 *       1) "씨스타호" (flagship decorative LNG Carrier moored at West Outfitting Quay)
 *       2) "FD-01" (Monumental Floating Dry Dock with twin wing walls, 2 dock cranes & hull under construction)
 *   - Plus 10+ diverse moored & cruising background vessels (total >= 12 decorative vessels)
 *     to bring the harbor diorama to life cleanly outside the Home Harbor business berths.
 */

export type DecorativeVesselType =
  | 'lng_carrier'
  | 'container_ship'
  | 'floating_dock'
  | 'vlcc_tanker'
  | 'bulk_carrier'
  | 'wtiv_jackup'
  | 'fpso_offshore'
  | 'cruise_liner'
  | 'roro_car_carrier'
  | 'icebreaker_research'
  | 'naval_vessel'
  | 'harbor_tug';

export interface DecorativeVesselSpec {
  id: string;
  isDecorative: true;
  isHero: boolean;
  defaultName: string;
  subtitle: string;
  vesselType: DecorativeVesselType;
  x: number;
  z: number;
  defaultYawDeg: number;
  scale: number;
  halfLength: number;
  halfBeam: number;
  /** Optional cruising motion for distant harbor traffic (amplitude in meters along X). */
  cruise?: {
    speed: number;
    rangeX: number;
  };
}

/**
 * Hero & Home-Harbor decorative vessels (strictly outside the central 2x2 business project basin
 * x in [-74, 74], z in [-2, 68] so business ships never collide with decorative scenery).
 */
export const HOME_HARBOR_DECORATIVE_VESSELS: readonly DecorativeVesselSpec[] = [
  // HERO #1: 씨스타호 — Flagship LNG Carrier along West Outfitting Quay
  {
    id: 'deco-seastar-hero',
    isDecorative: true,
    isHero: true,
    defaultName: '씨스타호',
    subtitle: '대표 LNG 운반선 · 장식 선박',
    vesselType: 'lng_carrier',
    x: -118,
    z: 30,
    defaultYawDeg: 0,
    scale: 1.06,
    halfLength: 27,
    halfBeam: 8.5,
  },
  // HERO #2: FD-01 — Monumental Floating Dry Dock (twin wing walls, 2 dock cranes, hull inside)
  {
    id: 'deco-fd-01',
    isDecorative: true,
    isHero: true,
    defaultName: 'FD-01',
    subtitle: '대형 플로팅 도크 · 장식 선박',
    vesselType: 'floating_dock',
    x: 124,
    z: 36,
    defaultYawDeg: 0,
    scale: 1.08,
    halfLength: 28,
    halfBeam: 12.5,
  },
  // Moored outfitting & service vessels around outer harbor wings
  {
    id: 'deco-west-container',
    isDecorative: true,
    isHero: false,
    defaultName: '외항 컨테이너선',
    subtitle: '배경 장식 선박',
    vesselType: 'container_ship',
    x: -162,
    z: 28,
    defaultYawDeg: 90,
    scale: 0.92,
    halfLength: 22,
    halfBeam: 7.5,
  },
  {
    id: 'deco-east-tanker',
    isDecorative: true,
    isHero: false,
    defaultName: '외항 원유운반선',
    subtitle: '배경 장식 선박',
    vesselType: 'vlcc_tanker',
    x: 174,
    z: 30,
    defaultYawDeg: 270,
    scale: 0.9,
    halfLength: 23,
    halfBeam: 8.2,
  },
  {
    id: 'deco-west-tug',
    isDecorative: true,
    isHero: false,
    defaultName: '항만 예인선 01',
    subtitle: '배경 장식 선박',
    vesselType: 'harbor_tug',
    x: -96,
    z: 56,
    defaultYawDeg: 35,
    scale: 1.0,
    halfLength: 7.5,
    halfBeam: 3.4,
  },
  {
    id: 'deco-east-tug',
    isDecorative: true,
    isHero: false,
    defaultName: '항만 예인선 02',
    subtitle: '배경 장식 선박',
    vesselType: 'harbor_tug',
    x: 96,
    z: 58,
    defaultYawDeg: 325,
    scale: 1.0,
    halfLength: 7.5,
    halfBeam: 3.4,
  },
  {
    id: 'deco-offshore-wtiv',
    isDecorative: true,
    isHero: false,
    defaultName: '해상풍력 설치선',
    subtitle: '배경 장식 선박',
    vesselType: 'wtiv_jackup',
    x: -146,
    z: 86,
    defaultYawDeg: 65,
    scale: 0.88,
    halfLength: 21,
    halfBeam: 8.5,
  },
  {
    id: 'deco-offshore-fpso',
    isDecorative: true,
    isHero: false,
    defaultName: '해양플랜트 FPSO',
    subtitle: '배경 장식 선박',
    vesselType: 'fpso_offshore',
    x: 156,
    z: 92,
    defaultYawDeg: 285,
    scale: 0.88,
    halfLength: 23,
    halfBeam: 8.5,
  },
  {
    id: 'deco-bulk-carrier',
    isDecorative: true,
    isHero: false,
    defaultName: '일반화물 벌크선',
    subtitle: '배경 장식 선박',
    vesselType: 'bulk_carrier',
    x: -54,
    z: 108,
    defaultYawDeg: 90,
    scale: 0.9,
    halfLength: 21,
    halfBeam: 7.6,
  },
  {
    id: 'deco-roro-carrier',
    isDecorative: true,
    isHero: false,
    defaultName: '자동차 운반선',
    subtitle: '배경 장식 선박',
    vesselType: 'roro_car_carrier',
    x: 58,
    z: 112,
    defaultYawDeg: 270,
    scale: 0.88,
    halfLength: 21,
    halfBeam: 7.6,
  },
  // Gently cruising open-sea channel traffic (far outside business berths, z >= 145)
  {
    id: 'deco-cruise-channel',
    isDecorative: true,
    isHero: false,
    defaultName: '연안 크루즈선',
    subtitle: '항해 중 장식 선박',
    vesselType: 'cruise_liner',
    x: -85,
    z: 158,
    defaultYawDeg: 270,
    scale: 0.85,
    halfLength: 21,
    halfBeam: 7.2,
    cruise: { speed: 2.2, rangeX: 160 },
  },
  {
    id: 'deco-polar-channel',
    isDecorative: true,
    isHero: false,
    defaultName: '극지 연구선',
    subtitle: '항해 중 장식 선박',
    vesselType: 'icebreaker_research',
    x: 92,
    z: 186,
    defaultYawDeg: 90,
    scale: 0.86,
    halfLength: 19,
    halfBeam: 7.0,
    cruise: { speed: -1.8, rangeX: 180 },
  },
];
