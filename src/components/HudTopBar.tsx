import React from 'react';
import {
  Building2,
  Compass,
  ExternalLink,
  Eye,
  FolderKanban,
  Gauge,
  LayoutList,
  LogOut,
  Mail,
  MessageSquare,
  Moon,
  Shield,
  Sun,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { SGW_PORTAL_LINKS, isSafeNavigationUrl } from '../deepLink';
import { PREVIEW_DEMO_BANNER_TEXT, type RuntimeEnv } from '../runtimeEnv';
import type { SgwUser } from '../sgwAdapter';
import type { CameraPreset } from '../scene/HarborScene';

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

  const handleLinkClick = (label: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (isPreview) {
      e.preventDefault();
      onPreviewLinkBlocked(label);
    }
  };

  return (
    <header
      className="fixed top-0 inset-x-0 z-30 border-b border-slate-700/70 bg-slate-950/92 text-slate-100 backdrop-blur-md"
      role="banner"
    >
      <div className="mx-auto flex flex-wrap items-center justify-between gap-1.5 px-3 py-1.5">
        {/* Left: Brand + Preview Demo Badge + User Badge */}
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <div className="flex items-center gap-1.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-600 text-white shadow-sm">
              <Compass className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="leading-tight">
              <span className="font-display text-sm font-bold tracking-tight text-white">
                메타SGW
              </span>
              <p className="text-[10px] text-slate-300">
                선박 {projectCount} · 접속 {onlineCount}
              </p>
            </div>
          </div>

          {isPreview && (
            <span
              data-testid="preview-demo-badge"
              role="status"
              className="inline-flex items-center gap-1.5 rounded-md border border-amber-400/60 bg-amber-500/20 px-2 py-0.5 text-[11px] font-bold text-amber-200 whitespace-nowrap"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden="true" />
              {PREVIEW_DEMO_BANNER_TEXT}
            </span>
          )}

          <div className="hidden md:flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-900/90 px-2 py-1 text-[11px] whitespace-nowrap">
            <span
              className={`h-2 w-2 rounded-full ${user.isPartner ? 'bg-amber-400' : 'bg-sky-400'}`}
              aria-hidden="true"
            />
            <span className="font-semibold text-white">{user.name}</span>
            <span className="text-slate-300">{user.dept}</span>
            <span
              className={`rounded px-1 py-0.5 text-[10px] font-semibold ${
                user.isPartner
                  ? 'bg-amber-500/20 text-amber-200 border border-amber-400/40'
                  : 'bg-sky-500/20 text-sky-200 border border-sky-400/40'
              }`}
            >
              {user.isPartner ? '협력사' : '본사'}
            </span>
          </div>
        </div>

        {/* Center: SGW Direct Links */}
        <nav aria-label="SGW 업무 바로가기" className="hidden xl:flex items-center gap-0.5">
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

        {/* Right: 3D/2D Switch, Low-Spec, Camera, Theme, Logout */}
        <div className="flex items-center gap-1.5">
          {/* 3D / 2D Mode Toggle */}
          <div
            className="inline-flex rounded-lg border border-slate-700 bg-slate-900 p-0.5"
            role="group"
            aria-label="화면 표시 모드"
          >
            <button
              type="button"
              disabled={!webglSupported}
              onClick={() => onToggleViewMode('3d')}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                viewMode === '3d'
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed'
              }`}
              title={webglSupported ? '3D 항구 모드' : 'WebGL 미지원 환경에서는 2D 목록 모드만 사용할 수 있습니다'}
            >
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              3D 항구
            </button>
            <button
              type="button"
              onClick={() => onToggleViewMode('2d')}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                viewMode === '2d'
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <LayoutList className="h-3.5 w-3.5" aria-hidden="true" />
              2D 목록
            </button>
          </div>

          {viewMode === '3d' && (
            <>
              <button
                type="button"
                onClick={onToggleLowSpec}
                aria-pressed={lowSpecMode}
                className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                  lowSpecMode
                    ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-200'
                    : 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
                }`}
                title="저사양 모드: 그림자·물결 셰이더·애니메이션 비활성화"
              >
                <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">{lowSpecMode ? '저사양 ON' : '저사양'}</span>
              </button>

              <button
                type="button"
                onClick={onCycleCamera}
                className="hidden md:inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
                title="카메라 시점 전환"
              >
                {CAMERA_LABEL[cameraPreset]}
              </button>

              <div className="hidden md:inline-flex items-center rounded-lg border border-slate-700 bg-slate-900">
                <button
                  type="button"
                  onClick={() => onZoom(0.85)}
                  aria-label="화면 확대"
                  className="p-1.5 text-slate-200 hover:bg-slate-800 rounded-l-lg"
                >
                  <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => onZoom(1.18)}
                  aria-label="화면 축소"
                  className="p-1.5 text-slate-200 hover:bg-slate-800 rounded-r-lg border-l border-slate-700"
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
            className="rounded-lg border border-slate-700 bg-slate-900 p-1.5 text-slate-200 hover:bg-slate-800"
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
            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-rose-950/70 hover:border-rose-500/60 hover:text-rose-100"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">로그아웃</span>
          </button>
        </div>
      </div>
    </header>
  );
};
