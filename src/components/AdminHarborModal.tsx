import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Anchor,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  BookmarkPlus,
  CheckCircle2,
  Compass,
  ExternalLink,
  Layers,
  PackageCheck,
  PlusCircle,
  Radio,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Shield,
  Ship,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { isSafeNavigationUrl, SGW_PORTAL_LINKS } from '../deepLink';
import type { HarborShip } from '../mapping';
import {
  runSgwTwoWayVerification,
  type SgwTwoWayVerificationReport,
} from '../meta/sgwTwoWayVerifier';
import type { RuntimeEnv } from '../runtimeEnv';
import type { VesselSilhouetteId } from '../scene/projectVesselTypes';
import { HOME_HARBOR_DECORATIVE_VESSELS } from '../scene/sceneryCatalog';
import {
  BUILTIN_SHIP_ASSET_CATALOG,
  getVesselAssetMeta,
  mergeShipAssetLibrary,
  resolveProjectShipSilhouette,
} from '../shipAssetCatalog';
import {
  MAX_SHIP_NAME_LENGTH,
  type AddedProjectShipRecord,
  type SavedShipAssetRecord,
  type ShipDisplayPrefsMap,
} from '../shipDisplayPrefs';

export type AdminHarborTab = 'ships' | 'assets' | 'verify';

export interface AdminHarborModalProps {
  open: boolean;
  initialTab?: AdminHarborTab;
  initialShipId?: string | null;
  runtimeEnv: RuntimeEnv;
  ships: HarborShip[];
  shipDisplayPrefs: ShipDisplayPrefsMap;
  savedShipAssets: SavedShipAssetRecord[];
  addedProjectShips: AddedProjectShipRecord[];
  rotationWarning?: string | null;
  onRenameShip: (shipId: string, rawName: string) => { ok: boolean; reason?: string };
  onRotateShipStep: (shipId: string, deltaSteps: number) => void;
  onRotateShipAbsolute: (shipId: string, nextYawDeg: number) => void;
  onSnapShipParallel: (shipId: string) => void;
  onChangeShipAsset: (shipId: string, vesselType: VesselSilhouetteId) => void;
  onSaveShipAsAsset: (shipId: string) => void;
  onSaveAllShipsAsAssets: () => void;
  onAddProjectFromAsset: (input: {
    asset: SavedShipAssetRecord;
    projectId: string;
    projectCode: string;
    projectName: string;
    role: string;
    status: 'active' | 'review' | 'hold' | 'completed';
  }) => { ok: boolean; reason?: string };
  onRemoveAddedProject: (projectId: string) => void;
  onBoardShip?: (shipId: string) => void;
  onOpenExternalAdmin?: () => void;
  onClose: () => void;
}

interface EditableHarborShipItem {
  id: string;
  kind: 'project' | 'decorative';
  defaultName: string;
  subtitle: string;
  defaultYawDeg: number;
  silhouette: VesselSilhouetteId;
  code?: string;
}

export const AdminHarborModal: React.FC<AdminHarborModalProps> = ({
  open,
  initialTab = 'ships',
  initialShipId = null,
  runtimeEnv,
  ships,
  shipDisplayPrefs,
  savedShipAssets,
  addedProjectShips,
  rotationWarning = null,
  onRenameShip,
  onRotateShipStep,
  onRotateShipAbsolute,
  onSnapShipParallel,
  onChangeShipAsset,
  onSaveShipAsAsset,
  onSaveAllShipsAsAssets,
  onAddProjectFromAsset,
  onRemoveAddedProject,
  onBoardShip,
  onOpenExternalAdmin,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<AdminHarborTab>(initialTab);
  const [selectedShipId, setSelectedShipId] = useState<string>('');
  const [nameDraft, setNameDraft] = useState<string>('');
  const [nameError, setNameError] = useState<string | null>(null);

  // Asset -> Project form state
  const assetLibrary = useMemo(
    () => mergeShipAssetLibrary(savedShipAssets),
    [savedShipAssets],
  );
  const [selectedAssetId, setSelectedAssetId] = useState<string>('');
  const [projectIdDraft, setProjectIdDraft] = useState<string>('');
  const [projectCodeDraft, setProjectCodeDraft] = useState<string>('');
  const [projectNameDraft, setProjectNameDraft] = useState<string>('');
  const [projectRoleDraft, setProjectRoleDraft] = useState<string>('manager');
  const [projectStatusDraft, setProjectStatusDraft] = useState<
    'active' | 'review' | 'hold' | 'completed'
  >('active');
  const [addProjectError, setAddProjectError] = useState<string | null>(null);

  // SGW API Two-Way Verification state
  const [verifyProjectId, setVerifyProjectId] = useState<string>('');
  const [verifyRunning, setVerifyRunning] = useState<boolean>(false);
  const [verifyReport, setVerifyReport] = useState<SgwTwoWayVerificationReport | null>(null);

  const editableShips = useMemo<EditableHarborShipItem[]>(() => {
    const projectItems: EditableHarborShipItem[] = ships.map((ship) => ({
      id: ship.id,
      kind: 'project',
      defaultName: ship.name,
      subtitle: `${ship.code} · ${ship.berthLabel} · ${ship.appearance.statusLabelKo}`,
      defaultYawDeg: 90,
      silhouette: resolveProjectShipSilhouette(
        ship.id,
        ship.hullStyleIndex,
        shipDisplayPrefs,
        addedProjectShips,
      ),
      code: ship.code,
    }));
    const decoItems: EditableHarborShipItem[] = HOME_HARBOR_DECORATIVE_VESSELS.map((spec) => ({
      id: spec.id,
      kind: 'decorative',
      defaultName: spec.defaultName,
      subtitle: `${spec.subtitle} · 장식 선박`,
      defaultYawDeg: spec.defaultYawDeg,
      silhouette: spec.vesselType,
    }));
    return [...projectItems, ...decoItems];
  }, [ships, shipDisplayPrefs, addedProjectShips]);

  useEffect(() => {
    if (!open) return;
    setActiveTab(initialTab);
    const defaultId =
      (initialShipId && editableShips.some((s) => s.id === initialShipId) && initialShipId) ||
      editableShips[0]?.id ||
      '';
    setSelectedShipId(defaultId);
    setVerifyProjectId(ships[0]?.id ?? 'proj01');
  }, [open, initialTab, initialShipId]);

  const selectedShip = useMemo(
    () => editableShips.find((s) => s.id === selectedShipId) ?? editableShips[0] ?? null,
    [editableShips, selectedShipId],
  );

  useEffect(() => {
    if (!selectedShip) return;
    const savedCustom = shipDisplayPrefs[selectedShip.id]?.customName;
    setNameDraft(savedCustom ?? selectedShip.defaultName);
    setNameError(null);
  }, [selectedShip?.id, shipDisplayPrefs]);

  useEffect(() => {
    if (!selectedAssetId && assetLibrary.length > 0) {
      setSelectedAssetId(assetLibrary[0].assetId);
    }
  }, [assetLibrary, selectedAssetId]);

  const selectedAsset = useMemo(
    () => assetLibrary.find((a) => a.assetId === selectedAssetId) ?? assetLibrary[0] ?? null,
    [assetLibrary, selectedAssetId],
  );

  const runVerificationNow = async (targetPid?: string) => {
    setVerifyRunning(true);
    try {
      const report = await runSgwTwoWayVerification({
        runtimeEnv,
        projectId: targetPid ?? verifyProjectId ?? ships[0]?.id ?? 'proj01',
      });
      setVerifyReport(report);
    } finally {
      setVerifyRunning(false);
    }
  };

  useEffect(() => {
    if (open && activeTab === 'verify' && !verifyReport && !verifyRunning) {
      void runVerificationNow();
    }
  }, [open, activeTab]);

  if (!open) return null;

  const currentYawDeg = selectedShip
    ? shipDisplayPrefs[selectedShip.id]?.yawDeg ?? selectedShip.defaultYawDeg
    : 90;

  const handleSelectAssetForProject = (asset: SavedShipAssetRecord) => {
    setSelectedAssetId(asset.assetId);
    setAddProjectError(null);
    const seq = String(ships.length + 1).padStart(2, '0');
    const shortType = asset.vesselType.split('_')[0].slice(0, 6).toLowerCase();
    setProjectIdDraft(`proj-${shortType}-${seq}`);
    setProjectCodeDraft(`VSL-${seq}`);
    setProjectNameDraft(`${asset.name.replace(/\s*에셋$/, '')} 프로젝트`);
  };

  const handleSubmitRename = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedShip) return;
    const res = onRenameShip(selectedShip.id, nameDraft);
    if (!res.ok) {
      setNameError(res.reason ?? '선박 이름을 저장할 수 없습니다.');
    } else {
      setNameError(null);
    }
  };

  const handleSubmitAddProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAsset) return;
    const seq = String(ships.length + 1).padStart(2, '0');
    const finalId = projectIdDraft.trim() || `proj-vessel-${seq}`;
    const finalCode = projectCodeDraft.trim() || `VSL-${seq}`;
    const finalName = projectNameDraft.trim() || `${selectedAsset.name} 프로젝트`;
    const res = onAddProjectFromAsset({
      asset: selectedAsset,
      projectId: finalId,
      projectCode: finalCode,
      projectName: finalName,
      role: projectRoleDraft,
      status: projectStatusDraft,
    });
    if (!res.ok) {
      setAddProjectError(res.reason ?? '프로젝트를 추가할 수 없습니다.');
    } else {
      setAddProjectError(null);
      setProjectIdDraft('');
      setProjectCodeDraft('');
      setProjectNameDraft('');
    }
  };

  const safeAdminHref = isSafeNavigationUrl(SGW_PORTAL_LINKS.admin)
    ? SGW_PORTAL_LINKS.admin
    : '/';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-harbor-modal-title"
      data-testid="admin-harbor-modal"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-4xl max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 text-slate-100 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/90 px-4 py-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-amber-400/50 bg-amber-950/75 text-amber-300">
              <Shield className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2
                id="admin-harbor-modal-title"
                className="truncate text-sm sm:text-base font-bold text-white"
              >
                항구 관리자 메뉴
              </h2>
              <p className="truncate text-[11px] text-slate-300">
                선박 정보 변경 · 모든 배 에셋 저장 및 프로젝트 추가 · SGW API 상호 교신 검증
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {runtimeEnv === 'sgw' ? (
              <a
                href={safeAdminHref}
                aria-label="SGW 외부 관리자 포털 열기"
                className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-100 hover:bg-slate-700"
              >
                <span>SGW 관리자</span>
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            ) : (
              onOpenExternalAdmin && (
                <button
                  type="button"
                  onClick={onOpenExternalAdmin}
                  aria-label="SGW 외부 관리자 경로 안내 보기"
                  className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                >
                  <span>/admin/ 경로 안내</span>
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </button>
              )
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="항구 관리자 메뉴 닫기"
              className="inline-flex min-h-[32px] min-w-[32px] items-center justify-center rounded-lg border border-slate-700 bg-slate-900 p-1.5 text-slate-200 hover:bg-slate-800 hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Tab Bar */}
        <div
          role="tablist"
          aria-label="관리자 기능 탭"
          className="grid grid-cols-3 gap-1.5 border-b border-slate-800 bg-slate-950 px-4 py-2"
        >
          <button
            type="button"
            role="tab"
            data-testid="admin-tab-ships"
            aria-selected={activeTab === 'ships'}
            aria-label="선박 정보 변경 탭"
            onClick={() => setActiveTab('ships')}
            className={`inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-xl px-2 py-1.5 text-xs font-bold transition focus-visible:outline-2 focus-visible:outline-sky-400 ${
              activeTab === 'ships'
                ? 'bg-sky-700 text-white shadow'
                : 'border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Ship className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">선박 정보 변경</span>
          </button>
          <button
            type="button"
            role="tab"
            data-testid="admin-tab-assets"
            aria-selected={activeTab === 'assets'}
            aria-label="에셋 저장 및 프로젝트 추가 탭"
            onClick={() => setActiveTab('assets')}
            className={`inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-xl px-2 py-1.5 text-xs font-bold transition focus-visible:outline-2 focus-visible:outline-sky-400 ${
              activeTab === 'assets'
                ? 'bg-sky-700 text-white shadow'
                : 'border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Layers className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">에셋 · 프로젝트 추가</span>
          </button>
          <button
            type="button"
            role="tab"
            data-testid="admin-tab-verify"
            aria-selected={activeTab === 'verify'}
            aria-label="SGW API 연동 검증 탭"
            onClick={() => setActiveTab('verify')}
            className={`inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-xl px-2 py-1.5 text-xs font-bold transition focus-visible:outline-2 focus-visible:outline-sky-400 ${
              activeTab === 'verify'
                ? 'bg-emerald-700 text-white shadow'
                : 'border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Radio className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">SGW API 검증</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* TAB 1: SHIP INFO EDITOR */}
          {activeTab === 'ships' && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-12" data-testid="admin-ships-panel">
              {/* Left: All Harbor Ships Picker */}
              <div className="md:col-span-5 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-200">
                    항구 선박 목록 ({editableShips.length}척)
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    프로젝트 {ships.length} · 장식 {HOME_HARBOR_DECORATIVE_VESSELS.length}
                  </span>
                </div>
                <div className="max-h-[380px] space-y-1.5 overflow-y-auto pr-1">
                  {editableShips.map((item) => {
                    const active = selectedShip?.id === item.id;
                    const displayName = shipDisplayPrefs[item.id]?.customName || item.defaultName;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        data-testid={`admin-ship-item-${item.id}`}
                        aria-label={`${displayName} 선박 편집 선택`}
                        onClick={() => setSelectedShipId(item.id)}
                        className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition focus-visible:outline-2 focus-visible:outline-sky-400 ${
                          active
                            ? 'border-sky-400 bg-sky-950/75 text-white'
                            : 'border-slate-800 bg-slate-900/90 text-slate-200 hover:border-slate-600 hover:bg-slate-800'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                item.kind === 'project'
                                  ? 'bg-sky-900 text-sky-200'
                                  : 'bg-amber-950 text-amber-200'
                              }`}
                            >
                              {item.kind === 'project' ? '프로젝트' : '장식'}
                            </span>
                            <span className="truncate text-xs font-bold">{displayName}</span>
                          </div>
                          <p className="mt-0.5 truncate text-[11px] text-slate-400">
                            {item.subtitle}
                          </p>
                        </div>
                        <span className="shrink-0 font-mono text-[11px] text-slate-300">
                          {Math.round(shipDisplayPrefs[item.id]?.yawDeg ?? item.defaultYawDeg)}°
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right: Selected Ship Editor */}
              <div className="md:col-span-7 space-y-3">
                {selectedShip ? (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/80 p-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-bold text-white">
                          {shipDisplayPrefs[selectedShip.id]?.customName || selectedShip.defaultName}
                        </h3>
                        <p className="truncate text-[11px] text-slate-300">
                          원래 이름: {selectedShip.defaultName} · 선종:{' '}
                          {getVesselAssetMeta(selectedShip.silhouette).labelKo}
                        </p>
                      </div>
                      <button
                        type="button"
                        data-testid="admin-save-single-asset-btn"
                        aria-label={`${selectedShip.defaultName} 선박을 재사용 에셋으로 저장`}
                        onClick={() => onSaveShipAsAsset(selectedShip.id)}
                        className="inline-flex min-h-[34px] items-center gap-1.5 rounded-xl border border-emerald-500/60 bg-emerald-950/75 px-3 py-1.5 text-xs font-bold text-emerald-100 hover:bg-emerald-900 focus-visible:outline-2 focus-visible:outline-sky-400"
                      >
                        <BookmarkPlus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span>이 배를 에셋으로 저장</span>
                      </button>
                    </div>

                    {/* 1. Rename Ship */}
                    <form
                      onSubmit={handleSubmitRename}
                      className="rounded-xl border border-slate-800 bg-slate-900/80 p-3 space-y-2"
                      data-testid="admin-ship-rename-form"
                    >
                      <label
                        htmlFor="admin-ship-name-input"
                        className="block text-xs font-bold text-slate-200"
                      >
                        1) 선박 표시 이름 변경 (최대 {MAX_SHIP_NAME_LENGTH}자)
                      </label>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          id="admin-ship-name-input"
                          data-testid="admin-ship-name-input"
                          type="text"
                          maxLength={MAX_SHIP_NAME_LENGTH}
                          value={nameDraft}
                          onChange={(e) => {
                            setNameDraft(e.target.value);
                            setNameError(null);
                          }}
                          placeholder={selectedShip.defaultName}
                          className="flex-1 rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
                        />
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              onRenameShip(selectedShip.id, '');
                              setNameDraft(selectedShip.defaultName);
                              setNameError(null);
                            }}
                            aria-label="원래 선박 이름으로 초기화"
                            className="min-h-[34px] rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-700"
                          >
                            초기화
                          </button>
                          <button
                            type="submit"
                            data-testid="admin-ship-rename-submit"
                            aria-label="변경된 선박 이름 저장"
                            className="min-h-[34px] rounded-lg bg-sky-700 px-3 py-1 text-xs font-bold text-white hover:bg-sky-600"
                          >
                            이름 저장
                          </button>
                        </div>
                      </div>
                      {nameError && (
                        <p className="text-[11px] font-semibold text-rose-300" role="alert">
                          {nameError}
                        </p>
                      )}
                    </form>

                    {/* 2. Rotate Ship (Collision-checked) */}
                    <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-200">
                          2) 정박 방향 변경 (15° 단위 · OBB 충돌 자동 검사)
                        </span>
                        <span
                          data-testid="admin-ship-yaw-readout"
                          className="font-mono text-xs font-bold text-amber-300"
                        >
                          {Math.round(currentYawDeg)}°
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={345}
                        step={15}
                        value={Math.round(currentYawDeg) % 360}
                        aria-label="선박 정박 각도 조절 슬라이더"
                        onChange={(e) =>
                          onRotateShipAbsolute(selectedShip.id, Number(e.target.value))
                        }
                        className="w-full accent-sky-400 cursor-pointer"
                      />
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          data-testid="admin-ship-rotate-ccw"
                          aria-label="선박 반시계 방향 15도 회전"
                          onClick={() => onRotateShipStep(selectedShip.id, -1)}
                          className="inline-flex min-h-[34px] items-center justify-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs font-semibold text-slate-100 hover:bg-slate-700"
                        >
                          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>-15°</span>
                        </button>
                        <button
                          type="button"
                          data-testid="admin-ship-rotate-cw"
                          aria-label="선박 시계 방향 15도 회전"
                          onClick={() => onRotateShipStep(selectedShip.id, 1)}
                          className="inline-flex min-h-[34px] items-center justify-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs font-semibold text-slate-100 hover:bg-slate-700"
                        >
                          <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>+15°</span>
                        </button>
                        <button
                          type="button"
                          data-testid="admin-ship-snap-quay"
                          aria-label="가장 가까운 안벽과 평행하게 정렬"
                          onClick={() => onSnapShipParallel(selectedShip.id)}
                          className="inline-flex min-h-[34px] items-center justify-center gap-1 rounded-lg bg-sky-700 px-2 py-1 text-xs font-bold text-white hover:bg-sky-600"
                        >
                          <Compass className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>안벽 정렬</span>
                        </button>
                      </div>
                      {rotationWarning && (
                        <div
                          role="alert"
                          className="flex items-start gap-1.5 rounded-lg border border-rose-500/60 bg-rose-950/75 px-2.5 py-1.5 text-[11px] text-rose-200"
                        >
                          <AlertTriangle
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400"
                            aria-hidden="true"
                          />
                          <span>{rotationWarning}</span>
                        </div>
                      )}
                    </div>

                    {/* 3. Swap 3D Vessel Asset Model (Project ships) */}
                    {selectedShip.kind === 'project' && (
                      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3 space-y-2">
                        <p className="text-xs font-bold text-slate-200">
                          3) 3D 선박 모델 에셋 변경 ({BUILTIN_SHIP_ASSET_CATALOG.length}종)
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                          {BUILTIN_SHIP_ASSET_CATALOG.map((meta) => {
                            const isCurrent = selectedShip.silhouette === meta.vesselType;
                            return (
                              <button
                                key={meta.vesselType}
                                type="button"
                                data-testid={`admin-vessel-type-${meta.vesselType}`}
                                aria-label={`${meta.labelKo} 3D 선박 모델 적용`}
                                aria-pressed={isCurrent}
                                onClick={() =>
                                  onChangeShipAsset(selectedShip.id, meta.vesselType)
                                }
                                className={`rounded-lg border px-2.5 py-1.5 text-left text-[11px] transition focus-visible:outline-2 focus-visible:outline-sky-400 ${
                                  isCurrent
                                    ? 'border-sky-400 bg-sky-900/80 font-bold text-white'
                                    : 'border-slate-700 bg-slate-950 text-slate-200 hover:border-slate-500 hover:bg-slate-800'
                                }`}
                              >
                                <div className="truncate font-semibold">{meta.labelKo}</div>
                                <div className="truncate text-[10px] text-slate-400">
                                  {meta.categoryKo}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-slate-400">편집할 선박이 없습니다.</p>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: SAVE ALL SHIPS AS ASSETS & ADD ASSET AS PROJECT */}
          {activeTab === 'assets' && (
            <div className="space-y-4" data-testid="admin-assets-panel">
              {/* Top Bulk Save Banner */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/45 bg-emerald-950/35 p-3.5">
                <div className="min-w-0">
                  <h3 className="text-xs sm:text-sm font-bold text-emerald-100">
                    항구의 모든 선박을 에셋 라이브러리로 일괄 저장
                  </h3>
                  <p className="mt-0.5 text-[11px] text-slate-300">
                    현재 프로젝트 선박 {ships.length}척 + 대표/장식 선박{' '}
                    {HOME_HARBOR_DECORATIVE_VESSELS.length}척을 모두 재사용 에셋으로 저장하고,
                    원하는 에셋을 새 프로젝트 선박으로 항구에 추가할 수 있습니다.
                  </p>
                </div>
                <button
                  type="button"
                  data-testid="admin-save-all-assets-btn"
                  aria-label="항구의 모든 배를 에셋으로 일괄 저장"
                  onClick={onSaveAllShipsAsAssets}
                  className="inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-xl bg-emerald-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-600 focus-visible:outline-2 focus-visible:outline-sky-400"
                >
                  <PackageCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>항구 모든 배 에셋 일괄 저장</span>
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
                {/* Left: Saved & Built-in Ship Asset Library */}
                <div className="md:col-span-7 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-200">
                      저장된 선박 에셋 라이브러리 ({assetLibrary.length}개)
                    </h4>
                    <span className="text-[11px] text-slate-400">
                      기본 선종 13종 + 저장 에셋 {savedShipAssets.length}개
                    </span>
                  </div>
                  <div className="grid max-h-[340px] grid-cols-1 sm:grid-cols-2 gap-2 overflow-y-auto pr-1">
                    {assetLibrary.map((asset) => {
                      const active = selectedAsset?.assetId === asset.assetId;
                      const meta = getVesselAssetMeta(asset.vesselType);
                      return (
                        <button
                          key={asset.assetId}
                          type="button"
                          data-testid={`ship-asset-card-${asset.assetId}`}
                          aria-label={`${asset.name} 선박 에셋 선택`}
                          aria-pressed={active}
                          onClick={() => handleSelectAssetForProject(asset)}
                          className={`rounded-xl border p-2.5 text-left transition focus-visible:outline-2 focus-visible:outline-sky-400 ${
                            active
                              ? 'border-sky-400 bg-sky-950/75 text-white'
                              : 'border-slate-800 bg-slate-900/85 text-slate-200 hover:border-slate-600 hover:bg-slate-800'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="truncate text-xs font-bold">{asset.name}</span>
                            <span
                              className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                asset.sourceKind === 'builtin'
                                  ? 'bg-slate-800 text-slate-300'
                                  : asset.sourceKind === 'project'
                                    ? 'bg-sky-900 text-sky-200'
                                    : 'bg-amber-950 text-amber-200'
                              }`}
                            >
                              {asset.sourceKind === 'builtin'
                                ? '기본 에셋'
                                : asset.sourceKind === 'project'
                                  ? '프로젝트 저장'
                                  : '항구 선박 저장'}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-[11px] text-sky-300">
                            {meta.labelKo} · {meta.categoryKo}
                          </p>
                          {asset.note && (
                            <p className="mt-0.5 truncate text-[10px] text-slate-400">
                              {asset.note}
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Right: Spawn Selected Asset as New Harbor Project */}
                <div className="md:col-span-5 space-y-3">
                  <form
                    onSubmit={handleSubmitAddProject}
                    data-testid="admin-add-project-form"
                    className="rounded-xl border border-slate-700 bg-slate-900/90 p-3.5 space-y-2.5"
                  >
                    <div className="flex items-center gap-1.5">
                      <PlusCircle className="h-4 w-4 text-sky-400 shrink-0" aria-hidden="true" />
                      <h4 className="text-xs font-bold text-white">선택 에셋을 프로젝트로 추가</h4>
                    </div>
                    {selectedAsset && (
                      <div className="rounded-lg border border-sky-500/40 bg-sky-950/45 px-2.5 py-1.5 text-[11px] text-sky-100">
                        선택 에셋: <strong>{selectedAsset.name}</strong> (
                        {getVesselAssetMeta(selectedAsset.vesselType).labelKo})
                      </div>
                    )}

                    <div className="space-y-1">
                      <label
                        htmlFor="new-project-id"
                        className="block text-[11px] font-semibold text-slate-300"
                      >
                        프로젝트 ID (영문/숫자/-/_)
                      </label>
                      <input
                        id="new-project-id"
                        data-testid="new-project-id-input"
                        type="text"
                        value={projectIdDraft}
                        onChange={(e) => {
                          setProjectIdDraft(e.target.value);
                          setAddProjectError(null);
                        }}
                        placeholder={`proj-vessel-${String(ships.length + 1).padStart(2, '0')}`}
                        className="w-full rounded-lg border border-slate-600 bg-slate-950 px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label
                          htmlFor="new-project-code"
                          className="block text-[11px] font-semibold text-slate-300"
                        >
                          프로젝트 코드
                        </label>
                        <input
                          id="new-project-code"
                          data-testid="new-project-code-input"
                          type="text"
                          value={projectCodeDraft}
                          onChange={(e) => setProjectCodeDraft(e.target.value)}
                          placeholder={`VSL-${String(ships.length + 1).padStart(2, '0')}`}
                          className="w-full rounded-lg border border-slate-600 bg-slate-950 px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label
                          htmlFor="new-project-status"
                          className="block text-[11px] font-semibold text-slate-300"
                        >
                          진행 상태
                        </label>
                        <select
                          id="new-project-status"
                          value={projectStatusDraft}
                          onChange={(e) =>
                            setProjectStatusDraft(
                              e.target.value as 'active' | 'review' | 'hold' | 'completed',
                            )
                          }
                          className="w-full rounded-lg border border-slate-600 bg-slate-950 px-2 py-1.5 text-xs text-white focus:border-sky-400 focus:outline-none"
                        >
                          <option value="active">진행 중 (active)</option>
                          <option value="review">검토 중 (review)</option>
                          <option value="hold">보류 (hold)</option>
                          <option value="completed">완료 (completed)</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label
                        htmlFor="new-project-name"
                        className="block text-[11px] font-semibold text-slate-300"
                      >
                        프로젝트 선박 이름
                      </label>
                      <input
                        id="new-project-name"
                        data-testid="new-project-name-input"
                        type="text"
                        maxLength={MAX_SHIP_NAME_LENGTH}
                        value={projectNameDraft}
                        onChange={(e) => {
                          setProjectNameDraft(e.target.value);
                          setAddProjectError(null);
                        }}
                        placeholder="신규 프로젝트 선박명 입력"
                        className="w-full rounded-lg border border-slate-600 bg-slate-950 px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label
                        htmlFor="new-project-role"
                        className="block text-[11px] font-semibold text-slate-300"
                      >
                        담당 역할
                      </label>
                      <select
                        id="new-project-role"
                        value={projectRoleDraft}
                        onChange={(e) => setProjectRoleDraft(e.target.value)}
                        className="w-full rounded-lg border border-slate-600 bg-slate-950 px-2 py-1.5 text-xs text-white focus:border-sky-400 focus:outline-none"
                      >
                        <option value="manager">manager (관리)</option>
                        <option value="designer">designer (설계)</option>
                        <option value="reviewer">reviewer (검토)</option>
                        <option value="viewer">viewer (열람)</option>
                      </select>
                    </div>

                    {addProjectError && (
                      <p className="text-[11px] font-semibold text-rose-300" role="alert">
                        {addProjectError}
                      </p>
                    )}

                    <button
                      type="submit"
                      data-testid="admin-add-project-submit"
                      aria-label="선택한 선박 에셋을 항구 프로젝트로 추가"
                      className="inline-flex w-full min-h-[38px] items-center justify-center gap-1.5 rounded-xl bg-sky-700 px-3 py-2 text-xs font-bold text-white hover:bg-sky-600 focus-visible:outline-2 focus-visible:outline-sky-400"
                    >
                      <PlusCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>프로젝트 선박으로 항구에 추가</span>
                    </button>
                  </form>

                  {/* Added Projects List */}
                  {addedProjectShips.length > 0 && (
                    <div
                      className="rounded-xl border border-slate-800 bg-slate-900/80 p-3 space-y-2"
                      data-testid="admin-added-projects-list"
                    >
                      <h5 className="text-[11px] font-bold text-slate-200">
                        에셋으로 추가된 프로젝트 ({addedProjectShips.length}척)
                      </h5>
                      <div className="space-y-1.5">
                        {addedProjectShips.map((proj) => (
                          <div
                            key={proj.id}
                            className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs"
                          >
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-white">{proj.name}</p>
                              <p className="truncate text-[10px] text-slate-400">
                                {proj.code} · {getVesselAssetMeta(proj.vesselType).labelKo}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {onBoardShip && (
                                <button
                                  type="button"
                                  aria-label={`${proj.name} 프로젝트 승선`}
                                  onClick={() => {
                                    onClose();
                                    onBoardShip(proj.id);
                                  }}
                                  className="rounded-md border border-sky-500/50 bg-sky-950/75 px-2 py-1 text-[10px] font-bold text-sky-100 hover:bg-sky-900"
                                >
                                  <Anchor className="inline h-3 w-3 mr-0.5" aria-hidden="true" />
                                  진입
                                </button>
                              )}
                              <button
                                type="button"
                                aria-label={`${proj.name} 추가 프로젝트 삭제`}
                                onClick={() => onRemoveAddedProject(proj.id)}
                                className="rounded-md border border-rose-500/50 bg-rose-950/70 p-1 text-rose-200 hover:bg-rose-900"
                              >
                                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SGW API INTEGRATION & TWO-WAY COMMUNICATION VERIFIER */}
          {activeTab === 'verify' && (
            <div className="space-y-3.5" data-testid="admin-sgw-verify-panel">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/85 p-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white">
                      SGW API 연동 · 상호 교신 자동 검증 (11개 엔드포인트)
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        runtimeEnv === 'sgw'
                          ? 'bg-emerald-950 text-emerald-200 border border-emerald-500/50'
                          : 'bg-amber-950 text-amber-200 border border-amber-500/50'
                      }`}
                    >
                      {runtimeEnv === 'sgw' ? 'SGW 운영 실통신' : 'Preview 계약 시뮬레이션'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    동일 오리진 쿠키 인증 · Authorization 헤더 0건 · 송신(POST /api/presence) →
                    수신(GET /api/presence) 반영 · 허브 강제 갱신(?refresh=1) 왕복 검증
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    aria-label="검증 기준 프로젝트 선택"
                    value={verifyProjectId}
                    onChange={(e) => setVerifyProjectId(e.target.value)}
                    className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white"
                  >
                    {ships.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code} · {shipDisplayPrefs[s.id]?.customName || s.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    data-testid="admin-run-sgw-verify-btn"
                    disabled={verifyRunning}
                    aria-label="SGW API 11개 엔드포인트 상호 교신 검증 다시 실행"
                    onClick={() => {
                      void runVerificationNow(verifyProjectId);
                    }}
                    className="inline-flex min-h-[34px] items-center gap-1.5 rounded-xl bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-sky-400"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 shrink-0 ${verifyRunning ? 'animate-spin' : ''}`}
                      aria-hidden="true"
                    />
                    <span>{verifyRunning ? '검증 중...' : '재검증 실행'}</span>
                  </button>
                </div>
              </div>

              {verifyReport && (
                <>
                  {/* Summary Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/35 p-2.5">
                      <p className="text-[10px] font-semibold text-emerald-300">통과 / 전체</p>
                      <p
                        data-testid="sgw-verify-pass-count"
                        className="mt-0.5 font-mono text-sm font-bold text-white"
                      >
                        {verifyReport.passCount} / {verifyReport.steps.length}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-700 bg-slate-900 p-2.5">
                      <p className="text-[10px] font-semibold text-slate-300">주의 / 실패</p>
                      <p className="mt-0.5 font-mono text-sm font-bold text-white">
                        {verifyReport.warnCount} / {verifyReport.failCount}
                      </p>
                    </div>
                    <div className="rounded-xl border border-sky-500/40 bg-sky-950/35 p-2.5">
                      <p className="text-[10px] font-semibold text-sky-300">양방향 접속 교신</p>
                      <p className="mt-0.5 text-xs font-bold text-white">
                        {verifyReport.twoWayPresenceOk ? '정상 (POST↔GET)' : '확인 필요'}
                      </p>
                    </div>
                    <div className="rounded-xl border border-indigo-500/40 bg-indigo-950/35 p-2.5">
                      <p className="text-[10px] font-semibold text-indigo-300">허브 강제 갱신</p>
                      <p className="mt-0.5 text-xs font-bold text-white">
                        {verifyReport.hubRefreshRoundtripOk
                          ? `성공 (${verifyReport.totalDurationMs}ms)`
                          : '실패'}
                      </p>
                    </div>
                  </div>

                  {/* Per-Endpoint Verification Table */}
                  <div className="space-y-1.5" data-testid="sgw-verify-steps-list">
                    {verifyReport.steps.map((step) => (
                      <div
                        key={step.id}
                        data-testid={`sgw-verify-step-${step.id}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs"
                      >
                        <div className="flex items-start gap-2 min-w-0 flex-1">
                          {step.status === 'pass' ? (
                            <CheckCircle2
                              className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400"
                              aria-hidden="true"
                            />
                          ) : step.status === 'warn' ? (
                            <AlertTriangle
                              className="mt-0.5 h-4 w-4 shrink-0 text-amber-400"
                              aria-hidden="true"
                            />
                          ) : (
                            <XCircle
                              className="mt-0.5 h-4 w-4 shrink-0 text-rose-400"
                              aria-hidden="true"
                            />
                          )}
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-bold text-white">{step.label}</span>
                              <span className="inline-flex items-center gap-0.5 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-sky-200">
                                {step.direction === 'outbound' ? (
                                  <ArrowUpRight className="h-2.5 w-2.5" aria-hidden="true" />
                                ) : step.direction === 'roundtrip' ? (
                                  <ArrowLeftRight className="h-2.5 w-2.5" aria-hidden="true" />
                                ) : (
                                  <ArrowDownLeft className="h-2.5 w-2.5" aria-hidden="true" />
                                )}
                                {step.direction === 'outbound'
                                  ? '송신'
                                  : step.direction === 'roundtrip'
                                    ? '왕복'
                                    : '수신'}
                              </span>
                              <code className="font-mono text-[10px] text-slate-400">
                                {step.endpoint}
                              </code>
                            </div>
                            <p className="mt-0.5 text-[11px] text-slate-300">{step.detail}</p>
                          </div>
                        </div>
                        <span className="shrink-0 font-mono text-[11px] text-slate-400 tabular-nums">
                          {step.latencyMs}ms
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
