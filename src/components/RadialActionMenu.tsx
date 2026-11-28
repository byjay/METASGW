import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Anchor,
  Box,
  Building2,
  Cable,
  CalendarOff,
  Clock,
  Compass,
  ExternalLink,
  FileBarChart2,
  FileText,
  FolderKanban,
  HardHat,
  Layers,
  Mail,
  MessageSquare,
  Pencil,
  RotateCcw,
  RotateCw,
  Scan,
  Shield,
  Ship,
  Sparkles,
  User,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import {
  buildSedmsProjectUrl,
  buildTalkDmUrl,
  buildTalkRoomUrl,
  isSafeNavigationUrl,
  SGW_PORTAL_LINKS,
} from '../deepLink';
import type { HarborPerson, HarborShip } from '../mapping';
import { getHubChipStyleSpec, type HubModuleChipItem } from '../meta/hubChipModel';
import {
  formatNullableKpiValue,
  type MetaModuleId,
  type MetaRegistryResponse,
} from '../meta/hubTypes';
import { buildProjectEntryOptions } from '../projectEntryOptions';
import type { RuntimeEnv } from '../runtimeEnv';
import type { ClickedDecorativeShip } from '../scene/harborSceneTypes';
import { MAX_SHIP_NAME_LENGTH } from '../shipDisplayPrefs';
import type { PreviewBridgeTarget } from './SgwBridgePreviewModal';
import { ShipKeyItemsTab } from './ShipKeyItemsTab';

export type RadialDirection = 'north' | 'east' | 'south' | 'west';

export type RadialTarget =
  | { kind: 'person'; person: HarborPerson; anchor: { x: number; y: number } }
  | { kind: 'ship'; ship: HarborShip; anchor: { x: number; y: number } }
  | { kind: 'decorative-ship'; ship: ClickedDecorativeShip; anchor: { x: number; y: number } }
  | { kind: 'hub-building'; chip: HubModuleChipItem; lotLabel?: string; anchor: { x: number; y: number } };

export interface RadialMenuItem {
  direction: RadialDirection;
  clockLabel: '12시' | '3시' | '6시' | '9시';
  label: string;
  description: string;
  href: string;
  previewFeatureLabel: string;
}

export interface RadialActionMenuProps {
  target: RadialTarget | null;
  runtimeEnv: RuntimeEnv;
  hubRegistry?: MetaRegistryResponse | null;
  hubChips?: HubModuleChipItem[];
  viewportSize?: { width: number; height: number };
  customShipName?: string;
  currentYawDeg?: number;
  rotationWarning?: string | null;
  /** Default false: ship editing lives in Admin Menu; default users enter project systems directly. */
  canEditShip?: boolean;
  onBoardShip?: (shipId: string) => void;
  onFocusPerson3D?: (sub: string) => void;
  onHighlightShip?: (shipId: string) => void;
  onOpenReport?: (shipId: string) => void;
  onOpenAdminForShip?: (shipId: string) => void;
  onOpenPreviewBridge?: (target: PreviewBridgeTarget) => void;
  onToast?: (message: string) => void;
  onRenameShip?: (shipId: string, rawName: string) => { ok: boolean; reason?: string };
  onRotateShipStep?: (shipId: string, deltaSteps: number) => void;
  onRotateShipAbsolute?: (shipId: string, nextYawDeg: number) => void;
  onSnapShipParallel?: (shipId: string) => void;
  onPreviewLinkBlocked: (featureLabel: string) => void;
  onClose: () => void;
  onEscapeClose?: () => void;
}

export const RADIAL_DIRECTIONS: readonly RadialDirection[] = ['north', 'east', 'south', 'west'];

/**
 * Pure builder for the 4 cardinal radial menu deep-link items (12시 대화, 3시 NAS, 6시 SEDMS, 9시 메일).
 * Decorative ships return an empty list (strict separation: zero SEDMS/SGW links on scenery!).
 */
export function buildRadialMenuActions(target: RadialTarget): RadialMenuItem[] {
  if (target.kind === 'decorative-ship' || target.kind === 'hub-building') {
    return [];
  }

  if (target.kind === 'person') {
    const { person } = target;
    const rawDm = buildTalkDmUrl(person.sub);
    return [
      {
        direction: 'north',
        clockLabel: '12시',
        label: '대화',
        description: `${person.name} 1:1 대화`,
        href: isSafeNavigationUrl(rawDm) ? rawDm : SGW_PORTAL_LINKS.talkHome,
        previewFeatureLabel: `1:1 대화(${person.name})`,
      },
      {
        direction: 'east',
        clockLabel: '3시',
        label: 'NAS',
        description: 'SGW NAS 문서함 열기',
        href: isSafeNavigationUrl(SGW_PORTAL_LINKS.nas) ? SGW_PORTAL_LINKS.nas : '/',
        previewFeatureLabel: 'SGW NAS 열기',
      },
      {
        direction: 'south',
        clockLabel: '6시',
        label: 'SEDMS',
        description: 'SEDMS 프로젝트 목록',
        href: isSafeNavigationUrl(SGW_PORTAL_LINKS.sedmsProjects)
          ? SGW_PORTAL_LINKS.sedmsProjects
          : '/',
        previewFeatureLabel: 'SEDMS 프로젝트 목록',
      },
      {
        direction: 'west',
        clockLabel: '9시',
        label: '메일',
        description: 'bmail 메일 앱 열기',
        href: isSafeNavigationUrl(SGW_PORTAL_LINKS.bmail) ? SGW_PORTAL_LINKS.bmail : '/',
        previewFeatureLabel: 'bmail 메일 앱 열기',
      },
    ];
  }

  const { ship } = target;
  let sedmsHref: string = SGW_PORTAL_LINKS.sedmsProjects;
  try {
    sedmsHref = buildSedmsProjectUrl(ship.id);
  } catch {
    sedmsHref = SGW_PORTAL_LINKS.sedmsProjects;
  }
  const talkRoomHref = buildTalkRoomUrl(ship.id);

  return [
    {
      direction: 'north',
      clockLabel: '12시',
      label: '대화',
      description: `${ship.name} 팀 채팅`,
      href: isSafeNavigationUrl(talkRoomHref) ? talkRoomHref : SGW_PORTAL_LINKS.talkHome,
      previewFeatureLabel: `팀 채팅(${ship.code})`,
    },
    {
      direction: 'east',
      clockLabel: '3시',
      label: 'NAS',
      description: 'SGW NAS 문서함 열기',
      href: isSafeNavigationUrl(SGW_PORTAL_LINKS.nas) ? SGW_PORTAL_LINKS.nas : '/',
      previewFeatureLabel: `SGW NAS(${ship.code})`,
    },
    {
      direction: 'south',
      clockLabel: '6시',
      label: 'SEDMS',
      description: `${ship.code} SEDMS 열기`,
      href: isSafeNavigationUrl(sedmsHref) ? sedmsHref : '/',
      previewFeatureLabel: `SEDMS 프로젝트(${ship.code})`,
    },
    {
      direction: 'west',
      clockLabel: '9시',
      label: '메일',
      description: 'bmail 메일 앱 열기',
      href: isSafeNavigationUrl(SGW_PORTAL_LINKS.bmail) ? SGW_PORTAL_LINKS.bmail : '/',
      previewFeatureLabel: 'bmail 메일 앱 열기',
    },
  ];
}

/**
 * Pure keyboard direction resolver for the 4-way quick action menu.
 */
export function resolveRadialDirectionFromKey(
  key: string,
  current: RadialDirection,
): RadialDirection | null {
  if (key === 'ArrowUp') return 'north';
  if (key === 'ArrowRight') return 'east';
  if (key === 'ArrowDown') return 'south';
  if (key === 'ArrowLeft') return 'west';
  if (key === 'Tab') {
    const idx = RADIAL_DIRECTIONS.indexOf(current);
    return RADIAL_DIRECTIONS[(idx + 1) % RADIAL_DIRECTIONS.length];
  }
  return null;
}

/**
 * Clamps popup center inside viewport bounds so buttons never clip off-screen (even at 375px).
 */
export function clampRadialCenter(
  anchor: { x: number; y: number },
  viewport: { width: number; height: number },
  radiusPx = 140,
): { x: number; y: number } {
  const minX = Math.min(viewport.width / 2, radiusPx);
  const maxX = Math.max(viewport.width / 2, viewport.width - radiusPx);
  const minY = Math.min(viewport.height / 2, radiusPx + 44);
  const maxY = Math.max(viewport.height / 2, viewport.height - radiusPx - 44);
  return {
    x: Math.round(Math.max(minX, Math.min(maxX, anchor.x))),
    y: Math.round(Math.max(minY, Math.min(maxY, anchor.y))),
  };
}

const DIRECTION_ICON: Record<RadialDirection, React.ReactNode> = {
  north: <MessageSquare className="h-4 w-4 text-sky-300 shrink-0" aria-hidden="true" />,
  east: <Building2 className="h-4 w-4 text-teal-300 shrink-0" aria-hidden="true" />,
  south: <FolderKanban className="h-4 w-4 text-emerald-300 shrink-0" aria-hidden="true" />,
  west: <Mail className="h-4 w-4 text-indigo-300 shrink-0" aria-hidden="true" />,
};

function renderHubModuleIcon(moduleId: MetaModuleId): React.ReactNode {
  const cls = 'h-4 w-4 shrink-0 text-sky-300';
  switch (moduleId) {
    case 'sgw':
      return <MessageSquare className={cls} aria-hidden="true" />;
    case 'sedms':
      return <FolderKanban className={cls} aria-hidden="true" />;
    case 'secms':
      return <Cable className={cls} aria-hidden="true" />;
    case 's360':
      return <Scan className={cls} aria-hidden="true" />;
    case 'secad':
      return <Box className={cls} aria-hidden="true" />;
    case 'pdf':
      return <FileText className={cls} aria-hidden="true" />;
    case 'mail':
      return <Mail className={cls} aria-hidden="true" />;
    default:
      return <Layers className={cls} aria-hidden="true" />;
  }
}

/**
 * Unified Single Entity Action Popup (Requirements #6, #15, #18, #19):
 *   - Only ONE popup opens at a time; outside click & Esc dismiss cleanly.
 *   - Consolidates all ship/person actions (대화·NAS·SEDMS·메일·승선·이름 바꾸기·방향 바꾸기·닫기).
 *   - Decorative vessels (씨스타호, FD-01, scenery) support rename + collision-safe rotation ONLY (no SEDMS links).
 */
export const RadialActionMenu: React.FC<RadialActionMenuProps> = ({
  target,
  runtimeEnv,
  hubRegistry = null,
  hubChips = [],
  viewportSize,
  customShipName,
  currentYawDeg = 90,
  rotationWarning = null,
  canEditShip = false,
  onBoardShip,
  onFocusPerson3D,
  onHighlightShip,
  onOpenReport,
  onOpenAdminForShip,
  onOpenPreviewBridge,
  onToast,
  onRenameShip,
  onRotateShipStep,
  onRotateShipAbsolute,
  onSnapShipParallel,
  onPreviewLinkBlocked,
  onClose,
  onEscapeClose,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'key-items'>('overview');
  const [activeDir, setActiveDir] = useState<RadialDirection>('north');
  const [selectedEntryId, setSelectedEntryId] = useState<string>('sedms');
  const [renameOpen, setRenameOpen] = useState(false);
  const [rotateOpen, setRotateOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const itemRefs = useRef<Partial<Record<RadialDirection, HTMLAnchorElement | null>>>({});

  const items = useMemo(() => (target ? buildRadialMenuActions(target) : []), [target]);
  const projectEntryOptions = useMemo(
    () => (target?.kind === 'ship' ? buildProjectEntryOptions(target.ship, hubChips) : []),
    [target, hubChips],
  );
  const isPreview = runtimeEnv === 'preview';

  const targetKey =
    target?.kind === 'person'
      ? `person:${target.person.sub}`
      : target?.kind === 'ship'
        ? `ship:${target.ship.id}`
        : target?.kind === 'decorative-ship'
          ? `deco:${target.ship.id}`
          : target?.kind === 'hub-building'
            ? `hub:${target.chip.moduleId}`
            : '';

  useEffect(() => {
    if (!target) return;
    setActiveTab('overview');
    setActiveDir('north');
    setSelectedEntryId('sedms');
    setRenameOpen(false);
    setRotateOpen(false);
    setNameError(null);
    if (target.kind === 'ship') {
      setNameDraft(customShipName ?? target.ship.name);
    } else if (target.kind === 'decorative-ship') {
      setNameDraft(customShipName ?? target.ship.defaultName);
    }
    const raf = window.requestAnimationFrame(() => {
      itemRefs.current.north?.focus();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [targetKey]);

  if (!target) return null;

  const vp = viewportSize ?? {
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  };
  const isShipLike = target.kind === 'ship' || target.kind === 'decorative-ship';
  const shipId = target.kind === 'ship' ? target.ship.id : target.kind === 'decorative-ship' ? target.ship.id : '';

  const center = clampRadialCenter(target.anchor, vp, 168);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const el = e.target as HTMLElement | null;
    const typingInInput = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (onEscapeClose) {
        onEscapeClose();
      } else {
        onClose();
      }
      return;
    }

    if (typingInInput) return;

    const showingKeyItemsTab = target.kind === 'ship' && activeTab === 'key-items';
    if (showingKeyItemsTab) return;

    // Q / E keyboard rotation in 15° steps ONLY when admin ship editing is explicitly enabled
    if (canEditShip && isShipLike && onRotateShipStep && (e.key === 'q' || e.key === 'Q')) {
      e.preventDefault();
      setRotateOpen(true);
      onRotateShipStep(shipId, -1);
      return;
    }
    if (canEditShip && isShipLike && onRotateShipStep && (e.key === 'e' || e.key === 'E')) {
      e.preventDefault();
      setRotateOpen(true);
      onRotateShipStep(shipId, 1);
      return;
    }

    if (items.length > 0) {
      const nextDir = resolveRadialDirectionFromKey(e.key, activeDir);
      if (nextDir) {
        e.preventDefault();
        setActiveDir(nextDir);
        itemRefs.current[nextDir]?.focus();
        return;
      }

      if (e.key === 'Enter' || e.key === ' ') {
        const focusedItem = items.find((item) => item.direction === activeDir);
        if (focusedItem && isPreview && el?.tagName === 'A') {
          e.preventDefault();
          onPreviewLinkBlocked(focusedItem.previewFeatureLabel);
        }
      }
    }
  };

  const originalShipName =
    target.kind === 'ship'
      ? target.ship.name
      : target.kind === 'decorative-ship'
        ? target.ship.defaultName
        : '';

  const displayTitle =
    target.kind === 'person'
      ? target.person.name
      : target.kind === 'hub-building'
        ? target.chip.name
        : customShipName || originalShipName;

  const personPresenceHint =
    target.kind === 'person'
      ? target.person.presenceStatus === 'online'
        ? '안벽 산책 중'
        : target.person.presenceStatus === 'away'
          ? '안벽 벤치 휴식'
          : target.person.presenceStatus === 'leave'
            ? '오늘 연차 (항구 미표시)'
            : '오프라인'
      : '';

  const subLabel =
    target.kind === 'person'
      ? `${target.person.dept} · ${target.person.presenceLabelKo}`
      : target.kind === 'ship'
        ? `${target.ship.code} · ${target.ship.appearance.statusLabelKo}`
        : target.kind === 'hub-building'
          ? target.lotLabel
            ? `${target.lotLabel} · 연동 시스템 건물`
            : '항구 연동 시스템 건물'
          : target.ship.subtitle;

  const submitRename = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onRenameShip || !shipId) return;
    const res = onRenameShip(shipId, nameDraft);
    if (!res.ok) {
      setNameError(res.reason ?? '이름을 저장할 수 없습니다.');
    } else {
      setNameError(null);
      setRenameOpen(false);
    }
  };

  const resetRename = () => {
    if (!onRenameShip || !shipId) return;
    onRenameShip(shipId, '');
    setNameDraft(originalShipName);
    setNameError(null);
    setRenameOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-40 bg-slate-950/45"
      role="dialog"
      aria-modal="true"
      aria-label={`${displayTitle} 작업 팝업`}
      data-testid="radial-action-menu"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        className="fixed w-[344px] max-w-[calc(100vw-1.25rem)] max-h-[calc(100vh-5.5rem)] overflow-y-auto -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-600/90 bg-slate-950/96 p-3.5 text-slate-100 shadow-2xl space-y-3"
        style={{ left: `${center.x}px`, top: `${center.y}px` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {target.kind === 'person' ? (
                target.person.presenceStatus === 'online' ? (
                  <Wifi className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden="true" />
                ) : target.person.presenceStatus === 'away' ? (
                  <Clock className="h-4 w-4 text-amber-400 shrink-0" aria-hidden="true" />
                ) : target.person.presenceStatus === 'leave' ? (
                  <CalendarOff className="h-4 w-4 text-violet-300 shrink-0" aria-hidden="true" />
                ) : (
                  <WifiOff className="h-4 w-4 text-slate-400 shrink-0" aria-hidden="true" />
                )
              ) : target.kind === 'decorative-ship' ? (
                <Sparkles className="h-4 w-4 text-amber-400 shrink-0" aria-hidden="true" />
              ) : target.kind === 'hub-building' ? (
                renderHubModuleIcon(target.chip.moduleId)
              ) : (
                <Ship className="h-4 w-4 text-sky-400 shrink-0" aria-hidden="true" />
              )}
              <h3 className="truncate text-sm font-bold text-white">{displayTitle}</h3>
              {target.kind === 'person' && (
                <span
                  data-testid="person-card-status-badge"
                  className={`inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-[10px] font-bold ${
                    target.person.presenceStatus === 'online'
                      ? 'border-emerald-400/60 bg-emerald-950/85 text-emerald-100'
                      : target.person.presenceStatus === 'away'
                        ? 'border-amber-400/60 bg-amber-950/85 text-amber-100'
                        : target.person.presenceStatus === 'leave'
                          ? 'border-violet-400/60 bg-violet-950/85 text-violet-100'
                          : 'border-slate-600 bg-slate-800 text-slate-200'
                  }`}
                >
                  {target.person.presenceLabelKo}
                </span>
              )}
              {target.kind === 'hub-building' && (() => {
                const styleSpec = getHubChipStyleSpec(target.chip.status);
                return (
                  <span
                    data-testid="hub-building-status-badge"
                    data-status={target.chip.status}
                    className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${styleSpec.containerClass}`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full shrink-0 ${styleSpec.dotClass}`}
                      aria-hidden="true"
                    />
                    <span>{target.chip.statusLabel}</span>
                  </span>
                );
              })()}
            </div>

            {isShipLike && customShipName && customShipName !== originalShipName && (
              <p className="mt-0.5 truncate text-[11px] text-sky-300">
                {target.kind === 'ship'
                  ? `내 화면 표시 이름 · 원래 이름: ${originalShipName}`
                  : `원래 이름: ${originalShipName}`}
              </p>
            )}
            <p className="mt-0.5 truncate text-[11px] text-slate-300">
              {target.kind === 'person' ? `${target.person.dept} · ${personPresenceHint}` : subLabel}
            </p>
            {target.kind === 'decorative-ship' && (
              <span className="mt-1 inline-flex items-center rounded border border-amber-400/50 bg-amber-950/70 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200">
                장식 선박 · 업무 데이터 아님
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {target.kind === 'ship' && onOpenReport && (
              <button
                type="button"
                data-testid="radial-report-btn"
                onClick={() => onOpenReport(target.ship.id)}
                aria-label={`${displayTitle} 통합 리포트 열기`}
                className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-sky-500/60 bg-sky-950/75 px-2 py-1 text-[11px] font-semibold text-sky-100 hover:bg-sky-900/80 focus-visible:outline-2 focus-visible:outline-sky-300"
              >
                <FileBarChart2 className="h-3.5 w-3.5 text-sky-300 shrink-0" aria-hidden="true" />
                <span>리포트</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="팝업 닫기"
              className="inline-flex min-h-[32px] min-w-[32px] shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 p-1.5 text-slate-200 hover:bg-slate-800 hover:text-white focus-visible:outline-2 focus-visible:outline-sky-300"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Business Ship Tabs: [개요] / [핵심 항목] (NEVER shown on decorative ships or people) */}
        {target.kind === 'ship' && (
          <div
            role="tablist"
            aria-label="선박 팝업 탭"
            className="grid grid-cols-2 gap-1 rounded-xl border border-slate-800 bg-slate-900/90 p-1"
            data-testid="radial-ship-tabs"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'overview'}
              aria-label="선박 개요 탭"
              data-testid="radial-tab-overview"
              onClick={() => setActiveTab('overview')}
              className={`min-h-[30px] rounded-lg px-2.5 py-1 text-xs font-bold transition focus-visible:outline-2 focus-visible:outline-sky-300 ${
                activeTab === 'overview'
                  ? 'bg-sky-700 text-white shadow'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              개요
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'key-items'}
              aria-label="선박 핵심 항목 탭"
              data-testid="radial-tab-key-items"
              onClick={() => setActiveTab('key-items')}
              className={`min-h-[30px] rounded-lg px-2.5 py-1 text-xs font-bold transition focus-visible:outline-2 focus-visible:outline-sky-300 ${
                activeTab === 'key-items'
                  ? 'bg-sky-700 text-white shadow'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              핵심 항목
            </button>
          </div>
        )}

        {target.kind === 'hub-building' ? (
          (() => {
            const { chip } = target;
            const kpiEntries = Object.entries(chip.kpi);
            const isPlanned = chip.status === 'planned';
            const isUnavailable = chip.status === 'unavailable';
            const isNoSource = chip.status === 'nosource';

            return (
              <div
                data-testid="hub-building-card"
                data-module-id={chip.moduleId}
                data-status={chip.status}
                className="space-y-2.5"
              >
                {/* Status Summary Box (matches HudHubStatusStrip chip tooltip/status honesty) */}
                <div
                  className={`rounded-xl border p-2.5 text-xs ${
                    isUnavailable
                      ? 'border-rose-500/70 bg-rose-950/55 text-rose-100'
                      : isPlanned
                        ? 'border-dashed border-amber-400/65 bg-amber-950/40 text-amber-100'
                        : isNoSource
                          ? 'border-slate-600/80 bg-slate-900/90 text-slate-200'
                          : 'border-slate-700 bg-slate-900/90 text-slate-100'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {isPlanned ? (
                      <HardHat className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
                    ) : isUnavailable ? (
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" aria-hidden="true" />
                    ) : (
                      <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />
                    )}
                    <div className="min-w-0 space-y-1">
                      <p className="font-semibold leading-snug">{chip.summaryText}</p>
                      {chip.disabledReason && chip.disabledReason !== chip.summaryText && (
                        <p className="text-[11px] leading-snug text-slate-300">
                          {chip.disabledReason}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Honest Nullable KPI Grid (null -> "—", never fabricated 0) */}
                {kpiEntries.length > 0 && (
                  <dl
                    data-testid="hub-building-kpi-grid"
                    className="grid grid-cols-2 gap-1.5"
                  >
                    {kpiEntries.map(([key, val]) => (
                      <div
                        key={key}
                        className="rounded-lg border border-slate-800 bg-slate-900/85 px-2.5 py-1.5"
                      >
                        <dt className="truncate text-[10px] font-medium text-slate-400">
                          {key}
                        </dt>
                        <dd className="mt-0.5 font-mono text-xs font-bold text-slate-100 tabular-nums">
                          {formatNullableKpiValue(val)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}

                {/* Entry Link: Strictly Server-Supplied entryUrl Only (null => disabled) */}
                <div className="pt-0.5">
                  {!chip.disabled && chip.entryUrl ? (
                    <a
                      href={chip.entryUrl}
                      data-testid="hub-building-entry-link"
                      aria-label={`${chip.name} 시스템 열기`}
                      onClick={(e) => {
                        if (isPreview) {
                          e.preventDefault();
                          if (onOpenPreviewBridge) {
                            onOpenPreviewBridge({
                              featureLabel: chip.name,
                              targetUrl: chip.entryUrl,
                              moduleId: chip.moduleId,
                              kind: 'hub',
                            });
                          } else {
                            onPreviewLinkBlocked(chip.name);
                          }
                          onClose();
                        }
                      }}
                      className="inline-flex w-full min-h-[40px] items-center justify-center gap-1.5 rounded-xl bg-sky-700 px-3 py-2 text-xs font-bold text-white hover:bg-sky-600 focus-visible:outline-2 focus-visible:outline-sky-300"
                    >
                      <span>{chip.name} 열기</span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    </a>
                  ) : (
                    <button
                      type="button"
                      disabled
                      data-testid="hub-building-entry-disabled"
                      aria-label={chip.disabledReason ?? `${chip.name} 이동 불가`}
                      className="inline-flex w-full min-h-[40px] cursor-not-allowed items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-600 bg-slate-900/80 px-3 py-2 text-xs font-semibold text-slate-300 opacity-90"
                    >
                      <span>
                        {isPlanned
                          ? '준비 중 · 연동 예정'
                          : `${chip.statusLabel} · 이동 불가`}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            );
          })()
        ) : target.kind === 'ship' && activeTab === 'key-items' ? (
          <ShipKeyItemsTab
            compact
            projectId={target.ship.id}
            runtimeEnv={runtimeEnv}
            registry={hubRegistry}
            onHighlightShip={onHighlightShip}
            onPreviewLinkBlocked={onPreviewLinkBlocked}
            onToast={onToast}
          />
        ) : (
          <>
        {/* 4 Cardinal SGW Deep-Link Actions (Business Ships & People ONLY — NEVER decorative ships) */}
        {items.length > 0 && (
          <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="4방향 빠른 이동">
            {items.map((item) => {
              const isFocused = activeDir === item.direction;
              return (
                <a
                  key={item.direction}
                  ref={(el) => {
                    itemRefs.current[item.direction] = el;
                  }}
                  href={item.href}
                  data-testid={`radial-item-${item.direction}`}
                  aria-label={`${item.clockLabel} ${item.label} — ${item.description}`}
                  onFocus={() => setActiveDir(item.direction)}
                  onClick={(e) => {
                    if (isPreview) {
                      e.preventDefault();
                      if (onOpenPreviewBridge) {
                        onOpenPreviewBridge({
                          featureLabel: item.previewFeatureLabel,
                          targetUrl: item.href,
                          projectId: target.kind === 'ship' ? target.ship.id : null,
                          projectName: target.kind === 'ship' ? displayTitle : null,
                          kind:
                            item.direction === 'south'
                              ? 'sedms'
                              : item.direction === 'north'
                                ? 'talk'
                                : item.direction === 'east'
                                  ? 'nas'
                                  : 'bmail',
                        });
                      } else {
                        onPreviewLinkBlocked(item.previewFeatureLabel);
                      }
                      onClose();
                    }
                  }}
                  className={`flex min-h-[44px] items-center justify-between gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 ${
                    isFocused
                      ? 'border-sky-400 bg-sky-900/90 text-white'
                      : 'border-slate-700 bg-slate-900 text-slate-100 hover:border-sky-400 hover:bg-slate-800'
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {DIRECTION_ICON[item.direction]}
                    <span>{item.label}</span>
                  </span>
                  <span className="text-[10px] font-medium text-slate-300">{item.clockLabel}</span>
                </a>
              );
            })}
          </div>
        )}

        {/* Default User Project Entry System Selector (SEDMS, SEcMS, s360, SECAD, PDF, Talk, NAS, bmail) */}
        {target.kind === 'ship' && projectEntryOptions.length > 0 && (() => {
          const activeOption =
            projectEntryOptions.find((opt) => opt.id === selectedEntryId && !opt.disabled) ??
            projectEntryOptions.find((opt) => !opt.disabled) ??
            projectEntryOptions[0];
          return (
            <div
              data-testid="project-entry-options-section"
              className="rounded-xl border border-slate-700/90 bg-slate-900/90 p-2.5 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-sky-200">
                  프로젝트 진입 시스템 선택
                </span>
                <span className="text-[10px] text-slate-400">옵션 선택 후 진입</span>
              </div>

              <div
                role="radiogroup"
                aria-label="프로젝트 진입 시스템 옵션"
                className="grid grid-cols-2 gap-1.5"
              >
                {projectEntryOptions.map((opt) => {
                  const isSelected = activeOption?.id === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      aria-label={`${opt.label} 진입 옵션 선택 (${opt.statusLabel})`}
                      disabled={opt.disabled}
                      data-testid={`project-entry-option-${opt.id}`}
                      onClick={() => setSelectedEntryId(opt.id)}
                      className={`rounded-lg border px-2 py-1.5 text-left text-[11px] transition focus-visible:outline-2 focus-visible:outline-sky-300 ${
                        opt.disabled
                          ? 'cursor-not-allowed border-dashed border-slate-700 bg-slate-950/60 text-slate-400 opacity-75'
                          : isSelected
                            ? 'border-sky-400 bg-sky-900/80 text-white font-bold'
                            : 'border-slate-700 bg-slate-950 text-slate-200 hover:border-sky-500/70 hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate font-semibold">{opt.label}</span>
                        <span className="shrink-0 text-[9px] text-slate-300">
                          {opt.statusLabel}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {activeOption && activeOption.href && !activeOption.disabled && (
                <a
                  href={activeOption.href}
                  data-testid="project-entry-launch-btn"
                  aria-label={`${activeOption.label} 시스템으로 바로 진입`}
                  onClick={(e) => {
                    if (isPreview) {
                      e.preventDefault();
                      if (onOpenPreviewBridge) {
                        onOpenPreviewBridge({
                          featureLabel: activeOption.previewFeatureLabel,
                          targetUrl: activeOption.href,
                          projectId: target.ship.id,
                          projectName: displayTitle,
                          moduleId: activeOption.moduleId ?? null,
                          kind: activeOption.kind,
                        });
                      } else {
                        onPreviewLinkBlocked(activeOption.previewFeatureLabel);
                      }
                      onClose();
                    }
                  }}
                  className="inline-flex w-full min-h-[38px] items-center justify-center gap-1.5 rounded-xl bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-600 focus-visible:outline-2 focus-visible:outline-sky-300"
                >
                  <span>{activeOption.label} 진입</span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                </a>
              )}
            </div>
          );
        })()}

        {/* Primary Action Row: 승선 (Business Ship) / 3D 위치 (Person) / 관리자 메뉴 연동 */}
        <div className="flex flex-wrap items-center gap-1.5">
          {target.kind === 'ship' && onBoardShip && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onBoardShip(target.ship.id);
              }}
              aria-label={`${displayTitle} 승선 패널 열기`}
              className="inline-flex flex-1 min-h-[38px] items-center justify-center gap-1 whitespace-nowrap rounded-xl bg-sky-700 px-2.5 py-1.5 text-[11px] sm:text-xs font-bold text-white hover:bg-sky-600 focus-visible:outline-2 focus-visible:outline-sky-300"
            >
              <Anchor className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              승선
            </button>
          )}

          {target.kind === 'person' && (() => {
            const rawDm = buildTalkDmUrl(target.person.sub);
            const safeDmHref = isSafeNavigationUrl(rawDm) ? rawDm : SGW_PORTAL_LINKS.talkHome;
            return (
              <a
                href={safeDmHref}
                data-testid="person-card-message-btn"
                aria-label={`${target.person.name}에게 메시지 보내기`}
                onClick={(e) => {
                  if (isPreview) {
                    e.preventDefault();
                    if (onOpenPreviewBridge) {
                      onOpenPreviewBridge({
                        featureLabel: `1:1 메시지(${target.person.name})`,
                        targetUrl: safeDmHref,
                        kind: 'talk',
                      });
                    } else {
                      onPreviewLinkBlocked(`메시지(${target.person.name})`);
                    }
                    onClose();
                  }
                }}
                className="inline-flex flex-1 min-h-[38px] items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-sky-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-600 focus-visible:outline-2 focus-visible:outline-sky-300"
              >
                <MessageSquare className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>메시지</span>
              </a>
            );
          })()}

          {target.kind === 'person' &&
            onFocusPerson3D &&
            target.person.presenceStatus !== 'leave' &&
            !target.person.isCurrentUser && (
              <button
                type="button"
                onClick={() => {
                  onFocusPerson3D(target.person.sub);
                  onClose();
                }}
                aria-label={`${target.person.name} 3D 항구 위치로 이동`}
                className="inline-flex flex-1 min-h-[38px] items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-sky-300"
              >
                <Compass className="h-3.5 w-3.5 shrink-0 text-sky-400" aria-hidden="true" />
                항구 위치 보기
              </button>
            )}

          {isShipLike && !canEditShip && onOpenAdminForShip && (
            <button
              type="button"
              data-testid="radial-open-admin-ship-btn"
              aria-label="관리자 메뉴에서 선박 정보 및 에셋 변경"
              onClick={() => {
                onClose();
                onOpenAdminForShip(shipId);
              }}
              className="inline-flex flex-1 min-h-[38px] items-center justify-center gap-1 whitespace-nowrap rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-[11px] sm:text-xs font-semibold text-slate-200 hover:border-amber-400/60 hover:bg-slate-800 hover:text-white focus-visible:outline-2 focus-visible:outline-sky-300"
            >
              <Shield className="h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden="true" />
              <span>선박 정보·에셋 관리</span>
            </button>
          )}

          {canEditShip && isShipLike && onRenameShip && (
            <button
              type="button"
              data-testid="ship-rename-toggle"
              aria-label="선박 이름 바꾸기"
              aria-expanded={renameOpen}
              onClick={() => {
                setRenameOpen((v) => !v);
                setRotateOpen(false);
              }}
              className={`inline-flex flex-1 min-h-[38px] items-center justify-center gap-1 whitespace-nowrap rounded-xl border px-2 py-1.5 text-[11px] sm:text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-sky-300 ${
                renameOpen
                  ? 'border-sky-400 bg-sky-950 text-sky-100'
                  : 'border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800'
              }`}
            >
              <Pencil className="h-3.5 w-3.5 shrink-0 text-sky-300" aria-hidden="true" />
              이름 바꾸기
            </button>
          )}

          {canEditShip && isShipLike && onRotateShipStep && (
            <button
              type="button"
              data-testid="ship-rotate-toggle"
              aria-label="선박 방향 바꾸기"
              aria-expanded={rotateOpen}
              onClick={() => {
                setRotateOpen((v) => !v);
                setRenameOpen(false);
              }}
              className={`inline-flex flex-1 min-h-[38px] items-center justify-center gap-1 whitespace-nowrap rounded-xl border px-2 py-1.5 text-[11px] sm:text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-sky-300 ${
                rotateOpen
                  ? 'border-amber-400 bg-amber-950/70 text-amber-100'
                  : 'border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800'
              }`}
            >
              <RotateCw className="h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden="true" />
              방향 바꾸기
            </button>
          )}
        </div>

        {/* Inline Ship Rename Panel (only when canEditShip is enabled) */}
        {canEditShip && isShipLike && renameOpen && onRenameShip && (
          <form
            onSubmit={submitRename}
            className="rounded-xl border border-slate-700 bg-slate-900/95 p-2.5 space-y-2"
            data-testid="ship-rename-form"
          >
            <label
              htmlFor="ship-rename-input"
              className="block text-[11px] font-semibold text-slate-200"
            >
              {target.kind === 'ship'
                ? '내 화면 표시 이름 (최대 30자 · SEDMS 원본 유지)'
                : '장식 선박 이름 (최대 30자 · 비우면 원래 이름)'}
            </label>
            <input
              id="ship-rename-input"
              data-testid="ship-rename-input"
              type="text"
              maxLength={MAX_SHIP_NAME_LENGTH}
              value={nameDraft}
              onChange={(e) => {
                setNameDraft(e.target.value);
                setNameError(null);
              }}
              placeholder={originalShipName}
              className="w-full rounded-lg border border-slate-600 bg-slate-950 px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
            />
            {nameError && (
              <p className="text-[11px] font-medium text-rose-300" role="alert">
                {nameError}
              </p>
            )}
            <div className="flex items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={resetRename}
                aria-label="원래 선박 이름으로 복원"
                className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-200 hover:bg-slate-700"
              >
                원래 이름
              </button>
              <button
                type="submit"
                aria-label="변경한 선박 이름 저장"
                className="rounded-lg bg-sky-700 px-3 py-1 text-[11px] font-bold text-white hover:bg-sky-600"
              >
                저장
              </button>
            </div>
          </form>
        )}

        {/* Inline Ship Rotation Panel (only when canEditShip is enabled) */}
        {canEditShip && isShipLike && rotateOpen && onRotateShipStep && (
          <div
            className="rounded-xl border border-slate-700 bg-slate-900/95 p-2.5 space-y-2"
            data-testid="ship-rotate-panel"
          >
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-slate-200">선박 정박 방향 (Q / E · 15° 단위)</span>
              <span className="font-mono font-bold text-amber-300" data-testid="ship-yaw-readout">
                {Math.round(currentYawDeg)}°
              </span>
            </div>

            {onRotateShipAbsolute && (
              <input
                type="range"
                min={0}
                max={345}
                step={15}
                value={Math.round(currentYawDeg) % 360}
                aria-label="선박 방향 각도 조절 슬라이더"
                onChange={(e) => onRotateShipAbsolute(shipId, Number(e.target.value))}
                className="w-full accent-sky-400 cursor-pointer"
              />
            )}

            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                data-testid="ship-rotate-ccw"
                aria-label="선박 왼쪽으로 15도 회전 (Q)"
                onClick={() => onRotateShipStep(shipId, -1)}
                className="inline-flex min-h-[34px] items-center justify-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] font-semibold text-slate-100 hover:bg-slate-700"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                -15° (Q)
              </button>
              <button
                type="button"
                data-testid="ship-rotate-cw"
                aria-label="선박 오른쪽으로 15도 회전 (E)"
                onClick={() => onRotateShipStep(shipId, 1)}
                className="inline-flex min-h-[34px] items-center justify-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] font-semibold text-slate-100 hover:bg-slate-700"
              >
                <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                +15° (E)
              </button>
              {onSnapShipParallel && (
                <button
                  type="button"
                  data-testid="ship-snap-quay"
                  aria-label="정박 방향 맞추기 (가장 가까운 안벽 평행 정렬)"
                  onClick={() => onSnapShipParallel(shipId)}
                  className="inline-flex min-h-[34px] items-center justify-center rounded-lg bg-sky-700 px-2 py-1 text-[11px] font-bold text-white hover:bg-sky-600"
                >
                  정박 방향 맞추기
                </button>
              )}
            </div>

            {rotationWarning && (
              <div
                role="alert"
                data-testid="ship-rotation-warning"
                className="flex items-start gap-1.5 rounded-lg border border-rose-500/60 bg-rose-950/75 px-2.5 py-1.5 text-[11px] font-medium text-rose-200"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" aria-hidden="true" />
                <span>{rotationWarning}</span>
              </div>
            )}
          </div>
        )}
          </>
        )}

        <div className="sr-only">
          <User aria-hidden="true" />
          방향키로 12시 대화, 3시 NAS, 6시 SEDMS, 9시 메일 선택, Q/E로 선박 회전, Esc로 닫기
        </div>
      </div>
    </div>
  );
};
