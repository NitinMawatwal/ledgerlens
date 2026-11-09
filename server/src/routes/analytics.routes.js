import { Router } from "express";

import { getAnalyticsSummary } from "../controllers/analytics.controller.js";

import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();

router.use(authenticate);

router.get("/summary", getAnalyticsSummary);

export default router;
