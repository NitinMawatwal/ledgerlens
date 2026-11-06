import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  findBatch,
  claimBatch,
  updateBatch,
  findRecords,
  bulkWrite,
  findMapping,
} = vi.hoisted(() => ({
  findBatch: vi.fn(),
  claimBatch: vi.fn(),
  updateBatch: vi.fn(),
  findRecords: vi.fn(),
  bulkWrite: vi.fn(),
  findMapping: vi.fn(),
}));

vi.mock("../src/models/ImportBatch.js", () => ({
  default: {
    findOne: findBatch,
    findOneAndUpdate: claimBatch,
    updateOne: updateBatch,
  },
}));

vi.mock("../src/models/ImportRecord.js", () => ({
  default: {
    find: findRecords,
    bulkWrite,
  },
}));

vi.mock("../src/models/ColumnMapping.js", () => ({
  default: {
    findOne: findMapping,
  },
}));

import { standardizeImportBatch } from "../src/services/standardization.service.js";

const batch = {
  _id: "batch123",
  workspaceId: "workspace123",
  status: "parsed",
  standardizationStatus: "pending",
  sourceKey: "shopify",
  sourceName: "Shopify",
  fileType: "orders",
};

const mapping = {
  _id: "mapping123",
  version: 2,
  mappings: {
    orderId: "order_id",
    orderAmount: "order_amount",
  },
};

const createRecord = (id, rawData) => ({
  _id: id,
  rawData,
});

const createCursor = (records) => ({
  async *[Symbol.asyncIterator]() {
    for (const record of records) {
      yield record;
    }
  },
});

const setupSuccessfulMocks = (records) => {
  findBatch.mockResolvedValue(batch);

  claimBatch
    .mockResolvedValueOnce({
      ...batch,
      standardizationStatus: "processing",
    })
    .mockResolvedValueOnce({
      ...batch,
      standardizationStatus: "completed",
    });

  findMapping.mockReturnValue({
    lean: vi.fn().mockResolvedValue(mapping),
  });

  findRecords.mockReturnValue({
    select: vi.fn().mockReturnValue({
      lean: vi.fn().mockReturnValue({
        cursor: vi.fn().mockReturnValue(createCursor(records)),
      }),
    }),
  });

  bulkWrite.mockResolvedValue({ modifiedCount: records.length });
};

describe("Standardization Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should standardize records and assign the active mapping version", async () => {
    setupSuccessfulMocks([
      createRecord("record1", {
        order_id: "ORD-1001",
        order_amount: 1598,
      }),
    ]);

    const result = await standardizeImportBatch({
      importBatchId: "batch123",
      workspaceId: "workspace123",
    });

    expect(result.summary.status).toBe("completed");
    expect(result.summary.totalRows).toBe(1);
    expect(result.summary.standardizedRows).toBe(1);
    expect(result.summary.failedRows).toBe(0);
    expect(result.mappingVersion).toBe(2);

    expect(bulkWrite).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          updateOne: expect.objectContaining({
            update: {
              $set: expect.objectContaining({
                standardizedData: {
                  orderId: "ORD-1001",
                  orderAmount: 1598,
                },
                mappingVersionId: "mapping123",
                mappingVersion: 2,
                standardizationStatus: "standardized",
                validationErrors: [],
              }),
            },
          }),
        }),
      ],
      { ordered: false },
    );
  });

  it("should standardize a row even when its order ID is missing", async () => {
    setupSuccessfulMocks([
      createRecord("record1", {
        order_amount: 1598,
      }),
    ]);

    const result = await standardizeImportBatch({
      importBatchId: "batch123",
      workspaceId: "workspace123",
    });

    expect(result.summary.status).toBe("completed");
    expect(result.summary.standardizedRows).toBe(1);
    expect(result.summary.failedRows).toBe(0);

    const writtenOperation = bulkWrite.mock.calls[0][0][0];

    expect(
      writtenOperation.updateOne.update.$set.standardizedData.orderId,
    ).toBeNull();

    expect(writtenOperation.updateOne.update.$set.standardizationStatus).toBe(
      "standardized",
    );
  });

  it("should mark rows as failed when required financial data is missing", async () => {
    setupSuccessfulMocks([
      createRecord("record1", {
        order_id: "ORD-1001",
        order_amount: 1598,
      }),
      createRecord("record2", {
        order_id: "ORD-1002",
        order_amount: "",
      }),
    ]);

    const result = await standardizeImportBatch({
      importBatchId: "batch123",
      workspaceId: "workspace123",
    });

    expect(result.summary.status).toBe("completed_with_errors");
    expect(result.summary.totalRows).toBe(2);
    expect(result.summary.standardizedRows).toBe(1);
    expect(result.summary.failedRows).toBe(1);
    expect(result.summary.errors).toContain(
      'Row 2: Required field "orderAmount" is missing',
    );

    const operations = bulkWrite.mock.calls[0][0];

    expect(operations[1].updateOne.update.$set.standardizationStatus).toBe(
      "failed",
    );
  });

  it("should reject an import batch that does not exist in the workspace", async () => {
    findBatch.mockResolvedValue(null);

    await expect(
      standardizeImportBatch({
        importBatchId: "batch123",
        workspaceId: "workspace123",
      }),
    ).rejects.toMatchObject({
      message: "Import batch not found",
      status: 404,
    });

    expect(claimBatch).not.toHaveBeenCalled();
  });

  it("should reject standardization when no active mapping exists", async () => {
    findBatch.mockResolvedValue(batch);

    claimBatch.mockResolvedValue({
      ...batch,
      standardizationStatus: "processing",
    });

    findMapping.mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    });

    await expect(
      standardizeImportBatch({
        importBatchId: "batch123",
        workspaceId: "workspace123",
      }),
    ).rejects.toMatchObject({
      message: "No active column mapping found for Shopify orders",
      status: 404,
    });

    expect(updateBatch).toHaveBeenCalled();
    expect(updateBatch.mock.calls[0][0]).toMatchObject({
      _id: "batch123",
      workspaceId: "workspace123",
      standardizationStatus: "processing",
    });
  });

  it("should reject an import batch that has not been parsed", async () => {
    findBatch.mockResolvedValue({
      ...batch,
      status: "uploaded",
    });

    await expect(
      standardizeImportBatch({
        importBatchId: "batch123",
        workspaceId: "workspace123",
      }),
    ).rejects.toMatchObject({
      message: "File must be parsed before standardization",
      status: 409,
    });

    expect(claimBatch).not.toHaveBeenCalled();
  });
});
