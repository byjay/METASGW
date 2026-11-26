import React, { useRef } from 'react';
import {
  Compass,
  DoorOpen,
  ExternalLink,
  Mic,
  MicOff,
  Navigation,
  Upload,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  ENGINEERING_MODULES,
  FLEET_SHIPS,
  type ActorRoleType,
  type ModuleId,
  type ShipId,
} from '../config/fleetConfig';
import type { AvatarMode } from '../scene/HarborScene';
import type { RpgActionState, VrmExpression } from '../scene/humanoidAvatar';
import type { LipSyncMode } from '../core/lipSyncEngine';
import type { PointCloudColorMode } from '../scene/pointCloudSystem';

interface ShipSelectorDrawerProps {
  activeShipId: ShipId;
  actorRole: ActorRoleType;
  avatarMode: AvatarMode;
  onChangeAvatarMode: (mode: AvatarMode) => void;
  vrmExpression: VrmExpression;
  onChangeExpression: (expr: VrmExpression) => void;
  manualAction: RpgActionState | null;
  onChangeManualAction: (action: RpgActionState | null) => void;
  vrmModelName: string;
  onUploadVrmFile: (file: File) => void;
  lipSyncMode: LipSyncMode;
  lipSyncVolume: number;
  onToggleMicLipSync: () => void;
  onToggleDemoVoice: () => void;
  onSelectShip: (shipId: ShipId) => void;
  onSailToModule: (moduleId: ModuleId) => void;
  onClose: () => void;
  darkUi: boolean;
}

export const ShipSelectorDrawer: React.FC<ShipSelectorDrawerProps> = ({
  activeShipId,
  actorRole,
  avatarMode,
  onChangeAvatarMode,
  vrmExpression,
  onChangeExpression,
  manualAction,
  onChangeManualAction,
  vrmModelName,
  onUploadVrmFile,
  lipSyncMode,
  lipSyncVolume,
  onToggleMicLipSync,
  onToggleDemoVoice,
  onSelectShip,
  onSailToModule,
  onClose,
  darkUi,
}) => {
  const vrmInputRef = useRef<HTMLInputElement | null>(null);
  const panelClass = darkUi
    ? 'bg-slate-950/96 text-slate-50 border-slate-700'
    : 'bg-white/98 text-slate-900 border-slate-300';
  const cardBase = darkUi ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200';
  const muted = darkUi ? 'text-slate-300' : 'text-slate-600';

  return (
    <div
      role="dialog"
      aria-label="3D RPG 직원 아바타 및 8종 선박 제어"
      className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-30 w-[min(920px,94vw)] max-h-[70vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden ${panelClass}`}
    >
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-700/40">
        <div>
          <h2 className="font-display font-bold text-base">
            3D 직원 아바타(VRM) · FFT 5모음 립싱크 & 8종 선박 탑승
          </h2>
          <p className={`text-xs mt-0.5 ${muted}`}>
            현재 아바타: {vrmModelName} · 신분 {actorRole === 'employee' ? '■ [본사]' : '◆ [협력]'}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="아바타 선택 닫기"
          className="p-2 rounded-lg hover:bg-slate-800/40 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* VRM Mode + .vrm/.glb Upload + Live FFT Lip-Sync Controls */}
      <div className="px-4 py-3 flex flex-wrap items-center gap-2 border-b border-slate-700/30">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onChangeAvatarMode('humanoid')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
              avatarMode === 'humanoid'
                ? 'bg-emerald-700 text-white'
                : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
          >
            직원 보행 (항구·건물내부)
          </button>
          <button
            type="button"
            onClick={() => onChangeAvatarMode('ship')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
              avatarMode === 'ship' ? 'bg-sky-700 text-white' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
          >
            8종 선박 항해
          </button>
        </div>

        <input
          ref={vrmInputRef}
          type="file"
          accept=".vrm,.glb,.gltf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUploadVrmFile(f);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => vrmInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-700 hover:bg-indigo-600 text-white text-xs font-semibold cursor-pointer"
        >
          <Upload className="w-3.5 h-3.5" aria-hidden="true" />
          <span>.vrm / .glb 불러오기</span>
        </button>

        <button
          type="button"
          onClick={onToggleMicLipSync}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
            lipSyncMode === 'mic'
              ? 'bg-rose-700 text-white'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
          }`}
        >
          {lipSyncMode === 'mic' ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
          <span>{lipSyncMode === 'mic' ? `마이크 립싱크 중 (${lipSyncVolume}%)` : '마이크 FFT 립싱크'}</span>
        </button>

        <button
          type="button"
          onClick={onToggleDemoVoice}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
            lipSyncMode === 'demo_voice'
              ? 'bg-amber-600 text-white'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
          }`}
        >
          <Volume2 className="w-3.5 h-3.5" />
          <span>{lipSyncMode === 'demo_voice' ? `5모음 음성 테스트 (${lipSyncVolume}%)` : '음성 립싱크 테스트'}</span>
        </button>
      </div>

      {/* Motion & Expression Strip */}
      <div className="px-4 py-2 flex flex-wrap items-center gap-2 border-b border-slate-700/30">
        <span className={`text-xs ${muted}`}>모션:</span>
        {(
          [
            ['idle', '대기'],
            ['work', '도면 작업'],
            ['talk', '대화 제스처'],
          ] as const
        ).map(([act, lbl]) => (
          <button
            key={act}
            type="button"
            onClick={() => onChangeManualAction(manualAction === act ? null : act)}
            className={`px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer ${
              manualAction === act ? 'bg-sky-600 text-white' : 'bg-slate-800/70 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {lbl}
          </button>
        ))}

        <span className={`text-xs ml-2 ${muted}`}>표정:</span>
        {(
          [
            ['neutral', '기본'],
            ['happy', 'Happy'],
            ['focus', 'Focus'],
            ['talk', 'A/I/U/E/O'],
          ] as const
        ).map(([expr, lbl]) => (
          <button
            key={expr}
            type="button"
            onClick={() => onChangeExpression(expr)}
            className={`px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer ${
              vrmExpression === expr ? 'bg-amber-600 text-white' : 'bg-slate-800/70 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {lbl}
          </button>
        ))}
      </div>

      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 overflow-y-auto meta-scroll">
        {FLEET_SHIPS.map((ship) => {
          const isCurrent = avatarMode === 'ship' && ship.id === activeShipId;
          const matchedModule = ENGINEERING_MODULES.find((m) => m.associatedShipId === ship.id);
          const role = ship.id === activeShipId ? actorRole : ship.defaultActorRole;
          return (
            <div
              key={ship.id}
              className={`rounded-xl border p-3.5 flex flex-col justify-between gap-2.5 transition-colors ${
                isCurrent ? 'border-sky-500 ring-1 ring-sky-500 ' + cardBase : cardBase
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display font-bold text-sm">{ship.name}</span>
                  <span
                    className={`text-[11px] font-semibold whitespace-nowrap ${
                      role === 'employee' ? 'text-sky-500' : 'text-amber-500'
                    }`}
                  >
                    {role === 'employee' ? '■ 본사' : '◆ 협력'}
                  </span>
                </div>
                <div className={`text-xs mt-0.5 ${muted}`}>
                  {ship.vesselType} · {ship.roleTitle}
                </div>
                <p className={`text-xs mt-2 leading-relaxed ${muted}`}>{ship.description}</p>
              </div>

              <div className="flex items-center gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => onSelectShip(ship.id)}
                  className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    isCurrent
                      ? 'bg-sky-700 text-white'
                      : darkUi
                        ? 'bg-slate-800 hover:bg-slate-700 text-slate-100'
                        : 'bg-slate-200 hover:bg-slate-300 text-slate-900'
                  }`}
                >
                  {isCurrent ? '탑승 조종 중' : '선박 탑승'}
                </button>
                {matchedModule && (
                  <button
                    type="button"
                    onClick={() => {
                      onSailToModule(matchedModule.moduleId);
                      onClose();
                    }}
                    aria-label={`${ship.name} 담당 ${matchedModule.shortName} 이동`}
                    className="p-1.5 rounded-lg bg-sky-600/20 hover:bg-sky-600/35 text-sky-400 cursor-pointer"
                    title="담당 구역으로 이동"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface ModuleCatalogDrawerProps {
  actorRole: ActorRoleType;
  pointCloudLabel: string;
  pointCloudColorMode: PointCloudColorMode;
  onChangePointCloudColorMode: (mode: PointCloudColorMode) => void;
  onUploadPointCloudFile: (file: File) => void;
  onOpenModule: (moduleId: ModuleId) => void;
  onWalkIntoBuilding: (moduleId: ModuleId) => void;
  onSailToModule: (moduleId: ModuleId) => void;
  onClose: () => void;
  darkUi: boolean;
}

export const ModuleCatalogDrawer: React.FC<ModuleCatalogDrawerProps> = ({
  actorRole,
  pointCloudLabel,
  pointCloudColorMode,
  onChangePointCloudColorMode,
  onUploadPointCloudFile,
  onOpenModule,
  onWalkIntoBuilding,
  onSailToModule,
  onClose,
  darkUi,
}) => {
  const pcInputRef = useRef<HTMLInputElement | null>(null);
  const panelClass = darkUi
    ? 'bg-slate-950/96 text-slate-50 border-slate-700'
    : 'bg-white/98 text-slate-900 border-slate-300';
  const cardBase = darkUi ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200';
  const muted = darkUi ? 'text-slate-300' : 'text-slate-600';

  return (
    <div
      role="dialog"
      aria-label="엔지니어링 건물 및 3D 점군 관리"
      className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-30 w-[min(900px,94vw)] max-h-[70vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden ${panelClass}`}
    >
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-700/40">
        <div>
          <h2 className="font-display font-bold text-base">
            6대 엔지니어링 워크인 건물 · FARO 3D 점군 스트리밍
          </h2>
          <p className={`text-xs mt-0.5 ${muted}`}>
            모든 건물 정문으로 걸어 들어가면 지붕이 자동으로 열리며 실내 작업대가 표시됩니다.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="모듈 목록 닫기"
          className="p-2 rounded-lg hover:bg-slate-800/40 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Native 3D FARO LiDAR Point Cloud Upload & Color Mode Controls */}
      <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/30">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold text-sky-400">3D 점군:</span>
          <span className={`font-mono-tabular ${muted}`}>{pointCloudLabel}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              ['elevation', '고도'],
              ['intensity', '강도'],
              ['classification', '선체 분류'],
            ] as const
          ).map(([mode, lbl]) => (
            <button
              key={mode}
              type="button"
              onClick={() => onChangePointCloudColorMode(mode)}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer ${
                pointCloudColorMode === mode
                  ? 'bg-sky-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {lbl}
            </button>
          ))}
          <input
            ref={pcInputRef}
            type="file"
            accept=".ply,.xyz,.pts,.txt"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUploadPointCloudFile(f);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => pcInputRef.current?.click()}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" aria-hidden="true" />
            <span>.ply / .xyz 업로드</span>
          </button>
        </div>
      </div>

      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 overflow-y-auto meta-scroll">
        {ENGINEERING_MODULES.map((mod) => {
          const policyHint =
            actorRole === 'partner'
              ? mod.moduleId === 'faro360'
                ? 'ViewerFX 자동 분기 (.e57/.las/.laz)'
                : mod.partnerPolicy.watermark
                  ? `읽기 전용 · 워터마크 (${mod.partnerPolicy.targetDomain})`
                  : `제한 열람 (${mod.partnerPolicy.targetDomain})`
              : `본사 SSO 전체 권한 (${mod.ssoEndpoint})`;

          return (
            <div key={mod.moduleId} className={`rounded-xl border p-4 flex flex-col justify-between gap-3 ${cardBase}`}>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display font-bold text-sm">{mod.displayName}</h3>
                  {mod.silent && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-500 whitespace-nowrap">
                      <VolumeX className="w-3 h-3" /> 정숙
                    </span>
                  )}
                </div>
                <p className={`text-xs mt-1.5 leading-relaxed ${muted}`}>{mod.summary}</p>
                <div className="mt-2 text-[11px] font-mono-tabular text-sky-500">{policyHint}</div>
              </div>

              <div className="flex items-center gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    onWalkIntoBuilding(mod.moduleId);
                    onClose();
                  }}
                  className="flex-1 inline-flex items-center justify-center gap-1 py-2 px-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                >
                  <DoorOpen className="w-3.5 h-3.5" />
                  <span>실내 입장</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onOpenModule(mod.moduleId);
                    onClose();
                  }}
                  className="inline-flex items-center justify-center gap-1 py-2 px-2.5 rounded-lg bg-sky-700 hover:bg-sky-600 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>모듈</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSailToModule(mod.moduleId);
                    onClose();
                  }}
                  aria-label={`${mod.displayName} 부두 항해`}
                  className={`inline-flex items-center justify-center p-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    darkUi
                      ? 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                      : 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                  }`}
                  title="선박으로 부두 항해"
                >
                  <Compass className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
