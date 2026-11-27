import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Anchor,
  Building2,
  Compass,
  FileBarChart2,
  FolderKanban,
  Mail,
  MessageSquare,
  Pencil,
  RotateCcw,
  RotateCw,
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
import type { MetaRegistryResponse } from '../meta/hubTypes';
import type { RuntimeEnv } from '../runtimeEnv';
import type { ClickedDecorativeShip } from '../scene/harborSceneTypes';
import { MAX_SHIP_NAME_LENGTH } from '../shipDisplayPrefs';
import { ShipKeyItemsTab } from './ShipKeyItemsTab';

export type RadialDirection = 'north' | 'east' | 'south' | 'west';

export type RadialTarget =
  | { kind: 'person'; person: HarborPerson; anchor: { x: number; y: number } }
  | { kind: 'ship'; ship: HarborShip; anchor: { x: number; y: number } }
  | { kind: 'decorative-ship'; ship: ClickedDecorativeShip; anchor: { x: number; y: number } };

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
  viewportSize?: { width: number; height: number };
  customShipName?: string;
  currentYawDeg?: number;
  rotationWarning?: string | null;
  onBoardShip?: (shipId: string) => void;
  onFocusPerson3D?: (sub: string) => void;
  onHighlightShip?: (shipId: string) => void;
  onOpenReport?: (shipId: string) => void;
  onToast?: (message: string) => void;
  onRenameShip?: (shipId: string, rawName: string) => { ok: boolean; reason?: string };
  onRotateShipStep?: (shipId: string, deltaSteps: number) => void;
  onRotateShipAbsolute?: (shipId: string, nextYawDeg: number) => void;
  onSnapShipParallel?: (shipId: string) => void;
  onPreviewLinkBlocked: (featureLabel: string) => void;
  onClose: () => void;
}

export const RADIAL_DIRECTIONS: readonly RadialDirection[] = ['north', 'east', 'south', 'west'];

/**
 * Pure builder for the 4 cardinal radial menu deep-link items (12시 대화, 3시 NAS, 6시 SEDMS, 9시 메일).
 * Decorative ships return an empty list (strict separation: zero SEDMS/SGW links on scenery!).
 */
export function buildRadialMenuActions(target: RadialTarget): RadialMenuItem[] {
  if (target.kind === 'decorative-ship') {
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
  viewportSize,
  customShipName,
  currentYawDeg = 90,
  rotationWarning = null,
  onBoardShip,
  onFocusPerson3D,
  onHighlightShip,
  onOpenReport,
  onToast,
  onRenameShip,
  onRotateShipStep,
  onRotateShipAbsolute,
  onSnapShipParallel,
  onPreviewLinkBlocked,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'key-items'>('overview');
  const [activeDir, setActiveDir] = useState<RadialDirection>('north');
  const [renameOpen, setRenameOpen] = useState(false);
  const [rotateOpen, setRotateOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const itemRefs = useRef<Partial<Record<RadialDirection, HTMLAnchorElement | null>>>({});

  const items = useMemo(() => (target ? buildRadialMenuActions(target) : []), [target]);
  const isPreview = runtimeEnv === 'preview';

  const targetKey =
    target?.kind === 'person'
      ? `person:${target.person.sub}`
      : target?.kind === 'ship'
        ? `ship:${target.ship.id}`
        : target?.kind === 'decorative-ship'
          ? `deco:${target.ship.id}`
          : '';

  useEffect(() => {
    if (!target) return;
    setActiveTab('overview');
    setActiveDir('north');
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
      onClose();
      return;
    }

    if (typingInInput) return;

    const showingKeyItemsTab = target.kind === 'ship' && activeTab === 'key-items';
    if (showingKeyItemsTab) return;

    // Q / E keyboard rotation in 15° steps when a ship popup is open (Req #19)
    if (isShipLike && onRotateShipStep && (e.key === 'q' || e.key === 'Q')) {
      e.preventDefault();
      setRotateOpen(true);
      onRotateShipStep(shipId, -1);
      return;
    }
    if (isShipLike && onRotateShipStep && (e.key === 'e' || e.key === 'E')) {
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
      : customShipName || originalShipName;

  const subLabel =
    target.kind === 'person'
      ? `${target.person.dept} · ${target.person.online ? '접속 중' : '오프라인'}`
      : target.kind === 'ship'
        ? `${target.ship.code} · ${target.ship.appearance.statusLabelKo}`
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
                target.person.online ? (
                  <Wifi className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden="true" />
                ) : (
                  <WifiOff className="h-4 w-4 text-slate-400 shrink-0" aria-hidden="true" />
                )
              ) : target.kind === 'decorative-ship' ? (
                <Sparkles className="h-4 w-4 text-amber-400 shrink-0" aria-hidden="true" />
              ) : (
                <Ship className="h-4 w-4 text-sky-400 shrink-0" aria-hidden="true" />
              )}
              <h3 className="truncate text-sm font-bold text-white">{displayTitle}</h3>
            </div>

            {isShipLike && customShipName && customShipName !== originalShipName && (
              <p className="mt-0.5 truncate text-[11px] text-sky-300">
                {target.kind === 'ship'
                  ? `내 화면 표시 이름 · 원래 이름: ${originalShipName}`
                  : `원래 이름: ${originalShipName}`}
              </p>
            )}
            <p className="mt-0.5 truncate text-[11px] text-slate-300">{subLabel}</p>
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

        {target.kind === 'ship' && activeTab === 'key-items' ? (
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
                      onPreviewLinkBlocked(item.previewFeatureLabel);
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

        {/* Primary Action Row: 승선 (Business Ship) / 3D 위치 (Person) / 이름 바꾸기 / 방향 바꾸기 */}
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

          {target.kind === 'person' && onFocusPerson3D && (
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

          {isShipLike && onRenameShip && (
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

          {isShipLike && onRotateShipStep && (
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

        {/* Inline Ship Rename Panel (Requirement #15) */}
        {isShipLike && renameOpen && onRenameShip && (
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

        {/* Inline Ship Rotation Panel (Requirement #19 — 15° Q/E + slider + quay snap + collision rollback) */}
        {isShipLike && rotateOpen && onRotateShipStep && (
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
