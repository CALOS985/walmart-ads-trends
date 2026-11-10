import { useMemo, useState } from "react";
import "./period-comparison.css";
import type { AdRecord, MetricKey } from "./analytics";
import { METRICS, toIsoDate } from "./analytics";
import { COMPARISON_METRICS, calculateChange, changeInterpretation, compareItems, formatComparisonValue,
  inRange, metricValue, presetPeriods, rangeDays, validPeriods } from "./comparison";
import type { ComparisonPeriods, ComparisonPreset } from "./comparison";

const PRESETS: [ComparisonPreset, string][] = [
  ["3", "近 3 天 vs 前 3 天"], ["7", "近 7 天 vs 前 7 天"],
  ["30", "近 30 天 vs 前 30 天"], ["month", "最近完整月 vs 上一个月"],
];

function Change({ metric, current, baseline }: { metric: MetricKey; current: number | null; baseline: number | null }) {
  const change = calculateChange(current, baseline);
  const arrow = change.direction === "up" ? "↑" : change.direction === "down" ? "↓" : "";
  return <span className={`comparison-change ${change.direction}`}>
    {arrow} {formatComparisonValue(metric, change.delta, true)}
    <small>{change.delta === null ? "不可比" : change.percent === null ? "基期为 0，无变化率"
      : `${change.percent > 0 ? "+" : ""}${change.percent.toFixed(2)}%`}</small>
  </span>;
}

export function PeriodComparison({ records, selectedRecords, placement, latestDate }: {
  records: AdRecord[]; selectedRecords: AdRecord[]; placement: string; latestDate: string;
}) {
  const [periods, setPeriods] = useState(() => presetPeriods(latestDate, "3"));
  const [preset, setPreset] = useState<ComparisonPreset | "custom">("3");
  const [followSelection, setFollowSelection] = useState(false);
  const [search, setSearch] = useState("");
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());
  const scopedRecords = useMemo(() => (followSelection ? selectedRecords : records)
    .filter(row => placement === "all" || row.placement === placement), [records, selectedRecords, followSelection, placement]);
  const valid = validPeriods(periods);
  const comparison = useMemo(() => compareItems(scopedRecords, periods), [scopedRecords, periods]);
  const items = useMemo(() => comparison.filter(item => item.itemId.toLowerCase().includes(search.trim().toLowerCase())), [comparison, search]);
  const coverage = useMemo(() => [periods.first, periods.second].map(range =>
    new Set(scopedRecords.filter(row => inRange(toIsoDate(row.date), range)).map(row => toIsoDate(row.date))).size), [scopedRecords, periods]);
  const unequal = rangeDays(periods.first) !== rangeDays(periods.second);
  const overlap = valid && periods.first.start <= periods.second.end && periods.second.start <= periods.first.end;

  function editRange(period: keyof ComparisonPeriods, side: "start" | "end", value: string) {
    setPreset("custom");
    setPeriods(current => ({ ...current, [period]: { ...current[period], [side]: value } }));
  }

  return <section className="comparison-card" aria-labelledby="period-comparison-title">
    <div className="card-header chart-header">
      <div><span className="section-number">03</span><div>
        <h2 id="period-comparison-title">时间段对比</h2>
        <p>按 Item ID 展开 10 项指标，查看两个时间段的数值与涨跌。</p>
      </div></div>
      <span className="item-count">{comparison.length} 个 Item ID</span>
    </div>

    <div className="comparison-presets" aria-label="时间段对比快捷区间">
      {PRESETS.map(([value, label]) => <button type="button" key={value} aria-pressed={preset === value}
        className={preset === value ? "active" : ""}
        onClick={() => { setPreset(value); setPeriods(presetPeriods(latestDate, value)); }}>{label}</button>)}
      <span>{preset === "custom" ? "自定义时间段" : `以报表最新日期 ${latestDate} 为基准`}</span>
    </div>

    <div className="comparison-ranges">
      {(["first", "second"] as const).map((period, index) => <fieldset key={period}>
        <legend>时间段 {index + 1} · {index === 0 ? "对比期" : "基期"}</legend>
        <div className="comparison-date-inputs">
          <input type="date" aria-label={`时间段${index + 1}开始日期`} value={periods[period].start}
            onChange={event => editRange(period, "start", event.target.value)} />
          <span>至</span>
          <input type="date" aria-label={`时间段${index + 1}结束日期`} value={periods[period].end}
            onChange={event => editRange(period, "end", event.target.value)} />
        </div>
        {valid && <small>选定 {rangeDays(periods[period])} 天 · 实际有记录 {coverage[index]} 天</small>}
      </fieldset>)}
    </div>

    <div className="comparison-toolbar">
      <label className="comparison-search">搜索 Item ID
        <input type="search" placeholder="输入 Item ID" aria-label="搜索对比 Item ID" value={search} onChange={event => setSearch(event.target.value)} />
      </label>
      <label className="comparison-scope"><input type="checkbox" checked={followSelection} onChange={event => setFollowSelection(event.target.checked)} />跟随上方商品 / 品类 / SKU 筛选</label>
      <div className="comparison-expand-actions">
        <button type="button" onClick={() => setOpenItems(new Set(items.map(item => item.itemId)))}>全部展开</button>
        <button type="button" onClick={() => setOpenItems(new Set())}>全部收起</button>
      </div>
    </div>
    <p className="comparison-explanation">默认对比全部 Item ID，版位跟随上方筛选，日期独立设置。变化 = 时间段 1 − 时间段 2，变化率以时间段 2 为基准。<strong>绿 ↑ 表示数值上涨，红 ↓ 表示数值下跌；花费、CPC 上涨不等于效果变好。</strong></p>

    {!valid ? <p className="comparison-warning" role="alert">请完整选择两个时间段，开始日期不能晚于结束日期。</p> : <>
      {(coverage[0] < rangeDays(periods.first) || coverage[1] < rangeDays(periods.second)) &&
        <p className="comparison-warning" role="status">所选时间段未覆盖全部数据日，请确认报表完整性。没有记录不视为 0；某商品任一时间段无记录时显示“无数据”，不计算涨跌。</p>}
      {unequal && <p className="comparison-warning">两个时间段天数不同。花费、销售额等是区间总量，比较时请结合天数判断。</p>}
      {overlap && <p className="comparison-warning">两个时间段存在重叠，重叠日期会分别计入两个区间。</p>}
      {!items.length && <div className="empty-state">{comparison.length ? "没有匹配的 Item ID" : "当前区间或筛选条件下没有可对比的商品记录"}</div>}
      <div className="comparison-items">
        {items.map(item => <details key={item.itemId} className="comparison-item" open={openItems.has(item.itemId)}
          onToggle={event => { const open = event.currentTarget.open; setOpenItems(current => {
            if (current.has(item.itemId) === open) return current;
            const next = new Set(current); if (open) next.add(item.itemId); else next.delete(item.itemId); return next;
          }); }}>
          <summary>
            <div className="comparison-item-title"><strong>{item.itemId}</strong><small>时间段 1：{item.firstDays.size} 个数据日 · 时间段 2：{item.secondDays.size} 个数据日</small></div>
            <div className="comparison-summary-metric"><span>销售额变化</span><Change metric="sales" current={metricValue("sales", item.first, item.firstRows)} baseline={metricValue("sales", item.second, item.secondRows)} /></div>
            <div className="comparison-summary-metric"><span>ROAS 变化</span><Change metric="roas" current={metricValue("roas", item.first, item.firstRows)} baseline={metricValue("roas", item.second, item.secondRows)} /></div>
            <span className="comparison-chevron" aria-hidden="true">⌄</span>
          </summary>
          <div className="comparison-table-wrap">
            <table className="comparison-table" aria-label={`${item.itemId} 时间段指标对比`}>
              <thead><tr><th scope="col">指标</th><th scope="col">时间段 1<small>{periods.first.start} — {periods.first.end}</small></th>
                <th scope="col">时间段 2<small>{periods.second.start} — {periods.second.end}</small></th><th scope="col">变化值 / 变化率</th><th scope="col">运营解读</th></tr></thead>
              <tbody>{COMPARISON_METRICS.map(key => {
                const current = metricValue(key, item.first, item.firstRows);
                const baseline = metricValue(key, item.second, item.secondRows);
                return <tr key={key}><th scope="row">{METRICS[key].shortLabel}</th>
                  <td>{!item.firstRows ? "无数据" : formatComparisonValue(key, current)}</td>
                  <td>{!item.secondRows ? "无数据" : formatComparisonValue(key, baseline)}</td>
                  <td><Change metric={key} current={current} baseline={baseline} /></td>
                  <td className="comparison-interpretation">{changeInterpretation(key, calculateChange(current, baseline).direction)}</td></tr>;
              })}</tbody>
            </table>
          </div>
        </details>)}
      </div>
    </>}
    <p className="comparison-footnote">归因销售额等“30 Day”字段使用后台30天归因模型，不代表最近30天；本区间由上方两组日期决定。件数转化率 = 归因售出件数 ÷ 点击次数 × 100%，不是订单转化率。ROAS、CTR、平均 CPC 和件数转化率按区间汇总重算，不平均每日比率；分母为0时显示“—”。有 Clicks 列时优先读取，否则按 Average CPC 折算点击，缺少有效 CPC 时按曝光 × CTR 估算。完整月快捷区间使用最新已结束的自然月。更多说明见页脚“指标口径与使用说明”。</p>
  </section>;
}
