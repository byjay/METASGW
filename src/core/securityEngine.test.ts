import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPartnerInviteRecord,
  revokeMembershipFourStep,
  runAutomatedQaSuite,
  scanSensitiveLeak,
  validateEgoRequest,
  validateLiveKitRoomAccess,
  validateMetaspaceAccess,
  validateNasFilePath,
  validatePostMessageFrame,
  validateSgTalkWsFrame,
} from './securityEngine';

test('SEC-01: blocks cross-tenant project URL access with 4403', () => {
  const denied = validateMetaspaceAccess({
    path: '/space/seastar/F310',
    sessionTenantId: 'seastar',
    sessionProjectId: 'H1042',
    actorId: 'emp-01',
    isRevoked: false,
  });
  assert.equal(denied.allowed, false);
  assert.equal(denied.status, 4403);

  const ok = validateMetaspaceAccess({
    path: '/space/seastar/H1042',
    sessionTenantId: 'seastar',
    sessionProjectId: 'H1042',
    actorId: 'emp-01',
    isRevoked: false,
  });
  assert.equal(ok.allowed, true);
  assert.equal(ok.status, 200);
});

test('SEC-02 & SEC-03: blocks SGTALK project tampering and LiveKit room mismatch', () => {
  const wsCheck = validateSgTalkWsFrame('H1042', 'P209');
  assert.equal(wsCheck.allowed, false);
  assert.equal(wsCheck.code, 'WS_PROJECT_TAMPER_DISCONNECT');

  const lkCheck = validateLiveKitRoomAccess('lk-seastar-P209-zone_sedms', 'seastar', 'H1042');
  assert.equal(lkCheck.allowed, false);
  assert.equal(lkCheck.code, 'LIVEKIT_ROOM_TENANT_MISMATCH');
});

test('SEC-04: blocks NAS path traversal attacks and allows safe filenames', () => {
  const attack = validateNasFilePath('H1042', 'room-1', '../../etc/passwd');
  assert.equal(attack.allowed, false);
  assert.equal(attack.code, 'PATH_TRAVERSAL_DETECTED');

  const safe = validateNasFilePath('H1042', 'room-1', 'H1042_Hull_Rev3.pdf');
  assert.equal(safe.allowed, true);
  assert.ok(safe.normalizedPath?.includes('projects/H1042/rooms/room-1/'));
});

test('SEC-05: enforces EGO AI 4-layer boundary for external partners and non-admin actions', () => {
  const extDenied = validateEgoRequest(
    {
      projectId: 'H1042',
      userId: 'partner-01',
      role: 'viewer',
      isExternal: true,
      allowedRoomIds: [],
    },
    'QUERY_DRAWING',
  );
  assert.equal(extDenied.allowed, false);
  assert.equal(extDenied.code, 'EGO_AI_ACCESS_DENIED_FOR_EXTERNAL');

  const engRestricted = validateEgoRequest(
    {
      projectId: 'H1042',
      userId: 'emp-02',
      role: 'engineer',
      isExternal: false,
      allowedRoomIds: ['ch-H1042-main'],
    },
    'SEND_EXTERNAL_EMAIL',
  );
  assert.equal(engRestricted.allowed, false);
  assert.equal(engRestricted.code, 'ACTION_REQUIRES_ADMIN_CONFIRMATION');
});

test('PostMessageGuard validates origin, namespace, and 30s time skew', () => {
  const now = 1_700_000_000_000;
  const badOrigin = validatePostMessageFrame('https://evil.test', { ns: 'sgw:v1', event: 'PING', timestamp: now, data: {} }, now);
  assert.equal(badOrigin.valid, false);

  const expired = validatePostMessageFrame(
    'https://sgw.seastar.work',
    { ns: 'sgw:v1', event: 'PING', timestamp: now - 45_000, data: {} },
    now,
  );
  assert.equal(expired.valid, false);
  assert.equal(expired.code, 'EXPIRED_TIME_SKEW');

  const valid = validatePostMessageFrame(
    'https://sgw.seastar.work',
    { ns: 'sgw:v1', event: 'PING', timestamp: now - 5_000, data: {} },
    now,
  );
  assert.equal(valid.valid, true);
});

test('Partner invite creation, 4-step revoke, leak scan, and QA suite pass', () => {
  const invite = createPartnerInviteRecord({
    tenantId: 'seastar',
    projectId: 'H1042',
    orgLabel: '대한선급 KR',
    email: 'inspector@kr.or.kr',
    memberRole: 'reviewer',
  });
  assert.equal(invite.otpCode.length, 6);
  assert.ok(invite.tokenHash.startsWith('sha256:'));

  const revoked = revokeMembershipFourStep({
    membershipId: 'm-1',
    tenantId: 'seastar',
    projectId: 'H1042',
    actorId: 'partner-kr',
    actorType: 'partner',
    displayLabel: '한검토',
    orgLabel: '대한선급 KR',
    memberRole: 'reviewer',
    status: 'active',
    tokenVersion: 1,
    expiresAt: '2026-12-31',
  });
  assert.equal(revoked.updated.status, 'revoked');
  assert.equal(revoked.updated.tokenVersion, 2);
  assert.equal(revoked.steps.length, 4);

  const leak = scanSensitiveLeak('import kakaoFreeApis from "./legacy";');
  assert.equal(leak.clean, false);

  const qa = runAutomatedQaSuite('seastar', 'H1042');
  assert.equal(qa.every((item) => item.passed), true);
});
