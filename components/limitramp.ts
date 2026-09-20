import { LIMIT_OPTIONS } from "./progress";

/**
 * One colour per rung of the limit ladder, following the floating pill's curve:
 * calm (green) under ten minutes, fully red by an hour. Picking more time
 * visibly costs more. Block is always plain green, the safe end of this scale.
 */
export const LIMIT_RAMP: Record<number, string> = {
  5: "#38C786",
  10: "#5EC46E",
  15: "#B9BE4A",
  30: "#E0913C",
  45: "#DB6F35",
  60: "#D2542F",
};

/** Colour for a limit. Off-ladder values snap to the next rung up, or red past the top. */
export function limitColor(minutes: number): string {
  const rung = LIMIT_OPTIONS.find((r) => r >= minutes) ?? LIMIT_OPTIONS[LIMIT_OPTIONS.length - 1];
  return LIMIT_RAMP[rung];
}

/** One line under the track, specific to the ends of the ladder. */
export function limitHint(minutes: number): string {
  const floor = LIMIT_OPTIONS[0];
  const top = LIMIT_OPTIONS[LIMIT_OPTIONS.length - 1];
  if (minutes <= floor) return "The tightest rung. Nothing left to earn.";
  if (minutes >= top) return "An hour a day is seven a week.";
  return "Clean weeks earn a rung down.";
}

/** "#RRGGBB" with an alpha, for tints of the rung colour. */
export function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
