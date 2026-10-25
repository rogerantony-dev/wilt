import { coinsForDay, bankedCoins, pendingCoins, coinBalance, nextRungBelow, LADDER, isCleanDay, streaks, computeProgress } from "./progress";
import type { WiltDay } from "../modules/wiltnative";

const day = (date: string, seconds: number, limitMinutes?: number): WiltDay => ({
  date, seconds, count: 0, shorts: 0, ...(limitMinutes !== undefined ? { limitMinutes } : {}),
});

const mins = (m: number) => m * 60;

// A day with `s` seconds of short-form time, and the same on a given date.
const cday = (s: number): WiltDay => day("2026-10-25", s);
const d = (date: string, s: number): WiltDay => day(date, s);

describe("coinsForDay", () => {
  it("pays 50 for a day with no short-form time", () => expect(coinsForDay(cday(0))).toBe(50));
  it("falls in a straight line to 0 at 45 minutes", () => {
    expect(coinsForDay(cday(9 * 60))).toBe(40);
    expect(coinsForDay(cday(22 * 60))).toBe(26);
    expect(coinsForDay(cday(44 * 60))).toBe(1);
    expect(coinsForDay(cday(45 * 60))).toBe(0);
    expect(coinsForDay(cday(90 * 60))).toBe(0);
  });
  it("ignores the day's limit", () =>
    expect(coinsForDay({ ...cday(10 * 60), limitMinutes: 5 })).toBe(coinsForDay({ ...cday(10 * 60), limitMinutes: 60 })));
});

describe("bankedCoins / pendingCoins / coinBalance", () => {
  it("banks only days before today", () =>
    expect(bankedCoins([d("2026-10-23", 0), d("2026-10-24", 45 * 60), d("2026-10-25", 0)], "2026-10-25")).toBe(50));
  it("pends 50 when today has no record, else today's live value", () => {
    expect(pendingCoins([], "2026-10-25")).toBe(50);
    expect(pendingCoins([d("2026-10-25", 9 * 60)], "2026-10-25")).toBe(40);
  });
  it("never goes below zero", () => expect(coinBalance(100, 250)).toBe(0));
  it("subtracts what was spent", () => expect(coinBalance(340, 100)).toBe(240));
});

describe("nextRungBelow", () => {
  it("returns the next lower ladder value", () => {
    expect(nextRungBelow(60)).toBe(45);
    expect(nextRungBelow(30)).toBe(15);
    expect(nextRungBelow(15)).toBe(10);
    expect(nextRungBelow(10)).toBe(5);
  });
  it("returns null at or below the floor", () => {
    expect(nextRungBelow(5)).toBeNull();
    expect(nextRungBelow(3)).toBeNull();
  });
  it("steps a legacy limit above the ladder down onto it", () => {
    expect(nextRungBelow(120)).toBe(60);
  });
  it("returns the next lower rung for an off-ladder value", () => {
    expect(nextRungBelow(50)).toBe(45);
  });
});

describe("LADDER", () => {
  it("is the descending limit ladder", () => {
    expect(LADDER).toEqual([60, 45, 30, 15, 10, 5]);
  });
});

describe("isCleanDay", () => {
  it("is clean when seconds are at or under the day's own limit", () => {
    expect(isCleanDay(day("2026-07-01", 60 * 60, 60), 30)).toBe(true); // exactly at limit
    expect(isCleanDay(day("2026-07-01", 60 * 60 + 1, 60), 30)).toBe(false);
  });
  it("falls back to the current limit when the day has no recorded limit", () => {
    expect(isCleanDay(day("2026-07-01", 20 * 60), 30)).toBe(true);
    expect(isCleanDay(day("2026-07-01", 40 * 60), 30)).toBe(false);
  });
  it("treats a zero-activity day as clean", () => {
    expect(isCleanDay(day("2026-07-01", 0), 30)).toBe(true);
  });
});

describe("streaks", () => {
  it("counts consecutive clean days ending today", () => {
    const h = [day("2026-07-05", 5 * 60, 30), day("2026-07-06", 5 * 60, 30), day("2026-07-07", 5 * 60, 30)];
    expect(streaks(h, "2026-07-07", 30).current).toBe(3);
  });
  it("breaks the current streak on an over-limit day but keeps the best run", () => {
    const h = [
      day("2026-07-01", 5 * 60, 30), day("2026-07-02", 5 * 60, 30), day("2026-07-03", 5 * 60, 30),
      day("2026-07-04", 99 * 60, 30), // over -> breaks
      day("2026-07-05", 5 * 60, 30), day("2026-07-06", 5 * 60, 30),
    ];
    const s = streaks(h, "2026-07-06", 30);
    expect(s.current).toBe(2);
    expect(s.best).toBe(3);
  });
  it("counts an untracked/missing today as not-yet-broken (streak up to yesterday)", () => {
    const h = [day("2026-07-05", 5 * 60, 30), day("2026-07-06", 5 * 60, 30)];
    // today 07-07 has no record yet; the run through yesterday still stands.
    expect(streaks(h, "2026-07-07", 30).current).toBe(2);
  });
  it("breaks the current streak when a day in the middle is missing (gap = not clean)", () => {
    const h = [day("2026-07-04", 5 * 60, 30), day("2026-07-06", 5 * 60, 30), day("2026-07-07", 5 * 60, 30)];
    // 07-05 missing -> the run ending today is only 06,07.
    expect(streaks(h, "2026-07-07", 30).current).toBe(2);
  });
});

const clean7 = (limit: number, startDay: number) =>
  Array.from({ length: 7 }, (_, i) =>
    day(`2026-07-${String(startDay + i).padStart(2, "0")}`, 60, limit)
  );

describe("computeProgress", () => {
  const noneSeen = { lastCelebratedStreakMilestone: 0 };

  it("offers a level-down after a fresh 7-day streak above the floor", () => {
    const p = computeProgress(clean7(60, 1), 60, "2026-07-07", noneSeen);
    expect(p.streak).toBe(7);
    expect(p.pendingLevelDown).toEqual({ from: 60, to: 45, milestone: 7 });
  });

  it("does not re-offer a milestone already celebrated", () => {
    const p = computeProgress(clean7(60, 1), 60, "2026-07-07", { lastCelebratedStreakMilestone: 7 });
    expect(p.pendingLevelDown).toBeNull();
  });

  it("never offers a level-down at the 5-minute floor", () => {
    const p = computeProgress(clean7(5, 1), 5, "2026-07-07", noneSeen);
    expect(p.pendingLevelDown).toBeNull();
  });

  it("banks completed days as coins and keeps today pending", () => {
    // 7 days at 60s (1 minute): 49 coins each. Today (the 7th) is not banked.
    const p = computeProgress(clean7(15, 1), 15, "2026-07-07", noneSeen);
    expect(p.coins).toBe(6 * 49);
    expect(p.pendingCoins).toBe(49);
  });
});
