import mongoose from "mongoose";

import ReconciliationRun from "../models/ReconciliationRun.js";
import ReconciliationResult from "../models/ReconciliationResult.js";
import Claim from "../models/Claim.js";
import ImportRecord from "../models/ImportRecord.js";
import ImportBatch from "../models/ImportBatch.js";

const ACTIVE_CLAIM_STATUSES = ["open", "submitted", "accepted"];

const money = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(2)) : 0;
};

const numericValue = (value) => {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const parsed = Number(String(value).replace(/[₹,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const getAgeBucket = (createdAt) => {
  const ageDays = Math.max(
    0,
    Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000),
  );

  if (ageDays <= 7) return "0-7 days";
  if (ageDays <= 15) return "8-15 days";
  if (ageDays <= 30) return "16-30 days";

  return "Over 30 days";
};

const createAgeBreakdown = () => ({
  "0-7 days": 0,
  "8-15 days": 0,
  "16-30 days": 0,
  "Over 30 days": 0,
});

export const getAnalyticsSummary = async (req, res, next) => {
  try {
    const workspaceId = new mongoose.Types.ObjectId(req.user.workspaceId);

    const latestRun = await ReconciliationRun.findOne({
      workspaceId,
      status: {
        $in: ["completed", "completed_with_errors"],
      },
    })
      .sort({ completedAt: -1, createdAt: -1 })
      .lean();

    // Load active and recovered claims for this workspace only.
    const [activeClaims, recoveredClaims, recentRuns] = await Promise.all([
      Claim.find({
        workspaceId,
        status: { $in: ACTIVE_CLAIM_STATUSES },
      })
        .select(
          "partnerKey partnerName partnerType claimType claimAmount recoveredAmount createdAt status",
        )
        .lean(),

      Claim.find({
        workspaceId,
        status: "recovered",
      })
        .select("claimAmount recoveredAmount")
        .lean(),

      ReconciliationRun.find({
        workspaceId,
        status: {
          $in: ["completed", "completed_with_errors"],
        },
      })
        .select("summary completedAt createdAt status")
        .sort({ completedAt: -1, createdAt: -1 })
        .limit(6)
        .lean(),
    ]);

    // Outstanding claims grouped by partner and age.
    const partnerMap = new Map();
    const ageBreakdown = createAgeBreakdown();

    let outstandingAmount = 0;

    for (const claim of activeClaims) {
      const remaining = Math.max(
        0,
        numericValue(claim.claimAmount) - numericValue(claim.recoveredAmount),
      );

      outstandingAmount += remaining;

      const key = claim.partnerKey || "unknown";

      if (!partnerMap.has(key)) {
        partnerMap.set(key, {
          partnerKey: key,
          partnerName: claim.partnerName || "Unknown partner",
          partnerType: claim.partnerType || "other",
          claimCount: 0,
          outstandingAmount: 0,
          oldestClaimAt: claim.createdAt,
        });
      }

      const partner = partnerMap.get(key);

      partner.claimCount += 1;
      partner.outstandingAmount += remaining;

      if (new Date(claim.createdAt) < new Date(partner.oldestClaimAt)) {
        partner.oldestClaimAt = claim.createdAt;
      }

      const bucket = getAgeBucket(claim.createdAt);
      ageBreakdown[bucket] += remaining;
    }

    const partners = [...partnerMap.values()]
      .map((partner) => ({
        ...partner,
        outstandingAmount: money(partner.outstandingAmount),
      }))
      .sort((a, b) => b.outstandingAmount - a.outstandingAmount);

    const recoveredAmount = recoveredClaims.reduce(
      (total, claim) => total + numericValue(claim.recoveredAmount),
      0,
    );

    // Partner-wise TCS and TDS from settlement import records.
    const taxPartnerMap = new Map();

    if (latestRun) {
      const results = await ReconciliationResult.find({
        workspaceId,
        reconciliationRunId: latestRun._id,
      })
        .select("settlementRecordIds")
        .lean();

      const settlementRecordIds = [
        ...new Set(
          results.flatMap((result) =>
            (result.settlementRecordIds || []).map(String),
          ),
        ),
      ];

      if (settlementRecordIds.length > 0) {
        const settlementRecords = await ImportRecord.find({
          _id: { $in: settlementRecordIds },
          workspaceId,
        })
          .select("importBatchId standardizedData")
          .lean();

        const batchIds = [
          ...new Set(
            settlementRecords.map((record) => String(record.importBatchId)),
          ),
        ];

        const batches = await ImportBatch.find({
          _id: { $in: batchIds },
          workspaceId,
        })
          .select("_id sourceName sourceKey")
          .lean();

        const batchMap = new Map(
          batches.map((batch) => [String(batch._id), batch]),
        );

        for (const record of settlementRecords) {
          const batch = batchMap.get(String(record.importBatchId));

          const partnerKey =
            batch?.sourceKey ||
            batch?.sourceName?.trim().toLowerCase() ||
            "unknown";

          const partnerName = batch?.sourceName || "Unknown partner";

          if (!taxPartnerMap.has(partnerKey)) {
            taxPartnerMap.set(partnerKey, {
              partnerKey,
              partnerName,
              tcsAmount: 0,
              tdsAmount: 0,
            });
          }

          const partner = taxPartnerMap.get(partnerKey);
          const data = record.standardizedData || {};

          partner.tcsAmount += numericValue(data.tcs);
          partner.tdsAmount += numericValue(data.tds);
        }
      }
    }

    const taxPartners = [...taxPartnerMap.values()]
      .map((partner) => ({
        ...partner,
        tcsAmount: money(partner.tcsAmount),
        tdsAmount: money(partner.tdsAmount),
      }))
      .sort((a, b) => b.tcsAmount + b.tdsAmount - (a.tcsAmount + a.tdsAmount));

    const taxSummary = taxPartners.reduce(
      (total, partner) => ({
        tcsAmount: total.tcsAmount + partner.tcsAmount,
        tdsAmount: total.tdsAmount + partner.tdsAmount,
      }),
      {
        tcsAmount: 0,
        tdsAmount: 0,
      },
    );

    // Latest reconciliation performance.
    const summary = latestRun?.summary || {};

    const totalOrders = numericValue(summary.totalOrders);
    const unmatchedRecords = numericValue(summary.unmatchedRecords);

    const matchedOrders = Math.max(0, totalOrders - unmatchedRecords);

    const reconciliation = {
      runId: latestRun?._id || null,
      completedAt: latestRun?.completedAt || null,
      totalOrders,
      matchedOrders,
      unmatchedRecords,
      matchRate:
        totalOrders > 0 ? money((matchedOrders / totalOrders) * 100) : 0,
      settledOrders: numericValue(summary.settledOrders),
      shortPaidOrders: numericValue(summary.shortPaidOrders),
      unpaidOrders: numericValue(summary.unpaidOrders),
      freightOverchargedOrders: numericValue(summary.freightOverchargedOrders),
      returnsNotReceived: numericValue(summary.returnsNotReceived),
      moneyAtRisk: money(summary.totalMoneyAtRisk),
    };

    const performanceTrend = recentRuns
      .slice()
      .reverse()
      .map((run) => ({
        completedAt: run.completedAt || run.createdAt,
        totalOrders: numericValue(run.summary?.totalOrders),
        settledOrders: numericValue(run.summary?.settledOrders),
        shortPaidOrders: numericValue(run.summary?.shortPaidOrders),
        moneyAtRisk: money(run.summary?.totalMoneyAtRisk),
      }));

    return res.status(200).json({
      success: true,
      message: "Analytics retrieved successfully.",
      data: {
        reconciliation,
        claims: {
          activeCount: activeClaims.length,
          outstandingAmount: money(outstandingAmount),
          recoveredCount: recoveredClaims.length,
          recoveredAmount: money(recoveredAmount),
          partners,
          ageBreakdown: Object.fromEntries(
            Object.entries(ageBreakdown).map(([key, value]) => [
              key,
              money(value),
            ]),
          ),
        },
        taxes: {
          tcsAmount: money(taxSummary.tcsAmount),
          tdsAmount: money(taxSummary.tdsAmount),
          partners: taxPartners,
        },
        performanceTrend,
      },
    });
  } catch (error) {
    next(error);
  }
};
