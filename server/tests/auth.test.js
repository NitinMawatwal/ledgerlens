
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const { registerUser, loginUser } = vi.hoisted(() => ({
  registerUser: vi.fn(),
  loginUser: vi.fn(),
}));

vi.mock("../src/services/auth.service.js", () => ({
  registerUser,
  loginUser,
}));

import app from "../src/app.js";

describe("Authentication API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/auth/register", () => {
    it("should register a user successfully", async () => {
      registerUser.mockResolvedValue({
        user: {
          id: "user123",
          name: "Test Owner",
          email: "test@example.com",
          role: "co_founder",
          workspaceId: "workspace123",
        },
        token: "test-jwt-token",
      });

      const response = await request(app)
        .post("/api/auth/register")
        .send({
          name: "Test Owner",
          email: "test@example.com",
          password: "Password123!",
          workspaceName: "Test Workspace",
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.role).toBe("co_founder");
      expect(registerUser).toHaveBeenCalledOnce();
    });

    it("should reject invalid registration data", async () => {
      const response = await request(app)
        .post("/api/auth/register")
        .send({
          name: "A",
          email: "invalid-email",
          password: "123",
          workspaceName: "X",
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(registerUser).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/auth/login", () => {
    it("should log in a user successfully", async () => {
      loginUser.mockResolvedValue({
        user: {
          id: "user123",
          name: "Test Owner",
          email: "test@example.com",
          role: "co_founder",
          workspaceId: "workspace123",
        },
        token: "test-jwt-token",
      });

      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: "test@example.com",
          password: "Password123!",
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.token).toBe("test-jwt-token");
      expect(loginUser).toHaveBeenCalledOnce();
    });

    it("should reject missing login fields", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(loginUser).not.toHaveBeenCalled();
    });

    it("should return an error when credentials are incorrect", async () => {
      const error = new Error("Invalid email or password");
      error.status = 401;

      loginUser.mockRejectedValue(error);

      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: "test@example.com",
          password: "WrongPassword123!",
        });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe("Invalid email or password");
    });
  });
});
