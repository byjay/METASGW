/**
 * Pure presentation & state model for the HUD Unified Hub System Status Chips (Stage 2/5).
 *
 * Designed to be 100% data-driven from `/api/meta/registry` + `/api/meta/hub/summary`
 * so adding new backend systems never requires changing UI component logic.
 */

import { isSafeNavigationUrl } from '../deepLink';
import {
  getMetaModuleStatusLabel,
  type MetaHubSummaryResponse,
  type MetaModuleId,
  type MetaModuleStatus,
  type MetaRegistryResponse,
  type ModuleStatusSummary,
} from './hubTypes';

export const HUB_POLL_INTERVAL_MS = 45_000;

export interface HubModuleChipItem {
  moduleId: MetaModuleId;
  name: string;
  status: MetaModuleStatus;
  statusLabel: string;
  summaryText: string;
  tooltipText: string;
  entryUrl: string | null;
  disabled: boolean;
  disabledReason: string | null;
  kpi: Record<string, number | string>;
  updatedAt: string | null;
}

export interface HubChipStyleSpec {
  containerClass: string;
  dotClass: string;
  statusTextClass: string;
  showInlineStatusText: boolean;
}

export interface HubChipsSummary {
  total: number;
  activeCount: number;
  idleCount: number;
  warnCount: number;
  plannedCount: number;
  nosourceCount: number;
  unavailableCount: number;
  mobileSummaryLabel: string;
}

const DEFAULT_DISABLED_REASON: Record<MetaModuleStatus, string> = {
  active: '연결 경로가 제공되지 않아 이동할 수 없습니다.',
  idle: '연결 경로가 제공되지 않아 이동할 수 없습니다.',
  warn: '연결 경로가 제공되지 않아 이동할 수 없습니다.',
  planned: '준비 중 — 연동 예정 시스템입니다.',
  nosource: '원천 없음 — 이 프로젝트에 연결된 데이터가 없습니다.',
  unavailable: '일시 오류 — 현재 시스템 응답을 받을 수 없습니다.',
};

function resolveValidEntryUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return isSafeNavigationUrl(trimmed) ? trimmed : null;
}

function buildChipTooltip(
  name: string,
  status: MetaModuleStatus,
  summaryText: string,
  disabledReason: string | null,
): string {
  const statusLabel = getMetaModuleStatusLabel(status);
  const parts: string[] = [`${name} · ${statusLabel}`];
  const cleanSummary = summaryText.trim();
  if (cleanSummary && cleanSummary !== statusLabel) {
    parts.push(cleanSummary);
  }
  if (disabledReason) {
    parts.push(disabledReason);
  }
  return parts.join(' — ');
}

function toChipItem(
  moduleId: MetaModuleId,
  name: string,
  status: MetaModuleStatus,
  summaryText: string,
  entryUrlRaw: string | null,
  kpi: Record<string, number | string>,
  updatedAt: string | null,
): HubModuleChipItem {
  const entryUrl = resolveValidEntryUrl(entryUrlRaw);
  const disabled = entryUrl === null;
  const statusLabel = getMetaModuleStatusLabel(status);
  const cleanSummary = summaryText.trim() || statusLabel;
  const disabledReason = disabled ? DEFAULT_DISABLED_REASON[status] : null;

  return {
    moduleId,
    name,
    status,
    statusLabel,
    summaryText: cleanSummary,
    tooltipText: buildChipTooltip(name, status, cleanSummary, disabledReason),
    entryUrl,
    disabled,
    disabledReason,
    kpi,
    updatedAt,
  };
}

/**
 * Merges `/api/meta/registry` and `/api/meta/hub/summary` into ordered HUD status chips.
 * - Preserves registry order and overlays per-project summary status/summaryText/kpi/entryUrl.
 * - Appends any extra modules present only in `summary` so newly added systems render automatically.
 * - Never fabricates URLs: uses strictly server-supplied `entryUrl` (null => disabled chip).
 */
export function mergeHubModuleChips(
  registry: MetaRegistryResponse | null,
  summary: MetaHubSummaryResponse | null,
): HubModuleChipItem[] {
  const summaryById = new Map<string, ModuleStatusSummary>();
  if (summary?.modules) {
    for (const mod of summary.modules) {
      summaryById.set(mod.moduleId, mod);
    }
  }

  const chips: HubModuleChipItem[] = [];
  const seen = new Set<string>();

  if (registry?.modules) {
    for (const regMod of registry.modules) {
      seen.add(regMod.moduleId);
      const sumMod = summaryById.get(regMod.moduleId);
      if (sumMod) {
        chips.push(
          toChipItem(
            regMod.moduleId,
            regMod.name || regMod.moduleId,
            sumMod.status,
            sumMod.summaryText,
            sumMod.entryUrl,
            sumMod.kpi,
            sumMod.updatedAt,
          ),
        );
      } else {
        chips.push(
          toChipItem(
            regMod.moduleId,
            regMod.name || regMod.moduleId,
            regMod.status,
            getMetaModuleStatusLabel(regMod.status),
            regMod.entryUrl,
            {},
            null,
          ),
        );
      }
    }
  }

  if (summary?.modules) {
    for (const sumMod of summary.modules) {
      if (seen.has(sumMod.moduleId)) continue;
      seen.add(sumMod.moduleId);
      chips.push(
        toChipItem(
          sumMod.moduleId,
          sumMod.moduleId,
          sumMod.status,
          sumMod.summaryText,
          sumMod.entryUrl,
          sumMod.kpi,
          sumMod.updatedAt,
        ),
      );
    }
  }

  return chips;
}

/**
 * Visual style tokens per hub module status (WCAG AA >= 4.5:1 on dark slate-950 HUD):
 *   - active: green indicator
 *   - idle: neutral slate indicator
 *   - warn: orange/amber indicator
 *   - planned: dashed grey border + "준비 중"
 *   - nosource: grey + "원천 없음"
 *   - unavailable: red border + "일시 오류"
 */
export function getHubChipStyleSpec(status: MetaModuleStatus): HubChipStyleSpec {
  switch (status) {
    case 'active':
      return {
        containerClass:
          'border border-emerald-500/60 bg-emerald-950/60 text-emerald-100 hover:bg-emerald-900/70',
        dotClass: 'bg-emerald-400',
        statusTextClass: 'text-emerald-200',
        showInlineStatusText: false,
      };
    case 'idle':
      return {
        containerClass:
          'border border-slate-600/80 bg-slate-900/90 text-slate-200 hover:bg-slate-800',
        dotClass: 'bg-slate-400',
        statusTextClass: 'text-slate-300',
        showInlineStatusText: false,
      };
    case 'warn':
      return {
        containerClass:
          'border border-amber-500/75 bg-amber-950/70 text-amber-100 hover:bg-amber-900/75',
        dotClass: 'bg-amber-400',
        statusTextClass: 'text-amber-200',
        showInlineStatusText: false,
      };
    case 'planned':
      return {
        containerClass:
          'border border-dashed border-slate-500/80 bg-slate-900/65 text-slate-200',
        dotClass: 'bg-slate-400',
        statusTextClass: 'text-slate-300',
        showInlineStatusText: true,
      };
    case 'nosource':
      return {
        containerClass:
          'border border-slate-600/80 bg-slate-900/80 text-slate-200',
        dotClass: 'bg-slate-400',
        statusTextClass: 'text-slate-300',
        showInlineStatusText: true,
      };
    case 'unavailable':
      return {
        containerClass:
          'border border-rose-500 bg-rose-950/80 text-rose-100',
        dotClass: 'bg-rose-400',
        statusTextClass: 'text-rose-200',
        showInlineStatusText: true,
      };
  }
}

export function summarizeHubChips(chips: readonly HubModuleChipItem[]): HubChipsSummary {
  let activeCount = 0;
  let idleCount = 0;
  let warnCount = 0;
  let plannedCount = 0;
  let nosourceCount = 0;
  let unavailableCount = 0;

  for (const chip of chips) {
    if (chip.status === 'active') activeCount += 1;
    else if (chip.status === 'idle') idleCount += 1;
    else if (chip.status === 'warn') warnCount += 1;
    else if (chip.status === 'planned') plannedCount += 1;
    else if (chip.status === 'nosource') nosourceCount += 1;
    else if (chip.status === 'unavailable') unavailableCount += 1;
  }

  const total = chips.length;
  let mobileSummaryLabel = `시스템 ${total}개`;
  if (unavailableCount > 0) {
    mobileSummaryLabel = `시스템 ${total}개 · 일시 오류 ${unavailableCount}`;
  } else if (warnCount > 0) {
    mobileSummaryLabel = `시스템 ${total}개 · 주의 ${warnCount}`;
  } else if (activeCount > 0) {
    mobileSummaryLabel = `시스템 ${total}개 · 정상 ${activeCount}`;
  }

  return {
    total,
    activeCount,
    idleCount,
    warnCount,
    plannedCount,
    nosourceCount,
    unavailableCount,
    mobileSummaryLabel,
  };
}
