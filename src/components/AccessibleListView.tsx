import React, { useMemo, useState } from 'react';
import {
  Building2,
  ExternalLink,
  FolderKanban,
  Mail,
  MessageSquare,
  RefreshCw,
  Search,
  Shield,
  Ship,
  Users,
} from 'lucide-react';
import {
  buildSedmsProjectUrl,
  buildTalkDmUrl,
  isSafeNavigationUrl,
  SGW_PORTAL_LINKS,
} from '../deepLink';
import type { HarborPerson, HarborShip } from '../mapping';
import type { RuntimeEnv } from '../runtimeEnv';
import type { SgwUser } from '../sgwAdapter';

export interface AccessibleListViewProps {
  user: SgwUser;
  runtimeEnv: RuntimeEnv;
  ships: HarborShip[];
  projectsState: 'loading' | 'ready' | 'pending' | 'forbidden' | 'error';
  projectsMessage: string;
  people: HarborPerson[];
  webglSupported: boolean;
  onRefreshProjects: () => void;
  onSelectShip: (ship: HarborShip) => void;
  onSelectPerson: (person: HarborPerson) => void;
  onPreviewLinkBlocked: (featureLabel: string) => void;
}

const STATUS_BADGE_CLASS: Record<HarborShip['statusTone'], string> = {
  active: 'bg-sky-500/20 text-sky-200 border-sky-400/40',
  review: 'bg-amber-500/20 text-amber-200 border-amber-400/40',
  hold: 'bg-rose-500/20 text-rose-200 border-rose-400/40',
  completed: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40',
  neutral: 'bg-slate-700/60 text-slate-200 border-slate-500/40',
};

export const AccessibleListView: React.FC<AccessibleListViewProps> = ({
  user,
  runtimeEnv,
  ships,
  projectsState,
  projectsMessage,
  people,
  webglSupported,
  onRefreshProjects,
  onSelectShip,
  onSelectPerson,
  onPreviewLinkBlocked,
}) => {
  const [query, setQuery] = useState('');
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [openInNewTab, setOpenInNewTab] = useState(false);

  const isPreview = runtimeEnv === 'preview';

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

  return (
    <main
      className="min-h-screen w-full overflow-y-auto bg-slate-950 px-4 pb-16 pt-20 text-slate-100"
      aria-label="메타SGW 2D 목록 상황판"
    >
      <div className="mx-auto max-w-6xl space-y-6">
        {!webglSupported && (
          <div
            role="status"
            className="rounded-xl border border-amber-400/40 bg-amber-950/40 px-4 py-3 text-sm text-amber-100"
          >
            이 브라우저 환경은 3D WebGL 가속을 지원하지 않아 2D 접근성 목록 모드로 자동 전환되었습니다.
            모든 SGW 및 SEDMS 연동 기능을 동일하게 사용할 수 있습니다.
          </div>
        )}

        {/* 1. SEDMS Projects Table */}
        <section
          aria-labelledby="heading-sedms-projects"
          className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-lg"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div className="flex items-center gap-2.5">
              <Ship className="h-5 w-5 text-sky-400" aria-hidden="true" />
              <div>
                <h1 id="heading-sedms-projects" className="text-base font-bold text-white">
                  정박 프로젝트 선박 (SEDMS)
                </h1>
                <p className="text-xs text-slate-300">
                  {isPreview
                    ? '미리보기 데모용 가명 프로젝트 목록입니다. 실제 SEDMS 이동은 SGW 운영 환경에서 동작합니다.'
                    : '현재 SGW 계정으로 접근 가능한 SEDMS 프로젝트 목록입니다. 클릭 시 SSO를 통해 SEDMS로 바로 이동합니다.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {!isPreview && (
                <label className="inline-flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={openInNewTab}
                    onChange={(e) => setOpenInNewTab(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-800 accent-sky-500"
                  />
                  새 창으로 열기
                </label>
              )}

              <button
                type="button"
                onClick={onRefreshProjects}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-700"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                새로고침
              </button>
            </div>
          </div>

          <div className="mt-4">
            {projectsState === 'loading' && (
              <p className="py-8 text-center text-sm text-slate-300">프로젝트 목록을 불러오는 중입니다...</p>
            )}

            {projectsState === 'pending' && (
              <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-6 text-center space-y-3">
                <p className="text-base font-semibold text-white">
                  {projectsMessage || '프로젝트 연결 준비 중'}
                </p>
                <p className="text-xs text-slate-300">
                  SGW 게이트웨이의 SEDMS 프로젝트 목록 API가 아직 활성화되지 않았습니다. 아래 버튼으로 SEDMS 프로젝트 화면으로 직접 이동할 수 있습니다.
                </p>
                <a
                  href={safeHref(SGW_PORTAL_LINKS.sedmsProjects)}
                  target={!isPreview && openInNewTab ? '_blank' : undefined}
                  rel={!isPreview && openInNewTab ? 'noopener noreferrer' : undefined}
                  onClick={handleLinkClick('SEDMS 프로젝트 목록')}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500"
                >
                  <FolderKanban className="h-4 w-4" aria-hidden="true" />
                  SEDMS 프로젝트 목록 열기
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              </div>
            )}

            {projectsState === 'forbidden' && (
              <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-6 text-center text-sm text-rose-100">
                권한 없음 — SEDMS 프로젝트 조회 권한이 필요합니다.
              </div>
            )}

            {projectsState === 'ready' && ships.length === 0 && (
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-6 text-center text-sm text-slate-300">
                현재 참여 중인 SEDMS 프로젝트가 없습니다.
              </div>
            )}

            {projectsState === 'ready' && ships.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-xs font-semibold uppercase text-slate-300">
                      <th scope="col" className="py-2.5 pr-3">선석</th>
                      <th scope="col" className="py-2.5 pr-3">코드</th>
                      <th scope="col" className="py-2.5 pr-3">프로젝트명</th>
                      <th scope="col" className="py-2.5 pr-3">내 권한</th>
                      <th scope="col" className="py-2.5 pr-3">상태</th>
                      <th scope="col" className="py-2.5 pr-3">최근 갱신</th>
                      <th scope="col" className="py-2.5 text-right">이동</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {ships.map((ship) => {
                      const ssoHref = safeHref(buildSedmsProjectUrl(ship.id));
                      return (
                        <tr key={ship.id} className="hover:bg-slate-800/40">
                          <td className="py-3 pr-3 font-mono text-xs text-slate-300">{ship.berthLabel}</td>
                          <td className="py-3 pr-3 font-mono text-xs text-slate-200">{ship.code}</td>
                          <td className="py-3 pr-3 font-semibold text-white">
                            <button
                              type="button"
                              onClick={() => onSelectShip(ship)}
                              className="text-left hover:text-sky-300 underline-offset-4 hover:underline"
                            >
                              {ship.name}
                            </button>
                          </td>
                          <td className="py-3 pr-3 text-xs text-slate-200">{ship.role}</td>
                          <td className="py-3 pr-3">
                            <span
                              className={`inline-block rounded border px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE_CLASS[ship.statusTone]}`}
                            >
                              {ship.status}
                            </span>
                          </td>
                          <td className="py-3 pr-3 font-mono text-xs text-slate-300">{ship.updatedAt}</td>
                          <td className="py-3 text-right">
                            <a
                              href={ssoHref}
                              target={!isPreview && openInNewTab ? '_blank' : undefined}
                              rel={!isPreview && openInNewTab ? 'noopener noreferrer' : undefined}
                              onClick={handleLinkClick(`SEDMS 프로젝트(${ship.code}) 입장`)}
                              className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500"
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
            )}
          </div>
        </section>

        {/* 2. People & Presence */}
        <section
          aria-labelledby="heading-harbor-people"
          className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-lg"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div className="flex items-center gap-2.5">
              <Users className="h-5 w-5 text-emerald-400" aria-hidden="true" />
              <div>
                <h2 id="heading-harbor-people" className="text-base font-bold text-white">
                  직원 · 접속 현황 (SGW)
                </h2>
                <p className="text-xs text-slate-300">
                  30초 기준 접속 상태가 표시되며, 직원을 클릭하면 SGTALK 1:1 대화로 바로 연결됩니다.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
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
                  className="w-52 rounded-lg border border-slate-700 bg-slate-950 py-1.5 pl-8 pr-3 text-xs text-white placeholder:text-slate-400 focus:border-sky-500 focus:outline-none"
                />
              </div>
              <label className="inline-flex items-center gap-1.5 text-xs text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={onlineOnly}
                  onChange={(e) => setOnlineOnly(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-800 accent-emerald-500"
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
            <ul className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {filteredPeople.map((person) => (
                <li
                  key={person.sub}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/75 px-3.5 py-3"
                >
                  <button
                    type="button"
                    onClick={() => onSelectPerson(person)}
                    className="min-w-0 text-left flex-1"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                          person.online ? 'bg-emerald-400' : 'bg-slate-600'
                        }`}
                        aria-label={person.online ? '접속 중' : '오프라인'}
                      />
                      <span className="truncate text-sm font-semibold text-white">
                        {person.name}
                      </span>
                      {person.isPartner && (
                        <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200 border border-amber-400/40">
                          협력사
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-300">
                      {person.dept} · {person.title}
                    </p>
                  </button>

                  <a
                    href={safeHref(buildTalkDmUrl(person.sub))}
                    onClick={handleLinkClick(`SGTALK 대화(${person.name})`)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-sky-500/40 bg-sky-600/20 px-2.5 py-1.5 text-xs font-semibold text-sky-200 hover:bg-sky-600 hover:text-white"
                  >
                    <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                    대화
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 3. SGW Workspace Shortcuts */}
        <section aria-labelledby="heading-sgw-links" className="space-y-3">
          <h2 id="heading-sgw-links" className="text-sm font-bold text-slate-200">
            SGW 업무 바로가기
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <a
              href={safeHref(SGW_PORTAL_LINKS.talkHome)}
              onClick={handleLinkClick('SGTALK · SGW 비서')}
              className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/90 p-4 hover:border-sky-500/60"
            >
              <MessageSquare className="h-5 w-5 text-sky-400 shrink-0" aria-hidden="true" />
              <div>
                <div className="text-sm font-semibold text-white">SGTALK · SGW 비서</div>
                <div className="text-xs text-slate-300">사내 채팅 및 AI 비서 열기</div>
              </div>
            </a>

            <a
              href={safeHref(SGW_PORTAL_LINKS.nas)}
              onClick={handleLinkClick('SGW NAS')}
              className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/90 p-4 hover:border-teal-500/60"
            >
              <Building2 className="h-5 w-5 text-teal-400 shrink-0" aria-hidden="true" />
              <div>
                <div className="text-sm font-semibold text-white">SGW NAS</div>
                <div className="text-xs text-slate-300">공유 문서함으로 이동</div>
              </div>
            </a>

            <a
              href={safeHref(SGW_PORTAL_LINKS.bmail)}
              onClick={handleLinkClick('bmail')}
              className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/90 p-4 hover:border-indigo-500/60"
            >
              <Mail className="h-5 w-5 text-indigo-400 shrink-0" aria-hidden="true" />
              <div>
                <div className="text-sm font-semibold text-white">bmail 열기</div>
                <div className="text-xs text-slate-300">PC 메일 앱 실행 (bmail://)</div>
              </div>
            </a>

            {!user.isPartner && (
              <a
                href={safeHref(SGW_PORTAL_LINKS.admin)}
                onClick={handleLinkClick('SGW 관리자')}
                className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/90 p-4 hover:border-amber-500/60"
              >
                <Shield className="h-5 w-5 text-amber-400 shrink-0" aria-hidden="true" />
                <div>
                  <div className="text-sm font-semibold text-white">SGW 관리자</div>
                  <div className="text-xs text-slate-300">직원·권한·감사 관리</div>
                </div>
              </a>
            )}
          </div>
        </section>
      </div>
    </main>
  );
};
