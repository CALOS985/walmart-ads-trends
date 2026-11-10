// Keep missing order data as gaps instead of drawing it as zero or joining across it.
export function trendSegments(values: (number | null)[]) {
  const segments: { index: number; value: number }[][] = [];
  let current: { index: number; value: number }[] = [];
  values.forEach((value, index) => {
    if (value === null) {
      if (current.length) segments.push(current);
      current = [];
    } else {
      current.push({ index, value });
    }
  });
  if (current.length) segments.push(current);
  return segments;
}
