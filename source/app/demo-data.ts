import type { AdRecord } from "./analytics.ts";
import { safeDivide } from "./analytics.ts";

export function createDemoData() {
  const itemIds = ["DEMO-3021", "DEMO-5748", "DEMO-8162"];
  const placements = ["Homepage", "Carousel", "Buybox", "Search In-grid", "Browse In-grid"];
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
          Math.round(impressions * (ctr / 100) * (0.78 + itemIndex * 0.16) * 100) / 100;
        const clicks = spend / Number((0.78 + itemIndex * 0.16).toFixed(2));
        const units = Math.max(
          0,
          Math.round(
            impressions *
              (ctr / 100) *
              (0.075 + itemIndex * 0.018) *
              pulse,
          ),
        );
        const orders = units === 0 ? 0 : Math.max(1, units - ((day + itemIndex + placementIndex) % 3 === 0 ? 1 : 0));
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
          orders,
          conversion: safeDivide(orders, clicks) * 100,
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
