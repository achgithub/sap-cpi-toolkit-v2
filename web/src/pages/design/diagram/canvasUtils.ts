export const NODE_W = 160
export const NODE_H = 100
export const SNAP   = 20

export type Point = { x: number; y: number }

export function borderPoint(
  cx: number, cy: number,
  tx: number, ty: number,
  w: number,  h: number,
): Point {
  const dx = tx - cx, dy = ty - cy
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return { x: cx, y: cy }
  const sx = dx !== 0 ? (w / 2) / Math.abs(dx) : Infinity
  const sy = dy !== 0 ? (h / 2) / Math.abs(dy) : Infinity
  const s  = Math.min(sx, sy)
  return { x: cx + dx * s, y: cy + dy * s }
}

export function snap(v: number) { return Math.round(v / SNAP) * SNAP }
