import { ENGINEERING_MODULES, type ModuleId } from '../config/fleetConfig';
import type { Vec2 } from './spatialEngine';

export interface ObstacleBox2D {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface WalkInBuildingBounds {
  moduleId: ModuleId;
  /** Exterior bounds used for automatic RPG Roof Cutaway detection */
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Center of interior room (click-to-walk destination inside building) */
  interiorCenter: Vec2;
  /** Threshold position right outside doorway */
  doorwayOutside: Vec2;
}

/**
 * Walk-In 3D Engineering Hall geometry specifications:
 * - 5 North Quay Halls: 12.0m wide x 9.0m deep centered at (mod.dockPos.x, -25.5)
 *   with a wide 3.6m OPEN sliding glass doorway facing South (+Z at z = -21.0).
 * - 1 West Comms Hall (bmail): 9.0m East-West x 12.0m North-South centered at (-65, 10)
 *   with a wide 3.6m OPEN sliding glass doorway facing East (+X at x = -60.5).
 */
const NORTH_HALF_W = 6.0;
const NORTH_HALF_D = 4.5;
const DOOR_HALF_W = 1.8; // 3.6m wide open entrance (ample clearance for avatar + A* grid)
const WALL_THICK = 0.55; // wall thickness + small character radius guard

export const WALK_IN_BUILDINGS: WalkInBuildingBounds[] = ENGINEERING_MODULES.map((mod) => {
  if (mod.moduleId === 'bmail') {
    return {
      moduleId: mod.moduleId,
      minX: mod.dockPos.x - 4.5,
      maxX: mod.dockPos.x + 4.5,
      minZ: mod.dockPos.z - 6.0,
      maxZ: mod.dockPos.z + 6.0,
      interiorCenter: { x: mod.dockPos.x + 0.5, z: mod.dockPos.z },
      doorwayOutside: { x: mod.dockPos.x + 6.2, z: mod.dockPos.z },
    };
  }
  return {
    moduleId: mod.moduleId,
    minX: mod.dockPos.x - NORTH_HALF_W,
    maxX: mod.dockPos.x + NORTH_HALF_W,
    minZ: mod.dockPos.z - NORTH_HALF_D,
    maxZ: mod.dockPos.z + NORTH_HALF_D,
    interiorCenter: { x: mod.dockPos.x, z: mod.dockPos.z + 0.4 },
    doorwayOutside: { x: mod.dockPos.x, z: mod.dockPos.z + NORTH_HALF_D + 2.2 },
  };
});

/**
 * Generates solid perimeter walls for every walk-in building WHILE LEAVING
 * the 3.6m doorway AND the entire interior floor 100% WALKABLE!
 */
function buildWalkInWallObstacles(): ObstacleBox2D[] {
  const walls: ObstacleBox2D[] = [];

  for (const b of WALK_IN_BUILDINGS) {
    if (b.moduleId === 'bmail') {
      const cz = (b.minZ + b.maxZ) * 0.5;
      // Back wall (West)
      walls.push({ id: `${b.moduleId}_back`, minX: b.minX - 0.35, maxX: b.minX + WALL_THICK, minZ: b.minZ - 0.35, maxZ: b.maxZ + 0.35 });
      // North wall
      walls.push({ id: `${b.moduleId}_north`, minX: b.minX - 0.35, maxX: b.maxX + 0.35, minZ: b.minZ - 0.35, maxZ: b.minZ + WALL_THICK });
      // South wall
      walls.push({ id: `${b.moduleId}_south`, minX: b.minX - 0.35, maxX: b.maxX + 0.35, minZ: b.maxZ - WALL_THICK, maxZ: b.maxZ + 0.35 });
      // East front wall split into North & South wings (3.6m open doorway at [cz - 1.8, cz + 1.8])
      walls.push({ id: `${b.moduleId}_frontN`, minX: b.maxX - WALL_THICK, maxX: b.maxX + 0.35, minZ: b.minZ - 0.35, maxZ: cz - DOOR_HALF_W });
      walls.push({ id: `${b.moduleId}_frontS`, minX: b.maxX - WALL_THICK, maxX: b.maxX + 0.35, minZ: cz + DOOR_HALF_W, maxZ: b.maxZ + 0.35 });
    } else {
      const cx = (b.minX + b.maxX) * 0.5;
      // Back wall (North)
      walls.push({ id: `${b.moduleId}_back`, minX: b.minX - 0.35, maxX: b.maxX + 0.35, minZ: b.minZ - 0.35, maxZ: b.minZ + WALL_THICK });
      // Left wall (West)
      walls.push({ id: `${b.moduleId}_west`, minX: b.minX - 0.35, maxX: b.minX + WALL_THICK, minZ: b.minZ - 0.35, maxZ: b.maxZ + 0.35 });
      // Right wall (East)
      walls.push({ id: `${b.moduleId}_east`, minX: b.maxX - WALL_THICK, maxX: b.maxX + 0.35, minZ: b.minZ - 0.35, maxZ: b.maxZ + 0.35 });
      // South front wall split into Left & Right wings (3.6m open doorway at [cx - 1.8, cx + 1.8])
      walls.push({ id: `${b.moduleId}_frontL`, minX: b.minX - 0.35, maxX: cx - DOOR_HALF_W, minZ: b.maxZ - WALL_THICK, maxZ: b.maxZ + 0.35 });
      walls.push({ id: `${b.moduleId}_frontR`, minX: cx + DOOR_HALF_W, maxX: b.maxX + 0.35, minZ: b.maxZ - WALL_THICK, maxZ: b.maxZ + 0.35 });
    }
  }

  return walls;
}

/**
 * Complete 2D NavMesh obstacle list for the 2X Expanded Shipyard Harbor:
 * - Hollow walk-in building walls (with 3.6m open doorways!)
 * - Twin 900T Goliath Crane rail bogies stationed in rear staging yard (z = -35.8)
 * - Rear yard & East pier shipping container stacks
 */
export const QUAY_OBSTACLES: ObstacleBox2D[] = [
  ...buildWalkInWallObstacles(),
  // Orange Goliath Crane rail bogies at (-36 ± 5.2, -35.8)
  { id: 'crane_orange_L', minX: -42.4, maxX: -40.0, minZ: -40.2, maxZ: -31.4 },
  { id: 'crane_orange_R', minX: -32.0, maxX: -29.6, minZ: -40.2, maxZ: -31.4 },
  // Blue Goliath Crane rail bogies at (+36 ± 5.2, -35.8)
  { id: 'crane_blue_L', minX: 29.6, maxX: 32.0, minZ: -40.2, maxZ: -31.4 },
  { id: 'crane_blue_R', minX: 40.0, maxX: 42.4, minZ: -40.2, maxZ: -31.4 },
  // Rear yard shipping container stacks (well behind building rear walls z < -32)
  { id: 'containers_west', minX: -66.0, maxX: -54.0, minZ: -41.5, maxZ: -33.5 },
  { id: 'containers_mid_w', minX: -20.0, maxX: -8.0, minZ: -41.5, maxZ: -34.5 },
  { id: 'containers_mid_e', minX: 8.0, maxX: 20.0, minZ: -41.5, maxZ: -34.5 },
  // East Outfitting Pier shipping container stacks (leaving wide 6m waterfront promenade on West side of pier)
  { id: 'containers_east_1', minX: 74.5, maxX: 80.5, minZ: -8.0, maxZ: 6.5 },
  { id: 'containers_east_2', minX: 74.5, maxX: 80.5, minZ: 13.0, maxZ: 28.0 },
];

/**
 * Returns the ModuleId of the walk-in engineering building if (x, z) is inside its interior footprint,
 * triggering automatic RPG Roof Cutaway and indoor spatial zone activation!
 */
export function getBuildingContainingPoint(x: number, z: number): ModuleId | null {
  for (let i = 0; i < WALK_IN_BUILDINGS.length; i++) {
    const b = WALK_IN_BUILDINGS[i];
    if (x >= b.minX + 0.1 && x <= b.maxX - 0.1 && z >= b.minZ + 0.1 && z <= b.maxZ - 0.1) {
      return b.moduleId;
    }
  }
  return null;
}

/**
 * Checks whether (x, z) lies inside the 2X Expanded Walkable 3D Shipyard NavMesh:
 *  - Grand North Engineering Quay & all 5 Walk-In Hall interiors (x in [-75, 75], z in [-42.5, -12.8])
 *  - 5 Waterfront Finger Piers extending out to z = -8.6
 *  - Continuous West Comms Pier & bmail Walk-In Hall interior (x in [-75, -54.8], z in [-13.0, 23.2])
 *  - Continuous East 174K LNG Outfitting Quay promenade (x in [66.6, 82.8], z in [-13.0, 38.5])
 * Excluding solid building walls, crane bogies, and container stacks.
 */
export function isWalkableOnQuay(x: number, z: number): boolean {
  const onNorthQuay = x >= -75.0 && x <= 75.0 && z >= -42.5 && z <= -12.8;
  const onWestPier = x >= -75.0 && x <= -54.8 && z >= -13.0 && z <= 23.2;
  const onEastPier = x >= 66.6 && x <= 82.8 && z >= -13.0 && z <= 38.5;

  let onFingerPier = false;
  if (z > -12.8 && z <= -8.6) {
    for (const mod of ENGINEERING_MODULES) {
      if (mod.moduleId === 'bmail') continue;
      if (Math.abs(x - mod.dockPos.x) <= 1.35) {
        onFingerPier = true;
        break;
      }
    }
  }

  if (!onNorthQuay && !onWestPier && !onEastPier && !onFingerPier) {
    return false;
  }

  for (let i = 0; i < QUAY_OBSTACLES.length; i++) {
    const ob = QUAY_OBSTACLES[i];
    if (x >= ob.minX && x <= ob.maxX && z >= ob.minZ && z <= ob.maxZ) {
      return false;
    }
  }

  return true;
}

/**
 * Samples the exact 3D ground height (Y) for VRM humanoids across quay promenade,
 * raised building interior floors, finger pier ramps, and rear yard so feet stay planted.
 */
export function sampleQuaySurfaceHeight(x: number, z: number): number {
  // Raised polished epoxy interior floor inside any of the 6 walk-in halls
  if (getBuildingContainingPoint(x, z) !== null) {
    return 1.72;
  }
  // Smooth ramp down onto waterfront finger piers
  if (z > -12.8 && x > -54.8 && x < 66.6) {
    const t = Math.max(0, Math.min(1, (z - -12.8) / 1.4));
    return 1.61 - t * 0.24;
  }
  return 1.61;
}

/**
 * Resolves single-step movement with smooth wall sliding against NavMesh obstacles.
 * Allows walking straight through open 3.6m building doorways while cleanly sliding along solid walls.
 */
export function resolveQuayMovement(from: Vec2, desired: Vec2): Vec2 {
  if (isWalkableOnQuay(desired.x, desired.z)) {
    return desired;
  }
  if (isWalkableOnQuay(desired.x, from.z)) {
    return { x: desired.x, z: from.z };
  }
  if (isWalkableOnQuay(from.x, desired.z)) {
    return { x: from.x, z: desired.z };
  }
  return from;
}

function hasClearLineOfSight(a: Vec2, b: Vec2): boolean {
  const dist = Math.hypot(b.x - a.x, b.z - a.z);
  const steps = Math.max(2, Math.ceil(dist / 0.55));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const px = a.x + (b.x - a.x) * t;
    const pz = a.z + (b.z - a.z) * t;
    if (!isWalkableOnQuay(px, pz)) return false;
  }
  return true;
}

export function snapToNearestWalkable(target: Vec2): Vec2 | null {
  if (isWalkableOnQuay(target.x, target.z)) return target;
  for (let r = 1; r <= 10; r++) {
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2;
      const cx = target.x + Math.cos(ang) * r * 0.85;
      const cz = target.z + Math.sin(ang) * r * 0.85;
      if (isWalkableOnQuay(cx, cz)) {
        return { x: cx, z: cz };
      }
    }
  }
  return null;
}

/**
 * A* Navigation Mesh Pathfinding + Line-of-Sight String-Pulling for 3D RPG Click-to-Move.
 * Seamlessly routes avatars across the 2X harbor quay, around walls, and RIGHT THROUGH open 3.6m building doorways!
 */
export function findQuayPath(start: Vec2, rawGoal: Vec2): Vec2[] {
  const goal = snapToNearestWalkable(rawGoal);
  if (!goal) return [];

  if (hasClearLineOfSight(start, goal)) {
    return [goal];
  }

  const CELL = 1.6;
  const MIN_X = -76.0;
  const MAX_X = 84.0;
  const MIN_Z = -43.5;
  const MAX_Z = 39.5;
  const cols = Math.ceil((MAX_X - MIN_X) / CELL);
  const rows = Math.ceil((MAX_Z - MIN_Z) / CELL);

  const toGrid = (p: Vec2) => ({
    gx: Math.max(0, Math.min(cols - 1, Math.round((p.x - MIN_X) / CELL))),
    gz: Math.max(0, Math.min(rows - 1, Math.round((p.z - MIN_Z) / CELL))),
  });
  const toWorld = (gx: number, gz: number): Vec2 => ({
    x: MIN_X + gx * CELL,
    z: MIN_Z + gz * CELL,
  });

  const s = toGrid(start);
  const g = toGrid(goal);
  const key = (gx: number, gz: number) => gz * cols + gx;

  const open: number[] = [key(s.gx, s.gz)];
  const openSet = new Set<number>(open);
  const closed = new Set<number>();
  const cameFrom = new Map<number, number>();
  const gScore = new Map<number, number>([[key(s.gx, s.gz), 0]]);
  const fScore = new Map<number, number>([[key(s.gx, s.gz), Math.hypot(g.gx - s.gx, g.gz - s.gz)]]);

  const dirs = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, 1.414],
    [-1, 1, 1.414],
    [1, -1, 1.414],
    [-1, -1, 1.414],
  ];

  let iterations = 0;
  const goalKey = key(g.gx, g.gz);

  while (open.length > 0 && iterations < 3500) {
    iterations++;
    let bestIdx = 0;
    let bestF = fScore.get(open[0]) ?? Infinity;
    for (let i = 1; i < open.length; i++) {
      const f = fScore.get(open[i]) ?? Infinity;
      if (f < bestF) {
        bestF = f;
        bestIdx = i;
      }
    }
    const curr = open.splice(bestIdx, 1)[0];
    openSet.delete(curr);

    if (curr === goalKey) {
      const rawPoints: Vec2[] = [goal];
      let trace = curr;
      while (cameFrom.has(trace)) {
        trace = cameFrom.get(trace)!;
        const tgx = trace % cols;
        const tgz = Math.floor(trace / cols);
        rawPoints.unshift(toWorld(tgx, tgz));
      }
      const smoothed: Vec2[] = [];
      let anchor = start;
      let idx = 0;
      while (idx < rawPoints.length) {
        let furthest = idx;
        for (let j = rawPoints.length - 1; j > idx; j--) {
          if (hasClearLineOfSight(anchor, rawPoints[j])) {
            furthest = j;
            break;
          }
        }
        smoothed.push(rawPoints[furthest]);
        anchor = rawPoints[furthest];
        idx = furthest + 1;
      }
      return smoothed;
    }

    closed.add(curr);
    const cgx = curr % cols;
    const cgz = Math.floor(curr / cols);
    const currG = gScore.get(curr) ?? Infinity;

    for (const [dx, dz, cost] of dirs) {
      const ngx = cgx + dx;
      const ngz = cgz + dz;
      if (ngx < 0 || ngx >= cols || ngz < 0 || ngz >= rows) continue;
      const nKey = key(ngx, ngz);
      if (closed.has(nKey)) continue;

      const wp = toWorld(ngx, ngz);
      if (nKey !== goalKey && !isWalkableOnQuay(wp.x, wp.z)) continue;

      const tentativeG = currG + cost;
      if (tentativeG < (gScore.get(nKey) ?? Infinity)) {
        cameFrom.set(nKey, curr);
        gScore.set(nKey, tentativeG);
        fScore.set(nKey, tentativeG + Math.hypot(g.gx - ngx, g.gz - ngz));
        if (!openSet.has(nKey)) {
          open.push(nKey);
          openSet.add(nKey);
        }
      }
    }
  }

  return [goal];
}

/**
 * 2X Expanded Harbor Basin Water Collision & Multi-Vessel Separation for the 8-Ship Fleet.
 */
export function resolveShipNavCollision(pos: Vec2, otherVessels: Vec2[] = []): Vec2 {
  let x = Math.max(-51.5, Math.min(50.5, pos.x)); // x <= 50.5 keeps clear of East 174K LNG Carrier (x = 59.5)
  let z = Math.max(-7.8, Math.min(44.0, pos.z)); // z >= -7.8 keeps clear of North Finger Piers (-8.6)

  // Avoid West bmail Pier (x < -51.5 && z < 26)
  if (x < -51.5 && z < 26) {
    x = -51.5;
  }

  // Avoid Eastern Lighthouse headland rocks (center 64, 44, radius 11.0)
  const ldx = x - 64;
  const ldz = z - 44;
  const lDist = Math.hypot(ldx, ldz);
  if (lDist < 11.0) {
    const push = 11.0 / Math.max(lDist, 0.01);
    x = 64 + ldx * push;
    z = 44 + ldz * push;
  }

  // Gentle ship-to-ship hull separation steering (minimum 3.8m center-to-center)
  const minSep = 3.8;
  for (let i = 0; i < otherVessels.length; i++) {
    const o = otherVessels[i];
    const dx = x - o.x;
    const dz = z - o.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.001 && d < minSep) {
      const push = (minSep - d) * 0.55;
      x += (dx / d) * push;
      z += (dz / d) * push;
    }
  }

  x = Math.max(-51.5, Math.min(50.5, x));
  z = Math.max(-7.8, Math.min(44.0, z));

  return { x, z };
}
