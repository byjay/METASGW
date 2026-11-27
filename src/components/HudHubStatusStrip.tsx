import React, { useState } from 'react';
import {
  AlertTriangle,
  Box,
  Cable,
  ChevronDown,
  ChevronUp,
  FileBarChart2,
  FileText,
  FolderKanban,
  Layers,
  Mail,
  MessageSquare,
  RefreshCw,
  Scan,
} from 'lucide-react';
import {
  getHubChipStyleSpec,
  summarizeHubChips,
  type HubModuleChipItem,
} from '../meta/hubChipModel';
import type { MetaModuleId } from '../meta/hubTypes';
import type { RuntimeEnv } from '../runtimeEnv';

export interface HudHubStatusStripProps {
  chips: HubModuleChipItem[];
  runtimeEnv: RuntimeEnv;
  projectLabel?: string | null;
  refreshing?: boolean;
  onRefresh?: () => void;
  onOpenReport?: () => void;
  onPreviewLinkBlocked: (featureLabel: string) => void;
}

function renderModuleIcon(moduleId: MetaModuleId) {
  const cls = 'h-3 w-3 shrink-0';
  switch (moduleId) {
    case 'sgw':
      return <MessageSquare className={cls} aria-hidden="true" />;
    case 'sedms':
      return <FolderKanban className={cls} aria-hidden="true" />;
    case 'secms':
      return <Cable className={cls} aria-hidden="true" />;
    case 's360':
      return <Scan className={cls} aria-hidden="true" />;
    case 'secad':
      return <Box className={cls} aria-hidden="true" />;
    case 'pdf':
      return <FileText className={cls} aria-hidden="true" />;
    case 'mail':
      return <Mail className={cls} aria-hidden="true" />;
    default:
      return <Layers className={cls} aria-hidden="true" />;
  }
}

export const HudHubStatusStrip: React.FC<HudHubStatusStripProps> = ({
  chips,
  runtimeEnv,
  projectLabel,
  refreshing = false,
  onRefresh,
  onOpenReport,
  onPreviewLinkBlocked,
}) => {
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const isPreview = runtimeEnv === 'preview';
  const summary = summarizeHubChips(chips);

  if (chips.length === 0 && !refreshing) {
    return null;
  }

  const renderChip = (chip: HubModuleChipItem) => {
    const spec = getHubChipStyleSpec(chip.status);
    const baseCls =
      'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold leading-tight whitespace-nowrap transition focus-visible:outline-2 focus-visible:outline-sky-400';

    const innerContent = (
      <>
        <span
          className={`h-1.5 w-1.5 rounded-full shrink-0 ${spec.dotClass}`}
          aria-hidden="true"
        />
        {renderModuleIcon(chip.moduleId)}
        <span>{chip.name}</span>
        {spec.showInlineStatusText && (
          <span className={`text-[10px] font-medium ${spec.statusTextClass}`}>
            {chip.statusLabel}
          </span>
        )}
      </>
    );

    if (chip.disabled || !chip.entryUrl) {
      return (
        <button
          key={chip.moduleId}
          type="button"
          disabled
          data-testid={`hub-chip-${chip.moduleId}`}
          data-status={chip.status}
          title={chip.tooltipText}
          aria-label={chip.tooltipText}
          className={`${baseCls} ${spec.containerClass} cursor-not-allowed opacity-90`}
        >
          {innerContent}
        </button>
      );
    }

    return (
      <a
        key={chip.moduleId}
        href={chip.entryUrl}
        data-testid={`hub-chip-${chip.moduleId}`}
        data-status={chip.status}
        title={chip.tooltipText}
        aria-label={chip.tooltipText}
        onClick={(e) => {
          if (isPreview) {
            e.preventDefault();
            onPreviewLinkBlocked(chip.name);
          }
        }}
        className={`${baseCls} ${spec.containerClass}`}
      >
        {innerContent}
      </a>
    );
  };

  return (
    <div
      data-testid="hud-hub-status-strip"
      className="border-t border-slate-800/90 bg-slate-950/96 text-slate-100"
    >
      {/* Desktop (>= sm): single slim scrollable chip row + right refresh button */}
      <div className="hidden sm:flex items-center justify-between gap-2 px-3 py-1">
        <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-x-auto meta-scroll">
          {projectLabel && (
            <span
              data-testid="hub-active-project-badge"
              className="inline-flex shrink-0 items-center rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold text-sky-200 whitespace-nowrap"
              title={`현재 허브 기준 프로젝트: ${projectLabel}`}
            >
              {projectLabel}
            </span>
          )}
          <div
            role="list"
            aria-label="연동 시스템 상태 목록"
            className="flex items-center gap-1.5 min-w-0"
          >
            {chips.map((chip) => (
              <div key={chip.moduleId} role="listitem" className="shrink-0">
                {renderChip(chip)}
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {onOpenReport && (
            <button
              type="button"
              data-testid="hud-report-btn"
              onClick={onOpenReport}
              aria-label="프로젝트 통합 리포트 열기"
              title="프로젝트 통합 리포트 열기"
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-sky-500/60 bg-sky-950/75 px-2 py-0.5 text-[11px] font-semibold text-sky-100 hover:bg-sky-900/80 hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400 whitespace-nowrap"
            >
              <FileBarChart2 className="h-3 w-3 shrink-0 text-sky-300" aria-hidden="true" />
              <span>리포트</span>
            </button>
          )}
          {onRefresh && (
            <button
              type="button"
              data-testid="hub-refresh-btn"
              disabled={refreshing}
              onClick={onRefresh}
              aria-label="허브 시스템 상태 새로고침"
              title="시스템 상태 즉시 새로고침"
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] font-semibold text-slate-200 hover:bg-slate-800 hover:text-white disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-sky-400 whitespace-nowrap"
            >
              <RefreshCw
                className={`h-3 w-3 shrink-0 ${refreshing ? 'animate-spin text-sky-300' : 'text-slate-300'}`}
                aria-hidden="true"
              />
              <span>새로고침</span>
            </button>
          )}
        </div>
      </div>

      {/* Mobile (< sm, 375px safe): compact summary button -> expandable chip drawer */}
      <div className="sm:hidden px-2 py-1">
        <div className="flex items-center justify-between gap-1.5 min-w-0">
          <button
            type="button"
            data-testid="hub-mobile-summary-toggle"
            aria-expanded={mobileExpanded}
            aria-label={`연동 시스템 상태 ${mobileExpanded ? '접기' : '펼치기'} (${summary.mobileSummaryLabel})`}
            onClick={() => setMobileExpanded((prev) => !prev)}
            className={`inline-flex min-h-[28px] min-w-0 items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold transition focus-visible:outline-2 focus-visible:outline-sky-400 ${
              summary.unavailableCount > 0
                ? 'border-rose-500/80 bg-rose-950/75 text-rose-100'
                : summary.warnCount > 0
                  ? 'border-amber-500/70 bg-amber-950/65 text-amber-100'
                  : 'border-slate-700 bg-slate-900 text-slate-100'
            }`}
          >
            {summary.unavailableCount > 0 && (
              <AlertTriangle className="h-3 w-3 text-rose-300 shrink-0" aria-hidden="true" />
            )}
            <span className="truncate">{summary.mobileSummaryLabel}</span>
            {projectLabel && (
              <span className="text-[10px] font-normal text-sky-200 shrink-0">
                ({projectLabel})
              </span>
            )}
            {mobileExpanded ? (
              <ChevronUp className="h-3.5 w-3.5 shrink-0 text-slate-300" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-300" aria-hidden="true" />
            )}
          </button>

          <div className="flex items-center gap-1 shrink-0">
            {onOpenReport && (
              <button
                type="button"
                data-testid="hud-mobile-report-btn"
                onClick={onOpenReport}
                aria-label="프로젝트 통합 리포트 열기"
                className="inline-flex min-h-[28px] shrink-0 items-center gap-1 rounded-md border border-sky-500/60 bg-sky-950/75 px-2 py-0.5 text-[11px] font-semibold text-sky-100 hover:bg-sky-900/80 focus-visible:outline-2 focus-visible:outline-sky-400"
              >
                <FileBarChart2 className="h-3 w-3 shrink-0 text-sky-300" aria-hidden="true" />
                <span>리포트</span>
              </button>
            )}
            {onRefresh && (
              <button
                type="button"
                data-testid="hub-mobile-refresh-btn"
                disabled={refreshing}
                onClick={onRefresh}
                aria-label="허브 시스템 상태 새로고침"
                className="inline-flex min-h-[28px] shrink-0 items-center gap-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-sky-400"
              >
                <RefreshCw
                  className={`h-3 w-3 shrink-0 ${refreshing ? 'animate-spin text-sky-300' : 'text-slate-300'}`}
                  aria-hidden="true"
                />
                <span>갱신</span>
              </button>
            )}
          </div>
        </div>

        {mobileExpanded && (
          <div
            data-testid="hub-mobile-chip-panel"
            role="list"
            aria-label="연동 시스템 상태 목록"
            className="mt-1.5 flex flex-wrap items-center gap-1.5 border-t border-slate-800/80 pt-1.5"
          >
            {chips.map((chip) => (
              <div key={chip.moduleId} role="listitem">
                {renderChip(chip)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
