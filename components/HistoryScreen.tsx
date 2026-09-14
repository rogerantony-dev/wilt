import React, { useMemo, useRef, useState } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Line, Rect } from "react-native-svg";

import { C, Kicker, Segmented } from "./console";
import { buildView, type HistoryRange } from "./history";
import { getHistory } from "../modules/wiltnative";
import { TallSheet } from "./TallSheet";

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

/** Round a value up to a tidy axis maximum (1/2/5 × 10ⁿ). */
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(value)));
  const n = value / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
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
          <View className="px-6 pb-1 pt-2">
            <View
              style={{
                alignSelf: "center",
                width: 40,
                height: 5,
                borderRadius: 3,
                backgroundColor: C.panelhi,
              }}
            />
            <Pressable
              onPress={onClose}
              hitSlop={12}
              className="-ml-1 mt-2 h-10 w-10 items-center justify-center rounded-full active:opacity-60"
            >
              <Ionicons name="chevron-down" size={24} color={C.bone} />
            </Pressable>
            <Text className="mt-1 text-[26px] font-semibold text-bone" style={{ letterSpacing: -0.6 }}>
              History
            </Text>
          </View>

        <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 36 }}>
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
              <View className="items-center gap-3 rounded-3xl bg-panel px-5 py-12">
                <Ionicons name="bar-chart-outline" size={36} color={C.dim} />
                <Text className="text-center text-[15px] leading-6 text-ash">
                  No history yet. Your first day is being logged.{"\n"}Check back tomorrow.
                </Text>
              </View>
            ) : (
              <>
                <View className="mt-2 flex-row">
                  <Stat label="Total" value={fmtTotal} first />
                  <Stat label="Daily avg" value={fmtAvg} />
                  <Stat
                    label="Trend"
                    value={trendPct == null ? "—" : `${trendPct > 0 ? "+" : ""}${trendPct}%`}
                    tone={trendPct != null && trendPct < 0 ? "good" : "neutral"}
                  />
                </View>

                {busiest ? (
                  <Text className="text-[13px] text-ash">
                    Busiest day{"  "}
                    <Text className="font-semibold text-bone">{busiest.date}</Text> · {fmtBusiest}
                  </Text>
                ) : null}

                <View className="mt-2 gap-3">
                  <Kicker>
                    {metric === "time" ? "Minutes per day" : "Reels + shorts per day"}
                  </Kicker>
                  <Chart series={view.series} metric={metric} range={range} />
                  {metric === "count" ? (
                    <View className="flex-row justify-center gap-6 pt-1">
                      <LegendDot color={REELS} label="Reels" />
                      <LegendDot color={SHORTS} label="Shorts" />
                    </View>
                  ) : (
                    <Text className="text-center text-[12px] text-dim">
                      Reels + shorts combined. They share one timer.
                    </Text>
                  )}
                </View>
              </>
            )}

            <View className="mt-4 gap-4 border-t border-bone/10 pt-5">
              <Text className="text-[12.5px] leading-5 text-dim">
                History starts the day you updated the app. Earlier days weren't recorded. It
                fills in one day at a time and lives only on this device.
              </Text>
              <SourceLink />
            </View>
          </View>
        </ScrollView>
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
      <Text className="text-[12.5px] font-medium text-ash">Open source</Text>
      <View className="mt-1 flex-row items-center gap-1.5">
        <Ionicons name="logo-github" size={13} color={C.dim} />
        <Text className="text-[12.5px] text-dim">github.com/rogerantony-dev/wilt</Text>
        <Ionicons name="open-outline" size={11} color={C.dim} />
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
  const color = tone === "good" ? C.toxic : C.bone;
  return (
    <View className={`flex-1 ${first ? "" : "border-l border-bone/10 pl-4"}`}>
      <Kicker style={{ fontSize: 11 }}>{label}</Kicker>
      <Text
        className="mt-2 text-[24px] font-semibold"
        style={{ color, letterSpacing: -0.5, fontVariant: ["tabular-nums"] }}
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
      <Text className="text-[12.5px] text-ash">{label}</Text>
    </View>
  );
}

function Chart({
  series,
  metric,
  range,
}: {
  series: { date: string; seconds: number; count: number; shorts: number }[];
  metric: Metric;
  range: HistoryRange;
}) {
  const H = 180; // plot height
  const TOP = 8;
  const BOTTOM = 22; // room for x labels
  const plotH = H - TOP - BOTTOM;

  // Measure the visible width so a handful of days stretch to fill it instead
  // of huddling as thin bars on the left; once they'd overflow, fall back to a
  // fixed slot and let the chart scroll.
  const [viewW, setViewW] = useState(0);
  const minSlot = range === "7d" ? 40 : 26; // px per day (bar + gap)
  const avail = Math.max(0, viewW - 16); // minus contentContainer padding (8 each side)
  const slot =
    series.length > 0 && avail > 0 ? Math.max(minSlot, avail / series.length) : minSlot;
  const barW = Math.round(slot * 0.56);
  const width = Math.max(series.length * slot, 1);

  const value = (d: (typeof series)[number]) =>
    metric === "time" ? d.seconds / 60 : d.count + d.shorts; // minutes or count
  const rawMax = Math.max(...series.map(value), 1);
  const max = niceMax(rawMax);

  const gridY = [0, 0.5, 1].map((f) => TOP + plotH * (1 - f));

  // Today is the rightmost bar; open scrolled to it so recent days (the ones
  // with data on a new install) are visible instead of a wall of zero bars.
  const scrollRef = useRef<ScrollView>(null);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      onLayout={(e) => setViewW(e.nativeEvent.layout.width)}
      onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      contentContainerStyle={{ paddingHorizontal: 8 }}
    >
      <View>
        <Svg width={width} height={H}>
          {gridY.map((y, i) => (
            <Line
              key={i}
              x1={0}
              y1={y}
              x2={width}
              y2={y}
              stroke={C.bone}
              strokeOpacity={0.07}
              strokeWidth={1}
            />
          ))}
          {series.map((d, i) => {
            const x = i * slot + (slot - barW) / 2;
            if (metric === "time") {
              const mins = d.seconds / 60;
              const h = max > 0 ? (mins / max) * plotH : 0;
              // Quiet days recede; only the meaningful ones read at full weight.
              const faint = mins > 0 && mins < max * 0.15;
              return (
                <Rect
                  key={d.date}
                  x={x}
                  y={TOP + plotH - h}
                  width={barW}
                  height={Math.max(h, mins > 0 ? 2 : 0)}
                  rx={3}
                  fill={faint ? "#3A3A35" : C.bone}
                />
              );
            }
            // stacked counts: reels (bone) bottom, shorts (ash) on top
            const reelH = max > 0 ? (d.count / max) * plotH : 0;
            const shortH = max > 0 ? (d.shorts / max) * plotH : 0;
            const baseY = TOP + plotH;
            return (
              <React.Fragment key={d.date}>
                <Rect
                  x={x}
                  y={baseY - reelH}
                  width={barW}
                  height={Math.max(reelH, d.count > 0 ? 2 : 0)}
                  rx={3}
                  fill={REELS}
                />
                <Rect
                  x={x}
                  y={baseY - reelH - shortH}
                  width={barW}
                  height={Math.max(shortH, d.shorts > 0 ? 2 : 0)}
                  rx={3}
                  fill={SHORTS}
                />
              </React.Fragment>
            );
          })}
        </Svg>
        {/* x-axis labels */}
        <View style={{ flexDirection: "row", width, marginTop: -BOTTOM + 4 }}>
          {series.map((d, i) => {
            const show = range === "7d" || i === series.length - 1 || i % 5 === 0;
            return (
              <View key={d.date} style={{ width: slot, alignItems: "center" }}>
                <Text className="text-[10px] text-dim" style={{ fontVariant: ["tabular-nums"] }}>
                  {show ? (range === "7d" ? weekdayLetter(d.date) : dayOfMonth(d.date)) : ""}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}
