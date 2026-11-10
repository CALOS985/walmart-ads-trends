"use client";

import {
  ChangeEvent,
  DragEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { PlacementCharts } from "./placement-charts";
import { PeriodComparison } from "./period-comparison";
import { MetricGuide } from "./metric-guide";
import { ATTRIBUTION_NOTE, UNIT_CONVERSION_NOTE, CLICK_NOTE } from "./metric-definitions";
import type { AdRecord, Aggregate, AnalysisDimension, Granularity, MetricKey, ProductMapping } from "./analytics";
import { METRICS, safeDivide, emptyAggregate, addRecord, addAggregate, formatMoney, formatNumber, toIsoDate, formatShortDate } from "./analytics";
import { parseReportDate, parseAdvertisingCsv, parseProductMappingCsv, readCsvFile } from "./csv";

type FileMeta = {
  name: string;
  rows: number;
  uploadedAt: Date;
  isDemo: boolean;
};

type MappingFileMeta = {
  name: string;
  rows: number;
  uploadedAt: Date;
};

const ITEM_COLORS = [
  "#0573d1",
  "#f59e0b",
  "#12a878",
  "#7c5ce5",
  "#e9556f",
  "#0e9ab7",
];

const GRANULARITY_OPTIONS: [Granularity, string][] = [
  ["day", "按日"],
  ["week", "按周"],
  ["month", "按月"],
];

const DIMENSIONS: Record<
  AnalysisDimension,
  { label: string; countLabel: string }
> = {
  itemId: { label: "Item ID", countLabel: "商品" },
  category: { label: "品类", countLabel: "品类" },
  backendSku: { label: "后台 SKU", countLabel: "后台 SKU" },
  sku: { label: "SKU", countLabel: "SKU" },
};

function createDemoData() {
  const itemIds = ["DEMO-3021", "DEMO-5748", "DEMO-8162"];
  const placements = ["Search In-grid", "Carousel", "Homepage"];
  const rows: AdRecord[] = [];
  for (let day = 0; day < 18; day += 1) {
    for (let itemIndex = 0; itemIndex < itemIds.length; itemIndex += 1) {
      for (
        let placementIndex = 0;
        placementIndex < placements.length;
        placementIndex += 1
      ) {
        const pulse =
          1 +
          Math.sin((day + itemIndex * 1.7 + placementIndex) * 0.72) * 0.28;
        const impressions = Math.round(
          (1800 + itemIndex * 920 + placementIndex * 420) * pulse,
        );
        const ctr = 0.38 + itemIndex * 0.17 + placementIndex * 0.08;
        const spend =
          impressions * (ctr / 100) * (0.78 + itemIndex * 0.16);
        const clicks = impressions * (ctr / 100);
        const units = Math.max(
          0,
          Math.round(
            impressions *
              (ctr / 100) *
              (0.075 + itemIndex * 0.018) *
              pulse,
          ),
        );
        const sales = units * (42 + itemIndex * 13);
        rows.push({
          date: new Date(2026, 5, 1 + day, 12),
          itemId: itemIds[itemIndex],
          placement: placements[placementIndex],
          impressions,
          spend,
          ctr,
          clicks,
          units,
          conversion: 0,
          reportedRoas: safeDivide(sales, spend),
          skuSales: sales * 0.93,
          sales,
          addToCart: Math.round(units * 2.2),
          pdpViews: Math.round(impressions * (ctr / 100) * 1.45),
        });
      }
    }
  }
  return rows;
}

function periodForDate(date: Date, granularity: Granularity) {
  if (granularity === "month") {
    return {
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      label: `${date.getFullYear()}年${date.getMonth() + 1}月`,
    };
  }
  if (granularity === "week") {
    const monday = new Date(date);
    const day = (monday.getDay() + 6) % 7;
    monday.setDate(monday.getDate() - day);
    return {
      key: toIsoDate(monday),
      label: `${formatShortDate(monday)}周`,
    };
  }
  return {
    key: toIsoDate(date),
    label: `${date.getMonth() + 1}/${date.getDate()}`,
  };
}

function dimensionValueForRecord(
  record: AdRecord,
  dimension: AnalysisDimension,
  mappingByItemId: Map<string, ProductMapping>,
) {
  if (dimension === "itemId") return record.itemId;
  const mapping = mappingByItemId.get(record.itemId);
  if (!mapping) return `未映射 · ${record.itemId}`;
  if (dimension === "category") return mapping.category;
  if (dimension === "backendSku") return mapping.backendSku;
  return mapping.sku;
}

function topDimensionValues(
  records: AdRecord[],
  dimension: AnalysisDimension,
  mappingByItemId: Map<string, ProductMapping>,
  limit = 3,
) {
  const spendByValue = new Map<string, number>();
  records.forEach((row) => {
    const value = dimensionValueForRecord(row, dimension, mappingByItemId);
    spendByValue.set(value, (spendByValue.get(value) ?? 0) + row.spend);
  });
  return [...spendByValue.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value]) => value);
}

function dateBounds(records: AdRecord[]) {
  if (!records.length) {
    const today = new Date();
    return { min: today, max: today };
  }
  return {
    min: new Date(Math.min(...records.map((row) => row.date.getTime()))),
    max: new Date(Math.max(...records.map((row) => row.date.getTime()))),
  };
}

const DEMO_DATA = createDemoData();
const DEMO_BOUNDS = dateBounds(DEMO_DATA);

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mappingInputRef = useRef<HTMLInputElement>(null);
  const itemFilterRef = useRef<HTMLDetailsElement>(null);
  const [records, setRecords] = useState<AdRecord[]>(DEMO_DATA);
  const [fileMeta, setFileMeta] = useState<FileMeta>({
    name: "示例广告报表.csv",
    rows: DEMO_DATA.length,
    uploadedAt: new Date(),
    isDemo: true,
  });
  const [productMappings, setProductMappings] = useState<ProductMapping[]>([]);
  const [mappingMeta, setMappingMeta] = useState<MappingFileMeta | null>(null);
  const [dimension, setDimension] = useState<AnalysisDimension>("itemId");
  const [selectedValues, setSelectedValues] = useState<string[]>(
    topDimensionValues(DEMO_DATA, "itemId", new Map()),
  );
  const [placement, setPlacement] = useState("all");
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [metric, setMetric] = useState<MetricKey>("sales");
  const [startDate, setStartDate] = useState(toIsoDate(DEMO_BOUNDS.min));
  const [endDate, setEndDate] = useState(toIsoDate(DEMO_BOUNDS.max));
  const [uploadError, setUploadError] = useState("");
  const [mappingError, setMappingError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [metricGuideOpen, setMetricGuideOpen] = useState(false);

  function showMetricGuide() {
    setMetricGuideOpen(true);
    requestAnimationFrame(() => {
      const guide = document.getElementById("metric-guide");
      guide?.scrollIntoView({ behavior: "instant", block: "start" });
      guide?.querySelector("summary")?.focus({ preventScroll: true });
    });
  }

  useEffect(() => {
    function closeItemFilterOnOutsideClick(event: PointerEvent) {
      const itemFilter = itemFilterRef.current;
      if (
        itemFilter?.open &&
        event.target instanceof Node &&
        !itemFilter.contains(event.target)
      ) {
        itemFilter.open = false;
      }
    }

    document.addEventListener("pointerdown", closeItemFilterOnOutsideClick);
    return () => {
      document.removeEventListener("pointerdown", closeItemFilterOnOutsideClick);
    };
  }, []);

  const bounds = useMemo(() => dateBounds(records), [records]);
  const itemIds = useMemo(
    () => [...new Set(records.map((row) => row.itemId))],
    [records],
  );
  const mappingByItemId = useMemo(
    () => new Map(productMappings.map((row) => [row.itemId, row])),
    [productMappings],
  );
  const dimensionOptions = useMemo(
    () =>
      [
        ...new Set(
          records.map((row) =>
            dimensionValueForRecord(row, dimension, mappingByItemId),
          ),
        ),
      ].sort((a, b) => a.localeCompare(b, "zh-CN")),
    [records, dimension, mappingByItemId],
  );
  const matchedItemCount = useMemo(
    () => itemIds.filter((itemId) => mappingByItemId.has(itemId)).length,
    [itemIds, mappingByItemId],
  );
  const placements = useMemo(
    () => [...new Set(records.map((row) => row.placement))].sort(),
    [records],
  );

  const comparisonSelection = useMemo(() => {
    const selected = new Set(selectedValues);
    return records.filter((row) =>
      selected.has(dimensionValueForRecord(row, dimension, mappingByItemId)),
    );
  }, [records, selectedValues, dimension, mappingByItemId]);

  const filteredRecords = useMemo(() => {
    const start = parseReportDate(startDate);
    const end = parseReportDate(endDate);
    const selected = new Set(selectedValues);
    return records.filter((row) => {
      const time = row.date.getTime();
      return (
        selected.has(dimensionValueForRecord(row, dimension, mappingByItemId)) &&
        (placement === "all" || row.placement === placement) &&
        (!start || time >= start.getTime()) &&
        (!end || time <= end.getTime())
      );
    });
  }, [
    records,
    selectedValues,
    dimension,
    mappingByItemId,
    placement,
    startDate,
    endDate,
  ]);

  const total = useMemo(() => {
    const aggregate = emptyAggregate();
    filteredRecords.forEach((row) => addRecord(aggregate, row));
    return aggregate;
  }, [filteredRecords]);

  const dimensionSummary = useMemo(() => {
    const map = new Map<string, Aggregate>();
    filteredRecords.forEach((row) => {
      const value = dimensionValueForRecord(row, dimension, mappingByItemId);
      const aggregate = map.get(value) ?? emptyAggregate();
      addRecord(aggregate, row);
      map.set(value, aggregate);
    });
    return [...map.entries()]
      .map(([value, aggregate]) => ({ value, aggregate }))
      .sort((a, b) => b.aggregate.sales - a.aggregate.sales);
  }, [filteredRecords, dimension, mappingByItemId]);

  const placementSummary = useMemo(() => {
    const map = new Map<string, Aggregate>();
    filteredRecords.forEach((row) => {
      const aggregate = map.get(row.placement) ?? emptyAggregate();
      addRecord(aggregate, row);
      map.set(row.placement, aggregate);
    });
    return [...map.entries()].sort((a, b) => b[1].sales - a[1].sales);
  }, [filteredRecords]);

  const chartData = useMemo(() => {
    const buckets = new Map<string, Map<string, Aggregate>>();
    const labels = new Map<string, string>();
    filteredRecords.forEach((row) => {
      const period = periodForDate(row.date, granularity);
      labels.set(period.key, period.label);
      const dimensionMap =
        buckets.get(period.key) ?? new Map<string, Aggregate>();
      const value = dimensionValueForRecord(row, dimension, mappingByItemId);
      const aggregate = dimensionMap.get(value) ?? emptyAggregate();
      addRecord(aggregate, row);
      dimensionMap.set(value, aggregate);
      buckets.set(period.key, dimensionMap);
    });
    const periods = [...buckets.keys()].sort();
    return {
      periods: periods.map((key) => ({ key, label: labels.get(key) ?? key })),
      series: selectedValues.map((value, index) => ({
        itemId: value,
        color: ITEM_COLORS[index % ITEM_COLORS.length],
        values: periods.map((key) => {
          const aggregate = buckets.get(key)?.get(value) ?? emptyAggregate();
          return METRICS[metric].value(aggregate);
        }),
      })),
    };
  }, [
    filteredRecords,
    granularity,
    metric,
    selectedValues,
    dimension,
    mappingByItemId,
  ]);

  async function handleFile(file: File | null) {
    if (!file) return;
    setUploadError("");
    try {
      const text = await readCsvFile(file);
      const parsed = parseAdvertisingCsv(text);
      const nextBounds = dateBounds(parsed);
      setRecords(parsed);
      setFileMeta({
        name: file.name,
        rows: parsed.length,
        uploadedAt: new Date(),
        isDemo: false,
      });
      setSelectedValues(
        topDimensionValues(parsed, dimension, mappingByItemId),
      );
      setPlacement("all");
      setStartDate(toIsoDate(nextBounds.min));
      setEndDate(toIsoDate(nextBounds.max));
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : "文件解析失败，请检查 CSV 格式。",
      );
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    void handleFile(event.target.files?.[0] ?? null);
    event.target.value = "";
  }

  async function handleMappingFile(file: File | null) {
    if (!file) return;
    setMappingError("");
    try {
      const text = await readCsvFile(file);
      const parsed = parseProductMappingCsv(text);
      const nextMappingByItemId = new Map(
        parsed.map((row) => [row.itemId, row]),
      );
      setProductMappings(parsed);
      setMappingMeta({
        name: file.name,
        rows: parsed.length,
        uploadedAt: new Date(),
      });
      if (dimension !== "itemId") {
        setSelectedValues(
          topDimensionValues(records, dimension, nextMappingByItemId),
        );
      }
    } catch (error) {
      setMappingError(
        error instanceof Error
          ? error.message
          : "映射表解析失败，请检查 CSV 格式。",
      );
    }
  }

  function onMappingFileChange(event: ChangeEvent<HTMLInputElement>) {
    void handleMappingFile(event.target.files?.[0] ?? null);
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    void handleFile(event.dataTransfer.files?.[0] ?? null);
  }

  function applyPreset(days: number | "all") {
    const max = bounds.max;
    const min =
      days === "all"
        ? bounds.min
        : new Date(
            max.getFullYear(),
            max.getMonth(),
            max.getDate() - days + 1,
            12,
          );
    setStartDate(toIsoDate(min < bounds.min ? bounds.min : min));
    setEndDate(toIsoDate(max));
  }

  function changeDimension(nextDimension: AnalysisDimension) {
    if (nextDimension !== "itemId" && !mappingMeta) return;
    setDimension(nextDimension);
    setSelectedValues(
      topDimensionValues(records, nextDimension, mappingByItemId),
    );
    if (itemFilterRef.current) itemFilterRef.current.open = false;
  }

  function toggleDimensionValue(value: string) {
    setSelectedValues((current) => {
      if (current.includes(value)) {
        return current.filter((selected) => selected !== value);
      }
      return [...current, value];
    });
  }

  const dimensionConfig = DIMENSIONS[dimension];
  const allDimensionValuesSelected =
    dimensionOptions.length > 0 &&
    selectedValues.length === dimensionOptions.length;
  const someDimensionValuesSelected =
    selectedValues.length > 0 && !allDimensionValuesSelected;
  const leadingItem = dimensionSummary[0];
  const efficientItem = [...dimensionSummary].sort(
    (a, b) =>
      safeDivide(b.aggregate.sales, b.aggregate.spend) -
      safeDivide(a.aggregate.sales, a.aggregate.spend),
  )[0];
  const maxItemSales = Math.max(
    1,
    ...dimensionSummary.map((row) => row.aggregate.sales),
  );
  const uniqueDays = new Set(filteredRecords.map((row) => toIsoDate(row.date)))
    .size;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span>
              <strong>Walmart 广告趋势看板</strong>
              <small>Advertising performance analytics</small>
            </span>
          </div>
          <span className="privacy-pill">
            <span className="privacy-dot" aria-hidden="true" />
            数据仅在本机处理
          </span>
        </div>
      </header>

      <div className="dashboard">
        <section className="title-row">
          <div>
            <p className="eyebrow">AD PERFORMANCE CENTER</p>
            <h1>广告表现总览</h1>
            <p>
              按 Item ID、品类与 SKU 等维度对比核心指标和趋势变化。
            </p>
          </div>
          <div className="report-status">
            <span className={fileMeta.isDemo ? "status-icon demo" : "status-icon"}>
              {fileMeta.isDemo ? "D" : "✓"}
            </span>
            <span>
              <small>{fileMeta.isDemo ? "当前为演示数据" : "报表解析完成"}</small>
              <strong title={fileMeta.name}>{fileMeta.name}</strong>
            </span>
          </div>
        </section>

        <section className="control-card">
          <input
            ref={fileInputRef}
            className="sr-only"
            type="file"
            accept=".csv,text/csv"
            onChange={onFileChange}
            aria-label="上传广告报表 CSV"
          />
          <input
            ref={mappingInputRef}
            className="sr-only"
            type="file"
            accept=".csv,text/csv"
            onChange={onMappingFileChange}
            aria-label="上传产品映射表 CSV"
          />
          <div
            className={`upload-zone ${isDragging ? "is-dragging" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
          >
            <span className="upload-icon" aria-hidden="true">
              ↑
            </span>
            <div>
              <strong>
                {fileMeta.isDemo ? "上传广告报表，开始分析" : "广告报表已载入"}
              </strong>
              <p>
                {fileMeta.isDemo
                  ? "支持 Walmart CSV，可拖拽或选择文件；按字段名称自动识别，列顺序可自由调整，请保留模板字段名称。导入模板可以从网站下载，并根据示例模板配置好沃尔玛广告后台Custom Reports字段模板并保存"
                  : `${formatNumber(fileMeta.rows)} 行数据 · ${itemIds.length} 个 Item ID · ${formatShortDate(bounds.min)}—${formatShortDate(bounds.max)}`}
              </p>
            </div>
            <div className="upload-actions">
              <a
                className="button button-template"
                href={`${import.meta.env.BASE_URL}templates/ads-report-template.csv`}
                download="广告报表模板.csv"
                aria-label="下载广告报表模板"
              >
                <span aria-hidden="true">↓</span>
                下载模板
              </a>
              <button
                type="button"
                className="button button-primary"
                onClick={() => fileInputRef.current?.click()}
              >
                选择广告报表
              </button>
            </div>
          </div>
          {uploadError && (
            <div className="error-message" role="alert">
              <span>!</span>
              {uploadError}
            </div>
          )}

          <div className={`mapping-upload ${mappingMeta ? "loaded" : ""}`}>
            <span className="mapping-icon" aria-hidden="true">
              ⇄
            </span>
            <div>
              <strong>
                {mappingMeta ? "产品映射表已载入" : "上传产品映射表"}
              </strong>
              <p>
                {mappingMeta
                  ? `${mappingMeta.name} · ${mappingMeta.rows} 条映射 · 已匹配 ${matchedItemCount} / ${itemIds.length} 个报表 Item ID`
                  : "支持字段：品类、后台SKU、Item ID、SKU"}
              </p>
            </div>
            <div className="upload-actions">
              <a
                className="button button-template"
                href={`${import.meta.env.BASE_URL}templates/product-mapping-template.csv`}
                download="映射表模板.csv"
                aria-label="下载映射表模板"
              >
                <span aria-hidden="true">↓</span>
                下载模板
              </a>
              <button
                type="button"
                className="button button-mapping"
                onClick={() => mappingInputRef.current?.click()}
              >
                {mappingMeta ? "更换映射表" : "选择映射表"}
              </button>
            </div>
          </div>
          {mappingError && (
            <div className="error-message" role="alert">
              <span>!</span>
              {mappingError}
            </div>
          )}

          <div className="filter-grid">
            <div className="filter-block dimension-filter">
              <label htmlFor="dimension-select">分析维度</label>
              <div className="select-control">
                <select
                  id="dimension-select"
                  value={dimension}
                  onChange={(event) =>
                    changeDimension(event.target.value as AnalysisDimension)
                  }
                >
                  <option value="itemId">Item ID</option>
                  <option value="category" disabled={!mappingMeta}>
                    品类
                  </option>
                  <option value="backendSku" disabled={!mappingMeta}>
                    后台 SKU
                  </option>
                  <option value="sku" disabled={!mappingMeta}>
                    SKU
                  </option>
                </select>
                <b aria-hidden="true" />
              </div>
            </div>

            <div className="filter-block item-filter">
              <label>{dimensionConfig.label}</label>
              <details ref={itemFilterRef} className="multi-select">
                <summary>
                  <span>
                    已选 {selectedValues.length} / {dimensionOptions.length}
                  </span>
                  <b aria-hidden="true" />
                </summary>
                <div className="multi-menu">
                  <div className="menu-header">
                    <strong>选择对比{dimensionConfig.label}</strong>
                    <button
                      type="button"
                      className={`select-all-toggle${
                        allDimensionValuesSelected ? " is-checked" : ""
                      }${someDimensionValuesSelected ? " is-mixed" : ""}`}
                      role="checkbox"
                      aria-checked={
                        someDimensionValuesSelected
                          ? "mixed"
                          : allDimensionValuesSelected
                      }
                      onClick={() =>
                        setSelectedValues(
                          allDimensionValuesSelected ? [] : dimensionOptions,
                        )
                      }
                    >
                      <span className="select-all-box" aria-hidden="true">
                        {allDimensionValuesSelected
                          ? "✓"
                          : someDimensionValuesSelected
                            ? "−"
                            : ""}
                      </span>
                      全选
                    </button>
                  </div>
                  {dimensionOptions.map((value) => (
                    <label className="check-row" key={value}>
                      <input
                        type="checkbox"
                        checked={selectedValues.includes(value)}
                        onChange={() => toggleDimensionValue(value)}
                      />
                      <i
                        style={{
                          background:
                            ITEM_COLORS[
                              selectedValues.indexOf(value) %
                                ITEM_COLORS.length
                            ] || "#aab3c2",
                        }}
                      />
                      <span>{value}</span>
                    </label>
                  ))}
                </div>
              </details>
            </div>

            <div className="filter-block">
              <label htmlFor="placement-select">广告版位</label>
              <div className="select-control">
                <select
                  id="placement-select"
                  value={placement}
                  onChange={(event) => setPlacement(event.target.value)}
                >
                  <option value="all">全部版位</option>
                  {placements.map((name) => (
                    <option value={name} key={name}>
                      {name}
                    </option>
                  ))}
                </select>
                <b aria-hidden="true" />
              </div>
            </div>

            <div className="filter-block period-filter">
              <label>时间粒度</label>
              <div className="segmented" aria-label="选择时间粒度">
                {GRANULARITY_OPTIONS.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={granularity === value}
                    className={granularity === value ? "active" : ""}
                    onClick={() => setGranularity(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="filter-block date-filter">
              <label>自定义时间段</label>
              <div className="date-range">
                <input
                  type="date"
                  value={startDate}
                  min={toIsoDate(bounds.min)}
                  max={endDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  aria-label="开始日期"
                />
                <span>至</span>
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  max={toIsoDate(bounds.max)}
                  onChange={(event) => setEndDate(event.target.value)}
                  aria-label="结束日期"
                />
              </div>
              <div className="quick-dates">
                <button type="button" onClick={() => applyPreset(7)}>
                  近 7 天
                </button>
                <button type="button" onClick={() => applyPreset(30)}>
                  近 30 天
                </button>
                <button type="button" onClick={() => applyPreset("all")}>
                  全部
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="section-heading">
          <div>
            <span className="section-number">01</span>
            <div>
              <h2>数据概览</h2>
              <p>
                {uniqueDays} 个数据日 · 已选 {selectedValues.length} 个
                {dimensionConfig.countLabel} ·{" "}
                {placement === "all" ? "全部版位" : placement}
              </p>
            </div>
          </div>
          <span className="date-caption">
            {formatShortDate(parseReportDate(startDate) ?? bounds.min)} —{" "}
            {formatShortDate(parseReportDate(endDate) ?? bounds.max)}
          </span>
        </section>

        <p className="metric-context-note">
          <strong>口径提示</strong>
          <span>“30天”是后台归因模型，统计范围由所选日期决定；件数转化率 = 归因售出件数 ÷ 点击次数 × 100%，不是订单转化率。</span>
          <a href="#metric-guide" onClick={event => { event.preventDefault(); showMetricGuide(); }}>查看指标口径与使用说明 ↓</a>
        </p>

        <section className="kpi-grid">
          <KpiCard
            tone="blue"
            label="总广告花费"
            value={formatMoney(total.spend)}
            detail={`${formatNumber(total.clicks)} 次计算用点击`}
            info={CLICK_NOTE}
            onShowGuide={showMetricGuide}
            icon="$"
          />
          <KpiCard
            tone="green"
            label="归因销售额（30天模型）"
            value={formatMoney(total.sales)}
            detail="按所选日期汇总 · 非最近30天"
            info={ATTRIBUTION_NOTE}
            onShowGuide={showMetricGuide}
            icon="↗"
          />
          <KpiCard
            tone="purple"
            label="整体 ROAS"
            value={`${safeDivide(total.sales, total.spend).toFixed(2)}x`}
            detail="每 $1 广告花费回报"
            icon="R"
          />
          <KpiCard
            tone="orange"
            label="平均 CTR"
            value={`${(safeDivide(total.clicks, total.impressions) * 100).toFixed(2)}%`}
            detail={`${formatNumber(total.impressions)} 次曝光`}
            icon="↖"
          />
          <KpiCard
            tone="navy"
            label="平均 CPC"
            value={formatMoney(safeDivide(total.spend, total.clicks))}
            detail="每次点击平均花费"
            icon="C"
          />
          <KpiCard
            tone="red"
            label="件数转化率"
            value={`${(safeDivide(total.units, total.clicks) * 100).toFixed(2)}%`}
            detail={`${formatNumber(total.units)} 件归因售出 · 非订单转化率`}
            info={UNIT_CONVERSION_NOTE}
            onShowGuide={showMetricGuide}
            icon="✓"
          />
          <KpiCard
            tone="amber"
            label="加购物车数量"
            value={formatNumber(total.addToCart)}
            detail="30天模型字段 · 总加购优先"
            icon="＋"
          />
          <KpiCard
            tone="cyan"
            label="详情页浏览"
            value={formatNumber(total.pdpViews)}
            detail="广告商品 · 30天模型"
            icon="◎"
          />
        </section>

        <section className="placement-overview-card">
          <div className="placement-overview-header">
            <div>
              <h3>各广告版位数据</h3>
              <p>同一筛选范围内，按版位汇总 8 项核心广告指标</p>
            </div>
            <span>{placementSummary.length} 个版位</span>
          </div>
          <div className="placement-table-wrap">
            <table className="placement-metrics-table">
              <thead>
                <tr>
                  <th>广告版位</th>
                  <th>总广告花费</th>
                  <th>归因销售额</th>
                  <th>整体 ROAS</th>
                  <th>平均 CTR</th>
                  <th>平均 CPC</th>
                  <th>件数转化率</th>
                  <th>加购物车数量</th>
                  <th>详情页浏览</th>
                </tr>
              </thead>
              <tbody>
                {placementSummary.map(([placementName, aggregate], index) => (
                  <tr key={placementName}>
                    <td>
                      <span className="placement-name">
                        <i
                          style={{
                            background:
                              ITEM_COLORS[index % ITEM_COLORS.length],
                          }}
                        />
                        {placementName}
                      </span>
                    </td>
                    <td>{formatMoney(aggregate.spend)}</td>
                    <td className="placement-sales">
                      {formatMoney(aggregate.sales)}
                    </td>
                    <td>
                      {safeDivide(aggregate.sales, aggregate.spend).toFixed(2)}x
                    </td>
                    <td>
                      {(
                        safeDivide(aggregate.clicks, aggregate.impressions) *
                        100
                      ).toFixed(2)}
                      %
                    </td>
                    <td>
                      {formatMoney(
                        safeDivide(aggregate.spend, aggregate.clicks),
                      )}
                    </td>
                    <td>
                      {(
                        safeDivide(aggregate.units, aggregate.clicks) * 100
                      ).toFixed(2)}
                      %
                    </td>
                    <td>{formatNumber(aggregate.addToCart)}</td>
                    <td>{formatNumber(aggregate.pdpViews)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!placementSummary.length && (
              <div className="empty-state">当前筛选条件下没有版位数据</div>
            )}
          </div>
          <PlacementCharts
            data={placementSummary.map(([name, aggregate], index) => ({
              ...aggregate,
              name,
              color: ITEM_COLORS[index % ITEM_COLORS.length],
            }))}
          />
        </section>

        <section className="chart-card">
          <div className="card-header chart-header">
            <div>
              <span className="section-number">02</span>
              <div>
                <h2>趋势对比</h2>
                <p>
                  按{dimensionConfig.label}查看各项广告指标随时间的变化
                </p>
              </div>
            </div>
            <div className="chart-legend">
              {chartData.series.map((series) => (
                <span key={series.itemId}>
                  <i style={{ background: series.color }} />
                  {series.itemId}
                </span>
              ))}
            </div>
          </div>

          <div className="chart-toolbar">
            <div className="trend-date-filter">
              <div className="trend-date-heading">
                <span>自定义时间段</span>
                <div className="trend-date-actions">
                  <button type="button" onClick={() => applyPreset(7)}>
                    近 7 天
                  </button>
                  <button type="button" onClick={() => applyPreset(30)}>
                    近 30 天
                  </button>
                  <button type="button" onClick={() => applyPreset("all")}>
                    全部
                  </button>
                </div>
              </div>
              <div className="date-range trend-date-range">
                <input
                  type="date"
                  value={startDate}
                  min={toIsoDate(bounds.min)}
                  max={endDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  aria-label="趋势图开始日期"
                />
                <span>至</span>
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  max={toIsoDate(bounds.max)}
                  onChange={(event) => setEndDate(event.target.value)}
                  aria-label="趋势图结束日期"
                />
              </div>
            </div>

            <div className="trend-granularity">
              <span>时间粒度</span>
              <div
                className="segmented segmented-compact"
                aria-label="选择趋势图时间粒度"
              >
                {GRANULARITY_OPTIONS.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={granularity === value}
                    className={granularity === value ? "active" : ""}
                    onClick={() => setGranularity(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="metric-tabs" role="tablist" aria-label="趋势指标">
            {(Object.keys(METRICS) as MetricKey[]).map((key) => (
              <button
                type="button"
                role="tab"
                aria-selected={metric === key}
                className={metric === key ? "active" : ""}
                key={key}
                onClick={() => setMetric(key)}
              >
                {METRICS[key].shortLabel}
              </button>
            ))}
          </div>

          <TrendChart
            periods={chartData.periods}
            series={chartData.series}
            metric={metric}
            dimensionLabel={dimensionConfig.label}
          />
        </section>

        <PeriodComparison
          key={fileMeta.uploadedAt.getTime()}
          records={records}
          selectedRecords={comparisonSelection}
          placement={placement}
          latestDate={toIsoDate(bounds.max)}
        />

        <div className="analysis-grid">
          <section className="table-card">
            <div className="card-header">
              <div>
                <span className="section-number">04</span>
                <div>
                  <h2>{dimensionConfig.label}表现排名</h2>
                  <p>按归因销售额从高到低排列</p>
                </div>
              </div>
              <span className="item-count">
                {dimensionSummary.length} 个{dimensionConfig.countLabel}
              </span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{dimensionConfig.label}</th>
                    <th>广告花费</th>
                    <th>归因销售额</th>
                    <th>售出件数</th>
                    <th>ROAS</th>
                    <th>CTR</th>
                    <th>件数转化率</th>
                  </tr>
                </thead>
                <tbody>
                  {dimensionSummary.map(({ value, aggregate }, index) => (
                    <tr key={value}>
                      <td>
                        <div className="item-cell">
                          <span className="rank">{index + 1}</span>
                          <span>
                            <strong>{value}</strong>
                            <i>
                              <b
                                style={{
                                  width: `${(aggregate.sales / maxItemSales) * 100}%`,
                                }}
                              />
                            </i>
                          </span>
                        </div>
                      </td>
                      <td>{formatMoney(aggregate.spend)}</td>
                      <td className="sales-cell">
                        {formatMoney(aggregate.sales)}
                      </td>
                      <td>{formatNumber(aggregate.units)}</td>
                      <td>
                        <span
                          className={`roas-badge ${
                            safeDivide(aggregate.sales, aggregate.spend) >= 4
                              ? "good"
                              : ""
                          }`}
                        >
                          {safeDivide(
                            aggregate.sales,
                            aggregate.spend,
                          ).toFixed(2)}
                          x
                        </span>
                      </td>
                      <td>
                        {(
                          safeDivide(aggregate.clicks, aggregate.impressions) *
                          100
                        ).toFixed(2)}
                        %
                      </td>
                      <td>
                        {(
                          safeDivide(aggregate.units, aggregate.clicks) * 100
                        ).toFixed(2)}
                        %
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!dimensionSummary.length && (
                <div className="empty-state">当前筛选条件下没有数据</div>
              )}
            </div>
          </section>

          <aside className="insight-card">
            <div className="insight-title">
              <span aria-hidden="true">✦</span>
              <div>
                <h2>快速洞察</h2>
                <p>基于当前筛选自动计算</p>
              </div>
            </div>

            <InsightRow
              color="green"
              icon="↗"
              title="销售额领先"
              primary={leadingItem?.value ?? "—"}
              detail={
                leadingItem
                  ? `${formatMoney(leadingItem.aggregate.sales)} 归因销售额`
                  : "暂无数据"
              }
            />
            <InsightRow
              color="purple"
              icon="R"
              title="投放效率最佳"
              primary={efficientItem?.value ?? "—"}
              detail={
                efficientItem
                  ? `${safeDivide(efficientItem.aggregate.sales, efficientItem.aggregate.spend).toFixed(2)}x ROAS`
                  : "暂无数据"
              }
            />
            <InsightRow
              color="orange"
              icon="◎"
              title="贡献最高版位"
              primary={placementSummary[0]?.[0] ?? "—"}
              detail={
                placementSummary[0]
                  ? `${formatMoney(placementSummary[0][1].sales)} 销售额`
                  : "暂无数据"
              }
            />

            <div className="coverage">
              <div>
                <span>数据覆盖</span>
                <strong>{uniqueDays} 天</strong>
              </div>
              <div>
                <span>有效记录</span>
                <strong>{formatNumber(filteredRecords.length)} 行</strong>
              </div>
            </div>
          </aside>
        </div>

        <MetricGuide open={metricGuideOpen} onOpenChange={setMetricGuideOpen} />

        <div className="dashboard-notice">
          <span className="brand-mark mini" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>
            广告报表和产品映射表只在当前浏览器中读取和分析。
          </span>
          <span>Walmart Ads Analyzer · 2026</span>
        </div>
      </div>

      <footer className="site-footer">
        <div className="site-footer-copyright">
          <span>Copyright BY 卡洛斯的百宝箱</span>
          <a
            href="https://beian.miit.gov.cn/"
            target="_blank"
            rel="nofollow noopener noreferrer"
          >
            粤ICP备2026054366号-1
          </a>
        </div>
        <nav className="site-footer-links" aria-label="网站链接">
          <a
            href="https://calos985.github.io/"
            target="_blank"
            rel="noopener noreferrer"
          >
            卡洛斯博客
          </a>
          <a
            href="https://carloswiki.com/blog/"
            target="_blank"
            rel="noopener noreferrer"
          >
            卡洛斯博客2
          </a>
        </nav>
      </footer>
    </main>
  );
}

function KpiCard({
  tone,
  label,
  value,
  detail,
  icon,
  info,
  onShowGuide,
}: {
  tone: string;
  label: string;
  value: string;
  detail: string;
  icon: string;
  info?: string;
  onShowGuide?: () => void;
}) {
  return (
    <article className={`kpi-card ${tone}`}>
      <div>
        <div className="kpi-label-row">
          <span className="kpi-label">{label}</span>
          {info && <a className="kpi-info-link" href="#metric-guide" title={info}
            aria-label={`${label}口径说明：${info}`} onClick={event => {
              if (onShowGuide) { event.preventDefault(); onShowGuide(); }
            }}>ⓘ</a>}
        </div>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
      <span className="kpi-icon" aria-hidden="true">
        {icon}
      </span>
    </article>
  );
}

function InsightRow({
  color,
  icon,
  title,
  primary,
  detail,
}: {
  color: string;
  icon: string;
  title: string;
  primary: string;
  detail: string;
}) {
  return (
    <div className="insight-row">
      <span className={`insight-icon ${color}`} aria-hidden="true">
        {icon}
      </span>
      <div>
        <span>{title}</span>
        <strong title={primary}>{primary}</strong>
        <small>{detail}</small>
      </div>
    </div>
  );
}

function distanceToLineSegment(
  pointX: number,
  pointY: number,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
) {
  const segmentX = endX - startX;
  const segmentY = endY - startY;
  const segmentLengthSquared = segmentX ** 2 + segmentY ** 2;
  if (segmentLengthSquared === 0) {
    return Math.hypot(pointX - startX, pointY - startY);
  }
  const projection = Math.max(
    0,
    Math.min(
      1,
      ((pointX - startX) * segmentX + (pointY - startY) * segmentY) /
        segmentLengthSquared,
    ),
  );
  const closestX = startX + projection * segmentX;
  const closestY = startY + projection * segmentY;
  return Math.hypot(pointX - closestX, pointY - closestY);
}

function TrendChart({
  periods,
  series,
  metric,
  dimensionLabel,
}: {
  periods: { key: string; label: string }[];
  series: { itemId: string; color: string; values: number[] }[];
  metric: MetricKey;
  dimensionLabel: string;
}) {
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const width = 1060;
  const height = 370;
  const margin = { left: 70, right: 24, top: 24, bottom: 64 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const values = series.flatMap((line) => line.values);
  const maxValue = Math.max(1, ...values) * 1.12;
  const xAt = (index: number) =>
    margin.left +
    (periods.length <= 1
      ? plotWidth / 2
      : (index / (periods.length - 1)) * plotWidth);
  const yAt = (value: number) =>
    margin.top + plotHeight - (value / maxValue) * plotHeight;
  const labelStep = Math.max(1, Math.ceil(periods.length / 8));
  const hoveredSeries = series.find((line) => line.itemId === hoveredItemId);

  function updateHoveredSeries(pointerX: number, pointerY: number) {
    let nearestItemId: string | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    series.forEach((line) => {
      const coordinates = line.values.map((value, index) => ({
        x: xAt(index),
        y: yAt(value),
      }));
      if (coordinates.length === 1) {
        const distance = Math.hypot(
          pointerX - coordinates[0].x,
          pointerY - coordinates[0].y,
        );
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestItemId = line.itemId;
        }
        return;
      }
      for (let index = 1; index < coordinates.length; index += 1) {
        const distance = distanceToLineSegment(
          pointerX,
          pointerY,
          coordinates[index - 1].x,
          coordinates[index - 1].y,
          coordinates[index].x,
          coordinates[index].y,
        );
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestItemId = line.itemId;
        }
      }
    });

    setHoveredItemId(nearestDistance <= 12 ? nearestItemId : null);
  }

  if (!periods.length) {
    return (
      <div className="chart-empty">
        <span>⌁</span>
        <strong>当前筛选条件下暂无趋势数据</strong>
        <p>请调整{dimensionLabel}、版位或时间范围。</p>
      </div>
    );
  }

  return (
    <div className="chart-wrap">
      <div className="chart-title-mobile">{METRICS[metric].label}</div>
      <div
        className={`chart-hover-readout ${hoveredSeries ? "active" : ""}`}
        aria-live="polite"
      >
        {hoveredSeries ? (
          <>
            <i style={{ background: hoveredSeries.color }} />
            <span>当前折线</span>
            <strong>
              {dimensionLabel}：{hoveredSeries.itemId}
            </strong>
          </>
        ) : (
          <span>将鼠标移到折线上查看{dimensionLabel}</span>
        )}
      </div>
      <svg
        className="trend-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${dimensionLabel}${METRICS[metric].label}趋势图`}
        onPointerMove={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          updateHoveredSeries(
            ((event.clientX - bounds.left) / bounds.width) * width,
            ((event.clientY - bounds.top) / bounds.height) * height,
          );
        }}
        onPointerLeave={() => setHoveredItemId(null)}
      >
        {[0, 1, 2, 3, 4].map((step) => {
          const value = maxValue * (1 - step / 4);
          const y = margin.top + (step / 4) * plotHeight;
          return (
            <g key={step}>
              <line
                x1={margin.left}
                x2={width - margin.right}
                y1={y}
                y2={y}
                className="grid-line"
              />
              <text
                x={margin.left - 12}
                y={y + 4}
                textAnchor="end"
                className="axis-label"
              >
                {METRICS[metric].format(value)}
              </text>
            </g>
          );
        })}

        {periods.map((period, index) => {
          if (index % labelStep !== 0 && index !== periods.length - 1) {
            return null;
          }
          const x = xAt(index);
          return (
            <g key={period.key}>
              <line
                x1={x}
                x2={x}
                y1={margin.top}
                y2={margin.top + plotHeight}
                className="vertical-line"
              />
              <text
                x={x}
                y={height - 25}
                textAnchor="middle"
                className="axis-label x-label"
              >
                {period.label}
              </text>
            </g>
          );
        })}

        {series.map((line, seriesIndex) => {
          const points = line.values
            .map((value, index) => `${xAt(index)},${yAt(value)}`)
            .join(" ");
          const areaPoints = `${margin.left},${margin.top + plotHeight} ${points} ${xAt(periods.length - 1)},${margin.top + plotHeight}`;
          const isHovered = hoveredItemId === line.itemId;
          const isDimmed = hoveredItemId !== null && !isHovered;
          return (
            <g
              key={line.itemId}
              className={`chart-series ${isHovered ? "is-hovered" : ""} ${isDimmed ? "is-dimmed" : ""}`}
            >
              {seriesIndex === 0 && (
                <polygon
                  points={areaPoints}
                  fill={line.color}
                  opacity="0.07"
                />
              )}
              {isHovered && (
                <>
                  <polyline
                    points={points}
                    fill="none"
                    stroke="#162b44"
                    strokeWidth="10"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    className="series-outline"
                  />
                  <polyline
                    points={points}
                    fill="none"
                    stroke="#fff"
                    strokeWidth="7"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    className="series-halo"
                  />
                </>
              )}
              <polyline
                points={points}
                fill="none"
                stroke={line.color}
                strokeWidth="3"
                strokeLinejoin="round"
                strokeLinecap="round"
                className="series-path"
                tabIndex={0}
                aria-label={`${dimensionLabel} ${line.itemId} 的${METRICS[metric].label}折线`}
                onFocus={() => setHoveredItemId(line.itemId)}
                onBlur={() => setHoveredItemId(null)}
              />
              {line.values.map((value, index) => (
                <circle
                  key={`${line.itemId}-${periods[index].key}`}
                  cx={xAt(index)}
                  cy={yAt(value)}
                  r="4"
                  fill="#fff"
                  stroke={line.color}
                  strokeWidth="2.5"
                  className={`data-point ${isHovered ? "active" : ""}`}
                >
                  <title>
                    {line.itemId} · {periods[index].label}:{" "}
                    {METRICS[metric].format(value)}
                  </title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
