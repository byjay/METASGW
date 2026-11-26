import React from 'react';
import { Building2, Camera, Moon, Radio, Sun, Sunrise, Volume2, VolumeX } from 'lucide-react';
import { TENANT_PROJECTS, type ActorRoleType, type ProjectTenant } from '../config/fleetConfig';
import type { AvatarMode, CameraPreset, HarborTelemetry, TimeOfDayMode } from '../scene/HarborScene';

interface HudTopBarProps {
  project: ProjectTenant;
  onChangeProject: (project: ProjectTenant) => void;
  actorRole: ActorRoleType;
  onToggleRole: (role: ActorRoleType) => void;
  avatarMode: AvatarMode;
  onToggleAvatarMode: () => void;
  telemetry: HarborTelemetry;
  cameraPreset: CameraPreset;
  onCycleCamera: () => void;
  timeOfDay: TimeOfDayMode;
  onCycleTimeOfDay: () => void;
  darkUi: boolean;
  onToggleDarkUi: () => void;
  udpBlocked: boolean;
}

const CAMERA_LABEL: Record<CameraPreset, string> = {
  quarter: '쿼터뷰 RPG',
  shoulder: '숄더뷰',
  overview: '항구 전경',
  pointcloud: '3D 점군 뷰',
};

const TOD_LABEL: Record<TimeOfDayMode, string> = {
  golden: '골든아워',
  day: '주간',
  night: '야간 야드',
};

export const HudTopBar: React.FC<HudTopBarProps> = ({
  project,
  onChangeProject,
  actorRole,
  onToggleRole,
  avatarMode,
  onToggleAvatarMode,
  telemetry,
  cameraPreset,
  onCycleCamera,
  timeOfDay,
  onCycleTimeOfDay,
  darkUi,
  onToggleDarkUi,
  udpBlocked,
}) => {
  const surfaceClass = darkUi
    ? 'bg-slate-950/92 text-slate-50 border-slate-700/90'
    : 'bg-white/95 text-slate-900 border-slate-300';

  const mutedText = darkUi ? 'text-slate-300' : 'text-slate-600';

  const proximityText = (() => {
    if (telemetry.proximity.mode === 'silent') return '정숙 구역 · 자동 음소거';
    if (telemetry.proximity.mode === 'conference') return `회의 구역 · ${telemetry.proximity.peers.length + 1}명`;
    if (telemetry.proximity.mode === 'bubble') return `근접 대화 · ${telemetry.proximity.peers.length}명`;
    return '항구 광장 · 대기';
  })();

  return (
    <div className="fixed top-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
      {/* Top-Left Compact Brand + Tenant Project + Role Switcher */}
      <div
        className={`pointer-events-auto flex items-center gap-2 px-3 py-2 rounded-xl border shadow-md max-w-full ${surfaceClass}`}
      >
        <span className="font-display font-extrabold text-sm tracking-tight whitespace-nowrap shrink-0">
          메타SGW
        </span>
        <span aria-hidden="true" className={`text-xs ${mutedText}`}>
          ·
        </span>
        <label htmlFor="hud-project-select" className="sr-only">
          프로젝트 선택
        </label>
        <select
          id="hud-project-select"
          value={project.projectId}
          onChange={(e) => {
            const next = TENANT_PROJECTS.find((p) => p.projectId === e.target.value);
            if (next) onChangeProject(next);
          }}
          className={`text-xs font-semibold rounded-md px-2 py-1 border focus:outline-none focus:ring-2 focus:ring-sky-500 max-w-[132px] sm:max-w-none truncate ${
            darkUi
              ? 'bg-slate-900 text-slate-100 border-slate-700'
              : 'bg-slate-100 text-slate-900 border-slate-300'
          }`}
        >
          {TENANT_PROJECTS.map((p) => (
            <option key={p.projectId} value={p.projectId}>
              {p.projectId} · {p.name.split(' ')[1] || p.name}
            </option>
          ))}
        </select>

        <div
          className={`flex items-center rounded-lg p-0.5 border shrink-0 ${
            darkUi ? 'bg-slate-900 border-slate-700' : 'bg-slate-100 border-slate-300'
          }`}
          role="group"
          aria-label="접속 신분 전환"
        >
          <button
            type="button"
            onClick={() => onToggleRole('employee')}
            className={`px-2 py-1 text-xs font-semibold rounded-md whitespace-nowrap transition-colors cursor-pointer ${
              actorRole === 'employee'
                ? 'bg-sky-700 text-white'
                : darkUi
                  ? 'text-slate-300 hover:text-white'
                  : 'text-slate-700 hover:text-slate-950'
            }`}
          >
            ■ 본사
          </button>
          <button
            type="button"
            onClick={() => onToggleRole('partner')}
            className={`px-2 py-1 text-xs font-semibold rounded-md whitespace-nowrap transition-colors cursor-pointer ${
              actorRole === 'partner'
                ? 'bg-amber-700 text-white'
                : darkUi
                  ? 'text-slate-300 hover:text-white'
                  : 'text-slate-700 hover:text-slate-950'
            }`}
          >
            ◆ 협력
          </button>
        </div>

        {/* Live Walk-In Building Indicator */}
        {telemetry.insideBuildingName && (
          <span className="hidden md:inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-700 text-white text-xs font-semibold whitespace-nowrap">
            <Building2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>실내: {telemetry.insideBuildingName}</span>
          </span>
        )}
      </div>

      {/* Top-Right Compact Proximity + Avatar Mode + Camera + Time-of-Day + Theme */}
      <div
        className={`pointer-events-auto flex items-center gap-1.5 px-2.5 py-2 rounded-xl border shadow-md ${surfaceClass}`}
      >
        <div className="hidden md:flex items-center gap-1.5 text-xs font-medium whitespace-nowrap px-1">
          {telemetry.proximity.mode === 'silent' ? (
            <VolumeX className="w-3.5 h-3.5 text-amber-500 shrink-0" aria-hidden="true" />
          ) : telemetry.proximity.mode === 'idle' ? (
            <Radio className="w-3.5 h-3.5 text-sky-500 shrink-0" aria-hidden="true" />
          ) : (
            <Volume2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" aria-hidden="true" />
          )}
          <span>{proximityText}</span>
          {udpBlocked && <span className="font-mono-tabular text-amber-500 font-semibold">· TURN:443</span>}
        </div>

        <button
          type="button"
          onClick={(e) => {
            onToggleAvatarMode();
            e.currentTarget.blur();
          }}
          aria-label={avatarMode === 'ship' ? '직원 보행 모드로 전환' : '선박 탑승 모드로 전환'}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
            avatarMode === 'humanoid'
              ? 'bg-emerald-700 hover:bg-emerald-600 text-white'
              : 'bg-sky-700 hover:bg-sky-600 text-white'
          }`}
        >
          {avatarMode === 'humanoid' ? '직원 보행' : '선박 탑승'}
        </button>

        <button
          type="button"
          onClick={(e) => {
            onCycleCamera();
            e.currentTarget.blur();
          }}
          aria-label={`카메라 시점 전환: 현재 ${CAMERA_LABEL[cameraPreset]}`}
          className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
            darkUi
              ? 'bg-slate-800 hover:bg-slate-700 text-slate-100'
              : 'bg-slate-100 hover:bg-slate-200 text-slate-900'
          }`}
        >
          <Camera className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{CAMERA_LABEL[cameraPreset]}</span>
        </button>

        <button
          type="button"
          onClick={(e) => {
            onCycleTimeOfDay();
            e.currentTarget.blur();
          }}
          aria-label={`조선소 조명 전환: 현재 ${TOD_LABEL[timeOfDay]}`}
          className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
            timeOfDay === 'night'
              ? 'bg-indigo-800 hover:bg-indigo-700 text-amber-200'
              : darkUi
                ? 'bg-slate-800 hover:bg-slate-700 text-amber-300'
                : 'bg-slate-100 hover:bg-slate-200 text-amber-700'
          }`}
        >
          {timeOfDay === 'night' ? (
            <Moon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          ) : timeOfDay === 'golden' ? (
            <Sunrise className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <Sun className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          )}
          <span className="hidden sm:inline">{TOD_LABEL[timeOfDay]}</span>
        </button>

        <button
          type="button"
          onClick={(e) => {
            onToggleDarkUi();
            e.currentTarget.blur();
          }}
          aria-label={darkUi ? '라이트 UI로 전환' : '다크 UI로 전환'}
          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
            darkUi
              ? 'bg-slate-800 hover:bg-slate-700 text-slate-200'
              : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
          }`}
        >
          {darkUi ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
};
