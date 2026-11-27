import React, { useCallback, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Anchor,
  Briefcase,
  Building2,
  CheckCircle2,
  Clock,
  ExternalLink,
  FolderKanban,
  Lightbulb,
  Mail,
  MessageSquare,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Search,
  Shield,
  Ship,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';
import {
  buildSedmsProjectUrl,
  buildTalkDmUrl,
  buildTalkRoomUrl,
  isSafeNavigationUrl,
  SEDMS_PROJECTS_LOGIN_URL,
  SGW_PORTAL_LINKS,
} from '../deepLink';
import { getErrorDescriptor, type AppErrorCode } from '../errorCatalog';
import type { HarborPerson, HarborShip } from '../mapping';
import type { RuntimeEnv } from '../runtimeEnv';
import {
  SEDMS_EMPTY_PROJECTS_MESSAGE,
  SEDMS_UNAVAILABLE_MESSAGE,
  SEDMS_UNMAPPED_MESSAGE,
  type SgwUser,
} from '../sgwAdapter';
import { WEBGL_RETRY_BUTTON_LABEL, type WebGLFallbackReason } from '../webglContextState';

export interface AccessibleListViewProps {
  user: SgwUser;
  runtimeEnv: RuntimeEnv;
  ships: HarborShip[];
  projectsState: 'loading' | 'ready' | 'unmapped' | 'unavailable' | 'pending' | 'forbidden' | 'error';
  projectsMessage: string;
  projectsErrorCode?: AppErrorCode | null;
  people: HarborPerson[];
  webglSupported: boolean;
  webglContextLost?: boolean;
  webglFallbackReason?: WebGLFallbackReason;
  sceneLoading3D?: boolean;
  onRetry3D?: () => void;
  onRefreshProjects: () => void;
  onSelectShip: (ship: HarborShip) => void;
  onSelectPerson: (person: HarborPerson) => void;
  onPreviewLinkBlocked: (featureLabel: string) => void;
}

const STATUS_BADGE_CLASS: Record<HarborShip['statusTone'], string> = {
  active: 'bg-sky-950/90 text-sky-100 border-sky-400/60',
  review: 'bg-amber-950/90 text-amber-100 border-amber-400/60',
  hold: 'bg-rose-950/90 text-rose-100 border-rose-400/60',
  completed: 'bg-emerald-950/90 text-emerald-100 border-emerald-400/60',
  neutral: 'bg-slate-800 text-slate-100 border-slate-500/60',
};

function renderShipStatusIcon(tone: HarborShip['statusTone']): React.ReactNode {
  switch (tone) {
    case 'active':
      return <PlayCircle className="h-3.5 w-3.5 text-sky-300 shrink-0" aria-hidden="true" />;
    case 'review':
      return <Clock className="h-3.5 w-3.5 text-amber-300 shrink-0" aria-hidden="true" />;
    case 'hold':
      return <PauseCircle className="h-3.5 w-3.5 text-rose-300 shrink-0" aria-hidden="true" />;
    case 'completed':
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300 shrink-0" aria-hidden="true" />;
    default:
      return <Ship className="h-3.5 w-3.5 text-slate-300 shrink-0" aria-hidden="true" />;
  }
}

/**
 * Hybrid Quick Radar & 2D Accessible List Dashboard.
 * - Zero 3D manipulation required: 1-tap >= 44x44px touch buttons for 대화·파일·도면·메일.
 * - Strictly 0px horizontal overflow at 375px mobile width and WCAG AA >= 4.5:1 contrast.
 * - Never relies on color alone for status (always pairs icon + explicit Korean text).
 */
export const AccessibleListView: React.FC<AccessibleListViewProps> = ({
  user,
  runtimeEnv,
  ships,
  projectsState,
  projectsMessage: _projectsMessage,
  projectsErrorCode = null,
  people,
  webglSupported,
  webglContextLost = false,
  webglFallbackReason = null,
  sceneLoading3D = false,
  onRetry3D,
  onRefreshProjects,
  onSelectShip,
  onSelectPerson,
  onPreviewLinkBlocked,
}) => {
  const [query, setQuery] = useState('');
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [openInNewTab, setOpenInNewTab] = useState(false);

  const isPreview = runtimeEnv === 'preview';

  const projectsErrorDescriptor =
    projectsState === 'pending'
      ? getErrorDescriptor(projectsErrorCode ?? 'not_found')
      : projectsState === 'forbidden'
        ? getErrorDescriptor(projectsErrorCode ?? 'forbidden')
        : projectsState === 'error'
          ? getErrorDescriptor(projectsErrorCode ?? 'server_error')
          : null;

  const filteredPeople = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people
      .filter((p) => (onlineOnly ? p.online : true))
      .filter((p) => {
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          p.dept.toLowerCase().includes(q) ||
          p.title.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name, 'ko'));
  }, [people, query, onlineOnly]);

  const safeHref = (url: string) => (isSafeNavigationUrl(url) ? url : '/');

  const handleLinkClick = (label: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (isPreview) {
      e.preventDefault();
      onPreviewLinkBlocked(label);
    }
  };

  /**
   * Keyboard roving navigation (ArrowDown / ArrowUp / Home / End) inside list/table containers.
   */
  const handleRovingKeyDown = useCallback((e: React.KeyboardEvent<HTMLElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const container = e.currentTarget;
    const items = Array.from(
      container.querySelectorAll<HTMLElement>('[data-kbd-item="true"]'),
    );
    if (items.length === 0) return;

    const currentIdx = items.indexOf(document.activeElement as HTMLElement);
    if (currentIdx === -1) return;

    e.preventDefault();
    let nextIdx = currentIdx;
    if (e.key === 'ArrowDown') nextIdx = (currentIdx + 1) % items.length;
    else if (e.key === 'ArrowUp') nextIdx = (currentIdx - 1 + items.length) % items.length;
    else if (e.key === 'Home') nextIdx = 0;
    else if (e.key === 'End') nextIdx = items.length - 1;

    items[nextIdx]?.focus();
  }, []);

  return (
    <main
      id="main-content"
      tabIndex={-1}
      data-testid="quick-radar-view"
      className="min-h-screen w-full overflow-x-hidden overflow-y-auto bg-slate-950 px-3 sm:px-4 pb-16 pt-24 sm:pt-20 text-slate-100 focus:outline-none"
      aria-label="메타SGW 빠른 레이더 및 2D 목록 상황판"
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-20 focus:z-50 focus:rounded-lg focus:bg-sky-700 focus:px-3 focus:py-2 focus:text-xs focus:font-bold focus:text-white focus:outline-2 focus:outline-sky-300"
      >
        본문으로 건너뛰기
      </a>

      <div className="mx-auto max-w-6xl space-y-5">
        {sceneLoading3D && webglSupported && !webglContextLost && (
          <div
            role="status"
            data-testid="scene-3d-loading-banner"
            className="flex items-center justify-between gap-3 rounded-xl border border-sky-500/40 bg-sky-950/60 px-4 py-2.5 text-xs text-sky-100"
          >
            <span>3D 항구 화면을 백그라운드에서 불러오는 중입니다. 준비되기 전에도 2D 목록에서 모든 기능을 바로 사용할 수 있습니다.</span>
          </div>
        )}

        {webglContextLost && webglSupported && (
          <div
            role="alert"
            data-testid="webgl-context-lost-banner"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/60 bg-amber-950/75 px-4 py-3 text-sm text-amber-100"
          >
            <div className="flex items-start gap-2.5 min-w-0">
              <AlertTriangle className="h-5 w-5 text-amber-300 shrink-0 mt-0.5" aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-bold text-white">
                  {webglFallbackReason === 'load_failed'
                    ? '3D 항구 모듈을 불러오지 못해 2D 목록 모드를 유지합니다.'
                    : '3D 그래픽 연결이 일시 중단되어 2D 목록 모드로 전환되었습니다.'}
                </p>
                <p className="mt-0.5 text-xs text-amber-100">
                  {webglFallbackReason === 'load_failed'
                    ? '네트워크 또는 그래픽 초기화 오류로 3D 로딩에 실패했습니다. 2D 목록에서 모든 업무를 계속 이용할 수 있습니다.'
                    : '그래픽 장치가 복구되면 자동으로 3D 항구로 돌아가며, 아래 버튼으로 즉시 다시 시도할 수 있습니다.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              data-testid="retry-3d-button"
              onClick={onRetry3D}
              aria-label={WEBGL_RETRY_BUTTON_LABEL}
              className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg bg-sky-700 px-4 py-2 text-xs font-bold text-white hover:bg-sky-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              <span>{WEBGL_RETRY_BUTTON_LABEL}</span>
            </button>
          </div>
        )}

        {!webglSupported && (
          <div
            role="status"
            className="rounded-xl border border-amber-400/50 bg-amber-950/60 px-4 py-3 text-sm text-amber-100"
          >
            이 브라우저 환경은 3D WebGL 가속을 지원하지 않아 빠른 레이더(2D) 모드로 자동 전환되었습니다.
            모든 SGW 및 SEDMS 연동 기능을 동일하게 사용할 수 있습니다.
          </div>
        )}

        {/* 1. 1-Tap Quick Radar Actions (대화 · 파일 · 도면 · 메일 — >= 44x44px touch targets) */}
        <section aria-labelledby="heading-quick-radar-actions" className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h1 id="heading-quick-radar-actions" className="text-base font-bold text-white">
              빠른 레이더 — 1탭 바로가기
            </h1>
            <span className="text-xs text-slate-300">
              프로젝트 {ships.length} · 접속 동료 {people.filter((p) => p.online).length}/{people.length}
            </span>
          </div>

          <div
            data-testid="quick-radar-1tap-grid"
            className="grid grid-cols-2 gap-2.5 sm:grid-cols-4"
          >
            <a
              href={safeHref(SGW_PORTAL_LINKS.talkHome)}
              onClick={handleLinkClick('대화 (SGTALK)')}
              data-testid="radar-tap-talk"
              aria-label="대화 — SGTALK 사내 채팅 열기"
              className="flex min-h-[56px] min-w-[44px] items-center gap-3 rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-3 text-left text-white hover:border-sky-400 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
            >
              <MessageSquare className="h-5 w-5 text-sky-300 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <div className="text-sm font-bold leading-tight text-white">대화</div>
                <div className="truncate text-xs text-slate-300">SGTALK 채팅</div>
              </div>
            </a>

            <a
              href={safeHref(SGW_PORTAL_LINKS.nas)}
              onClick={handleLinkClick('파일 (SGW NAS)')}
              data-testid="radar-tap-nas"
              aria-label="파일 — SGW NAS 공유 문서함 열기"
              className="flex min-h-[56px] min-w-[44px] items-center gap-3 rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-3 text-left text-white hover:border-teal-400 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
            >
              <Building2 className="h-5 w-5 text-teal-300 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <div className="text-sm font-bold leading-tight text-white">파일</div>
                <div className="truncate text-xs text-slate-300">SGW NAS</div>
              </div>
            </a>

            <a
              href={safeHref(SGW_PORTAL_LINKS.sedmsProjects)}
              onClick={handleLinkClick('도면 (SEDMS)')}
              data-testid="radar-tap-sedms"
              aria-label="도면 — SEDMS 프로젝트 및 도면 열기"
              className="flex min-h-[56px] min-w-[44px] items-center gap-3 rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-3 text-left text-white hover:border-emerald-400 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
            >
              <FolderKanban className="h-5 w-5 text-emerald-300 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <div className="text-sm font-bold leading-tight text-white">도면</div>
                <div className="truncate text-xs text-slate-300">SEDMS 열기</div>
              </div>
            </a>

            <a
              href={safeHref(SGW_PORTAL_LINKS.bmail)}
              onClick={handleLinkClick('메일 (bmail)')}
              data-testid="radar-tap-mail"
              aria-label="메일 — bmail PC 메일 앱 열기"
              className="flex min-h-[56px] min-w-[44px] items-center gap-3 rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-3 text-left text-white hover:border-indigo-400 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
            >
              <Mail className="h-5 w-5 text-indigo-300 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <div className="text-sm font-bold leading-tight text-white">메일</div>
                <div className="truncate text-xs text-slate-300">bmail 열기</div>
              </div>
            </a>
          </div>
        </section>

        {/* 2. SEDMS Projects (Mobile 1-Tap Cards + Desktop Table) */}
        <section
          aria-labelledby="heading-sedms-projects"
          className="rounded-2xl border border-slate-800 bg-slate-900/95 p-4 sm:p-5 shadow-lg"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <Ship className="h-5 w-5 text-sky-400 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <h2 id="heading-sedms-projects" className="text-base font-bold text-white">
                  정박 프로젝트 선박 (SEDMS)
                </h2>
                <p className="text-xs text-slate-300">
                  {isPreview
                    ? '미리보기 데모 가명 프로젝트입니다. 상태 아이콘과 텍스트로 진행 현황을 구분합니다.'
                    : '참여 중인 SEDMS 프로젝트입니다. 각 선박에서 도면·대화·파일로 즉시 이동합니다.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              {!isPreview && (
                <label className="hidden sm:inline-flex items-center gap-1.5 text-xs text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={openInNewTab}
                    onChange={(e) => setOpenInNewTab(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-800 accent-sky-500"
                  />
                  새 창으로 열기
                </label>
              )}

              <button
                type="button"
                onClick={onRefreshProjects}
                aria-label="프로젝트 목록 새로고침"
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                <span>새로고침</span>
              </button>
            </div>
          </div>

          <div className="mt-4">
            {projectsState === 'loading' && (
              <p className="py-8 text-center text-sm text-slate-300">프로젝트 목록을 불러오는 중입니다...</p>
            )}

            {projectsState === 'pending' && projectsErrorDescriptor && (
              <div
                data-testid="projects-error-panel"
                className="rounded-xl border border-slate-700 bg-slate-950/70 p-5 text-center space-y-3"
              >
                <p className="text-base font-semibold text-white">
                  {projectsErrorDescriptor.title}
                </p>
                <p className="text-xs text-slate-300">{projectsErrorDescriptor.message}</p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <a
                    href={safeHref(SGW_PORTAL_LINKS.sedmsProjects)}
                    target={!isPreview && openInNewTab ? '_blank' : undefined}
                    rel={!isPreview && openInNewTab ? 'noopener noreferrer' : undefined}
                    onClick={handleLinkClick(projectsErrorDescriptor.nextActionLabel)}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-sky-700 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
                  >
                    <FolderKanban className="h-4 w-4" aria-hidden="true" />
                    {projectsErrorDescriptor.nextActionLabel}
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                </div>
              </div>
            )}

            {projectsState === 'forbidden' && projectsErrorDescriptor && (
              <div
                role="alert"
                data-testid="projects-error-panel"
                className="rounded-xl border border-rose-500/40 bg-rose-950/40 p-5 text-center space-y-3 text-sm text-rose-100"
              >
                <p className="text-base font-semibold text-white">
                  {projectsErrorDescriptor.title}
                </p>
                <p className="text-xs text-rose-100">{projectsErrorDescriptor.message}</p>
                <a
                  href={safeHref(SGW_PORTAL_LINKS.talkHome)}
                  onClick={handleLinkClick(projectsErrorDescriptor.nextActionLabel)}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-rose-400/50 bg-rose-900/70 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
                >
                  <span>{projectsErrorDescriptor.nextActionLabel}</span>
                </a>
              </div>
            )}

            {projectsState === 'error' && projectsErrorDescriptor && (
              <div
                role="alert"
                data-testid="projects-error-panel"
                className="rounded-xl border border-rose-500/40 bg-rose-950/40 p-5 text-center space-y-3 text-sm text-rose-100"
              >
                <p className="text-base font-semibold text-white">
                  {projectsErrorDescriptor.title}
                </p>
                <p className="text-xs text-rose-100">{projectsErrorDescriptor.message}</p>
                <button
                  type="button"
                  onClick={onRefreshProjects}
                  aria-label={projectsErrorDescriptor.nextActionLabel}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-sky-700 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  <span>{projectsErrorDescriptor.nextActionLabel}</span>
                </button>
              </div>
            )}

            {projectsState === 'unmapped' && (
              <div
                data-testid="projects-unmapped-panel"
                className="rounded-xl border border-sky-500/40 bg-sky-950/40 p-5 text-center space-y-3"
              >
                <p className="text-sm font-semibold text-white">{SEDMS_UNMAPPED_MESSAGE}</p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <a
                    href={safeHref(SEDMS_PROJECTS_LOGIN_URL)}
                    target={!isPreview && openInNewTab ? '_blank' : undefined}
                    rel={!isPreview && openInNewTab ? 'noopener noreferrer' : undefined}
                    onClick={handleLinkClick('SEDMS 열기')}
                    data-testid="sedms-unmapped-open-link"
                    aria-label="SEDMS 열기"
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-sky-700 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
                  >
                    <FolderKanban className="h-4 w-4" aria-hidden="true" />
                    <span>SEDMS 열기</span>
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                </div>
              </div>
            )}

            {projectsState === 'unavailable' && (
              <div
                data-testid="projects-unavailable-panel"
                className="rounded-xl border border-slate-700 bg-slate-950/70 p-5 text-center space-y-3"
              >
                <p className="text-sm font-semibold text-white">{SEDMS_UNAVAILABLE_MESSAGE}</p>
                <button
                  type="button"
                  onClick={onRefreshProjects}
                  aria-label="프로젝트 목록 다시 확인"
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  <span>다시 확인</span>
                </button>
              </div>
            )}

            {projectsState === 'ready' && ships.length === 0 && (
              <div
                data-testid="projects-empty-panel"
                className="rounded-xl border border-slate-800 bg-slate-950/60 p-5 text-center text-sm text-slate-300"
              >
                {SEDMS_EMPTY_PROJECTS_MESSAGE}
              </div>
            )}

            {projectsState === 'ready' && ships.length > 0 && (
              <>
                {/* Mobile (< md): Zero-overflow 1-tap cards (>= 44x44px touch targets) */}
                <ul className="space-y-3 md:hidden" onKeyDown={handleRovingKeyDown}>
                  {ships.map((ship) => {
                    const ssoHref = safeHref(buildSedmsProjectUrl(ship.id));
                    const talkHref = safeHref(buildTalkRoomUrl(ship.id));
                    const nasHref = safeHref(SGW_PORTAL_LINKS.nas);
                    return (
                      <li
                        key={ship.id}
                        className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5 space-y-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-mono text-[11px] text-slate-300 truncate">
                              {ship.berthLabel} · {ship.code}
                            </p>
                            <h3 className="text-sm font-bold text-white truncate">{ship.name}</h3>
                            <p className="mt-0.5 text-xs text-slate-300">
                              역할: {ship.role} · 갱신: {ship.updatedAt}
                            </p>
                          </div>

                          <span
                            className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold ${STATUS_BADGE_CLASS[ship.statusTone]}`}
                          >
                            {renderShipStatusIcon(ship.statusTone)}
                            <span>{ship.appearance.statusLabelKo}</span>
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 text-xs text-slate-300">
                          <Lightbulb
                            className={`h-3.5 w-3.5 shrink-0 ${
                              ship.appearance.hasDeckLights ? 'text-amber-300' : 'text-slate-400'
                            }`}
                            aria-hidden="true"
                          />
                          <span>
                            {ship.appearance.hasDeckLights
                              ? '갑판 불빛 점등 (7일 이내 갱신)'
                              : '갑판 불빛 소등 (7일 경과)'}
                          </span>
                        </div>

                        <div className="grid grid-cols-4 gap-1.5">
                          <a
                            href={ssoHref}
                            onClick={handleLinkClick(`도면 SEDMS(${ship.code})`)}
                            aria-label={`${ship.name} 도면 SEDMS 열기`}
                            className="flex min-h-[44px] min-w-[44px] flex-col items-center justify-center rounded-lg bg-sky-700 px-1.5 py-1.5 text-[11px] font-semibold text-white hover:bg-sky-600 focus-visible:outline-2 focus-visible:outline-sky-300"
                          >
                            <FolderKanban className="h-4 w-4" aria-hidden="true" />
                            <span>도면</span>
                          </a>

                          <a
                            href={talkHref}
                            onClick={handleLinkClick(`팀 채팅(${ship.code})`)}
                            aria-label={`${ship.name} 팀 채팅 대화 열기`}
                            className="flex min-h-[44px] min-w-[44px] flex-col items-center justify-center rounded-lg border border-slate-700 bg-slate-800 px-1.5 py-1.5 text-[11px] font-semibold text-slate-100 hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-sky-300"
                          >
                            <MessageSquare className="h-4 w-4 text-sky-300" aria-hidden="true" />
                            <span>대화</span>
                          </a>

                          <a
                            href={nasHref}
                            onClick={handleLinkClick(`NAS 파일(${ship.code})`)}
                            aria-label={`${ship.name} NAS 파일 폴더 열기`}
                            className="flex min-h-[44px] min-w-[44px] flex-col items-center justify-center rounded-lg border border-slate-700 bg-slate-800 px-1.5 py-1.5 text-[11px] font-semibold text-slate-100 hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-sky-300"
                          >
                            <Building2 className="h-4 w-4 text-teal-300" aria-hidden="true" />
                            <span>파일</span>
                          </a>

                          <button
                            type="button"
                            data-kbd-item="true"
                            onClick={() => onSelectShip(ship)}
                            aria-label={`${ship.name} 선상 패널 열기`}
                            className="flex min-h-[44px] min-w-[44px] flex-col items-center justify-center rounded-lg border border-slate-700 bg-slate-800 px-1.5 py-1.5 text-[11px] font-semibold text-slate-100 hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-sky-300"
                          >
                            <Anchor className="h-4 w-4 text-amber-300" aria-hidden="true" />
                            <span>승선</span>
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                {/* Desktop (>= md): Full accessible data table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-800 text-xs font-semibold text-slate-300">
                        <th scope="col" className="py-2.5 pr-3">선석</th>
                        <th scope="col" className="py-2.5 pr-3">코드</th>
                        <th scope="col" className="py-2.5 pr-3">프로젝트명</th>
                        <th scope="col" className="py-2.5 pr-3">내 권한</th>
                        <th scope="col" className="py-2.5 pr-3">상태</th>
                        <th scope="col" className="py-2.5 pr-3">최근 갱신</th>
                        <th scope="col" className="py-2.5 text-right">이동</th>
                      </tr>
                    </thead>
                    <tbody
                      className="divide-y divide-slate-800/80"
                      onKeyDown={handleRovingKeyDown}
                    >
                      {ships.map((ship) => {
                        const ssoHref = safeHref(buildSedmsProjectUrl(ship.id));
                        return (
                          <tr key={ship.id} className="hover:bg-slate-800/40">
                            <td className="py-3 pr-3 font-mono text-xs text-slate-300">{ship.berthLabel}</td>
                            <td className="py-3 pr-3 font-mono text-xs text-slate-200">{ship.code}</td>
                            <td className="py-3 pr-3 font-semibold text-white">
                              <button
                                type="button"
                                data-kbd-item="true"
                                onClick={() => onSelectShip(ship)}
                                aria-label={`${ship.name} (${ship.code}) 프로젝트 상세 보기`}
                                className="rounded text-left hover:text-sky-300 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
                              >
                                {ship.name}
                              </button>
                            </td>
                            <td className="py-3 pr-3 text-xs text-slate-200">{ship.role}</td>
                            <td className="py-3 pr-3">
                              <span
                                className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE_CLASS[ship.statusTone]}`}
                              >
                                {renderShipStatusIcon(ship.statusTone)}
                                <span>{ship.appearance.statusLabelKo}</span>
                              </span>
                            </td>
                            <td className="py-3 pr-3 font-mono text-xs text-slate-300">{ship.updatedAt}</td>
                            <td className="py-3 text-right">
                              <a
                                href={ssoHref}
                                target={!isPreview && openInNewTab ? '_blank' : undefined}
                                rel={!isPreview && openInNewTab ? 'noopener noreferrer' : undefined}
                                onClick={handleLinkClick(`SEDMS 프로젝트(${ship.code}) 입장`)}
                                aria-label={`${ship.name} SEDMS 프로젝트 열기`}
                                className="inline-flex min-h-[36px] items-center gap-1 rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
                              >
                                SEDMS 열기
                                <ExternalLink className="h-3 w-3" aria-hidden="true" />
                              </a>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </section>

        {/* 3. People & Presence Radar */}
        <section
          aria-labelledby="heading-harbor-people"
          className="rounded-2xl border border-slate-800 bg-slate-900/95 p-4 sm:p-5 shadow-lg"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <Users className="h-5 w-5 text-emerald-400 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <h2 id="heading-harbor-people" className="text-base font-bold text-white">
                  직원 · 접속 현황 (SGW)
                </h2>
                <p className="text-xs text-slate-300">
                  아이콘과 텍스트로 접속 상태를 표시하며 1탭으로 대화·메일을 실행합니다.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:flex-none">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="이름 · 부서 · 직급 검색"
                  aria-label="직원 검색"
                  className="min-h-[44px] w-full sm:w-52 rounded-lg border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-xs text-white placeholder:text-slate-400 focus:border-sky-400 focus:outline-2 focus:outline-sky-400"
                />
              </div>
              <label className="inline-flex min-h-[44px] items-center gap-1.5 text-xs text-slate-200 cursor-pointer px-1">
                <input
                  type="checkbox"
                  checked={onlineOnly}
                  onChange={(e) => setOnlineOnly(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-800 accent-emerald-500"
                />
                접속 중만 보기
              </label>
            </div>
          </div>

          {filteredPeople.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-300">
              표시할 직원 정보가 없습니다.
            </p>
          ) : (
            <ul
              className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3"
              onKeyDown={handleRovingKeyDown}
            >
              {filteredPeople.map((person) => (
                <li
                  key={person.sub}
                  className="flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/90 px-3 py-2.5"
                >
                  <button
                    type="button"
                    data-kbd-item="true"
                    onClick={() => onSelectPerson(person)}
                    aria-label={`${person.name} (${person.dept}, ${person.online ? '접속 중' : '오프라인'}) 상세 보기`}
                    className="min-h-[44px] min-w-0 text-left flex-1 rounded px-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-bold text-white">
                        {person.name}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-semibold ${
                          person.online
                            ? 'border-emerald-400/50 bg-emerald-950/80 text-emerald-100'
                            : 'border-slate-600 bg-slate-800 text-slate-200'
                        }`}
                      >
                        {person.online ? (
                          <Wifi className="h-3 w-3 text-emerald-300 shrink-0" aria-hidden="true" />
                        ) : (
                          <WifiOff className="h-3 w-3 text-slate-300 shrink-0" aria-hidden="true" />
                        )}
                        <span>{person.online ? '접속 중' : '오프라인'}</span>
                      </span>
                    </div>
                    <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-300">
                      {person.isPartner ? (
                        <Briefcase className="h-3 w-3 text-amber-300 shrink-0" aria-hidden="true" />
                      ) : (
                        <Building2 className="h-3 w-3 text-sky-300 shrink-0" aria-hidden="true" />
                      )}
                      <span className="truncate">
                        {person.dept} · {person.isPartner ? '협력사' : '본사'}
                      </span>
                    </p>
                  </button>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <a
                      href={safeHref(buildTalkDmUrl(person.sub))}
                      onClick={handleLinkClick(`SGTALK 대화(${person.name})`)}
                      aria-label={`${person.name}와 SGTALK 1:1 대화`}
                      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-lg bg-sky-700 px-2.5 py-2 text-xs font-semibold text-white hover:bg-sky-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
                    >
                      <MessageSquare className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>대화</span>
                    </a>

                    <a
                      href={safeHref(SGW_PORTAL_LINKS.bmail)}
                      onClick={handleLinkClick(`bmail 메일(${person.name})`)}
                      aria-label={`${person.name}에게 bmail 열기`}
                      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-slate-700 bg-slate-800 p-2 text-indigo-200 hover:bg-slate-700 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
                    >
                      <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 4. Admin Shortcut (display-only hint; server enforces access) */}
        {!user.isPartner && (
          <section aria-labelledby="heading-sgw-admin-link">
            <h2 id="heading-sgw-admin-link" className="sr-only">
              SGW 관리자 바로가기
            </h2>
            <a
              href={safeHref(SGW_PORTAL_LINKS.admin)}
              onClick={handleLinkClick('SGW 관리자')}
              className="flex min-h-[52px] items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/95 px-4 py-3 hover:border-amber-500/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
            >
              <Shield className="h-5 w-5 text-amber-400 shrink-0" aria-hidden="true" />
              <div>
                <div className="text-sm font-semibold text-white">SGW 관리자</div>
                <div className="text-xs text-slate-300">직원·권한·감사 관리</div>
              </div>
            </a>
          </section>
        )}
      </div>
    </main>
  );
};
