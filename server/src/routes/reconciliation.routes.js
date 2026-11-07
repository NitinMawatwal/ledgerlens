import { Router } from "express";

import {
  startReconciliation,
  getReconciliationResults,
} from "../controllers/reconciliation.controller.js";

import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();

router.use(authenticate);

router.post("/run", startReconciliation);
router.get("/:runId/results", getReconciliationResults);

export default router;
