
import { Router } from "express";

import {
  register,
  login,
  getMe,
} from "../controllers/auth.controller.js";

import {
  registerSchema,
  loginSchema,
} from "../validators/auth.validator.js";

import validate from "../middleware/validate.middleware.js";

import {
  authenticate,
} from "../middleware/auth.middleware.js";

const router = Router();

router.post(
  "/register",
  validate(registerSchema),
  register
);

router.post(
  "/login",
  validate(loginSchema),
  login
);

router.get(
  "/me",
  authenticate,
  getMe
);

export default router;
