import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BOARDING_PROXIMITY_RADIUS,
  BOARDING_TRANSITION_MS,
  createInitialBoardingState,
  findNearestBoardableShip,
  transitionBoardingState,
} from './boardingState';
import { mapProjectsToHarborShips } from './mapping';
import { getPreviewDemoProjects } from './previewFixtures';

describe('boardingState: quay proximity and boarding transitions', () => {
  it('transitions harbor -> boarding (600ms) -> onboard -> harbor when reducedMotion is false', () => {
    let state = createInitialBoardingState();
    assert.deepEqual(state, { phase: 'harbor', nearbyShipId: null });

    // Avatar approaches proj01
    state = transitionBoardingState(state, {
      type: 'PROXIMITY_CHANGED',
      nearbyShipId: 'proj01',
    });
    assert.deepEqual(state, { phase: 'harbor', nearbyShipId: 'proj01' });

    // Trigger boarding via E/Enter (uses nearbyShipId)
    state = transitionBoardingState(state, {
      type: 'REQUEST_BOARD',
      reducedMotion: false,
    });
    assert.deepEqual(state, {
      phase: 'boarding',
      shipId: 'proj01',
      durationMs: BOARDING_TRANSITION_MS,
    });
    assert.equal(BOARDING_TRANSITION_MS, 600);

    // Proximity updates while boarding are ignored
    const duringBoarding = transitionBoardingState(state, {
      type: 'PROXIMITY_CHANGED',
      nearbyShipId: null,
    });
    assert.deepEqual(duringBoarding, state);

    // Boarding animation completes -> onboard
    state = transitionBoardingState(state, { type: 'COMPLETE_BOARDING' });
    assert.deepEqual(state, { phase: 'onboard', shipId: 'proj01' });

    // Disembark returns cleanly to harbor
    state = transitionBoardingState(state, {
      type: 'DISEMBARK',
      nearbyShipId: 'proj01',
    });
    assert.deepEqual(state, { phase: 'harbor', nearbyShipId: 'proj01' });
  });

  it('transitions directly to onboard with zero transition delay when reducedMotion is true', () => {
    const initial = createInitialBoardingState();
    const onboard = transitionBoardingState(initial, {
      type: 'REQUEST_BOARD',
      shipId: 'proj02',
      reducedMotion: true,
    });
    assert.deepEqual(onboard, { phase: 'onboard', shipId: 'proj02' });

    // COMPLETE_BOARDING on already-onboard state is a no-op
    assert.deepEqual(
      transitionBoardingState(onboard, { type: 'COMPLETE_BOARDING' }),
      onboard,
    );
  });

  it('ignores REQUEST_BOARD when no ship is nearby and no explicit shipId is provided', () => {
    const initial = createInitialBoardingState();
    const next = transitionBoardingState(initial, {
      type: 'REQUEST_BOARD',
      reducedMotion: false,
    });
    assert.deepEqual(next, initial);
  });

  it('finds the nearest boardable ship within BOARDING_PROXIMITY_RADIUS', () => {
    const now = Date.parse('2026-11-26T12:00:00.000Z');
    const ships = mapProjectsToHarborShips(getPreviewDemoProjects(now), now);
    const first = ships[0];

    const exact = findNearestBoardableShip(
      { x: first.boardingPoint.x, z: first.boardingPoint.z },
      ships,
    );
    assert.equal(exact?.id, first.id);

    const outOfRange = findNearestBoardableShip(
      { x: first.boardingPoint.x + 200, z: first.boardingPoint.z - 200 },
      ships,
      BOARDING_PROXIMITY_RADIUS,
    );
    assert.equal(outOfRange, null);
  });
});
