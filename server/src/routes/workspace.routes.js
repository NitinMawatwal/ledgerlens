import { Router } from "express";

import {
  getWorkspaceSettings,
  updateWorkspaceSettings,
} from "../controllers/workspace.controller.js";

import { authenticate, authorizeRoles } from "../middleware/auth.middleware.js";

const router = Router();

router.use(authenticate);

router.get("/settings", getWorkspaceSettings);

router.patch(
  "/settings",
  authorizeRoles("co_founder"),
  updateWorkspaceSettings,
);

export default router;
