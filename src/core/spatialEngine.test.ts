import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampShipPosition,
  evaluateProximityState,
  HarborDHTNode,
  resolveFaroViewerMode,
  resolveRtcNetworkState,
} from './spatialEngine';
import { calculateSkillTokenBudget, GLOBAL_SKILLS_REGISTRY } from '../config/globalSkillsConfig';

test('HarborDHTNode queries AoI interest and predicts next zone from velocity', () => {
  const dht = new HarborDHTNode();
  dht.upsertAgent({
    id: 'player',
    shipId: 'tug_captain',
    name: '끌배',
    actorRole: 'employee',
    position: { x: 0, z: 4 },
    velocity: { x: 0, z: -5 },
  });
  dht.upsertAgent({
    id: 'faro_survey',
    shipId: 'faro_survey',
    name: '둘레호',
    actorRole: 'partner',
    position: { x: 0, z: -6 },
    velocity: { x: 0, z: 0 },
  });

  assert.deepEqual(dht.getLocation('player'), { x: 0, z: 4 });
  const inRange = dht.getInterest('player', 12);
  assert.equal(inRange.length, 1);
  assert.equal(inRange[0].id, 'faro_survey');

  const pred = dht.predictNextInterestZone('player', { x: 0, z: -5 }, 2.0);
  assert.equal(pred.nearestModule?.moduleId, 'faro360');
});

test('evaluateProximityState caps video bubble at 4 peers and mutes in Silent Focus Zone', () => {
  const peers = Array.from({ length: 6 }, (_, i) => ({
    id: `npc-${i}`,
    shipId: 'tug_captain' as const,
    name: `선박-${i}`,
    actorRole: 'employee' as const,
    position: { x: i * 1.2, z: 10 },
    velocity: { x: 0, z: 0 },
  }));

  const bubble = evaluateProximityState({
    playerPos: { x: 0, z: 10 },
    otherAgents: peers,
    tenantId: 'seastar',
    projectId: 'H1042',
  });
  assert.equal(bubble.mode, 'bubble');
  assert.equal(bubble.peers.length, 4);

  const silent = evaluateProximityState({
    playerPos: { x: 48, z: -25.5 }, // Walking inside PDF VIEW Silent Focus Zone Library!
    otherAgents: peers,
    tenantId: 'seastar',
    projectId: 'H1042',
  });
  assert.equal(silent.mode, 'silent');
  assert.equal(silent.audioMutedBySilentZone, true);
  assert.equal(silent.livekitRoomKey, null);
});

test('FARO 360 auto-branches to ViewerFX for external partners and TURN 443 failover works', () => {
  const hqFaro = resolveFaroViewerMode('employee', '.fls', 'H1042');
  assert.equal(hqFaro.engine, 'FARO WebShare');
  assert.equal(hqFaro.formatSupported, true);
  assert.equal(hqFaro.readOnly, false);

  const partnerFls = resolveFaroViewerMode('partner', '.fls', 'H1042');
  assert.equal(partnerFls.engine, 'ViewerFX');
  assert.equal(partnerFls.formatSupported, false);
  assert.equal(partnerFls.readOnly, true);

  const partnerE57 = resolveFaroViewerMode('partner', '.e57', 'H1042');
  assert.equal(partnerE57.formatSupported, true);

  const rtcFallback = resolveRtcNetworkState(true);
  assert.equal(rtcFallback.turnPort, 443);
  assert.equal(rtcFallback.transport, 'tcp');
  assert.equal(rtcFallback.masqueradeMode, 'HTTPS');
  assert.ok(rtcFallback.failoverMs < 1500);
});

test('clampShipPosition keeps vessels inside 2X navigable harbor water', () => {
  const clampedNorth = clampShipPosition({ x: 0, z: -25 });
  assert.ok(clampedNorth.z >= -8.2);

  const clampedWestPier = clampShipPosition({ x: -62, z: 10 });
  assert.ok(clampedWestPier.x >= -51.5);
});

test('Global skills token optimizer cuts idle token load by over 85%', () => {
  const allIds = GLOBAL_SKILLS_REGISTRY.map((s) => s.id);
  const stats = calculateSkillTokenBudget(allIds);
  assert.equal(stats.selectedCount, 9);
  assert.ok(stats.savingsPercent >= 85);
});
