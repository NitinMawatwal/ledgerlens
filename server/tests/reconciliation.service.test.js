import { describe, it, expect } from "vitest";

import {
  normalizeOrderId,
  groupRecordsByOrderId,
  sumAmount,
  matchRecordsToOrders,
} from "../src/services/reconciliation.service.js";

const createRecord = (id, data) => ({
  _id: id,
  standardizedData: data,
});

describe("Reconciliation Matching Service", () => {
  it("should normalize order IDs", () => {
    expect(normalizeOrderId(" ORDER-123 ")).toBe("order-123");
    expect(normalizeOrderId(null)).toBeNull();
    expect(normalizeOrderId("   ")).toBeNull();
  });

  it("should group records by order ID", () => {
    const records = [
      createRecord("1", { orderId: "ORD-1" }),
      createRecord("2", { orderId: "ORD-1" }),
      createRecord("3", { orderId: "ORD-2" }),
    ];

    const grouped = groupRecordsByOrderId(records);

    expect(grouped.get("ord-1")).toHaveLength(2);
    expect(grouped.get("ord-2")).toHaveLength(1);
  });

  it("should sum amounts correctly", () => {
    const records = [
      createRecord("1", { netAmount: 500 }),
      createRecord("2", { netAmount: 300 }),
      createRecord("3", { netAmount: "200" }),
    ];

    expect(sumAmount(records, "netAmount")).toBe(1000);
  });

  it("should match multiple settlement records to one order", () => {
    const orders = [
      createRecord("order-1", {
        orderId: "ORD-101",
        orderAmount: 1000,
      }),
    ];

    const settlements = [
      createRecord("settlement-1", {
        orderId: "ORD-101",
        netAmount: 600,
      }),
      createRecord("settlement-2", {
        orderId: "ORD-101",
        netAmount: 400,
      }),
    ];

    const results = matchRecordsToOrders({
      orders,
      settlements,
    });

    expect(results).toHaveLength(1);
    expect(results[0].settlementRecordIds).toHaveLength(2);
    expect(results[0].actualSettlementAmount).toBe(1000);
    expect(results[0].matched.settlement).toBe(true);
  });

  it("should leave unmatched partner records empty", () => {
    const orders = [
      createRecord("order-1", {
        orderId: "ORD-101",
      }),
    ];

    const results = matchRecordsToOrders({ orders });

    expect(results[0].settlementRecordIds).toEqual([]);
    expect(results[0].codRecordIds).toEqual([]);
    expect(results[0].freightRecordIds).toEqual([]);
    expect(results[0].returnRecordIds).toEqual([]);
  });

  it("should handle orders without an order ID", () => {
    const orders = [
      createRecord("order-1", {
        orderAmount: 500,
      }),
    ];

    const results = matchRecordsToOrders({ orders });

    expect(results[0].orderId).toBeNull();
    expect(results[0].matched.settlement).toBe(false);
  });
});
