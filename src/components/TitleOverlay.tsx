import React, { useEffect } from 'react';
import { TENANT_PROJECTS, type ActorRoleType, type ProjectTenant } from '../config/fleetConfig';

interface TitleOverlayProps {
  selectedProject: ProjectTenant;
  onSelectProject: (project: ProjectTenant) => void;
  actorRole: ActorRoleType;
  onSelectActorRole: (role: ActorRoleType) => void;
  onStart: () => void;
}

export const TitleOverlay: React.FC<TitleOverlayProps> = ({
  selectedProject,
  onSelectProject,
  actorRole,
  onSelectActorRole,
  onStart,
}) => {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const activeTag = (document.activeElement as HTMLElement | null)?.tagName;
        if (activeTag === 'SELECT' || activeTag === 'INPUT') return;
        e.preventDefault();
        onStart();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onStart]);

  return (
    <div
      className="fixed inset-0 z-30 flex flex-col justify-between p-6 sm:p-10 pointer-events-none"
      style={{
        background:
          'linear-gradient(100deg, rgba(8, 17, 32, 0.88) 0%, rgba(8, 17, 32, 0.56) 38%, rgba(8, 17, 32, 0.04) 70%, rgba(8, 17, 32, 0) 100%)',
      }}
    >
      {/* Left-Third Asymmetric Title Lockup */}
      <div className="my-auto max-w-md pointer-events-auto">
        <div className="flex items-center gap-3.5 mb-5">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true" className="shrink-0">
            <rect width="48" height="48" rx="12" fill="#0F172A" stroke="#38BDF8" strokeWidth="1.5" />
            <path d="M10 29L15 36H33L38 29H10Z" fill="#0EA5E9" />
            <path d="M16 27V18H27L32 27H16Z" fill="#F8FAFC" />
            <rect x="20" y="12" width="3" height="6" fill="#EA580C" />
            <path
              d="M8 39.5C13 37.5 18 41.5 24 39.5C30 37.5 35 41.5 40 39.5"
              stroke="#7DD3FC"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
          <div>
            <h1 className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight text-white leading-none">
              메타SGW
            </h1>
            <p className="mt-1.5 text-sm text-sky-200 font-medium">
              SGS · SGW_V0 · SGTALK 통합 3D 조선소 메타스페이스
            </p>
          </div>
        </div>

        <p className="text-sm sm:text-base text-slate-200 leading-relaxed mb-6">
          SGS/SGW 계정으로 접속하면 2배 확장된 3D 조선소 항구에 직원으로 입장합니다. 동료들과 함께 걸으며 6개
          엔지니어링 건물 내부로 직접 들어가 작업하고, 8종 선박 탑승·FARO 3D 점군·SGTALK를 한곳에서 수행합니다.
        </p>

        {/* Project & Role Selector */}
        <div className="space-y-4 mb-6 bg-slate-900/95 border border-slate-700/80 rounded-xl p-4">
          <div>
            <label htmlFor="title-project-select" className="block text-xs font-semibold text-slate-300 mb-1.5">
              SGS SSO 프로젝트 공간 (/space/seastar/…)
            </label>
            <select
              id="title-project-select"
              value={selectedProject.projectId}
              onChange={(e) => {
                const found = TENANT_PROJECTS.find((p) => p.projectId === e.target.value);
                if (found) onSelectProject(found);
              }}
              className="w-full bg-slate-950 text-white border border-slate-700 rounded-lg px-3 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              {TENANT_PROJECTS.map((proj) => (
                <option key={proj.projectId} value={proj.projectId}>
                  {proj.name} ({proj.projectId})
                </option>
              ))}
            </select>
          </div>

          <div>
            <span className="block text-xs font-semibold text-slate-300 mb-1.5">
              접속 신분 (항구 내 3D 직원 아바타 및 권한 적용)
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onSelectActorRole('employee')}
                className={`px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap border cursor-pointer ${
                  actorRole === 'employee'
                    ? 'bg-sky-700 text-white border-sky-400'
                    : 'bg-slate-950 text-slate-300 border-slate-700 hover:bg-slate-800'
                }`}
              >
                ■ [본사] 임직원
              </button>
              <button
                type="button"
                onClick={() => onSelectActorRole('partner')}
                className={`px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap border cursor-pointer ${
                  actorRole === 'partner'
                    ? 'bg-amber-700 text-white border-amber-400'
                    : 'bg-slate-950 text-slate-300 border-slate-700 hover:bg-slate-800'
                }`}
              >
                ◆ [협력] 외부 협력사
              </button>
            </div>
          </div>
        </div>

        <button
          type="button"
          data-start="true"
          onClick={onStart}
          className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-display font-bold text-base tracking-tight transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 cursor-pointer"
        >
          항구로 출근하기
        </button>
      </div>

      {/* Single flat control hint in bottom safe margin */}
      <div className="text-xs text-slate-200 tracking-wide drop-shadow">
        WASD / 방향키 보행 · 바닥/건물 클릭 이동 · 건물 정문 진입 시 지붕 자동 열림 · F/E 모듈 실행 · Enter 입장
      </div>
    </div>
  );
};
