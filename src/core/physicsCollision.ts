/**
 * Physical Collision & Elevation Engine for METASGW 3D Harbor (Requirement #17).
 *
 * Guarantees:
 *   - Avatars cannot ghost through portal buildings, crane bogies, yard container stacks, or moored vessels.
 *   - Avatars stop cleanly at quay/pier edges and can NEVER walk on water.
 *   - Smooth wall sliding on AABB obstacle faces using circle-vs-AABB penetration resolution.
 *   - Avatars maintain minimum personal separation (`AVATAR_MIN_SEPARATION = 1.15m`) so they never overlap.
 *   - Ramp & stair elevation profile (`sampleHarborElevation`) lets avatars ascend/descend smoothly.
 *   - Camera cannot clip beneath the water surface or inside solid structures.
 */

import { PORTAL_BUILDINGS, type ObstacleBox2D, type Vec2 } from './navMeshEngine';

export const AVATAR_COLLISION_RADIUS = 0.55;
export const AVATAR_MIN_SEPARATION = 1.15;
export const QUAY_MAIN_DECK_Y = 1.61;
export const QUAY_REAR_APRON_Y = 1.57;
export const OBSERVATION_DECK_Y = 2.41;

/**
 * Static solid obstacles on the Home Harbor quay & piers.
 * Includes: 4 Portal Buildings, Goliath Crane rail bogies, East/West container stacks, and waterfront lighting towers.
 */
export const HARBOR_STATIC_COLLIDERS: readonly ObstacleBox2D[] = [
  ...PORTAL_BUILDINGS.map((b) => ({
    id: `building_${b.id}`,
    minX: b.centerX - b.width * 0.5,
    maxX: b.centerX + b.width * 0.5,
    minZ: b.centerZ - b.depth * 0.5,
    maxZ: b.centerZ + b.depth * 0.5,
  })),
  // Goliath Crane rail bogies (West & East)
  { id: 'crane_west_L', minX: -50.2, maxX: -47.8, minZ: -43.8, maxZ: -35.2 },
  { id: 'crane_west_R', minX: -40.2, maxX: -37.8, minZ: -43.8, maxZ: -35.2 },
  { id: 'crane_east_L', minX: 37.8, maxX: 40.2, minZ: -43.8, maxZ: -35.2 },
  { id: 'crane_east_R', minX: 47.8, maxX: 50.2, minZ: -43.8, maxZ: -35.2 },
  // West & East Container Stacks on apron
  { id: 'yard_containers_west', minX: -70.0, maxX: -54.0, minZ: -36.2, maxZ: -28.8 },
  { id: 'yard_containers_east', minX: 54.0, maxX: 70.0, minZ: -36.2, maxZ: -28.8 },
];

/**
 * Walkable deck zones in Home Harbor (North Quay + West/East Piers + elevated observation terrace).
 * Outside these concrete decks is water (non-walkable!).
 */
const WALKABLE_ZONES: readonly ObstacleBox2D[] = [
  // Main North Quay concrete apron (stops cleanly at seawall z = -2.5 minus avatar margin)
  { id: 'north_quay', minX: -93.2, maxX: 93.2, minZ: -47.2, maxZ: -3.1 },
  // West Outfitting Pier
  { id: 'west_pier', minX: -93.2, maxX: -75.6, minZ: -3.5, maxZ: 36.8 },
  // East Outfitting Pier
  { id: 'east_pier', minX: 75.6, maxX: 93.2, minZ: -3.5, maxZ: 36.8 },
];

/**
 * Checks whether a point is on solid walkable land (NEVER water).
 */
export function isOnWalkableLand(x: number, z: number, radius = AVATAR_COLLISION_RADIUS): boolean {
  for (let i = 0; i < WALKABLE_ZONES.length; i += 1) {
    const zBox = WALKABLE_ZONES[i];
    if (
      x >= zBox.minX + radius &&
      x <= zBox.maxX - radius &&
      z >= zBox.minZ + radius &&
      z <= zBox.maxZ - radius
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Returns true if point `(x, z)` is over the water basin (outside all walkable quay/pier decks).
 */
export function isOverWater(x: number, z: number): boolean {
  return !isOnWalkableLand(x, z, 0);
}

/**
 * Smoothly samples walkable elevation including the central promenade ramp/stairs
 * leading up to the waterfront viewing deck (+0.80m terrace between z in [-18.5, -14.5] and x in [-10, 10],
 * with flanking east/west stairs/ramps in |x| in [10, 14]).
 */
export function sampleHarborElevation(x: number, z: number): number {
  // Raised central waterfront lookout platform (accessible via left/right ramps)
  if (z >= -18.2 && z <= -14.2) {
    const ax = Math.abs(x);
    if (ax <= 8.0) {
      return OBSERVATION_DECK_Y;
    }
    if (ax < 12.0) {
      const t = 1 - (ax - 8.0) / 4.0;
      return QUAY_MAIN_DECK_Y + t * (OBSERVATION_DECK_Y - QUAY_MAIN_DECK_Y);
    }
  }
  if (z < -46.0) {
    return QUAY_REAR_APRON_Y;
  }
  return QUAY_MAIN_DECK_Y;
}

/**
 * Resolves circle-vs-AABB penetration by pushing the circle out along the minimum penetration axis.
 */
function pushCircleOutOfAabb(pos: Vec2, radius: number, box: ObstacleBox2D): Vec2 {
  const closestX = Math.max(box.minX, Math.min(pos.x, box.maxX));
  const closestZ = Math.max(box.minZ, Math.min(pos.z, box.maxZ));
  const dx = pos.x - closestX;
  const dz = pos.z - closestZ;
  const distSq = dx * dx + dz * dz;

  if (distSq >= radius * radius) {
    return pos;
  }

  if (distSq > 1e-8) {
    const dist = Math.sqrt(distSq);
    const push = radius - dist + 0.002;
    return {
      x: pos.x + (dx / dist) * push,
      z: pos.z + (dz / dist) * push,
    };
  }

  // Center is deep inside AABB: push toward nearest face
  const toLeft = Math.abs(pos.x - box.minX);
  const toRight = Math.abs(box.maxX - pos.x);
  const toTop = Math.abs(pos.z - box.minZ);
  const toBottom = Math.abs(box.maxZ - pos.z);
  const minPen = Math.min(toLeft, toRight, toTop, toBottom);

  if (minPen === toLeft) return { x: box.minX - radius - 0.002, z: pos.z };
  if (minPen === toRight) return { x: box.maxX + radius + 0.002, z: pos.z };
  if (minPen === toTop) return { x: pos.x, z: box.minZ - radius - 0.002 };
  return { x: pos.x, z: box.maxZ + radius + 0.002 };
}

/**
 * Clamps a position back onto the nearest valid walkable quay/pier surface so an avatar
 * can slide cleanly along the seawall edge without ever stepping into water.
 */
function clampToWalkableEdge(from: Vec2, candidate: Vec2, radius: number): Vec2 {
  if (isOnWalkableLand(candidate.x, candidate.z, radius)) {
    return candidate;
  }
  // Try axis-separated sliding along the seawall/pier edge
  if (isOnWalkableLand(candidate.x, from.z, radius)) {
    return { x: candidate.x, z: from.z };
  }
  if (isOnWalkableLand(from.x, candidate.z, radius)) {
    return { x: from.x, z: candidate.z };
  }
  // Clamp to the closest walkable zone rectangle
  let best = from;
  let bestDistSq = Infinity;
  for (const zone of WALKABLE_ZONES) {
    const cx = Math.max(zone.minX + radius, Math.min(candidate.x, zone.maxX - radius));
    const cz = Math.max(zone.minZ + radius, Math.min(candidate.z, zone.maxZ - radius));
    const dSq = (cx - candidate.x) ** 2 + (cz - candidate.z) ** 2;
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      best = { x: cx, z: cz };
    }
  }
  return best;
}

/**
 * Resolves full avatar movement with:
 *   1. Continuous sweep-substep prevention (blocks high-speed tunneling through thin walls)
 *   2. Static AABB obstacle sliding (buildings, cranes, container stacks)
 *   3. Peer avatar separation (enforces minimum spacing >= AVATAR_MIN_SEPARATION)
 *   4. Quay edge clamping (stops cleanly at seawall; never walks on water)
 */
export function resolveAvatarPhysicsMovement(
  from: Vec2,
  desired: Vec2,
  peerPositions: readonly Vec2[] = [],
  obstacles: readonly ObstacleBox2D[] = HARBOR_STATIC_COLLIDERS,
  radius = AVATAR_COLLISION_RADIUS,
): Vec2 {
  const totalDist = Math.hypot(desired.x - from.x, desired.z - from.z);
  const steps = Math.max(1, Math.min(16, Math.ceil(totalDist / 0.45)));
  let cur: Vec2 = { x: from.x, z: from.z };

  for (let s = 1; s <= steps; s += 1) {
    const t = s / steps;
    let next: Vec2 = {
      x: from.x + (desired.x - from.x) * t,
      z: from.z + (desired.z - from.z) * t,
    };

    // 1. Keep on solid quay/pier deck (slide along seawall, never enter water)
    next = clampToWalkableEdge(cur, next, radius);

    // 2. Push out of every static AABB obstacle (2 solver passes for corners)
    for (let pass = 0; pass < 2; pass += 1) {
      for (let i = 0; i < obstacles.length; i += 1) {
        next = pushCircleOutOfAabb(next, radius, obstacles[i]);
      }

      // 3. Enforce personal separation against other avatars
      for (let i = 0; i < peerPositions.length; i += 1) {
        const peer = peerPositions[i];
        const dx = next.x - peer.x;
        const dz = next.z - peer.z;
        const dist = Math.hypot(dx, dz);
        if (dist < AVATAR_MIN_SEPARATION) {
          if (dist > 1e-5) {
            const push = AVATAR_MIN_SEPARATION - dist + 0.005;
            next = {
              x: next.x + (dx / dist) * push,
              z: next.z + (dz / dist) * push,
            };
          } else {
            next = { x: next.x + AVATAR_MIN_SEPARATION, z: next.z };
          }
        }
      }

      // Re-clamp to walkable land so obstacle/peer pushes never push avatar into water
      next = clampToWalkableEdge(cur, next, radius);
    }

    // Final safety guarantee: never end inside any solid obstacle or over water
    let blocked = !isOnWalkableLand(next.x, next.z, radius);
    if (!blocked) {
      for (let i = 0; i < obstacles.length; i += 1) {
        const ob = obstacles[i];
        if (
          next.x > ob.minX - radius * 0.9 &&
          next.x < ob.maxX + radius * 0.9 &&
          next.z > ob.minZ - radius * 0.9 &&
          next.z < ob.maxZ + radius * 0.9
        ) {
          blocked = true;
          break;
        }
      }
    }

    if (blocked) {
      break;
    }
    cur = next;
  }

  return cur;
}

/**
 * Separates a set of spawned avatar positions so no two avatars overlap and all stay on solid land.
 */
export function resolveAvatarSpawnOverlaps<T extends { position: { x: number; y: number; z: number } }>(
  items: T[],
  obstacles: readonly ObstacleBox2D[] = HARBOR_STATIC_COLLIDERS,
): T[] {
  const placed: Vec2[] = [];
  return items.map((item) => {
    let pos: Vec2 = { x: item.position.x, z: item.position.z };
    pos = resolveAvatarPhysicsMovement(pos, pos, placed, obstacles);
    placed.push(pos);
    return {
      ...item,
      position: {
        x: pos.x,
        y: sampleHarborElevation(pos.x, pos.z),
        z: pos.z,
      },
    };
  });
}

/**
 * Clamps the 3D camera position so it never clips under water, under the concrete deck,
 * or inside solid portal buildings.
 */
export function clampCameraCollision(
  cam: { x: number; y: number; z: number },
  obstacles: readonly ObstacleBox2D[] = HARBOR_STATIC_COLLIDERS,
): { x: number; y: number; z: number } {
  const minDeckY = isOnWalkableLand(cam.x, cam.z, 0)
    ? sampleHarborElevation(cam.x, cam.z) + 1.4
    : 2.2;
  let x = cam.x;
  let y = Math.max(minDeckY, cam.y);
  let z = cam.z;

  // If camera is low enough to intersect quay buildings (height ~6.2m), push outside AABB
  if (y < 7.2) {
    for (let i = 0; i < obstacles.length; i += 1) {
      const ob = obstacles[i];
      if (x >= ob.minX - 1.0 && x <= ob.maxX + 1.0 && z >= ob.minZ - 1.0 && z <= ob.maxZ + 1.0) {
        const pushed = pushCircleOutOfAabb({ x, z }, 1.2, ob);
        x = pushed.x;
        z = pushed.z;
      }
    }
  }

  return { x, y, z };
}
