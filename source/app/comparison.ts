import { METRICS, addRecord, emptyAggregate, toIsoDate } from "./analytics.ts";
import type { AdRecord, Aggregate, MetricKey } from "./analytics.ts";

export type DateRange = { start: string; end: string };
export type ComparisonPreset = "3" | "7" | "30" | "month";
export type ComparisonPeriods = { first: DateRange; second: DateRange };
export const COMPARISON_METRICS = Object.keys(METRICS) as MetricKey[];

function day(iso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const date = new Date(`${iso}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? date : null;
}

function iso(date: Date) { return date.toISOString().slice(0, 10); }

export function shiftDay(value: string, days: number) {
  const date = day(value);
  if (!date) throw new Error("无效日期");
  date.setUTCDate(date.getUTCDate() + days);
  return iso(date);
}

export function rangeDays(range: DateRange) {
  const start = day(range.start);
  const end = day(range.end);
  return start && end ? Math.round((end.getTime() - start.getTime()) / 86400000) + 1 : 0;
}

export function validPeriods(periods: ComparisonPeriods) {
  return rangeDays(periods.first) > 0 && rangeDays(periods.second) > 0;
}

export function presetPeriods(latest: string, preset: ComparisonPreset): ComparisonPeriods {
  if (preset !== "month") {
    const days = Number(preset);
    return { first: { start: shiftDay(latest, 1 - days), end: latest },
      second: { start: shiftDay(latest, 1 - days * 2), end: shiftDay(latest, -days) } };
  }
  const date = day(latest);
  if (!date) throw new Error("无效日期");
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const monthEnd = new Date(Date.UTC(year, month + 1, 0, 12));
  const recentMonth = date.getUTCDate() === monthEnd.getUTCDate() ? month : month - 1;
  return {
    first: { start: iso(new Date(Date.UTC(year, recentMonth, 1, 12))), end: iso(new Date(Date.UTC(year, recentMonth + 1, 0, 12))) },
    second: { start: iso(new Date(Date.UTC(year, recentMonth - 1, 1, 12))), end: iso(new Date(Date.UTC(year, recentMonth, 0, 12))) },
  };
}

export function inRange(date: string, range: DateRange) {
  return date >= range.start && date <= range.end;
}

export type ItemComparison = {
  itemId: string; first: Aggregate; second: Aggregate;
  firstRows: number; secondRows: number; firstDays: Set<string>; secondDays: Set<string>;
};

export function compareItems(records: AdRecord[], periods: ComparisonPeriods) {
  if (!validPeriods(periods)) return [];
  const items = new Map<string, ItemComparison>();
  for (const record of records) {
    const date = toIsoDate(record.date);
    const first = inRange(date, periods.first);
    const second = inRange(date, periods.second);
    if (!first && !second) continue;
    const item = items.get(record.itemId) ?? { itemId: record.itemId, first: emptyAggregate(), second: emptyAggregate(),
      firstRows: 0, secondRows: 0, firstDays: new Set<string>(), secondDays: new Set<string>() };
    if (first) { addRecord(item.first, record); item.firstRows++; item.firstDays.add(date); }
    if (second) { addRecord(item.second, record); item.secondRows++; item.secondDays.add(date); }
    items.set(record.itemId, item);
  }
  return [...items.values()].sort((a, b) => b.first.sales - a.first.sales || a.itemId.localeCompare(b.itemId));
}

export function metricValue(key: MetricKey, aggregate: Aggregate, rows: number): number | null {
  if (!rows) return null;
  const denominator = key === "roas" ? aggregate.spend : key === "ctr" ? aggregate.impressions
    : key === "cpc" || key === "conversion" ? aggregate.clicks : null;
  if (denominator === 0) return null;
  return METRICS[key].value(aggregate);
}

export function calculateChange(current: number | null, baseline: number | null) {
  if (current === null || baseline === null) return { delta: null, percent: null, direction: "unavailable" as const };
  const raw = current - baseline;
  const delta = Math.abs(raw) < 1e-10 ? 0 : raw;
  return { delta, percent: baseline === 0 ? (current === 0 ? 0 : null) : delta / Math.abs(baseline) * 100,
    direction: delta > 0 ? "up" as const : delta < 0 ? "down" as const : "flat" as const };
}

export function formatComparisonValue(key: MetricKey, value: number | null, delta = false) {
  if (value === null) return "—";
  const number = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 0,
    maximumFractionDigits: delta && Math.abs(value) > 0 && Math.abs(value) < 0.01 ? 4 : 2 }).format(Math.abs(value));
  const sign = delta ? (value > 0 ? "+" : value < 0 ? "−" : "") : value < 0 ? "−" : "";
  if (key === "spend" || key === "sales" || key === "cpc") return `${sign}US$${number}`;
  if (key === "ctr" || key === "conversion") return `${sign}${number}${delta ? " 个百分点" : "%"}`;
  if (key === "roas") return `${sign}${number}x`;
  return `${sign}${number}`;
}

export function changeInterpretation(key: MetricKey, direction: ReturnType<typeof calculateChange>["direction"]) {
  if (direction === "unavailable") return "数据或计算基数不足";
  if (direction === "flat") return "持平";
  const up = direction === "up";
  if (key === "cpc") return up ? "点击成本上升" : "点击成本下降";
  if (key === "spend") return up ? "投入增加，结合回报判断" : "投入减少，结合回报判断";
  if (key === "roas") return up ? "投入回报提升" : "投入回报回落";
  if (key === "ctr") return up ? "点击效率提升" : "点击效率回落";
  if (key === "conversion") return up ? "件数转化率提升" : "件数转化率回落";
  return up ? "规模增加，结合效率判断" : "规模减少，结合效率判断";
}
