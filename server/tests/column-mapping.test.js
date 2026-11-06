
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const {
  createColumnMapping,
  getColumnMappingVersions,
  rollbackColumnMapping,
} = vi.hoisted(() => ({
  createColumnMapping: vi.fn(),
  getColumnMappingVersions: vi.fn(),
  rollbackColumnMapping: vi.fn(),
}));

vi.mock("../src/services/column-mapping.service.js", () => ({
  createColumnMapping,
  getColumnMappingVersions,
  rollbackColumnMapping,
}));

// Isolate these API tests from JWT and MongoDB authentication.
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

const mockMapping = {
  _id: "mapping123",
  sourceName: "Shopify",
  sourceKey: "shopify",
  fileType: "orders",
  version: 1,
  mappings: {
    orderId: "order_id",
    orderAmount: "order_amount",
  },
  isActive: true,
};

describe("Column Mapping API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/mappings", () => {
    it("should save a column mapping successfully", async () => {
      createColumnMapping.mockResolvedValue(mockMapping);

      const response = await request(app)
        .post("/api/mappings")
        .send({
          importBatchId: "batch123",
          mappings: {
            orderId: "order_id",
            orderAmount: "order_amount",
          },
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.mapping.version).toBe(1);
      expect(response.body.data.mapping.isActive).toBe(true);

      expect(createColumnMapping).toHaveBeenCalledWith({
        importBatchId: "batch123",
        mappings: {
          orderId: "order_id",
          orderAmount: "order_amount",
        },
        workspaceId: "workspace123",
        userId: "user123",
      });
    });

    it("should return an error if the import batch is not found", async () => {
      const error = new Error("Import batch not found");
      error.status = 404;

      createColumnMapping.mockRejectedValue(error);

      const response = await request(app)
        .post("/api/mappings")
        .send({
          importBatchId: "unknown123",
          mappings: {
            orderId: "order_id",
          },
        });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe("Import batch not found");
    });

    it("should reject mappings when the file is not parsed", async () => {
      const error = new Error(
        "The file must be parsed before creating a column mapping"
      );
      error.status = 409;

      createColumnMapping.mockRejectedValue(error);

      const response = await request(app)
        .post("/api/mappings")
        .send({
          importBatchId: "batch123",
          mappings: {
            orderId: "order_id",
          },
        });

      expect(response.status).toBe(409);
      expect(response.body.message).toBe(
        "The file must be parsed before creating a column mapping"
      );
    });
  });

  describe("GET /api/mappings", () => {
    it("should retrieve mapping versions for a source", async () => {
      const result = {
        sourceKey: "shopify",
        fileType: "orders",
        activeMapping: mockMapping,
        versions: [mockMapping],
      };

      getColumnMappingVersions.mockResolvedValue(result);

      const response = await request(app)
        .get("/api/mappings")
        .query({
          sourceKey: "shopify",
          fileType: "orders",
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.versions).toHaveLength(1);
      expect(response.body.data.activeMapping.version).toBe(1);

      expect(getColumnMappingVersions).toHaveBeenCalledWith({
        workspaceId: "workspace123",
        sourceKey: "shopify",
        fileType: "orders",
      });
    });

    it("should return an empty version list when no mapping exists", async () => {
      getColumnMappingVersions.mockResolvedValue({
        sourceKey: "shopify",
        fileType: "orders",
        activeMapping: null,
        versions: [],
      });

      const response = await request(app)
        .get("/api/mappings")
        .query({
          sourceKey: "shopify",
          fileType: "orders",
        });

      expect(response.status).toBe(200);
      expect(response.body.data.versions).toHaveLength(0);
      expect(response.body.data.activeMapping).toBeNull();
    });
  });

  describe("POST /api/mappings/:id/rollback", () => {
    it("should roll back a mapping successfully", async () => {
      const rollbackResult = {
        ...mockMapping,
        _id: "mapping456",
        version: 3,
        rollbackFromVersion: 1,
        isActive: true,
      };

      rollbackColumnMapping.mockResolvedValue(rollbackResult);

      const response = await request(app)
        .post("/api/mappings/mapping123/rollback");

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.mapping.version).toBe(3);
      expect(response.body.data.mapping.rollbackFromVersion).toBe(1);

      expect(rollbackColumnMapping).toHaveBeenCalledWith({
        mappingId: "mapping123",
        workspaceId: "workspace123",
        userId: "user123",
      });
    });

    it("should return an error when the mapping does not exist", async () => {
      const error = new Error("Mapping version not found");
      error.status = 404;

      rollbackColumnMapping.mockRejectedValue(error);

      const response = await request(app)
        .post("/api/mappings/unknown123/rollback");

      expect(response.status).toBe(404);
      expect(response.body.message).toBe(
        "Mapping version not found"
      );
    });
  });
});
