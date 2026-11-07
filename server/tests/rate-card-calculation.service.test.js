import { describe, it, expect } from "vitest";

import {
  calculateExpectedFreight,
  compareFreightAmounts,
} from "../src/services/rate-card-calculation.service.js";

const rateCard = {
  courierKey: "delhivery",
  zone: "A",
  effectiveFrom: new Date("2026-01-01"),
  effectiveTo: null,
  isActive: true,
  version: 1,

  weightSlabs: [
    {
      minWeight: 0,
      maxWeight: 1,
      baseCharge: 50,
      additionalChargePerKg: 20,
    },
    {
      minWeight: 1,
      maxWeight: 5,
      baseCharge: 70,
      additionalChargePerKg: 15,
    },
  ],

  codFee: 10,
  codFeePercentage: 2,
  rtoFee: 30,
  additionalCharges: 5,
};

const baseInput = {
  billedWeight: 0.5,
  zone: "A",
  courier: "Delhivery",
  shipmentDate: "2026-06-15",
  codAmount: 1000,
  rateCard,
};

describe("Rate Card Calculation Service", () => {
  it("should calculate base freight and applicable COD fees", () => {
    const result = calculateExpectedFreight(baseInput);

    expect(result.status).toBe("calculated");
    expect(result.expectedAmount).toBe(95);

    expect(result.breakdown).toEqual({
      baseFreight: 60,
      codFee: 10,
      percentageCodFee: 20,
      rtoFee: 0,
      additionalCharges: 5,
    });
  });

  it("should calculate freight without COD fees for prepaid orders", () => {
    const result = calculateExpectedFreight({
      ...baseInput,
      codAmount: null,
    });

    expect(result.status).toBe("calculated");
    expect(result.expectedAmount).toBe(65);

    expect(result.breakdown).toEqual({
      baseFreight: 60,
      codFee: 0,
      percentageCodFee: 0,
      rtoFee: 0,
      additionalCharges: 5,
    });
  });

  it("should calculate additional weight charges", () => {
    const result = calculateExpectedFreight({
      ...baseInput,
      billedWeight: 2,
    });

    expect(result.status).toBe("calculated");
    expect(result.breakdown.baseFreight).toBe(85);
  });

  it("should calculate RTO fees when applicable", () => {
    const result = calculateExpectedFreight({
      ...baseInput,
      isRto: true,
    });

    expect(result.expectedAmount).toBe(125);
    expect(result.breakdown.rtoFee).toBe(30);
  });

  it("should reject invalid billed weight", () => {
    const result = calculateExpectedFreight({
      ...baseInput,
      billedWeight: 0,
    });

    expect(result.status).toBe("needs_review");
  });

  it("should reject missing rate cards", () => {
    const result = calculateExpectedFreight({
      ...baseInput,
      rateCard: null,
    });

    expect(result.status).toBe("needs_review");
  });

  it("should reject a courier or zone mismatch", () => {
    const result = calculateExpectedFreight({
      ...baseInput,
      courier: "BlueDart",
    });

    expect(result.status).toBe("needs_review");
  });

  it("should reject shipments outside the rate card effective dates", () => {
    const result = calculateExpectedFreight({
      ...baseInput,
      shipmentDate: "2025-12-15",
    });

    expect(result.status).toBe("needs_review");
  });

  it("should reject invalid supplied COD amounts", () => {
    const result = calculateExpectedFreight({
      ...baseInput,
      codAmount: -100,
    });

    expect(result.status).toBe("needs_review");
  });

  it("should detect freight overcharges above 10", () => {
    const result = compareFreightAmounts(100, 120);

    expect(result.status).toBe("freight_overcharged");
    expect(result.difference).toBe(20);
  });

  it("should allow differences of 10 or less", () => {
    expect(compareFreightAmounts(100, 110).status).toBe("settled");
  });

  it("should send lower-than-expected freight charges for review", () => {
    expect(compareFreightAmounts(100, 80).status).toBe("needs_review");
  });
});
