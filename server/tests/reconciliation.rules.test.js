import { describe, it, expect } from "vitest";

import {
  compareAmounts,
  checkUnpaidPastDue,
  checkFreightOvercharge,
  checkReturnNotReceived,
} from "../src/services/reconciliation.rules.js";

describe("Reconciliation Rules", () => {
  describe("compareAmounts", () => {
    it("should mark an order settled when amounts are equal", () => {
      expect(compareAmounts(1000, 1000).status).toBe("settled");
    });

    it("should allow a difference of exactly ₹10", () => {
      expect(compareAmounts(1000, 990).status).toBe("settled");
    });

    it("should mark an order short-paid when difference exceeds ₹10", () => {
      expect(compareAmounts(1000, 980).status).toBe("short_paid");
    });

    it("should send overpayments for review", () => {
      expect(compareAmounts(1000, 1020).status).toBe("needs_review");
    });

    it("should send invalid amounts for review", () => {
      expect(compareAmounts("invalid", 1000).status).toBe("needs_review");
    });
  });

  describe("checkUnpaidPastDue", () => {
    it("should flag zero payment after the due date", () => {
      expect(checkUnpaidPastDue(0, "2026-10-01", new Date("2026-10-10"))).toBe(
        true,
      );
    });

    it("should not flag payment made before the due date", () => {
      expect(
        checkUnpaidPastDue(500, "2026-10-01", new Date("2026-10-10")),
      ).toBe(false);
    });

    it("should not flag an order whose due date is in the future", () => {
      expect(checkUnpaidPastDue(0, "2026-12-01", new Date("2026-10-10"))).toBe(
        false,
      );
    });
  });

  describe("checkFreightOvercharge", () => {
    it("should detect freight overcharges above ₹10", () => {
      expect(checkFreightOvercharge(100, 120).isOvercharged).toBe(true);
    });

    it("should not flag differences of ₹10 or less", () => {
      expect(checkFreightOvercharge(100, 110).isOvercharged).toBe(false);
    });

    it("should not flag undercharging as an overcharge", () => {
      expect(checkFreightOvercharge(100, 80).isOvercharged).toBe(false);
    });
  });

  describe("checkReturnNotReceived", () => {
    it("should flag a return without a warehouse receipt", () => {
      expect(
        checkReturnNotReceived({
          isReturnExpected: true,
          warehouseReceivedAt: null,
        }),
      ).toBe(true);
    });

    it("should not flag a return with a warehouse receipt", () => {
      expect(
        checkReturnNotReceived({
          isReturnExpected: true,
          warehouseReceivedAt: new Date(),
        }),
      ).toBe(false);
    });
  });
});
