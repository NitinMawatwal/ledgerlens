import { Router } from "express";

import {
  getAccountSettings,
  updateAccountSettings,
  changePassword,
} from "../controllers/account.controller.js";

import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();

router.use(authenticate);

router.get("/settings", getAccountSettings);
router.patch("/settings", updateAccountSettings);
router.patch("/password", changePassword);

export default router;
