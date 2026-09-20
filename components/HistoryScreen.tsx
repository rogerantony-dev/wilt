import { useMemo, useRef, useState } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { ChartIcon, GithubIcon, LinkOutIcon } from "./icons";

import { C, Kicker, Segmented } from "./console";
import { buildView, type HistoryRange } from "./history";
import { getHistory } from "../modules/wiltnative";
import { SheetHeader, SheetScrollView, TallSheet } from "./TallSheet";
import { BarChart } from "./ui/bar-chart";
import { EmptyState } from "./ui/empty-state";
import { Separator } from "./ui/separator";
import { Text } from "./ui/text";
import { Typography } from "./ui/typography";
import { GLASS } from "./kit";

type Metric = "time" | "count";

/** Where the app's source lives, linked from the History footer. */
const REPO_URL = "https://github.com/rogerantony-dev/wilt";

// Monochrome series colours — reels read as the primary tone, shorts a step back.
const REELS = C.bone;
const SHORTS = C.ash;

/** Device-local "yyyy-mm-dd", matching the native SimpleDateFormat. */
function localToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** "1h 5m" / "5m" / "0m" from seconds. */
function fmtDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

const WEEKDAY = ["S", "M", "T", "W", "T", "F", "S"];

function weekdayLetter(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

function dayOfMonth(date: string): string {
  return String(Number(date.split("-")[2]));
}

export function HistoryScreen({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const [range, setRange] = useState<HistoryRange>("7d");
  const [metric, setMetric] = useState<Metric>("time");

  // Read once per screen open (the screen remounts each time it's shown).
  const history = useMemo(() => getHistory(), []);
  const today = useMemo(() => localToday(), []);
  const view = useMemo(() => buildView(history, range, today), [history, range, today]);

  const hasData = view.series.some((d) => d.seconds > 0 || d.count > 0 || d.shorts > 0);

  // Average over days actually tracked, not the full window — a fresh install
  // shouldn't be divided by 7 (or 30) empty days it never existed for.
  const total = metric === "time" ? view.totalSeconds : view.totalCount + view.totalShorts;
  const avg = Math.round(total / view.coveredDays);
  const prevTotal = metric === "time" ? view.prevTotalSeconds : view.prevTotalCount;
  const trendPct =
    prevTotal != null && prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : null;

  const busiest = view.series.reduce<(typeof view.series)[number] | null>((best, d) => {
    const v = metric === "time" ? d.seconds : d.count + d.shorts;
    if (v <= 0) return best;
    const bestV = best ? (metric === "time" ? best.seconds : best.count + best.shorts) : -1;
    return v > bestV ? d : best;
  }, null);

  const fmtTotal = metric === "time" ? fmtDuration(total) : String(total);
  const fmtAvg = metric === "time" ? fmtDuration(avg) : String(avg);
  const fmtBusiest = busiest
    ? metric === "time"
      ? fmtDuration(busiest.seconds)
      : String(busiest.count + busiest.shorts)
    : "—";

  return (
    <TallSheet visible={visible} onClose={onClose}>
      <SheetHeader style={{ paddingHorizontal: 24, paddingBottom: 4, paddingTop: 8 }}>
        <Typography type="h3" className="mt-1" style={{ letterSpacing: -0.6 }}>
          History
        </Typography>
      </SheetHeader>

      <SheetScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 36 }}>
        <View className="gap-5 px-6 pb-3 pt-1">
          <View className="gap-2.5">
            <Segmented<HistoryRange>
              options={[
                { key: "7d", label: "7 days" },
                { key: "30d", label: "30 days" },
                { key: "all", label: "All" },
              ]}
              value={range}
              onChange={setRange}
            />
            <Segmented<Metric>
              options={[
                { key: "time", label: "Time" },
                { key: "count", label: "Count" },
              ]}
              value={metric}
              onChange={setMetric}
            />
          </View>

          {!hasData ? (
            <EmptyState variant="card" size="sm" className="rounded-3xl" style={GLASS}>
              <EmptyState.Media variant="icon">
                <ChartIcon size={36} color={C.dim} />
              </EmptyState.Media>
              <EmptyState.Header>
                <EmptyState.Title>No history yet</EmptyState.Title>
                <EmptyState.Description>
                  Your first day is being logged. Check back tomorrow.
                </EmptyState.Description>
              </EmptyState.Header>
            </EmptyState>
          ) : (
            <>
              <View className="mt-1 flex-row rounded-2xl px-4 py-3.5" style={GLASS}>
                <Stat label="Total" value={fmtTotal} first />
                <Stat label="Daily avg" value={fmtAvg} />
                <Stat
                  label="Trend"
                  value={trendPct == null ? "—" : `${trendPct > 0 ? "+" : ""}${trendPct}%`}
                  tone={trendPct != null && trendPct < 0 ? "good" : "neutral"}
                />
              </View>

              {busiest ? (
                <Text size="sm" muted>
                  Busiest day{"  "}
                  <Text size="sm" weight="semibold">
                    {busiest.date}
                  </Text>{" "}
                  · {fmtBusiest}
                </Text>
              ) : null}

              <View className="mt-1 gap-3 rounded-2xl px-4 pb-3 pt-4" style={GLASS}>
                <Kicker>{metric === "time" ? "Minutes per day" : "Reels + shorts per day"}</Kicker>
                <Chart series={view.series} metric={metric} range={range} />
                {metric === "count" ? (
                  <View className="flex-row justify-center gap-6 pt-1">
                    <LegendDot color={REELS} label="Reels" />
                    <LegendDot color={SHORTS} label="Shorts" />
                  </View>
                ) : (
                  <Text size="xs" className="text-center text-dim">
                    Reels + shorts combined. They share one timer.
                  </Text>
                )}
              </View>
            </>
          )}

          <Separator className="mt-4" />
          <View className="gap-4">
            <Text size="xs" className="leading-5 text-dim">
              History starts the day you updated the app. Earlier days weren't recorded. It fills
              in one day at a time and lives only on this device.
            </Text>
            <SourceLink />
          </View>
        </View>
      </SheetScrollView>
    </TallSheet>
  );
}

/**
 * Quiet way out to the repo. It sits under the footer note rather than on the
 * home screen: the claim that everything stays on your device is right above it,
 * so this is where someone who wants to check that lands.
 */
function SourceLink() {
  return (
    <Pressable
      onPress={() => {
        // Nothing to recover if no browser handles the link, so fail silently.
        Linking.openURL(REPO_URL).catch(() => {});
      }}
      hitSlop={10}
      className="self-start active:opacity-60"
    >
      <Text size="xs" muted weight="medium">
        Open source
      </Text>
      <View className="mt-1 flex-row items-center gap-1.5">
        <GithubIcon color={C.dim} />
        <Text size="xs" className="text-dim">
          github.com/rogerantony-dev/wilt
        </Text>
        <LinkOutIcon color={C.dim} />
      </View>
    </Pressable>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
  first,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "good";
  first?: boolean;
}) {
  return (
    <View className={`flex-1 ${first ? "" : "border-l border-border pl-4"}`}>
      <Kicker style={{ fontSize: 11 }}>{label}</Kicker>
      <Text
        weight="semibold"
        className={`mt-2 ${tone === "good" ? "text-success" : ""}`}
        style={{ fontSize: 24, lineHeight: 30, letterSpacing: -0.5, fontVariant: ["tabular-nums"] }}
      >
        {value}
      </Text>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View className="flex-row items-center gap-2">
      <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color }} />
      <Text size="xs" muted>
        {label}
      </Text>
    </View>
  );
}

/**
 * PanelUI's bar chart, one band per day. A handful of days stretch to fill the
 * width; past that each day keeps a minimum slot and the chart scrolls, opened
 * at the right end so today (the day with data on a new install) is in view.
 */
function Chart({
  series,
  metric,
  range,
}: {
  series: { date: string; seconds: number; count: number; shorts: number }[];
  metric: Metric;
  range: HistoryRange;
}) {
  const H = 200;
  const [viewW, setViewW] = useState(0);
  // px per day (bar + gap): a week spreads out, longer ranges pack so a
  // couple of weeks still fits without scrolling.
  const minSlot = range === "7d" ? 40 : 18;
  const width = Math.max(series.length * minSlot, viewW, 1);
  // Only a range wider than the viewport scrolls; a fitted chart stays put,
  // otherwise the scroll-to-end below drags its first band off the left edge.
  const scrolls = series.length * minSlot > viewW;
  const scrollRef = useRef<ScrollView>(null);

  const data = useMemo(
    () =>
      series.map((d) => ({
        date: d.date,
        minutes: Math.round((d.seconds / 60) * 10) / 10,
        reels: d.count,
        shorts: d.shorts,
      })),
    [series]
  );

  // The axis thins its own labels; hand it the density and the text only.
  const ticks = range === "7d" ? series.length : Math.min(6, series.length);
  const label = (i: number) =>
    range === "7d" ? weekdayLetter(series[i].date) : dayOfMonth(series[i].date);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      onLayout={(e) => setViewW(e.nativeEvent.layout.width)}
      scrollEnabled={scrolls}
      onContentSizeChange={() => {
        if (scrolls) scrollRef.current?.scrollToEnd({ animated: false });
      }}
    >
      {viewW > 0 ? (
        <BarChart
          key={metric}
          data={data}
          xDataKey="date"
          stacked={metric === "count"}
          barGap={0.44}
          cornerRadius={3}
          minBarLength={2}
          aspectRatio={width / H}
          style={{ width, overflow: "hidden" }}
          accessibilityLabel={metric === "time" ? "Minutes per day" : "Reels and shorts per day"}
        >
          <BarChart.Grid rows={2} opacity={0.07} />
          {metric === "time" ? (
            <BarChart.Bar dataKey="minutes" color={C.bone} />
          ) : (
            <>
              <BarChart.Bar dataKey="reels" color={REELS} />
              <BarChart.Bar dataKey="shorts" color={SHORTS} />
            </>
          )}
          <BarChart.XAxis ticks={ticks} format={(_, i) => label(i)} />
          <BarChart.Tooltip
            formatX={(d) => String(d.date)}
            formatValue={(v, key) => (key === "minutes" ? `${Math.round(v)}m` : String(Math.round(v)))}
          />
        </BarChart>
      ) : null}
    </ScrollView>
  );
}
