import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AppState,
  BackHandler,
  PermissionsAndroid,
  Platform,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { ClosetSheet } from "./components/ClosetSheet";
import { CoinExplainer, type CoinOrigin } from "./components/CoinExplainer";
import { GoldCoin } from "./components/GoldCoin";
import { HistoryScreen } from "./components/HistoryScreen";
import { OnboardingFlow } from "./components/Onboarding";
import { PaymentPauseScreen } from "./components/PaymentPause";
import { Brand, C, Kicker } from "./components/console";
import {
  dismissPaymentPause,
  getHistory,
  getStatus,
  grantExtraMinute,
  markStreakCelebrated,
  resumeAfterPayment,
  setLimit,
  setMode,
  setSurface,
  addApp,
  removeApp,
  turnOnService,
  type WiltMode,
  type WiltStatus,
  type WiltSurface,
} from "./modules/wiltnative";
import { coinBalance, computeProgress, type Progress } from "./components/progress";
import { NO_OUTFIT, normalizeOutfit, type Outfit } from "./components/closet";
import { MilestoneModal } from "./components/MilestoneModal";
import { Sheet } from "./components/Sheet";
import { AppsSheet } from "./components/AppsSheet";
import { DiscHero } from "./components/DiscHero";
import { ChartIcon, ChevronDownIcon, HourglassIcon, LockIcon, PlusIcon, ShieldIcon, ShirtIcon, SlidersIcon, StopwatchIcon } from "./components/icons";
import { AmbientField, DayAccent } from "./components/AmbientField";
import { decayStage, stageT } from "./components/catdecay";
import { timeLeftState } from "./components/timeleft";
import { LimitSlider } from "./components/LimitSlider";
import { PanelUIProvider } from "./components/ui/panel-ui-provider";
import { Alert } from "./components/ui/alert";
import { Button } from "./components/ui/button";
import { AccentButton, GhostButton, GLASS, PrimaryButton } from "./components/kit";
import { feel } from "./lib/haptics";
import { Tabs } from "./components/ui/tabs";
import { Text } from "./components/ui/text";
import { Typography } from "./components/ui/typography";
import "./global.css";

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
  const [closetOpen, setClosetOpen] = useState(false);
  // The tile coin's place on screen while the explainer is up; null when shut.
  const [coinFrom, setCoinFrom] = useState<CoinOrigin | null>(null);
  const [limitPickerOpen, setLimitPickerOpen] = useState(false);
  const [appsOpen, setAppsOpen] = useState(false);
  const [milestone, setMilestone] = useState<{
    kind: "streak";
    streak: number;
    levelDown: { from: number; to: number } | null;
  } | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Read the latest screen from a ref so the back-handler subscribes once
  // (mount-only) rather than re-subscribing on every navigation.
  const screenRef = useRef(screen);
  screenRef.current = screen;

  const refresh = useCallback(() => setStatus(getStatus()), []);

  // Poll status for a few seconds after coming to the foreground. The
  // accessibility service writes its "connected" heartbeat a beat after you
  // flip the toggle, so a single read on resume can miss it and the setup
  // would look incomplete until the next app switch. We stop early once both
  // permissions are live (so the tick lands and onboarding hands off to home).
  const syncStatus = useCallback(() => {
    if (pollRef.current) clearTimeout(pollRef.current);
    // Wilt in front means the payment app is not: come back on by itself
    // where the app may do that, instead of waiting on a tap.
    const now = getStatus();
    if (now?.paymentPauseApp && now.canAutoResume) resumeAfterPayment();
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
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        syncStatus();
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
  // Whether the overlay permission was already granted when the app came up.
  // A fresh install has neither permission, so a missing overlay at launch
  // means this run goes through onboarding: hold on its send-off screen until
  // "Open Wilt" instead of swapping to the dashboard mid-page. (The overlay
  // check is synchronous; the accessibility flag can lag on a cold start, so
  // it is not the signal.)
  const setUpAtLaunch = useRef<boolean | null>(null);
  if (status && setUpAtLaunch.current === null) setUpAtLaunch.current = overlayDone;
  const [onboardingFinished, setOnboardingFinished] = useState(false);
  const showDashboard = allReady && (setUpAtLaunch.current !== false || onboardingFinished);
  // The service switched itself off for a payment app; offer the way back on
  // instead of dropping the user into first-run setup.
  const paymentPauseApp = !accessibilityDone ? status?.paymentPauseApp ?? null : null;

  const resumeFromPause = useCallback(() => {
    // Direct re-enable (adb-granted secure settings) reflects in status within a
    // beat; the Settings route reflects on the next app resume via syncStatus.
    if (resumeAfterPayment()) syncStatus();
  }, [syncStatus]);

  // Onboarding's switch: on directly where the app may do it, else Settings.
  const turnOn = useCallback(() => {
    if (turnOnService()) {
      feel("confirm");
      syncStatus();
    } else {
      feel("tap"); // off to Settings
    }
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
      computeProgress(getHistory(), limit, localToday(), {
        lastCelebratedStreakMilestone: status?.lastCelebratedStreakMilestone ?? 0,
      }),
    [status, limit]
  );
  // Coins banked from finished days, less what the closet has spent.
  const balance = coinBalance(progress.coins, status?.coinsSpent ?? 0);
  const owned = status?.ownedItems ?? [];
  // What the cat wears everywhere; a stale or unowned id draws as none.
  const outfit: Outfit = status ? normalizeOutfit(status.outfit, owned) : NO_OUTFIT;

  // Surface a pending streak offer when the app opens.
  useMountEffect(() => {
    if (!progress.pendingLevelDown) return;
    feel("confirm");
    setMilestone({
      kind: "streak",
      streak: progress.pendingLevelDown.milestone,
      levelDown: { from: progress.pendingLevelDown.from, to: progress.pendingLevelDown.to },
    });
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

  // The one colour on the home screen: the rung the day is on. Green while the
  // budget is healthy or the reels are walled, amber as it runs down, red past it.
  const accent =
    mode === "block"
      ? C.toxic
      : seconds >= limit * 60
        ? OVER
        : timeLeftState(Math.floor(seconds / 60), limit).color;

  // How far today has burned, for the ambient field: 0 untouched, 1 at the
  // limit. Block holds a calm mid-level since nothing is being spent.
  const burn = mode === "block" ? 0.35 : Math.min(1, seconds / Math.max(1, limit * 60));

  const toggleSurface = useCallback(
    (keys: WiltSurface[], on: boolean) => {
      for (const key of keys) setSurface(key, on);
      refresh();
    },
    [refresh]
  );

  const addGuardedApp = useCallback(
    (pkg: string) => {
      addApp(pkg);
      refresh();
    },
    [refresh]
  );

  const removeGuardedApp = useCallback(
    (pkg: string) => {
      removeApp(pkg);
      refresh();
    },
    [refresh]
  );

  const grantMinute = useCallback(() => {
    grantExtraMinute();
    refresh();
  }, [refresh]);

  return (
    <SafeAreaProvider>
    <DayAccent.Provider value={accent}>
    <PanelUIProvider>
      {/* SafeAreaView is not a core component, so it takes a style rather than a className. */}
      <SafeAreaView style={{ flex: 1 }}>
        <StatusBar style="light" />
        {Platform.OS !== "android" ? (
          <View className="grow px-6 pt-4">
            <Brand />
            <View className="mt-10 rounded-3xl bg-card p-6">
              <Typography type="body-sm" muted className="leading-6">
                The Reel counter is Android only. It relies on Android's overlay and accessibility
                features. Install the Android build to use it.
              </Typography>
            </View>
          </View>
        ) : showDashboard ? (
          <View className="flex-1 overflow-hidden px-6 pb-6 pt-4">
              <AmbientField color={accent} level={burn} />
              <View className="flex-row items-center justify-between">
                <Brand />
                <LimitChip value={limit} onPress={() => setLimitPickerOpen(true)} />
              </View>
              <Dashboard
                streak={progress.streak}
                coins={balance}
                pendingCoins={progress.pendingCoins}
                coinOpen={coinFrom !== null}
                outfit={outfit}
                mode={mode}
                seconds={seconds}
                count={count}
                shorts={shorts}
                limit={limit}
                autoBlocked={autoBlocked}
                graceLeft={graceLeft}
                onGrantMinute={grantMinute}
                onChangeMode={changeMode}
                onOpenHistory={() => setScreen("history")}
                onOpenCoin={setCoinFrom}
                onOpenCloset={() => setClosetOpen(true)}
                onOpenApps={() => setAppsOpen(true)}
              />
          </View>
        ) : paymentPauseApp ? (
          <PaymentPauseScreen
            app={paymentPauseApp}
            canAutoResume={status?.canAutoResume === true}
            resumesOnLeave={status?.resumesOnLeave === true}
            onResume={resumeFromPause}
            onDismiss={dismissPause}
          />
        ) : (
          <OnboardingFlow
            overlayDone={overlayDone}
            accessibilityDone={accessibilityDone}
            canTurnOn={status?.canAutoResume === true}
            onTurnOnService={turnOn}
            onFinish={() => setOnboardingFinished(true)}
          />
        )}
      </SafeAreaView>

      <PushThroughModal
        visible={confirmGuilt}
        onKeepBlocking={() => setConfirmGuilt(false)}
        onGiveIn={giveIn}
      />

      <ClosetSheet
        visible={closetOpen}
        onClose={() => setClosetOpen(false)}
        outfit={outfit}
        owned={owned}
        balance={balance}
        onChanged={refresh}
      />

      <CoinExplainer visible={coinFrom !== null} from={coinFrom} onClose={() => setCoinFrom(null)} />

      <MilestoneModal
        visible={milestone !== null}
        kind={milestone?.kind ?? null}
        streak={milestone?.streak ?? 0}
        levelDown={milestone?.levelDown ?? null}
        onAcceptLevelDown={() => {
          if (milestone?.levelDown) setLimit(milestone.levelDown.to);
          if (milestone?.kind === "streak") markStreakCelebrated(milestone.streak);
          setMilestone(null);
          refresh();
        }}
        onDismiss={() => {
          if (milestone?.kind === "streak") markStreakCelebrated(milestone.streak);
          setMilestone(null);
          refresh();
        }}
      />

      <HistoryScreen visible={screen === "history"} onClose={() => setScreen("home")} />

      <AppsSheet
        visible={appsOpen}
        surfaces={status?.surfaces ?? {}}
        pendingOff={status?.surfacesPendingOff ?? []}
        customApps={status?.customApps ?? []}
        onToggle={toggleSurface}
        onAddApp={addGuardedApp}
        onRemoveApp={removeGuardedApp}
        onClose={() => setAppsOpen(false)}
      />

      <LimitPicker
        visible={limitPickerOpen}
        value={limit}
        pendingLimit={pendingLimit}
        onPick={changeLimit}
        onClose={() => setLimitPickerOpen(false)}
      />
    </PanelUIProvider>
    </DayAccent.Provider>
    </SafeAreaProvider>
  );
}

const WASTE = "#E0913C"; // time burned (guilt)
const OVER = "#D2542F"; // past the limit

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
  streak,
  coins,
  pendingCoins,
  coinOpen,
  outfit,
  onGrantMinute,
  onChangeMode,
  onOpenHistory,
  onOpenCoin,
  onOpenCloset,
  onOpenApps,
}: {
  mode: WiltMode;
  seconds: number;
  count: number;
  shorts: number;
  limit: number;
  autoBlocked: boolean;
  graceLeft: number;
  streak: number;
  coins: number;
  pendingCoins: number;
  /** The explainer has the coin, so the tile's own coin hides. */
  coinOpen: boolean;
  outfit: Outfit;
  onGrantMinute: () => void;
  onChangeMode: (mode: WiltMode) => void;
  onOpenHistory: () => void;
  onOpenCoin: (from: CoinOrigin) => void;
  onOpenCloset: () => void;
  onOpenApps: () => void;
}) {
  const minutes = Math.floor(seconds / 60);
  const [slot, setSlot] = useState(0);
  // Once today's limit is crossed we stay on the limit page for the rest of the
  // day (seconds only climb), even while a granted grace minute briefly unblocks
  // reels — so the Guilt/Block switcher doesn't flash back mid-session.
  const limitReached = mode === "guilt" && seconds >= limit * 60;

  // The hero takes whatever height it needs at the top; the controls below are
  // anchored to the bottom, so switching Guilt and Block (whose heroes differ
  // in height) moves nothing but the hero. The screen never scrolls.
  return (
    <View className="flex-1">
      {/* One fixed slot for every hero, measured once, so Guilt, Block and the
          walled state all centre in the same box and nothing below them moves. */}
      <View className="flex-1 justify-center" onLayout={(e) => setSlot(e.nativeEvent.layout.height)}>
        {slot > 0 ? (
          limitReached ? (
            <DiscHero
              color={OVER}
              level={0}
              t={1}
              title="Walled off."
              subtitle={`You hit ${fmtLimit(limit)}. Back at midnight.`}
              height={slot}
              outfit={outfit}
            />
          ) : mode === "guilt" ? (
            <GuiltDisc minutes={minutes} limit={limit} height={slot} outfit={outfit} />
          ) : (
            <DiscHero
              color={C.toxic}
              level={1}
              t={0.02}
              asleep
              title="Walled off."
              subtitle="Reels can't reach you till midnight."
              height={slot}
              outfit={outfit}
            />
          )
        ) : null}
      </View>

      <View className="flex-row gap-2.5">
        <StatTile value={`${streak}`} label={streak === 1 ? "day clean" : "days clean"} onPress={onOpenHistory} />
        <CoinTile coins={coins} pending={pendingCoins} hidden={coinOpen} onOpen={onOpenCoin} />
      </View>

      {limitReached ? (
        <View className="mt-5 gap-3">
          {graceLeft > 0 ? (
            <Button
              variant="secondary"
              size="lg"
              fullWidth
              className="rounded-2xl"
              style={GLASS}
              startContent={<PlusIcon color={C.bone} />}
              endContent={
                <Text size="xs" className="text-dim">
                  · {graceLeft} left
                </Text>
              }
              onPress={onGrantMinute}
            >
              1 more minute
            </Button>
          ) : null}
          <Alert
            icon={autoBlocked ? <LockIcon size={16} color={C.dim} /> : <HourglassIcon size={16} color={C.dim} />}
            className="rounded-2xl"
            style={GLASS}
          >
            <Text size="sm" muted weight="medium">
              {autoBlocked ? "Blocked · unlocks at midnight" : "Extra minute · reels open"}
            </Text>
          </Alert>
        </View>
      ) : (
        <View className="mt-5">
          <ModeSwitch mode={mode} onChangeMode={onChangeMode} />
        </View>
      )}

      <View className="flex-row gap-3 pt-5">
        <TrayButton icon={<ShirtIcon color={C.bone} />} label="Closet" onPress={onOpenCloset} />
        <TrayButton icon={<ChartIcon color={C.bone} />} label="History" onPress={onOpenHistory} />
        <TrayButton icon={<SlidersIcon color={C.bone} />} label="Apps" onPress={onOpenApps} />
      </View>
    </View>
  );
}

/** The Guilt disc: the vessel drains as the minutes burn, the cat wilts with it. */
function GuiltDisc({
  minutes,
  limit,
  height,
  outfit,
}: {
  minutes: number;
  limit: number;
  height: number;
  outfit: Outfit;
}) {
  const { minutesLeft, color } = timeLeftState(minutes, limit);
  const t = stageT(decayStage(minutes, limit));
  return (
    <DiscHero
      color={color}
      level={limit > 0 ? minutesLeft / limit : 0}
      t={t}
      title={`${minutesLeft} min left`}
      subtitle={`of ${limit} today`}
      height={height}
      outfit={outfit}
    />
  );
}

/** One quiet glass tile: a number and what it is. Taps through to its sheet. */
function StatTile({ value, label, onPress }: { value: string; label: string; onPress: () => void }) {
  return (
    <Button
      variant="ghost"
      className="flex-1 flex-col items-start gap-0 rounded-2xl px-3.5 py-3"
      style={GLASS}
      onPress={onPress}
    >
      <Text weight="bold" style={{ fontSize: 22, lineHeight: 26, letterSpacing: -0.6, fontVariant: ["tabular-nums"] }}>
        {value}
      </Text>
      <Text size="xs" weight="semibold" className="uppercase text-dim" style={{ letterSpacing: 0.9, fontSize: 10.5 }}>
        {label}
      </Text>
    </Button>
  );
}

/** The coin balance. Tapping it sends this coin off to explain itself. */
function CoinTile({
  coins,
  pending,
  hidden,
  onOpen,
}: {
  coins: number;
  pending: number;
  hidden: boolean;
  onOpen: (from: CoinOrigin) => void;
}) {
  const coinRef = useRef<View>(null);
  // Page coordinates count from the top of the screen, the same space the
  // explainer's edge-to-edge layer draws in. measureInWindow would leave out
  // the status bar and start the coin too high.
  const open = () =>
    coinRef.current?.measure((_x, _y, width, _h, pageX, pageY) => onOpen({ x: pageX, y: pageY, size: width }));
  return (
    <Button
      variant="ghost"
      className="flex-1 flex-col items-start gap-0 rounded-2xl px-3.5 py-3"
      style={GLASS}
      onPress={open}
      accessibilityLabel={`${coins} coins${pending > 0 ? `, ${pending} more at midnight` : ""}`}
    >
      <View className="flex-row items-center" style={{ gap: 6 }}>
        <View ref={coinRef} collapsable={false} style={hidden ? { opacity: 0 } : undefined}>
          <GoldCoin size={22} />
        </View>
        <Text weight="bold" style={{ fontSize: 22, lineHeight: 26, letterSpacing: -0.6, fontVariant: ["tabular-nums"] }}>
          {coins.toLocaleString()}
        </Text>
      </View>
      <Text size="xs" weight="semibold" className="uppercase text-dim" style={{ letterSpacing: 0.9, fontSize: 10.5 }}>
        coins
        {pending > 0 ? (
          <>
            {" · "}
            <Text size="xs" weight="semibold" style={{ color: C.toxic, fontSize: 10.5, fontVariant: ["tabular-nums"] }}>
              +{pending}
            </Text>
          </>
        ) : null}
      </Text>
    </Button>
  );
}

function TrayButton({
  icon,
  label,
  onPress,
}: {
  icon: ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <Button
      variant="secondary"
      size="lg"
      className="flex-1 rounded-2xl px-2"
      style={GLASS}
      labelClassName="text-[15px] font-semibold"
      startContent={icon}
      onPress={onPress}
    >
      {label}
    </Button>
  );
}

function LimitChip({ value, onPress }: { value: number; onPress: () => void }) {
  return (
    <Button
      variant="secondary"
      size="sm"
      className="rounded-full px-3.5"
      style={GLASS}
      labelClassName="text-[12.5px] font-medium text-muted-foreground"
      endContent={<ChevronDownIcon color={C.dim} />}
      onPress={onPress}
    >
      Limit <Text size="xs" weight="semibold">{fmtLimit(value)}</Text>
    </Button>
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
  // The slider is a draft; the button commits, so dragging through lower rungs
  // does not close the sheet on the first step.
  const [draft, setDraft] = useState(pendingLimit > 0 ? pendingLimit : value);
  useEffect(() => {
    if (visible) setDraft(pendingLimit > 0 ? pendingLimit : value);
  }, [visible, value, pendingLimit]);

  return (
    <Sheet visible={visible} onDismiss={onClose}>
      <View className="gap-1.5">
        <Typography type="h4">Daily limit</Typography>
        <Typography type="body-sm" muted className="leading-snug">
          Cross it and Wilt blocks the reels.
        </Typography>
        <View className="mt-4">
          <LimitSlider value={draft} onPick={setDraft} hint={false} />
        </View>
        {pendingLimit > 0 ? (
          <Alert
            variant="warning"
            className="mt-4 rounded-2xl"
            style={{ backgroundColor: "rgba(224,145,60,0.08)", borderColor: "rgba(224,145,60,0.30)" }}
            icon={<HourglassIcon size={16} color={WASTE} />}
          >
            <Text size="xs" muted className="leading-snug">
              <Text size="xs" weight="semibold">{fmtLimit(pendingLimit)}</Text> starts tomorrow. Today
              stays at {fmtLimit(value)}.
            </Text>
          </Alert>
        ) : (
          <Text size="xs" className="mt-4 leading-snug text-dim">
            Lowering is instant. Raising takes effect at tomorrow's reset.
          </Text>
        )}
        <PrimaryButton
          className="mt-4"
          haptic="confirm"
          disabled={draft === value ? pendingLimit === 0 : draft === pendingLimit}
          onPress={() => onPick(draft)}
        >
          {draft === pendingLimit
            ? `${fmtLimit(draft)} is set for tomorrow`
            : draft < value
              ? `Lower to ${fmtLimit(draft)}`
              : draft > value
                ? `Raise to ${fmtLimit(draft)} tomorrow`
                : `Keep ${fmtLimit(value)}`}
        </PrimaryButton>
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
  const block = mode === "block";
  return (
    <Tabs
      value={mode}
      defaultValue={mode}
      onValueChange={(v) => {
        // Walling reels off is a commitment; the way back is just a choice
        // (its own sheet asks for the confirmation).
        feel(v === "block" ? "confirm" : "tick");
        onChangeMode(v as WiltMode);
      }}
      variant="segmented"
    >
      {/* The old island: a solid track, the active cell raised, and green with
          dark type when that cell is Block. */}
      <Tabs.List
        className="rounded-[16px] p-1"
        style={GLASS}
        indicatorClassName={block ? "rounded-[12px] bg-success" : "rounded-[12px] bg-bone/10"}
      >
        <Tabs.Trigger
          value="guilt"
          className="rounded-[12px] py-3"
          icon={<StopwatchIcon size={17} color={!block ? C.bone : C.ash} />}
        >
          <Text weight="semibold" style={{ fontSize: 14.5, color: !block ? C.bone : C.ash }}>
            Guilt
          </Text>
        </Tabs.Trigger>
        <Tabs.Trigger
          value="block"
          className="rounded-[12px] py-3"
          icon={<ShieldIcon size={17} color={block ? C.ink : C.ash} />}
        >
          <Text weight="semibold" style={{ fontSize: 14.5, color: block ? C.ink : C.ash }}>
            Block
          </Text>
        </Tabs.Trigger>
      </Tabs.List>
    </Tabs>
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
          <Typography type="h3" style={{ letterSpacing: -0.4 }}>
            Going soft already?
          </Typography>
          <Typography type="body-sm" muted className="leading-6">
            You're in Block mode and the reels can't touch you. Switch back and you're choosing to
            feed the addiction. Why not just push through?
          </Typography>
        </View>
        <View className="gap-2.5">
          <AccentButton onPress={onKeepBlocking}>Keep blocking</AccentButton>
          <GhostButton haptic="reject" onPress={onGiveIn}>
            I'll give in
          </GhostButton>
        </View>
      </View>
    </Sheet>
  );
}
