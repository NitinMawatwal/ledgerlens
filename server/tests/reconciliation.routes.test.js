import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

const mocks = vi.hoisted(() => ({
  createReconciliationRun: vi.fn(),
}));

vi.mock("../src/services/reconciliation-run.service.js", () => ({
  createReconciliationRun: mocks.createReconciliationRun,
}));

// Authentication is simulated here.
// The actual JWT authentication middleware has its own tests.
vi.mock("../src/middleware/auth.middleware.js", () => ({
  authenticate: (req, res, next) => {
    const authorization = req.headers.authorization;

    if (!authorization?.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    req.user = {
      id: "64b000000000000000000002",
      workspaceId: "64b000000000000000000001",
      role: "finance_executive",
    };

    next();
  },
}));

import reconciliationRoutes from "../src/routes/reconciliation.routes.js";

const app = express();

app.use(express.json());
app.use("/api/reconciliation", reconciliationRoutes);

app.use((error, req, res, next) => {
  res.status(500).json({
    success: false,
    message: "Internal server error",
  });
});

describe("Reconciliation API", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.createReconciliationRun.mockResolvedValue({
      run: {
        _id: "64b000000000000000000005",
        status: "completed",
      },
      matchedOrderCount: 10,
    });
  });

  it("should reject requests without authentication", async () => {
    const response = await request(app)
      .post("/api/reconciliation/run")
      .send({
        batchIds: ["64b000000000000000000003"],
      });

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(mocks.createReconciliationRun).not.toHaveBeenCalled();
  });

  it("should start a reconciliation run for an authenticated user", async () => {
    const response = await request(app)
      .post("/api/reconciliation/run")
      .set("Authorization", "Bearer test-token")
      .send({
        batchIds: ["64b000000000000000000003", "64b000000000000000000004"],
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.matchedOrderCount).toBe(10);
  });

  it("should use authenticated workspace and user IDs", async () => {
    await request(app)
      .post("/api/reconciliation/run")
      .set("Authorization", "Bearer test-token")
      .send({
        batchIds: ["64b000000000000000000003"],
        workspaceId: "64b000000000000000000099",
        userId: "64b000000000000000000099",
      });

    expect(mocks.createReconciliationRun).toHaveBeenCalledWith({
      workspaceId: "64b000000000000000000001",
      userId: "64b000000000000000000002",
      batchIds: ["64b000000000000000000003"],
    });
  });

  it("should return an error if reconciliation fails", async () => {
    mocks.createReconciliationRun.mockRejectedValue(
      new Error("Reconciliation failed"),
    );

    const response = await request(app)
      .post("/api/reconciliation/run")
      .set("Authorization", "Bearer test-token")
      .send({
        batchIds: ["64b000000000000000000003"],
      });

    expect(response.status).toBe(500);
    expect(response.body.success).toBe(false);
  });
});
