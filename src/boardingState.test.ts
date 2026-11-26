import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BOARDING_PROXIMITY_RADIUS,
  BOARDING_TRANSITION_MS,
  createInitialBoardingState,
  createInitialProjectSessionState,
  findNearestBoardableShip,
  transitionBoardingState,
  transitionProjectSessionState,
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

describe('projectSession: atomic cross-project state & cache isolation on ship switch / disembark', () => {
  it('immediately clears previous project panel cache, minimap selection, radial menu, and person modal when switching ships', () => {
    const now = Date.parse('2026-11-26T12:00:00.000Z');
    const ships = mapProjectsToHarborShips(getPreviewDemoProjects(now), now);
    const [shipA, shipB] = ships;
    const shipsById = new Map(ships.map((s) => [s.id, s]));

    let session = createInitialProjectSessionState();

    // Board Project A with radial menu & person modal open beforehand
    session = transitionProjectSessionState(session, {
      type: 'OPEN_RADIAL',
      target: { kind: 'ship', targetId: shipA.id, anchor: { x: 400, y: 300 } },
    });
    session = transitionProjectSessionState(session, {
      type: 'SELECT_MINIMAP_SHIP',
      shipId: shipA.id,
    });
    session = transitionProjectSessionState(session, {
      type: 'BOARD_OR_SWITCH_SHIP',
      ship: shipA,
      reducedMotion: true,
    });

    assert.equal(session.boarding.phase, 'onboard');
    assert.equal(session.panelShipSnapshot?.id, shipA.id);
    assert.equal(session.minimapSelectedShipId, shipA.id);
    assert.equal(session.radialTarget, null);
    assert.equal(session.selectedPersonSub, null);
    const epochA = session.projectSessionEpoch;

    // Open radial menu on shipA and select a person, then switch directly to shipB (even while animated)
    session = transitionProjectSessionState(session, {
      type: 'OPEN_RADIAL',
      target: { kind: 'ship', targetId: shipA.id, anchor: { x: 520, y: 260 } },
    });
    session = transitionProjectSessionState(session, {
      type: 'SELECT_PERSON',
      sub: 'user02',
    });

    const switched = transitionProjectSessionState(session, {
      type: 'BOARD_OR_SWITCH_SHIP',
      ship: shipB,
      reducedMotion: false,
    });

    // Zero frames of mixed Project A / Project B data
    assert.equal(switched.boarding.phase, 'boarding');
    if (switched.boarding.phase === 'boarding') {
      assert.equal(switched.boarding.shipId, shipB.id);
    }
    assert.equal(switched.panelShipSnapshot?.id, shipB.id);
    assert.notEqual(switched.panelShipSnapshot?.id, shipA.id);
    assert.equal(switched.minimapSelectedShipId, shipB.id);
    assert.equal(switched.radialTarget, null);
    assert.equal(switched.selectedPersonSub, null);
    assert.equal(switched.projectSessionEpoch, epochA + 1);

    const completed = transitionProjectSessionState(switched, {
      type: 'COMPLETE_BOARDING',
      shipsById,
    });
    assert.equal(completed.boarding.phase, 'onboard');
    assert.equal(completed.panelShipSnapshot?.id, shipB.id);
    assert.equal(completed.minimapSelectedShipId, shipB.id);
    assert.equal(completed.radialTarget, null);
  });

  it('atomically wipes panel snapshot, minimap selection, radial menu, and person modal on DISEMBARK', () => {
    const now = Date.parse('2026-11-26T12:00:00.000Z');
    const ships = mapProjectsToHarborShips(getPreviewDemoProjects(now), now);
    const [shipA] = ships;

    let session = createInitialProjectSessionState();
    session = transitionProjectSessionState(session, {
      type: 'BOARD_OR_SWITCH_SHIP',
      ship: shipA,
      reducedMotion: true,
    });
    session = transitionProjectSessionState(session, {
      type: 'OPEN_RADIAL',
      target: { kind: 'ship', targetId: shipA.id, anchor: { x: 300, y: 300 } },
    });
    const prevEpoch = session.projectSessionEpoch;

    const disembarked = transitionProjectSessionState(session, {
      type: 'DISEMBARK',
      nearbyShipId: null,
    });
    assert.equal(disembarked.boarding.phase, 'harbor');
    assert.equal(disembarked.panelShipSnapshot, null);
    assert.equal(disembarked.minimapSelectedShipId, null);
    assert.equal(disembarked.radialTarget, null);
    assert.equal(disembarked.selectedPersonSub, null);
    assert.equal(disembarked.projectSessionEpoch, prevEpoch + 1);
  });

  it('fails safe back to clean harbor state if the boarded ship disappears during SYNC_SHIPS', () => {
    const now = Date.parse('2026-11-26T12:00:00.000Z');
    const ships = mapProjectsToHarborShips(getPreviewDemoProjects(now), now);
    const [shipA, shipB] = ships;

    let session = createInitialProjectSessionState();
    session = transitionProjectSessionState(session, {
      type: 'BOARD_OR_SWITCH_SHIP',
      ship: shipA,
      reducedMotion: true,
    });

    // Server sync removes shipA
    const synced = transitionProjectSessionState(session, {
      type: 'SYNC_SHIPS',
      shipsById: new Map([[shipB.id, shipB]]),
    });
    assert.equal(synced.boarding.phase, 'harbor');
    assert.equal(synced.panelShipSnapshot, null);
    assert.equal(synced.minimapSelectedShipId, null);
    assert.equal(synced.radialTarget, null);
  });
});
