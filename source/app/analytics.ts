export type Granularity = "day" | "week" | "month";
export type AnalysisDimension = "itemId" | "category" | "backendSku" | "sku";
export type MetricKey =
  | "spend"
  | "sales"
  | "roas"
  | "ctr"
  | "cpc"
  | "conversion"
  | "orderConversion"
  | "impressions"
  | "units"
  | "orders"
  | "addToCart"
  | "pdpViews";

export type AdRecord = {
  date: Date;
  itemId: string;
  placement: string;
  impressions: number;
  spend: number;
  ctr: number;
  clicks: number;
  units: number;
  orders: number | null;
  ordersNullAsZero?: boolean;
  conversion: number;
  reportedRoas: number;
  skuSales: number;
  sales: number;
  addToCart: number;
  pdpViews: number;
};

export type Aggregate = {
  spend: number;
  sales: number;
  impressions: number;
  clicks: number;
  units: number;
  orders: number | null;
  addToCart: number;
  pdpViews: number;
};

export type ProductMapping = {
  category: string;
  backendSku: string;
  itemId: string;
  sku: string;
};

export const METRICS: Record<
  MetricKey,
  {
    label: string;
    shortLabel: string;
    color: string;
    value: (aggregate: Aggregate) => number | null;
    format: (value: number) => string;
  }
> = {
  spend: {
    label: "广告花费",
    shortLabel: "花费",
    color: "#0573d1",
    value: (a) => a.spend,
    format: (v) => formatMoney(v),
  },
  sales: {
    label: "归因销售额（30天模型）",
    shortLabel: "归因销售额",
    color: "#12a878",
    value: (a) => a.sales,
    format: (v) => formatMoney(v),
  },
  roas: {
    label: "ROAS",
    shortLabel: "ROAS",
    color: "#7c5ce5",
    value: (a) => safeDivide(a.sales, a.spend),
    format: (v) => `${v.toFixed(2)}x`,
  },
  ctr: {
    label: "点击率 CTR",
    shortLabel: "CTR",
    color: "#f59e0b",
    value: (a) => safeDivide(a.clicks, a.impressions) * 100,
    format: (v) => `${v.toFixed(2)}%`,
  },
  cpc: {
    label: "平均每次点击费用 CPC",
    shortLabel: "平均 CPC",
    color: "#3156c8",
    value: (a) => safeDivide(a.spend, a.clicks),
    format: (v) => formatMoney(v),
  },
  conversion: {
    label: "件数转化率（30天模型）",
    shortLabel: "件数转化率",
    color: "#e9556f",
    value: (a) => safeDivide(a.units, a.clicks) * 100,
    format: (v) => `${v.toFixed(2)}%`,
  },
  orderConversion: {
    label: "订单转化率（30天模型）",
    shortLabel: "订单转化率",
    color: "#167f8c",
    value: (a) => a.orders === null || a.clicks === 0 ? null : a.orders / a.clicks * 100,
    format: (v) => `${v.toFixed(2)}%`,
  },
  impressions: {
    label: "广告曝光",
    shortLabel: "曝光",
    color: "#0e9ab7",
    value: (a) => a.impressions,
    format: (v) => formatNumber(v),
  },
  units: {
    label: "归因售出件数（30天模型）",
    shortLabel: "售出件数",
    color: "#12a878",
    value: (a) => a.units,
    format: (v) => formatNumber(v),
  },
  orders: {
    label: "归因订单数（30天模型）",
    shortLabel: "订单数",
    color: "#4265c6",
    value: (a) => a.orders,
    format: (v) => formatNumber(v),
  },
  addToCart: {
    label: "加购物车（30天模型字段）",
    shortLabel: "加购物车",
    color: "#d57b00",
    value: (a) => a.addToCart,
    format: (v) => formatNumber(v),
  },
  pdpViews: {
    label: "商品详情页浏览",
    shortLabel: "详情页浏览",
    color: "#7c5ce5",
    value: (a) => a.pdpViews,
    format: (v) => formatNumber(v),
  },
};

export function formatMetric(key: MetricKey, aggregate: Aggregate) {
  const value = METRICS[key].value(aggregate);
  return value === null ? "—" : METRICS[key].format(value);
}

export function safeDivide(numerator: number, denominator: number) {
  return denominator ? numerator / denominator : 0;
}

export function emptyAggregate(): Aggregate {
  return {
    spend: 0,
    sales: 0,
    impressions: 0,
    clicks: 0,
    units: 0,
    orders: 0,
    addToCart: 0,
    pdpViews: 0,
  };
}

export function addRecord(aggregate: Aggregate, row: AdRecord) {
  aggregate.spend += row.spend;
  aggregate.sales += row.sales;
  aggregate.impressions += row.impressions;
  aggregate.clicks += row.clicks;
  aggregate.units += row.units;
  aggregate.orders = aggregate.orders === null || row.orders === null ? null : aggregate.orders + row.orders;
  aggregate.addToCart += row.addToCart;
  aggregate.pdpViews += row.pdpViews;
}

export function addAggregate(target: Aggregate, source: Aggregate) {
  target.spend += source.spend;
  target.sales += source.sales;
  target.impressions += source.impressions;
  target.clicks += source.clicks;
  target.units += source.units;
  target.orders = target.orders === null || source.orders === null ? null : target.orders + source.orders;
  target.addToCart += source.addToCart;
  target.pdpViews += source.pdpViews;
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value || 0);
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatShortDate(date: Date) {
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}
