import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Compass, Home, X } from 'lucide-react';
import { PORTAL_BUILDINGS } from '../core/navMeshEngine';
import type { HarborPerson, HarborShip } from '../mapping';
import type { HubBuildingPlacement } from '../meta/hubBuildingModel';
import { HOME_HARBOR_DECORATIVE_VESSELS } from '../scene/sceneryCatalog';
import type { ShipDisplayPrefsMap } from '../shipDisplayPrefs';

export interface HarborMiniMapProps {
  open: boolean;
  ships: HarborShip[];
  people: HarborPerson[];
  hubBuildings?: HubBuildingPlacement[];
  playerPose: { x: number; z: number; heading: number };
  cameraWorldTarget?: { x: number; z: number };
  shipDisplayPrefs?: ShipDisplayPrefsMap;
  activeShipId: string | null;
  onSelectShip: (ship: HarborShip) => void;
  onWalkToQuay: (x: number, z: number) => void;
  onPanToWorld?: (x: number, z: number) => void;
  onReturnHome?: () => void;
  onClose?: () => void;
}

export const MINIMAP_WORLD_BOUNDS = {
  minX: -82,
  maxX: 82,
  minZ: -38,
  maxZ: 68,
} as const;

export function worldToMinimap(
  wx: number,
  wz: number,
  width: number,
  height: number,
  offsetX = 0,
  offsetZ = 0,
): { px: number; py: number } {
  const { minX, maxX, minZ, maxZ } = MINIMAP_WORLD_BOUNDS;
  const px = ((wx - offsetX - minX) / (maxX - minX)) * width;
  const py = ((wz - offsetZ - minZ) / (maxZ - minZ)) * height;
  return { px, py };
}

export function minimapToWorld(
  px: number,
  py: number,
  width: number,
  height: number,
  offsetX = 0,
  offsetZ = 0,
): { wx: number; wz: number } {
  const { minX, maxX, minZ, maxZ } = MINIMAP_WORLD_BOUNDS;
  const wx = offsetX + minX + (px / width) * (maxX - minX);
  const wz = offsetZ + minZ + (py / height) * (maxZ - minZ);
  return { wx, wz };
}

/**
 * Pure keyboard navigation step helper for minimap ship selection.
 */
export function computeNextMinimapIndex(
  currentIndex: number,
  count: number,
  key: string,
): number {
  if (count <= 0) return -1;
  const safeIdx = currentIndex < 0 || currentIndex >= count ? 0 : currentIndex;
  if (key === 'ArrowRight' || key === 'ArrowDown') {
    return (safeIdx + 1) % count;
  }
  if (key === 'ArrowLeft' || key === 'ArrowUp') {
    return (safeIdx - 1 + count) % count;
  }
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return safeIdx;
}

const CANVAS_W = 216;
const CANVAS_H = 136;

export const HarborMiniMap: React.FC<HarborMiniMapProps> = ({
  open,
  ships,
  people,
  hubBuildings = [],
  playerPose,
  cameraWorldTarget,
  shipDisplayPrefs,
  activeShipId,
  onSelectShip,
  onWalkToQuay,
  onPanToWorld,
  onReturnHome,
  onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number>(() => {
    if (!activeShipId) return -1;
    return ships.findIndex((s) => s.id === activeShipId);
  });

  // Dynamic infinite-world window center: stay anchored on Home Harbor near origin,
  // and follow camera target seamlessly when exploring distant coastline (Req #12)
  const camX = cameraWorldTarget?.x ?? 0;
  const camZ = cameraWorldTarget?.z ?? 0;
  const awayFromHome = Math.hypot(camX, camZ) > 95;
  const viewOffsetX = awayFromHome ? camX : 0;
  const viewOffsetZ = awayFromHome ? camZ - 15 : 0;

  useEffect(() => {
    if (ships.length === 0 || activeShipId === null) {
      setFocusedIndex(-1);
      return;
    }
    const nextIdx = ships.findIndex((s) => s.id === activeShipId);
    setFocusedIndex(nextIdx);
  }, [activeShipId, ships]);

  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1. Infinite Ocean background
    ctx.fillStyle = '#082f49';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // 2. Endless coastal concrete quay line (z <= -2.5)
    const quayEdge = worldToMinimap(viewOffsetX, -2.5, CANVAS_W, CANVAS_H, viewOffsetX, viewOffsetZ).py;
    if (quayEdge > 0) {
      ctx.fillStyle = '#334155';
      ctx.fillRect(0, 0, CANVAS_W, Math.min(CANVAS_H, quayEdge));
      ctx.fillStyle = '#eab308';
      ctx.fillRect(0, Math.min(CANVAS_H, quayEdge) - 2, CANVAS_W, 2);
    }

    // 3. Home Harbor SGW Portal buildings
    for (const b of PORTAL_BUILDINGS) {
      const { px, py } = worldToMinimap(b.centerX, b.centerZ, CANVAS_W, CANVAS_H, viewOffsetX, viewOffsetZ);
      if (px < -12 || px > CANVAS_W + 12 || py < -12 || py > CANVAS_H + 12) continue;
      ctx.fillStyle = b.accentHex;
      ctx.fillRect(px - 6, py - 3.5, 12, 7);
    }

    // 3b. Hub Module Harbor Buildings (planned = dashed amber/slate, active = emerald/accent)
    for (const hb of hubBuildings) {
      const { px, py } = worldToMinimap(
        hb.lot.centerX,
        hb.lot.centerZ,
        CANVAS_W,
        CANVAS_H,
        viewOffsetX,
        viewOffsetZ,
      );
      if (px < -12 || px > CANVAS_W + 12 || py < -12 || py > CANVAS_H + 12) continue;
      if (hb.appearance.hasScaffolding) {
        ctx.fillStyle = 'rgba(100, 116, 139, 0.55)';
        ctx.fillRect(px - 5, py - 3, 10, 6);
        ctx.save();
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 1.5]);
        ctx.strokeRect(px - 5, py - 3, 10, 6);
        ctx.restore();
      } else {
        ctx.fillStyle = hb.appearance.accentHex;
        ctx.fillRect(px - 5, py - 3, 10, 6);
      }
    }

    // 4. Hero Decorative Landmarks (씨스타호 & FD-01) rendered as subtle amber markers
    for (const deco of HOME_HARBOR_DECORATIVE_VESSELS) {
      if (!deco.isHero) continue;
      const { px, py } = worldToMinimap(deco.x, deco.z, CANVAS_W, CANVAS_H, viewOffsetX, viewOffsetZ);
      if (px < -12 || px > CANVAS_W + 12 || py < -12 || py > CANVAS_H + 12) continue;
      ctx.fillStyle = 'rgba(245, 158, 11, 0.72)';
      ctx.fillRect(px - 5, py - 8, 10, 16);
    }

    // 5. Docked Business SEDMS project ships
    ships.forEach((ship, idx) => {
      const { px, py } = worldToMinimap(ship.berthX, ship.berthZ, CANVAS_W, CANVAS_H, viewOffsetX, viewOffsetZ);
      if (px < -20 || px > CANVAS_W + 20 || py < -20 || py > CANVAS_H + 20) return;
      const isFocused = idx === focusedIndex || ship.id === activeShipId;

      if (ship.appearance.hasDeckLights) {
        ctx.beginPath();
        ctx.arc(px, py, 12, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(251, 191, 36, 0.16)';
        ctx.fill();
      }

      if (isFocused) {
        ctx.beginPath();
        ctx.arc(px, py, 11, 0, Math.PI * 2);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.fillStyle = ship.appearance.flagHex;
      ctx.fillRect(px - 10, py - 4, 20, 8);

      const shortCode = ship.code.replace(/^VESSEL-/, '');
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 9px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(shortCode, px, py + 15);
    });

    // 6. Colleagues on quay
    for (const p of people) {
      if (p.isCurrentUser) continue;
      const { px, py } = worldToMinimap(p.position.x, p.position.z, CANVAS_W, CANVAS_H, viewOffsetX, viewOffsetZ);
      if (px < -6 || px > CANVAS_W + 6 || py < -6 || py > CANVAS_H + 6) continue;
      ctx.beginPath();
      ctx.arc(px, py, 2.6, 0, Math.PI * 2);
      ctx.fillStyle = p.online ? '#34d399' : '#64748b';
      ctx.fill();
    }

    // 7. Player avatar indicator
    const playerPt = worldToMinimap(playerPose.x, playerPose.z, CANVAS_W, CANVAS_H, viewOffsetX, viewOffsetZ);
    if (playerPt.px >= -6 && playerPt.px <= CANVAS_W + 6 && playerPt.py >= -6 && playerPt.py <= CANVAS_H + 6) {
      ctx.beginPath();
      ctx.arc(playerPt.px, playerPt.py, 4.2, 0, Math.PI * 2);
      ctx.fillStyle = '#38bdf8';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // 8. Camera focus reticle when exploring infinite coastline
    if (awayFromHome) {
      const camPt = worldToMinimap(camX, camZ, CANVAS_W, CANVAS_H, viewOffsetX, viewOffsetZ);
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(camPt.px, camPt.py, 6, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, [open, ships, people, hubBuildings, playerPose, focusedIndex, activeShipId, viewOffsetX, viewOffsetZ, awayFromHome, camX, camZ]);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width) * CANVAS_W;
      const py = ((e.clientY - rect.top) / rect.height) * CANVAS_H;

      let hitShip: HarborShip | null = null;
      let hitIdx = -1;
      let bestDist = 22;

      ships.forEach((ship, idx) => {
        const pt = worldToMinimap(ship.berthX, ship.berthZ, CANVAS_W, CANVAS_H, viewOffsetX, viewOffsetZ);
        const dist = Math.hypot(px - pt.px, py - pt.py);
        if (dist <= bestDist) {
          bestDist = dist;
          hitShip = ship;
          hitIdx = idx;
        }
      });

      if (hitShip) {
        setFocusedIndex(hitIdx);
        onSelectShip(hitShip);
        return;
      }

      const { wx, wz } = minimapToWorld(px, py, CANVAS_W, CANVAS_H, viewOffsetX, viewOffsetZ);
      if (awayFromHome && onPanToWorld) {
        onPanToWorld(wx, wz);
      } else if (wz < -2.5 && Math.abs(wx) <= 92) {
        onWalkToQuay(wx, wz);
      } else if (onPanToWorld) {
        onPanToWorld(wx, wz);
      }
    },
    [ships, onSelectShip, onWalkToQuay, onPanToWorld, viewOffsetX, viewOffsetZ, awayFromHome],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (ships.length === 0) return;

      if (
        e.key === 'ArrowRight' ||
        e.key === 'ArrowDown' ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowUp' ||
        e.key === 'Home' ||
        e.key === 'End'
      ) {
        e.preventDefault();
        setFocusedIndex((prev) => computeNextMinimapIndex(prev, ships.length, e.key));
        return;
      }

      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const target = ships[focusedIndex >= 0 ? focusedIndex : 0];
        if (target) {
          onSelectShip(target);
        }
      }
    },
    [ships, focusedIndex, onSelectShip],
  );

  if (!open) return null;

  const focusedShip =
    focusedIndex >= 0 && focusedIndex < ships.length ? ships[focusedIndex] : null;
  const focusedDisplayName = focusedShip
    ? shipDisplayPrefs?.[focusedShip.id]?.customName || focusedShip.name
    : null;

  return (
    <section
      aria-label="항구 미니맵"
      data-testid="harbor-minimap"
      className="fixed left-3 bottom-28 sm:bottom-24 md:bottom-20 z-30 w-56 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-slate-700/90 bg-slate-950/94 p-2.5 text-slate-100 shadow-2xl"
    >
      <div className="mb-1.5 flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 text-xs font-bold text-white min-w-0">
          <Compass className="h-3.5 w-3.5 text-sky-400 shrink-0" aria-hidden="true" />
          <span className="truncate">항구 미니맵</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="font-mono text-[9px] text-slate-400 tabular-nums">
            {Math.round(camX)},{Math.round(camZ)}
          </span>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="미니맵 닫기"
              className="rounded p-0.5 text-slate-300 hover:bg-slate-800 hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <div
        role="application"
        tabIndex={0}
        aria-label="항구 미니맵 캔버스 — 화살표 키로 배를 선택하고 Enter로 이동"
        data-testid="minimap-kbd-surface"
        onKeyDown={handleKeyDown}
        className="rounded-lg overflow-hidden border border-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          onClick={handleCanvasClick}
          className="block w-full h-auto cursor-pointer"
          aria-hidden="true"
        />
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-1 text-[11px] text-slate-300">
        {focusedShip ? (
          <>
            <span className="truncate font-mono text-sky-200" data-testid="minimap-focused-ship">
              {focusedDisplayName} ({focusedShip.code})
            </span>
            <button
              type="button"
              onClick={() => onSelectShip(focusedShip)}
              aria-label={`${focusedDisplayName} 배로 이동`}
              className="shrink-0 rounded bg-sky-700 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-sky-600 focus-visible:outline-2 focus-visible:outline-sky-400"
            >
              이동
            </button>
          </>
        ) : (
          <span className="truncate text-slate-400">
            {awayFromHome
              ? '외곽 해안 탐색 중'
              : ships.length > 0
                ? '본항 · 선택 선박 없음'
                : '정박 선박 없음'}
          </span>
        )}
      </div>

      {/* Return to Home Harbor Button (Requirement #12) */}
      {onReturnHome && (
        <button
          type="button"
          data-testid="minimap-return-home"
          onClick={onReturnHome}
          aria-label="본항으로 돌아가기"
          className="mt-1.5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] font-semibold text-sky-200 hover:border-sky-500/70 hover:bg-slate-800 hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400"
        >
          <Home className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span>본항으로 돌아가기</span>
        </button>
      )}
    </section>
  );
};
