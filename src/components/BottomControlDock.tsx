import React from 'react';
import { LayoutList, RefreshCw, Ship, Users } from 'lucide-react';
import type { HarborShip } from '../mapping';

export interface BottomControlDockProps {
  ships: HarborShip[];
  projectsState: 'loading' | 'ready' | 'pending' | 'forbidden' | 'error';
  projectsMessage: string;
  onlineCount: number;
  totalPeopleCount: number;
  peopleDrawerOpen: boolean;
  onSelectShip: (ship: HarborShip) => void;
  onRefreshProjects: () => void;
  onTogglePeopleDrawer: () => void;
  onSwitchTo2D: () => void;
}

export const BottomControlDock: React.FC<BottomControlDockProps> = ({
  ships,
  projectsState,
  projectsMessage,
  onlineCount,
  totalPeopleCount,
  peopleDrawerOpen,
  onSelectShip,
  onRefreshProjects,
  onTogglePeopleDrawer,
  onSwitchTo2D,
}) => {
  return (
    <div className="pointer-events-none fixed bottom-3 inset-x-0 z-30 flex justify-center px-3">
      <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-2 rounded-2xl border border-slate-700/80 bg-slate-950/92 px-3 py-2 text-slate-100 shadow-2xl backdrop-blur-md">
        {/* Docked SEDMS Project Ships */}
        <div className="flex items-center gap-1.5 overflow-x-auto max-w-[60vw]">
          <Ship className="h-4 w-4 shrink-0 text-sky-400" aria-hidden="true" />
          {projectsState === 'pending' && (
            <span className="inline-flex items-center gap-2 rounded-lg border border-amber-400/40 bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-200">
              {projectsMessage || '프로젝트 연결 준비 중'}
              <button
                type="button"
                onClick={onRefreshProjects}
                aria-label="프로젝트 다시 확인"
                className="rounded p-0.5 hover:bg-amber-500/20"
              >
                <RefreshCw className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          )}

          {projectsState === 'forbidden' && (
            <span className="rounded-lg border border-rose-500/40 bg-rose-950/50 px-2.5 py-1 text-xs font-medium text-rose-200">
              프로젝트 권한 없음
            </span>
          )}

          {projectsState === 'ready' && ships.length === 0 && (
            <span className="text-xs text-slate-300">참여 중인 프로젝트 없음</span>
          )}

          {projectsState === 'ready' &&
            ships.map((ship) => (
              <button
                key={ship.id}
                type="button"
                onClick={() => onSelectShip(ship)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white hover:border-sky-400 hover:bg-slate-800"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: ship.accentHex }}
                  aria-hidden="true"
                />
                <span>{ship.name}</span>
                <span className="font-mono text-[10px] text-slate-400">{ship.code}</span>
              </button>
            ))}
        </div>

        <div className="h-5 w-px bg-slate-800 hidden sm:block" aria-hidden="true" />

        {/* People Finder + 2D Switch */}
        <button
          type="button"
          onClick={onTogglePeopleDrawer}
          aria-pressed={peopleDrawerOpen}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
            peopleDrawerOpen
              ? 'border-emerald-400/60 bg-emerald-600 text-white'
              : 'border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800'
          }`}
        >
          <Users className="h-3.5 w-3.5" aria-hidden="true" />
          사람찾기 ({onlineCount}/{totalPeopleCount})
        </button>

        <button
          type="button"
          onClick={onSwitchTo2D}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800 hover:text-white"
        >
          <LayoutList className="h-3.5 w-3.5" aria-hidden="true" />
          2D 목록
        </button>
      </div>
    </div>
  );
};
