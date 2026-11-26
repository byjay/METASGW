import React from 'react';
import {
  CheckCircle2,
  Clock,
  Map as MapIcon,
  PauseCircle,
  PlayCircle,
  Radar,
  RefreshCw,
  Ship,
  Users,
} from 'lucide-react';
import type { HarborShip } from '../mapping';

export interface BottomControlDockProps {
  ships: HarborShip[];
  projectsState: 'loading' | 'ready' | 'pending' | 'forbidden' | 'error';
  projectsMessage: string;
  onlineCount: number;
  totalPeopleCount: number;
  peopleDrawerOpen: boolean;
  minimapOpen: boolean;
  boardedShipId?: string | null;
  onSelectShip: (ship: HarborShip) => void;
  onRefreshProjects: () => void;
  onTogglePeopleDrawer: () => void;
  onToggleMinimap: () => void;
  onSwitchTo2D: () => void;
}

function renderDockStatusIcon(tone: HarborShip['statusTone']): React.ReactNode {
  switch (tone) {
    case 'active':
      return <PlayCircle className="h-3.5 w-3.5 text-sky-300 shrink-0" aria-hidden="true" />;
    case 'review':
      return <Clock className="h-3.5 w-3.5 text-amber-300 shrink-0" aria-hidden="true" />;
    case 'hold':
      return <PauseCircle className="h-3.5 w-3.5 text-rose-300 shrink-0" aria-hidden="true" />;
    case 'completed':
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300 shrink-0" aria-hidden="true" />;
    default:
      return <Ship className="h-3.5 w-3.5 text-slate-300 shrink-0" aria-hidden="true" />;
  }
}

export const BottomControlDock: React.FC<BottomControlDockProps> = ({
  ships,
  projectsState,
  projectsMessage,
  onlineCount,
  totalPeopleCount,
  peopleDrawerOpen,
  minimapOpen,
  boardedShipId = null,
  onSelectShip,
  onRefreshProjects,
  onTogglePeopleDrawer,
  onToggleMinimap,
  onSwitchTo2D,
}) => {
  return (
    <div className="pointer-events-none fixed bottom-2 sm:bottom-3 inset-x-0 z-30 flex justify-center px-2 sm:px-3">
      <div
        data-testid="bottom-control-dock"
        className="pointer-events-auto flex w-full max-w-[calc(100vw-1rem)] sm:w-auto sm:max-w-full flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 rounded-2xl border border-slate-700/90 bg-slate-950/96 px-2.5 py-2 sm:px-3 text-slate-100 shadow-2xl"
      >
        {/* Docked SEDMS Project Ships (horizontally scrollable on narrow mobile) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 sm:pb-0 sm:max-w-[52vw]">
          <Ship className="h-4 w-4 shrink-0 text-sky-400" aria-hidden="true" />
          {projectsState === 'pending' && (
            <span className="inline-flex items-center gap-2 rounded-lg border border-amber-400/40 bg-amber-950/70 px-2.5 py-1 text-xs font-medium text-amber-100 whitespace-nowrap">
              {projectsMessage || '프로젝트 연결 준비 중'}
              <button
                type="button"
                onClick={onRefreshProjects}
                aria-label="프로젝트 다시 확인"
                className="rounded p-0.5 hover:bg-amber-500/20 focus-visible:outline-2 focus-visible:outline-sky-400"
              >
                <RefreshCw className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          )}

          {projectsState === 'forbidden' && (
            <span className="rounded-lg border border-rose-500/40 bg-rose-950/50 px-2.5 py-1 text-xs font-medium text-rose-100 whitespace-nowrap">
              프로젝트 권한 없음
            </span>
          )}

          {projectsState === 'ready' && ships.length === 0 && (
            <span className="text-xs text-slate-300 whitespace-nowrap">참여 중인 프로젝트 없음</span>
          )}

          {projectsState === 'ready' &&
            ships.map((ship) => {
              const isBoarded = boardedShipId === ship.id;
              return (
                <button
                  key={ship.id}
                  type="button"
                  onClick={() => onSelectShip(ship)}
                  aria-label={`${ship.name} (${ship.code}, ${ship.appearance.statusLabelKo}) 승선하기`}
                  aria-pressed={isBoarded}
                  className={`inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-sky-400 ${
                    isBoarded
                      ? 'border-sky-400 bg-sky-700 text-white'
                      : 'border-slate-700 bg-slate-900 text-white hover:border-sky-400 hover:bg-slate-800'
                  }`}
                >
                  {renderDockStatusIcon(ship.statusTone)}
                  <span>{ship.name}</span>
                  <span className="font-mono text-[10px] text-slate-200">{ship.code}</span>
                </button>
              );
            })}
        </div>

        <div className="h-5 w-px bg-slate-800 hidden sm:block" aria-hidden="true" />

        {/* Action buttons: Minimap + People Finder + Quick Radar Switch */}
        <div className="grid grid-cols-3 sm:flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleMinimap}
            aria-pressed={minimapOpen}
            aria-label={`항구 미니맵 ${minimapOpen ? '닫기' : '열기'}`}
            className={`inline-flex min-h-[40px] sm:min-h-[36px] items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-sky-400 whitespace-nowrap ${
              minimapOpen
                ? 'border-sky-400/60 bg-sky-700 text-white'
                : 'border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800'
            }`}
          >
            <MapIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>미니맵</span>
          </button>

          <button
            type="button"
            onClick={onTogglePeopleDrawer}
            aria-pressed={peopleDrawerOpen}
            aria-label={`사람찾기 패널 ${peopleDrawerOpen ? '닫기' : '열기'} (접속 ${onlineCount}/${totalPeopleCount})`}
            className={`inline-flex min-h-[40px] sm:min-h-[36px] items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-sky-400 whitespace-nowrap ${
              peopleDrawerOpen
                ? 'border-emerald-400/60 bg-emerald-700 text-white'
                : 'border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800'
            }`}
          >
            <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              동료 ({onlineCount}/{totalPeopleCount})
            </span>
          </button>

          <button
            type="button"
            onClick={onSwitchTo2D}
            aria-label="빠른 레이더 모드로 전환"
            className="inline-flex min-h-[40px] sm:min-h-[36px] items-center justify-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-800 hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400 whitespace-nowrap"
          >
            <Radar className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>빠른 레이더</span>
          </button>
        </div>
      </div>
    </div>
  );
};
