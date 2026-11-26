/**
 * Pure boarding flow state machine and quay proximity detector.
 *
 * Transitions:
 *   harbor (nearbyShipId) --[REQUEST_BOARD, reducedMotion=false]--> boarding (600ms) --[COMPLETE_BOARDING]--> onboard
 *   harbor (nearbyShipId) --[REQUEST_BOARD, reducedMotion=true]---> onboard (instant, 0ms)
 *   boarding | onboard    --[DISEMBARK]---------------------------> harbor
 */

import type { HarborShip } from './mapping';

export const BOARDING_TRANSITION_MS = 600;
export const BOARDING_PROXIMITY_RADIUS = 16.5;

export type BoardingState =
  | { phase: 'harbor'; nearbyShipId: string | null }
  | { phase: 'boarding'; shipId: string; durationMs: number }
  | { phase: 'onboard'; shipId: string };

export type BoardingEvent =
  | { type: 'PROXIMITY_CHANGED'; nearbyShipId: string | null }
  | { type: 'REQUEST_BOARD'; shipId?: string; reducedMotion: boolean }
  | { type: 'COMPLETE_BOARDING' }
  | { type: 'DISEMBARK'; nearbyShipId?: string | null };

export function createInitialBoardingState(): BoardingState {
  return { phase: 'harbor', nearbyShipId: null };
}

export function transitionBoardingState(
  state: BoardingState,
  event: BoardingEvent,
): BoardingState {
  switch (event.type) {
    case 'PROXIMITY_CHANGED': {
      if (state.phase !== 'harbor') return state;
      if (state.nearbyShipId === event.nearbyShipId) return state;
      return { phase: 'harbor', nearbyShipId: event.nearbyShipId };
    }

    case 'REQUEST_BOARD': {
      const targetId =
        event.shipId ?? (state.phase === 'harbor' ? state.nearbyShipId : null);
      if (!targetId) return state;

      if (event.reducedMotion) {
        return { phase: 'onboard', shipId: targetId };
      }
      return {
        phase: 'boarding',
        shipId: targetId,
        durationMs: BOARDING_TRANSITION_MS,
      };
    }

    case 'COMPLETE_BOARDING': {
      if (state.phase !== 'boarding') return state;
      return { phase: 'onboard', shipId: state.shipId };
    }

    case 'DISEMBARK': {
      if (state.phase === 'harbor') return state;
      return {
        phase: 'harbor',
        nearbyShipId: event.nearbyShipId ?? null,
      };
    }
  }
}

/**
 * Finds the nearest boardable ship whose quay boarding point is within `radius` meters of the avatar.
 */
export function findNearestBoardableShip(
  playerPos: { x: number; z: number },
  ships: readonly HarborShip[],
  radius = BOARDING_PROXIMITY_RADIUS,
): HarborShip | null {
  let best: HarborShip | null = null;
  let bestDist = radius;

  for (const ship of ships) {
    const dist = Math.hypot(
      playerPos.x - ship.boardingPoint.x,
      playerPos.z - ship.boardingPoint.z,
    );
    if (dist <= bestDist) {
      bestDist = dist;
      best = ship;
    }
  }

  return best;
}
