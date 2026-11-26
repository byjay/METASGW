/**
 * WCAG 2.1 relative luminance & contrast ratio verification utilities
 * for METASGW UI color tokens (AA normal text >= 4.5:1).
 */

export interface ContrastPair {
  name: string;
  foregroundHex: string;
  backgroundHex: string;
  minRatio: number;
}

function parseHexRgb(hex: string): [number, number, number] {
  const clean = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
    throw new Error(`Invalid 6-digit hex color: ${hex}`);
  }
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function channelToLinear(channel8Bit: number): number {
  const s = channel8Bit / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHexRgb(hex);
  return (
    0.2126 * channelToLinear(r) +
    0.7152 * channelToLinear(g) +
    0.0722 * channelToLinear(b)
  );
}

export function contrastRatio(fgHex: string, bgHex: string): number {
  const l1 = relativeLuminance(fgHex);
  const l2 = relativeLuminance(bgHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function meetsWcagAA(fgHex: string, bgHex: string, minRatio = 4.5): boolean {
  return contrastRatio(fgHex, bgHex) >= minRatio;
}

/**
 * Active foreground/background Tailwind token pairs used across METASGW UI.
 * All normal-text pairs enforce >= 4.5:1 (WCAG 2.1 AA).
 */
export const UI_CONTRAST_PAIRS: readonly ContrastPair[] = [
  { name: 'Primary action button (white on sky-700)', foregroundHex: '#ffffff', backgroundHex: '#0369a1', minRatio: 4.5 },
  { name: 'Active emerald button (white on emerald-700)', foregroundHex: '#ffffff', backgroundHex: '#047857', minRatio: 4.5 },
  { name: 'Primary heading (white on slate-950)', foregroundHex: '#ffffff', backgroundHex: '#020617', minRatio: 4.5 },
  { name: 'Primary body (slate-100 on slate-950)', foregroundHex: '#f1f5f9', backgroundHex: '#020617', minRatio: 4.5 },
  { name: 'Secondary body (slate-300 on slate-900)', foregroundHex: '#cbd5e1', backgroundHex: '#0f172a', minRatio: 4.5 },
  { name: 'Muted label (slate-400 on slate-900)', foregroundHex: '#94a3b8', backgroundHex: '#0f172a', minRatio: 4.5 },
  { name: 'Preview demo badge (amber-200 on slate-950)', foregroundHex: '#fde68a', backgroundHex: '#020617', minRatio: 4.5 },
  { name: 'Toast banner (amber-100 on slate-950)', foregroundHex: '#fef3c7', backgroundHex: '#020617', minRatio: 4.5 },
  { name: 'Active status badge (sky-200 on slate-900)', foregroundHex: '#bae6fd', backgroundHex: '#0f172a', minRatio: 4.5 },
  { name: 'Hold status badge (rose-200 on slate-900)', foregroundHex: '#fecdd3', backgroundHex: '#0f172a', minRatio: 4.5 },
  { name: 'Completed status badge (emerald-200 on slate-900)', foregroundHex: '#a7f3d0', backgroundHex: '#0f172a', minRatio: 4.5 },
];
