import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AccessibleListView } from './components/AccessibleListView.tsx';
import { BottomControlDock } from './components/BottomControlDock.tsx';
import { SEDMS_PROJECTS_LOGIN_URL } from './deepLink.ts';
import {
  fetchSedmsProjects,
  resetProjectsCache,
  SEDMS_EMPTY_PROJECTS_MESSAGE,
  SEDMS_UNAVAILABLE_MESSAGE,
  SEDMS_UNMAPPED_MESSAGE,
  type SgwUser,
} from './sgwAdapter.ts';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

const SAMPLE_USER: SgwUser = {
  sub: 'user01',
  name: 'user01',
  dept: 'dept01',
  title: 'member',
  role: 'member',
  isPartner: false,
};

describe('SEDMS projects gateway response states (mapped:false / available:false / mapped:true empty)', () => {
  beforeEach(() => {
    resetProjectsCache();
  });

  it('handles {ok:true, projects:[], mapped:false} as unmapped with exact prompt guidance & /api/sedms-sso?return=/projects link (never cached)', async () => {
    let calls = 0;
    const mockFetch = async () => {
      calls += 1;
      return jsonResponse({ ok: true, projects: [], mapped: false });
    };

    const res1 = await fetchSedmsProjects({ runtimeEnv: 'sgw', fetchImpl: mockFetch, nowMs: 1000 });
    assert.equal(res1.status, 'unmapped');
    if (res1.status === 'unmapped') {
      assert.equal(res1.message, SEDMS_UNMAPPED_MESSAGE);
      assert.equal(res1.message, 'SEDMS 에 한 번 로그인하면 내 프로젝트 배가 보입니다');
      assert.equal(res1.ssoUrl, '/api/sedms-sso?return=/projects');
      assert.equal(res1.projects.length, 0);
    }

    // Must not cache unmapped state so user sees projects right after logging into SEDMS
    await fetchSedmsProjects({ runtimeEnv: 'sgw', fetchImpl: mockFetch, nowMs: 5000 });
    assert.equal(calls, 2);
  });

  it('handles available:false as unavailable ("SEDMS 연결 준비 중") whether ok is true or false', async () => {
    const resTrue = await fetchSedmsProjects({
      runtimeEnv: 'sgw',
      fetchImpl: async () => jsonResponse({ ok: true, projects: [], available: false }),
      nowMs: 1000,
    });
    assert.equal(resTrue.status, 'unavailable');
    if (resTrue.status === 'unavailable') {
      assert.equal(resTrue.message, 'SEDMS 연결 준비 중');
      assert.equal(resTrue.projects.length, 0);
    }

    const resFalse = await fetchSedmsProjects({
      runtimeEnv: 'sgw',
      fetchImpl: async () => jsonResponse({ ok: false, projects: [], available: false, mapped: false }),
      nowMs: 2000,
    });
    assert.equal(resFalse.status, 'unavailable');
    if (resFalse.status === 'unavailable') {
      assert.equal(resFalse.message, SEDMS_UNAVAILABLE_MESSAGE);
    }
  });

  it('handles {ok:true, projects:[], mapped:true} as ready with 0 projects', async () => {
    const res = await fetchSedmsProjects({
      runtimeEnv: 'sgw',
      fetchImpl: async () => jsonResponse({ ok: true, projects: [], mapped: true }),
      nowMs: 1000,
    });
    assert.equal(res.status, 'ready');
    if (res.status === 'ready') {
      assert.equal(res.mapped, true);
      assert.equal(res.projects.length, 0);
    }
  });

  it('renders unmapped, unavailable, and mapped-empty states accurately in AccessibleListView & BottomControlDock', () => {
    const baseListProps = {
      user: SAMPLE_USER,
      runtimeEnv: 'sgw' as const,
      ships: [],
      projectsMessage: '',
      people: [],
      webglSupported: true,
      onRefreshProjects: () => {},
      onSelectShip: () => {},
      onSelectPerson: () => {},
      onPreviewLinkBlocked: () => {},
    };

    // 1) mapped: false
    const unmappedListHtml = renderToStaticMarkup(
      React.createElement(AccessibleListView, {
        ...baseListProps,
        projectsState: 'unmapped',
        projectsMessage: SEDMS_UNMAPPED_MESSAGE,
      }),
    );
    assert.ok(unmappedListHtml.includes('SEDMS 에 한 번 로그인하면 내 프로젝트 배가 보입니다'));
    assert.ok(unmappedListHtml.includes('SEDMS 열기'));
    assert.ok(unmappedListHtml.includes(`href="${SEDMS_PROJECTS_LOGIN_URL}"`));

    const unmappedDockHtml = renderToStaticMarkup(
      React.createElement(BottomControlDock, {
        ships: [],
        projectsState: 'unmapped',
        projectsMessage: SEDMS_UNMAPPED_MESSAGE,
        onlineCount: 0,
        totalPeopleCount: 0,
        peopleDrawerOpen: false,
        minimapOpen: false,
        onSelectShip: () => {},
        onRefreshProjects: () => {},
        onTogglePeopleDrawer: () => {},
        onToggleMinimap: () => {},
        onSwitchTo2D: () => {},
      }),
    );
    assert.ok(unmappedDockHtml.includes('SEDMS 에 한 번 로그인하면 내 프로젝트 배가 보입니다'));
    assert.ok(unmappedDockHtml.includes(`href="${SEDMS_PROJECTS_LOGIN_URL}"`));

    // 2) available: false
    const unavailableListHtml = renderToStaticMarkup(
      React.createElement(AccessibleListView, {
        ...baseListProps,
        projectsState: 'unavailable',
        projectsMessage: SEDMS_UNAVAILABLE_MESSAGE,
      }),
    );
    assert.ok(unavailableListHtml.includes('SEDMS 연결 준비 중'));

    const unavailableDockHtml = renderToStaticMarkup(
      React.createElement(BottomControlDock, {
        ships: [],
        projectsState: 'unavailable',
        projectsMessage: SEDMS_UNAVAILABLE_MESSAGE,
        onlineCount: 0,
        totalPeopleCount: 0,
        peopleDrawerOpen: false,
        minimapOpen: false,
        onSelectShip: () => {},
        onRefreshProjects: () => {},
        onTogglePeopleDrawer: () => {},
        onToggleMinimap: () => {},
        onSwitchTo2D: () => {},
      }),
    );
    assert.ok(unavailableDockHtml.includes('SEDMS 연결 준비 중'));

    // 3) mapped: true && 0 projects
    const emptyListHtml = renderToStaticMarkup(
      React.createElement(AccessibleListView, {
        ...baseListProps,
        projectsState: 'ready',
      }),
    );
    assert.ok(emptyListHtml.includes(SEDMS_EMPTY_PROJECTS_MESSAGE));
    assert.ok(emptyListHtml.includes('참여 중인 프로젝트가 없습니다'));

    const emptyDockHtml = renderToStaticMarkup(
      React.createElement(BottomControlDock, {
        ships: [],
        projectsState: 'ready',
        projectsMessage: '',
        onlineCount: 0,
        totalPeopleCount: 0,
        peopleDrawerOpen: false,
        minimapOpen: false,
        onSelectShip: () => {},
        onRefreshProjects: () => {},
        onTogglePeopleDrawer: () => {},
        onToggleMinimap: () => {},
        onSwitchTo2D: () => {},
      }),
    );
    assert.ok(emptyDockHtml.includes('참여 중인 프로젝트가 없습니다'));
  });
});
