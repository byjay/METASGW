/**
 * Physical Collision, Prop Clearance & Camera Grounding Engine for METASGW 3D Harbor
 * (Requirement #17 & Stage 10 Close-Up Framing).
 *
 * Guarantees:
 *   - Avatars cannot ghost through portal buildings, crane bogies, yard container stacks,
 *     lamp posts, quay benches, planters, bollards, or hub building scaffolding.
 *   - Every spawned/standing avatar maintains >= 0.8m clearance (`AVATAR_PROP_MIN_CLEARANCE`)
 *     from prop colliders (lamp posts, benches, scaffolding, planters, bollards).
 *   - Avatars stop cleanly at quay/pier edges and can NEVER walk on water.
 *   - Smooth wall sliding on AABB obstacle faces using circle-vs-AABB penetration resolution.
 *   - Avatars maintain minimum personal separation (`AVATAR_MIN_SEPARATION = 1.15m`) so they never overlap.
 *   - Camera supports close-up zoom (`CAMERA_MIN_DISTANCE = 3.2m`, worker >= 1/3 viewport height)
 *     while strictly clamping above the concrete deck and water surface.
 */

import { PORTAL_BUILDINGS, type ObstacleBox2D, type Vec2 } from './navMeshEngine';

export const AVATAR_COLLISION_RADIUS = 0.55;
export const AVATAR_PROP_MIN_CLEARANCE = 0.8;
/** Stage 12: Minimum horizontal clearance from vertical poles/lamps for default player spawn. */
export const PLAYER_POLE_MIN_CLEARANCE = 1.5;
/** Stage 12: Open-plaza default player spawn position, >= 4.9m clear of central lamp (0, -4.8) & benches. */
export const PLAYER_DEFAULT_SPAWN: Readonly<Vec2> = { x: 4.2, z: -8.6 };
export const AVATAR_MIN_SEPARATION = 1.15;
export const QUAY_MAIN_DECK_Y = 1.61;
export const QUAY_REAR_APRON_Y = 1.57;
export const OBSERVATION_DECK_Y = 2.41;

/** Minimum 3D camera orbit distance (meters). At FOV 50°, a 2.78m quay worker spans ~93% height at 3.2m and ~50% at 6.0m. */
export const CAMERA_MIN_DISTANCE = 3.2;
/** Stage 11–12: Max mouse-wheel / free-orbit zoom floor (meters). At 5.6m (FOV 50°), a 2.78m worker spans ~53% viewport height with full head-to-boot clearance between top HUD and bottom dock. */
export const CAMERA_WHEEL_MIN_DISTANCE = 5.6;
export const CAMERA_CLOSE_ZOOM_BLEND_START = 26.0;
export const CAMERA_CLOSE_ZOOM_BLEND_END = 10.5;
export const CAMERA_FAR_MIN_POLAR_ANGLE = 0.14;
export const CAMERA_FAR_MAX_POLAR_ANGLE = Math.PI * 0.485;
/** Close-zoom polar angle bounds from +Y (radians): [1.26..1.44] ≈ [72.2°..82.5°] (downward pitch 7.5°..17.8°), keeping full worker body comfortably inside HUD-safe viewport and water ratio <= 40%. */
export const CAMERA_CLOSE_MIN_POLAR_ANGLE = 1.26;
export const CAMERA_CLOSE_MAX_POLAR_ANGLE = 1.44;
export const WORKER_CHEST_HEIGHT_OFFSET = 1.48;
export const QUAY_CLOSE_ZOOM_MAX_TARGET_Z = -7.5;
export const CAMERA_PERSON_FOCUS_MIN_DIST = 3.0;
export const CAMERA_PERSON_FOCUS_MAX_DIST = 6.0;
export const CAMERA_PERSON_FOCUS_DEFAULT_DIST = 4.5;
export const CAMERA_MIN_LAND_CLEARANCE_Y = 0.95;
export const CAMERA_MIN_WATER_CLEARANCE_Y = 2.2;

/**
 * Static solid structural obstacles on the Home Harbor quay & piers.
 * Includes: 4 Portal Buildings, Goliath Crane rail bogies, and East/West container stacks.
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
 * Quay & Pier Prop Colliders (Stage 10):
 * Exact 2D footprints matching `src/scene/shipyardWorld.ts` lamp posts, quay benches,
 * planter trees, and waterfront bollards so avatars maintain >= 0.8m clearance from every prop.
 */
export const QUAY_LAMP_POSITIONS: ReadonlyArray<{ x: number; z: number }> = [
  ...Array.from({ length: 9 }, (_, i) => ({ x: -60 + i * 15, z: -4.8 })),
  { x: -78.5, z: 12 },
  { x: -78.5, z: 28 },
  { x: 78.5, z: 12 },
  { x: 78.5, z: 28 },
];

export const QUAY_BENCH_POSITIONS: ReadonlyArray<{ x: number; z: number; halfW: number; halfD: number }> = [
  { x: -22, z: -5.8, halfW: 1.5, halfD: 0.34 },
  { x: -10, z: -5.8, halfW: 1.5, halfD: 0.34 },
  { x: 10, z: -5.8, halfW: 1.5, halfD: 0.34 },
  { x: 22, z: -5.8, halfW: 1.5, halfD: 0.34 },
];

export const QUAY_PLANTER_POSITIONS: ReadonlyArray<{ x: number; z: number }> = [
  { x: -64, z: -17.8 },
  { x: -46, z: -17.8 },
  { x: -22, z: -17.8 },
  { x: 22, z: -17.8 },
  { x: 46, z: -17.8 },
  { x: 64, z: -17.8 },
  { x: -84.5, z: 4.0 },
  { x: 84.5, z: 4.0 },
];

export const HARBOR_PROP_COLLIDERS: readonly ObstacleBox2D[] = [
  // Streetlights & high-mast lighting poles (pole radius ~0.16m)
  ...QUAY_LAMP_POSITIONS.map((lp, i) => ({
    id: `prop_lamp_${i}`,
    minX: lp.x - 0.22,
    maxX: lp.x + 0.22,
    minZ: lp.z - 0.22,
    maxZ: lp.z + 0.22,
  })),
  // Quay waterfront benches (3.0m x 0.68m timber seat & backrest)
  ...QUAY_BENCH_POSITIONS.map((b, i) => ({
    id: `prop_bench_${i}`,
    minX: b.x - b.halfW,
    maxX: b.x + b.halfW,
    minZ: b.z - b.halfD,
    maxZ: b.z + b.halfD,
  })),
  // Stone tree planters (2.5m x 2.5m curb)
  ...QUAY_PLANTER_POSITIONS.map((t, i) => ({
    id: `prop_planter_${i}`,
    minX: t.x - 1.25,
    maxX: t.x + 1.25,
    minZ: t.z - 1.25,
    maxZ: t.z + 1.25,
  })),
];

/** Combined structural + prop colliders used for avatar spawning, patrol movement, and clearance checks. */
export const HARBOR_ALL_OBSTACLES: readonly ObstacleBox2D[] = [
  ...HARBOR_STATIC_COLLIDERS,
  ...HARBOR_PROP_COLLIDERS,
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
 * Returns the Euclidean surface distance from 2D point `pos` to an AABB (`0` when inside or on boundary).
 */
export function distancePointToAabb(pos: Vec2, box: ObstacleBox2D): number {
  const closestX = Math.max(box.minX, Math.min(pos.x, box.maxX));
  const closestZ = Math.max(box.minZ, Math.min(pos.z, box.maxZ));
  return Math.hypot(pos.x - closestX, pos.z - closestZ);
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
 * Checks whether a 2D point is clear of every non-ignored obstacle by at least `minClearance`
 * and separated from every peer avatar by at least `AVATAR_MIN_SEPARATION`.
 */
function isPointClearOfPropsAndPeers(
  candidate: Vec2,
  obstacles: readonly ObstacleBox2D[],
  peerPositions: readonly Vec2[],
  minClearance: number,
  ignoredIds?: ReadonlySet<string>,
): boolean {
  if (!isOnWalkableLand(candidate.x, candidate.z, AVATAR_COLLISION_RADIUS)) {
    return false;
  }
  for (let i = 0; i < obstacles.length; i += 1) {
    const ob = obstacles[i];
    if (ignoredIds?.has(ob.id)) continue;
    if (distancePointToAabb(candidate, ob) < minClearance) {
      return false;
    }
  }
  for (let i = 0; i < peerPositions.length; i += 1) {
    const peer = peerPositions[i];
    if (Math.hypot(candidate.x - peer.x, candidate.z - peer.z) < AVATAR_MIN_SEPARATION) {
      return false;
    }
  }
  return true;
}

/**
 * Finds the nearest valid avatar placement point on solid quay/pier land that is at least
 * `minClearance` (default `0.8m`) away from EVERY prop/building/scaffolding collider and
 * `>= AVATAR_MIN_SEPARATION` from all already-placed peer avatars.
 */
export function resolveAvatarPropClearance(
  desired: Vec2,
  obstacles: readonly ObstacleBox2D[] = HARBOR_ALL_OBSTACLES,
  peerPositions: readonly Vec2[] = [],
  minClearance = AVATAR_PROP_MIN_CLEARANCE,
  ignoredIds?: ReadonlySet<string>,
): Vec2 {
  const effectiveClearance = Math.max(AVATAR_COLLISION_RADIUS, minClearance);
  if (isPointClearOfPropsAndPeers(desired, obstacles, peerPositions, effectiveClearance, ignoredIds)) {
    return desired;
  }

  // Deterministic concentric spiral search for the closest open walkable spot
  const maxRadius = 18.0;
  const radiusStep = 0.45;
  const angleSteps = 24;
  for (let r = radiusStep; r <= maxRadius; r += radiusStep) {
    for (let a = 0; a < angleSteps; a += 1) {
      const theta = (a / angleSteps) * Math.PI * 2;
      const cand: Vec2 = {
        x: desired.x + Math.cos(theta) * r,
        z: desired.z + Math.sin(theta) * r,
      };
      if (isPointClearOfPropsAndPeers(cand, obstacles, peerPositions, effectiveClearance, ignoredIds)) {
        return cand;
      }
    }
  }

  // Fallback: push directly out of colliders and clamp onto walkable apron
  let fallback = clampToWalkableEdge(desired, desired, AVATAR_COLLISION_RADIUS);
  for (let pass = 0; pass < 3; pass += 1) {
    for (let i = 0; i < obstacles.length; i += 1) {
      if (ignoredIds?.has(obstacles[i].id)) continue;
      fallback = pushCircleOutOfAabb(fallback, effectiveClearance, obstacles[i]);
    }
    fallback = clampToWalkableEdge(desired, fallback, AVATAR_COLLISION_RADIUS);
  }
  return fallback;
}

/**
 * Resolves full avatar movement with:
 *   1. Continuous sweep-substep prevention (blocks high-speed tunneling through thin walls)
 *   2. Static AABB obstacle sliding (buildings, cranes, container stacks, lamp posts, benches, scaffolding)
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
 * Separates a set of spawned avatar positions so:
 *   - Every avatar is on solid walkable land (NEVER water)
 *   - Every avatar is at least `minPropClearance` (0.8m) away from lamp posts, benches, planters,
 *     buildings, cranes, and scaffolding colliders
 *   - No two avatars overlap (`>= AVATAR_MIN_SEPARATION`)
 */
export function resolveAvatarSpawnOverlaps<T extends { position: { x: number; y: number; z: number } }>(
  items: T[],
  obstacles: readonly ObstacleBox2D[] = HARBOR_ALL_OBSTACLES,
  minPropClearance = AVATAR_PROP_MIN_CLEARANCE,
): T[] {
  const placed: Vec2[] = [];
  return items.map((item) => {
    const pos = resolveAvatarPropClearance(
      { x: item.position.x, z: item.position.z },
      obstacles,
      placed,
      minPropClearance,
    );
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
 * or inside solid portal/hub buildings.
 * Allows low eye-level close-up framing (`+0.95m` above quay deck = `2.56m`) so quay workers
 * can fill >= 1/3 of the viewport height without ever clipping beneath the ground or water.
 */
export function clampCameraCollision(
  cam: { x: number; y: number; z: number },
  obstacles: readonly ObstacleBox2D[] = HARBOR_STATIC_COLLIDERS,
): { x: number; y: number; z: number } {
  const minDeckY = isOnWalkableLand(cam.x, cam.z, 0)
    ? sampleHarborElevation(cam.x, cam.z) + CAMERA_MIN_LAND_CLEARANCE_Y
    : CAMERA_MIN_WATER_CLEARANCE_Y;
  let x = cam.x;
  let y = Math.max(minDeckY, cam.y);
  let z = cam.z;

  // If camera is low enough to intersect solid tall quay structures (height ~6.2m), push outside AABB.
  // Skip low-height ground props (`prop_bench_*`, `prop_planter_*`, `prop_lamp_*`) so close-up
  // person framing near a bench or lamp post stays smooth without jarring lateral snaps.
  if (y < 7.2) {
    for (let i = 0; i < obstacles.length; i += 1) {
      const ob = obstacles[i];
      if (ob.id.startsWith('prop_')) continue;
      if (x >= ob.minX - 0.85 && x <= ob.maxX + 0.85 && z >= ob.minZ - 0.85 && z <= ob.maxZ + 0.85) {
        const pushed = pushCircleOutOfAabb({ x, z }, 1.0, ob);
        x = pushed.x;
        z = pushed.z;
      }
    }
  }

  return { x, y, z };
}

export interface PersonFocusCameraPose {
  cameraPos: { x: number; y: number; z: number };
  targetPos: { x: number; y: number; z: number };
  distance: number;
}

/**
 * Pure solver for Stage 10 close-up colleague focus framing:
 * Positions the camera `3.0..6.0m` (preferred `4.5m`) in front of the colleague at natural
 * chest/eye level so their helmet, face, hands, workwear, and reflective stripes fill >= 1/3
 * of the viewport height while avoiding buildings and never clipping below ground/water.
 */
export function computePersonFocusCameraPose(
  personPos: { x: number; y: number; z: number },
  facingYaw: number,
  isSeated: boolean,
  obstacles: readonly ObstacleBox2D[] = HARBOR_STATIC_COLLIDERS,
  preferredDistance = CAMERA_PERSON_FOCUS_DEFAULT_DIST,
): PersonFocusCameraPose {
  const clampedDist = Math.max(
    CAMERA_PERSON_FOCUS_MIN_DIST + 0.3,
    Math.min(CAMERA_PERSON_FOCUS_MAX_DIST - 0.3, preferredDistance),
  );
  const targetY = personPos.y + (isSeated ? 1.25 : 1.55);
  const targetPos = { x: personPos.x, y: targetY, z: personPos.z };

  // Slight front-3/4 angle so key directional light sculpts face, hands & reflective vest cleanly
  const baseYaw = isSeated ? 0 : facingYaw;
  const candidateOffsets = [0.22, -0.22, 0.58, -0.58, 1.15, -1.15, Math.PI];
  const verticalLift = isSeated ? 0.85 : 0.72;
  const horizDist = Math.sqrt(Math.max(4.0, clampedDist * clampedDist - verticalLift * verticalLift));

  for (const offset of candidateOffsets) {
    const yaw = baseYaw + offset;
    const rawCam = {
      x: personPos.x + Math.sin(yaw) * horizDist,
      y: targetY + verticalLift,
      z: personPos.z + Math.cos(yaw) * horizDist,
    };
    const clamped = clampCameraCollision(rawCam, obstacles);
    const actualDist = Math.hypot(
      clamped.x - targetPos.x,
      clamped.y - targetPos.y,
      clamped.z - targetPos.z,
    );
    if (
      actualDist >= CAMERA_PERSON_FOCUS_MIN_DIST &&
      actualDist <= CAMERA_PERSON_FOCUS_MAX_DIST
    ) {
      return {
        cameraPos: clamped,
        targetPos,
        distance: Number(actualDist.toFixed(2)),
      };
    }
  }

  // Guaranteed safe fallback facing harbor (+Z) at exact clamped distance
  const fallbackRaw = {
    x: personPos.x + 0.8,
    y: targetY + verticalLift,
    z: personPos.z + horizDist,
  };
  const clamped = clampCameraCollision(fallbackRaw, obstacles);
  const dx = clamped.x - targetPos.x;
  const dy = clamped.y - targetPos.y;
  const dz = clamped.z - targetPos.z;
  const rawLen = Math.hypot(dx, dy, dz) || 1;
  const finalLen = Math.max(
    CAMERA_PERSON_FOCUS_MIN_DIST,
    Math.min(CAMERA_PERSON_FOCUS_MAX_DIST, rawLen),
  );
  const scaled = clampCameraCollision(
    {
      x: targetPos.x + (dx / rawLen) * finalLen,
      y: targetPos.y + (dy / rawLen) * finalLen,
      z: targetPos.z + (dz / rawLen) * finalLen,
    },
    obstacles,
  );
  const finalDist = Math.hypot(
    scaled.x - targetPos.x,
    scaled.y - targetPos.y,
    scaled.z - targetPos.z,
  );
  return {
    cameraPos: scaled,
    targetPos,
    distance: Number(finalDist.toFixed(2)),
  };
}

/**
 * Pure screen-height projection fraction helper for verifying Stage 10 Requirement #1:
 * `fraction = objectHeight / (2 * distance * tan(fovDeg / 2))`.
 */
export function computeProjectedScreenHeightFraction(
  objectHeightM: number,
  cameraDistanceM: number,
  fovDeg = 50,
): number {
  if (cameraDistanceM <= 0 || objectHeightM <= 0) return 0;
  const halfFovRad = ((fovDeg * Math.PI) / 180) * 0.5;
  return objectHeightM / (2 * cameraDistanceM * Math.tan(halfFovRad));
}

export interface PolarAngleBounds {
  minPolarAngle: number;
  maxPolarAngle: number;
  closeBlend: number;
}

/**
 * Smoothly blends OrbitControls polar-angle bounds as camera distance enters close-up range
 * (`CAMERA_CLOSE_ZOOM_BLEND_START` -> `CAMERA_CLOSE_ZOOM_BLEND_END`) so distant harbor overviews
 * keep full freedom while max wheel zoom frames the quay worker cleanly without diving into water.
 */
export function computePolarAngleBoundsForDistance(distance: number): PolarAngleBounds {
  const rawT =
    (CAMERA_CLOSE_ZOOM_BLEND_START - distance) /
    (CAMERA_CLOSE_ZOOM_BLEND_START - CAMERA_CLOSE_ZOOM_BLEND_END);
  const t = Math.max(0, Math.min(1, rawT));
  if (t <= 0) {
    return {
      minPolarAngle: CAMERA_FAR_MIN_POLAR_ANGLE,
      maxPolarAngle: CAMERA_FAR_MAX_POLAR_ANGLE,
      closeBlend: 0,
    };
  }
  if (t >= 1) {
    return {
      minPolarAngle: CAMERA_CLOSE_MIN_POLAR_ANGLE,
      maxPolarAngle: CAMERA_CLOSE_MAX_POLAR_ANGLE,
      closeBlend: 1,
    };
  }
  const closeBlend = t * t * (3 - 2 * t);
  return {
    minPolarAngle:
      CAMERA_FAR_MIN_POLAR_ANGLE +
      (CAMERA_CLOSE_MIN_POLAR_ANGLE - CAMERA_FAR_MIN_POLAR_ANGLE) * closeBlend,
    maxPolarAngle:
      CAMERA_FAR_MAX_POLAR_ANGLE +
      (CAMERA_CLOSE_MAX_POLAR_ANGLE - CAMERA_FAR_MAX_POLAR_ANGLE) * closeBlend,
    closeBlend,
  };
}

export interface CloseZoomFramingResult {
  cameraPos: { x: number; y: number; z: number };
  targetPos: { x: number; y: number; z: number };
  distance: number;
  polarAngle: number;
  closeBlend: number;
}

/**
 * Stage 11 Close-Zoom Camera Framing Solver:
 * When the user scrolls the mouse wheel all the way in during free orbit (outside `focusPerson`),
 * prevents the camera from diving into open water or cropping the worker's head:
 *   1. Leaves far-range camera (`distance >= 26m`) untouched (except standard collision floor).
 *   2. Smoothly pulls an over-water Home Harbor target onto the quay worker apron (`quayAnchor`).
 *   3. Locks target elevation to quay worker chest height (`deck + 1.45m`) so boots-to-helmet stay centered.
 *   4. Clamps distance `>= CAMERA_WHEEL_MIN_DISTANCE` (`5.2m`) and polar angle into `[1.24, 1.44]` rad,
 *      keeping water coverage <= 40% across all azimuths while preserving full body + quay surroundings.
 *   5. Applies `clampCameraCollision` so ground/water penetration remains impossible.
 */
export function clampCloseZoomCameraFraming(
  cameraPos: { x: number; y: number; z: number },
  targetPos: { x: number; y: number; z: number },
  quayAnchor: { x: number; z: number },
  obstacles: readonly ObstacleBox2D[] = HARBOR_STATIC_COLLIDERS,
): CloseZoomFramingResult {
  const dx0 = cameraPos.x - targetPos.x;
  const dy0 = cameraPos.y - targetPos.y;
  const dz0 = cameraPos.z - targetPos.z;
  const rawDist = Math.hypot(dx0, dy0, dz0);
  const { minPolarAngle, maxPolarAngle, closeBlend } =
    computePolarAngleBoundsForDistance(rawDist);

  if (closeBlend <= 0) {
    const safeCam = clampCameraCollision(cameraPos, obstacles);
    const sdx = safeCam.x - targetPos.x;
    const sdy = safeCam.y - targetPos.y;
    const sdz = safeCam.z - targetPos.z;
    const dist = Math.hypot(sdx, sdy, sdz) || 1;
    return {
      cameraPos: safeCam,
      targetPos: { ...targetPos },
      distance: dist,
      polarAngle: Math.acos(Math.max(-1, Math.min(1, sdy / dist))),
      closeBlend: 0,
    };
  }

  let tx = targetPos.x;
  let ty = targetPos.y;
  let tz = targetPos.z;

  // Pull open-water Home Harbor target onto quay apron so wheel-zooming from Harbor View frames the quay worker
  const inHomeHarborBasin = Math.abs(tx) <= 115 && tz <= 95;
  const targetIsOverWaterOrEdge = isOverWater(tx, tz) || tz > QUAY_CLOSE_ZOOM_MAX_TARGET_Z;
  if (inHomeHarborBasin && targetIsOverWaterOrEdge) {
    const safeAnchorX = Math.max(-88, Math.min(88, quayAnchor.x));
    const safeAnchorZ = Math.min(QUAY_CLOSE_ZOOM_MAX_TARGET_Z, quayAnchor.z);
    tx = tx + (safeAnchorX - tx) * closeBlend;
    tz = tz + (safeAnchorZ - tz) * closeBlend;
  }

  // Anchor target height to worker chest height on quay deck so head and boots stay cleanly in frame
  if (isOnWalkableLand(tx, tz, 0)) {
    const desiredChestY = sampleHarborElevation(tx, tz) + WORKER_CHEST_HEIGHT_OFFSET;
    ty = ty + (desiredChestY - ty) * closeBlend;
  }

  const dist = Math.max(CAMERA_WHEEL_MIN_DISTANCE, rawDist || CAMERA_WHEEL_MIN_DISTANCE);
  const safeRawDist = rawDist > 1e-5 ? rawDist : 1;
  const rawPolar = Math.acos(Math.max(-1, Math.min(1, dy0 / safeRawDist)));
  const polarAngle = Math.max(minPolarAngle, Math.min(maxPolarAngle, rawPolar));
  const horizMag = Math.hypot(dx0, dz0);
  const azimuth = horizMag > 1e-5 ? Math.atan2(dx0, dz0) : 0;

  const sinP = Math.sin(polarAngle);
  const cosP = Math.cos(polarAngle);
  const framedCam = {
    x: tx + dist * sinP * Math.sin(azimuth),
    y: ty + dist * cosP,
    z: tz + dist * sinP * Math.cos(azimuth),
  };

  const safeCam = clampCameraCollision(framedCam, obstacles);
  const fdx = safeCam.x - tx;
  const fdy = safeCam.y - ty;
  const fdz = safeCam.z - tz;
  const finalDist = Math.hypot(fdx, fdy, fdz) || dist;
  const finalPolar = Math.acos(Math.max(-1, Math.min(1, fdy / finalDist)));

  return {
    cameraPos: safeCam,
    targetPos: { x: tx, y: ty, z: tz },
    distance: finalDist,
    polarAngle: finalPolar,
    closeBlend,
  };
}

/**
 * Estimates the vertical fraction `[0, 1]` of the viewport showing open water (`y = 0`, outside
 * walkable quay/pier decks) using analytical ray-plane sampling across vertical NDC rows.
 * Used to verify Stage 11's `waterRatio <= 0.40` guarantee at max wheel zoom.
 */
export function estimateWaterScreenFraction(
  cameraPos: { x: number; y: number; z: number },
  targetPos: { x: number; y: number; z: number },
  fovDeg = 50,
  sampleRows = 101,
): number {
  const fx = targetPos.x - cameraPos.x;
  const fy = targetPos.y - cameraPos.y;
  const fz = targetPos.z - cameraPos.z;
  const fLen = Math.hypot(fx, fy, fz);
  if (fLen < 1e-6) return 0;
  const dirX = fx / fLen;
  const dirY = fy / fLen;
  const dirZ = fz / fLen;

  // Camera right = normalize(forward x worldUp), camera up = right x forward
  let rx = -dirZ;
  let rz = dirX;
  const rLen = Math.hypot(rx, rz);
  if (rLen > 1e-6) {
    rx /= rLen;
    rz /= rLen;
  } else {
    rx = 1;
    rz = 0;
  }
  const ux = -dirY * rz;
  const uy = rz * dirX - rx * dirZ;
  const uz = dirY * rx;
  const uLen = Math.hypot(ux, uy, uz) || 1;
  const upX = ux / uLen;
  const upY = uy / uLen;
  const upZ = uz / uLen;

  const tanHalfFov = Math.tan(((fovDeg * Math.PI) / 180) * 0.5);
  let waterHits = 0;

  for (let i = 0; i < sampleRows; i += 1) {
    const ndcY = -1 + (2 * (i + 0.5)) / sampleRows;
    const rayX = dirX + upX * (ndcY * tanHalfFov);
    const rayY = dirY + upY * (ndcY * tanHalfFov);
    const rayZ = dirZ + upZ * (ndcY * tanHalfFov);

    // Rays pointing at or above the horizon hit sky/mountains, never water
    if (rayY >= -1e-4) continue;

    // Intersect quay deck plane (y = QUAY_MAIN_DECK_Y) first — concrete quay sits above sea level
    let hitLand = false;
    if (cameraPos.y > QUAY_MAIN_DECK_Y) {
      const tDeck = (QUAY_MAIN_DECK_Y - cameraPos.y) / rayY;
      if (tDeck > 0) {
        const hx = cameraPos.x + rayX * tDeck;
        const hz = cameraPos.z + rayZ * tDeck;
        if (isOnWalkableLand(hx, hz, 0)) {
          hitLand = true;
        }
      }
    }
    if (hitLand) continue;

    // Otherwise intersect ocean surface (y = 0)
    const tWater = (0 - cameraPos.y) / rayY;
    if (tWater > 0) {
      const wx = cameraPos.x + rayX * tWater;
      const wz = cameraPos.z + rayZ * tWater;
      if (isOverWater(wx, wz)) {
        waterHits += 1;
      }
    }
  }

  return waterHits / sampleRows;
}
