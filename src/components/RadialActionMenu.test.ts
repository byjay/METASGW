import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { mapEmployeesToHarborPeople, mapProjectsToHarborShips } from '../mapping';
import {
  getPreviewDemoEmployees,
  getPreviewDemoPresence,
  getPreviewDemoProjects,
  getPreviewDemoUser,
} from '../previewFixtures';
import {
  buildRadialMenuActions,
  clampRadialCenter,
  RadialActionMenu,
  resolveRadialDirectionFromKey,
} from './RadialActionMenu';

describe('RadialActionMenu — 4-way cardinal deep links, keyboard & 375px clamping', () => {
  const now = 1_700_000_000_000;
  const user = getPreviewDemoUser();
  const ships = mapProjectsToHarborShips(getPreviewDemoProjects(now), now);
  const people = mapEmployeesToHarborPeople(
    getPreviewDemoEmployees(),
    getPreviewDemoPresence(now),
    user.sub,
    now,
  );
  const targetPerson = people.find((p) => p.sub !== user.sub) ?? people[0];
  const targetShip = ships[0];

  it('builds exact 4 cardinal deep links for a person target (12시 DM, 3시 NAS, 6시 SEDMS, 9시 bmail)', () => {
    const items = buildRadialMenuActions({
      kind: 'person',
      person: targetPerson,
      anchor: { x: 400, y: 300 },
    });

    assert.equal(items.length, 4);
    assert.deepEqual(
      items.map((item) => [item.direction, item.clockLabel, item.label]),
      [
        ['north', '12시', '대화'],
        ['east', '3시', 'NAS'],
        ['south', '6시', 'SEDMS'],
        ['west', '9시', '메일'],
      ],
    );
    assert.equal(items[0].href, `/talk/?dm=${encodeURIComponent(targetPerson.sub)}`);
    assert.equal(items[1].href, '/nas/');
    assert.equal(items[2].href, '/api/sedms-sso?return=%2Fprojects');
    assert.equal(items[3].href, 'bmail://inbox');
  });

  it('builds exact 4 cardinal deep links for a ship target (12시 room, 3시 NAS, 6시 SEDMS project, 9시 bmail)', () => {
    const items = buildRadialMenuActions({
      kind: 'ship',
      ship: targetShip,
      anchor: { x: 640, y: 400 },
    });

    assert.equal(items.length, 4);
    assert.equal(items[0].href, `/talk/?room=${encodeURIComponent(targetShip.id)}`);
    assert.equal(items[1].href, '/nas/');
    assert.equal(
      items[2].href,
      `/api/sedms-sso?return=${encodeURIComponent(`/project/${targetShip.id}`)}`,
    );
    assert.equal(items[3].href, 'bmail://inbox');
  });

  it('maps arrow keys and Tab cleanly to 4 cardinal directions', () => {
    assert.equal(resolveRadialDirectionFromKey('ArrowUp', 'south'), 'north');
    assert.equal(resolveRadialDirectionFromKey('ArrowRight', 'north'), 'east');
    assert.equal(resolveRadialDirectionFromKey('ArrowDown', 'east'), 'south');
    assert.equal(resolveRadialDirectionFromKey('ArrowLeft', 'north'), 'west');
    assert.equal(resolveRadialDirectionFromKey('Tab', 'north'), 'east');
    assert.equal(resolveRadialDirectionFromKey('Tab', 'west'), 'north');
    assert.equal(resolveRadialDirectionFromKey('KeyX', 'north'), null);
  });

  it('clamps radial menu center inside 375x812 mobile viewport so buttons never clip off-screen', () => {
    const topLeft = clampRadialCenter({ x: 8, y: 12 }, { width: 375, height: 812 }, 132);
    assert.ok(topLeft.x >= 132 && topLeft.x <= 375 - 132);
    assert.ok(topLeft.y >= 176 && topLeft.y <= 812 - 176);

    const bottomRight = clampRadialCenter({ x: 370, y: 805 }, { width: 375, height: 812 }, 132);
    assert.ok(bottomRight.x >= 132 && bottomRight.x <= 375 - 132);
    assert.ok(bottomRight.y >= 176 && bottomRight.y <= 812 - 176);
  });

  it('renders accessible dialog with all 4 cardinal anchors and ship boarding button', () => {
    const html = renderToStaticMarkup(
      React.createElement(RadialActionMenu, {
        target: { kind: 'ship', ship: targetShip, anchor: { x: 600, y: 400 } },
        runtimeEnv: 'preview',
        viewportSize: { width: 1280, height: 800 },
        onBoardShip: () => {},
        onPreviewLinkBlocked: () => {},
        onClose: () => {},
      }),
    );

    assert.ok(html.includes('role="dialog"'));
    assert.ok(html.includes('data-testid="radial-action-menu"'));
    assert.ok(html.includes('data-testid="radial-item-north"'));
    assert.ok(html.includes('data-testid="radial-item-east"'));
    assert.ok(html.includes('data-testid="radial-item-south"'));
    assert.ok(html.includes('data-testid="radial-item-west"'));
    assert.ok(html.includes('승선'));
  });
});
