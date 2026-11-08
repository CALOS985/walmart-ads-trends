import { useState } from "react";

type PlacementMetric = "spend" | "sales" | "addToCart" | "pdpViews";

export type PlacementChartRow = {
  name: string;
  color: string;
  spend: number;
  sales: number;
  addToCart: number;
  pdpViews: number;
};

const PLACEMENT_METRICS: Record<
  PlacementMetric,
  { label: string; currency: boolean }
> = {
  spend: { label: "总广告花费", currency: true },
  sales: { label: "总销售额", currency: true },
  addToCart: { label: "加购物车数量", currency: false },
  pdpViews: { label: "详情页浏览", currency: false },
};

export function placementSeries(data: PlacementChartRow[], metric: PlacementMetric) {
  return data.map((row) => ({
    ...row,
    value: Number.isFinite(row[metric]) ? Math.max(0, row[metric]) : 0,
  }));
}

function formatValue(value: number, metric: PlacementMetric) {
  const currency = PLACEMENT_METRICS[metric].currency;
  return new Intl.NumberFormat("zh-CN", {
    ...(currency ? { style: "currency", currency: "USD" } : {}),
    maximumFractionDigits: currency && value < 1000 ? 2 : 0,
  }).format(value);
}

export function pieSlicePath(startAngle: number, endAngle: number) {
  const center = 140;
  const radius = 112;
  if (endAngle - startAngle >= 359.999999) {
    return "M 140 28 A 112 112 0 1 1 140 252 A 112 112 0 1 1 140 28 Z";
  }
  const point = (angle: number) => {
    const radians = ((angle - 90) * Math.PI) / 180;
    return [center + radius * Math.cos(radians), center + radius * Math.sin(radians)];
  };
  const [startX, startY] = point(startAngle);
  const [endX, endY] = point(endAngle);
  return `M ${center} ${center} L ${startX} ${startY} A ${radius} ${radius} 0 ${endAngle - startAngle > 180 ? 1 : 0} 1 ${endX} ${endY} Z`;
}

export function placementBarScale(maximum: number, currency: boolean) {
  if (maximum <= 0 || !Number.isFinite(maximum)) {
    return { upper: 1, ticks: [0, 1] };
  }
  const magnitude = 10 ** Math.floor(Math.log10(maximum / 4));
  const fraction = maximum / 4 / magnitude;
  const factor = [1, 2, 2.5, 5, 10].find((value) => value >= fraction) ?? 10;
  const step = currency ? factor * magnitude : Math.max(1, Math.ceil(factor * magnitude));
  const count = Math.ceil(maximum / step);
  return {
    upper: count * step,
    ticks: Array.from({ length: count + 1 }, (_, index) =>
      Number((index * step).toPrecision(12)),
    ),
  };
}

function MetricSelect({
  id,
  label,
  metric,
  onChange,
}: {
  id: string;
  label: string;
  metric: PlacementMetric;
  onChange: (metric: PlacementMetric) => void;
}) {
  return (
    <div className="select-control placement-metric-select">
      <select
        id={id}
        aria-label={label}
        value={metric}
        onChange={(event) => onChange(event.target.value as PlacementMetric)}
      >
        {Object.entries(PLACEMENT_METRICS).map(([value, config]) => (
          <option key={value} value={value}>{config.label}</option>
        ))}
      </select>
      <b aria-hidden="true" />
    </div>
  );
}

function ChartEmpty() {
  return <div className="placement-chart-empty">当前筛选范围内暂无可展示数据</div>;
}

function PlacementPie({ data, metric }: { data: PlacementChartRow[]; metric: PlacementMetric }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const rows = placementSeries(data, metric);
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const active = rows.some((row) => row.name === hovered) ? hovered : null;
  let angle = 0;

  if (!total) return <ChartEmpty />;

  return (
    <div className="placement-pie-content">
      <svg viewBox="0 0 280 280" role="img" aria-label={`${PLACEMENT_METRICS[metric].label}广告版位占比饼状图`}>
        {rows.filter((row) => row.value > 0).map((row) => {
          const start = angle;
          angle += (row.value / total) * 360;
          const label = `${row.name}：${formatValue(row.value, metric)}，占比 ${((row.value / total) * 100).toFixed(1)}%`;
          return (
            <path
              key={row.name}
              className={`placement-pie-slice${active === row.name ? " is-active" : ""}`}
              d={pieSlicePath(start, angle)}
              fill={row.color}
              opacity={active && active !== row.name ? 0.35 : 1}
              stroke="#fff"
              strokeWidth="3"
              aria-label={label}
              tabIndex={0}
              onMouseEnter={() => setHovered(row.name)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(row.name)}
              onBlur={() => setHovered(null)}
            >
              <title>{label}</title>
            </path>
          );
        })}
      </svg>
      <ul className="placement-pie-legend" aria-label="饼图版位明细">
        {rows.map((row) => (
          <li
            key={row.name}
            className={active === row.name ? "is-active" : ""}
            tabIndex={0}
            onMouseEnter={() => setHovered(row.name)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(row.name)}
            onBlur={() => setHovered(null)}
          >
            <i style={{ background: row.color }} aria-hidden="true" />
            <span title={row.name}>{row.name}</span>
            <strong>{formatValue(row.value, metric)}</strong>
            <small>{((row.value / total) * 100).toFixed(1)}%</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PlacementBars({ data, metric }: { data: PlacementChartRow[]; metric: PlacementMetric }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const rows = placementSeries(data, metric);
  const maximum = Math.max(0, ...rows.map((row) => row.value));
  if (!maximum) return <ChartEmpty />;

  const { upper, ticks } = placementBarScale(maximum, PLACEMENT_METRICS[metric].currency);
  const left = 76;
  const top = 30;
  const height = 204;
  const width = 524;
  const column = width / rows.length;
  const barWidth = Math.min(48, column * 0.55);
  const active = rows.some((row) => row.name === hovered) ? hovered : null;

  return (
    <div className="placement-bar-viewport">
      <svg viewBox="0 0 620 300" role="img" aria-label={`${PLACEMENT_METRICS[metric].label}广告版位柱状图`}>
        {ticks.map((value) => {
          const y = top + height - (value / upper) * height;
          return (
            <g key={value} className="placement-bar-tick">
              <line x1={left} x2={left + width} y1={y} y2={y} />
              <text x={left - 10} y={y + 4} textAnchor="end">{formatValue(value, metric)}</text>
            </g>
          );
        })}
        {rows.map((row, index) => {
          const center = left + column * (index + 0.5);
          const barHeight = (row.value / upper) * height;
          const y = top + height - barHeight;
          const words = row.name.split(/\s+/);
          const labels = words.length > 1
            ? [words.slice(0, -1).join(" "), words[words.length - 1]]
            : [row.name];
          const label = `${row.name}：${PLACEMENT_METRICS[metric].label} ${formatValue(row.value, metric)}`;
          return (
            <g
              key={row.name}
              className={`placement-bar-column${active === row.name ? " is-active" : ""}`}
              opacity={active && active !== row.name ? 0.35 : 1}
              tabIndex={0}
              aria-label={label}
              onMouseEnter={() => setHovered(row.name)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(row.name)}
              onBlur={() => setHovered(null)}
            >
              <title>{label}</title>
              <rect x={center - barWidth / 2} y={y} width={barWidth} height={barHeight} rx="5" fill={row.color} />
              <text className="placement-bar-value" x={center} y={y - 9} textAnchor="middle">{formatValue(row.value, metric)}</text>
              <text className="placement-bar-label" x={center} y={top + height + 21} textAnchor="middle">
                {labels.map((line, lineIndex) => (
                  <tspan key={lineIndex} x={center} dy={lineIndex ? 14 : 0}>
                    {line.length > 15 ? `${line.slice(0, 14)}…` : line}
                  </tspan>
                ))}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function PlacementCharts({ data }: { data: PlacementChartRow[] }) {
  const [pieMetric, setPieMetric] = useState<PlacementMetric>("spend");
  const [barMetric, setBarMetric] = useState<PlacementMetric>("sales");
  const total = (metric: PlacementMetric) =>
    placementSeries(data, metric).reduce((sum, row) => sum + row.value, 0);

  return (
    <div className="placement-charts">
      <section className="placement-chart-panel" aria-labelledby="placement-pie-title">
        <div className="placement-chart-header">
          <div>
            <h3 id="placement-pie-title">广告版位占比</h3>
            <p>饼状图 · 查看各版位贡献比例</p>
          </div>
          <MetricSelect id="placement-pie-metric" label="饼图指标" metric={pieMetric} onChange={setPieMetric} />
        </div>
        <PlacementPie data={data} metric={pieMetric} />
        <div className="placement-chart-total" aria-live="polite">
          <span>{PLACEMENT_METRICS[pieMetric].label}合计</span>
          <strong>{formatValue(total(pieMetric), pieMetric)}</strong>
        </div>
      </section>

      <section className="placement-chart-panel" aria-labelledby="placement-bar-title">
        <div className="placement-chart-header">
          <div>
            <h3 id="placement-bar-title">广告版位对比</h3>
            <p>柱状图 · 对比各版位指标规模</p>
          </div>
          <MetricSelect id="placement-bar-metric" label="柱状图指标" metric={barMetric} onChange={setBarMetric} />
        </div>
        <PlacementBars data={data} metric={barMetric} />
        <div className="placement-chart-total" aria-live="polite">
          <span>{PLACEMENT_METRICS[barMetric].label}合计</span>
          <strong>{formatValue(total(barMetric), barMetric)}</strong>
        </div>
      </section>
    </div>
  );
}
