import React from 'react';
import {
  Anchor,
  ChevronDown,
  ChevronUp,
  Layers,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Wrench,
} from 'lucide-react';
import type { EngineeringModuleConfig, ModuleId } from '../config/fleetConfig';

export type ActiveDrawerTab = 'none' | 'ships' | 'modules' | 'sgtalk' | 'security' | 'qa' | 'skills';

interface BottomControlDockProps {
  activeTab: ActiveDrawerTab;
  onSelectTab: (tab: ActiveDrawerTab) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  nearbyZone: EngineeringModuleConfig | null;
  onOpenModule: (moduleId: ModuleId) => void;
  unreadCount: number;
  darkUi: boolean;
}

export const BottomControlDock: React.FC<BottomControlDockProps> = ({
  activeTab,
  onSelectTab,
  collapsed,
  onToggleCollapse,
  nearbyZone,
  onOpenModule,
  unreadCount,
  darkUi,
}) => {
  const surfaceClass = darkUi
    ? 'bg-slate-950/94 text-slate-50 border-slate-700/90'
    : 'bg-white/96 text-slate-900 border-slate-300';

  const tabs: Array<{ id: ActiveDrawerTab; label: string; shortLabel: string; icon: React.ReactNode }> = [
    { id: 'ships', label: '선박 8종', shortLabel: '선박', icon: <Anchor className="w-4 h-4 shrink-0" /> },
    { id: 'modules', label: '엔지니어링', shortLabel: '모듈', icon: <Wrench className="w-4 h-4 shrink-0" /> },
    { id: 'sgtalk', label: 'SGTALK·EGO', shortLabel: '대화', icon: <MessageSquare className="w-4 h-4 shrink-0" /> },
    { id: 'security', label: '보안·협력사', shortLabel: '보안', icon: <ShieldCheck className="w-4 h-4 shrink-0" /> },
    { id: 'qa', label: '5역할 QA', shortLabel: 'QA', icon: <Layers className="w-4 h-4 shrink-0" /> },
    { id: 'skills', label: '전역 스킬 9종', shortLabel: '스킬', icon: <Sparkles className="w-4 h-4 shrink-0" /> },
  ];

  return (
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2 w-[96vw] sm:w-auto max-w-[96vw] pointer-events-none">
      {/* Contextual Berth Action Prompt when near a Walk-In Hall or Dock Zone (left-aligned on mobile to stay clear of right-side D-pad!) */}
      {nearbyZone && !collapsed && activeTab === 'none' && (
        <button
          type="button"
          onClick={() => onOpenModule(nearbyZone.moduleId)}
          className="pointer-events-auto self-start sm:self-center px-3 sm:px-4 py-2 rounded-xl bg-sky-700 hover:bg-sky-600 text-white text-[11px] sm:text-sm font-semibold border border-sky-400 shadow-lg whitespace-nowrap transition-colors cursor-pointer max-w-[64vw] sm:max-w-none truncate"
        >
          [F/E] {nearbyZone.displayName} 열기{nearbyZone.silent ? ' (정숙)' : ''}
        </button>
      )}

      {/* Collapse / Expand Toggle Handle */}
      <button
        type="button"
        onClick={(e) => {
          onToggleCollapse();
          e.currentTarget.blur();
        }}
        aria-expanded={!collapsed}
        aria-label={collapsed ? '하단 컨트롤 독 펼치기' : '하단 컨트롤 독 숨기기'}
        className={`pointer-events-auto flex items-center gap-1.5 px-3 py-1 rounded-t-lg rounded-b-md border text-xs font-semibold shadow-sm whitespace-nowrap transition-colors cursor-pointer ${surfaceClass}`}
      >
        {collapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        <span>{collapsed ? '컨트롤 열기 (H)' : '컨트롤 숨기기 (H)'}</span>
      </button>

      {/* Main Unified Horizontal Dock */}
      {!collapsed && (
        <nav
          aria-label="메타SGW 5역할 통합 컨트롤 독"
          className={`pointer-events-auto flex items-center gap-0.5 sm:gap-1.5 p-1 sm:p-1.5 rounded-2xl border shadow-xl overflow-x-auto max-w-[96vw] ${surfaceClass}`}
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={(e) => {
                  onSelectTab(isActive ? 'none' : tab.id);
                  e.currentTarget.blur();
                }}
                aria-pressed={isActive}
                className={`relative flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3.5 py-2 sm:py-2.5 rounded-xl text-[11px] sm:text-sm font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-sky-700 text-white'
                    : darkUi
                      ? 'text-slate-200 hover:bg-slate-800'
                      : 'text-slate-800 hover:bg-slate-100'
                }`}
              >
                {tab.icon}
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.shortLabel}</span>
                {tab.id === 'sgtalk' && unreadCount > 0 && (
                  <span className="ml-0.5 text-[11px] font-mono-tabular font-bold text-amber-400">
                    ({unreadCount})
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
};
