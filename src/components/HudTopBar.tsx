import React from 'react';
import {
  Activity,
  Building2,
  Compass,
  ExternalLink,
  Eye,
  FolderKanban,
  Gauge,
  LogOut,
  Mail,
  MessageSquare,
  Moon,
  Radar,
  RefreshCw,
  Shield,
  Sun,
  WifiOff,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { SGW_PORTAL_LINKS, isSafeNavigationUrl } from '../deepLink';
import { formatDisconnectedBanner } from '../mapping';
import { PREVIEW_DEMO_BANNER_TEXT, type RuntimeEnv } from '../runtimeEnv';
import type { SgwUser } from '../sgwAdapter';
import type { CameraPreset, RenderMetrics } from '../scene/HarborScene';

export interface HudTopBarProps {
  user: SgwUser;
  runtimeEnv: RuntimeEnv;
  viewMode: '3d' | '2d';
  webglSupported: boolean;
  lowSpecMode: boolean;
  darkTheme: boolean;
  cameraPreset: CameraPreset;
  onlineCount: number;
  projectCount: number;
  syncDisconnected?: boolean;
  lastSyncedAtMs?: number | null;
  nowMs?: number;
  renderMetrics?: RenderMetrics | null;
  showDebugMetrics?: boolean;
  onRetrySync?: () => void;
  onToggleViewMode: (next: '3d' | '2d') => void;
  onToggleLowSpec: () => void;
  onToggleTheme: () => void;
  onCycleCamera: () => void;
  onZoom: (factor: number) => void;
  onLogout: () => void;
  onPreviewLinkBlocked: (featureLabel: string) => void;
}

const CAMERA_LABEL: Record<CameraPreset, string> = {
  harbor: '항구 뷰',
  overview: '전체 조망',
  quay: '안벽 근접',
};

export const HudTopBar: React.FC<HudTopBarProps> = ({
  user,
  runtimeEnv,
  viewMode,
  webglSupported,
  lowSpecMode,
  darkTheme,
  cameraPreset,
  onlineCount,
  projectCount,
  syncDisconnected = false,
  lastSyncedAtMs = null,
  nowMs,
  renderMetrics = null,
  showDebugMetrics = false,
  onRetrySync,
  onToggleViewMode,
  onToggleLowSpec,
  onToggleTheme,
  onCycleCamera,
  onZoom,
  onLogout,
  onPreviewLinkBlocked,
}) => {
  const isPreview = runtimeEnv === 'preview';
  const safeHref = (url: string) => (isSafeNavigationUrl(url) ? url : '/');
  const disconnectedText = syncDisconnected
    ? formatDisconnectedBanner(lastSyncedAtMs, nowMs ?? Date.now())
    : null;

  const handleLinkClick = (label: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (isPreview) {
      e.preventDefault();
      onPreviewLinkBlocked(label);
    }
  };

  return (
    <header
      className="fixed top-0 inset-x-0 z-30 border-b border-slate-700/80 bg-slate-950/96 text-slate-100"
      role="banner"
    >
      <div className="mx-auto flex items-center justify-between gap-1.5 px-2 py-1.5 sm:px-3">
        {/* Left: Brand + KPI + Desktop Badges */}
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-700 text-white shadow-sm">
              <Compass className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="leading-tight">
              <span className="font-display text-xs sm:text-sm font-bold tracking-tight text-white">
                메타SGW
              </span>
              <p
                className="text-[10px] text-slate-300 whitespace-nowrap"
                data-testid="hud-kpi-counts"
              >
                내 프로젝트 {projectCount} · 접속 동료 {onlineCount}
              </p>
            </div>
          </div>

          {isPreview && (
            <span
              data-testid="preview-demo-badge"
              role="status"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-md border border-amber-400/60 bg-amber-950/85 px-2 py-0.5 text-[11px] font-bold text-amber-100 whitespace-nowrap"
            >
              {PREVIEW_DEMO_BANNER_TEXT}
            </span>
          )}

          {disconnectedText && (
            <span
              data-testid="connection-lost-badge"
              role="alert"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-md border border-rose-400/70 bg-rose-950/90 px-2 py-0.5 text-[11px] font-bold text-rose-100 whitespace-nowrap"
            >
              <WifiOff className="h-3 w-3 text-rose-300 shrink-0" aria-hidden="true" />
              <span>{disconnectedText}</span>
              {onRetrySync && (
                <button
                  type="button"
                  onClick={onRetrySync}
                  aria-label="서버 연결 다시 시도"
                  className="ml-1 rounded bg-rose-800 px-1.5 py-0.5 text-[10px] font-semibold text-white hover:bg-rose-700 focus-visible:outline-2 focus-visible:outline-sky-400"
                >
                  재시도
                </button>
              )}
            </span>
          )}

          {/* Dev-only renderer.info performance telemetry */}
          {showDebugMetrics && renderMetrics && viewMode === '3d' && (
            <span
              data-testid="hud-debug-metrics"
              className="hidden md:inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-200 whitespace-nowrap tabular-nums"
              title={`Draw Calls: ${renderMetrics.drawCalls} / Triangles: ${renderMetrics.triangles} / Geometries: ${renderMetrics.geometries} / Textures: ${renderMetrics.textures}`}
            >
              <Activity className="h-3 w-3 text-sky-400 shrink-0" aria-hidden="true" />
              <span>
                DC {renderMetrics.drawCalls} · {renderMetrics.fps}fps
              </span>
            </span>
          )}

          <div className="hidden xl:flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-900 px-2 py-1 text-[11px] whitespace-nowrap">
            <span className="font-semibold text-white">{user.name}</span>
            <span className="text-slate-300">{user.dept}</span>
            <span
              className={`rounded px-1 py-0.5 text-[10px] font-semibold ${
                user.isPartner
                  ? 'bg-amber-950 text-amber-100 border border-amber-400/50'
                  : 'bg-sky-950 text-sky-100 border border-sky-400/50'
              }`}
            >
              {user.isPartner ? '협력사' : '본사'}
            </span>
          </div>
        </div>

        {/* Center: SGW Direct Links (wide desktop) */}
        <nav aria-label="SGW 업무 바로가기" className="hidden 2xl:flex items-center gap-0.5">
          <a
            href={safeHref(SGW_PORTAL_LINKS.talkHome)}
            onClick={handleLinkClick('SGTALK · 비서')}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800 hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400 whitespace-nowrap"
          >
            <MessageSquare className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
            SGTALK
          </a>
          <a
            href={safeHref(SGW_PORTAL_LINKS.sedmsProjects)}
            onClick={handleLinkClick('SEDMS')}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800 hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400 whitespace-nowrap"
          >
            <FolderKanban className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
            SEDMS
            <ExternalLink className="h-3 w-3 text-slate-400" aria-hidden="true" />
          </a>
          <a
            href={safeHref(SGW_PORTAL_LINKS.nas)}
            onClick={handleLinkClick('SGW NAS')}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800 hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400 whitespace-nowrap"
          >
            <Building2 className="h-3.5 w-3.5 text-teal-400" aria-hidden="true" />
            NAS
          </a>
          <a
            href={safeHref(SGW_PORTAL_LINKS.bmail)}
            onClick={handleLinkClick('bmail')}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800 hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400 whitespace-nowrap"
          >
            <Mail className="h-3.5 w-3.5 text-indigo-400" aria-hidden="true" />
            bmail
          </a>
          {/* 표시용 분기 — 실제 접근 제어는 SGW 서버 응답(401/403)이 판정 */}
          {!user.isPartner && (
            <a
              href={safeHref(SGW_PORTAL_LINKS.admin)}
              onClick={handleLinkClick('SGW 관리자')}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800 hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400 whitespace-nowrap"
            >
              <Shield className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
              관리자
            </a>
          )}
        </nav>

        {/* Right: Hybrid Toggle [3D 맵 | 빠른 레이더], Low-Spec, Camera, Theme, Logout */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          <div
            className="inline-flex rounded-lg border border-slate-700 bg-slate-900 p-0.5"
            role="group"
            aria-label="화면 표시 모드 (3D 맵 또는 빠른 레이더)"
          >
            <button
              type="button"
              disabled={!webglSupported}
              data-testid="mode-toggle-3d"
              aria-label="3D 맵 모드로 전환"
              aria-pressed={viewMode === '3d'}
              onClick={() => onToggleViewMode('3d')}
              className={`inline-flex min-h-[32px] items-center gap-1 rounded-md px-2 py-1 text-[11px] sm:text-xs font-semibold transition whitespace-nowrap focus-visible:outline-2 focus-visible:outline-sky-400 ${
                viewMode === '3d'
                  ? 'bg-sky-700 text-white'
                  : 'text-slate-200 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed'
              }`}
              title={webglSupported ? '3D 맵' : 'WebGL 미지원 환경에서는 빠른 레이더 모드만 사용할 수 있습니다'}
            >
              <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>3D 맵</span>
            </button>
            <button
              type="button"
              data-testid="mode-toggle-radar"
              aria-label="빠른 레이더 모드로 전환"
              aria-pressed={viewMode === '2d'}
              onClick={() => onToggleViewMode('2d')}
              className={`inline-flex min-h-[32px] items-center gap-1 rounded-md px-2 py-1 text-[11px] sm:text-xs font-semibold transition whitespace-nowrap focus-visible:outline-2 focus-visible:outline-sky-400 ${
                viewMode === '2d'
                  ? 'bg-sky-700 text-white'
                  : 'text-slate-200 hover:text-white'
              }`}
            >
              <Radar className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>빠른 레이더</span>
            </button>
          </div>

          {viewMode === '3d' && (
            <>
              <button
                type="button"
                onClick={onToggleLowSpec}
                aria-label={lowSpecMode ? '저사양 모드 끄기' : '저사양 모드 켜기'}
                aria-pressed={lowSpecMode}
                className={`hidden sm:inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-sky-400 ${
                  lowSpecMode
                    ? 'border-emerald-400/60 bg-emerald-950/70 text-emerald-100'
                    : 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
                }`}
                title="저사양 모드: 단순 재질·그림자·물결 셰이더 비활성화"
              >
                <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden lg:inline">{lowSpecMode ? '저사양 ON' : '저사양'}</span>
              </button>

              <button
                type="button"
                onClick={onCycleCamera}
                aria-label={`카메라 시점 전환 (현재 ${CAMERA_LABEL[cameraPreset]})`}
                className="hidden md:inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-sky-400 whitespace-nowrap"
                title="카메라 시점 전환"
              >
                {CAMERA_LABEL[cameraPreset]}
              </button>

              <div className="hidden lg:inline-flex items-center rounded-lg border border-slate-700 bg-slate-900">
                <button
                  type="button"
                  onClick={() => onZoom(0.85)}
                  aria-label="화면 확대"
                  className="p-1.5 text-slate-200 hover:bg-slate-800 rounded-l-lg focus-visible:outline-2 focus-visible:outline-sky-400"
                >
                  <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => onZoom(1.18)}
                  aria-label="화면 축소"
                  className="p-1.5 text-slate-200 hover:bg-slate-800 rounded-r-lg border-l border-slate-700 focus-visible:outline-2 focus-visible:outline-sky-400"
                >
                  <ZoomOut className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </>
          )}

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={darkTheme ? '주간 테마로 전환' : '야간 테마로 전환'}
            className="hidden sm:inline-flex rounded-lg border border-slate-700 bg-slate-900 p-1.5 text-slate-200 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-sky-400"
          >
            {darkTheme ? (
              <Sun className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
            ) : (
              <Moon className="h-3.5 w-3.5 text-sky-300" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            onClick={onLogout}
            aria-label="SGW 로그아웃"
            className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs font-medium text-slate-200 hover:bg-rose-950/70 hover:border-rose-500/60 hover:text-rose-100 focus-visible:outline-2 focus-visible:outline-sky-400"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">로그아웃</span>
          </button>
        </div>
      </div>

      {/* Mobile (< sm) slim status strip so badges never wrap-break 375px header controls */}
      {(isPreview || disconnectedText) && (
        <div className="flex sm:hidden flex-wrap items-center justify-between gap-1.5 border-t border-slate-800/90 bg-slate-950 px-2.5 py-1 text-[11px]">
          {isPreview && (
            <span className="inline-flex items-center gap-1 font-bold text-amber-200">
              {PREVIEW_DEMO_BANNER_TEXT}
            </span>
          )}
          {disconnectedText && (
            <span className="inline-flex items-center gap-1 font-bold text-rose-200" role="alert">
              <WifiOff className="h-3 w-3 text-rose-300 shrink-0" aria-hidden="true" />
              {disconnectedText}
              {onRetrySync && (
                <button
                  type="button"
                  onClick={onRetrySync}
                  aria-label="모바일 서버 연결 다시 시도"
                  className="ml-1 inline-flex items-center gap-0.5 rounded bg-rose-800 px-1.5 py-0.5 text-[10px] text-white"
                >
                  <RefreshCw className="h-2.5 w-2.5" aria-hidden="true" />
                  재시도
                </button>
              )}
            </span>
          )}
        </div>
      )}
    </header>
  );
};
