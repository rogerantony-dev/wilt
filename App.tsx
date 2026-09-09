import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  BackHandler,
  Image,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";


import { CatGallery } from "./components/CatGallery";
import { HistoryScreen } from "./components/HistoryScreen";
import { OnboardingFlow } from "./components/Onboarding";
import { PaymentPauseScreen } from "./components/PaymentPause";
import { Brand, C, Kicker } from "./components/console";
import {
  consumeOpenCats,
  dismissPaymentPause,
  getHistory,
  getStatus,
  grantExtraMinute,
  markPointsCelebrated,
  markStreakCelebrated,
  resumeAfterPayment,
  setLimit,
  setMode,
  setUnlockedCats,
  type WiltMode,
  type WiltStatus,
} from "./modules/wiltnative";
import { computeProgress, type Progress } from "./components/progress";
import { CATS, CAT_THRESHOLDS } from "./components/cats";
import { ProgressStrip } from "./components/ProgressStrip";
import { MilestoneModal } from "./components/MilestoneModal";
import { Sheet } from "./components/Sheet";
import { KitCatClock } from "./components/KitCatClock";
import "./global.css";

/** Matches the native pill curve: calm under ~10 min, fully red by ~50. */
function rednessForMinutes(minutes: number): number {
  return Math.min(1, Math.max(0, (minutes - 10) / 40));
}

function vibe(minutes: number): { title: string; sub: string } {
  if (minutes < 1)
    return { title: "Clock's clean.", sub: "No time wasted yet today. Look at you." };
  if (minutes < 5)
    return { title: "Just a peek.", sub: "A couple minutes in. Willpower intact." };
  if (minutes < 15)
    return { title: "Clock's ticking.", sub: "The scroll is starting to pull." };
  if (minutes < 30)
    return { title: "Time's slipping.", sub: "That's a real chunk of today. Stretch?" };
  if (minutes < 60)
    return { title: "Deep in it.", sub: "Most of an hour, gone. Go touch grass." };
  if (minutes < 120)
    return { title: "Where'd the day go?", sub: "Over an hour scrolling. Outside. Now." };
  return {
    title: "Bruh.",
    sub: "2+ hours scrolling. What are you even doing with your life?",
  };
}

/** Device-local "yyyy-mm-dd", matching the native SimpleDateFormat. */
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** Runs once on mount; the returned cleanup runs on unmount. */
function useMountEffect(effect: () => void | (() => void)) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(effect, []);
}

export default function App() {
  const [status, setStatus] = useState<WiltStatus | null>(() => getStatus());
  const [confirmGuilt, setConfirmGuilt] = useState(false);
  const [screen, setScreen] = useState<"home" | "history">("home");
  const [catsOpen, setCatsOpen] = useState(false);
  const [limitPickerOpen, setLimitPickerOpen] = useState(false);
  const [milestone, setMilestone] = useState<{
    kind: "streak" | "cats";
    streak: number;
    unlockedCats: number;
    levelDown: { from: number; to: number } | null;
  } | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Read the latest screen from a ref so the back-handler subscribes once
  // (mount-only) rather than re-subscribing on every navigation.
  const screenRef = useRef(screen);
  screenRef.current = screen;

  const refresh = useCallback(() => setStatus(getStatus()), []);

  // The accessibility service sets an openCats flag when "Watch a cat instead"
  // is tapped on a nudge; consume it on resume and open the gallery.
  const checkOpenCats = useCallback(() => {
    if (consumeOpenCats()) setCatsOpen(true);
  }, []);

  // Poll status for a few seconds after coming to the foreground. The
  // accessibility service writes its "connected" heartbeat a beat after you
  // flip the toggle, so a single read on resume can miss it and the setup
  // would look incomplete until the next app switch. We stop early once both
  // permissions are live (so the tick lands and onboarding hands off to home).
  const syncStatus = useCallback(() => {
    if (pollRef.current) clearTimeout(pollRef.current);
    let attempts = 0;
    const tick = () => {
      const next = getStatus();
      setStatus(next);
      const ready = next?.overlay === true && next?.accessibilityRunning === true;
      if (ready || (attempts += 1) >= 8) {
        pollRef.current = null;
        // Android 13+ needs this before the "paused for <payment app>" reminder
        // can show. Asked once setup is complete, when the reason is easy to
        // see; a no-op once answered.
        if (ready && Platform.OS === "android") {
          PermissionsAndroid.request("android.permission.POST_NOTIFICATIONS").catch(() => {});
        }
        return;
      }
      pollRef.current = setTimeout(tick, 500);
    };
    tick();
  }, []);

  useMountEffect(() => {
    syncStatus();
    checkOpenCats();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        syncStatus();
        checkOpenCats();
      }
    });
    const backSub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (screenRef.current === "history") {
        setScreen("home");
        return true;
      }
      return false;
    });
    return () => {
      subscription.remove();
      backSub.remove();
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  });

  const overlayDone = status?.overlay === true;
  const accessibilityDone = status?.accessibilityRunning === true;
  const allReady = overlayDone && accessibilityDone;
  // The service switched itself off for a payment app; offer the way back on
  // instead of dropping the user into first-run setup.
  const paymentPauseApp = !accessibilityDone ? status?.paymentPauseApp ?? null : null;

  const resumeFromPause = useCallback(() => {
    // Direct re-enable (adb-granted secure settings) reflects in status within a
    // beat; the Settings route reflects on the next app resume via syncStatus.
    if (resumeAfterPayment()) syncStatus();
  }, [syncStatus]);

  const dismissPause = useCallback(() => {
    dismissPaymentPause();
    refresh();
  }, [refresh]);
  const mode: WiltMode = status?.mode ?? "guilt";
  const seconds = status?.todaySeconds ?? 0;
  const count = status?.todayCount ?? 0;
  const shorts = status?.todayShorts ?? 0;
  const limit = status?.limitMinutes ?? 30;
  const pendingLimit = status?.pendingLimit ?? 0;
  const autoBlocked = status?.autoBlocked ?? false;
  const graceLeft = status?.graceLeft ?? 0;

  // Progression is a pure function of history + the current limit + which
  // moments have already been shown. Recomputed whenever status refreshes.
  const progress: Progress = useMemo(
    () =>
      computeProgress(getHistory(), limit, localToday(), CAT_THRESHOLDS, {
        lastCelebratedStreakMilestone: status?.lastCelebratedStreakMilestone ?? 0,
        lastPointsCelebrated: status?.lastPointsCelebrated ?? 0,
      }),
    [status, limit]
  );

  // The accessibility service shows cats too (the nudge card, the block cover),
  // and it must only ever show ones you've earned. The thresholds and the points
  // maths live here, so mirror the count over whenever it changes.
  useEffect(() => {
    setUnlockedCats(progress.unlockedCount);
  }, [progress.unlockedCount]);

  // Surface one pending moment when the app opens. A streak offer outranks cats.
  useMountEffect(() => {
    if (progress.pendingLevelDown) {
      setMilestone({
        kind: "streak",
        streak: progress.pendingLevelDown.milestone,
        unlockedCats: 0,
        levelDown: { from: progress.pendingLevelDown.from, to: progress.pendingLevelDown.to },
      });
    } else if (progress.pendingCatUnlocks.length) {
      setMilestone({
        kind: "cats",
        streak: progress.streak,
        unlockedCats: progress.pendingCatUnlocks.length,
        levelDown: null,
      });
    }
  });

  const changeMode = useCallback(
    (next: WiltMode) => {
      if (next === mode) return;
      // Leaving Block mode is the moment of weakness, so make them confirm.
      if (mode === "block" && next === "guilt") {
        setConfirmGuilt(true);
        return;
      }
      setMode(next);
      refresh();
    },
    [mode, refresh]
  );

  const giveIn = useCallback(() => {
    setMode("guilt");
    setConfirmGuilt(false);
    refresh();
  }, [refresh]);

  const changeLimit = useCallback(
    (minutes: number) => {
      setLimit(minutes);
      // A lower (or same) applies now, so dismiss; a raise is deferred, so keep
      // the sheet open to show the "starts tomorrow" note.
      if (minutes <= limit) setLimitPickerOpen(false);
      refresh();
    },
    [limit, refresh]
  );

  const grantMinute = useCallback(() => {
    grantExtraMinute();
    refresh();
  }, [refresh]);

  return (
    <View className="flex-1 bg-ink">
      <SafeAreaView className="flex-1">
        <StatusBar style="light" />
        {Platform.OS !== "android" ? (
          <View className="grow px-6 pt-4">
            <Brand on={false} />
            <View className="mt-10 rounded-3xl bg-panel p-6">
              <Text className="text-[15px] leading-6 text-ash">
                The Reel counter is Android only. It relies on Android's overlay
                and accessibility features. Install the Android build to use it.
              </Text>
            </View>
          </View>
        ) : allReady ? (
          <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1 }}>
            <View className="grow px-6 pb-7 pt-4">
              <View className="flex-row items-center justify-between">
                <Brand on={true} />
                <LimitChip value={limit} onPress={() => setLimitPickerOpen(true)} />
              </View>
              <ProgressStrip
                streak={progress.streak}
                best={progress.best}
                points={progress.points}
                pendingPoints={progress.pendingPoints}
                onPress={() => setScreen("history")}
              />
              <Dashboard
                mode={mode}
                seconds={seconds}
                count={count}
                shorts={shorts}
                limit={limit}
                autoBlocked={autoBlocked}
                graceLeft={graceLeft}
                unlockedCount={progress.unlockedCount}
                onGrantMinute={grantMinute}
                onChangeMode={changeMode}
                onOpenHistory={() => setScreen("history")}
                onOpenCats={() => setCatsOpen(true)}
              />
            </View>
          </ScrollView>
        ) : paymentPauseApp ? (
          <PaymentPauseScreen
            app={paymentPauseApp}
            canAutoResume={status?.canAutoResume === true}
            onResume={resumeFromPause}
            onDismiss={dismissPause}
          />
        ) : (
          <OnboardingFlow
            overlayDone={overlayDone}
            accessibilityDone={accessibilityDone}
          />
        )}
      </SafeAreaView>

      <PushThroughModal
        visible={confirmGuilt}
        onKeepBlocking={() => setConfirmGuilt(false)}
        onGiveIn={giveIn}
      />

      <CatGallery
        visible={catsOpen}
        onClose={() => setCatsOpen(false)}
        unlockedCount={progress.unlockedCount}
      />

      <MilestoneModal
        visible={milestone !== null}
        kind={milestone?.kind ?? null}
        streak={milestone?.streak ?? 0}
        unlockedCats={milestone?.unlockedCats ?? 0}
        levelDown={milestone?.levelDown ?? null}
        onAcceptLevelDown={() => {
          if (milestone?.levelDown) setLimit(milestone.levelDown.to);
          if (milestone?.kind === "streak") markStreakCelebrated(milestone.streak);
          setMilestone(null);
          refresh();
        }}
        onDismiss={() => {
          if (milestone?.kind === "streak") markStreakCelebrated(milestone.streak);
          if (milestone?.kind === "cats") markPointsCelebrated(progress.points);
          setMilestone(null);
          refresh();
        }}
      />

      <HistoryScreen
        visible={screen === "history"}
        onClose={() => setScreen("home")}
      />

      <LimitPicker
        visible={limitPickerOpen}
        value={limit}
        pendingLimit={pendingLimit}
        onPick={changeLimit}
        onClose={() => setLimitPickerOpen(false)}
      />
    </View>
  );
}

const WASTE = "#E0913C"; // time burned (guilt)
const OVER = "#D2542F"; // past the limit
const LIMIT_OPTIONS = [15, 30, 45, 60, 90, 120];

/** "45m" / "1h" / "1h 30m" from a minute count. */
function fmtLimit(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function Dashboard({
  mode,
  seconds,
  count,
  shorts,
  limit,
  autoBlocked,
  graceLeft,
  unlockedCount,
  onGrantMinute,
  onChangeMode,
  onOpenHistory,
  onOpenCats,
}: {
  mode: WiltMode;
  seconds: number;
  count: number;
  shorts: number;
  limit: number;
  autoBlocked: boolean;
  graceLeft: number;
  unlockedCount: number;
  onGrantMinute: () => void;
  onChangeMode: (mode: WiltMode) => void;
  onOpenHistory: () => void;
  onOpenCats: () => void;
}) {
  const minutes = Math.floor(seconds / 60);
  // Once today's limit is crossed we stay on the limit page for the rest of the
  // day (seconds only climb), even while a granted grace minute briefly unblocks
  // reels — so the Guilt/Block switcher doesn't flash back mid-session.
  const limitReached = mode === "guilt" && seconds >= limit * 60;

  return (
    <View className="grow">
      {limitReached ? (
        <AutoBlockedHero minutes={minutes} limit={limit} />
      ) : mode === "guilt" ? (
        <GuiltHero minutes={minutes} count={count} shorts={shorts} limit={limit} />
      ) : (
        <BlockHero count={count} unlockedCount={unlockedCount} />
      )}

      {limitReached ? (
        <View className="mt-8 gap-3">
          {graceLeft > 0 ? (
            <Pressable
              onPress={onGrantMinute}
              className="flex-row items-center justify-center gap-2 rounded-2xl border border-bone/15 py-4 active:opacity-70"
            >
              <Ionicons name="add-circle-outline" size={16} color={C.bone} />
              <Text className="text-[14px] font-semibold text-bone">1 more minute</Text>
              <Text className="text-[12.5px] text-dim">· {graceLeft} left</Text>
            </Pressable>
          ) : null}
          <View className="flex-row items-center justify-center gap-2 rounded-2xl bg-panel py-4">
            <Ionicons name={autoBlocked ? "lock-closed" : "time-outline"} size={15} color={C.dim} />
            <Text className="text-[14px] font-medium text-ash">
              {autoBlocked ? "Blocked · unlocks at midnight" : "Extra minute · reels open"}
            </Text>
          </View>
        </View>
      ) : (
        <View className="mt-8">
          <ModeSwitch mode={mode} onChangeMode={onChangeMode} />
        </View>
      )}

      <View style={{ marginTop: "auto", flexDirection: "row", gap: 12, paddingTop: 24 }}>
        <TrayButton icon="paw" label="Cats" onPress={onOpenCats} />
        <TrayButton icon="bar-chart" label="History" onPress={onOpenHistory} />
      </View>
    </View>
  );
}

function AutoBlockedHero({ minutes, limit }: { minutes: number; limit: number }) {
  const wasted =
    minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return (
    <View className="mt-14">
      <View
        className="h-[72px] w-[72px] items-center justify-center rounded-full"
        style={{ backgroundColor: "rgba(56,199,134,0.14)" }}
      >
        <Ionicons name="shield-checkmark" size={32} color={C.toxic} />
      </View>
      <Kicker color={C.toxic} style={{ marginTop: 20 }}>
        Limit reached · blocked
      </Kicker>
      <Text
        className="mt-3 text-[32px] font-semibold text-bone"
        style={{ letterSpacing: -0.6, lineHeight: 36 }}
      >
        Walled off{"\n"}till midnight.
      </Text>
      <Text className="mt-2.5 text-[15px] leading-snug text-ash">
        You hit your {fmtLimit(limit)} limit today. Every reel and short gets
        bounced for the rest of the day.
      </Text>
      <View className="mt-7 flex-row items-baseline gap-2.5">
        <Text
          className="text-[34px] font-semibold"
          style={{ color: OVER, letterSpacing: -0.8, fontVariant: ["tabular-nums"] }}
        >
          {wasted}
        </Text>
        <Text className="text-[14px] text-ash">wasted today</Text>
      </View>
    </View>
  );
}

function GuiltHero({
  minutes,
  count,
  shorts,
  limit,
}: {
  minutes: number;
  count: number;
  shorts: number;
  limit: number;
}) {
  const over = minutes > limit;
  const numColor = over ? OVER : WASTE;
  return (
    <View className="mt-11">
      <View className="flex-row items-baseline">
        <Text
          className="font-semibold"
          style={{ fontSize: 88, lineHeight: 86, letterSpacing: -3, color: numColor, fontVariant: ["tabular-nums"] }}
        >
          {minutes}
        </Text>
        <Text className="ml-2.5 text-dim" style={{ fontSize: 21, fontWeight: "500" }}>
          min wasted today
        </Text>
      </View>
      <View className="mt-7 items-center">
        <KitCatClock usedMinutes={minutes} limitMinutes={limit} />
      </View>
      <Text className="mt-6 text-[22px] font-semibold text-bone" style={{ letterSpacing: -0.4 }}>
        {vibe(minutes).title}
      </Text>
      <Counts count={count} shorts={shorts} />
    </View>
  );
}

function BlockHero({ count, unlockedCount }: { count: number; unlockedCount: number }) {
  // One of the cats you have earned, picked once when the screen mounts so it
  // does not reshuffle on every status refresh. The first cat is always free.
  const [pick] = useState(() => Math.floor(Math.random() * Math.max(1, unlockedCount)));
  const cat = CATS[Math.min(pick, CATS.length - 1)];
  return (
    <View className="mt-14">
      <Image
        source={cat.src}
        resizeMode="cover"
        accessibilityLabel="One of your unlocked cats"
        style={{ width: 132, height: 132, borderRadius: 24 }}
      />
      <Text className="mt-6 text-[32px] font-semibold text-bone" style={{ letterSpacing: -0.6, lineHeight: 36 }}>
        Reels can't{"\n"}reach you.
      </Text>
      <Text className="mt-2.5 text-[15px] leading-snug text-ash">
        Every reel and short gets bounced the second it appears.
      </Text>
      <View className="mt-7 flex-row items-baseline gap-2.5">
        <Text
          className="text-[40px] font-semibold text-toxic"
          style={{ letterSpacing: -1, fontVariant: ["tabular-nums"] }}
        >
          {count}
        </Text>
        <Text className="text-[14px] text-ash">
          {count === 1 ? "reel" : "reels"} bounced today
        </Text>
      </View>
    </View>
  );
}

function Counts({ count, shorts }: { count: number; shorts: number }) {
  return (
    <View className="mt-3 flex-row gap-5">
      <CountItem color={WASTE} value={count} unit={count === 1 ? "reel" : "reels"} />
      <CountItem color="rgba(224,145,60,0.35)" value={shorts} unit={shorts === 1 ? "short" : "shorts"} />
    </View>
  );
}

function CountItem({ color, value, unit }: { color: string; value: number; unit: string }) {
  return (
    <View className="flex-row items-center gap-2">
      <View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: color }} />
      <Text className="text-[14px] text-ash">
        <Text className="font-semibold text-bone">{value}</Text> {unit}
      </Text>
    </View>
  );
}

function TrayButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-panel py-4 active:opacity-80"
    >
      <Ionicons name={icon} size={18} color={C.bone} />
      <Text className="text-[15px] font-semibold text-bone">{label}</Text>
    </Pressable>
  );
}

function LimitChip({ value, onPress }: { value: number; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-1.5 rounded-full bg-panel px-3.5 py-2 active:opacity-80"
    >
      <Text className="text-[12.5px] font-medium text-ash">
        Limit <Text className="font-semibold text-bone">{fmtLimit(value)}</Text>
      </Text>
      <Ionicons name="chevron-down" size={13} color={C.dim} />
    </Pressable>
  );
}

function LimitPicker({
  visible,
  value,
  pendingLimit,
  onPick,
  onClose,
}: {
  visible: boolean;
  value: number;
  pendingLimit: number;
  onPick: (minutes: number) => void;
  onClose: () => void;
}) {
  return (
    <Sheet visible={visible} onDismiss={onClose}>
        <View className="gap-1.5">
          <Text className="text-[21px] font-semibold text-bone">Daily limit</Text>
          <Text className="text-[14px] leading-snug text-ash">
            Cross it and Wilt blocks the reels.
          </Text>
          <View className="mt-4 flex-row flex-wrap justify-between gap-y-2.5">
            {LIMIT_OPTIONS.map((m) => {
              const sel = m === value;
              const isPending = pendingLimit > 0 && m === pendingLimit;
              return (
                <Pressable
                  key={m}
                  onPress={() => onPick(m)}
                  className="w-[31%] items-center rounded-2xl border py-4 active:opacity-80"
                  style={{
                    backgroundColor: sel ? "rgba(224,145,60,0.14)" : "transparent",
                    borderColor: sel ? WASTE : isPending ? "rgba(224,145,60,0.45)" : "rgba(242,241,236,0.10)",
                    borderStyle: isPending && !sel ? "dashed" : "solid",
                  }}
                >
                  <Text
                    className="text-[16px] font-semibold"
                    style={{ color: sel || isPending ? WASTE : C.bone }}
                  >
                    {fmtLimit(m)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {pendingLimit > 0 ? (
            <View className="mt-4 flex-row items-center gap-2.5 rounded-2xl bg-ink/50 px-3.5 py-3">
              <Ionicons name="time-outline" size={15} color={C.ash} />
              <Text className="flex-1 text-[12.5px] leading-snug text-ash">
                <Text className="font-semibold text-bone">{fmtLimit(pendingLimit)}</Text> starts
                tomorrow. Today stays at {fmtLimit(value)}.
              </Text>
            </View>
          ) : (
            <Text className="mt-4 text-[12px] leading-snug text-dim">
              Lowering is instant. Raising takes effect at tomorrow's reset.
            </Text>
          )}
        </View>
    </Sheet>
  );
}

function ModeSwitch({
  mode,
  onChangeMode,
}: {
  mode: WiltMode;
  onChangeMode: (mode: WiltMode) => void;
}) {
  return (
    <View className="gap-3">
      <View className="flex-row gap-1 rounded-2xl bg-panel p-1">
        <ModeOption
          active={mode === "guilt"}
          icon="stopwatch-outline"
          label="Guilt"
          onPress={() => onChangeMode("guilt")}
        />
        <ModeOption
          active={mode === "block"}
          icon="shield-checkmark"
          label="Block"
          accent
          onPress={() => onChangeMode("block")}
        />
      </View>
      <Text className="px-0.5 text-[13.5px] leading-snug text-ash">
        {mode === "guilt"
          ? "Guilt. Watch all you want, the clock keeps time."
          : "Block. Wilt backs you out of every reel and short."}
      </Text>
    </View>
  );
}

function ModeOption({
  active,
  icon,
  label,
  accent,
  onPress,
}: {
  active: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  accent?: boolean;
  onPress: () => void;
}) {
  const activeBg = accent ? "bg-toxic" : "bg-panelhi";
  const iconColor = active ? (accent ? C.ink : C.bone) : C.ash;
  const textClass = active ? (accent ? "text-ink" : "text-bone") : "text-ash";
  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 flex-row items-center justify-center gap-2 rounded-xl py-3 ${
        active ? activeBg : ""
      }`}
    >
      <Ionicons name={icon} size={17} color={iconColor} />
      <Text className={`text-[14.5px] font-semibold ${textClass}`}>{label}</Text>
    </Pressable>
  );
}

function PushThroughModal({
  visible,
  onKeepBlocking,
  onGiveIn,
}: {
  visible: boolean;
  onKeepBlocking: () => void;
  onGiveIn: () => void;
}) {
  return (
    // A swipe down counts as "keep blocking"; the backdrop stays inert so the
    // choice is deliberate rather than a stray tap.
    <Sheet visible={visible} onDismiss={onKeepBlocking} dismissOnBackdrop={false}>
        <View className="gap-5">
          <View className="gap-2">
            <Kicker>Leaving block mode</Kicker>
            <Text className="text-[24px] font-semibold text-bone" style={{ letterSpacing: -0.4 }}>
              Going soft already?
            </Text>
            <Text className="text-[14.5px] leading-6 text-ash">
              You're in Block mode and the reels can't touch you. Switch back and
              you're choosing to feed the addiction. Why not just push through?
            </Text>
          </View>
          <View className="gap-2.5">
            <Pressable
              onPress={onKeepBlocking}
              className="items-center rounded-2xl bg-toxic py-4 active:opacity-80"
            >
              <Text className="text-[15.5px] font-semibold text-ink">Keep blocking</Text>
            </Pressable>
            <Pressable
              onPress={onGiveIn}
              className="items-center rounded-2xl py-3 active:opacity-60"
            >
              <Text className="text-[15px] font-medium text-dim">I'll give in</Text>
            </Pressable>
          </View>
        </View>
    </Sheet>
  );
}

