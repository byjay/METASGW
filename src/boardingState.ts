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

/**
 * Unified project-switch session state.
 * Guarantees that switching ships (Project A -> Project B) or disembarking
 * atomically clears the previous project's onboard panel snapshot, minimap selection,
 * radial menu target, and person modal in a single synchronous transition so
 * cross-project data can NEVER mix for even a single frame.
 */
export interface ProjectRadialSnapshot {
  kind: 'person' | 'ship' | 'decorative-ship';
  targetId: string;
  anchor: { x: number; y: number };
}

export interface HarborProjectSessionState {
  boarding: BoardingState;
  /** Onboard panel snapshot strictly bound to the active boarded ship (null while in harbor). */
  panelShipSnapshot: HarborShip | null;
  /** Currently focused/selected ship ID on the 2D minimap. */
  minimapSelectedShipId: string | null;
  /** Currently open 4-way radial menu target (cleared immediately on any board/switch/disembark). */
  radialTarget: ProjectRadialSnapshot | null;
  /** Currently open person detail modal sub (cleared immediately on any board/switch/disembark). */
  selectedPersonSub: string | null;
  /** Monotonic epoch incremented on every ship switch or disembark to force clean UI remounting. */
  projectSessionEpoch: number;
}

export type ProjectSessionEvent =
  | { type: 'PROXIMITY_CHANGED'; nearbyShipId: string | null }
  | { type: 'BOARD_OR_SWITCH_SHIP'; ship: HarborShip; reducedMotion: boolean }
  | { type: 'COMPLETE_BOARDING'; shipsById: ReadonlyMap<string, HarborShip> }
  | { type: 'DISEMBARK'; nearbyShipId?: string | null }
  | { type: 'OPEN_RADIAL'; target: ProjectRadialSnapshot }
  | { type: 'CLOSE_RADIAL' }
  | { type: 'SELECT_MINIMAP_SHIP'; shipId: string | null }
  | { type: 'SELECT_PERSON'; sub: string | null }
  | { type: 'SYNC_SHIPS'; shipsById: ReadonlyMap<string, HarborShip> };

export function createInitialProjectSessionState(): HarborProjectSessionState {
  return {
    boarding: createInitialBoardingState(),
    panelShipSnapshot: null,
    minimapSelectedShipId: null,
    radialTarget: null,
    selectedPersonSub: null,
    projectSessionEpoch: 0,
  };
}

export function transitionProjectSessionState(
  state: HarborProjectSessionState,
  event: ProjectSessionEvent,
): HarborProjectSessionState {
  switch (event.type) {
    case 'PROXIMITY_CHANGED': {
      const nextBoarding = transitionBoardingState(state.boarding, event);
      if (nextBoarding === state.boarding) return state;
      return { ...state, boarding: nextBoarding };
    }

    case 'BOARD_OR_SWITCH_SHIP': {
      const nextBoarding = transitionBoardingState(state.boarding, {
        type: 'REQUEST_BOARD',
        shipId: event.ship.id,
        reducedMotion: event.reducedMotion,
      });
      // Atomically purge previous project's panel cache, minimap selection, radial menu, and person modal
      return {
        boarding: nextBoarding,
        panelShipSnapshot: event.ship,
        minimapSelectedShipId: event.ship.id,
        radialTarget: null,
        selectedPersonSub: null,
        projectSessionEpoch: state.projectSessionEpoch + 1,
      };
    }

    case 'COMPLETE_BOARDING': {
      if (state.boarding.phase !== 'boarding') return state;
      const freshShip = event.shipsById.get(state.boarding.shipId) ?? null;
      if (!freshShip) {
        // Ship disappeared during boarding -> fail safe back to harbor with all project state cleared
        return {
          boarding: createInitialBoardingState(),
          panelShipSnapshot: null,
          minimapSelectedShipId: null,
          radialTarget: null,
          selectedPersonSub: null,
          projectSessionEpoch: state.projectSessionEpoch + 1,
        };
      }
      return {
        ...state,
        boarding: transitionBoardingState(state.boarding, { type: 'COMPLETE_BOARDING' }),
        panelShipSnapshot: freshShip,
        minimapSelectedShipId: freshShip.id,
        radialTarget: null,
      };
    }

    case 'DISEMBARK': {
      const nextBoarding = transitionBoardingState(state.boarding, {
        type: 'DISEMBARK',
        nearbyShipId: event.nearbyShipId ?? null,
      });
      return {
        boarding: nextBoarding,
        panelShipSnapshot: null,
        minimapSelectedShipId: null,
        radialTarget: null,
        selectedPersonSub: null,
        projectSessionEpoch: state.projectSessionEpoch + 1,
      };
    }

    case 'OPEN_RADIAL': {
      return {
        ...state,
        radialTarget: event.target,
        selectedPersonSub: null,
      };
    }

    case 'CLOSE_RADIAL': {
      if (state.radialTarget === null) return state;
      return { ...state, radialTarget: null };
    }

    case 'SELECT_MINIMAP_SHIP': {
      if (state.minimapSelectedShipId === event.shipId) return state;
      return { ...state, minimapSelectedShipId: event.shipId };
    }

    case 'SELECT_PERSON': {
      if (state.selectedPersonSub === event.sub) return state;
      return {
        ...state,
        selectedPersonSub: event.sub,
        radialTarget: event.sub !== null ? null : state.radialTarget,
      };
    }

    case 'SYNC_SHIPS': {
      const nextMinimapId =
        state.minimapSelectedShipId && event.shipsById.has(state.minimapSelectedShipId)
          ? state.minimapSelectedShipId
          : null;
      const nextRadial =
        state.radialTarget?.kind === 'ship' && !event.shipsById.has(state.radialTarget.targetId)
          ? null
          : state.radialTarget;

      if (state.boarding.phase === 'harbor') {
        const nextNearby =
          state.boarding.nearbyShipId && event.shipsById.has(state.boarding.nearbyShipId)
            ? state.boarding.nearbyShipId
            : null;
        return {
          ...state,
          boarding: { phase: 'harbor', nearbyShipId: nextNearby },
          panelShipSnapshot: null,
          minimapSelectedShipId: nextMinimapId,
          radialTarget: nextRadial,
        };
      }

      const freshBoarded = event.shipsById.get(state.boarding.shipId) ?? null;
      if (!freshBoarded) {
        return {
          boarding: createInitialBoardingState(),
          panelShipSnapshot: null,
          minimapSelectedShipId: null,
          radialTarget: null,
          selectedPersonSub: null,
          projectSessionEpoch: state.projectSessionEpoch + 1,
        };
      }

      return {
        ...state,
        panelShipSnapshot: freshBoarded,
        minimapSelectedShipId: nextMinimapId ?? freshBoarded.id,
        radialTarget: nextRadial,
      };
    }
  }
}

