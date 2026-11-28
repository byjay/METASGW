import React, { useMemo, useState } from 'react';
import { CalendarOff, Clock, MapPin, MessageSquare, Search, Users, Wifi, WifiOff, X } from 'lucide-react';
import { buildTalkDmUrl, isSafeNavigationUrl } from '../deepLink';
import type { HarborPerson } from '../mapping';
import type { RuntimeEnv } from '../runtimeEnv';

export interface PeopleFinderDrawerProps {
  open: boolean;
  runtimeEnv: RuntimeEnv;
  people: HarborPerson[];
  visibleQuaySubs?: ReadonlySet<string>;
  overflowCount?: number;
  onClose: () => void;
  onFocusPerson: (sub: string) => void;
  onSelectPerson: (person: HarborPerson) => void;
  onPreviewLinkBlocked: (featureLabel: string) => void;
}

export const DEFAULT_DESKTOP_HUD_HEIGHT_PX = 96;
export const DEFAULT_MOBILE_HUD_HEIGHT_PX = 124;
export const PEOPLE_DRAWER_HUD_GAP_PX = 8;

/**
 * Computes the guaranteed safe top offset (px) for `PeopleFinderDrawer` so its title ("사람 찾기")
 * and close button (`×`) always sit cleanly below `HudTopBar` + `HudHubStatusStrip`.
 */
export function computePeopleDrawerTopPx(
  hudHeightPx: number | null | undefined,
  viewportWidth: number,
): number {
  const fallbackHud =
    viewportWidth < 640 ? DEFAULT_MOBILE_HUD_HEIGHT_PX : DEFAULT_DESKTOP_HUD_HEIGHT_PX;
  const measuredHud =
    typeof hudHeightPx === 'number' && Number.isFinite(hudHeightPx) && hudHeightPx > 0
      ? Math.ceil(hudHeightPx)
      : fallbackHud;
  return measuredHud + PEOPLE_DRAWER_HUD_GAP_PX;
}

const PRESENCE_SORT_ORDER: Record<HarborPerson['presenceStatus'], number> = {
  online: 0,
  away: 1,
  offline: 2,
  leave: 3,
};

export const PeopleFinderDrawer: React.FC<PeopleFinderDrawerProps> = ({
  open,
  runtimeEnv,
  people,
  visibleQuaySubs,
  overflowCount = 0,
  onClose,
  onFocusPerson,
  onSelectPerson,
  onPreviewLinkBlocked,
}) => {
  const [query, setQuery] = useState('');
  const [onlineOnly, setOnlineOnly] = useState(false);

  const isPreview = runtimeEnv === 'preview';

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people
      .filter((p) => (onlineOnly ? p.presenceStatus === 'online' : true))
      .filter((p) => {
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          p.dept.toLowerCase().includes(q) ||
          p.title.toLowerCase().includes(q) ||
          p.presenceLabelKo.toLowerCase().includes(q)
        );
      })
      .sort(
        (a, b) =>
          PRESENCE_SORT_ORDER[a.presenceStatus] - PRESENCE_SORT_ORDER[b.presenceStatus] ||
          a.name.localeCompare(b.name, 'ko'),
      );
  }, [people, query, onlineOnly]);

  if (!open) return null;

  const onlineCount = people.filter((p) => p.presenceStatus === 'online').length;
  const awayCount = people.filter((p) => p.presenceStatus === 'away').length;
  const leaveCount = people.filter((p) => p.presenceStatus === 'leave').length;

  return (
    <aside
      aria-label="직원 찾기"
      data-testid="people-finder-drawer"
      className="fixed inset-x-3 top-[calc(var(--metasgw-hud-height,124px)+8px)] bottom-24 z-30 flex flex-col rounded-2xl border border-slate-700/80 bg-slate-950/96 text-slate-100 shadow-2xl backdrop-blur-md sm:inset-x-auto sm:right-3 sm:top-[calc(var(--metasgw-hud-height,96px)+8px)] sm:bottom-20 sm:w-80"
    >
      <div
        data-testid="people-finder-drawer-header"
        className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-800 px-4 py-3"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Users className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden="true" />
          <h2 className="text-sm font-bold text-white whitespace-nowrap">사람 찾기</h2>
          <span className="shrink-0 whitespace-nowrap rounded bg-emerald-950/90 border border-emerald-400/50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-100">
            온라인 {onlineCount}/{people.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="사람 찾기 닫기"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="space-y-2 border-b border-slate-800 px-3.5 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-300">
          <span>온라인 {onlineCount}</span>
          <span aria-hidden="true">·</span>
          <span>자리비움 {awayCount}</span>
          <span aria-hidden="true">·</span>
          <span>연차 {leaveCount}</span>
        </div>
        {overflowCount > 0 && (
          <p
            data-testid="drawer-overflow-notice"
            className="rounded-lg border border-amber-400/50 bg-amber-950/70 px-2.5 py-1.5 text-[11px] font-medium text-amber-100"
          >
            3D 안벽 표시 상한 초과 (외 {overflowCount}명) — 모든 동료에게 아래 목록에서 바로 메시지를 보낼 수 있습니다.
          </p>
        )}
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름 · 부서 · 상태 검색"
            aria-label="직원 검색"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 py-1.5 pl-8 pr-3 text-xs text-white placeholder:text-slate-400 focus:border-sky-500 focus:outline-none"
          />
        </div>
        <label className="inline-flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={onlineOnly}
            onChange={(e) => setOnlineOnly(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-800 accent-emerald-500"
          />
          온라인만 보기
        </label>
      </div>

      <ul className="meta-scroll flex-1 divide-y divide-slate-800/80 overflow-y-auto px-2 py-1">
        {filtered.length === 0 ? (
          <li className="py-10 text-center text-xs text-slate-400">일치하는 직원이 없습니다.</li>
        ) : (
          filtered.map((person) => {
            const rawDm = buildTalkDmUrl(person.sub);
            const dmHref = isSafeNavigationUrl(rawDm) ? rawDm : '/talk/';
            const canLocateOnQuay =
              !person.isCurrentUser &&
              person.presenceStatus !== 'leave' &&
              (!visibleQuaySubs || visibleQuaySubs.has(person.sub));

            return (
              <li
                key={person.sub}
                data-testid={`drawer-person-${person.sub}`}
                data-presence-status={person.presenceStatus}
                className="flex items-center justify-between gap-2 px-2 py-2.5"
              >
                <button
                  type="button"
                  onClick={() => onSelectPerson(person)}
                  aria-label={`${person.name} (${person.dept}, ${person.presenceLabelKo}) 상세 보기`}
                  className="min-w-0 flex-1 rounded text-left focus-visible:outline-2 focus-visible:outline-sky-400"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-xs font-semibold text-white">
                      {person.name}
                    </span>
                    <span
                      className={`inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
                        person.presenceStatus === 'online'
                          ? 'border-emerald-400/50 bg-emerald-950/80 text-emerald-100'
                          : person.presenceStatus === 'away'
                            ? 'border-amber-400/50 bg-amber-950/80 text-amber-100'
                            : person.presenceStatus === 'leave'
                              ? 'border-violet-400/50 bg-violet-950/80 text-violet-100'
                              : 'border-slate-600 bg-slate-800 text-slate-200'
                      }`}
                    >
                      {person.presenceStatus === 'online' ? (
                        <Wifi className="h-2.5 w-2.5 text-emerald-300 shrink-0" aria-hidden="true" />
                      ) : person.presenceStatus === 'away' ? (
                        <Clock className="h-2.5 w-2.5 text-amber-300 shrink-0" aria-hidden="true" />
                      ) : person.presenceStatus === 'leave' ? (
                        <CalendarOff className="h-2.5 w-2.5 text-violet-300 shrink-0" aria-hidden="true" />
                      ) : (
                        <WifiOff className="h-2.5 w-2.5 text-slate-300 shrink-0" aria-hidden="true" />
                      )}
                      <span>{person.presenceLabelKo}</span>
                    </span>
                    {person.isPartner && (
                      <span className="rounded bg-amber-950/80 px-1 py-0.5 text-[10px] font-semibold text-amber-200 border border-amber-400/40">
                        협력사
                      </span>
                    )}
                  </div>
                  <p className="truncate text-[11px] text-slate-300">
                    {person.dept} · {person.title}
                  </p>
                </button>

                <div className="flex shrink-0 items-center gap-1">
                  {canLocateOnQuay && (
                    <button
                      type="button"
                      onClick={() => onFocusPerson(person.sub)}
                      title="항구에서 찾아가기"
                      aria-label={`${person.name} 위치로 이동`}
                      className="rounded-lg border border-slate-700 bg-slate-900 p-1.5 text-slate-200 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-sky-400"
                    >
                      <MapPin className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                    </button>
                  )}
                  <a
                    href={dmHref}
                    onClick={(e) => {
                      if (isPreview) {
                        e.preventDefault();
                        onPreviewLinkBlocked(`메시지(${person.name})`);
                      }
                    }}
                    title="메시지 보내기"
                    aria-label={`${person.name}에게 메시지 보내기`}
                    className="rounded-lg border border-sky-400/50 bg-sky-950/70 p-1.5 text-sky-200 hover:bg-sky-700 hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400"
                  >
                    <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                </div>
              </li>
            );
          })
        )}
      </ul>
    </aside>
  );
};
