import React, { useState } from 'react';
import {
  Anchor,
  Check,
  Copy,
  FileBarChart2,
  Info,
  Radio,
  Shield,
  X,
} from 'lucide-react';
import type { MetaRegistryResponse } from '../meta/hubTypes';
import type { RuntimeEnv } from '../runtimeEnv';
import { ShipKeyItemsTab } from './ShipKeyItemsTab';

export interface PreviewBridgeTarget {
  featureLabel: string;
  targetUrl?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  moduleId?: string | null;
  kind?: 'sedms' | 'hub' | 'talk' | 'nas' | 'bmail' | 'admin' | 'general';
}

export interface SgwBridgePreviewModalProps {
  target: PreviewBridgeTarget | null;
  runtimeEnv: RuntimeEnv;
  hubRegistry?: MetaRegistryResponse | null;
  onBoardShip?: (shipId: string) => void;
  onOpenReport?: (shipId: string) => void;
  onOpenAdminTab?: (tab: 'ships' | 'assets' | 'verify') => void;
  onHighlightShip?: (shipId: string) => void;
  onToast?: (message: string) => void;
  onClose: () => void;
}

export const SgwBridgePreviewModal: React.FC<SgwBridgePreviewModalProps> = ({
  target,
  runtimeEnv,
  hubRegistry = null,
  onBoardShip,
  onOpenReport,
  onOpenAdminTab,
  onHighlightShip,
  onToast,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);

  if (!target) return null;

  const targetUrl = target.targetUrl || null;

  const handleCopyPath = async () => {
    if (!targetUrl) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(targetUrl);
        setCopied(true);
        onToast?.(`SGW 경로를 복사했습니다: ${targetUrl}`);
        window.setTimeout(() => setCopied(false), 1800);
      }
    } catch {
      onToast?.('브라우저 보안 정책으로 자동 복사에 실패했습니다.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sgw-bridge-modal-title"
      data-testid="sgw-bridge-preview-modal"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[calc(100vh-3rem)] overflow-y-auto rounded-2xl border border-sky-500/50 bg-slate-950 p-4 sm:p-5 text-slate-100 shadow-2xl space-y-3.5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-sky-400/50 bg-sky-950 text-sky-300">
                <Info className="h-4 w-4" aria-hidden="true" />
              </span>
              <h2
                id="sgw-bridge-modal-title"
                className="truncate text-sm sm:text-base font-bold text-white"
              >
                {target.featureLabel} — 미리보기 연동 안내
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-300">
              현재 미리보기 환경에서는 외부 SGW 서버 이동 대신 인앱 미리보기와 경로 검증을 제공합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="SGW 미리보기 안내 닫기"
            className="inline-flex min-h-[32px] min-w-[32px] shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 p-1.5 text-slate-200 hover:bg-slate-800 hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* How SGW works vs Preview */}
        <div className="rounded-xl border border-amber-400/40 bg-amber-950/35 p-3 text-xs leading-relaxed text-amber-100 space-y-1.5">
          <p className="font-bold text-amber-200">
            SGW 운영 환경에서는 별도 설정 없이 바로 연결됩니다
          </p>
          <p className="text-slate-200">
            본 앱을 SGW 도메인의 <code className="rounded bg-slate-900 px-1 py-0.5 font-mono text-[11px] text-sky-200">/meta/</code> 경로로 배포하면,
            브라우저의 동일 오리진 SGW 세션 쿠키(<code className="rounded bg-slate-900 px-1 py-0.5 font-mono text-[11px] text-sky-200">credentials: same-origin</code>)로
            자동 인증되어 아래 대상 경로로 즉시 이동합니다.
          </p>
          {targetUrl && (
            <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-slate-700 bg-slate-950/90 px-2.5 py-1.5">
              <code
                data-testid="sgw-bridge-target-url"
                className="min-w-0 truncate font-mono text-[11px] text-sky-300"
              >
                {targetUrl}
              </code>
              <button
                type="button"
                onClick={() => {
                  void handleCopyPath();
                }}
                aria-label="대상 SGW 경로 복사"
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] font-semibold text-slate-100 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-sky-400"
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-400" aria-hidden="true" />
                    <span>복사됨</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3 text-slate-300" aria-hidden="true" />
                    <span>경로 복사</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Live In-App Preview of Project Items when a project context exists */}
        {target.projectId && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/75 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-white">
                인앱 프로젝트 핵심 항목 미리보기
                {target.projectName ? ` · ${target.projectName}` : ''}
              </p>
              <span className="rounded border border-sky-500/40 bg-sky-950/70 px-1.5 py-0.5 text-[10px] font-semibold text-sky-200">
                실시간 DTO 구조
              </span>
            </div>
            <ShipKeyItemsTab
              compact
              projectId={target.projectId}
              runtimeEnv={runtimeEnv}
              registry={hubRegistry}
              onHighlightShip={onHighlightShip}
              onPreviewLinkBlocked={(label) =>
                onToast?.(`미리보기 안내: ${label} (SGW 배포 시 동일 오리진 자동 이동)`)
              }
              onToast={onToast}
            />
          </div>
        )}

        {/* Actionable Alternatives inside Preview */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {target.projectId && onBoardShip && (
            <button
              type="button"
              data-testid="sgw-bridge-board-btn"
              onClick={() => {
                const pid = target.projectId;
                onClose();
                if (pid) onBoardShip(pid);
              }}
              aria-label="프로젝트 선박 승선 패널 열기"
              className="inline-flex min-h-[36px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-sky-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-600 focus-visible:outline-2 focus-visible:outline-sky-400"
            >
              <Anchor className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>선상 패널 승선</span>
            </button>
          )}
          {target.projectId && onOpenReport && (
            <button
              type="button"
              data-testid="sgw-bridge-report-btn"
              onClick={() => {
                const pid = target.projectId;
                onClose();
                if (pid) onOpenReport(pid);
              }}
              aria-label="프로젝트 통합 리포트 열기"
              className="inline-flex min-h-[36px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-sky-500/60 bg-sky-950/80 px-3 py-1.5 text-xs font-bold text-sky-100 hover:bg-sky-900 focus-visible:outline-2 focus-visible:outline-sky-400"
            >
              <FileBarChart2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>통합 리포트</span>
            </button>
          )}
          {onOpenAdminTab && (
            <button
              type="button"
              data-testid="sgw-bridge-verify-btn"
              onClick={() => {
                onClose();
                onOpenAdminTab('verify');
              }}
              aria-label="SGW API 연동 검증 실행 열기"
              className="inline-flex min-h-[36px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-emerald-500/60 bg-emerald-950/75 px-3 py-1.5 text-xs font-bold text-emerald-100 hover:bg-emerald-900 focus-visible:outline-2 focus-visible:outline-sky-400"
            >
              <Radio className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>SGW API 검증</span>
            </button>
          )}
          {target.kind === 'admin' && onOpenAdminTab && (
            <button
              type="button"
              data-testid="sgw-bridge-admin-btn"
              onClick={() => {
                onClose();
                onOpenAdminTab('ships');
              }}
              aria-label="인앱 항구 관리자 메뉴 열기"
              className="inline-flex min-h-[36px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-500 focus-visible:outline-2 focus-visible:outline-sky-400"
            >
              <Shield className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>항구 관리자 메뉴</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
