import type { WiltDay } from "../modules/wiltnative";
import { toDayIndex } from "./history";

export const LADDER = [60, 45, 30, 15, 10, 5] as const;

/** The same rungs, ascending, for the limit pickers. */
export const LIMIT_OPTIONS: number[] = [...LADDER].reverse();

/** The most a single day can be worth, however little you scrolled. */
export const MAX_COINS_PER_DAY = 50;

/** Minutes of short-form time at which a day stops paying anything. */
export const COIN_ZERO_MINUTES = 45;

/**
 * What one day earned in coins: a straight line from MAX_COINS_PER_DAY at no
 * short-form time down to 0 at COIN_ZERO_MINUTES. Only minutes used count. The
 * day's limit plays no part, so tightening it never inflates the balance.
 */
export function coinsForDay(day: WiltDay): number {
  const earned = Math.round(MAX_COINS_PER_DAY * (1 - day.seconds / 60 / COIN_ZERO_MINUTES));
  return Math.max(0, Math.min(MAX_COINS_PER_DAY, earned));
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
};

/**
 * Coins from days that are over. Today is never banked: its value keeps
 * shrinking as you scroll, so counting it would hand out a full day's coins
 * the moment the app is installed and then take them back all afternoon.
 */
export function bankedCoins(history: WiltDay[], today: string): number {
  let total = 0;
  for (const d of history) if (d.date < today) total += coinsForDay(d);
  return total;
}

/**
 * What today is on course to add: its coins as they stand right now, or the
 * full daily maximum when nothing has been recorded yet. Banked at midnight.
 */
export function pendingCoins(history: WiltDay[], today: string): number {
  const live = history.find((d) => d.date === today);
  return live ? coinsForDay(live) : MAX_COINS_PER_DAY;
}

/** What you can spend: banked coins minus what the closet has taken, never below 0. */
export function coinBalance(banked: number, spent: number): number {
  return Math.max(0, banked - spent);
}

export type Progress = {
  streak: number;
  best: number;
  /** Coins from completed days (before spending). */
  coins: number;
  /** Today's coins so far, banked at midnight. */
  pendingCoins: number;
  limit: number;
  nextRung: number | null;
  pendingLevelDown: { from: number; to: number; milestone: number } | null;
};

/**
 * Everything the home screen needs, derived purely from history + the current
 * limit + which moments have already been shown (so celebrations never re-fire).
 */
export function computeProgress(
  history: WiltDay[],
  currentLimit: number,
  today: string,
  seen: ProgressSeen
): Progress {
  const { current: streak, best } = streaks(history, today, currentLimit);
  const nextRung = nextRungBelow(currentLimit);

  const pendingLevelDown =
    streak > 0 && streak % 7 === 0 && nextRung !== null && streak > seen.lastCelebratedStreakMilestone
      ? { from: currentLimit, to: nextRung, milestone: streak }
      : null;

  return {
    streak,
    best,
    coins: bankedCoins(history, today),
    pendingCoins: pendingCoins(history, today),
    limit: currentLimit,
    nextRung,
    pendingLevelDown,
  };
}
