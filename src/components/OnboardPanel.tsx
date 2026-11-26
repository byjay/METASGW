import React from 'react';
import {
  Anchor,
  Building2,
  ExternalLink,
  Flag,
  Lightbulb,
  LogOut,
  MessageSquare,
  Ship,
  X,
} from 'lucide-react';
import {
  buildSedmsProjectUrl,
  buildTalkRoomUrl,
  isSafeNavigationUrl,
  SGW_PORTAL_LINKS,
} from '../deepLink';
import type { HarborShip } from '../mapping';
import type { RuntimeEnv } from '../runtimeEnv';

export interface OnboardPanelProps {
  ship: HarborShip | null;
  phase: 'harbor' | 'boarding' | 'onboard';
  runtimeEnv: RuntimeEnv;
  onPreviewLinkBlocked: (featureLabel: string) => void;
  onDisembark: () => void;
}

const STATUS_CHIP_CLASS: Record<HarborShip['statusTone'], string> = {
  active: 'border-sky-400/60 bg-sky-950/80 text-sky-200',
  review: 'border-amber-400/60 bg-amber-950/80 text-amber-200',
  hold: 'border-rose-400/60 bg-rose-950/80 text-rose-200',
  completed: 'border-emerald-400/60 bg-emerald-950/80 text-emerald-200',
  neutral: 'border-slate-500/60 bg-slate-800 text-slate-200',
};

export const OnboardPanel: React.FC<OnboardPanelProps> = ({
  ship,
  phase,
  runtimeEnv,
  onPreviewLinkBlocked,
  onDisembark,
}) => {
  if (!ship || phase === 'harbor') return null;

  const isPreview = runtimeEnv === 'preview';

  let sedmsHref = '/api/sedms-sso?return=%2Fprojects';
  try {
    sedmsHref = buildSedmsProjectUrl(ship.id);
  } catch {
    sedmsHref = '/api/sedms-sso?return=%2Fprojects';
  }
  const safeSedmsHref = isSafeNavigationUrl(sedmsHref) ? sedmsHref : '/';
  const rawChatHref = buildTalkRoomUrl(ship.id);
  const safeChatHref = isSafeNavigationUrl(rawChatHref) ? rawChatHref : SGW_PORTAL_LINKS.talkHome;
  const safeNasHref = isSafeNavigationUrl(SGW_PORTAL_LINKS.nas) ? SGW_PORTAL_LINKS.nas : '/';

  if (phase === 'boarding') {
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="boarding-transition-banner"
        className="fixed inset-x-0 bottom-24 z-40 flex justify-center px-3 pointer-events-none"
      >
        <div className="inline-flex items-center gap-2.5 rounded-xl border border-sky-400/60 bg-slate-950/95 px-4 py-2.5 text-sm font-semibold text-white shadow-2xl">
          <Anchor className="h-4 w-4 text-sky-400" aria-hidden="true" />
          <span>{ship.name} ({ship.code}) 승선 중...</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/60 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboard-panel-title"
      data-testid="onboard-panel"
      onClick={onDisembark}
    >
      <div
        className="w-full max-w-md max-h-[calc(100vh-5.5rem)] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-4 sm:p-5 text-slate-100 shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-sky-400/40 bg-sky-950/80 text-sky-300"
            >
              <Ship className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-xs text-slate-300">
                  {ship.berthLabel} · {ship.code}
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-semibold ${STATUS_CHIP_CLASS[ship.statusTone]}`}
                >
                  <Flag className="h-3 w-3" aria-hidden="true" />
                  {ship.appearance.statusLabelKo}
                </span>
              </div>
              <h2
                id="onboard-panel-title"
                className="truncate text-base font-bold text-white"
              >
                {ship.name}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onDisembark}
            aria-label="선상 패널 닫고 하선"
            className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Metadata Grid */}
        <dl className="grid grid-cols-2 gap-2.5 rounded-xl border border-slate-800 bg-slate-950/85 p-3.5 text-xs">
          <div>
            <dt className="text-slate-400">내 역할</dt>
            <dd className="mt-0.5 font-semibold text-white">{ship.role}</dd>
          </div>
          <div>
            <dt className="text-slate-400">상태</dt>
            <dd className="mt-0.5 flex items-center gap-1.5 font-semibold text-white">
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: ship.appearance.flagHex }}
                aria-hidden="true"
              />
              <span>
                {ship.status} ({ship.appearance.statusLabelKo})
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">최근 갱신 시각</dt>
            <dd className="mt-0.5 font-mono text-slate-200">{ship.updatedAt}</dd>
          </div>
          <div>
            <dt className="text-slate-400">갑판 불빛 (7일 기준)</dt>
            <dd className="mt-0.5 inline-flex items-center gap-1 font-semibold">
              <Lightbulb
                className={`h-3.5 w-3.5 ${
                  ship.appearance.hasDeckLights ? 'text-amber-300' : 'text-slate-500'
                }`}
                aria-hidden="true"
              />
              <span className={ship.appearance.hasDeckLights ? 'text-amber-200' : 'text-slate-400'}>
                {ship.appearance.hasDeckLights ? '점등 (최근 활동)' : '소등 (7일 경과)'}
              </span>
            </dd>
          </div>
        </dl>

        <p className="text-xs leading-relaxed text-slate-300">
          {isPreview
            ? '미리보기 데모 선상 패널입니다. 실제 SEDMS 프로젝트·팀 채팅·NAS 폴더 이동은 SGW 운영 환경에서만 동작합니다.'
            : '도면·배포·결재는 SEDMS에서, 프로젝트 소통과 공유 문서는 SGTALK 팀 채팅 및 SGW NAS에서 이어서 처리합니다.'}
        </p>

        {/* Primary CTA: SEDMS 에서 열기 */}
        <a
          href={safeSedmsHref}
          onClick={(e) => {
            if (isPreview) {
              e.preventDefault();
              onPreviewLinkBlocked(`SEDMS 프로젝트(${ship.code}) 열기`);
            }
          }}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
        >
          SEDMS 에서 열기
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </a>

        {/* Secondary Actions: 팀 채팅 / NAS 폴더 / 하선 */}
        <div className="grid grid-cols-3 gap-2">
          <a
            href={safeChatHref}
            onClick={(e) => {
              if (isPreview) {
                e.preventDefault();
                onPreviewLinkBlocked(`팀 채팅(${ship.code})`);
              }
            }}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-2.5 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-sky-400"
          >
            <MessageSquare className="h-3.5 w-3.5 text-sky-400 shrink-0" aria-hidden="true" />
            <span>팀 채팅</span>
          </a>

          <a
            href={safeNasHref}
            onClick={(e) => {
              if (isPreview) {
                e.preventDefault();
                onPreviewLinkBlocked(`NAS 폴더(${ship.code})`);
              }
            }}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-2.5 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-sky-400"
          >
            <Building2 className="h-3.5 w-3.5 text-teal-400 shrink-0" aria-hidden="true" />
            <span>NAS 폴더</span>
          </a>

          <button
            type="button"
            onClick={onDisembark}
            aria-label={`${ship.name}에서 하선하기`}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-500/50 bg-rose-950/60 px-2.5 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-900/70 focus-visible:outline-2 focus-visible:outline-sky-400"
          >
            <LogOut className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>하선</span>
          </button>
        </div>
      </div>
    </div>
  );
};
