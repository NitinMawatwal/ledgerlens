import mongoose from "mongoose";

import Claim from "../models/Claim.js";
import ReconciliationRun from "../models/ReconciliationRun.js";
import ReconciliationResult from "../models/ReconciliationResult.js";
import ImportRecord from "../models/ImportRecord.js";
import ImportBatch from "../models/ImportBatch.js";

const AMOUNT_TOLERANCE = 10;

const getId = (value) => {
  if (!value) return null;
  return value._id || value;
};

const getRecordIds = (result, field) =>
  (result[field] || []).map(getId).filter(Boolean);

const getClaimKey = (orderId, claimType) =>
  `${String(orderId || "")
    .trim()
    .toLowerCase()}::${claimType}`;

async function getPartnerDetails(recordIds, workspaceId, fallbackType) {
  if (!recordIds.length) {
    return {
      partnerName: "Unknown partner",
      partnerKey: "unknown",
      partnerType: "other",
      sourceBatchIds: [],
    };
  }

  const records = await ImportRecord.find({
    _id: { $in: recordIds },
    workspaceId,
  })
    .select("importBatchId")
    .lean();

  const batchIds = [
    ...new Set(
      records
        .map((record) => getId(record.importBatchId))
        .filter(Boolean)
        .map(String),
    ),
  ];

  const batches = await ImportBatch.find({
    _id: { $in: batchIds },
    workspaceId,
  })
    .select("_id sourceName sourceKey")
    .lean();

  const batch = batches[0];

  if (!batch) {
    return {
      partnerName: "Unknown partner",
      partnerKey: "unknown",
      partnerType: "other",
      sourceBatchIds: batchIds,
    };
  }

  return {
    partnerName: batch.sourceName || batch.sourceKey || "Unknown partner",
    partnerKey: batch.sourceKey || "unknown",
    partnerType: fallbackType,
    sourceBatchIds: batchIds,
  };
}

function buildClaimData({
  run,
  result,
  partner,
  claimType,
  claimAmount,
  description,
  evidence,
  expectedAmount,
  actualAmount,
  difference,
  createdBy,
}) {
  return {
    workspaceId: run.workspaceId,
    reconciliationRunId: run._id,
    reconciliationResultId: result._id,
    orderRecordId: result.orderRecordId,
    orderId: result.orderId,
    ...partner,
    claimType,
    claimAmount: Math.max(0, Number(claimAmount) || 0),
    currency: "INR",
    status: "open",
    description,
    evidence: {
      orderRecordIds: [result.orderRecordId].filter(Boolean),
      settlementRecordIds: evidence.settlementRecordIds || [],
      codRecordIds: evidence.codRecordIds || [],
      freightRecordIds: evidence.freightRecordIds || [],
      returnRecordIds: evidence.returnRecordIds || [],
      expectedAmount: expectedAmount ?? null,
      actualAmount: actualAmount ?? null,
      difference: difference ?? null,
      rateCardVersion: result.rateCardVersion ?? null,
      sourceBatchIds: partner.sourceBatchIds,
    },
    auditHistory: [
      {
        action: "created",
        toStatus: "open",
        note: "Automatically generated from reconciliation. Partner submission requires a human action.",
        performedBy: createdBy,
        performedAt: new Date(),
      },
    ],
    createdBy,
    updatedBy: createdBy,
  };
}

async function generateClaimsForRun({ runId, workspaceId, userId }) {
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
  }).lean();

  // Find existing claims across ALL previous reconciliation runs.
  // This prevents the same order/discrepancy from being claimed twice.
  const orderIds = [
    ...new Set(
      results
        .map((result) => result.orderId)
        .filter(Boolean)
        .map((orderId) => String(orderId).trim()),
    ),
  ];

  const existingClaims = orderIds.length
    ? await Claim.find({
        workspaceId,
        orderId: { $in: orderIds },
      })
        .select("orderId claimType status claimAmount")
        .lean()
    : [];

  const existingClaimKeys = new Set(
    existingClaims.map((claim) => getClaimKey(claim.orderId, claim.claimType)),
  );

  const operations = [];
  let skippedExistingClaims = 0;

  for (const result of results) {
    const statuses = result.statuses || [];

    const settlementRecordIds = getRecordIds(result, "settlementRecordIds");

    const codRecordIds = getRecordIds(result, "codRecordIds");
    const freightRecordIds = getRecordIds(result, "freightRecordIds");
    const returnRecordIds = getRecordIds(result, "returnRecordIds");

    const evidence = {
      settlementRecordIds,
      codRecordIds,
      freightRecordIds,
      returnRecordIds,
    };

    const candidates = [];

    // Settlement or COD short payment.
    if (
      statuses.includes("short_paid") &&
      Number(result.settlementDifference) > AMOUNT_TOLERANCE
    ) {
      candidates.push({
        claimType: "short_paid",
        amount: result.settlementDifference,
        description: `Settlement short payment for order ${result.orderId}.`,
        recordIds: settlementRecordIds,
        partnerType: "marketplace",
        expectedAmount: result.expectedSettlementAmount,
        actualAmount: result.actualSettlementAmount,
        difference: result.settlementDifference,
      });
    } else if (
      statuses.includes("short_paid") &&
      Number(result.codDifference) > AMOUNT_TOLERANCE
    ) {
      candidates.push({
        claimType: "short_paid",
        amount: result.codDifference,
        description: `COD remittance short payment for order ${result.orderId}.`,
        recordIds: codRecordIds,
        partnerType: "courier",
        expectedAmount: result.expectedCodAmount,
        actualAmount: result.actualCodRemittedAmount,
        difference: result.codDifference,
      });
    }

    // Freight overcharge.
    if (
      statuses.includes("freight_overcharged") &&
      Number(result.freightDifference) > AMOUNT_TOLERANCE
    ) {
      candidates.push({
        claimType: "freight_overcharged",
        amount: result.freightDifference,
        description: `Freight overcharge for order ${result.orderId}.`,
        recordIds: freightRecordIds,
        partnerType: "courier",
        expectedAmount: result.expectedFreightAmount,
        actualAmount: result.actualFreightAmount,
        difference: result.freightDifference,
      });
    }

    // Unpaid past due.
    if (statuses.includes("unpaid_past_due")) {
      candidates.push({
        claimType: "unpaid_past_due",
        amount: Math.max(
          0,
          Number(result.settlementDifference) || 0,
          Number(result.codDifference) || 0,
        ),
        description: `Payment is marked past due for order ${result.orderId}.`,
        recordIds: settlementRecordIds.length
          ? settlementRecordIds
          : codRecordIds,
        partnerType: settlementRecordIds.length ? "marketplace" : "courier",
        expectedAmount: null,
        actualAmount: null,
        difference: result.moneyAtRisk,
      });
    }

    // Return investigation. This remains a zero-value investigation claim.
    if (statuses.includes("return_not_received")) {
      candidates.push({
        claimType: "return_not_received",
        amount: 0,
        description: `Return for order ${result.orderId} has no warehouse receipt confirmation. Investigate before quantifying a recoverable amount.`,
        recordIds: returnRecordIds,
        partnerType: "other",
        expectedAmount: null,
        actualAmount: null,
        difference: null,
      });
    }

    for (const candidate of candidates) {
      const claimKey = getClaimKey(result.orderId, candidate.claimType);

      // Preserve existing claims, including recovered and open claims.
      if (existingClaimKeys.has(claimKey)) {
        skippedExistingClaims++;
        continue;
      }

      const partner = await getPartnerDetails(
        candidate.recordIds,
        workspaceId,
        candidate.partnerType,
      );

      const claimData = buildClaimData({
        run,
        result,
        partner,
        claimType: candidate.claimType,
        claimAmount: candidate.amount,
        description: candidate.description,
        evidence,
        expectedAmount: candidate.expectedAmount,
        actualAmount: candidate.actualAmount,
        difference: candidate.difference,
        createdBy: userId,
      });

      operations.push({
        updateOne: {
          filter: {
            workspaceId,
            reconciliationRunId: run._id,
            reconciliationResultId: result._id,
            claimType: candidate.claimType,
          },
          update: {
            $setOnInsert: claimData,
          },
          upsert: true,
        },
      });

      // Also prevent duplicate candidates during this generation run.
      existingClaimKeys.add(claimKey);
    }
  }

  if (!operations.length) {
    return {
      runId: String(run._id),
      claimsCreated: 0,
      claimsAlreadyExisted: skippedExistingClaims,
      message:
        skippedExistingClaims > 0
          ? "No new claims created. Existing claims were preserved."
          : "No claimable discrepancies were found.",
    };
  }

  const writeResult = await Claim.bulkWrite(operations, {
    ordered: false,
  });

  const claimsCreated = writeResult.upsertedCount || 0;

  return {
    runId: String(run._id),
    claimsCreated,
    claimsAlreadyExisted:
      skippedExistingClaims + operations.length - claimsCreated,
    message: "Claim generation completed. Existing claims were preserved.",
  };
}

export { generateClaimsForRun };
