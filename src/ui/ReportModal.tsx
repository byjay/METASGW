import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileBarChart2,
  RefreshCw,
  ShieldAlert,
  X,
} from 'lucide-react';
import { SGW_LOGIN_REDIRECT_URL } from '../deepLink';
import type { RuntimeEnv } from '../runtimeEnv';
import {
  getMetaModuleStatusLabel,
  type MetaClientError,
  type MetaItemSeverity,
  type MetaModuleStatus,
  type MetaRegistryResponse,
  type MetaReportJsonResponse,
} from '../meta/hubTypes';
import {
  formatRelativeUpdatedAt,
  resolveKeyItemLink,
  resolveMetaModuleName,
  SEVERITY_LABEL_KO,
} from '../meta/keyItemsModel';
import {
  createProjectRequestCoordinator,
  generateMetaReport,
  type ProjectRequestCoordinator,
} from '../meta/metaClient';
import {
  buildReportDownloadFilename,
  formatExecutiveKpiCards,
  formatReportGeneratedAt,
  isReportIntegrityVerified,
  REPORT_RANGE_DAYS_OPTIONS,
  resolveUnavailableModuleNames,
  type ReportRangeDays,
} from '../meta/reportModel';

export interface ReportModalProps {
  open: boolean;
  projectId: string | null;
  projectName?: string | null;
  runtimeEnv: RuntimeEnv;
  registry?: MetaRegistryResponse | null;
  /** Optional pre-seeded report (primarily for SSR / deterministic testing). */
  initialReport?: MetaReportJsonResponse | null;
  onClose: () => void;
  onPreviewLinkBlocked: (featureLabel: string) => void;
  onToast?: (message: string) => void;
  onAuthRequired?: (redirectUrl: string) => void;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const MODULE_STATUS_BADGE_CLASS: Readonly<Record<MetaModuleStatus, string>> = {
  active: 'border-emerald-500/60 bg-emerald-950/75 text-emerald-100',
  idle: 'border-slate-600/80 bg-slate-800/90 text-slate-200',
  warn: 'border-amber-500/75 bg-amber-950/75 text-amber-100',
  planned: 'border-dashed border-slate-500/80 bg-slate-900/75 text-slate-200',
  nosource: 'border-slate-600/80 bg-slate-900/85 text-slate-200',
  unavailable: 'border-rose-500/80 bg-rose-950/80 text-rose-100',
};

const SEVERITY_BADGE_CLASS: Readonly<Record<MetaItemSeverity, string>> = {
  urgent: 'border-rose-400/75 bg-rose-950/90 text-rose-100',
  warn: 'border-amber-400/75 bg-amber-950/85 text-amber-100',
  normal: 'border-slate-600/80 bg-slate-800/90 text-slate-200',
};

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback below for restricted iframe/headless contexts
    }
  }
  if (typeof document === 'undefined') return false;
  const prevFocused =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  } finally {
    prevFocused?.focus?.();
  }
}

function triggerMarkdownDownload(markdown: string, filename: string): boolean {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return false;
  try {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    return true;
  } catch {
    return false;
  }
}

export const ReportModal: React.FC<ReportModalProps> = ({
  open,
  projectId,
  projectName = null,
  runtimeEnv,
  registry = null,
  initialReport = null,
  onClose,
  onPreviewLinkBlocked,
  onToast,
  onAuthRequired,
}) => {
  const [days, setDays] = useState<ReportRangeDays>(7);
  const [report, setReport] = useState<MetaReportJsonResponse | null>(() =>
    initialReport && projectId && initialReport.projectId === projectId ? initialReport : null,
  );
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<'copy' | 'download' | null>(null);
  const [copiedJustNow, setCopiedJustNow] = useState(false);
  const [forbiddenMessage, setForbiddenMessage] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const copyTimerRef = useRef<number | null>(null);
  const coordinatorRef = useRef<ProjectRequestCoordinator | null>(null);
  if (!coordinatorRef.current) {
    coordinatorRef.current = createProjectRequestCoordinator(projectId);
  }

  const isPreview = runtimeEnv === 'preview';

  const handleMetaError = useCallback(
    (err: MetaClientError) => {
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
        // Keep previously cached report intact on 429
        onToast?.('요청이 많습니다. 잠시 후 다시 시도해 주세요.');
        return;
      }
      setGeneralError(err.message);
    },
    [onAuthRequired, onToast],
  );

  // Immediately clear previous report & abort in-flight requests whenever project switches
  useEffect(() => {
    coordinatorRef.current?.switchProject(projectId);
    setReport(
      initialReport && projectId && initialReport.projectId === projectId ? initialReport : null,
    );
    setForbiddenMessage(null);
    setGeneralError(null);
    setCopiedJustNow(false);
  }, [projectId, initialReport]);

  // Fetch JSON report whenever open, projectId, days, or reloadNonce changes
  useEffect(() => {
    if (!open || !projectId) {
      coordinatorRef.current?.cancelAll();
      return;
    }
    const coordinator = coordinatorRef.current;
    if (!coordinator) return;
    coordinator.switchProject(projectId);

    let active = true;
    setLoading(true);
    setForbiddenMessage(null);
    setGeneralError(null);

    const run = async () => {
      const outcome = await coordinator.run(projectId, 'report-json', (signal) =>
        generateMetaReport({ project: projectId, days, format: 'json' }, { runtimeEnv, signal }),
      );
      if (!active || outcome.stale || !outcome.result) return;
      setLoading(false);

      const res = outcome.result;
      if (!res.ok) {
        handleMetaError(res);
        return;
      }
      if (res.data.format === 'json') {
        setReport(res.data.report);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [open, projectId, days, runtimeEnv, reloadNonce, handleMetaError]);

  // Cleanup copy indicator timer
  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  // Focus trap & focus restoration when modal opens/closes
  useEffect(() => {
    if (!open) return;
    previousFocusRef.current =
      typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const raf = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(raf);
      previousFocusRef.current?.focus?.();
    };
  }, [open]);

  const handleDialogKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }

    if (e.key === 'Tab' && dialogRef.current) {
      const focusables = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);

      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const current = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (!current || current === first || !dialogRef.current.contains(current)) {
          e.preventDefault();
          last.focus();
        }
      } else if (!current || current === last || !dialogRef.current.contains(current)) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const fetchMarkdownForAction = async (mode: 'copy' | 'download') => {
    if (!projectId) return;
    const coordinator = coordinatorRef.current;
    if (!coordinator) return;

    setExporting(mode);
    const outcome = await coordinator.run(projectId, 'report-md', (signal) =>
      generateMetaReport({ project: projectId, days, format: 'md' }, { runtimeEnv, signal }),
    );
    setExporting(null);

    if (outcome.stale || !outcome.result) return;
    const res = outcome.result;
    if (!res.ok) {
      handleMetaError(res);
      return;
    }
    if (res.data.format !== 'md') return;

    if (mode === 'copy') {
      const copied = await copyTextToClipboard(res.data.markdown);
      if (copied) {
        setCopiedJustNow(true);
        if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
        copyTimerRef.current = window.setTimeout(() => setCopiedJustNow(false), 2200);
        onToast?.('Markdown 리포트를 클립보드에 복사했습니다.');
      } else {
        onToast?.('클립보드 복사를 지원하지 않는 환경입니다. 다운로드를 이용해 주세요.');
      }
    } else {
      const filename = buildReportDownloadFilename(projectId, report?.generatedAt);
      const saved = triggerMarkdownDownload(res.data.markdown, filename);
      if (saved) {
        onToast?.(`${filename} 파일 저장을 시작했습니다.`);
      } else {
        onToast?.('파일 다운로드를 시작하지 못했습니다.');
      }
    }
  };

  const kpiCards = useMemo(
    () => formatExecutiveKpiCards(report?.executiveKpi),
    [report?.executiveKpi],
  );
  const integrityVerified = useMemo(
    () => isReportIntegrityVerified(report?.integrity),
    [report?.integrity],
  );
  const unavailableNames = useMemo(
    () => resolveUnavailableModuleNames(report?.unavailableModules, registry),
    [report?.unavailableModules, registry],
  );

  if (!open) return null;

  const displayProjectTitle = projectName && projectId && projectName !== projectId
    ? `${projectName} (${projectId})`
    : projectId ?? '선택된 프로젝트 없음';

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-slate-950/75 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
      data-testid="report-modal"
      onClick={onClose}
      onKeyDown={handleDialogKeyDown}
    >
      <div
        ref={dialogRef}
        className="flex h-dvh w-full flex-col overflow-hidden rounded-none border-0 bg-slate-900 text-slate-100 shadow-2xl sm:h-auto sm:max-h-[90vh] sm:max-w-3xl sm:rounded-2xl sm:border sm:border-slate-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 bg-slate-950/95 px-4 py-3 sm:px-5">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sky-400/40 bg-sky-950/80 text-sky-300">
              <FileBarChart2 className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <h2
                  id="report-modal-title"
                  className="truncate text-sm sm:text-base font-bold text-white"
                >
                  통합 리포트
                </h2>
                {projectId && (
                  <span
                    data-testid="report-project-badge"
                    className="inline-flex items-center rounded border border-sky-500/50 bg-sky-950/80 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-sky-200"
                  >
                    {displayProjectTitle}
                  </span>
                )}
                {report &&
                  (integrityVerified ? (
                    <span
                      data-testid="report-integrity-verified"
                      className="inline-flex items-center gap-1 rounded border border-emerald-400/70 bg-emerald-950/85 px-1.5 py-0.5 text-[11px] font-bold text-emerald-100"
                      title={`마스킹 잔여물 0건 · 원천 정직성 ${report.integrity.sourceHonesty ? '충족' : '확인 필요'}`}
                    >
                      <CheckCircle2 className="h-3 w-3 text-emerald-300 shrink-0" aria-hidden="true" />
                      검증됨
                    </span>
                  ) : (
                    <span
                      data-testid="report-integrity-unverified"
                      className="inline-flex items-center gap-1 rounded border border-amber-400/75 bg-amber-950/85 px-1.5 py-0.5 text-[11px] font-bold text-amber-100"
                      title={`마스킹 잔여물 확인 필요 (maskedResidue: ${report.integrity.maskedResidue})`}
                    >
                      <AlertTriangle className="h-3 w-3 text-amber-300 shrink-0" aria-hidden="true" />
                      검토 필요
                    </span>
                  ))}
              </div>
              <p className="mt-0.5 text-[11px] text-slate-300">
                {report
                  ? `v${report.reportVersion} · 최근 ${report.rangeDays}일 · 생성 ${formatReportGeneratedAt(report.generatedAt)}`
                  : '선택 프로젝트의 연동 시스템 현황을 통합 집계합니다.'}
              </p>
            </div>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="통합 리포트 모달 닫기"
            data-testid="report-modal-close"
            className="inline-flex min-h-[34px] min-w-[34px] shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 p-1.5 text-slate-200 hover:bg-slate-800 hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Toolbar: Range Switcher (7 / 14 / 30일) + Refresh + Export Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/95 px-4 py-2.5 sm:px-5">
          <div
            className="inline-flex items-center rounded-xl border border-slate-700 bg-slate-950 p-0.5"
            role="group"
            aria-label="리포트 기간 선택"
            data-testid="report-range-group"
          >
            {REPORT_RANGE_DAYS_OPTIONS.map((opt) => {
              const active = days === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  data-testid={`report-days-${opt}`}
                  aria-label={`최근 ${opt}일 리포트 조회`}
                  aria-pressed={active}
                  onClick={() => setDays(opt)}
                  className={`min-h-[30px] rounded-lg px-2.5 py-1 text-xs font-bold transition focus-visible:outline-2 focus-visible:outline-sky-400 ${
                    active
                      ? 'bg-sky-700 text-white'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  {opt}일
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              disabled={!projectId || loading}
              onClick={() => setReloadNonce((n) => n + 1)}
              aria-label="통합 리포트 새로고침"
              data-testid="report-refresh-btn"
              className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-100 hover:bg-slate-700 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-sky-400"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-sky-300' : ''}`}
                aria-hidden="true"
              />
              <span>갱신</span>
            </button>

            <button
              type="button"
              disabled={!projectId || exporting !== null || Boolean(forbiddenMessage)}
              onClick={() => {
                void fetchMarkdownForAction('copy');
              }}
              aria-label="Markdown 리포트 클립보드 복사"
              data-testid="report-copy-md"
              className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-100 hover:bg-slate-700 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-sky-400"
            >
              {copiedJustNow ? (
                <Check className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-sky-300" aria-hidden="true" />
              )}
              <span>{copiedJustNow ? '복사됨' : 'Markdown 복사'}</span>
            </button>

            <button
              type="button"
              disabled={!projectId || exporting !== null || Boolean(forbiddenMessage)}
              onClick={() => {
                void fetchMarkdownForAction('download');
              }}
              aria-label="Markdown 리포트 파일 다운로드"
              data-testid="report-download-md"
              className="inline-flex min-h-[32px] items-center gap-1 rounded-lg bg-sky-700 px-2.5 py-1 text-xs font-bold text-white hover:bg-sky-600 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-sky-400"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>다운로드</span>
            </button>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5 space-y-4">
          {!projectId ? (
            <div
              data-testid="report-no-project"
              className="rounded-xl border border-slate-800 bg-slate-950/75 px-4 py-8 text-center text-xs text-slate-300"
            >
              선택된 프로젝트가 없습니다. 프로젝트를 선택한 뒤 리포트를 열어 주세요.
            </div>
          ) : forbiddenMessage ? (
            <div
              role="alert"
              data-testid="report-forbidden"
              className="flex items-start gap-2 rounded-xl border border-rose-500/75 bg-rose-950/75 p-3 text-xs text-rose-100"
            >
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" aria-hidden="true" />
              <span>{forbiddenMessage}</span>
            </div>
          ) : loading && !report ? (
            <div
              data-testid="report-loading"
              className="rounded-xl border border-slate-800 bg-slate-950/75 px-4 py-10 text-center text-xs text-slate-300"
            >
              {projectId} 최근 {days}일 통합 리포트를 생성하는 중...
            </div>
          ) : (
            <>
              {generalError && (
                <div
                  role="alert"
                  data-testid="report-error"
                  className="flex items-start gap-2 rounded-xl border border-amber-500/70 bg-amber-950/70 p-3 text-xs text-amber-100"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
                  <span>{generalError}</span>
                </div>
              )}

              {/* unavailableModules Warning Line */}
              {unavailableNames.length > 0 && (
                <div
                  role="alert"
                  data-testid="report-unavailable-warning"
                  className="flex items-start gap-2 rounded-xl border border-rose-500/75 bg-rose-950/75 px-3 py-2.5 text-xs text-rose-100"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" aria-hidden="true" />
                  <div>
                    <span className="font-bold">일부 시스템 일시 오류: </span>
                    <span>{unavailableNames.join(', ')}</span>
                    <span className="text-rose-200">
                      {' '}— 해당 시스템의 항목은 집계에서 제외되었으며 가짜 수치를 채우지 않았습니다.
                    </span>
                  </div>
                </div>
              )}

              {/* Executive KPI Cards (ONLY keys actually present in report.executiveKpi) */}
              {report && kpiCards.length > 0 && (
                <section aria-label="핵심 지표 요약" className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-slate-300">
                    핵심 지표 요약
                  </h3>
                  <div
                    data-testid="report-kpi-grid"
                    className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
                  >
                    {kpiCards.map((card) => (
                      <div
                        key={card.key}
                        data-testid={`report-kpi-${card.key}`}
                        className="rounded-xl border border-slate-800 bg-slate-950/85 px-3 py-2.5"
                      >
                        <p className="truncate text-[11px] font-medium text-slate-300">
                          {card.label}
                        </p>
                        <p className="mt-1 font-mono text-base font-bold text-white tabular-nums">
                          {card.value}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Module Sections Table */}
              {report && (
                <section aria-label="모듈별 섹션 상세" className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-slate-300">
                      모듈별 현황 ({report.sections.length})
                    </h3>
                    {loading && (
                      <span className="text-[11px] text-sky-300">갱신 중...</span>
                    )}
                  </div>

                  <div className="space-y-2.5" data-testid="report-sections-list">
                    {report.sections.map((section) => {
                      const modName = resolveMetaModuleName(section.moduleId, registry);
                      const statusLabel = getMetaModuleStatusLabel(section.status);
                      const badgeCls = MODULE_STATUS_BADGE_CLASS[section.status];

                      return (
                        <div
                          key={section.moduleId}
                          data-testid={`report-section-${section.moduleId}`}
                          className="rounded-xl border border-slate-800 bg-slate-950/80 overflow-hidden"
                        >
                          <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 bg-slate-900/75 px-3 py-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="truncate text-xs font-bold text-white">
                                {modName}
                              </span>
                              <span
                                className={`inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold ${badgeCls}`}
                              >
                                {statusLabel}
                              </span>
                            </div>
                            <span className="shrink-0 font-mono text-[11px] text-slate-300">
                              {section.highlights.length}건
                            </span>
                          </div>

                          {section.highlights.length === 0 ? (
                            <p className="px-3 py-2.5 text-xs text-slate-300">
                              {section.status === 'planned'
                                ? '준비 중 — 연동 완료 시 주요 항목이 자동 반영됩니다.'
                                : section.status === 'nosource'
                                  ? '원천 없음 — 이 프로젝트에 연결된 데이터가 없습니다.'
                                  : section.status === 'unavailable'
                                    ? '일시 오류 — 현재 시스템 응답을 받을 수 없습니다.'
                                    : '최근 기간 내 주요 항목이 없습니다.'}
                            </p>
                          ) : (
                            <>
                              {/* Desktop Table */}
                              <div className="hidden sm:block overflow-x-auto">
                                <table className="w-full text-left text-xs">
                                  <thead className="border-b border-slate-800/90 text-[11px] text-slate-400">
                                    <tr>
                                      <th className="px-3 py-1.5 font-semibold">코드</th>
                                      <th className="px-3 py-1.5 font-semibold">항목</th>
                                      <th className="px-3 py-1.5 font-semibold">지표</th>
                                      <th className="px-3 py-1.5 font-semibold">등급</th>
                                      <th className="px-3 py-1.5 font-semibold">갱신</th>
                                      <th className="px-3 py-1.5 font-semibold text-right">이동</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-800/70">
                                    {section.highlights.map((item) => {
                                      const link = resolveKeyItemLink(item);
                                      const sevLabel = SEVERITY_LABEL_KO[item.severity];
                                      return (
                                        <tr key={item.id} className="hover:bg-slate-900/60">
                                          <td className="px-3 py-2 font-mono font-bold text-sky-200 whitespace-nowrap">
                                            {item.code}
                                          </td>
                                          <td className="px-3 py-2 font-medium text-white">
                                            {item.title}
                                          </td>
                                          <td className="px-3 py-2 text-slate-200 whitespace-nowrap">
                                            {String(item.metric || '-')}
                                          </td>
                                          <td className="px-3 py-2 whitespace-nowrap">
                                            <span
                                              className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${SEVERITY_BADGE_CLASS[item.severity]}`}
                                            >
                                              {sevLabel}
                                            </span>
                                          </td>
                                          <td className="px-3 py-2 text-slate-300 whitespace-nowrap">
                                            {formatRelativeUpdatedAt(item.updatedAt)}
                                          </td>
                                          <td className="px-3 py-2 text-right whitespace-nowrap">
                                            {link.disabled || !link.href ? (
                                              <button
                                                type="button"
                                                disabled
                                                aria-label={`${item.code} 이동 불가 — ${link.disabledReason ?? '링크 없음'}`}
                                                title={link.disabledReason ?? undefined}
                                                className="inline-flex cursor-not-allowed items-center rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] text-slate-400"
                                              >
                                                없음
                                              </button>
                                            ) : (
                                              <a
                                                href={link.href}
                                                aria-label={`${item.code} ${item.title} 열기`}
                                                onClick={(e) => {
                                                  if (isPreview) {
                                                    e.preventDefault();
                                                    onPreviewLinkBlocked(`${item.code} (${item.title})`);
                                                  }
                                                }}
                                                className="inline-flex items-center gap-1 rounded border border-sky-500/60 bg-sky-950/75 px-2 py-0.5 text-[11px] font-semibold text-sky-100 hover:bg-sky-900 focus-visible:outline-2 focus-visible:outline-sky-400"
                                              >
                                                열기
                                                <ExternalLink className="h-3 w-3" aria-hidden="true" />
                                              </a>
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>

                              {/* Mobile Cards (375px safe, zero horizontal overflow) */}
                              <ul className="sm:hidden divide-y divide-slate-800/80">
                                {section.highlights.map((item) => {
                                  const link = resolveKeyItemLink(item);
                                  const sevLabel = SEVERITY_LABEL_KO[item.severity];
                                  return (
                                    <li key={item.id} className="px-3 py-2 space-y-1">
                                      <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                          <span className="font-mono text-[11px] font-bold text-sky-200 shrink-0">
                                            {item.code}
                                          </span>
                                          <span
                                            className={`inline-flex shrink-0 items-center rounded border px-1 py-0.5 text-[10px] font-semibold leading-none ${SEVERITY_BADGE_CLASS[item.severity]}`}
                                          >
                                            {sevLabel}
                                          </span>
                                        </div>
                                        <span className="text-[10px] text-slate-300 shrink-0">
                                          {formatRelativeUpdatedAt(item.updatedAt)}
                                        </span>
                                      </div>
                                      <p className="text-xs font-semibold text-white break-words">
                                        {item.title}
                                      </p>
                                      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-300">
                                        <span className="truncate">{String(item.metric || '-')}</span>
                                        {link.disabled || !link.href ? (
                                          <span className="text-slate-400 shrink-0">링크 없음</span>
                                        ) : (
                                          <a
                                            href={link.href}
                                            aria-label={`${item.code} ${item.title} 열기`}
                                            onClick={(e) => {
                                              if (isPreview) {
                                                e.preventDefault();
                                                onPreviewLinkBlocked(`${item.code} (${item.title})`);
                                              }
                                            }}
                                            className="inline-flex shrink-0 items-center gap-0.5 font-semibold text-sky-300"
                                          >
                                            열기
                                            <ExternalLink className="h-3 w-3" aria-hidden="true" />
                                          </a>
                                        )}
                                      </div>
                                    </li>
                                  );
                                })}
                              </ul>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        {/* Sticky Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-slate-800 bg-slate-950/95 px-4 py-2.5 sm:px-5 text-[11px] text-slate-300">
          <span className="truncate">
            {isPreview
              ? '미리보기 예시 리포트 · 실제 집계는 SGW 운영 환경에서 생성됩니다.'
              : '동일 오리진 SGW 허브 집계 · 원천 없는 시스템은 가짜 수치 없이 표시됩니다.'}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="통합 리포트 닫기"
            className="shrink-0 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-sky-400"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
