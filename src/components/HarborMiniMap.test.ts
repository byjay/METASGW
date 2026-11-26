import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  computeNextMinimapIndex,
  HarborMiniMap,
  minimapToWorld,
  worldToMinimap,
} from './HarborMiniMap';
import { mapEmployeesToHarborPeople, mapProjectsToHarborShips } from '../mapping';
import {
  getPreviewDemoEmployees,
  getPreviewDemoPresence,
  getPreviewDemoProjects,
  getPreviewDemoUser,
} from '../previewFixtures';

describe('HarborMiniMap: keyboard navigation, coordinate mapping, and accessible markup', () => {
  it('steps through ships with Arrow keys, Home, and End with wrap-around', () => {
    assert.equal(computeNextMinimapIndex(0, 4, 'ArrowRight'), 1);
    assert.equal(computeNextMinimapIndex(1, 4, 'ArrowDown'), 2);
    assert.equal(computeNextMinimapIndex(3, 4, 'ArrowRight'), 0);
    assert.equal(computeNextMinimapIndex(0, 4, 'ArrowLeft'), 3);
    assert.equal(computeNextMinimapIndex(2, 4, 'ArrowUp'), 1);
    assert.equal(computeNextMinimapIndex(2, 4, 'Home'), 0);
    assert.equal(computeNextMinimapIndex(0, 4, 'End'), 3);
    assert.equal(computeNextMinimapIndex(1, 4, 'Tab'), 1);
    assert.equal(computeNextMinimapIndex(0, 0, 'ArrowRight'), -1);
  });

  it('round-trips world <-> minimap coordinates accurately', () => {
    const pt = worldToMinimap(-26, 20.5, 216, 136);
    const back = minimapToWorld(pt.px, pt.py, 216, 136);
    assert.ok(Math.abs(back.wx - -26) < 1e-6);
    assert.ok(Math.abs(back.wz - 20.5) < 1e-6);
  });

  it('renders keyboard-focusable minimap surface with active ship label', () => {
    const now = Date.parse('2026-11-26T12:00:00.000Z');
    const user = getPreviewDemoUser();
    const ships = mapProjectsToHarborShips(getPreviewDemoProjects(now), now);
    const people = mapEmployeesToHarborPeople(
      getPreviewDemoEmployees(),
      getPreviewDemoPresence(now),
      user.sub,
      now,
    );

    const html = renderToStaticMarkup(
      React.createElement(HarborMiniMap, {
        open: true,
        ships,
        people,
        playerPose: { x: 0, z: -8, heading: 0 },
        activeShipId: ships[0].id,
        onSelectShip: () => {},
        onWalkToQuay: () => {},
        onClose: () => {},
      }),
    );

    assert.ok(html.includes('data-testid="harbor-minimap"'));
    assert.ok(html.includes('data-testid="minimap-kbd-surface"'));
    assert.ok(html.includes('role="application"'));
    assert.ok(html.includes('tabIndex="0"') || html.includes('tabindex="0"'));
    assert.ok(html.includes(ships[0].name));
    assert.ok(html.includes(ships[0].code));
  });
});
