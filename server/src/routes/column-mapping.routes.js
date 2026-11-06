import { Router } from "express";

import {
  saveColumnMapping,
  getColumnMappings,
  rollbackMapping,
} from "../controllers/column-mapping.controller.js";

import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();

router.use(authenticate);

router.post("/", saveColumnMapping);

router.get("/", getColumnMappings);

router.post("/:id/rollback", rollbackMapping);

export default router;