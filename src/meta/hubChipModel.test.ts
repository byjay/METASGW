import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HudHubStatusStrip } from '../components/HudHubStatusStrip';
import { getPreviewHubRegistry, getPreviewHubSummary } from './hubFixtures';
import {
  getHubChipStyleSpec,
  HUB_POLL_INTERVAL_MS,
  mergeHubModuleChips,
  summarizeHubChips,
} from './hubChipModel';
import type { MetaHubSummaryResponse, MetaRegistryResponse } from './hubTypes';

describe('HUD Hub System Status Chips (Stage 2/5)', () => {
  it('merges registry + summary honestly, preserves planned/nosource/unavailable statuses, and supports dynamic new modules', () => {
    const registry: MetaRegistryResponse = {
      modules: [
        { moduleId: 'sgw', name: 'SGW 그룹웨어', status: 'active', capabilities: ['summary'], entryUrl: '/talk/' },
        { moduleId: 'sedms', name: 'SEDMS 도면관리', status: 'active', capabilities: ['summary'], entryUrl: '/api/sedms-sso?return=%2Fprojects' },
        { moduleId: 'secms', name: 'SECMS 케이블', status: 'planned', capabilities: [], entryUrl: null },
        { moduleId: 'pdf', name: 'PDF 검토실', status: 'idle', capabilities: [], entryUrl: null },
      ],
    };
    const summary: MetaHubSummaryResponse = {
      projectId: 'proj01',
      generatedAt: '2026-11-27T00:00:00.000Z',
      modules: [
        { moduleId: 'sgw', status: 'active', summaryText: '접속 4명', kpi: { online: 4 }, updatedAt: '2026-11-27T00:00:00.000Z', entryUrl: '/talk/' },
        { moduleId: 'sedms', status: 'warn', summaryText: '긴급 검토 1건', kpi: { urgent: 1 }, updatedAt: '2026-11-27T00:00:00.000Z', entryUrl: '/api/sedms-sso?return=%2Fproject%2Fproj01' },
        { moduleId: 'secms', status: 'nosource', summaryText: '원천 없음', kpi: {}, updatedAt: null, entryUrl: null },
        { moduleId: 'pdf', status: 'unavailable', summaryText: '응답 지연', kpi: {}, updatedAt: null, entryUrl: 'javascript:alert(1)' },
        // Dynamically added future module not even listed in registry
        { moduleId: 'newmod', status: 'idle', summaryText: '대기 중', kpi: {}, updatedAt: null, entryUrl: '/newmod/' },
      ],
    };

    const chips = mergeHubModuleChips(registry, summary);
    assert.equal(chips.length, 5);

    const byId = new Map(chips.map((c) => [c.moduleId, c]));
    assert.equal(byId.get('sgw')?.disabled, false);
    assert.equal(byId.get('sgw')?.entryUrl, '/talk/');

    assert.equal(byId.get('sedms')?.status, 'warn');
    assert.equal(byId.get('sedms')?.entryUrl, '/api/sedms-sso?return=%2Fproject%2Fproj01');
    assert.ok(byId.get('sedms')?.tooltipText.includes('긴급 검토 1건'));

    assert.equal(byId.get('secms')?.status, 'nosource');
    assert.equal(byId.get('secms')?.statusLabel, '원천 없음');
    assert.equal(byId.get('secms')?.disabled, true);
    assert.ok(byId.get('secms')?.tooltipText.includes('원천 없음'));

    // Unsafe server entryUrl must be coerced to null => disabled button with reason
    assert.equal(byId.get('pdf')?.status, 'unavailable');
    assert.equal(byId.get('pdf')?.statusLabel, '일시 오류');
    assert.equal(byId.get('pdf')?.entryUrl, null);
    assert.equal(byId.get('pdf')?.disabled, true);
    assert.ok(byId.get('pdf')?.disabledReason?.includes('일시 오류'));

    // Dynamically added module renders automatically without UI code edits
    assert.equal(byId.get('newmod')?.status, 'idle');
    assert.equal(byId.get('newmod')?.entryUrl, '/newmod/');
    assert.equal(byId.get('newmod')?.disabled, false);

    // Mobile summary count prioritizes unavailable error count
    const agg = summarizeHubChips(chips);
    assert.equal(agg.total, 5);
    assert.equal(agg.unavailableCount, 1);
    assert.equal(agg.mobileSummaryLabel, '시스템 5개 · 일시 오류 1');
  });

  it('assigns distinct visual status classes (planned dashed grey, unavailable red border, active green, warn amber)', () => {
    assert.ok(getHubChipStyleSpec('active').dotClass.includes('emerald'));
    assert.ok(getHubChipStyleSpec('idle').dotClass.includes('slate'));
    assert.ok(getHubChipStyleSpec('warn').dotClass.includes('amber'));
    assert.ok(getHubChipStyleSpec('planned').containerClass.includes('border-dashed'));
    assert.equal(getHubChipStyleSpec('planned').showInlineStatusText, true);
    assert.equal(getHubChipStyleSpec('nosource').showInlineStatusText, true);
    assert.ok(getHubChipStyleSpec('unavailable').containerClass.includes('border-rose-500'));
    assert.equal(getHubChipStyleSpec('unavailable').showInlineStatusText, true);
    assert.equal(HUB_POLL_INTERVAL_MS, 45_000);
  });

  it('renders HudHubStatusStrip with clickable anchors for valid entryUrl, disabled buttons with reason tooltips for null, refresh control, and mobile summary button', () => {
    const chips = mergeHubModuleChips(getPreviewHubRegistry(), getPreviewHubSummary('proj01'));
    const html = renderToStaticMarkup(
      React.createElement(HudHubStatusStrip, {
        chips,
        runtimeEnv: 'preview',
        projectLabel: 'proj01',
        refreshing: false,
        onRefresh: () => undefined,
        onPreviewLinkBlocked: () => undefined,
      }),
    );

    assert.ok(html.includes('data-testid="hud-hub-status-strip"'));
    assert.ok(html.includes('data-testid="hub-chip-sgw"'));
    assert.ok(html.includes('href="/talk/"'));
    assert.ok(html.includes('data-testid="hub-chip-sedms"'));
    assert.ok(html.includes('href="/api/sedms-sso?return=%2Fproject%2Fproj01"'));
    assert.ok(html.includes('data-testid="hub-chip-secms"'));
    assert.ok(html.includes('border-dashed'));
    assert.ok(html.includes('준비 중'));
    assert.ok(html.includes('disabled=""'));
    assert.ok(html.includes('data-testid="hub-refresh-btn"'));
    assert.ok(html.includes('data-testid="hub-mobile-summary-toggle"'));
    assert.ok(html.includes('시스템 7개 · 주의 1'));

    // Every <button> must carry an accessible aria-label
    const buttonTags = html.match(/<button\b[^>]*>/g) ?? [];
    assert.ok(buttonTags.length >= 3);
    for (const tag of buttonTags) {
      assert.ok(/\baria-label="[^"]+"/.test(tag), `Button missing aria-label: ${tag}`);
    }
  });
});
