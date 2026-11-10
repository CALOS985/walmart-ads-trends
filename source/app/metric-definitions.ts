import type { MetricKey } from "./analytics";

export const ATTRIBUTION_NOTE = "“30 Day”是 Custom Reports 字段的30天归因模型标签，不是最近30天的筛选条件。看板只汇总你选定的 Date 报表行，不重新归因，也不是店铺全部销售额。";
export const UNIT_CONVERSION_NOTE = "件数转化率 = 归因售出件数 ÷ 计算用点击次数 × 100%。售出件数不是订单数，一单可购买多件，因此不等同于订单转化率，也可能超过100%。";
export const CLICK_NOTE = "有 Clicks 列时读取该列；否则逐行用 Ad Spend ÷ Average CPC 折算（两者均大于0），其他行用 Impressions × CTR ÷ 100 估算。折算/估算不等于平台精确点击数。";

type Definition = { key: MetricKey; name: string; fields: string[]; formula: string; note: string };

export const METRIC_DEFINITIONS: Definition[] = [
  { key: "spend", name: "广告花费", fields: ["Ad Spend"],
    formula: "Σ Ad Spend", note: "按当前日期、商品/品类/SKU、版位筛选后的报表行求和，单位为美元；不是预算或竞价。" },
  { key: "sales", name: "归因销售额（30天模型）", fields: ["Total Sales Rev. - 30 Day"],
    formula: "Σ Total Sales Rev. - 30 Day", note: "汇总后台提供的30天模型归因销售收入，不代表最近30天，也不是店铺总销售额。看板销售额未改用 Advertised SKU Sales. - 30 Day。" },
  { key: "roas", name: "ROAS（重算）", fields: ["Total Sales Rev. - 30 Day", "Ad Spend"],
    formula: "归因销售额合计 ÷ 广告花费合计", note: "表示每1美元广告花费带来的归因销售收入。按汇总值相除，不平均各行 ROAS - 30 Day，也不是利润率。" },
  { key: "ctr", name: "点击率 CTR（重算）", fields: ["Clicks", "Impressions"],
    formula: "计算用点击次数合计 ÷ 曝光合计 × 100%", note: "没有 Clicks 列时使用下方说明的折算/估算点击。因此可能与后台原始 CTR 不完全一致，不直接平均各行 CTR。" },
  { key: "cpc", name: "平均 CPC（重算）", fields: ["Ad Spend", "Clicks", "Average CPC", "CTR", "Impressions"],
    formula: "广告花费合计 ÷ 计算用点击次数合计", note: "不是竞价，也不是各行 Average CPC 的简单平均。点击来自折算/估算时，CPC 同样受原始报表舍入精度影响。" },
  { key: "conversion", name: "件数转化率（重算）", fields: ["Total Units Sold - 30 Day", "Clicks"],
    formula: "归因售出件数合计 ÷ 计算用点击次数合计 × 100%", note: "分子是件数，不是订单数；一单可买多件，结果可能超过100%。不直接展示或平均报表的 Conversion Rate - 30 Day，也不能据此推断订单转化率。" },
  { key: "impressions", name: "曝光", fields: ["Impressions"],
    formula: "Σ Impressions", note: "按所选报表行求和，是曝光次数，不是去重访客数。" },
  { key: "units", name: "归因售出件数（30天模型）", fields: ["Total Units Sold - 30 Day"],
    formula: "Σ Total Units Sold - 30 Day", note: "直接汇总报表中的归因售出件数。件数与订单数不同，不能当作订单数使用。" },
  { key: "addToCart", name: "加购物车（30天模型字段）", fields: ["Total Add to Cart - 30 Day", "Advertised Add to Cart - 30 Day"],
    formula: "逐行取 Total Add to Cart；缺列或该行空值时回退到 Advertised Add to Cart，再求和", note: "0是有效值，不触发回退。Total 与 Advertised 字段的覆盖范围不同，对比不同报表前应保持字段口径一致；不是独立用户数或订单数。" },
  { key: "pdpViews", name: "广告商品详情页浏览（30天模型）", fields: ["Advertised Product Detail Page Views - 30 Day"],
    formula: "Σ Advertised Product Detail Page Views - 30 Day", note: "使用广告商品详情页浏览字段，不是全店自然流量、全店详情页浏览或去重访客。" },
];
