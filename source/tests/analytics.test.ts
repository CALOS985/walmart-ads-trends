import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseAdvertisingCsv, parseProductMappingCsv, parseReportDate } from "../app/csv.ts";
import { METRICS, addRecord, addAggregate, emptyAggregate, formatMetric } from "../app/analytics.ts";
import { createDemoData } from "../app/demo-data.ts";
import { trendSegments } from "../app/trend-data.ts";
import { calculateChange, compareItems, metricValue, presetPeriods, rangeDays, validPeriods, formatComparisonValue } from "../app/comparison.ts";

const fields = ["Date", "Item Id", "Placement", "Impressions", "Ad Spend", "CTR", "Average CPC", "Total Units Sold - 30 Day",
  "Conversion Rate - 30 Day", "ROAS - 30 Day", "Advertised SKU Sales. - 30 Day", "Total Sales Rev. - 30 Day",
  "Advertised Add to Cart - 30 Day", "Advertised Product Detail Page Views - 30 Day", "Total Add to Cart - 30 Day"];
const values = ["2026-11-09", "ITEM-A", "Search In-grid", "1,000", "$20", "2%", "$1", "4", "20%", "5", "$90", "$100", "6", "50", "8"];
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
const csv = (columns = fields, cells = values) => `${columns.map(quote).join(",")}\n${cells.map(quote).join(",")}`;

test("CSV field lookup stays identical for reversed, rotated and mixed column orders", () => {
  const expected = parseAdvertisingCsv(csv());
  const orders = [fields.map((_, i) => i).reverse(), ...fields.map((_, i) => fields.map((_, j) => (j + i) % fields.length))];
  for (const order of orders) {
    const text = '\uFEFF"Period Requested: Nov 1, 2026 - Nov 9, 2026"\r\n' + csv(order.map(i => fields[i]), order.map(i => values[i]));
    assert.deepEqual(parseAdvertisingCsv(text), expected);
  }
});

test("mapping fields can also be reordered and use Chinese or English names", () => {
  assert.deepEqual(parseProductMappingCsv('SKU,Item ID,后台 SKU,品类\nSKU-A,ITEM-A,BACK-A,家居'),
    parseProductMappingCsv('category,backendSku,item_id,sku\n家居,BACK-A,ITEM-A,SKU-A'));
});

test("missing and duplicate headers produce actionable errors", () => {
  assert.throws(() => parseAdvertisingCsv(csv(fields.filter(f => f !== "Ad Spend"))), /缺少必需字段：Ad Spend/);
  assert.throws(() => parseAdvertisingCsv(csv([...fields, "ITEM ID"], [...values, "OTHER"])), /重复字段/);
  assert.throws(() => parseAdvertisingCsv('Date,Unknown\n2026-11-09,x'), /未找到 Date 和 Item Id/);
});

test("real Clicks override estimates; missing optional columns preserve core metrics", () => {
  const [explicit] = parseAdvertisingCsv(csv([...fields, "Clicks"], [...values, "10"]));
  assert.equal(explicit.clicks, 10);
  const order = fields.map((_, i) => i).filter(i => ![6, 14].includes(i));
  const [estimated] = parseAdvertisingCsv(csv(order.map(i => fields[i]), order.map(i => values[i])));
  assert.equal(estimated.clicks, 20);
  assert.equal(estimated.addToCart, 6);
});

test("dates reject invalid calendar days", () => {
  assert.equal(parseReportDate("2026-02-30"), null);
  assert.equal(parseReportDate("31-Feb-26"), null);
  assert.ok(parseReportDate("29-Feb-24"));
});

test("dashboard separates order and unit conversion and recomputes rates from source counts", () => {
  const cells = values.map((v, i) => ({ 7: "6", 8: "99%", 9: "888", 10: "$900", 11: "$60" }[i] ?? v));
  const [record] = parseAdvertisingCsv(csv([...fields, "Clicks", "Orders - 30 Day"], [...cells, "10", "3"]));
  const total = emptyAggregate();
  addRecord(total, record);
  assert.equal(total.sales, 60);
  assert.equal(record.orders, 3);
  assert.equal(total.orders, 3);
  assert.equal(METRICS.orderConversion.value(total), 30);
  assert.equal(METRICS.conversion.value(total), 60);
  assert.notEqual(METRICS.conversion.value(total), 30);
  assert.notEqual(METRICS.conversion.value(total), record.conversion);
  assert.equal(METRICS.roas.value(total), 3);
  assert.notEqual(METRICS.roas.value(total), record.reportedRoas);
  total.units = 12;
  assert.equal(METRICS.conversion.value(total), 120);
});

test("3/7/30 day presets include the latest date with no gap or overlap", () => {
  for (const preset of ["3", "7", "30"] as const) {
    const periods = presetPeriods("2026-01-02", preset);
    assert.equal(rangeDays(periods.first), Number(preset));
    assert.equal(rangeDays(periods.second), Number(preset));
    assert.equal(periods.first.end, "2026-01-02");
    assert.ok(periods.second.end < periods.first.start);
  }
  assert.deepEqual(presetPeriods("2026-11-09", "3"), {
    first: { start: "2026-11-07", end: "2026-11-09" }, second: { start: "2026-11-04", end: "2026-11-06" },
  });
});

test("complete-month preset handles month ends, leap years and year boundaries", () => {
  assert.deepEqual(presetPeriods("2026-11-09", "month"), { first: { start: "2026-10-01", end: "2026-10-31" }, second: { start: "2026-09-01", end: "2026-09-30" } });
  assert.deepEqual(presetPeriods("2024-03-31", "month"), { first: { start: "2024-03-01", end: "2024-03-31" }, second: { start: "2024-02-01", end: "2024-02-29" } });
  assert.equal(presetPeriods("2026-01-09", "month").first.start, "2025-12-01");
  assert.equal(rangeDays({ start: "2024-02-01", end: "2024-02-29" }), 29);
});

test("comparison aggregates each item and recomputes weighted ratios", () => {
  const records = [
    ...parseAdvertisingCsv(csv()),
    ...parseAdvertisingCsv(csv(fields, values.map((v, i) => ({ 0: "2026-11-08", 3: "2,000", 4: "$80", 5: "4%", 6: "$1", 7: "8", 11: "$200" }[i] ?? v)))),
    ...parseAdvertisingCsv(csv(fields, values.map((v, i) => i === 0 ? "2026-11-06" : v))),
  ];
  const [item] = compareItems(records, presetPeriods("2026-11-09", "3"));
  assert.equal(item.first.spend, 100);
  assert.equal(item.first.sales, 300);
  assert.equal(item.firstRows, 2);
  assert.equal(item.secondRows, 1);
  assert.equal(metricValue("roas", item.first, item.firstRows), 3);
  assert.equal(metricValue("ctr", item.first, item.firstRows), 100 / 3000 * 100);
  assert.equal(metricValue("conversion", item.first, item.firstRows), 12);
  assert.deepEqual(calculateChange(3, 5), { delta: -2, percent: -40, direction: "down" });
});

test("all twelve metrics have correct deltas, with conversion changes in percentage points", () => {
  const current = { spend: 60, sales: 180, impressions: 300, clicks: 30, units: 6, orders: 3, addToCart: 12, pdpViews: 45 };
  const baseline = { spend: 20, sales: 100, impressions: 100, clicks: 5, units: 1, orders: 1, addToCart: 3, pdpViews: 8 };
  const expected = { spend: 40, sales: 80, roas: -2, ctr: 5, cpc: -2, conversion: 0, orderConversion: -10, impressions: 200, units: 5, orders: 2, addToCart: 9, pdpViews: 37 };
  for (const key of Object.keys(expected) as (keyof typeof expected)[]) {
    assert.equal(calculateChange(metricValue(key, current, 1), metricValue(key, baseline, 1)).delta, expected[key]);
  }
  assert.equal(formatComparisonValue("ctr", 5, true), "+5 个百分点");
  assert.equal(formatComparisonValue("orderConversion", -10, true), "−10 个百分点");
});

test("Orders is read by name in shuffled CSVs; old and blank orders stay unavailable, distinct from zero", () => {
  const columns = [...fields, "Orders - 30 Day"];
  const cells = [...values, "1,234"];
  const expected = parseAdvertisingCsv(csv(columns, cells))[0];
  assert.equal(expected.orders, 1234);
  assert.deepEqual(parseAdvertisingCsv(csv(columns.toReversed(), cells.toReversed()))[0], expected);
  const aggregate = (records: ReturnType<typeof parseAdvertisingCsv>) => {
    const total = emptyAggregate(); records.forEach(row => addRecord(total, row)); return total;
  };
  for (const missing of [parseAdvertisingCsv(csv()), parseAdvertisingCsv(csv(columns, [...values, ""]))]) {
    assert.equal(missing[0].orders, null);
    const total = aggregate(missing);
    assert.equal(formatMetric("orders", total), "—");
    assert.equal(formatMetric("orderConversion", total), "—");
    assert.equal(METRICS.conversion.value(total), 20);
    addRecord(total, expected);
    assert.equal(total.orders, null);
    assert.equal(metricValue("orderConversion", total, 2), null);
  }
  const zero = aggregate(parseAdvertisingCsv(csv(columns, [...values, "0"])));
  assert.equal(formatMetric("orders", zero), "0");
  assert.equal(formatMetric("orderConversion", zero), "0.00%");
  zero.clicks = 0;
  assert.equal(formatMetric("orderConversion", zero), "—");
  const target = emptyAggregate();
  addAggregate(target, aggregate(parseAdvertisingCsv(csv())));
  addAggregate(target, aggregate([expected]));
  assert.equal(target.orders, null);
});

test("invalid order counts fail with a field-specific error", () => {
  for (const invalid of ["-1", "1.5", "abc", "NaN", "Infinity", "9007199254740992"]) {
    assert.throws(() => parseAdvertisingCsv(csv([...fields, "Orders - 30 Day"], [...values, invalid])), /Orders - 30 Day 必须为非负整数/);
  }
});

test("Custom Reports literal null is zero only when units and revenue also report no attribution", () => {
  const columns = [...fields, "Orders - 30 Day"];
  for (const absent of ['null','0']) {
    const cells = values.map((v,i)=>i === 7 || i === 11 ? absent : v);
    const [row] = parseAdvertisingCsv(csv(columns,[...cells,'null']));
    assert.equal(row.orders, 0);
    assert.equal(row.ordersNullAsZero, true);
  }
  for (const cells of [values, values.map((v,i)=>i === 7 ? '0' : v), values.map((v,i)=>i === 7 || i === 11 ? '' : v)]) {
    const [row] = parseAdvertisingCsv(csv(columns,[...cells,'null']));
    assert.equal(row.orders, null);
    assert.equal(row.ordersNullAsZero, false);
  }
});

test("order conversion uses weighted totals in custom comparison periods", () => {
  const columns = [...fields, "Orders - 30 Day", "Clicks"];
  const records = [
    ...parseAdvertisingCsv(csv(columns, [...values, "3", "10"])),
    ...parseAdvertisingCsv(csv(columns, [...values.map((v,i)=>i === 0 ? "2026-11-08" : v), "2", "40"])),
    ...parseAdvertisingCsv(csv(columns, [...values.map((v,i)=>i === 0 ? "2026-11-06" : v), "4", "20"])),
  ];
  const [item] = compareItems(records, presetPeriods("2026-11-09", "3"));
  assert.equal(item.first.orders, 5);
  assert.equal(item.second.orders, 4);
  const current = metricValue("orderConversion", item.first, item.firstRows);
  const baseline = metricValue("orderConversion", item.second, item.secondRows);
  assert.equal(current, 10);
  assert.equal(baseline, 20);
  assert.equal(calculateChange(current, baseline).delta, -10);
});

test("trend gaps preserve zero values and never connect across missing order data", () => {
  assert.deepEqual(trendSegments([null, 0, 2, null, 4, null]), [
    [{index:1,value:0},{index:2,value:2}], [{index:4,value:4}],
  ]);
  assert.deepEqual(trendSegments([null,null]), []);
});

test("download template contains sixteen named fields, synthetic examples for all five placements and both conversion inputs", () => {
  const text = readFileSync(new URL('../public/templates/ads-report-template.csv', import.meta.url), 'utf8');
  const records = parseAdvertisingCsv(text);
  assert.equal(records.length, 270);
  assert.deepEqual([...new Set(records.map(row=>row.placement))].sort(), ['Homepage','Carousel','Buybox','Search In-grid','Browse In-grid'].sort());
  assert.ok(records.every(row=>row.orders !== null && row.itemId.startsWith('DEMO-')));
  assert.ok(records.every(row=>row.units === 0 ? row.orders === 0 : row.orders! > 0 && row.orders! <= row.units));
  assert.ok(records.some(row=>row.orders !== row.units));
  const demo = createDemoData();
  assert.equal(records.length, demo.length);
  records.forEach((row,index)=> {
    assert.equal(row.orders, demo[index].orders);
    assert.equal(row.units, demo[index].units);
    assert.equal(row.placement, demo[index].placement);
    assert.ok(Math.abs(row.clicks-demo[index].clicks)<1e-9);
  });
});

test("union includes items only in one period; missing is not treated as zero", () => {
  const current = parseAdvertisingCsv(csv(fields, values.map((v, i) => i === 1 ? "NEW" : v)));
  const previous = parseAdvertisingCsv(csv(fields, values.map((v, i) => i === 0 ? "2026-11-06" : i === 1 ? "OLD" : v)));
  const items = compareItems([...current, ...previous], presetPeriods("2026-11-09", "3"));
  assert.equal(items.length, 2);
  const old = items.find(item => item.itemId === "OLD")!;
  assert.equal(old.firstRows, 0);
  assert.equal(metricValue("spend", old.first, old.firstRows), null);
  assert.equal(calculateChange(null, 20).direction, "unavailable");
  assert.equal(metricValue("spend", emptyAggregate(), 1), 0);
  assert.equal(metricValue("roas", emptyAggregate(), 1), null);
});

test("zero baselines never produce Infinity and equal values remain flat", () => {
  assert.deepEqual(calculateChange(10, 0), { delta: 10, percent: null, direction: "up" });
  assert.deepEqual(calculateChange(0, 0), { delta: 0, percent: 0, direction: "flat" });
  assert.equal(calculateChange(0, 10).percent, -100);
});

test("custom ranges include endpoints, count overlap independently, and reject invalid ranges", () => {
  const records = parseAdvertisingCsv(csv());
  const equal = { first: { start: "2026-11-09", end: "2026-11-09" }, second: { start: "2026-11-09", end: "2026-11-09" } };
  const [item] = compareItems(records, equal);
  assert.equal(item.first.spend, item.second.spend);
  assert.equal(item.firstRows, 1);
  assert.equal(validPeriods({ ...equal, first: { start: "2026-11-10", end: "2026-11-09" } }), false);
  assert.deepEqual(compareItems(records, { ...equal, first: { start: "", end: "" } }), []);
});
