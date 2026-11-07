import { Router } from "express";
import {
  createRateCard,
  getRateCards,
} from "../controllers/rate-card.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();

router.use(authenticate);

router.post("/", createRateCard);
router.get("/", getRateCards);

export default router;
