# 指标口径与使用说明

本说明对应看板 V1.2.2 对 Custom Reports CSV 的实际处理。页面底部也可展开查看。

## 归因模型与统计日期

`30 Day` 是上传字段所用的30天归因模型标签，不是“最近30天”的日期筛选。
看板按 `Date` 列筛选报表行后汇总，不重新建立归因关系，也不代表店铺全部销售额。
例如选择11月1日至7日，销售额就是这些 Date 行中 `Total Sales Rev. - 30 Day` 的合计。

## 指标来源与公式

Σ 表示对当前日期、商品/品类/SKU和版位筛选后的报表行求和。时间段对比使用其独立日期。

| 指标 | 字段来源 | 公式 / 口径 |
| --- | --- | --- |
| 广告花费 | `Ad Spend` | Σ花费；不是预算或竞价 |
| 归因销售额（30天模型） | `Total Sales Rev. - 30 Day` | Σ归因销售收入；不使用 `Advertised SKU Sales. - 30 Day` 作为看板总收入 |
| ROAS | 归因销售额与花费 | 销售额合计 ÷ 花费合计，不平均行 ROAS |
| CTR | 计算用点击与 `Impressions` | 点击合计 ÷ 曝光合计 × 100%，不平均行 CTR |
| 平均 CPC | 花费与计算用点击 | 花费合计 ÷ 点击合计，不平均行 Average CPC |
| 件数转化率 | `Total Units Sold - 30 Day` 与计算用点击 | 归因售出件数合计 ÷ 点击合计 × 100%；不是订单转化率 |
| 曝光 | `Impressions` | Σ曝光次数，不是去重访客数 |
| 归因售出件数 | `Total Units Sold - 30 Day` | Σ归因件数，不是订单数 |
| 加购物车 | `Total Add to Cart - 30 Day`；回退至 `Advertised Add to Cart - 30 Day` | 逐行优先取 Total，缺列或空值回退后求和；0为有效值，不回退。两字段范围不同，跨报表比较应保持来源一致 |
| 详情页浏览 | `Advertised Product Detail Page Views - 30 Day` | Σ广告商品详情页浏览，不是全店流量或去重访客数 |

## 点击次数与估算

1. 有 `Clicks` 列时直接使用该列。
2. 没有该列时，每行 `Ad Spend > 0` 且 `Average CPC > 0`，用花费 ÷ CPC 折算点击。
3. 其他行用 `Impressions × CTR ÷ 100` 估算点击。

折算与估算可能受原报表四舍五入影响，相关的 CTR、CPC、件数转化率可能与后台显示不同。

## 件数转化率不等于订单转化率

10次点击带来6件售出时，件数转化率是60%；如果6件分属3笔订单，订单转化率才是30%。
一单可以多件，件数转化率也可能超过100%。当前看板不读取订单数字段，不提供订单转化率或每单CPA。
报表里的 `Conversion Rate - 30 Day` 虽然会被读取，但页面不直接展示或平均该字段；同理，ROAS按总量重算。

## 缺失、零分母与对比

时间段没有某个Item的记录时显示“无数据”，不把它当0计算涨跌。
分母为0时没有有效比率：时间段对比显示“—”，概览、趋势等部分位置沿用0占位，不应解读为有效实测比率。

变化值 = 时间段1 − 时间段2；变化率 = 差值 ÷ 基期绝对值 × 100%。基期为0且对比期非0，不显示无限大变化率。
CTR与件数转化率的绝对变化单位为“百分点”，与相对变化率“%”不同。
绿↑和红↓表示数值方向，花费或CPC上涨不自动表示投放效果更好。

字段概念参考：[Walmart 官方广告报表字段说明](https://developer.walmart.com/advertising-partners-search/docs/parameters-generated-by-snapshot-reports-v2-updated)。该链接说明API字段概念，本表列的是当前看板使用的CSV映射。报表归因值可能随后台更新而变化，比较时请保持导出时间和模型口径一致。

## English

`30 Day` names the attribution model, not a rolling last-30-day filter. The dashboard sums selected CSV Date rows.
Sales uses `Total Sales Rev. - 30 Day`. Unit-based conversion is attributed units divided by actual / derived clicks, multiplied by 100; it is not order conversion and may exceed 100%.
ROAS, CTR, CPC and unit conversion are recomputed from aggregate totals. The imported conversion-rate and ROAS columns are not simply averaged or directly displayed as the aggregate rate.
