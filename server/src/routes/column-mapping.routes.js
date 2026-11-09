import { Router } from "express";

import {
  saveColumnMapping,
  getColumnMappings,
  rollbackMapping,
  suggestMapping,
} from "../controllers/column-mapping.controller.js";

import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();

// All mapping endpoints require authentication.
router.use(authenticate);

// AI suggestions
router.post("/suggest", suggestMapping);

// Save approved mapping
router.post("/", saveColumnMapping);

// Mapping version history
router.get("/", getColumnMappings);

// Rollback mapping
router.post("/:id/rollback", rollbackMapping);

export default router;
