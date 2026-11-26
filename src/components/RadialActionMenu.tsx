import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Anchor,
  Building2,
  FolderKanban,
  Mail,
  MessageSquare,
  Ship,
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
import type { RuntimeEnv } from '../runtimeEnv';

export type RadialDirection = 'north' | 'east' | 'south' | 'west';

export type RadialTarget =
  | { kind: 'person'; person: HarborPerson; anchor: { x: number; y: number } }
  | { kind: 'ship'; ship: HarborShip; anchor: { x: number; y: number } };

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
  viewportSize?: { width: number; height: number };
  onBoardShip?: (shipId: string) => void;
  onPreviewLinkBlocked: (featureLabel: string) => void;
  onClose: () => void;
}

export const RADIAL_DIRECTIONS: readonly RadialDirection[] = ['north', 'east', 'south', 'west'];

/**
 * Pure builder for the 4 cardinal radial menu deep-link items (12시 대화, 3시 NAS, 6시 SEDMS, 9시 메일).
 * Uses ONLY existing SGW / SEDMS / bmail deep-link contracts.
 */
export function buildRadialMenuActions(target: RadialTarget): RadialMenuItem[] {
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
 * Pure keyboard direction resolver for the 4-way radial menu.
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
 * Clamps radial menu center inside viewport bounds so buttons never clip off-screen (even at 375px).
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

const DIRECTION_OFFSET_CLASS: Record<RadialDirection, string> = {
  north: 'left-1/2 top-0 -translate-x-1/2',
  east: 'right-0 top-1/2 -translate-y-1/2',
  south: 'left-1/2 bottom-0 -translate-x-1/2',
  west: 'left-0 top-1/2 -translate-y-1/2',
};

const DIRECTION_ICON: Record<RadialDirection, React.ReactNode> = {
  north: <MessageSquare className="h-4 w-4 text-sky-300 shrink-0" aria-hidden="true" />,
  east: <Building2 className="h-4 w-4 text-teal-300 shrink-0" aria-hidden="true" />,
  south: <FolderKanban className="h-4 w-4 text-emerald-300 shrink-0" aria-hidden="true" />,
  west: <Mail className="h-4 w-4 text-indigo-300 shrink-0" aria-hidden="true" />,
};

export const RadialActionMenu: React.FC<RadialActionMenuProps> = ({
  target,
  runtimeEnv,
  viewportSize,
  onBoardShip,
  onPreviewLinkBlocked,
  onClose,
}) => {
  const [activeDir, setActiveDir] = useState<RadialDirection>('north');
  const itemRefs = useRef<Partial<Record<RadialDirection, HTMLAnchorElement | null>>>({});

  const items = useMemo(() => (target ? buildRadialMenuActions(target) : []), [target]);
  const isPreview = runtimeEnv === 'preview';

  useEffect(() => {
    if (!target) return;
    setActiveDir('north');
    const raf = window.requestAnimationFrame(() => {
      itemRefs.current.north?.focus();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [target]);

  if (!target) return null;

  const vp = viewportSize ?? {
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  };
  const center = clampRadialCenter(target.anchor, vp, 132);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }

    const nextDir = resolveRadialDirectionFromKey(e.key, activeDir);
    if (nextDir) {
      e.preventDefault();
      setActiveDir(nextDir);
      itemRefs.current[nextDir]?.focus();
      return;
    }

    if (e.key === 'Enter' || e.key === ' ') {
      const focusedItem = items.find((item) => item.direction === activeDir);
      if (focusedItem && isPreview) {
        e.preventDefault();
        onPreviewLinkBlocked(focusedItem.previewFeatureLabel);
      }
    }
  };

  const title = target.kind === 'person' ? target.person.name : target.ship.name;
  const subLabel =
    target.kind === 'person'
      ? `${target.person.dept} · ${target.person.online ? '접속 중' : '오프라인'}`
      : `${target.ship.code} · ${target.ship.appearance.statusLabelKo}`;

  return (
    <div
      className="fixed inset-0 z-40 bg-slate-950/45"
      role="dialog"
      aria-modal="true"
      aria-label={`${title} 4방향 빠른 메뉴`}
      data-testid="radial-action-menu"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        className="fixed h-64 w-64 -translate-x-1/2 -translate-y-1/2"
        style={{ left: `${center.x}px`, top: `${center.y}px` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Subtle compass ring backdrop */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-6 rounded-full border border-sky-400/35 bg-slate-950/70 shadow-2xl"
        />

        {/* Center target hub */}
        <div className="absolute left-1/2 top-1/2 z-10 flex w-28 -translate-x-1/2 -translate-y-1/2 flex-col items-center rounded-2xl border border-slate-600 bg-slate-900 px-2 py-2 text-center shadow-xl">
          <div className="flex items-center justify-center gap-1 text-xs font-bold text-white max-w-full">
            {target.kind === 'person' ? (
              target.person.online ? (
                <Wifi className="h-3.5 w-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
              ) : (
                <WifiOff className="h-3.5 w-3.5 text-slate-400 shrink-0" aria-hidden="true" />
              )
            ) : (
              <Ship className="h-3.5 w-3.5 text-sky-400 shrink-0" aria-hidden="true" />
            )}
            <span className="truncate">{title}</span>
          </div>
          <p className="mt-0.5 truncate text-[10px] text-slate-300 max-w-full">{subLabel}</p>

          <div className="mt-1.5 flex items-center gap-1">
            {target.kind === 'ship' && onBoardShip && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onBoardShip(target.ship.id);
                }}
                aria-label={`${target.ship.name} 승선 패널 열기`}
                className="inline-flex min-h-[28px] items-center gap-1 rounded-md bg-sky-700 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-sky-600 focus-visible:outline-2 focus-visible:outline-sky-300"
              >
                <Anchor className="h-3 w-3" aria-hidden="true" />
                승선
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="래디얼 메뉴 닫기"
              className="inline-flex min-h-[28px] min-w-[28px] items-center justify-center rounded-md border border-slate-700 bg-slate-800 p-1 text-slate-200 hover:bg-slate-700 hover:text-white focus-visible:outline-2 focus-visible:outline-sky-300"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* 4 Cardinal Action Nodes: 12시 대화 / 3시 NAS / 6시 SEDMS / 9시 메일 */}
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
              className={`absolute ${DIRECTION_OFFSET_CLASS[item.direction]} z-20 flex min-h-[48px] min-w-[74px] flex-col items-center justify-center rounded-xl border px-2.5 py-1.5 text-center shadow-lg transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 ${
                isFocused
                  ? 'border-sky-400 bg-sky-900 text-white scale-105'
                  : 'border-slate-600 bg-slate-900 text-slate-100 hover:border-sky-400 hover:bg-slate-800'
              }`}
            >
              <div className="flex items-center gap-1 text-xs font-bold whitespace-nowrap">
                {DIRECTION_ICON[item.direction]}
                <span>{item.label}</span>
              </div>
              <span className="mt-0.5 text-[10px] font-medium text-slate-300">
                {item.clockLabel}
              </span>
            </a>
          );
        })}

        {/* Screen-reader / keyboard helper hint */}
        <div className="sr-only">
          <User aria-hidden="true" />
          방향키로 12시 대화, 3시 NAS, 6시 SEDMS, 9시 메일을 선택하고 Enter로 실행, Esc로 닫기
        </div>
      </div>
    </div>
  );
};
