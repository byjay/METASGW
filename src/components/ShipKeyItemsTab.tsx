import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Box,
  Cable,
  Camera,
  CheckSquare,
  ExternalLink,
  FileCode2,
  FileText,
  Info,
  Link2,
  RefreshCw,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';
import { SGW_LOGIN_REDIRECT_URL } from '../deepLink';
import type { RuntimeEnv } from '../runtimeEnv';
import {
  formatNullableKpiValue,
  isNormalModuleStatus,
  shouldRenderItemSeverityBadge,
  type MetaCablesKeyResponse,
  type MetaClientError,
  type MetaDrawingsKeyResponse,
  type MetaItemCategory,
  type MetaItemSeverity,
  type MetaKeyItem,
  type MetaModuleStatus,
  type MetaRegistryResponse,
} from '../meta/hubTypes';
import {
  CABLE_STATUS_SUBFILTER_OPTIONS,
  CATEGORY_LABEL_KO,
  combineKeyItemSources,
  countCableItemsByStatus,
  countKeyItemsByFilter,
  DRAWINGS_URGENT_UNSUPPORTED_MESSAGE,
  extractCableProgressSummary,
  filterCableItemsByStatus,
  filterKeyItems,
  formatRelativeUpdatedAt,
  getNonNormalModuleNotices,
  getSecmsLinkRequirement,
  KEY_ITEMS_FILTER_OPTIONS,
  KEY_ITEMS_SEARCH_DEBOUNCE_MS,
  resolveKeyItemLink,
  SEVERITY_LABEL_KO,
  sortKeyItems,
  type CableStatusSubFilter,
  type KeyItemsFilter,
  type ModuleStatusNotice,
} from '../meta/keyItemsModel';
import {
  createProjectRequestCoordinator,
  fetchMetaKeyCables,
  fetchMetaKeyDrawings,
  searchMetaItems,
  type ProjectRequestCoordinator,
} from '../meta/metaClient';

export interface ShipKeyItemsTabProps {
  projectId: string;
  runtimeEnv: RuntimeEnv;
  registry?: MetaRegistryResponse | null;
  compact?: boolean;
  /** Optional pre-seeded browse responses (used for deterministic SSR / unit tests). */
  initialDrawings?: MetaDrawingsKeyResponse | null;
  initialCables?: MetaCablesKeyResponse | null;
  initialFilter?: KeyItemsFilter;
  initialUrgentUnsupported?: boolean;
  onHighlightShip?: (shipId: string) => void;
  onPreviewLinkBlocked: (featureLabel: string) => void;
  onToast?: (message: string) => void;
  onAuthRequired?: (redirectUrl: string) => void;
}

const SEVERITY_BADGE_CLASS: Readonly<Record<MetaItemSeverity, string>> = {
  urgent: 'border-rose-400/75 bg-rose-950/90 text-rose-100',
  warn: 'border-amber-400/75 bg-amber-950/85 text-amber-100',
  normal: 'border-slate-600/80 bg-slate-800/90 text-slate-200',
};

const NOTICE_CARD_CLASS: Readonly<Record<'planned' | 'nosource' | 'unavailable', string>> = {
  planned: 'border-dashed border-slate-500/80 bg-slate-900/70 text-slate-200',
  nosource: 'border-slate-600/80 bg-slate-900/85 text-slate-200',
  unavailable: 'border-rose-500/80 bg-rose-950/75 text-rose-100',
};

function renderCategoryIcon(category: MetaItemCategory): React.ReactNode {
  switch (category) {
    case 'drawing':
      return <FileText className="h-3.5 w-3.5 text-sky-300 shrink-0" aria-hidden="true" />;
    case 'cable':
      return <Cable className="h-3.5 w-3.5 text-amber-300 shrink-0" aria-hidden="true" />;
    case 'scan360':
      return <Camera className="h-3.5 w-3.5 text-teal-300 shrink-0" aria-hidden="true" />;
    case 'cad3d':
      return <Box className="h-3.5 w-3.5 text-indigo-300 shrink-0" aria-hidden="true" />;
    case 'pdf':
      return <FileCode2 className="h-3.5 w-3.5 text-rose-300 shrink-0" aria-hidden="true" />;
    case 'task':
      return <CheckSquare className="h-3.5 w-3.5 text-emerald-300 shrink-0" aria-hidden="true" />;
    case 'notice':
    default:
      return <Bell className="h-3.5 w-3.5 text-slate-300 shrink-0" aria-hidden="true" />;
  }
}

export const ShipKeyItemsTab: React.FC<ShipKeyItemsTabProps> = ({
  projectId,
  runtimeEnv,
  registry = null,
  compact = false,
  initialDrawings = null,
  initialCables = null,
  initialFilter = 'all',
  initialUrgentUnsupported = false,
  onHighlightShip,
  onPreviewLinkBlocked,
  onToast,
  onAuthRequired,
}) => {
  const initialCombined = useMemo(
    () => (initialDrawings || initialCables ? combineKeyItemSources(initialDrawings, initialCables) : null),
    [initialDrawings, initialCables],
  );

  const [filter, setFilter] = useState<KeyItemsFilter>(initialFilter);
  const [cableSubFilter, setCableSubFilter] = useState<CableStatusSubFilter>('all');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Base browse state (`drawings/key` + `cables/key`)
  const [drawingsResp, setDrawingsResp] = useState<MetaDrawingsKeyResponse | null>(initialDrawings);
  const [cablesResp, setCablesResp] = useState<MetaCablesKeyResponse | null>(initialCables);
  const [baseItems, setBaseItems] = useState<MetaKeyItem[]>(initialCombined?.items ?? []);
  const [baseModuleStatuses, setBaseModuleStatuses] = useState<Record<string, MetaModuleStatus>>(
    initialCombined?.moduleStatuses ?? {},
  );
  const [baseLoading, setBaseLoading] = useState(!(initialDrawings || initialCables));

  // SEDMS urgent filter unsupported state (`filter=urgent` -> `{ items: [], unsupported: true }`)
  const [urgentUnsupported, setUrgentUnsupported] = useState(
    Boolean(initialUrgentUnsupported || initialDrawings?.unsupported),
  );
  const [urgentLoading, setUrgentLoading] = useState(false);

  // Search state (`items/search`)
  const [searchItems, setSearchItems] = useState<MetaKeyItem[]>([]);
  const [searchModuleStatuses, setSearchModuleStatuses] = useState<Record<string, MetaModuleStatus>>({});
  const [searchLoading, setSearchLoading] = useState(false);

  // Error / forbidden state
  const [forbiddenMessage, setForbiddenMessage] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const coordinatorRef = useRef<ProjectRequestCoordinator | null>(null);
  if (!coordinatorRef.current) {
    coordinatorRef.current = createProjectRequestCoordinator(projectId);
  }

  const isPreview = runtimeEnv === 'preview';
  const trimmedQuery = debouncedQuery.trim();
  const isSearchMode = trimmedQuery.length > 0;

  const handleMetaError = (err: MetaClientError): void => {
    if (err.code === 'ERR_ABORTED') return;
    if (err.code === 'ERR_AUTH_REQUIRED') {
      const target = err.redirectUrl ?? SGW_LOGIN_REDIRECT_URL;
      if (onAuthRequired) {
        onAuthRequired(target);
      } else if (typeof window !== 'undefined') {
        window.location.replace(target);
      }
      return;
    }
    if (err.code === 'ERR_PROJECT_FORBIDDEN') {
      setForbiddenMessage('접근 권한이 없는 프로젝트입니다. 허용된 프로젝트를 선택해 주세요.');
      return;
    }
    if (err.code === 'ERR_RATE_LIMITED') {
      // Preserve previously cached items intact on 429
      onToast?.('요청이 많습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    setGeneralError(err.message);
  };

  // Reset search & state when projectId switches; abort previous project requests
  useEffect(() => {
    coordinatorRef.current?.switchProject(projectId);
    setFilter('all');
    setCableSubFilter('all');
    setSearchInput('');
    setDebouncedQuery('');
    setDrawingsResp(null);
    setCablesResp(null);
    setBaseItems([]);
    setBaseModuleStatuses({});
    setUrgentUnsupported(false);
    setUrgentLoading(false);
    setSearchItems([]);
    setSearchModuleStatuses({});
    setForbiddenMessage(null);
    setGeneralError(null);
  }, [projectId]);

  // 300ms debounce for search input
  useEffect(() => {
    const trimmed = searchInput.trim();
    if (!trimmed) {
      setDebouncedQuery('');
      setSearchLoading(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setDebouncedQuery(trimmed);
    }, KEY_ITEMS_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  // Parallel load of drawings/key + cables/key on mount / project switch / manual retry
  useEffect(() => {
    const coordinator = coordinatorRef.current;
    if (!coordinator) return;
    coordinator.switchProject(projectId);

    let active = true;
    setBaseLoading(true);
    setForbiddenMessage(null);
    setGeneralError(null);

    const run = async () => {
      const [drawingsOutcome, cablesOutcome] = await Promise.all([
        coordinator.run<MetaDrawingsKeyResponse>(projectId, 'key-drawings', (signal) =>
          fetchMetaKeyDrawings({ project: projectId, limit: 20, filter: 'latest' }, { runtimeEnv, signal }),
        ),
        coordinator.run<MetaCablesKeyResponse>(projectId, 'key-cables', (signal) =>
          fetchMetaKeyCables({ project: projectId, warnPct: 85, limit: 30 }, { runtimeEnv, signal }),
        ),
      ]);

      if (!active) return;
      if (drawingsOutcome.stale && cablesOutcome.stale) return;
      setBaseLoading(false);

      const dRes = !drawingsOutcome.stale ? drawingsOutcome.result : null;
      const cRes = !cablesOutcome.stale ? cablesOutcome.result : null;

      // Priority error checks (401 -> 403 -> 429)
      for (const res of [dRes, cRes]) {
        if (res && !res.ok && res.code === 'ERR_AUTH_REQUIRED') {
          handleMetaError(res);
          return;
        }
      }
      for (const res of [dRes, cRes]) {
        if (res && !res.ok && res.code === 'ERR_PROJECT_FORBIDDEN') {
          handleMetaError(res);
          return;
        }
      }
      const rateLimited = [dRes, cRes].find((res) => res && !res.ok && res.code === 'ERR_RATE_LIMITED');
      if (rateLimited && !rateLimited.ok) {
        handleMetaError(rateLimited);
        // If at least one succeeded, still apply it; otherwise keep cached items intact
        if ((!dRes || !dRes.ok) && (!cRes || !cRes.ok)) {
          return;
        }
      }

      const drawingsData: MetaDrawingsKeyResponse | null =
        dRes && dRes.ok
          ? dRes.data
          : dRes && !dRes.ok && dRes.code !== 'ERR_ABORTED'
            ? { status: 'unavailable', items: [] }
            : null;
      const cablesData: MetaCablesKeyResponse | null =
        cRes && cRes.ok
          ? cRes.data
          : cRes && !cRes.ok && cRes.code !== 'ERR_ABORTED'
            ? { status: 'unavailable', items: [] }
            : null;

      if (drawingsData) setDrawingsResp(drawingsData);
      if (cablesData) setCablesResp(cablesData);

      if (drawingsData || cablesData) {
        const combined = combineKeyItemSources(drawingsData, cablesData);
        setBaseItems(combined.items);
        setBaseModuleStatuses(combined.moduleStatuses);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [projectId, runtimeEnv, reloadNonce]);

  // Query drawings/key?filter=urgent when user selects "긴급" in browse mode so SEDMS unsupported:true is detected honestly
  useEffect(() => {
    if (filter !== 'urgent' || isSearchMode || forbiddenMessage) {
      setUrgentLoading(false);
      return;
    }
    const coordinator = coordinatorRef.current;
    if (!coordinator) return;

    let active = true;
    setUrgentLoading(true);

    const runUrgentCheck = async () => {
      const outcome = await coordinator.run<MetaDrawingsKeyResponse>(
        projectId,
        'key-drawings-urgent',
        (signal) =>
          fetchMetaKeyDrawings({ project: projectId, limit: 20, filter: 'urgent' }, { runtimeEnv, signal }),
      );
      if (!active || outcome.stale || !outcome.result) return;
      setUrgentLoading(false);

      const res = outcome.result;
      if (!res.ok) {
        handleMetaError(res);
        return;
      }
      setUrgentUnsupported(Boolean(res.data.unsupported));
    };

    void runUrgentCheck();
    return () => {
      active = false;
    };
  }, [filter, isSearchMode, forbiddenMessage, projectId, runtimeEnv, reloadNonce]);

  // Debounced search (`items/search`)
  useEffect(() => {
    const coordinator = coordinatorRef.current;
    if (!coordinator || !trimmedQuery) return;
    if (forbiddenMessage) return;

    let active = true;
    setSearchLoading(true);
    setGeneralError(null);

    const runSearch = async () => {
      const outcome = await coordinator.run(projectId, 'key-search', (signal) =>
        searchMetaItems({ project: projectId, q: trimmedQuery }, { runtimeEnv, signal }),
      );
      if (!active || outcome.stale || !outcome.result) return;
      setSearchLoading(false);

      const res = outcome.result;
      if (!res.ok) {
        handleMetaError(res);
        return;
      }
      setSearchItems(sortKeyItems(res.data.items));
      setSearchModuleStatuses(res.data.modules);
    };

    void runSearch();
    return () => {
      active = false;
    };
  }, [projectId, runtimeEnv, trimmedQuery, forbiddenMessage]);

  const activeSourceItems = isSearchMode ? searchItems : baseItems;
  const filterCounts = useMemo(
    () => countKeyItemsByFilter(activeSourceItems),
    [activeSourceItems],
  );
  const cableStatusCounts = useMemo(
    () => countCableItemsByStatus(activeSourceItems),
    [activeSourceItems],
  );
  const visibleItems = useMemo(() => {
    const primary = filterKeyItems(activeSourceItems, filter);
    if (filter === 'cable' && cableSubFilter !== 'all') {
      return filterCableItemsByStatus(primary, cableSubFilter);
    }
    return primary;
  }, [activeSourceItems, filter, cableSubFilter]);

  const cableProgress = useMemo(() => extractCableProgressSummary(cablesResp), [cablesResp]);
  const secmsLinkReq = useMemo(() => getSecmsLinkRequirement(cablesResp), [cablesResp]);

  const showCableProgress =
    !isSearchMode &&
    !forbiddenMessage &&
    !baseLoading &&
    cablesResp !== null &&
    isNormalModuleStatus(cablesResp.status) &&
    (filter === 'all' || filter === 'cable');

  const showSecmsLinkCard =
    !isSearchMode &&
    !forbiddenMessage &&
    !baseLoading &&
    secmsLinkReq.required &&
    (filter === 'all' || filter === 'cable');

  const showDrawingKpiStrip =
    !isSearchMode &&
    !forbiddenMessage &&
    !baseLoading &&
    drawingsResp !== null &&
    isNormalModuleStatus(drawingsResp.status) &&
    Boolean(drawingsResp.kpi) &&
    filter === 'drawing';

  const nonNormalNotices = useMemo<ModuleStatusNotice[]>(() => {
    const raw = getNonNormalModuleNotices(
      isSearchMode ? searchModuleStatuses : baseModuleStatuses,
      {
        filter,
        isSearchMode,
        registry,
      },
    );
    // Avoid duplicating generic secms nosource notice when the dedicated SEcMS link card is shown
    if (showSecmsLinkCard) {
      return raw.filter((n) => n.moduleId !== 'secms');
    }
    return raw;
  }, [isSearchMode, searchModuleStatuses, baseModuleStatuses, filter, registry, showSecmsLinkCard]);

  const isLoading = isSearchMode ? searchLoading : baseLoading || (filter === 'urgent' && urgentLoading);
  const listMaxHeightClass = compact ? 'max-h-[220px]' : 'max-h-[290px]';

  return (
    <div
      className="space-y-2.5 text-slate-100"
      data-testid="ship-key-items-tab"
      role="tabpanel"
      aria-label="프로젝트 핵심 항목"
    >
      {/* Search Bar (300ms debounced items/search) */}
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1 min-w-0">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="도면·케이블 코드·제목 검색 (300ms 자동)"
            aria-label="핵심 항목 검색"
            data-testid="key-items-search-input"
            className="w-full min-h-[34px] rounded-lg border border-slate-700 bg-slate-950 pl-8 pr-7 py-1.5 text-xs text-slate-100 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none"
          />
          {searchInput.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setSearchInput('');
                setDebouncedQuery('');
              }}
              aria-label="검색어 지우기"
              data-testid="key-items-search-clear"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-300 hover:bg-slate-800 hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setReloadNonce((n) => n + 1)}
          aria-label="핵심 항목 새로고침"
          data-testid="key-items-refresh"
          className="inline-flex min-h-[34px] min-w-[34px] shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin text-sky-300' : ''}`}
            aria-hidden="true"
          />
        </button>
      </div>

      {/* Filter Chips: 전체 / 도면 / 케이블 / 긴급 */}
      <div
        className="flex flex-wrap items-center gap-1"
        role="group"
        aria-label="핵심 항목 필터"
        data-testid="key-items-filter-bar"
      >
        {KEY_ITEMS_FILTER_OPTIONS.map((opt) => {
          const active = filter === opt.id;
          const count = filterCounts[opt.id];
          return (
            <button
              key={opt.id}
              type="button"
              data-testid={`key-items-filter-${opt.id}`}
              aria-label={`${opt.label} 필터 (${count}건)`}
              aria-pressed={active}
              onClick={() => {
                setFilter(opt.id);
                if (opt.id !== 'cable') {
                  setCableSubFilter('all');
                }
              }}
              className={`inline-flex min-h-[30px] items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold transition focus-visible:outline-2 focus-visible:outline-sky-400 ${
                active
                  ? 'border-sky-400 bg-sky-900/90 text-white'
                  : 'border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-500 hover:bg-slate-800'
              }`}
            >
              <span>{opt.label}</span>
              <span
                className={`rounded px-1 text-[10px] font-mono ${
                  active ? 'bg-sky-950/80 text-sky-200' : 'bg-slate-800 text-slate-300'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Top Cable Laying Progress Bar (cablesLaid/cablesTotal; renders "—" if either is null) */}
      {showCableProgress && (
        <div
          data-testid="cable-progress-card"
          className="rounded-xl border border-slate-700/90 bg-slate-950/85 px-2.5 py-2 space-y-1.5"
        >
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="inline-flex items-center gap-1 font-semibold text-slate-200">
              <Cable className="h-3.5 w-3.5 text-amber-300 shrink-0" aria-hidden="true" />
              케이블 포설 진척률
            </span>
            {cableProgress.hasNumbers ? (
              <span
                data-testid="cable-progress-text"
                className="font-mono font-bold text-amber-200 tabular-nums"
              >
                {cableProgress.displayText}
              </span>
            ) : (
              <span
                data-testid="cable-progress-null"
                title="원천 없음"
                className="font-mono font-bold text-slate-300"
              >
                {cableProgress.displayText}
              </span>
            )}
          </div>

          {cableProgress.hasNumbers && cableProgress.progressPct !== null && (
            <div
              role="progressbar"
              aria-label="케이블 포설 진척률"
              aria-valuenow={cableProgress.progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
              data-testid="cable-progress-bar"
              className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800"
            >
              <div
                className="h-full rounded-full bg-amber-400 transition-all"
                style={{ width: `${cableProgress.progressPct}%` }}
              />
            </div>
          )}

          {/* Cable Status Sub-Filter (미포설 / 포설 중) */}
          {filter === 'cable' && (
            <div
              className="flex flex-wrap items-center gap-1 pt-0.5"
              role="group"
              aria-label="케이블 포설 상태 필터"
              data-testid="cable-subfilter-bar"
            >
              {CABLE_STATUS_SUBFILTER_OPTIONS.map((opt) => {
                const active = cableSubFilter === opt.id;
                const count = cableStatusCounts[opt.id];
                return (
                  <button
                    key={opt.id}
                    type="button"
                    data-testid={`cable-subfilter-${opt.id}`}
                    aria-label={`케이블 ${opt.label} 필터 (${count}건)`}
                    aria-pressed={active}
                    onClick={() => setCableSubFilter(opt.id)}
                    className={`inline-flex min-h-[26px] items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold transition focus-visible:outline-2 focus-visible:outline-sky-400 ${
                      active
                        ? 'border-amber-400 bg-amber-950/90 text-amber-100'
                        : 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    <span>{opt.label}</span>
                    <span className="font-mono text-[10px] text-slate-300">{count}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SEDMS Drawing KPI Micro-Strip (honest null -> "—" + 원천 없음 tooltip) */}
      {showDrawingKpiStrip && drawingsResp?.kpi && (
        <div
          data-testid="drawing-kpi-strip"
          className="grid grid-cols-3 gap-1.5 rounded-xl border border-slate-800 bg-slate-950/80 px-2.5 py-2 text-center"
        >
          <div>
            <p className="text-[10px] text-slate-300">개정 도면</p>
            <p
              className="font-mono text-xs font-bold text-white"
              title={drawingsResp.kpi.drawingRevisionCount === null ? '원천 없음' : undefined}
            >
              {formatNullableKpiValue(drawingsResp.kpi.drawingRevisionCount)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-slate-300">결재 진행</p>
            <p
              className="font-mono text-xs font-bold text-white"
              title={drawingsResp.kpi.drawingPendingApproval === null ? '원천 없음' : undefined}
            >
              {formatNullableKpiValue(drawingsResp.kpi.drawingPendingApproval)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-slate-300">긴급 코멘트</p>
            <p
              data-testid="drawing-kpi-urgent-comments"
              className="font-mono text-xs font-bold text-slate-300"
              title={drawingsResp.kpi.urgentComments === null ? '원천 없음' : undefined}
            >
              {formatNullableKpiValue(drawingsResp.kpi.urgentComments)}
            </p>
          </div>
        </div>
      )}

      {/* SEcMS Account Link Required Card (status === 'nosource' + server entryUrl) */}
      {showSecmsLinkCard && secmsLinkReq.entryUrl && (
        <div
          data-testid="secms-link-required-card"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/65 bg-amber-950/55 px-2.5 py-2 text-[11px] text-amber-100"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <Link2 className="h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden="true" />
            <span className="font-semibold">{secmsLinkReq.message}</span>
          </div>
          <a
            href={secmsLinkReq.entryUrl}
            data-testid="secms-link-btn"
            aria-label="SEcMS 계정 연결 페이지로 이동"
            onClick={(e) => {
              if (isPreview) {
                e.preventDefault();
                onPreviewLinkBlocked(secmsLinkReq.buttonLabel);
              }
            }}
            className="inline-flex min-h-[28px] shrink-0 items-center gap-1 rounded-lg bg-amber-600 px-2.5 py-1 text-[11px] font-bold text-slate-950 hover:bg-amber-500 focus-visible:outline-2 focus-visible:outline-sky-400"
          >
            <span>{secmsLinkReq.buttonLabel}</span>
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        </div>
      )}

      {/* 403 Forbidden Notice */}
      {forbiddenMessage && (
        <div
          role="alert"
          data-testid="key-items-forbidden"
          className="flex items-start gap-2 rounded-xl border border-rose-500/70 bg-rose-950/75 p-2.5 text-xs text-rose-100"
        >
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" aria-hidden="true" />
          <span>{forbiddenMessage}</span>
        </div>
      )}

      {/* General Error Banner */}
      {!forbiddenMessage && generalError && (
        <div
          role="alert"
          data-testid="key-items-error"
          className="flex items-start gap-2 rounded-xl border border-amber-500/70 bg-amber-950/70 p-2.5 text-xs text-amber-100"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
          <span>{generalError}</span>
        </div>
      )}

      {/* SEDMS filter=urgent unsupported notice (distinct from empty list) */}
      {!forbiddenMessage && !isSearchMode && filter === 'urgent' && !isLoading && urgentUnsupported && (
        <div
          role="status"
          data-testid="key-items-urgent-unsupported"
          className="flex items-start gap-2 rounded-xl border border-sky-500/55 bg-sky-950/65 p-2.5 text-xs text-sky-100"
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" aria-hidden="true" />
          <span>{DRAWINGS_URGENT_UNSUPPORTED_MESSAGE}</span>
        </div>
      )}

      {/* Search Mode: Explicit "검색 안 된 시스템" banner */}
      {!forbiddenMessage && isSearchMode && !isLoading && nonNormalNotices.length > 0 && (
        <div
          data-testid="key-items-unsearched-systems"
          className="rounded-xl border border-dashed border-slate-600 bg-slate-900/80 p-2 space-y-1.5"
        >
          <p className="text-[11px] font-semibold text-slate-200">
            검색 안 된 시스템 ({nonNormalNotices.length})
          </p>
          <div className="flex flex-wrap gap-1">
            {nonNormalNotices.map((notice) => (
              <span
                key={notice.moduleId}
                data-testid={`unsearched-module-${notice.moduleId}`}
                className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${
                  NOTICE_CARD_CLASS[notice.status as 'planned' | 'nosource' | 'unavailable']
                }`}
              >
                <span>{notice.moduleName}</span>
                <span className="text-slate-300">· {notice.statusLabel}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Scrollable Items + Honest Non-Normal Module Cards */}
      {!forbiddenMessage && (
        <div className={`${listMaxHeightClass} overflow-y-auto pr-0.5 space-y-1.5`}>
          {isLoading ? (
            <div
              data-testid="key-items-loading"
              className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-5 text-center text-xs text-slate-300"
            >
              {isSearchMode ? `"${trimmedQuery}" 검색 중...` : '핵심 항목을 불러오는 중...'}
            </div>
          ) : (
            <>
              {/* MetaKeyItem List */}
              {visibleItems.length > 0 ? (
                <ul
                  className="space-y-1.5"
                  aria-label="핵심 항목 목록"
                  data-testid="key-items-list"
                >
                  {visibleItems.map((item) => {
                    const link = resolveKeyItemLink(item);
                    const relTime = formatRelativeUpdatedAt(item.updatedAt);
                    const showSeverity = shouldRenderItemSeverityBadge(item);
                    const sevLabel =
                      showSeverity && item.severity !== null ? SEVERITY_LABEL_KO[item.severity] : null;
                    const catLabel = CATEGORY_LABEL_KO[item.category];
                    const rowInner = (
                      <>
                        <div className="flex items-center justify-between gap-1.5 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {renderCategoryIcon(item.category)}
                            <span className="font-mono text-[11px] font-bold text-sky-200 shrink-0">
                              {item.code}
                            </span>
                            {showSeverity && item.severity !== null && sevLabel && (
                              <span
                                data-testid={`key-item-severity-${item.id}`}
                                className={`inline-flex shrink-0 items-center rounded border px-1 py-0.5 text-[10px] font-semibold leading-none ${SEVERITY_BADGE_CLASS[item.severity]}`}
                              >
                                {sevLabel}
                              </span>
                            )}
                          </div>
                          <span className="shrink-0 text-[10px] text-slate-300">{relTime}</span>
                        </div>

                        <p className="mt-1 truncate text-xs font-semibold text-white">
                          {item.title}
                        </p>

                        <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-slate-300">
                          <span className="truncate">
                            {catLabel} · {String(item.metric || '-')}
                          </span>
                          {link.disabled ? (
                            <span className="shrink-0 text-slate-400">링크 없음</span>
                          ) : (
                            <span className="inline-flex shrink-0 items-center gap-0.5 font-semibold text-sky-300">
                              열기
                              <ExternalLink className="h-3 w-3" aria-hidden="true" />
                            </span>
                          )}
                        </div>
                      </>
                    );

                    return (
                      <li key={item.id} data-testid={`key-item-${item.id}`}>
                        {link.disabled || !link.href ? (
                          <button
                            type="button"
                            disabled
                            aria-label={`${item.code} ${item.title} — ${link.disabledReason ?? '연결 불가'}`}
                            title={link.disabledReason ?? undefined}
                            className="block w-full cursor-not-allowed rounded-xl border border-slate-800 bg-slate-950/60 px-2.5 py-2 text-left opacity-75"
                          >
                            {rowInner}
                          </button>
                        ) : (
                          <a
                            href={link.href}
                            aria-label={
                              sevLabel
                                ? `${item.code} ${item.title} (${sevLabel}) 열기`
                                : `${item.code} ${item.title} 열기`
                            }
                            onClick={(e) => {
                              onHighlightShip?.(projectId);
                              if (isPreview) {
                                e.preventDefault();
                                onPreviewLinkBlocked(`${item.code} (${item.title})`);
                              }
                            }}
                            className="block w-full rounded-xl border border-slate-700/90 bg-slate-900/90 px-2.5 py-2 text-left transition hover:border-sky-400/80 hover:bg-slate-800/95 focus-visible:outline-2 focus-visible:outline-sky-400"
                          >
                            {rowInner}
                          </a>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                // Empty state when no items match the active filter / search
                // Skip redundant empty box when browse mode already shows SEDMS urgent unsupported or module notice / SEcMS link card
                (isSearchMode ||
                  (nonNormalNotices.length === 0 &&
                    !showSecmsLinkCard &&
                    !(filter === 'urgent' && urgentUnsupported))) && (
                  <div
                    data-testid="key-items-empty"
                    className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-4 text-center text-xs text-slate-300"
                  >
                    {isSearchMode
                      ? `"${trimmedQuery}"에 일치하는 항목이 없습니다.`
                      : filter === 'urgent'
                        ? '긴급 항목이 없습니다.'
                        : filter === 'cable' && cableSubFilter !== 'all'
                          ? `${cableSubFilter === 'unlaid' ? '미포설' : '포설 중'} 상태의 케이블이 없습니다.`
                          : '표시할 핵심 항목이 없습니다.'}
                  </div>
                )
              )}

              {/* Non-normal honest status cards in browse mode (zero fake rows!) */}
              {!isSearchMode && nonNormalNotices.length > 0 && (
                <div className="space-y-1.5" data-testid="key-items-module-notices">
                  {nonNormalNotices.map((notice) => {
                    const cardStyle =
                      NOTICE_CARD_CLASS[notice.status as 'planned' | 'nosource' | 'unavailable'];
                    return (
                      <div
                        key={notice.moduleId}
                        data-testid={`module-notice-${notice.moduleId}`}
                        className={`rounded-xl border px-2.5 py-2 text-[11px] ${cardStyle}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold">{notice.moduleName}</span>
                          <span className="shrink-0 rounded border border-current/30 px-1.5 py-0.5 text-[10px] font-bold">
                            {notice.statusLabel}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[10px] text-slate-300">{notice.description}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
