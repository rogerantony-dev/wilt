import { createElement } from 'react';

export interface ChartAccessibilityProps<Datum> {
  /** Spoken summary. Defaults to the chart family and number of data entries. */
  accessibilityLabel?: string;
  /** Additional guidance spoken after the chart summary. */
  accessibilityHint?: string;
  /** Overrides the spoken label for one data entry. */
  accessibilityLabelForDatum?: (datum: Datum, index: number) => string;
  /** Makes each data entry actionable without making the SVG geometry focusable. */
  onAccessibilityDatumPress?: (datum: Datum, index: number) => void;
}

export interface ChartAccessibilityItem<Datum> {
  datum: Datum;
  index: number;
  label: string;
}

function spoken(value: unknown): string | null {
  if (value instanceof Date) return value.toLocaleDateString();
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return null;
}

/** Pure semantic projection, shared by tests and the native accessibility tree. */
export function chartAccessibilityModel<Datum>(
  chart: string,
  data: Datum[],
  valueOf: (datum: Datum) => [string, unknown][],
  labelForDatum?: (datum: Datum, index: number) => string
): { summary: string; items: ChartAccessibilityItem<Datum>[] } {
  return {
    summary: `${chart}, ${data.length} ${data.length === 1 ? 'data entry' : 'data entries'}`,
    items: data.map((datum, index) => ({
      datum,
      index,
      label:
        labelForDatum?.(datum, index) ??
        valueOf(datum)
          .map(([label, value]) => {
            const text = spoken(value);
            return text === null ? null : `${label}, ${text}`;
          })
          .filter((part): part is string => part !== null)
          .join('. '),
    })),
  };
}

export interface ChartAccessibilityDataProps<Datum>
  extends ChartAccessibilityProps<Datum> {
  chart: string;
  data: Datum[];
  valueOf: (datum: Datum) => [string, unknown][];
  disabled?: boolean;
}

/**
 * A compact semantic sibling to the visual plot. The SVG remains one
 * decorative subtree while screen readers receive one summary and one entry
 * per datum, rather than every path, grid line and marker.
 */
export function ChartAccessibilityData<Datum>({
  chart,
  data,
  valueOf,
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
  accessibilityLabelForDatum,
  onAccessibilityDatumPress,
}: ChartAccessibilityDataProps<Datum>) {
  if (disabled) return null;
  // Keep the pure semantic projection importable by Node tests without asking
  // Node to parse React Native's Flow entry point.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pressable, View } = require('react-native') as typeof import('react-native');
  const model = chartAccessibilityModel(chart, data, valueOf, accessibilityLabelForDatum);

  return createElement(
    View,
    { style: { position: 'absolute', left: -10_000, width: 1, height: 1 } },
    createElement(View, {
      accessible: true,
      accessibilityRole: 'image',
      accessibilityLabel: accessibilityLabel ?? model.summary,
      accessibilityHint,
    }),
    ...model.items.map((item) =>
      createElement(Pressable, {
        key: item.index,
        accessible: true,
        accessibilityRole: onAccessibilityDatumPress ? 'button' : 'text',
        accessibilityLabel: item.label,
        onPress: onAccessibilityDatumPress
          ? () => onAccessibilityDatumPress(item.datum, item.index)
          : undefined,
      })
    )
  );
}
