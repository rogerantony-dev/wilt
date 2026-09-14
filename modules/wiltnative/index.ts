import { requireNativeModule } from "expo";

export type WiltMode = "guilt" | "block";

export type WiltStatus = {
  /** "Draw over other apps" permission granted. */
  overlay: boolean;
  /** Accessibility service toggled on in system settings. */
  accessibilityEnabled: boolean;
  /** Enabled AND the service has actually connected (i.e. working). */
  accessibilityRunning: boolean;
  /** Instagram Reels counted so far today. */
  todayCount: number;
  /** YouTube Shorts counted so far today. */
  todayShorts: number;
  /** Seconds spent on short-form players (reels + shorts) today. */
  todaySeconds: number;
  /** Current behavior: "guilt" counts reels, "block" bounces you out. */
  mode: WiltMode;
  /** Daily limit in effect today, in minutes. When crossed, surfaces turn red. */
  limitMinutes: number;
  /** A limit raise queued for the next daily reset, in minutes (0 if none). */
  pendingLimit: number;
  /** Right now, a guilt user is over their limit and reels are being bounced. */
  autoBlocked: boolean;
  /** "1 more minute" grants still available today (0-3). */
  graceLeft: number;
  /** Highest streak milestone already celebrated (so the moment doesn't re-fire). */
  lastCelebratedStreakMilestone: number;
  /** Lifetime points value at which cat-unlock reveals were last shown. */
  lastPointsCelebrated: number;
  /**
   * Label of the payment app the service switched itself off for (Paytm etc.
   * refuse to pay while a third-party accessibility service is enabled), or
   * null. Only set while the service is actually off.
   */
  paymentPauseApp: string | null;
  /** WRITE_SECURE_SETTINGS was granted over adb, so the app can re-enable itself. */
  canAutoResume: boolean;
  /** Usage access is granted too, so a pause ends the moment the payment app is left. */
  resumesOnLeave: boolean;
};

export type WiltDay = {
  /** Local calendar day, "yyyy-mm-dd". */
  date: string;
  /** Seconds on short-form players (reels + shorts) that day. */
  seconds: number;
  /** Instagram Reels counted that day. */
  count: number;
  /** YouTube Shorts counted that day. */
  shorts: number;
  /** Daily limit in effect that day, in minutes. Absent on days archived before this shipped. */
  limitMinutes?: number;
};

type NativeModule = {
  getStatus(): WiltStatus;
  setMode(mode: WiltMode): void;
  setLimit(minutes: number): void;
  setLimitNow(minutes: number): void;
  grantExtraMinute(): void;
  getHistory(): WiltDay[];
  consumeOpenCats(): boolean;
  markStreakCelebrated(milestone: number): void;
  markPointsCelebrated(points: number): void;
  setUnlockedCats(count: number): void;
  resumeAfterPayment(): boolean;
  dismissPaymentPause(): void;
};

// Lazily resolved so JS never crashes if the native module isn't present
// (e.g. running in a context without the dev build).
let nativeModule: NativeModule | null = null;
try {
  nativeModule = requireNativeModule<NativeModule>("Wilt");
} catch {
  nativeModule = null;
}

export function getStatus(): WiltStatus | null {
  if (!nativeModule) return null;
  try {
    return nativeModule.getStatus();
  } catch {
    return null;
  }
}

export function setMode(mode: WiltMode): void {
  if (!nativeModule) return;
  try {
    nativeModule.setMode(mode);
  } catch {
    // no-op if the native module isn't available
  }
}

export function setLimit(minutes: number): void {
  if (!nativeModule) return;
  try {
    nativeModule.setLimit(minutes);
  } catch {
    // no-op if the native module isn't available
  }
}

/** Set the limit immediately (no deferral). For the first-run onboarding pick. */
export function setLimitNow(minutes: number): void {
  if (!nativeModule) return;
  try {
    nativeModule.setLimitNow(minutes);
  } catch {
    // no-op if the native module isn't available
  }
}

/** Grant one more minute of budget today (max 3). Unblocks reels. */
export function grantExtraMinute(): void {
  if (!nativeModule) return;
  try {
    nativeModule.grantExtraMinute();
  } catch {
    // no-op if the native module isn't available
  }
}

export function getHistory(): WiltDay[] {
  if (!nativeModule) return [];
  try {
    return nativeModule.getHistory();
  } catch {
    return [];
  }
}

export function consumeOpenCats(): boolean {
  if (!nativeModule) return false;
  try {
    return nativeModule.consumeOpenCats();
  } catch {
    return false;
  }
}

export function markStreakCelebrated(milestone: number): void {
  if (!nativeModule) return;
  try {
    nativeModule.markStreakCelebrated(milestone);
  } catch {
    // no-op if the native module isn't available
  }
}

export function markPointsCelebrated(points: number): void {
  if (!nativeModule) return;
  try {
    nativeModule.markPointsCelebrated(points);
  } catch {
    // no-op if the native module isn't available
  }
}

/**
 * Tell the service how many gallery cats are unlocked, so the cats it shows on
 * the nudge and the block cover are drawn only from the earned ones. JS owns the
 * number (thresholds and points live in components/cats.ts + progress.ts).
 */
export function setUnlockedCats(count: number): void {
  if (!nativeModule) return;
  try {
    nativeModule.setUnlockedCats(count);
  } catch {
    // no-op if the native module isn't available
  }
}

/**
 * Turn the service back on after a payment pause. Returns true when it was
 * re-enabled directly (adb-granted WRITE_SECURE_SETTINGS); otherwise Settings >
 * Accessibility opens on Wilt's entry and the user flips the switch.
 */
export function resumeAfterPayment(): boolean {
  if (!nativeModule) return false;
  try {
    return nativeModule.resumeAfterPayment();
  } catch {
    return false;
  }
}

/** Forget the payment pause without re-enabling; the app shows plain setup instead. */
export function dismissPaymentPause(): void {
  if (!nativeModule) return;
  try {
    nativeModule.dismissPaymentPause();
  } catch {
    // no-op if the native module isn't available
  }
}
