import mongoose from "mongoose";

import ImportBatch from "../models/ImportBatch.js";
import ImportRecord from "../models/ImportRecord.js";
import ReconciliationRun from "../models/ReconciliationRun.js";
import ReconciliationResult from "../models/ReconciliationResult.js";

import { matchRecordsToOrders } from "./reconciliation.service.js";

import {
  calculateSettlement,
  calculateCOD,
  calculateReturnStatus,
  toAmount,
} from "./reconciliation-calculation.service.js";

import {
  calculateExpectedFreight,
  compareFreightAmounts,
} from "./rate-card-calculation.service.js";

import { findApplicableRateCards } from "./rate-card-lookup.service.js";

const SUPPORTED_BATCH_TYPES = [
  "orders",
  "settlements",
  "cod",
  "freight",
  "returns",
];

const roundAmount = (value) => Number(value.toFixed(2));

const isCodOrder = (orderData = {}) => {
  const method = String(orderData.paymentMethod || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ");

  return (
    method === "cod" ||
    method === "cash on delivery" ||
    method === "cashondelivery"
  );
};

const parseBoolean = (value) => {
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || value === null || value === undefined) {
    return false;
  }

  const normalized = String(value).trim().toLowerCase();

  if (["true", "yes", "1", "rto"].includes(normalized)) return true;
  if (["false", "no", "0", "forward"].includes(normalized)) return false;

  return null;
};

const sumCodCollected = (codRecords = []) => {
  if (codRecords.length === 0) return null;

  let total = 0;

  for (const record of codRecords) {
    const amount = toAmount(record.standardizedData?.codCollectedAmount);

    if (amount === null) return null;

    total += amount;
  }

  return roundAmount(total);
};

const calculateOrderFreight = ({
  freightRecords = [],
  rateCardsByRecordId = new Map(),
  codRecords = [],
}) => {
  if (freightRecords.length === 0) {
    return {
      expectedAmount: null,
      actualAmount: 0,
      difference: null,
      status: "not_evaluated",
      breakdown: [],
      rateCardVersions: [],
      reasons: [],
    };
  }

  let expectedTotal = 0;
  let actualTotal = 0;
  let totalDifference = 0;

  let hasCalculationFailure = false;
  let hasFreightOvercharge = false;
  let hasLowerFreight = false;

  const breakdown = [];
  const reasons = [];
  const rateCardVersions = new Set();

  const collectedCodAmount = sumCodCollected(codRecords);

  for (const record of freightRecords) {
    const data = record.standardizedData || {};
    const recordId = String(record._id);

    const rateCard = rateCardsByRecordId.get(recordId);

    const actualAmount = toAmount(data.totalFreight);

    const freightCodAmount =
      data.codAmount !== null &&
      data.codAmount !== undefined &&
      data.codAmount !== ""
        ? toAmount(data.codAmount)
        : null;

    const codAmount =
      freightCodAmount !== null && freightCodAmount > 0
        ? freightCodAmount
        : collectedCodAmount;

    const isRto = parseBoolean(data.isRto);

    if (actualAmount === null) {
      hasCalculationFailure = true;
      reasons.push(`Invalid freight amount for shipment ${recordId}`);

      breakdown.push({
        recordId,
        actualAmount: null,
        expectedAmount: null,
        difference: null,
        status: "needs_review",
        reason: "Invalid freight amount",
      });

      continue;
    }

    actualTotal += actualAmount;

    if (isRto === null) {
      hasCalculationFailure = true;
      reasons.push(`Invalid RTO indicator for shipment ${recordId}`);

      breakdown.push({
        recordId,
        actualAmount,
        expectedAmount: null,
        difference: null,
        status: "needs_review",
        reason: "Invalid RTO indicator",
      });

      continue;
    }

    const calculation = calculateExpectedFreight({
      billedWeight: data.billedWeight,
      zone: data.zone,
      courier: data.courier,
      shipmentDate: data.shipmentDate,
      codAmount,
      isRto,
      rateCard,
    });

    if (calculation.status !== "calculated") {
      hasCalculationFailure = true;

      const reason =
        calculation.reason || "Freight calculation requires review";

      reasons.push(reason);

      breakdown.push({
        recordId,
        actualAmount,
        expectedAmount: null,
        difference: null,
        status: "needs_review",
        reason,
      });

      continue;
    }

    const comparison = compareFreightAmounts(
      calculation.expectedAmount,
      actualAmount,
    );

    expectedTotal += calculation.expectedAmount;
    totalDifference += comparison.difference;

    rateCardVersions.add(calculation.rateCardVersion);

    if (comparison.status === "freight_overcharged") {
      hasFreightOvercharge = true;
    }

    if (comparison.status === "needs_review") {
      hasLowerFreight = true;
      reasons.push(comparison.reason);
    }

    breakdown.push({
      recordId,
      actualAmount,
      expectedAmount: calculation.expectedAmount,
      difference: comparison.difference,
      status: comparison.status,
      rateCardVersion: calculation.rateCardVersion,
      breakdown: calculation.breakdown,
    });
  }

  expectedTotal = roundAmount(expectedTotal);
  actualTotal = roundAmount(actualTotal);
  totalDifference = roundAmount(totalDifference);

  const status = hasFreightOvercharge
    ? "freight_overcharged"
    : hasCalculationFailure || hasLowerFreight
      ? "needs_review"
      : "settled";

  return {
    expectedAmount: hasCalculationFailure ? null : expectedTotal,
    actualAmount: actualTotal,
    difference: hasCalculationFailure ? null : totalDifference,
    status,
    needsReview: hasCalculationFailure || hasLowerFreight,
    breakdown,
    rateCardVersions: [...rateCardVersions],
    reasons,
  };
};

const createReconciliationRun = async ({ workspaceId, userId, batchIds }) => {
  if (!mongoose.Types.ObjectId.isValid(workspaceId)) {
    throw new Error("Invalid workspace ID");
  }

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid user ID");
  }

  if (!Array.isArray(batchIds) || batchIds.length === 0) {
    throw new Error("At least one import batch is required");
  }

  const uniqueBatchIds = [...new Set(batchIds.map(String))];

  for (const id of uniqueBatchIds) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new Error(`Invalid import batch ID: ${id}`);
    }
  }

  const batches = await ImportBatch.find({
    _id: { $in: uniqueBatchIds },
    workspaceId,
  }).lean();

  if (batches.length !== uniqueBatchIds.length) {
    throw new Error(
      "One or more import batches were not found in this workspace",
    );
  }

  const batchesByType = new Map();

  for (const batch of batches) {
    if (!SUPPORTED_BATCH_TYPES.includes(batch.fileType)) {
      throw new Error(`Unsupported batch type: ${batch.fileType}`);
    }

    if (batch.status !== "parsed") {
      throw new Error(
        `Batch ${batch.originalName} must be parsed before reconciliation`,
      );
    }

    if (!batchesByType.has(batch.fileType)) {
      batchesByType.set(batch.fileType, []);
    }

    batchesByType.get(batch.fileType).push(batch);
  }

  if (!batchesByType.has("orders")) {
    throw new Error("An orders batch is required");
  }

  const batchObjectIds = batches.map((batch) => batch._id);

  const records = await ImportRecord.find({
    workspaceId,
    importBatchId: { $in: batchObjectIds },
    standardizationStatus: "standardized",
  })
    .select("_id importBatchId standardizedData")
    .lean();

  const recordsByBatch = new Map();

  for (const record of records) {
    const key = String(record.importBatchId);

    if (!recordsByBatch.has(key)) {
      recordsByBatch.set(key, []);
    }

    recordsByBatch.get(key).push(record);
  }

  const getRecords = (type) => {
    const typeBatches = batchesByType.get(type) || [];

    return typeBatches.flatMap(
      (batch) => recordsByBatch.get(String(batch._id)) || [],
    );
  };

  const orders = getRecords("orders");
  const settlements = getRecords("settlements");
  const codRecords = getRecords("cod");
  const freightRecords = getRecords("freight");
  const returns = getRecords("returns");

  if (orders.length === 0) {
    throw new Error("The selected orders batches have no standardized records");
  }

  const matchedResults = matchRecordsToOrders({
    orders,
    settlements,
    codRecords,
    freightRecords,
    returns,
  });

  const unmatchedRecords = matchedResults.filter(
    (result) =>
      !result.matched.settlement &&
      !result.matched.cod &&
      !result.matched.freight &&
      !result.matched.returns,
  ).length;

  const run = await ReconciliationRun.create({
    workspaceId,
    startedBy: userId,
    sourceBatchIds: batchObjectIds,
    status: "processing",
    startedAt: new Date(),
    summary: {
      totalOrders: orders.length,
      settledOrders: 0,
      shortPaidOrders: 0,
      unpaidOrders: 0,
      freightOverchargedOrders: 0,
      returnsNotReceived: 0,
      unmatchedRecords,
      totalMoneyAtRisk: 0,
    },
  });

  try {
    const matchedFreightRecordIds = new Set(
      matchedResults.flatMap((result) => result.freightRecordIds.map(String)),
    );

    const matchedFreightRecords = freightRecords.filter((record) =>
      matchedFreightRecordIds.has(String(record._id)),
    );

    // One bulk lookup for all matched freight shipments.
    const rateCardsByRecordId = await findApplicableRateCards({
      workspaceId,
      freightRecords: matchedFreightRecords,
    });

    const recordsById = new Map(
      records.map((record) => [String(record._id), record]),
    );

    const summary = {
      totalOrders: orders.length,
      settledOrders: 0,
      shortPaidOrders: 0,
      unpaidOrders: 0,
      freightOverchargedOrders: 0,
      returnsNotReceived: 0,
      unmatchedRecords,
      totalMoneyAtRisk: 0,
    };

    const resultDocuments = matchedResults.map((result) => {
      const orderRecord = recordsById.get(String(result.orderRecordId));
      const orderData = orderRecord?.standardizedData || {};

      const matchedSettlements = result.settlementRecordIds
        .map((id) => recordsById.get(String(id)))
        .filter(Boolean);

      const matchedCodRecords = result.codRecordIds
        .map((id) => recordsById.get(String(id)))
        .filter(Boolean);

      const matchedFreightRecords = result.freightRecordIds
        .map((id) => recordsById.get(String(id)))
        .filter(Boolean);

      const matchedReturns = result.returnRecordIds
        .map((id) => recordsById.get(String(id)))
        .filter(Boolean);

      const statuses = new Set();
      const reviewReasons = [];

      let expectedSettlementAmount = null;
      let actualSettlementAmount = null;
      let settlementDifference = null;
      let tcsAmount = 0;
      let tdsAmount = 0;

      let expectedCodAmount = null;
      let actualCodRemittedAmount = null;
      let codDifference = null;

      let expectedFreightAmount = null;
      let actualFreightAmount = null;
      let freightDifference = null;
      let rateCardVersion = null;
      let freightBreakdown = null;

      let returnStatus = "not_applicable";
      let warehouseReceivedAt = null;

      let moneyAtRisk = 0;
      let paymentSettled = false;

      const codOrder = isCodOrder(orderData);
      const shouldReconcileCod = codOrder || matchedCodRecords.length > 0;

      // COD orders are reconciled against courier remittances.
      // Other orders are reconciled against marketplace settlements.
      if (shouldReconcileCod) {
        if (!batchesByType.has("cod") && matchedCodRecords.length === 0) {
          statuses.add("needs_review");
          reviewReasons.push(
            "COD batch was not included in this reconciliation",
          );
        } else {
          const codCalculation = calculateCOD(matchedCodRecords);

          expectedCodAmount = codCalculation.expectedAmount;
          actualCodRemittedAmount = codCalculation.actualAmount;
          codDifference = codCalculation.difference;

          if (codCalculation.status === "short_paid") {
            statuses.add("short_paid");
            moneyAtRisk += Math.max(0, codCalculation.difference || 0);
          } else if (codCalculation.status === "settled") {
            statuses.add("settled");
            paymentSettled = true;
          } else {
            statuses.add("needs_review");
            reviewReasons.push(
              codCalculation.reason || "COD reconciliation requires review",
            );
          }
        }
      } else if (
        batchesByType.has("settlements") ||
        matchedSettlements.length > 0
      ) {
        const settlementCalculation = calculateSettlement(matchedSettlements);

        expectedSettlementAmount = settlementCalculation.expectedAmount;
        actualSettlementAmount = settlementCalculation.actualAmount;
        settlementDifference = settlementCalculation.difference;
        tcsAmount = settlementCalculation.tcs ?? 0;
        tdsAmount = settlementCalculation.tds ?? 0;

        if (settlementCalculation.status === "short_paid") {
          statuses.add("short_paid");
          moneyAtRisk += Math.max(0, settlementCalculation.difference || 0);
        } else if (settlementCalculation.status === "settled") {
          statuses.add("settled");
          paymentSettled = true;
        } else {
          statuses.add("needs_review");
          reviewReasons.push(
            settlementCalculation.reason ||
              "Settlement reconciliation requires review",
          );
        }
      } else {
        statuses.add("needs_review");
        reviewReasons.push(
          "Settlement data was not included in this reconciliation",
        );
      }

      // Freight is calculated independently for each matched shipment.
      if (batchesByType.has("freight") || matchedFreightRecords.length > 0) {
        const freightCalculation = calculateOrderFreight({
          freightRecords: matchedFreightRecords,
          rateCardsByRecordId,
          codRecords: matchedCodRecords,
        });

        expectedFreightAmount = freightCalculation.expectedAmount;
        actualFreightAmount = freightCalculation.actualAmount;
        freightDifference = freightCalculation.difference;
        freightBreakdown = freightCalculation.breakdown;

        const versions = freightCalculation.rateCardVersions;

        rateCardVersion = versions.length === 1 ? versions[0] : null;

        if (freightCalculation.status === "freight_overcharged") {
          statuses.add("freight_overcharged");

          const validatedOvercharges = freightCalculation.breakdown
            .filter((item) => item.status === "freight_overcharged")
            .reduce(
              (total, item) => total + Math.max(0, item.difference || 0),
              0,
            );

          moneyAtRisk += validatedOvercharges;

          if (freightCalculation.needsReview) {
            statuses.add("needs_review");
            reviewReasons.push(...freightCalculation.reasons);
          }
        } else if (
          freightCalculation.status === "needs_review" ||
          freightCalculation.status === "not_evaluated"
        ) {
          statuses.add("needs_review");

          reviewReasons.push(
            ...(freightCalculation.reasons.length > 0
              ? freightCalculation.reasons
              : ["No matching freight records found"]),
          );
        }
      }

      // Returns and courier RTO are deliberately separate concepts.
      const returnCalculation = calculateReturnStatus(matchedReturns);

      returnStatus = returnCalculation.status;
      warehouseReceivedAt = returnCalculation.warehouseReceivedAt;

      if (returnStatus === "not_received") {
        statuses.add("return_not_received");
      }

      const finalStatuses = [...statuses];

      if (finalStatuses.length === 0) {
        finalStatuses.push("needs_review");
        reviewReasons.push("No reconciliation checks could be completed");
      }

      if (paymentSettled) {
        summary.settledOrders += 1;
      }

      if (finalStatuses.includes("short_paid")) {
        summary.shortPaidOrders += 1;
      }

      if (finalStatuses.includes("freight_overcharged")) {
        summary.freightOverchargedOrders += 1;
      }

      if (finalStatuses.includes("return_not_received")) {
        summary.returnsNotReceived += 1;
      }

      moneyAtRisk = roundAmount(moneyAtRisk);
      summary.totalMoneyAtRisk += moneyAtRisk;

      return {
        workspaceId,
        reconciliationRunId: run._id,
        orderRecordId: result.orderRecordId,
        orderId: result.orderId,

        settlementRecordIds: result.settlementRecordIds,
        codRecordIds: result.codRecordIds,
        freightRecordIds: result.freightRecordIds,
        returnRecordIds: result.returnRecordIds,

        expectedSettlementAmount,
        actualSettlementAmount,
        settlementDifference,
        tcsAmount,
        tdsAmount,

        expectedCodAmount,
        actualCodRemittedAmount,
        codDifference,

        expectedFreightAmount,
        actualFreightAmount,
        freightDifference,
        rateCardVersion,
        freightBreakdown,

        returnStatus,
        warehouseReceivedAt,

        statuses: finalStatuses,
        moneyAtRisk,
        reviewRequired: finalStatuses.includes("needs_review"),
        reviewReason:
          reviewReasons.length > 0
            ? [...new Set(reviewReasons)].join("; ")
            : null,
      };
    });

    summary.totalMoneyAtRisk = roundAmount(summary.totalMoneyAtRisk);

    if (resultDocuments.length > 0) {
      await ReconciliationResult.insertMany(resultDocuments, {
        ordered: true,
      });
    }

    const completedRun = await ReconciliationRun.findByIdAndUpdate(
      run._id,
      {
        status: "completed",
        summary,
        completedAt: new Date(),
      },
      { new: true },
    );

    return {
      run: completedRun,
      matchedOrderCount: matchedResults.length,
    };
  } catch (error) {
    await ReconciliationRun.findByIdAndUpdate(run._id, {
      status: "failed",
      errorMessage: error.message,
      completedAt: new Date(),
    });

    throw error;
  }
};

export { createReconciliationRun };
