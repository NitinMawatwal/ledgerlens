import { describe, it, expect } from "vitest";

import {
  toAmount,
  calculateSettlement,
  calculateCOD,
  calculateFreight,
  calculateReturnStatus,
} from "../src/services/reconciliation-calculation.service.js";

const record = (standardizedData) => ({
  standardizedData,
});

describe("Reconciliation Financial Calculations", () => {
  describe("toAmount", () => {
    it("should convert numeric strings to numbers", () => {
      expect(toAmount("1250.50")).toBe(1250.5);
    });

    it("should treat missing values as zero", () => {
      expect(toAmount(null)).toBe(0);
      expect(toAmount(undefined)).toBe(0);
    });

    it("should reject invalid numbers", () => {
      expect(toAmount("invalid")).toBeNull();
    });
  });

  describe("calculateSettlement", () => {
    it("should calculate expected settlement correctly", () => {
      const settlements = [
        record({
          grossAmount: 1000,
          commission: 100,
          shippingFee: 50,
          otherFees: 20,
          refundAmount: 0,
          tcs: 10,
          tds: 5,
          netAmount: 815,
        }),
      ];

      const result = calculateSettlement(settlements);

      expect(result.expectedAmount).toBe(815);
      expect(result.actualAmount).toBe(815);
      expect(result.difference).toBe(0);
      expect(result.tcs).toBe(10);
      expect(result.tds).toBe(5);
      expect(result.status).toBe("settled");
    });

    it("should flag settlement short payment above ₹10", () => {
      const result = calculateSettlement([
        record({
          grossAmount: 1000,
          commission: 100,
          shippingFee: 50,
          otherFees: 20,
          refundAmount: 0,
          tcs: 10,
          tds: 5,
          netAmount: 790,
        }),
      ]);

      expect(result.status).toBe("short_paid");
      expect(result.difference).toBe(25);
    });

    it("should not classify TCS and TDS as leakage", () => {
      const result = calculateSettlement([
        record({
          grossAmount: 1000,
          commission: 0,
          shippingFee: 0,
          otherFees: 0,
          refundAmount: 0,
          tcs: 10,
          tds: 5,
          netAmount: 985,
        }),
      ]);

      expect(result.status).toBe("settled");
      expect(result.tcs).toBe(10);
      expect(result.tds).toBe(5);
    });

    it("should return needs_review for invalid amounts", () => {
      const result = calculateSettlement([
        record({
          grossAmount: "invalid",
          netAmount: 500,
        }),
      ]);

      expect(result.status).toBe("needs_review");
    });

    it("should not mark missing settlements as overdue without a due date", () => {
      const result = calculateSettlement([]);

      expect(result.status).toBe("needs_review");
      expect(result.actualAmount).toBe(0);
    });
  });

  describe("calculateCOD", () => {
    it("should calculate expected COD remittance", () => {
      const result = calculateCOD([
        record({
          codCollectedAmount: 1000,
          deductions: 50,
          remittedAmount: 950,
        }),
      ]);

      expect(result.expectedAmount).toBe(950);
      expect(result.actualAmount).toBe(950);
      expect(result.status).toBe("settled");
    });

    it("should detect COD short payment", () => {
      const result = calculateCOD([
        record({
          codCollectedAmount: 1000,
          deductions: 50,
          remittedAmount: 900,
        }),
      ]);

      expect(result.difference).toBe(50);
      expect(result.status).toBe("short_paid");
    });

    it("should flag invalid COD amounts for review", () => {
      const result = calculateCOD([
        record({
          codCollectedAmount: "invalid",
          deductions: 0,
          remittedAmount: 500,
        }),
      ]);

      expect(result.status).toBe("needs_review");
    });

    it("should not mark missing COD records as overdue without a due date", () => {
      const result = calculateCOD([]);

      expect(result.status).toBe("needs_review");
      expect(result.actualAmount).toBe(0);
    });
  });

  describe("calculateFreight", () => {
    it("should keep freight under review until rate-card calculation is available", () => {
      const result = calculateFreight([
        record({
          totalFreight: 150,
        }),
      ]);

      expect(result.actualAmount).toBe(150);
      expect(result.expectedAmount).toBeNull();
      expect(result.status).toBe("needs_review");
    });
  });

  describe("calculateReturnStatus", () => {
    it("should mark returns without warehouse receipt as not received", () => {
      const result = calculateReturnStatus([
        record({
          returnStatus: "returned",
          warehouseReceivedAt: null,
        }),
      ]);

      expect(result.status).toBe("not_received");
    });

    it("should mark returns with warehouse receipt as received", () => {
      const receiptDate = new Date("2026-10-15");

      const result = calculateReturnStatus([
        record({
          returnStatus: "returned",
          warehouseReceivedAt: receiptDate,
        }),
      ]);

      expect(result.status).toBe("received");
      expect(result.warehouseReceivedAt).toEqual(receiptDate);
    });

    it("should mark orders without return records as not applicable", () => {
      const result = calculateReturnStatus([]);

      expect(result.status).toBe("not_applicable");
    });
  });
});
