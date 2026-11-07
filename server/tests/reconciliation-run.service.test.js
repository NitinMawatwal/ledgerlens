import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  findBatches: vi.fn(),
  findRecords: vi.fn(),
  createRun: vi.fn(),
  insertResults: vi.fn(),
  updateRun: vi.fn(),
  findRateCards: vi.fn(),
}));

vi.mock("../src/models/ImportBatch.js", () => ({
  default: {
    find: mocks.findBatches,
  },
}));

vi.mock("../src/models/ImportRecord.js", () => ({
  default: {
    find: mocks.findRecords,
  },
}));

vi.mock("../src/models/ReconciliationRun.js", () => ({
  default: {
    create: mocks.createRun,
    findByIdAndUpdate: mocks.updateRun,
  },
}));

vi.mock("../src/models/ReconciliationResult.js", () => ({
  default: {
    insertMany: mocks.insertResults,
  },
}));

vi.mock("../src/services/rate-card-lookup.service.js", () => ({
  findApplicableRateCards: mocks.findRateCards,
}));

import { createReconciliationRun } from "../src/services/reconciliation-run.service.js";

const workspaceId = "64b000000000000000000001";
const userId = "64b000000000000000000002";

const ordersBatchId = "64b000000000000000000003";
const settlementsBatchId = "64b000000000000000000004";
const runId = "64b000000000000000000005";

const orderRecordId = "64b000000000000000000010";
const settlementRecordId = "64b000000000000000000011";

const createBatch = (id, fileType) => ({
  _id: id,
  workspaceId,
  fileType,
  status: "parsed",
  originalName: `${fileType}.csv`,
});

const createRecord = (id, batchId, standardizedData) => ({
  _id: id,
  importBatchId: batchId,
  standardizedData,
});

const setupBatchMock = (batches) => {
  mocks.findBatches.mockReturnValue({
    lean: vi.fn().mockResolvedValue(batches),
  });
};

const setupRecordMock = (records) => {
  mocks.findRecords.mockReturnValue({
    select: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(records),
    }),
  });
};

const setupRunMocks = () => {
  mocks.createRun.mockResolvedValue({
    _id: runId,
    status: "processing",
  });

  mocks.insertResults.mockResolvedValue([]);

  mocks.updateRun.mockResolvedValue({
    _id: runId,
    status: "completed",
  });

  mocks.findRateCards.mockResolvedValue(new Map());
};

const validBatches = [
  createBatch(ordersBatchId, "orders"),
  createBatch(settlementsBatchId, "settlements"),
];

const validOrder = createRecord(orderRecordId, ordersBatchId, {
  orderId: "ORD-101",
  orderAmount: 1000,
  paymentMethod: "prepaid",
});

const incompleteSettlement = createRecord(
  settlementRecordId,
  settlementsBatchId,
  {
    orderId: "ORD-101",
    netAmount: 950,
  },
);

const runService = (batchIds = [ordersBatchId, settlementsBatchId]) =>
  createReconciliationRun({
    workspaceId,
    userId,
    batchIds,
  });

const savedResults = () => mocks.insertResults.mock.calls[0][0];

describe("Reconciliation Run Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    setupBatchMock(validBatches);
    setupRecordMock([validOrder, incompleteSettlement]);

    setupRunMocks();
  });

  it("should reject an invalid workspace ID", async () => {
    await expect(
      createReconciliationRun({
        workspaceId: "invalid",
        userId,
        batchIds: [ordersBatchId],
      }),
    ).rejects.toThrow("Invalid workspace ID");
  });

  it("should reject an invalid user ID", async () => {
    await expect(
      createReconciliationRun({
        workspaceId,
        userId: "invalid",
        batchIds: [ordersBatchId],
      }),
    ).rejects.toThrow("Invalid user ID");
  });

  it("should reject an empty batch list", async () => {
    await expect(
      createReconciliationRun({
        workspaceId,
        userId,
        batchIds: [],
      }),
    ).rejects.toThrow("At least one import batch is required");
  });

  it("should require an orders batch", async () => {
    setupBatchMock([createBatch(settlementsBatchId, "settlements")]);

    await expect(runService([settlementsBatchId])).rejects.toThrow(
      "An orders batch is required",
    );
  });

  it("should reject batches that are not parsed", async () => {
    setupBatchMock([
      {
        ...createBatch(ordersBatchId, "orders"),
        status: "uploaded",
      },
    ]);

    await expect(runService([ordersBatchId])).rejects.toThrow("must be parsed");
  });

  it("should reject missing batches", async () => {
    setupBatchMock([]);

    await expect(runService()).rejects.toThrow(
      "One or more import batches were not found",
    );
  });

  it("should allow multiple batches of the same type", async () => {
    const secondOrdersBatchId = "64b000000000000000000006";

    setupBatchMock([
      createBatch(ordersBatchId, "orders"),
      createBatch(secondOrdersBatchId, "orders"),
    ]);

    setupRecordMock([
      validOrder,
      createRecord("64b000000000000000000012", secondOrdersBatchId, {
        orderId: "ORD-102",
        orderAmount: 1500,
        paymentMethod: "prepaid",
      }),
    ]);

    const result = await runService([ordersBatchId, secondOrdersBatchId]);

    expect(result.matchedOrderCount).toBe(2);
    expect(mocks.insertResults).toHaveBeenCalledTimes(1);
    expect(savedResults()).toHaveLength(2);
  });

  it("should save matched records and retain incomplete settlements for review", async () => {
    const result = await runService();

    expect(mocks.findBatches).toHaveBeenCalledWith({
      _id: {
        $in: [ordersBatchId, settlementsBatchId],
      },
      workspaceId,
    });

    expect(mocks.findRecords).toHaveBeenCalledWith({
      workspaceId,
      importBatchId: {
        $in: [ordersBatchId, settlementsBatchId],
      },
      standardizationStatus: "standardized",
    });

    expect(mocks.findRateCards).toHaveBeenCalledWith({
      workspaceId,
      freightRecords: [],
    });

    expect(mocks.insertResults).toHaveBeenCalledTimes(1);

    expect(savedResults()).toHaveLength(1);
    expect(savedResults()[0].orderId).toBe("ORD-101");
    expect(savedResults()[0].settlementRecordIds).toHaveLength(1);
    expect(savedResults()[0].actualSettlementAmount).toBe(950);
    expect(savedResults()[0].statuses).toContain("needs_review");
    expect(savedResults()[0].reviewRequired).toBe(true);

    expect(mocks.updateRun).toHaveBeenCalledWith(
      runId,
      expect.objectContaining({
        status: "completed",
      }),
      { new: true },
    );

    expect(result.matchedOrderCount).toBe(1);
  });

  it("should calculate settlement, preserve TCS/TDS separately and detect short payment", async () => {
    setupRecordMock([
      validOrder,
      createRecord(settlementRecordId, settlementsBatchId, {
        orderId: "ORD-101",
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

    await runService();

    const result = savedResults()[0];

    expect(result.expectedSettlementAmount).toBe(815);
    expect(result.actualSettlementAmount).toBe(790);
    expect(result.settlementDifference).toBe(25);
    expect(result.tcsAmount).toBe(10);
    expect(result.tdsAmount).toBe(5);

    expect(result.statuses).toContain("short_paid");
    expect(result.moneyAtRisk).toBe(25);
    expect(result.reviewRequired).toBe(false);
  });

  it("should treat a correctly calculated settlement as settled", async () => {
    setupRecordMock([
      validOrder,
      createRecord(settlementRecordId, settlementsBatchId, {
        orderId: "ORD-101",
        grossAmount: 1000,
        commission: 100,
        shippingFee: 50,
        otherFees: 20,
        refundAmount: 0,
        tcs: 10,
        tds: 5,
        netAmount: 815,
      }),
    ]);

    await runService();

    const result = savedResults()[0];

    expect(result.statuses).toContain("settled");
    expect(result.moneyAtRisk).toBe(0);
    expect(result.reviewRequired).toBe(false);
  });

  it("should reconcile COD orders against COD remittances", async () => {
    const codBatchId = "64b000000000000000000020";
    const codRecordId = "64b000000000000000000021";

    setupBatchMock([
      createBatch(ordersBatchId, "orders"),
      createBatch(codBatchId, "cod"),
    ]);

    setupRecordMock([
      createRecord(orderRecordId, ordersBatchId, {
        orderId: "ORD-COD-1",
        paymentMethod: "COD",
        orderAmount: 1000,
      }),
      createRecord(codRecordId, codBatchId, {
        orderId: "ORD-COD-1",
        codCollectedAmount: 1000,
        deductions: 50,
        remittedAmount: 900,
      }),
    ]);

    await runService([ordersBatchId, codBatchId]);

    const result = savedResults()[0];

    expect(result.expectedCodAmount).toBe(950);
    expect(result.actualCodRemittedAmount).toBe(900);
    expect(result.codDifference).toBe(50);
    expect(result.statuses).toContain("short_paid");
    expect(result.moneyAtRisk).toBe(50);
  });

  it("should calculate freight using the applicable rate card", async () => {
    const freightBatchId = "64b000000000000000000030";
    const freightRecordId = "64b000000000000000000031";

    const freightRecord = createRecord(freightRecordId, freightBatchId, {
      orderId: "ORD-101",
      courier: "Delhivery",
      zone: "A",
      billedWeight: 0.5,
      shipmentDate: "2026-06-15",
      totalFreight: 120,
      codAmount: 1000,
      isRto: false,
    });

    const rateCard = {
      courierKey: "delhivery",
      zone: "A",
      effectiveFrom: new Date("2026-01-01"),
      effectiveTo: null,
      isActive: true,
      version: 2,
      weightSlabs: [
        {
          minWeight: 0,
          maxWeight: 1,
          baseCharge: 50,
          additionalChargePerKg: 20,
        },
      ],
      codFee: 10,
      codFeePercentage: 2,
      rtoFee: 30,
      additionalCharges: 5,
    };

    setupBatchMock([
      createBatch(ordersBatchId, "orders"),
      createBatch(freightBatchId, "freight"),
    ]);

    setupRecordMock([validOrder, freightRecord]);

    mocks.findRateCards.mockResolvedValue(
      new Map([[freightRecordId, rateCard]]),
    );

    await runService([ordersBatchId, freightBatchId]);

    const result = savedResults()[0];

    expect(result.expectedFreightAmount).toBe(95);
    expect(result.actualFreightAmount).toBe(120);
    expect(result.freightDifference).toBe(25);
    expect(result.rateCardVersion).toBe(2);
    expect(result.statuses).toContain("freight_overcharged");
    expect(result.moneyAtRisk).toBe(25);
  });

  it("should keep freight under review when no rate card is available", async () => {
    const freightBatchId = "64b000000000000000000030";
    const freightRecordId = "64b000000000000000000031";

    setupBatchMock([
      createBatch(ordersBatchId, "orders"),
      createBatch(freightBatchId, "freight"),
    ]);

    setupRecordMock([
      validOrder,
      createRecord(freightRecordId, freightBatchId, {
        orderId: "ORD-101",
        courier: "Delhivery",
        zone: "A",
        billedWeight: 0.5,
        shipmentDate: "2026-06-15",
        totalFreight: 120,
      }),
    ]);

    await runService([ordersBatchId, freightBatchId]);

    const result = savedResults()[0];

    expect(result.expectedFreightAmount).toBeNull();
    expect(result.statuses).toContain("needs_review");
    expect(result.moneyAtRisk).toBe(0);
    expect(result.reviewRequired).toBe(true);
  });

  it("should flag returned orders without warehouse receipt", async () => {
    const returnsBatchId = "64b000000000000000000040";
    const returnRecordId = "64b000000000000000000041";

    setupBatchMock([
      createBatch(ordersBatchId, "orders"),
      createBatch(returnsBatchId, "returns"),
    ]);

    setupRecordMock([
      validOrder,
      createRecord(returnRecordId, returnsBatchId, {
        orderId: "ORD-101",
        returnStatus: "returned",
        warehouseReceivedAt: null,
      }),
    ]);

    await runService([ordersBatchId, returnsBatchId]);

    const result = savedResults()[0];

    expect(result.returnStatus).toBe("not_received");
    expect(result.statuses).toContain("return_not_received");
  });

  it("should mark the run as failed if result insertion fails", async () => {
    mocks.insertResults.mockRejectedValue(
      new Error("Database insertion failed"),
    );

    await expect(runService()).rejects.toThrow("Database insertion failed");

    expect(mocks.updateRun).toHaveBeenCalledWith(
      runId,
      expect.objectContaining({
        status: "failed",
        errorMessage: "Database insertion failed",
      }),
    );
  });

  it("should mark the run as failed if rate-card lookup fails", async () => {
    mocks.findRateCards.mockRejectedValue(new Error("Rate card lookup failed"));

    await expect(runService()).rejects.toThrow("Rate card lookup failed");

    expect(mocks.updateRun).toHaveBeenCalledWith(
      runId,
      expect.objectContaining({
        status: "failed",
        errorMessage: "Rate card lookup failed",
      }),
    );
  });
});
