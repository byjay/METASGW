import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Compass, X } from 'lucide-react';
import { PORTAL_BUILDINGS } from '../core/navMeshEngine';
import type { HarborPerson, HarborShip } from '../mapping';

export interface HarborMiniMapProps {
  open: boolean;
  ships: HarborShip[];
  people: HarborPerson[];
  playerPose: { x: number; z: number; heading: number };
  activeShipId: string | null;
  onSelectShip: (ship: HarborShip) => void;
  onWalkToQuay: (x: number, z: number) => void;
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
): { px: number; py: number } {
  const { minX, maxX, minZ, maxZ } = MINIMAP_WORLD_BOUNDS;
  const px = ((wx - minX) / (maxX - minX)) * width;
  const py = ((wz - minZ) / (maxZ - minZ)) * height;
  return { px, py };
}

export function minimapToWorld(
  px: number,
  py: number,
  width: number,
  height: number,
): { wx: number; wz: number } {
  const { minX, maxX, minZ, maxZ } = MINIMAP_WORLD_BOUNDS;
  const wx = minX + (px / width) * (maxX - minX);
  const wz = minZ + (py / height) * (maxZ - minZ);
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
  playerPose,
  activeShipId,
  onSelectShip,
  onWalkToQuay,
  onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number>(() => {
    if (!activeShipId) return -1;
    return ships.findIndex((s) => s.id === activeShipId);
  });

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

    // 1. Ocean background
    ctx.fillStyle = '#082f49';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // 2. Concrete quay apron (z from -38 to -2.5)
    const quayEdge = worldToMinimap(0, -2.5, CANVAS_W, CANVAS_H).py;
    ctx.fillStyle = '#334155';
    ctx.fillRect(0, 0, CANVAS_W, quayEdge);

    // Safety yellow waterfront edge line
    ctx.fillStyle = '#facc15';
    ctx.fillRect(0, quayEdge - 2, CANVAS_W, 2);

    // 3. SGW Portal buildings
    for (const b of PORTAL_BUILDINGS) {
      const { px, py } = worldToMinimap(b.centerX, b.centerZ, CANVAS_W, CANVAS_H);
      ctx.fillStyle = b.accentHex;
      ctx.fillRect(px - 6, py - 3.5, 12, 7);
    }

    // 4. Docked SEDMS project ships
    ships.forEach((ship, idx) => {
      const { px, py } = worldToMinimap(ship.berthX, ship.berthZ, CANVAS_W, CANVAS_H);
      const isFocused = idx === focusedIndex || ship.id === activeShipId;

      if (ship.appearance.hasDeckLights) {
        ctx.beginPath();
        ctx.arc(px, py, 13, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(251, 191, 36, 0.18)';
        ctx.fill();
      }

      if (isFocused) {
        ctx.beginPath();
        ctx.arc(px, py, 12, 0, Math.PI * 2);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Ship hull silhouette bar
      ctx.fillStyle = ship.appearance.flagHex;
      ctx.fillRect(px - 10, py - 4, 20, 8);

      // Tiny deck light dots if updated within 7 days
      if (ship.appearance.hasDeckLights) {
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(px - 6, py - 1.5, 2.5, 2.5);
        ctx.fillRect(px + 3.5, py - 1.5, 2.5, 2.5);
      }

      // Compact label (strips leading VESSEL- on 220px minimap canvas to avoid horizontal collision)
      const shortCode = ship.code.replace(/^VESSEL-/, '');
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 9px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(shortCode, px, py + 16);
    });

    // 5. Colleagues on quay
    for (const p of people) {
      if (p.isCurrentUser) continue;
      const { px, py } = worldToMinimap(p.position.x, p.position.z, CANVAS_W, CANVAS_H);
      ctx.beginPath();
      ctx.arc(px, py, 2.8, 0, Math.PI * 2);
      ctx.fillStyle = p.online ? '#34d399' : '#64748b';
      ctx.fill();
    }

    // 6. Player avatar indicator
    const playerPt = worldToMinimap(playerPose.x, playerPose.z, CANVAS_W, CANVAS_H);
    ctx.beginPath();
    ctx.arc(playerPt.px, playerPt.py, 4.2, 0, Math.PI * 2);
    ctx.fillStyle = '#38bdf8';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }, [open, ships, people, playerPose, focusedIndex, activeShipId]);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width) * CANVAS_W;
      const py = ((e.clientY - rect.top) / rect.height) * CANVAS_H;

      // Check ship hit first (generous 22px click target)
      let hitShip: HarborShip | null = null;
      let hitIdx = -1;
      let bestDist = 22;

      ships.forEach((ship, idx) => {
        const pt = worldToMinimap(ship.berthX, ship.berthZ, CANVAS_W, CANVAS_H);
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

      // Otherwise walk avatar to clicked quay location
      const { wx, wz } = minimapToWorld(px, py, CANVAS_W, CANVAS_H);
      if (wz < -2.5) {
        onWalkToQuay(wx, wz);
      }
    },
    [ships, onSelectShip, onWalkToQuay],
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

  return (
    <section
      aria-label="항구 미니맵"
      data-testid="harbor-minimap"
      className="fixed left-3 bottom-28 sm:bottom-24 md:bottom-20 z-30 w-56 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-slate-700/90 bg-slate-950/94 p-2.5 text-slate-100 shadow-2xl"
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-white">
          <Compass className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
          <span>항구 미니맵</span>
        </div>
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
              {focusedShip.name} ({focusedShip.code})
            </span>
            <button
              type="button"
              onClick={() => onSelectShip(focusedShip)}
              aria-label={`${focusedShip.name} 배로 이동`}
              className="shrink-0 rounded bg-sky-700 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-sky-600 focus-visible:outline-2 focus-visible:outline-sky-400"
            >
              이동
            </button>
          </>
        ) : (
          <span className="text-slate-400">
            {ships.length > 0 ? '선택된 선박 없음' : '정박 선박 없음'}
          </span>
        )}
      </div>
    </section>
  );
};
