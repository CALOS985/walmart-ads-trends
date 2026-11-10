import type { AdRecord, ProductMapping } from "./analytics.ts";

export function parseReportDate(value: string) {
  const clean = value.trim();
  const reportMatch = clean.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (reportMatch) {
    const monthMap: Record<string, number> = {
      jan: 0,
      feb: 1,
      mar: 2,
      apr: 3,
      may: 4,
      jun: 5,
      jul: 6,
      aug: 7,
      sep: 8,
      oct: 9,
      nov: 10,
      dec: 11,
    };
    const yearNumber = Number(reportMatch[3]);
    const year = yearNumber < 100 ? 2000 + yearNumber : yearNumber;
    const month = monthMap[reportMatch[2].toLowerCase()];
    if (month !== undefined) {
      const date = new Date(year, month, Number(reportMatch[1]), 12);
      return date.getMonth() === month && date.getDate() === Number(reportMatch[1]) ? date : null;
    }
  }
  const isoMatch = clean.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const date = new Date(
      Number(isoMatch[1]),
      Number(isoMatch[2]) - 1,
      Number(isoMatch[3]),
      12,
    );
    return date.getFullYear() === Number(isoMatch[1]) && date.getMonth() === Number(isoMatch[2]) - 1
      && date.getDate() === Number(isoMatch[3]) ? date : null;
  }
  const fallback = new Date(clean);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function parseNumeric(value: string | undefined) {
  const number = Number(
    String(value ?? "")
      .replace(/[$,%\s]/g, "")
      .replace(/,/g, ""),
  );
  return Number.isFinite(number) ? number : 0;
}

function normalizeHeader(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizePlacement(value: string) {
  const placement = value.trim();
  return !placement || /^(undefined|null|n\/?a|na|-+)$/i.test(placement)
    ? "未标注"
    : placement;
}

function parseCsvRows(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const character = text[i];
    const next = text[i + 1];
    if (character === '"' && inQuotes && next === '"') {
      field += '"';
      i += 1;
    } else if (character === '"') {
      inQuotes = !inQuotes;
    } else if (character === "," && !inQuotes) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && next === "\n") i += 1;
      row.push(field);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    if (row.some((cell) => cell.trim())) rows.push(row);
  }
  return rows;
}

export async function readCsvFile(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    // Chinese Excel CSV exports may use ANSI (GBK) instead of UTF-8.
    return new TextDecoder("gb18030").decode(bytes);
  }
}

export function parseAdvertisingCsv(text: string) {
  const rawRows = parseCsvRows(text);
  const headerIndex = rawRows.findIndex((row) => {
    const normalized = row.map(normalizeHeader);
    return normalized.includes("date") && normalized.includes("itemid");
  });
  if (headerIndex < 0) {
    throw new Error("未找到 Date 和 Item Id 字段，请上传 Walmart 广告报表 CSV。");
  }

  const headers = rawRows[headerIndex].map(normalizeHeader);
  const duplicates = headers.filter((name, index) => name && headers.indexOf(name) !== index);
  if (duplicates.length) {
    throw new Error(`报表存在重复字段：${rawRows[headerIndex][headers.indexOf(duplicates[0])]}，请保留唯一表头。`);
  }
  const column = (name: string) => headers.indexOf(normalizeHeader(name));
  const required = ["Date", "Item Id", "Placement", "Impressions", "Ad Spend",
    "Total Units Sold - 30 Day", "Total Sales Rev. - 30 Day", "Advertised Product Detail Page Views - 30 Day"];
  const missing = required.filter(name => column(name) < 0);
  if (!["Clicks", "CTR", "Average CPC"].some(name => column(name) >= 0)) missing.push("Clicks / CTR / Average CPC（至少一项）");
  if (!["Total Add to Cart - 30 Day", "Advertised Add to Cart - 30 Day"].some(name => column(name) >= 0)) missing.push("Total Add to Cart - 30 Day / Advertised Add to Cart - 30 Day（至少一项）");
  if (missing.length) throw new Error(`报表缺少必需字段：${missing.join("、")}。列顺序可调整，请保留字段名称。`);
  const pick = (row: string[], name: string) => {
    const index = column(name);
    return index >= 0 ? row[index] ?? "" : "";
  };

  const records = rawRows
    .slice(headerIndex + 1)
    .map((row, rowIndex): AdRecord | null => {
      const date = parseReportDate(pick(row, "Date"));
      const itemId = pick(row, "Item Id").trim();
      if (!date || !itemId) return null;
      const orderText = pick(row, "Orders - 30 Day").trim();
      const reportedNoAttribution = (value: string) => /^(null|0(?:\.0+)?)$/i.test(value.replace(/[$,\s]/g, ""));
      // Custom Reports may export null for every attribution count on rows with no attributed sale.
      // Only interpret that specific combination as zero; missing or inconsistent inputs stay unknown.
      const ordersNullAsZero = /^null$/i.test(orderText)
        && reportedNoAttribution(pick(row, "Total Units Sold - 30 Day"))
        && reportedNoAttribution(pick(row, "Total Sales Rev. - 30 Day"));
      const orders = ordersNullAsZero ? 0 : orderText === "" || /^null$/i.test(orderText) ? null : Number(orderText.replace(/,/g, ""));
      if (orders !== null && (!Number.isSafeInteger(orders) || orders < 0)) {
        throw new Error(`第 ${headerIndex + rowIndex + 2} 行 Orders - 30 Day 必须为非负整数；未知订单数请留空，不要填 0。`);
      }
      const impressions = parseNumeric(pick(row, "Impressions"));
      const spend = parseNumeric(pick(row, "Ad Spend"));
      const ctr = parseNumeric(pick(row, "CTR"));
      const averageCpc = parseNumeric(pick(row, "Average CPC"));
      const clicks =
        column("Clicks") >= 0 ? parseNumeric(pick(row, "Clicks")) : averageCpc > 0 && spend > 0
          ? spend / averageCpc
          : impressions * (ctr / 100);
      const totalAddToCart = pick(row, "Total Add to Cart - 30 Day");
      const advertisedAddToCart = pick(
        row,
        "Advertised Add to Cart - 30 Day",
      );
      return {
        date,
        itemId,
        placement: normalizePlacement(pick(row, "Placement")),
        impressions,
        spend,
        ctr,
        clicks,
        units: parseNumeric(pick(row, "Total Units Sold - 30 Day")),
        orders,
        ordersNullAsZero,
        conversion: parseNumeric(pick(row, "Conversion Rate - 30 Day")),
        reportedRoas: parseNumeric(pick(row, "ROAS - 30 Day")),
        skuSales: parseNumeric(
          pick(row, "Advertised SKU Sales. - 30 Day") ||
            pick(row, "Advertised SKU Sales - 30 Day"),
        ),
        sales: parseNumeric(pick(row, "Total Sales Rev. - 30 Day")),
        addToCart: parseNumeric(totalAddToCart || advertisedAddToCart),
        pdpViews: parseNumeric(
          pick(row, "Advertised Product Detail Page Views - 30 Day"),
        ),
      };
    })
    .filter((row): row is AdRecord => Boolean(row));

  if (!records.length) {
    throw new Error("已找到表头，但没有识别到有效的数据行。");
  }
  return records;
}

export function parseProductMappingCsv(text: string) {
  const rawRows = parseCsvRows(text);
  const normalizeMappingHeader = (value: string) =>
    value
      .replace(/^\uFEFF/, "")
      .trim()
      .toLowerCase()
      .replace(/[\s_-]/g, "");
  const aliases = {
    category: ["品类", "category"],
    backendSku: ["后台sku", "backendsku"],
    itemId: ["itemid"],
    sku: ["sku"],
  };
  const headerIndex = rawRows.findIndex((row) => {
    const normalized = row.map(normalizeMappingHeader);
    return Object.values(aliases).every((names) =>
      names.some((name) => normalized.includes(normalizeMappingHeader(name))),
    );
  });
  if (headerIndex < 0) {
    throw new Error("映射表需要包含：品类、后台SKU、Item ID、SKU 四个字段。");
  }

  const headers = rawRows[headerIndex].map(normalizeMappingHeader);
  const column = (names: string[]) =>
    names
      .map((name) => headers.indexOf(normalizeMappingHeader(name)))
      .find((index) => index >= 0) ?? -1;
  const columns = {
    category: column(aliases.category),
    backendSku: column(aliases.backendSku),
    itemId: column(aliases.itemId),
    sku: column(aliases.sku),
  };
  const mappings = rawRows
    .slice(headerIndex + 1)
    .map((row): ProductMapping | null => {
      const mapping = {
        category: row[columns.category]?.trim() ?? "",
        backendSku: row[columns.backendSku]?.trim() ?? "",
        itemId: row[columns.itemId]?.trim() ?? "",
        sku: row[columns.sku]?.trim() ?? "",
      };
      return Object.values(mapping).every(Boolean) ? mapping : null;
    })
    .filter((row): row is ProductMapping => Boolean(row));

  if (!mappings.length) {
    throw new Error("已找到映射表表头，但没有识别到完整的映射数据。");
  }
  const duplicateItemIds = mappings.filter(
    (row, index) =>
      mappings.findIndex((candidate) => candidate.itemId === row.itemId) !==
      index,
  );
  if (duplicateItemIds.length) {
    throw new Error(`映射表存在重复 Item ID：${duplicateItemIds[0].itemId}`);
  }
  return mappings;
}
