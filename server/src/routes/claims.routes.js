import express from "express";
import { authenticate } from "../middleware/auth.middleware.js";

import {
  generateClaims,
  listClaims,
  getClaimsByPartner,
  exportClaimEvidence,
  listReviewCases,
  decideReviewCase,
  generateReviewCases,
  updateClaimStatus,
} from "../controllers/claims.controller.js";

const router = express.Router();

router.use(authenticate);

router.get("/partners", getClaimsByPartner);

// Review queue
router.get("/reviews", listReviewCases);
router.post("/reviews/generate/:runId", generateReviewCases);
router.patch("/reviews/:reviewId/decision", decideReviewCase);

router.patch("/:claimId/status", updateClaimStatus);

// Claims
router.get("/:claimId/evidence", exportClaimEvidence);
router.get("/", listClaims);
router.post("/generate/:runId", generateClaims);

export default router;
