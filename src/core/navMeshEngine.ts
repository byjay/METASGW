/**
 * 2D Quay NavMesh & A* pathfinding for the METASGW 3D Harbor boardwalk.
 * Pure math module — zero DOM/Three.js dependencies so it runs directly in node:test.
 */

export interface Vec2 {
  x: number;
  z: number;
}

export interface ObstacleBox2D {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface PortalBuildingSpec {
  id: 'talk' | 'nas' | 'bmail' | 'admin';
  label: string;
  subtitle: string;
  accentHex: string;
  centerX: number;
  centerZ: number;
  width: number;
  depth: number;
}

export const PORTAL_BUILDINGS: readonly PortalBuildingSpec[] = [
  {
    id: 'talk',
    label: 'SGTALK',
    subtitle: '채팅 · SGW 비서',
    accentHex: '#0284c7',
    centerX: -36,
    centerZ: -26,
    width: 12,
    depth: 9,
  },
  {
    id: 'nas',
    label: 'SGW NAS',
    subtitle: '공유 자료실',
    accentHex: '#0d9488',
    centerX: -12,
    centerZ: -26,
    width: 12,
    depth: 9,
  },
  {
    id: 'bmail',
    label: 'bmail',
    subtitle: 'PC 메일 앱 열기',
    accentHex: '#4f46e5',
    centerX: 12,
    centerZ: -26,
    width: 12,
    depth: 9,
  },
  {
    id: 'admin',
    label: 'SGW 관리',
    subtitle: '권한 · 직원 관리',
    accentHex: '#d97706',
    centerX: 36,
    centerZ: -26,
    width: 12,
    depth: 9,
  },
];

export const QUAY_OBSTACLES: ObstacleBox2D[] = [
  ...PORTAL_BUILDINGS.map((b) => ({
    id: `portal_${b.id}`,
    minX: b.centerX - b.width * 0.5 - 0.5,
    maxX: b.centerX + b.width * 0.5 + 0.5,
    minZ: b.centerZ - b.depth * 0.5 - 0.5,
    maxZ: b.centerZ + b.depth * 0.5 + 0.5,
  })),
  // Rear yard crane rail bogies
  { id: 'crane_west_L', minX: -50.5, maxX: -47.5, minZ: -44.0, maxZ: -35.0 },
  { id: 'crane_west_R', minX: -40.5, maxX: -37.5, minZ: -44.0, maxZ: -35.0 },
  { id: 'crane_east_L', minX: 37.5, maxX: 40.5, minZ: -44.0, maxZ: -35.0 },
  { id: 'crane_east_R', minX: 47.5, maxX: 50.5, minZ: -44.0, maxZ: -35.0 },
];

/**
 * Checks whether (x, z) lies inside the walkable quay promenade & piers,
 * excluding building footprints and crane bogies.
 */
export function isWalkableOnQuay(x: number, z: number): boolean {
  const onNorthQuay = x >= -92.0 && x <= 92.0 && z >= -46.0 && z <= -3.0;
  const onWestPier = x >= -92.0 && x <= -76.0 && z >= -3.5 && z <= 36.0;
  const onEastPier = x >= 76.0 && x <= 92.0 && z >= -3.5 && z <= 36.0;

  if (!onNorthQuay && !onWestPier && !onEastPier) {
    return false;
  }

  for (let i = 0; i < QUAY_OBSTACLES.length; i += 1) {
    const ob = QUAY_OBSTACLES[i];
    if (x >= ob.minX && x <= ob.maxX && z >= ob.minZ && z <= ob.maxZ) {
      return false;
    }
  }
  return true;
}

export function sampleQuaySurfaceHeight(_x: number, _z: number): number {
  return 1.61;
}

export function resolveQuayMovement(from: Vec2, desired: Vec2): Vec2 {
  if (isWalkableOnQuay(desired.x, desired.z)) return desired;
  if (isWalkableOnQuay(desired.x, from.z)) return { x: desired.x, z: from.z };
  if (isWalkableOnQuay(from.x, desired.z)) return { x: from.x, z: desired.z };
  return from;
}

function hasClearLineOfSight(a: Vec2, b: Vec2): boolean {
  const dist = Math.hypot(b.x - a.x, b.z - a.z);
  const steps = Math.max(2, Math.ceil(dist / 0.75));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    if (!isWalkableOnQuay(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) {
      return false;
    }
  }
  return true;
}

export function snapToNearestWalkable(target: Vec2): Vec2 | null {
  if (isWalkableOnQuay(target.x, target.z)) return target;
  for (let r = 1; r <= 12; r += 1) {
    for (let a = 0; a < 16; a += 1) {
      const ang = (a / 16) * Math.PI * 2;
      const cx = target.x + Math.cos(ang) * r * 1.0;
      const cz = target.z + Math.sin(ang) * r * 1.0;
      if (isWalkableOnQuay(cx, cz)) {
        return { x: cx, z: cz };
      }
    }
  }
  return null;
}

export function findQuayPath(start: Vec2, rawGoal: Vec2): Vec2[] {
  const goal = snapToNearestWalkable(rawGoal);
  if (!goal) return [];
  if (hasClearLineOfSight(start, goal)) return [goal];

  const CELL = 2.0;
  const MIN_X = -94.0;
  const MAX_X = 94.0;
  const MIN_Z = -48.0;
  const MAX_Z = 38.0;
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

  while (open.length > 0 && iterations < 3000) {
    iterations += 1;
    let bestIdx = 0;
    let bestF = fScore.get(open[0]) ?? Infinity;
    for (let i = 1; i < open.length; i += 1) {
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
        rawPoints.unshift(toWorld(trace % cols, Math.floor(trace / cols)));
      }
      const smoothed: Vec2[] = [];
      let anchor = start;
      let idx = 0;
      while (idx < rawPoints.length) {
        let furthest = idx;
        for (let j = rawPoints.length - 1; j > idx; j -= 1) {
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
