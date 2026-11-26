/**
 * Pseudonym-only fixtures used EXCLUSIVELY in 'preview' runtimeEnv.
 * Never imported or returned in 'sgw' runtimeEnv.
 * Strictly uses pseudonyms (user01~user05, dept01~dept03, proj01~proj04) with zero real PII.
 */

import type {
  SedmsProject,
  SgwEmployee,
  SgwPresenceEntry,
  SgwUser,
} from './sgwAdapter';

const DAY_MS = 24 * 60 * 60 * 1000;

function formatIsoDateDaysAgo(nowMs: number, daysAgo: number): string {
  return new Date(nowMs - daysAgo * DAY_MS).toISOString().slice(0, 10);
}

export function getPreviewDemoUser(): SgwUser {
  return {
    sub: 'user01',
    name: 'user01',
    dept: 'dept01',
    title: 'role01',
    role: 'member',
    isPartner: false,
  };
}

export function getPreviewDemoEmployees(): SgwEmployee[] {
  return [
    getPreviewDemoUser(),
    {
      sub: 'user02',
      name: 'user02',
      dept: 'dept01',
      title: 'role02',
      role: 'member',
      isPartner: false,
    },
    {
      sub: 'user03',
      name: 'user03',
      dept: 'dept02',
      title: 'role03',
      role: 'member',
      isPartner: false,
    },
    {
      sub: 'user04',
      name: 'user04',
      dept: 'dept03',
      title: 'role04',
      role: 'member',
      isPartner: false,
    },
    {
      sub: 'user05',
      name: 'user05',
      dept: 'dept03',
      title: 'role05',
      role: 'partner',
      isPartner: true,
    },
  ];
}

export function getPreviewDemoPresence(nowMs = Date.now()): SgwPresenceEntry[] {
  return [
    { sub: 'user01', lastSeenAt: nowMs - 2_000, online: true },
    { sub: 'user02', lastSeenAt: nowMs - 7_000, online: true },
    { sub: 'user03', lastSeenAt: nowMs - 48_000, online: false },
    { sub: 'user04', lastSeenAt: nowMs - 11_000, online: true },
    { sub: 'user05', lastSeenAt: nowMs - 4_000, online: true },
  ];
}

export function getPreviewDemoProjects(nowMs = Date.now()): SedmsProject[] {
  return [
    {
      id: 'proj01',
      code: 'VESSEL-LNG-01',
      name: 'proj01',
      role: 'manager',
      status: 'active',
      updated_at: formatIsoDateDaysAgo(nowMs, 1),
    },
    {
      id: 'proj02',
      code: 'VESSEL-CTN-02',
      name: 'proj02',
      role: 'reviewer',
      status: 'review',
      updated_at: formatIsoDateDaysAgo(nowMs, 3),
    },
    {
      id: 'proj03',
      code: 'VESSEL-TNK-03',
      name: 'proj03',
      role: 'member',
      status: 'hold',
      updated_at: formatIsoDateDaysAgo(nowMs, 6),
    },
    {
      id: 'proj04',
      code: 'VESSEL-GEN-04',
      name: 'proj04',
      role: 'viewer',
      status: 'completed',
      updated_at: formatIsoDateDaysAgo(nowMs, 12),
    },
  ];
}
