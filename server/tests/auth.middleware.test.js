
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

const { findUserById, findWorkspaceById } = vi.hoisted(() => ({
  findUserById: vi.fn(),
  findWorkspaceById: vi.fn(),
}));

vi.mock("../src/models/User.js", () => ({
  default: {
    findById: findUserById,
  },
}));

vi.mock("../src/models/Workspace.js", () => ({
  default: {
    findById: findWorkspaceById,
  },
}));

import app from "../src/app.js";

const JWT_SECRET = "test-secret-for-middleware-tests";

const createToken = (payload = {}, options = {}) =>
  jwt.sign(
    {
      userId: "user123",
      workspaceId: "workspace123",
      ...payload,
    },
    JWT_SECRET,
    {
      issuer: "ledgerlens",
      audience: "ledgerlens-client",
      ...options,
    }
  );

const activeUser = {
  _id: "user123",
  name: "Test Owner",
  email: "test@example.com",
  role: "co_founder",
  workspaceId: {
    toString: () => "workspace123",
  },
  isActive: true,
};

describe("Authentication Middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = JWT_SECRET;

    findUserById.mockResolvedValue(activeUser);
    findWorkspaceById.mockResolvedValue({
      status: "active",
    });
  });

  it("should reject requests without a token", async () => {
    const response = await request(app).get("/api/auth/me");

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Authentication required");
    expect(findUserById).not.toHaveBeenCalled();
  });

  it("should reject invalid tokens", async () => {
    const response = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer invalid-token");

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Invalid or expired token");
  });

  it("should reject expired tokens", async () => {
    const token = createToken({}, { expiresIn: -1 });

    const response = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Invalid or expired token");
  });

  it("should authenticate an active user", async () => {
    const token = createToken();

    const response = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.user.email).toBe("test@example.com");
    expect(response.body.data.user.workspaceId).toBe("workspace123");
  });

  it("should reject inactive users", async () => {
    findUserById.mockResolvedValue({
      ...activeUser,
      isActive: false,
    });

    const token = createToken();

    const response = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("User account is unavailable");
  });

  it("should reject suspended workspaces", async () => {
    findWorkspaceById.mockResolvedValue({
      status: "suspended",
    });

    const token = createToken();

    const response = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("Workspace is unavailable");
  });
});


import { authorizeRoles } from "../src/middleware/auth.middleware.js";

describe("Role-based Authorization", () => {
  const createResponse = () => {
    const res = {
      status: vi.fn(),
      json: vi.fn(),
    };

    res.status.mockReturnValue(res);

    return res;
  };

  it("should allow a co-founder to access an authorized route", () => {
    const req = {
      user: { role: "co_founder" },
    };
    const res = createResponse();
    const next = vi.fn();

    authorizeRoles("co_founder")(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should reject a finance executive from a co-founder-only route", () => {
    const req = {
      user: { role: "finance_executive" },
    };
    const res = createResponse();
    const next = vi.fn();

    authorizeRoles("co_founder")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "You do not have permission to perform this action",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("should reject requests without an authenticated user", () => {
    const req = {};
    const res = createResponse();
    const next = vi.fn();

    authorizeRoles("co_founder")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
