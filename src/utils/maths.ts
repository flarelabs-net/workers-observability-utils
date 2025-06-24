import type { HistogramAggregates } from "../types";

export function calculateHistogramValue(
  aggregate: HistogramAggregates,
  value: number[]
): number {
  if (aggregate === "count") {
    return value.length;
  }
  if (aggregate === "sum") {
    return value.reduce((agg, value) => agg + value);
  }
  if (aggregate === "max") {
    return Math.max(...value);
  }
  if (aggregate === "min") {
    return Math.min(...value);
  }

  if (aggregate === "avg") {
    const sum = value.reduce((total, value) => total + value);
    return sum / value.length;
  }

  if (aggregate === "median") {
    const sortedValues = [...value].sort();
    const length = sortedValues.length;
    if (length === 0) return 0;
    const isEven = length % 2 === 0;

    const midPoint = Math.floor(length / 2);
    if (isEven) {
      return sortedValues[midPoint - 1] + sortedValues[midPoint] / 2;
    }
    return sortedValues[midPoint];
  }

  return Number.NaN;
}

export function calculatePercentile(sortedArr: number[], percentile: number) {
  const index = Math.ceil(percentile * sortedArr.length) - 1;

  return sortedArr[index];
}
