import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const { getImportRecords, parseImportFile } = vi.hoisted(() => ({
  getImportRecords: vi.fn(),
  parseImportFile: vi.fn(),
}));

vi.mock("../src/services/file-parser.service.js", () => ({
  getImportRecords,
  parseImportFile,
}));

vi.mock("../src/middleware/auth.middleware.js", () => ({
  authenticate: (req, res, next) => {
    req.user = {
      id: "user123",
      workspaceId: "workspace123",
      role: "co_founder",
    };
    next();
  },
  authorizeRoles: () => (req, res, next) => next(),
}));

import app from "../src/app.js";

describe("File Parser Controller API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/uploads/:id/records", () => {
    it("should mask customer-identifying information in API responses", async () => {
      getImportRecords.mockResolvedValue({
        total: 1,
        page: 1,
        limit: 50,
        records: [
          {
            rowNumber: 2,
            rawData: {
              order_id: "ORD-1001",
              customer_name: "Test Customer",
              customer_id: "CUST-101",
              phone: "9999999999",
              email: "customer@example.com",
              shipping_address: "Bengaluru",
              order_amount: 1598,
            },
            standardizedData: {
              orderId: "ORD-1001",
              customerName: "Test Customer",
              customerId: "CUST-101",
              orderAmount: 1598,
            },
          },
        ],
      });

      const response = await request(app).get(
        "/api/uploads/507f1f77bcf86cd799439011/records",
      );

      expect(response.status).toBe(200);

      const record = response.body.data.records[0];

      expect(record.rawData).toEqual({
        order_id: "ORD-1001",
        order_amount: 1598,
      });

      expect(record.standardizedData).toEqual({
        orderId: "ORD-1001",
        orderAmount: 1598,
      });

      expect(JSON.stringify(record)).not.toContain("Test Customer");
      expect(JSON.stringify(record)).not.toContain("9999999999");
      expect(JSON.stringify(record)).not.toContain("customer@example.com");
      expect(JSON.stringify(record)).not.toContain("Bengaluru");

      expect(getImportRecords).toHaveBeenCalledWith({
        importBatchId: "507f1f77bcf86cd799439011",
        workspaceId: "workspace123",
        page: undefined,
        limit: undefined,
      });
    });

    it("should reject an invalid import batch ID", async () => {
      const response = await request(app).get(
        "/api/uploads/invalid-id/records",
      );

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe("Invalid import batch ID");
      expect(getImportRecords).not.toHaveBeenCalled();
    });
  });
});
