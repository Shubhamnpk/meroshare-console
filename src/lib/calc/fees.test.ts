import { describe, expect, it } from "vitest";
import {
  adjustedCost,
  breakEvenPrice,
  brokerCommission,
  buyCost,
  cgtRate,
  sebonFee,
  sellProceeds,
  weightedAverage,
} from "./fees";

describe("broker commission", () => {
  it("uses the slab rate for the whole amount", () => {
    expect(brokerCommission(40_000)).toBeCloseTo(144, 6);
    expect(brokerCommission(100_000)).toBeCloseTo(330, 6);
    expect(brokerCommission(1_000_000)).toBeCloseTo(3100, 6);
  });

  it("never goes below the Rs 10 floor", () => {
    expect(brokerCommission(1000)).toBe(10);
    expect(brokerCommission(0)).toBe(0);
  });
});

describe("sebon fee", () => {
  it("is 0.015%", () => {
    expect(sebonFee(100_000)).toBeCloseTo(15, 6);
  });
});

describe("cgt", () => {
  it("is 5% long term and 7.5% short term for individuals", () => {
    expect(cgtRate(400)).toBe(0.05);
    expect(cgtRate(100)).toBe(0.075);
    expect(cgtRate(100, "institution")).toBe(0.1);
  });
});

describe("buy cost", () => {
  it("adds commission, sebon and DP", () => {
    const c = buyCost(100, 500);
    expect(c.amount).toBe(50_000);
    expect(c.total).toBeCloseTo(50_000 + 180 + 7.5 + 25, 6);
    expect(c.perUnit).toBeCloseTo(c.total / 100, 6);
  });
});

describe("sell proceeds", () => {
  it("nets charges and tax off the sale", () => {
    const r = sellProceeds({ units: 100, price: 600, avgCost: 500, holdingDays: 400 });
    expect(r.amount).toBe(60_000);
    expect(r.charges).toBeCloseTo(198 + 9 + 25, 6);
    expect(r.cgtRate).toBe(0.05);
    expect(r.netReceivable).toBeCloseTo(r.netBeforeTax - r.cgt, 6);
    expect(r.profit).toBeGreaterThan(0);
  });

  it("charges no tax on a loss", () => {
    const r = sellProceeds({ units: 100, price: 400, avgCost: 500, holdingDays: 100 });
    expect(r.cgt).toBe(0);
    expect(r.profit).toBeLessThan(0);
  });
});

describe("break even", () => {
  it("returns the price where profit is zero", () => {
    const p = breakEvenPrice(100, 500);
    expect(p).toBeGreaterThan(500);
    const r = sellProceeds({ units: 100, price: p, avgCost: 500, holdingDays: 400 });
    expect(Math.abs(r.profit)).toBeLessThan(1);
  });
});

describe("averages", () => {
  it("merges lots by units", () => {
    const w = weightedAverage([
      { units: 10, price: 100 },
      { units: 30, price: 200 },
    ]);
    expect(w.units).toBe(40);
    expect(w.average).toBeCloseTo(175, 6);
  });

  it("dilutes cost with bonus units", () => {
    const a = adjustedCost({ units: 100, avgCost: 400, bonusPercent: 20 });
    expect(a.units).toBe(120);
    expect(a.average).toBeCloseTo(40_000 / 120, 6);
  });

  it("adds right shares at their issue price", () => {
    const a = adjustedCost({ units: 100, avgCost: 400, rightPercent: 50, rightPrice: 100 });
    expect(a.units).toBe(150);
    expect(a.cost).toBe(45_000);
  });
});
