import mongoose from "mongoose";

import ReconciliationRun from "../models/ReconciliationRun.js";
import ReconciliationResult from "../models/ReconciliationResult.js";
import Claim from "../models/Claim.js";
import ImportRecord from "../models/ImportRecord.js";
import ImportBatch from "../models/ImportBatch.js";

const ACTIVE_CLAIM_STATUSES = ["open", "submitted", "accepted"];

const formatMoney = (value) => Number((value || 0).toFixed(2));

function getAgeBucket(createdAt) {
  const ageDays = Math.max(
    0,
    Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000),
  );

  if (ageDays <= 7) return "0-7 days";
  if (ageDays <= 15) return "8-15 days";
  if (ageDays <= 30) return "16-30 days";
  return "Over 30 days";
}

export const getDashboardSummary = async (req, res, next) => {
  try {
    const workspaceId = new mongoose.Types.ObjectId(req.user.workspaceId);

    // Use the latest successful reconciliation run.
    const latestRun = await ReconciliationRun.findOne({
      workspaceId,
      status: { $in: ["completed", "completed_with_errors"] },
    })
      .sort({ completedAt: -1, createdAt: -1 })
      .lean();

    const [activeClaimSummary, recoveredSummary, partnerSummary, ageClaims] =
      await Promise.all([
        Claim.aggregate([
          {
            $match: {
              workspaceId,
              status: { $in: ACTIVE_CLAIM_STATUSES },
            },
          },
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              amount: { $sum: "$claimAmount" },
            },
          },
        ]),

        Claim.aggregate([
          {
            $match: {
              workspaceId,
              status: "recovered",
            },
          },
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              amount: { $sum: "$recoveredAmount" },
            },
          },
        ]),

        Claim.aggregate([
          {
            $match: {
              workspaceId,
              status: { $in: ACTIVE_CLAIM_STATUSES },
            },
          },
          {
            $group: {
              _id: {
                partnerKey: "$partnerKey",
                partnerName: "$partnerName",
                partnerType: "$partnerType",
              },
              claimCount: { $sum: 1 },
              outstandingAmount: { $sum: "$claimAmount" },
              oldestClaimAt: { $min: "$createdAt" },
            },
          },
          {
            $project: {
              _id: 0,
              partnerKey: "$_id.partnerKey",
              partnerName: "$_id.partnerName",
              partnerType: "$_id.partnerType",
              claimCount: 1,
              outstandingAmount: 1,
              oldestClaimAt: 1,
            },
          },
          { $sort: { outstandingAmount: -1 } },
        ]),

        Claim.find({
          workspaceId,
          status: { $in: ACTIVE_CLAIM_STATUSES },
        })
          .select("claimAmount createdAt")
          .lean(),
      ]);

    const activeClaims = activeClaimSummary[0] || {
      count: 0,
      amount: 0,
    };

    const recoveredClaims = recoveredSummary[0] || {
      count: 0,
      amount: 0,
    };

    const ageBreakdown = {
      "0-7 days": 0,
      "8-15 days": 0,
      "16-30 days": 0,
      "Over 30 days": 0,
    };

    for (const claim of ageClaims) {
      const bucket = getAgeBucket(claim.createdAt);
      ageBreakdown[bucket] += claim.claimAmount || 0;
    }

    // Defaults for a workspace with no reconciliation yet.
    let reconciliation = {
      runId: null,
      completedAt: null,
      totalOrders: 0,
      matchedOrders: 0,
      unmatchedRecords: 0,
      matchRate: 0,
      settledOrders: 0,
      shortPaidOrders: 0,
      unpaidOrders: 0,
      freightOverchargedOrders: 0,
      returnsNotReceived: 0,
      moneyAtRisk: 0,
      tcsAmount: 0,
      tdsAmount: 0,
      exposureBreakdown: {
        shortPaid: 0,
        unpaid: 0,
        freightOvercharged: 0,
        other: 0,
      },
      recentDiscrepancies: [],
    };

    if (latestRun) {
      const summary = latestRun.summary || {};
      const totalOrders = summary.totalOrders || 0;
      const unmatchedRecords = summary.unmatchedRecords || 0;
      const matchedOrders = Math.max(0, totalOrders - unmatchedRecords);

      reconciliation = {
        ...reconciliation,
        runId: latestRun._id,
        completedAt: latestRun.completedAt,
        totalOrders,
        matchedOrders,
        unmatchedRecords,
        matchRate:
          totalOrders > 0
            ? Number(((matchedOrders / totalOrders) * 100).toFixed(1))
            : 0,
        settledOrders: summary.settledOrders || 0,
        shortPaidOrders: summary.shortPaidOrders || 0,
        unpaidOrders: summary.unpaidOrders || 0,
        freightOverchargedOrders: summary.freightOverchargedOrders || 0,
        returnsNotReceived: summary.returnsNotReceived || 0,
        moneyAtRisk: formatMoney(summary.totalMoneyAtRisk || 0),
      };

      const results = await ReconciliationResult.find({
        workspaceId,
        reconciliationRunId: latestRun._id,
      })
        .select(
          "orderId statuses moneyAtRisk settlementDifference codDifference freightDifference expectedSettlementAmount actualSettlementAmount expectedCodAmount actualCodRemittedAmount expectedFreightAmount actualFreightAmount tcsAmount tdsAmount settlementRecordIds codRecordIds freightRecordIds createdAt",
        )
        .sort({ createdAt: -1 })
        .lean();

      let tcsAmount = 0;
      let tdsAmount = 0;

      const exposureBreakdown = {
        shortPaid: 0,
        unpaid: 0,
        freightOvercharged: 0,
        other: 0,
      };

      const discrepancyResults = results.filter((result) =>
        (result.statuses || []).some((status) =>
          [
            "short_paid",
            "unpaid_past_due",
            "freight_overcharged",
            "needs_review",
          ].includes(status),
        ),
      );

      // Calculate each discrepancy category independently.
      // An order can have both a payment shortfall and a freight overcharge.
      for (const result of results) {
        tcsAmount += result.tcsAmount || 0;
        tdsAmount += result.tdsAmount || 0;

        const statuses = result.statuses || [];
        let remainingRisk = Math.max(0, Number(result.moneyAtRisk) || 0);

        // Payment shortfall: use settlement difference or COD difference.
        if (statuses.includes("short_paid")) {
          const settlementShortfall = Math.max(
            0,
            Number(result.settlementDifference) || 0,
          );

          const codShortfall = Math.max(0, Number(result.codDifference) || 0);

          const shortPaidAmount =
            settlementShortfall > 0 ? settlementShortfall : codShortfall;

          const allocated = Math.min(remainingRisk, shortPaidAmount);

          exposureBreakdown.shortPaid += allocated;
          remainingRisk -= allocated;
        }

        // Freight overcharge is counted separately.
        if (statuses.includes("freight_overcharged")) {
          const freightOvercharge = Math.max(
            0,
            Number(result.freightDifference) || 0,
          );

          const allocated = Math.min(remainingRisk, freightOvercharge);

          exposureBreakdown.freightOvercharged += allocated;
          remainingRisk -= allocated;
        }

        // Unpaid past-due exposure.
        if (statuses.includes("unpaid_past_due")) {
          exposureBreakdown.unpaid += remainingRisk;
          remainingRisk = 0;
        }

        // Any remaining unresolved exposure goes under Other.
        if (statuses.includes("needs_review")) {
          exposureBreakdown.other += remainingRisk;
        }
      }

      reconciliation.tcsAmount = formatMoney(tcsAmount);
      reconciliation.tdsAmount = formatMoney(tdsAmount);

      reconciliation.exposureBreakdown = Object.fromEntries(
        Object.entries(exposureBreakdown).map(([key, value]) => [
          key,
          formatMoney(value),
        ]),
      );

      // Fetch a small number of recent discrepancies and their source names.
      const recentResults = discrepancyResults.slice(0, 8);

      const recordIds = [
        ...new Set(
          recentResults.flatMap((result) =>
            [
              ...(result.settlementRecordIds || []),
              ...(result.codRecordIds || []),
              ...(result.freightRecordIds || []),
            ].map(String),
          ),
        ),
      ];

      const records = recordIds.length
        ? await ImportRecord.find({
            _id: { $in: recordIds },
            workspaceId,
          })
            .select("_id importBatchId")
            .lean()
        : [];

      const batchIds = [
        ...new Set(records.map((record) => String(record.importBatchId))),
      ];

      const batches = batchIds.length
        ? await ImportBatch.find({
            _id: { $in: batchIds },
            workspaceId,
          })
            .select("_id sourceName sourceKey fileType")
            .lean()
        : [];

      const recordMap = new Map(
        records.map((record) => [String(record._id), record]),
      );

      const batchMap = new Map(
        batches.map((batch) => [String(batch._id), batch]),
      );

      reconciliation.recentDiscrepancies = recentResults.map((result) => {
        const sourceIds = [
          ...(result.settlementRecordIds || []),
          ...(result.codRecordIds || []),
          ...(result.freightRecordIds || []),
        ];

        const sources = sourceIds
          .map((id) => recordMap.get(String(id)))
          .filter(Boolean)
          .map((record) => batchMap.get(String(record.importBatchId)))
          .filter(Boolean);

        const partnerNames = [
          ...new Set(sources.map((batch) => batch.sourceName)),
        ];

        const primaryStatus = [
          "unpaid_past_due",
          "short_paid",
          "freight_overcharged",
          "needs_review",
        ].find((status) => (result.statuses || []).includes(status));

        let expected = null;
        let actual = null;
        let difference = result.moneyAtRisk || 0;

        if (primaryStatus === "short_paid") {
          if (result.settlementDifference > 0) {
            expected = result.expectedSettlementAmount;
            actual = result.actualSettlementAmount;
            difference = result.settlementDifference;
          } else {
            expected = result.expectedCodAmount;
            actual = result.actualCodRemittedAmount;
            difference = result.codDifference;
          }
        } else if (primaryStatus === "freight_overcharged") {
          expected = result.expectedFreightAmount;
          actual = result.actualFreightAmount;
          difference = result.freightDifference;
        }

        return {
          orderId: result.orderId || "Order ID unavailable",
          partner: partnerNames.join(", ") || "Unspecified partner",
          status: primaryStatus || "needs_review",
          expected,
          actual,
          difference: formatMoney(Math.abs(difference || 0)),
          createdAt: result.createdAt,
        };
      });
    }

    return res.status(200).json({
      success: true,
      message: "Dashboard summary retrieved successfully.",
      data: {
        reconciliation,
        claims: {
          activeCount: activeClaims.count,
          outstandingAmount: formatMoney(activeClaims.amount),
          recoveredCount: recoveredClaims.count,
          recoveredAmount: formatMoney(recoveredClaims.amount),
          partners: partnerSummary.map((partner) => ({
            ...partner,
            outstandingAmount: formatMoney(partner.outstandingAmount),
          })),
          ageBreakdown: Object.fromEntries(
            Object.entries(ageBreakdown).map(([key, value]) => [
              key,
              formatMoney(value),
            ]),
          ),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};
