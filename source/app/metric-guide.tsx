import { ATTRIBUTION_NOTE, UNIT_CONVERSION_NOTE, ORDER_CONVERSION_NOTE, CLICK_NOTE, METRIC_DEFINITIONS } from "./metric-definitions";
import "./metric-guide.css";

export function MetricGuide({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return <details className="metric-guide" id="metric-guide" open={open}
    onToggle={event => onOpenChange(event.currentTarget.open)}>
    <summary>
      <span className="metric-guide-mark" aria-hidden="true">ⓘ</span>
      <span><strong>指标口径与使用说明</strong><small>30天归因模型 ≠ 最近30天 · 件数转化率 ≠ 订单转化率</small></span>
      <span className="metric-guide-action"><span>{open ? "收起说明" : "点击展开"}</span><i aria-hidden="true">⌄</i></span>
    </summary>
    <div className="metric-guide-body">
      <div className="metric-guide-notes">
        <section aria-labelledby="attribution-definition"><h3 id="attribution-definition">先分清：归因窗口与筛选日期</h3>
          <p>{ATTRIBUTION_NOTE}</p>
          <p>例如选择 11月1日—11月7日，销售额就是这些 Date 行的30天模型归因销售额之和；并非自动统计最近30个自然日，也不会为每一行再扩展30天重复相加。切换日期或时间段对比不会改变所用的归因模型。</p>
        </section>
        <section aria-labelledby="unit-conversion-definition"><h3 id="unit-conversion-definition">件数转化率与订单转化率</h3>
          <p>{UNIT_CONVERSION_NOTE}</p>
          <p>{ORDER_CONVERSION_NOTE}</p>
          <p>例如 10 次点击带来 6 件售出、3 笔订单，件数转化率为 60%，订单转化率为 30%。两者使用同一组报表行与计算用点击次数，分别反映归因件数和归因订单的转化。</p>
        </section>
      </div>

      <h3>指标来源与计算公式</h3>
      <p className="metric-guide-intro">Σ 表示对当前筛选后的报表行求和。概览、版位、趋势、排名与时间段对比共用以下指标口径；时间段对比各自使用其独立日期。</p>
      <div className="metric-guide-table-wrap" tabIndex={0} aria-label="指标来源与公式表，可横向滚动">
        <table className="metric-guide-table" aria-label="指标口径与计算公式">
          <thead><tr><th scope="col">看板指标</th><th scope="col">CSV 字段来源</th><th scope="col">计算公式</th><th scope="col">使用说明</th></tr></thead>
          <tbody>{METRIC_DEFINITIONS.map(metric => <tr key={metric.key}>
            <th scope="row">{metric.name}</th>
            <td>{metric.fields.map(field => <code key={field}>{field}</code>)}</td>
            <td>{metric.formula}</td><td>{metric.note}</td>
          </tr>)}</tbody>
        </table>
      </div>

      <div className="metric-guide-usage">
        <section><h3>点击次数：实际值、折算值与估算值</h3><p>{CLICK_NOTE}</p>
          <p>原始字段的四舍五入会影响 CTR、CPC、件数转化率和订单转化率。建议同时导出 Clicks 以获得精确点击次数。看板不会用 Conversion Rate - 30 Day 倒推订单数，也不会把多个比率直接平均。</p>
        </section>
        <section><h3>如何阅读时间段对比</h3>
          <p>变化值 = 时间段1 − 时间段2；变化率 = 变化值 ÷ 时间段2绝对值 × 100%。CTR、件数转化率和订单转化率的绝对变化用“百分点”，与相对变化率的“%”不同。</p>
          <p>绿 ↑ 只代表数值上涨，红 ↓ 只代表数值下跌；花费或 CPC 上涨不自动等于效果变好。区间天数、覆盖数据日和字段来源应一起比较。</p>
        </section>
        <section><h3>无数据、零分母与报表更新</h3>
          <p>某个 Item 在任一区间没有记录时，不按0计算涨跌。基期为0时，非零对比值不显示无限大变化率。</p>
          <p>分母为0时无法计算有效比率：时间段对比显示“—”；概览、趋势等部分位置沿用0占位，该0不应视为有效的实测回报或转化率。</p>
          <p>订单指标会区分缺失与0：Orders - 30 Day 缺列或所选记录中存在空值时，相关汇总显示“—”；订单转化率点击分母为0时也显示“—”。趋势不把缺失订单数据画成0，也不跨越缺失区间连线。</p>
          <p>针对 Custom Reports 导出格式做兼容：订单为字面文本 null，且同一行归因售出件数和销售额均为 null 或0时，按无归因成交的0处理，概览会显示兼容提示。这是看板的导入约定；有成交数据而订单为 null 时仍视为未知，不倒推订单。</p>
          <p>看板按上传 CSV 汇总，不重新建立归因关系。同一 Date 的归因数据可能随后台更新而变化，比较时请留意导出时间及模型是否一致。</p>
        </section>
        <section><h3>导入与数据范围</h3>
          <p>CSV 按字段名称识别，列顺序可调整。请保留模板字段名，避免缺失或重复；不要叠加包含同一批数据的总计行与明细行。</p>
          <p>新版下载模板包含 Orders - 30 Day 和 Homepage、Carousel、Buybox、Search In-grid、Browse In-grid 五个版位的虚构示例。旧版 CSV 无订单字段仍可分析其他指标；未知订单数请留空，实际没有订单才填0。</p>
          <p>此表只列当前看板使用的指标。预算、竞价、商品单价等未纳入计算；销售额读取报表收入字段，不使用“件数 × 标价”代替。</p>
        </section>
      </div>
      <p className="metric-guide-reference">字段概念参考 <a href="https://developer.walmart.com/advertising-partners-search/docs/parameters-generated-by-snapshot-reports-v2-updated" target="_blank" rel="noopener noreferrer">Walmart 官方广告报表字段说明</a>；上表的字段映射与公式说明当前看板对 Custom Reports CSV 的实际处理方式。</p>
    </div>
  </details>;
}
