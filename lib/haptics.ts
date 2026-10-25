/**
 * Optional bridge to the platform's haptic engine, and Wilt's whole haptic
 * vocabulary in one place.
 *
 * On Android every feel goes through `performHapticFeedback` constants
 * (`performAndroidHapticsAsync`) rather than raw vibration: those are the
 * short, crisp clicks the system itself uses, tuned per device and silenced by
 * the user's own haptics setting. On iOS each maps onto the nearest generator.
 *
 * Rules that keep it graceful:
 *  - A control owns its haptic (a button taps, a switch clicks on or off), so
 *    handlers do not add a second one on top.
 *  - Near-simultaneous feels collapse: within a short window only a stronger
 *    one gets through, so nothing ever double-buzzes.
 *  - Strong feels (confirm, reject) are kept for moments that mean something.
 *
 * `expo-haptics` is resolved lazily and every caller falls back to doing
 * nothing, so a missing package is silence rather than a crash.
 */
import { Platform } from 'react-native';

interface HapticsModule {
  selectionAsync: () => Promise<void>;
  impactAsync: (style?: unknown) => Promise<void>;
  notificationAsync?: (type?: unknown) => Promise<void>;
  performAndroidHapticsAsync?: (type: unknown) => Promise<void>;
  ImpactFeedbackStyle?: Record<string, unknown>;
  NotificationFeedbackType?: Record<string, unknown>;
}

let resolved = false;
let module: HapticsModule | null = null;

/**
 * The haptics module, or null when it is not installed or the platform has no
 * engine behind it. Resolved once and cached — a failed require is not retried
 * on every keystroke.
 */
function getHaptics(): HapticsModule | null {
  if (resolved) return module;
  resolved = true;

  // Web has no haptic engine; the Vibration API is a different thing and a
  // worse one — a buzz where a tick was meant.
  if (Platform.OS === 'web') return null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    module = require('expo-haptics') as HapticsModule;
  } catch {
    module = null;
  }

  return module;
}

/** Whether a haptic will actually be felt. */
export function hasHaptics(): boolean {
  return getHaptics() !== null;
}

/**
 * - `tick`: moving between choices (a tab, a slider step, a page).
 * - `tap`: pressing a button.
 * - `toggleOn` / `toggleOff`: a switch flipping.
 * - `settle`: something coming to rest (a sheet catching after a drag).
 * - `confirm`: a commitment landing (Block on, a limit lowered, Wilt back on).
 * - `reject`: giving in, or being refused.
 */
export type Haptic = 'tick' | 'tap' | 'toggleOn' | 'toggleOff' | 'settle' | 'confirm' | 'reject';

const RANK: Record<Haptic, number> = {
  tick: 0,
  tap: 1,
  toggleOn: 1,
  toggleOff: 1,
  settle: 1,
  confirm: 2,
  reject: 2,
};

// Android constants by the API level that introduced them. Older phones get
// the closest one they have instead of silence.
function androidType(kind: Haptic): string {
  const api = typeof Platform.Version === 'number' ? Platform.Version : 0;
  switch (kind) {
    case 'tick':
      return api >= 34 ? 'segment-tick' : 'clock-tick';
    case 'tap':
      return 'virtual-key';
    case 'toggleOn':
      return api >= 34 ? 'toggle-on' : 'virtual-key';
    case 'toggleOff':
      return api >= 34 ? 'toggle-off' : 'clock-tick';
    case 'settle':
      return api >= 30 ? 'gesture-end' : 'clock-tick';
    case 'confirm':
      return api >= 30 ? 'confirm' : 'virtual-key';
    case 'reject':
      return api >= 30 ? 'reject' : 'long-press';
  }
}

function playIOS(haptics: HapticsModule, kind: Haptic): Promise<void> {
  const impact = haptics.ImpactFeedbackStyle ?? {};
  const note = haptics.NotificationFeedbackType ?? {};
  switch (kind) {
    case 'tick':
      return haptics.selectionAsync();
    case 'tap':
    case 'toggleOn':
      return haptics.impactAsync(impact.Light);
    case 'toggleOff':
    case 'settle':
      return haptics.impactAsync(impact.Soft ?? impact.Light);
    case 'confirm':
      return haptics.notificationAsync?.(note.Success) ?? haptics.impactAsync(impact.Medium);
    case 'reject':
      return haptics.notificationAsync?.(note.Warning) ?? haptics.impactAsync(impact.Rigid);
  }
}

// Collapse window: a second feel this soon only plays if it is stronger.
const COLLAPSE_MS = 80;
let lastAt = 0;
let lastRank = -1;

/** Play one feel from the vocabulary. Fire-and-forget; failures are ignored. */
export function feel(kind: Haptic): void {
  const haptics = getHaptics();
  if (!haptics) return;
  const now = Date.now();
  if (now - lastAt < COLLAPSE_MS && RANK[kind] <= lastRank) return;
  lastAt = now;
  lastRank = RANK[kind];
  const play =
    Platform.OS === 'android' && haptics.performAndroidHapticsAsync
      ? haptics.performAndroidHapticsAsync(androidType(kind))
      : playIOS(haptics, kind);
  void play?.catch(() => {});
}

/** The light tick for moving between options. Kept for the PanelUI primitives. */
export function selectionTick(): void {
  feel('tick');
}

/** Something landing or catching, like a sheet that stays after a drag. */
export function impactKnock(): void {
  feel('settle');
}
