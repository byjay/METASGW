import React, { useMemo, useState } from 'react';
import { MapPin, MessageSquare, Search, Users, X } from 'lucide-react';
import { buildTalkDmUrl, isSafeNavigationUrl } from '../deepLink';
import type { HarborPerson } from '../mapping';
import type { RuntimeEnv } from '../runtimeEnv';

export interface PeopleFinderDrawerProps {
  open: boolean;
  runtimeEnv: RuntimeEnv;
  people: HarborPerson[];
  onClose: () => void;
  onFocusPerson: (sub: string) => void;
  onSelectPerson: (person: HarborPerson) => void;
  onPreviewLinkBlocked: (featureLabel: string) => void;
}

export const PeopleFinderDrawer: React.FC<PeopleFinderDrawerProps> = ({
  open,
  runtimeEnv,
  people,
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

  if (!open) return null;

  const onlineCount = people.filter((p) => p.online).length;

  return (
    <aside
      aria-label="직원 찾기"
      className="fixed right-3 top-16 bottom-20 z-30 flex w-80 max-w-[calc(100vw-1.5rem)] flex-col rounded-2xl border border-slate-700/80 bg-slate-950/95 text-slate-100 shadow-2xl backdrop-blur-md"
    >
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-emerald-400" aria-hidden="true" />
          <h2 className="text-sm font-bold text-white">사람 찾기</h2>
          <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-200">
            접속 {onlineCount} / {people.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="사람 찾기 닫기"
          className="rounded-lg p-1 text-slate-300 hover:bg-slate-800 hover:text-white"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="space-y-2 border-b border-slate-800 px-3.5 py-2.5">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름 · 부서 · 직급 검색"
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
          접속 중(30초 이내)만 보기
        </label>
      </div>

      <ul className="meta-scroll flex-1 divide-y divide-slate-800/80 overflow-y-auto px-2 py-1">
        {filtered.length === 0 ? (
          <li className="py-10 text-center text-xs text-slate-400">일치하는 직원이 없습니다.</li>
        ) : (
          filtered.map((person) => {
            const rawDm = buildTalkDmUrl(person.sub);
            const dmHref = isSafeNavigationUrl(rawDm) ? rawDm : '/talk/';
            return (
              <li key={person.sub} className="flex items-center justify-between gap-2 px-2 py-2.5">
                <button
                  type="button"
                  onClick={() => onSelectPerson(person)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        person.online ? 'bg-emerald-400' : 'bg-slate-600'
                      }`}
                    />
                    <span className="truncate text-xs font-semibold text-white">
                      {person.name}
                    </span>
                    {person.isPartner && (
                      <span className="rounded bg-amber-500/20 px-1 py-0.5 text-[10px] font-semibold text-amber-200">
                        협력사
                      </span>
                    )}
                  </div>
                  <p className="truncate text-[11px] text-slate-400">
                    {person.dept} · {person.title}
                  </p>
                </button>

                <div className="flex shrink-0 items-center gap-1">
                  {!person.isCurrentUser && (
                    <button
                      type="button"
                      onClick={() => onFocusPerson(person.sub)}
                      title="항구에서 찾아가기"
                      aria-label={`${person.name} 위치로 이동`}
                      className="rounded-lg border border-slate-700 bg-slate-900 p-1.5 text-slate-200 hover:bg-slate-800"
                    >
                      <MapPin className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                    </button>
                  )}
                  <a
                    href={dmHref}
                    onClick={(e) => {
                      if (isPreview) {
                        e.preventDefault();
                        onPreviewLinkBlocked(`SGTALK 대화(${person.name})`);
                      }
                    }}
                    title="SGTALK 1:1 대화"
                    aria-label={`${person.name}와 SGTALK 대화하기`}
                    className="rounded-lg border border-sky-500/40 bg-sky-600/20 p-1.5 text-sky-200 hover:bg-sky-600 hover:text-white"
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
