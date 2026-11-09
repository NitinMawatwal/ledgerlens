import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import authRoutes from "./routes/auth.routes.js";
import accountRoutes from "./routes/account.routes.js";
import workspaceRoutes from "./routes/workspace.routes.js";
import uploadRoutes from "./routes/upload.routes.js";
import columnMappingRoutes from "./routes/column-mapping.routes.js";
import reconciliationRoutes from "./routes/reconciliation.routes.js";
import rateCardRoutes from "./routes/rate-card.routes.js";
import claimsRoutes from "./routes/claims.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import analyticsRoutes from "./routes/analytics.routes.js";

const app = express();

app.use(helmet());

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
  }),
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

app.use("/api", apiLimiter);

app.use("/api/auth", authRoutes);
app.use("/api/account", accountRoutes);
app.use("/api/workspace", workspaceRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/mappings", columnMappingRoutes);
app.use("/api/rate-cards", rateCardRoutes);
app.use("/api/reconciliation", reconciliationRoutes);
app.use("/api/claims", claimsRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/analytics", analyticsRoutes);

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "LedgerLens API is running",
    timestamp: new Date().toISOString(),
  });
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

app.use((error, req, res, next) => {
  console.error(error);

  res.status(error.status || 500).json({
    success: false,
    message:
      error.status && error.status < 500
        ? error.message
        : "Internal server error",
  });
});

export default app;
