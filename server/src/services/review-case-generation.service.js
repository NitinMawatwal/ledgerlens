import mongoose from "mongoose";

import ReviewCase from "../models/ReviewCase.js";
import ReconciliationRun from "../models/ReconciliationRun.js";
import ReconciliationResult from "../models/ReconciliationResult.js";

async function generateReviewCasesForRun({ runId, workspaceId, userId }) {
  if (!mongoose.isValidObjectId(runId)) {
    throw new Error("Invalid reconciliation run ID.");
  }

  const run = await ReconciliationRun.findOne({
    _id: runId,
    workspaceId,
    status: { $in: ["completed", "completed_with_errors"] },
  }).lean();

  if (!run) {
    throw new Error("Completed reconciliation run not found.");
  }

  const results = await ReconciliationResult.find({
    reconciliationRunId: run._id,
    workspaceId,
    $or: [
      { reviewRequired: true },
      { statuses: "needs_review" },
      { statuses: "return_not_received" },
      { orderId: { $exists: false } },
      { orderId: null },
      { orderId: "" },
    ],
  }).lean();

  const operations = [];

  for (const result of results) {
    const reviewTypes = [];

    if (!result.orderId) {
      reviewTypes.push({
        reviewType: "missing_order_id",
        reason:
          "The reconciliation result does not have an order ID. A human must identify the correct order before proceeding.",
      });
      }
      
    if (
      result.reviewRequired ||
      (result.statuses || []).includes("needs_review") ||
      result.returnStatus === "not_received" ||
      (result.statuses || []).includes("return_not_received")
    ) {
      let reason =
        result.reviewReason ||
        "The reconciliation result requires human review.";

      if (
        result.returnStatus === "not_received" ||
        (result.statuses || []).includes("return_not_received")
      ) {
        reason = `Return for order ${result.orderId} has not been confirmed as received by the warehouse. Verify courier delivery and warehouse receipt.`;
      }

      reviewTypes.push({
        reviewType: "reconciliation_exception",
        reason,
      });
      }
      
      
    for (const item of reviewTypes) {
      const reviewCase = {
        workspaceId: run.workspaceId,
        reconciliationRunId: run._id,
        reconciliationResultId: result._id,
        orderRecordId: result.orderRecordId || null,
        orderId: result.orderId || null,
        reviewType: item.reviewType,
        reason: item.reason,
        suggestedMatch: null,
        status: "pending",
        decisionNote: null,
        auditHistory: [
          {
            action: "created",
            toStatus: "pending",
            note: "Review case generated from reconciliation. Human review is required.",
            performedBy: userId,
            performedAt: new Date(),
          },
        ],
        createdBy: userId,
      };

      operations.push({
        updateOne: {
          filter: {
            workspaceId,
            reconciliationRunId: run._id,
            reconciliationResultId: result._id,
            reviewType: item.reviewType,
          },
          update: {
            $setOnInsert: reviewCase,
          },
          upsert: true,
        },
      });
    }
  }

  if (!operations.length) {
    return {
      runId: String(run._id),
      reviewCasesCreated: 0,
      reviewCasesAlreadyExisted: 0,
      message: "No review cases were required for this reconciliation run.",
    };
  }

  const writeResult = await ReviewCase.bulkWrite(operations, {
    ordered: false,
  });

  const created = writeResult.upsertedCount || 0;

  return {
    runId: String(run._id),
    reviewCasesCreated: created,
    reviewCasesAlreadyExisted: operations.length - created,
    message: "Review-case generation completed.",
  };
}

export { generateReviewCasesForRun };
