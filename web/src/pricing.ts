import type { PeakWindow } from "./api";

/** Matches server `hour_in_peak` (inclusive hour bounds; supports overnight windows). */
export function hourInPeak(hour: number, windows: PeakWindow[]): boolean {
  const h = ((hour % 24) + 24) % 24;
  for (const w of windows) {
    const s = ((w.start % 24) + 24) % 24;
    const e = ((w.end % 24) + 24) % 24;
    if (s <= e) {
      if (s <= h && h <= e) return true;
    } else if (h >= s || h <= e) {
      return true;
    }
  }
  return false;
}

/**
 * Time-weighted estimate (same algorithm as server) for live session cost from start time to now.
 */
export function estimateSessionCharge(
  startedAtIso: string,
  endMs: number,
  isPermanent: boolean,
  baseMember: number,
  baseVisitor: number,
  peakMult: number,
  windows: PeakWindow[],
): number {
  const start = new Date(startedAtIso);
  const end = new Date(endMs);
  if (Number.isNaN(start.getTime()) || end <= start) return 0;
  const base = isPermanent ? baseMember : baseVisitor;
  let total = 0;
  let t = start.getTime();
  const endT = end.getTime();
  while (t < endT) {
    const d = new Date(t);
    const nextHour = new Date(d);
    nextHour.setMinutes(0, 0, 0);
    nextHour.setHours(nextHour.getHours() + 1);
    let segEnd = Math.min(endT, nextHour.getTime());
    if (segEnd <= t) {
      segEnd = t + 1000;
    }
    const mins = (segEnd - t) / 60000;
    const h = d.getHours();
    const inPeak = hourInPeak(h, windows);
    const rate = inPeak ? Math.round(base * peakMult * 100) / 100 : base;
    total += (mins / 60) * rate;
    t = segEnd;
  }
  return Math.round(total * 100) / 100;
}
