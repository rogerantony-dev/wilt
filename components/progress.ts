import type { WiltDay } from "../modules/wiltnative";
import { toDayIndex } from "./history";

export const LADDER = [60, 45, 30, 15, 10, 5] as const;

/** The same rungs, ascending, for the limit pickers. */
export const LIMIT_OPTIONS: number[] = [...LADDER].reverse();

/** The most a single day can be worth, however little you scrolled. */
export const MAX_POINTS_PER_DAY = 50;

/**
 * What one day earned: the share of your limit you did NOT spend, scaled to
 * MAX_POINTS_PER_DAY. Nothing scrolled pays the full 50, half your limit pays
 * 25, reaching the limit pays nothing.
 *
 * This is deliberately independent of which rung of the ladder you are on. The
 * old table paid by limit alone (10/day at 120 minutes, 100/day at 15), so
 * tightening the limit inflated the score even if behaviour never changed, and
 * scrolling 29 of 30 minutes scored exactly the same as scrolling none.
 */
export function pointsForDay(day: WiltDay, currentLimit: number): number {
  const limit = day.limitMinutes ?? currentLimit;
  if (limit <= 0) return 0;
  const spent = day.seconds / (limit * 60);
  const earned = Math.round(MAX_POINTS_PER_DAY * (1 - spent));
  return Math.max(0, Math.min(MAX_POINTS_PER_DAY, earned));
}

/** The next tighter rung below `limitMinutes`, or null at/below the 5-min floor. */
export function nextRungBelow(limitMinutes: number): number | null {
  const lower = LADDER.filter((r) => r < limitMinutes);
  return lower.length ? Math.max(...lower) : null;
}

/** A day is clean when its short-form seconds are at or under that day's limit. */
export function isCleanDay(day: WiltDay, currentLimit: number): boolean {
  const limit = day.limitMinutes ?? currentLimit;
  return day.seconds <= limit * 60;
}

/**
 * Lifetime points: what every recorded day earned, added up. Over-limit days
 * are not skipped, they simply earn nothing, so there is no cliff between a day
 * just under the limit and one just over.
 */
export function lifetimePoints(history: WiltDay[], currentLimit: number): number {
  let total = 0;
  for (const d of history) total += pointsForDay(d, currentLimit);
  return total;
}

/**
 * Current streak (consecutive clean days ending at/just before `today`) and the
 * best contiguous clean run in history. "Contiguous" = adjacent calendar days;
 * a missing day is a gap that ends a run. A missing `today` does not break the
 * run (the day isn't over yet) so we count back from the latest recorded day.
 */
export function streaks(
  history: WiltDay[],
  today: string,
  currentLimit: number
): { current: number; best: number } {
  const clean = new Map<number, boolean>();
  for (const d of history) clean.set(toDayIndex(d.date), isCleanDay(d, currentLimit));

  // Best: longest run of consecutive clean day-indices.
  const indices = [...clean.keys()].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  let prev: number | null = null;
  for (const i of indices) {
    if (!clean.get(i)) { run = 0; prev = i; continue; }
    run = prev !== null && i === prev + 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = i;
  }

  // Current: count back from today; if today has no record, start at yesterday.
  const todayIdx = toDayIndex(today);
  let cursor = clean.has(todayIdx) ? todayIdx : todayIdx - 1;
  let current = 0;
  while (clean.get(cursor) === true) {
    current += 1;
    cursor -= 1;
  }
  return { current, best };
}

export type ProgressSeen = {
  lastCelebratedStreakMilestone: number;
  lastPointsCelebrated: number;
};

/**
 * Points from days that are over. Today is never banked: its value keeps
 * shrinking as you scroll, so counting it would hand out a full day's points
 * the moment the app is installed and then take them back all afternoon.
 */
export function bankedPoints(history: WiltDay[], today: string, currentLimit: number): number {
  return lifetimePoints(history.filter((d) => d.date < today), currentLimit);
}

/**
 * What today is on course to add: its points as they stand right now, or the
 * full daily maximum when nothing has been recorded yet. Banked at midnight.
 */
export function pendingPoints(history: WiltDay[], today: string, currentLimit: number): number {
  const live = history.find((d) => d.date === today);
  return live ? pointsForDay(live, currentLimit) : MAX_POINTS_PER_DAY;
}

export type Progress = {
  streak: number;
  best: number;
  /** Lifetime points from completed days. Only these unlock cats. */
  points: number;
  /** Today's points so far, banked at midnight. */
  pendingPoints: number;
  limit: number;
  nextRung: number | null;
  unlockedCount: number;
  pendingLevelDown: { from: number; to: number; milestone: number } | null;
  pendingCatUnlocks: number[];
};

/**
 * Everything the home screen needs, derived purely from history + the current
 * limit + which moments have already been shown (so celebrations never re-fire).
 */
export function computeProgress(
  history: WiltDay[],
  currentLimit: number,
  today: string,
  catThresholds: number[],
  seen: ProgressSeen
): Progress {
  const { current: streak, best } = streaks(history, today, currentLimit);
  const points = bankedPoints(history, today, currentLimit);
  const pending = pendingPoints(history, today, currentLimit);
  const nextRung = nextRungBelow(currentLimit);

  // Banked points only ever grow, so unlocking is one-way by construction. The
  // celebrated high-water mark is still honoured for anyone who unlocked under
  // the old rule, when today's live points counted.
  const unlockedAt = Math.max(points, seen.lastPointsCelebrated);
  const unlockedCount = catThresholds.filter((t) => t <= unlockedAt).length;

  const pendingLevelDown =
    streak > 0 && streak % 7 === 0 && nextRung !== null && streak > seen.lastCelebratedStreakMilestone
      ? { from: currentLimit, to: nextRung, milestone: streak }
      : null;

  const pendingCatUnlocks = catThresholds
    .filter((t) => t > seen.lastPointsCelebrated && t <= points)
    .sort((a, b) => a - b);

  return {
    streak,
    best,
    points,
    pendingPoints: pending,
    limit: currentLimit,
    nextRung,
    unlockedCount,
    pendingLevelDown,
    pendingCatUnlocks,
  };
}
