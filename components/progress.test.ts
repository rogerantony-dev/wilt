import { pointsForDay, MAX_POINTS_PER_DAY, nextRungBelow, LADDER, isCleanDay, lifetimePoints, bankedPoints, pendingPoints, streaks, computeProgress } from "./progress";
import type { WiltDay } from "../modules/wiltnative";

const day = (date: string, seconds: number, limitMinutes?: number): WiltDay => ({
  date, seconds, count: 0, shorts: 0, ...(limitMinutes !== undefined ? { limitMinutes } : {}),
});

const mins = (m: number) => m * 60;

describe("pointsForDay", () => {
  it("pays the full daily maximum for a day with no short-form time", () => {
    expect(pointsForDay(day("2026-07-01", 0, 30), 30)).toBe(MAX_POINTS_PER_DAY);
    expect(MAX_POINTS_PER_DAY).toBe(50);
  });

  it("scales with the share of the limit left unspent", () => {
    expect(pointsForDay(day("2026-07-01", mins(8), 30), 30)).toBe(37);
    expect(pointsForDay(day("2026-07-01", mins(15), 30), 30)).toBe(25);
    expect(pointsForDay(day("2026-07-01", mins(27), 30), 30)).toBe(5);
  });

  it("pays nothing at the limit or beyond it", () => {
    expect(pointsForDay(day("2026-07-01", mins(30), 30), 30)).toBe(0);
    expect(pointsForDay(day("2026-07-01", mins(90), 30), 30)).toBe(0);
  });

  it("scores the same behaviour identically whichever limit you picked", () => {
    // The old table paid 10/day at a 120-min limit and 100/day at 15. Now a
    // clean day is a clean day: what varies is how much you actually scrolled.
    expect(pointsForDay(day("2026-07-01", 0, 120), 120)).toBe(MAX_POINTS_PER_DAY);
    expect(pointsForDay(day("2026-07-01", 0, 15), 15)).toBe(MAX_POINTS_PER_DAY);
  });

  it("uses the day's own recorded limit, falling back to the current one", () => {
    expect(pointsForDay(day("2026-07-01", mins(30), 60), 30)).toBe(25);
    expect(pointsForDay(day("2026-07-01", mins(15)), 30)).toBe(25);
  });

  it("never divides by a zero or negative limit", () => {
    expect(pointsForDay(day("2026-07-01", mins(5), 0), 0)).toBe(0);
    expect(pointsForDay(day("2026-07-01", mins(5), -10), 30)).toBe(0);
  });
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

describe("lifetimePoints", () => {
  it("sums each day's earnings using that day's own limit", () => {
    // 10 of 60 spent -> 42; 10 of 30 spent -> 33
    const h = [day("2026-07-01", mins(10), 60), day("2026-07-02", mins(10), 30)];
    expect(lifetimePoints(h, 30)).toBe(42 + 33);
  });

  it("contributes nothing for over-limit days rather than skipping them", () => {
    const h = [day("2026-07-01", mins(90), 60), day("2026-07-02", mins(0), 30)];
    expect(lifetimePoints(h, 30)).toBe(MAX_POINTS_PER_DAY);
  });

  it("caps a perfect day at the daily maximum", () => {
    const h = Array.from({ length: 4 }, (_, i) => day(`2026-07-0${i + 1}`, 0, 30));
    expect(lifetimePoints(h, 30)).toBe(4 * MAX_POINTS_PER_DAY);
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
  const thresholds = [0, 50, 150, 400];
  const noneSeen = { lastCelebratedStreakMilestone: 0, lastPointsCelebrated: 0 };

  it("offers a level-down after a fresh 7-day streak above the floor", () => {
    const p = computeProgress(clean7(60, 1), 60, "2026-07-07", thresholds, noneSeen);
    expect(p.streak).toBe(7);
    expect(p.pendingLevelDown).toEqual({ from: 60, to: 45, milestone: 7 });
  });

  it("does not re-offer a milestone already celebrated", () => {
    const seen = { lastCelebratedStreakMilestone: 7, lastPointsCelebrated: 0 };
    const p = computeProgress(clean7(60, 1), 60, "2026-07-07", thresholds, seen);
    expect(p.pendingLevelDown).toBeNull();
  });

  it("never offers a level-down at the 5-minute floor", () => {
    const p = computeProgress(clean7(5, 1), 5, "2026-07-07", thresholds, noneSeen);
    expect(p.pendingLevelDown).toBeNull();
  });

  it("reports newly crossed cat thresholds as pending unlocks (the free cat unlocks silently)", () => {
    // 7 days spending 1 of 15 minutes = 47/day. Today (the 7th) is not banked
    // yet, so 6 days = 282 pts -> crosses 0,50,150. The free cat (threshold 0)
    // is unlocked from install, so it never fires.
    const p = computeProgress(clean7(15, 1), 15, "2026-07-07", thresholds, noneSeen);
    expect(p.points).toBe(282);
    expect(p.pendingPoints).toBe(47);
    expect(p.unlockedCount).toBe(3);
    expect(p.pendingCatUnlocks).toEqual([50, 150]);
  });

  it("only reports thresholds crossed since last celebrated points", () => {
    const seen = { lastCelebratedStreakMilestone: 0, lastPointsCelebrated: 50 };
    const p = computeProgress(clean7(15, 1), 15, "2026-07-07", thresholds, seen);
    expect(p.pendingCatUnlocks).toEqual([150]);
  });

  it("does not bank today, so a fresh install has nothing to unlock and nothing to re-lock", () => {
    // Today alone: no completed day, so 0 banked. Nothing scrolled yet means a
    // full day is pending. Only the free cat is open and no card fires.
    const fresh = computeProgress([day("2026-07-07", 0, 30)], 30, "2026-07-07", thresholds, noneSeen);
    expect(fresh.points).toBe(0);
    expect(fresh.pendingPoints).toBe(MAX_POINTS_PER_DAY);
    expect(fresh.unlockedCount).toBe(1);
    expect(fresh.pendingCatUnlocks).toEqual([]);
    // Scrolling most of today drains the pending value but touches nothing banked.
    const slipped = computeProgress([day("2026-07-07", mins(29), 30)], 30, "2026-07-07", thresholds, noneSeen);
    expect(slipped.points).toBe(0);
    expect(slipped.pendingPoints).toBe(2);
    expect(slipped.unlockedCount).toBe(1);
  });

  it("still honours a celebrated high-water mark from the old rule", () => {
    const earned = { lastCelebratedStreakMilestone: 0, lastPointsCelebrated: 150 };
    const p = computeProgress([day("2026-07-07", mins(29), 30)], 30, "2026-07-07", thresholds, earned);
    expect(p.unlockedCount).toBe(3);
    expect(p.pendingCatUnlocks).toEqual([]);
  });
});

describe("bankedPoints / pendingPoints", () => {
  it("banks only days before today", () => {
    const h = [day("2026-07-05", 0, 30), day("2026-07-06", mins(15), 30), day("2026-07-07", 0, 30)];
    expect(bankedPoints(h, "2026-07-07", 30)).toBe(50 + 25);
    expect(pendingPoints(h, "2026-07-07", 30)).toBe(50);
  });
  it("pends the full day when today has no record yet", () => {
    expect(pendingPoints([day("2026-07-06", 0, 30)], "2026-07-07", 30)).toBe(MAX_POINTS_PER_DAY);
  });
});
