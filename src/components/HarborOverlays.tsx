import React, { useState } from 'react';
import {
  AlertTriangle,
  Compass,
  ExternalLink,
  LogIn,
  MapPin,
  MessageSquare,
  Ship,
  UserCheck,
  X,
} from 'lucide-react';
import {
  buildSedmsProjectUrl,
  buildTalkDmUrl,
  isSafeNavigationUrl,
  SGW_LOGIN_REDIRECT_URL,
} from '../deepLink';
import type { HarborPerson, HarborShip } from '../mapping';
import type { RuntimeEnv } from '../runtimeEnv';

export interface AuthGateOverlayProps {
  status: 'loading' | 'unauthenticated' | 'forbidden' | 'not_found' | 'error';
  message: string;
  onRetry: () => void;
}

export const AuthGateOverlay: React.FC<AuthGateOverlayProps> = ({
  status,
  message,
  onRetry,
}) => {
  const loginHref = isSafeNavigationUrl(SGW_LOGIN_REDIRECT_URL) ? SGW_LOGIN_REDIRECT_URL : '/';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950 px-4 text-slate-100"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-gate-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-600 text-white">
            {status === 'forbidden' || status === 'not_found' || status === 'error' ? (
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Compass className="h-5 w-5" aria-hidden="true" />
            )}
          </div>
          <div>
            <h1 id="auth-gate-title" className="text-lg font-bold text-white">
              {status === 'loading' && 'SGW 세션 확인 중'}
              {status === 'unauthenticated' && 'SGW 로그인 이동 중'}
              {status === 'forbidden' && '권한 없음'}
              {status === 'not_found' && '없거나 권한 없음'}
              {status === 'error' && '연결 오류'}
            </h1>
            <p className="text-xs text-slate-300">메타SGW · SGW · SEDMS 항구 상황판</p>
          </div>
        </div>

        <p className="text-sm leading-relaxed text-slate-200">{message}</p>

        {status === 'unauthenticated' && (
          <div className="flex flex-col gap-2">
            <a
              href={loginHref}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-500"
            >
              <LogIn className="h-4 w-4" aria-hidden="true" />
              SGW 로그인 화면으로 이동
            </a>
          </div>
        )}

        {(status === 'forbidden' || status === 'not_found' || status === 'error') && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onRetry}
              className="flex-1 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
            >
              다시 확인
            </button>
            <a
              href={loginHref}
              className="flex-1 inline-flex items-center justify-center rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500"
            >
              SGW 홈으로
            </a>
          </div>
        )}
      </div>
    </div>
  );
};

export interface ShipBriefingModalProps {
  ship: HarborShip | null;
  runtimeEnv: RuntimeEnv;
  onPreviewLinkBlocked: (featureLabel: string) => void;
  onClose: () => void;
}

export const ShipBriefingModal: React.FC<ShipBriefingModalProps> = ({
  ship,
  runtimeEnv,
  onPreviewLinkBlocked,
  onClose,
}) => {
  const [newTab, setNewTab] = useState(false);

  if (!ship) return null;

  let ssoUrl = '/api/sedms-sso?return=%2Fprojects';
  try {
    ssoUrl = buildSedmsProjectUrl(ship.id);
  } catch {
    ssoUrl = '/api/sedms-sso?return=%2Fprojects';
  }
  const safeHref = isSafeNavigationUrl(ssoUrl) ? ssoUrl : '/';
  const isPreview = runtimeEnv === 'preview';

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/75 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ship-briefing-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 text-slate-100 shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-600/20 text-sky-300 border border-sky-500/40">
              <Ship className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="font-mono text-xs text-slate-300">
                {ship.berthLabel} · {ship.code}
              </p>
              <h2 id="ship-briefing-title" className="truncate text-base font-bold text-white">
                {ship.name}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <dl className="grid grid-cols-2 gap-2.5 rounded-xl border border-slate-800 bg-slate-950/80 p-3.5 text-xs">
          <div>
            <dt className="text-slate-400">프로젝트 ID</dt>
            <dd className="mt-0.5 font-mono font-semibold text-white">{ship.id}</dd>
          </div>
          <div>
            <dt className="text-slate-400">상태</dt>
            <dd className="mt-0.5 font-semibold text-sky-300">{ship.status}</dd>
          </div>
          <div>
            <dt className="text-slate-400">내 권한</dt>
            <dd className="mt-0.5 font-semibold text-white">{ship.role}</dd>
          </div>
          <div>
            <dt className="text-slate-400">최근 갱신</dt>
            <dd className="mt-0.5 font-mono text-slate-200">{ship.updatedAt}</dd>
          </div>
        </dl>

        <p className="text-xs leading-relaxed text-slate-300">
          {isPreview
            ? '미리보기 데모 선박입니다. 실제 SEDMS 프로젝트 입장 및 도면·배포·결재 화면 이동은 SGW 운영 환경에서만 동작합니다.'
            : '도면 조회·배포·결재 등 업무 기능은 SEDMS에서 직접 처리합니다. 접근 권한이 없는 프로젝트는 SEDMS에서 “없거나 권한 없음”으로 안내됩니다.'}
        </p>

        {!isPreview && (
          <label className="inline-flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={newTab}
              onChange={(e) => setNewTab(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-800 accent-sky-500"
            />
            새 창으로 SEDMS 열기
          </label>
        )}

        <div className="flex items-center gap-2 pt-1">
          <a
            href={safeHref}
            target={!isPreview && newTab ? '_blank' : undefined}
            rel={!isPreview && newTab ? 'noopener noreferrer' : undefined}
            onClick={(e) => {
              if (isPreview) {
                e.preventDefault();
                onPreviewLinkBlocked(`SEDMS 프로젝트(${ship.code}) 입장`);
              }
            }}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-500"
          >
            SEDMS 프로젝트 열기
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-700"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};

export interface PersonActionModalProps {
  person: HarborPerson | null;
  runtimeEnv: RuntimeEnv;
  canFocus3D: boolean;
  onFocus3D: (sub: string) => void;
  onPreviewLinkBlocked: (featureLabel: string) => void;
  onClose: () => void;
}

export const PersonActionModal: React.FC<PersonActionModalProps> = ({
  person,
  runtimeEnv,
  canFocus3D,
  onFocus3D,
  onPreviewLinkBlocked,
  onClose,
}) => {
  if (!person) return null;

  const dmHref = buildTalkDmUrl(person.sub);
  const safeHref = isSafeNavigationUrl(dmHref) ? dmHref : '/talk/';
  const isPreview = runtimeEnv === 'preview';

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/75 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="person-action-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-5 text-slate-100 shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600/20 text-emerald-300 border border-emerald-500/40">
              <UserCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="person-action-title" className="text-base font-bold text-white">
                  {person.name}
                </h2>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                    person.online
                      ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40'
                      : 'bg-slate-700/70 text-slate-300 border border-slate-600'
                  }`}
                >
                  {person.online ? '접속 중' : '오프라인'}
                </span>
              </div>
              <p className="text-xs text-slate-300">
                {person.dept} · {person.title}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <a
            href={safeHref}
            onClick={(e) => {
              if (isPreview) {
                e.preventDefault();
                onPreviewLinkBlocked(`SGTALK 1:1 대화(${person.name})`);
              }
            }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-500"
          >
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
            SGTALK 1:1 대화하기
          </a>

          {canFocus3D && !person.isCurrentUser && (
            <button
              type="button"
              onClick={() => {
                onFocus3D(person.sub);
                onClose();
              }}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-700"
            >
              <MapPin className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
              3D 항구에서 위치 찾아가기
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
