import mongoose from "mongoose";
import ExcelJS from "exceljs";
import Claim from "../models/Claim.js";
import ReviewCase from "../models/ReviewCase.js";
import ImportRecord from "../models/ImportRecord.js";
import ImportBatch from "../models/ImportBatch.js";
import { generateClaimsForRun } from "../services/claim-generation.service.js";
import { generateReviewCasesForRun } from "../services/review-case-generation.service.js";

async function generateClaims(req, res, next) {
  try {
    const { runId } = req.params;

    if (!mongoose.isValidObjectId(runId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid reconciliation run ID.",
      });
    }

    const result = await generateClaimsForRun({
      runId,
      workspaceId: req.user.workspaceId,
      userId: req.user.id,
    });

    return res.status(201).json({
      success: true,
      message: result.message,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

async function listClaims(req, res, next) {
  try {
    const {
      status,
      claimType,
      partnerKey,
      age,
      page = 1,
      limit = 20,
    } = req.query;

    const allowedStatuses = [
      "open",
      "submitted",
      "accepted",
      "rejected",
      "recovered",
      "closed",
    ];

    const allowedTypes = [
      "short_paid",
      "unpaid_past_due",
      "freight_overcharged",
      "return_not_received",
    ];

    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid claim status.",
      });
    }

    if (claimType && !allowedTypes.includes(claimType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid claim type.",
      });
    }

    const pageNumber = Math.max(1, Number.parseInt(page, 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Number.parseInt(limit, 10) || 20),
    );

    const filter = { workspaceId: req.user.workspaceId };

    if (status) filter.status = status;
    if (claimType) filter.claimType = claimType;
    if (partnerKey) filter.partnerKey = partnerKey;

    if (age !== undefined) {
      const ageDays = Number(age);

      if (!Number.isFinite(ageDays) || ageDays < 0) {
        return res.status(400).json({
          success: false,
          message: "Age must be a non-negative number of days.",
        });
      }

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - ageDays);
      filter.createdAt = { $lte: cutoffDate };
    }

    const [claims, total] = await Promise.all([
      Claim.find(filter)
        .select("-__v")
        .sort({ createdAt: -1 })
        .skip((pageNumber - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      Claim.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        claims,
        pagination: {
          total,
          page: pageNumber,
          limit: pageSize,
          totalPages: Math.ceil(total / pageSize),
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

async function getClaimsByPartner(req, res, next) {
  try {
    const workspaceId = new mongoose.Types.ObjectId(req.user.workspaceId);

    const partners = await Claim.aggregate([
      { $match: { workspaceId } },
      {
        $group: {
          _id: {
            partnerKey: "$partnerKey",
            partnerName: "$partnerName",
            partnerType: "$partnerType",
          },
          totalClaims: { $sum: 1 },
          totalClaimAmount: { $sum: "$claimAmount" },
          activeClaims: {
            $sum: {
              $cond: [
                { $in: ["$status", ["open", "submitted", "accepted"]] },
                1,
                0,
              ],
            },
          },

          activeClaimAmount: {
            $sum: {
              $cond: [
                { $in: ["$status", ["open", "submitted", "accepted"]] },
                "$claimAmount",
                0,
              ],
            },
          },

          recoveredAmount: {
            $sum: {
              $cond: [{ $eq: ["$status", "recovered"] }, "$recoveredAmount", 0],
            },
          },
          oldestClaimAt: { $min: "$createdAt" },
        },
      },
      {
        $project: {
          _id: 0,
          partnerKey: "$_id.partnerKey",
          partnerName: "$_id.partnerName",
          partnerType: "$_id.partnerType",
          totalClaims: 1,
          totalClaimAmount: 1,
          activeClaims: 1,
          activeClaimAmount: 1,
          recoveredAmount: 1,
          oldestClaimAt: 1,
        },
      },
      { $sort: { activeClaimAmount: -1, totalClaims: -1 } },
    ]);

    return res.status(200).json({
      success: true,
      data: { partners },
    });
  } catch (error) {
    next(error);
  }
}

function sanitizeEvidence(value) {
  const sensitiveFields = new Set([
    "name",
    "customername",
    "fullname",
    "customerid",
    "phone",
    "mobile",
    "email",
    "address",
    "shippingaddress",
    "billingaddress",
  ]);

  if (Array.isArray(value)) {
    return value.map(sanitizeEvidence);
  }

  if (value && typeof value === "object") {
    const sanitized = {};

    for (const [key, nestedValue] of Object.entries(value)) {
      const normalizedKey = key.toLowerCase().replace(/[_\s-]/g, "");

      if (sensitiveFields.has(normalizedKey)) continue;

      sanitized[key] = sanitizeEvidence(nestedValue);
    }

    return sanitized;
  }

  return value;
}

async function exportClaimEvidence(req, res, next) {
  try {
    const { claimId } = req.params;

    if (!mongoose.isValidObjectId(claimId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid claim ID.",
      });
    }

    const claim = await Claim.findOne({
      _id: claimId,
      workspaceId: req.user.workspaceId,
    }).lean();

    if (!claim) {
      return res.status(404).json({
        success: false,
        message: "Claim not found.",
      });
    }

    const evidence = claim.evidence || {};

    const recordGroups = [
      { sourceType: "order", ids: evidence.orderRecordIds || [] },
      { sourceType: "settlement", ids: evidence.settlementRecordIds || [] },
      { sourceType: "COD", ids: evidence.codRecordIds || [] },
      { sourceType: "freight", ids: evidence.freightRecordIds || [] },
      { sourceType: "return", ids: evidence.returnRecordIds || [] },
    ];

    const allRecordIds = [
      ...new Set(recordGroups.flatMap((group) => group.ids.map(String))),
    ];

    const records = allRecordIds.length
      ? await ImportRecord.find({
          _id: { $in: allRecordIds },
          workspaceId: req.user.workspaceId,
        })
          .select("_id importBatchId rowNumber standardizedData")
          .lean()
      : [];

    const batchIds = [
      ...new Set(
        records.map((record) => String(record.importBatchId)).filter(Boolean),
      ),
    ];

    const batches = batchIds.length
      ? await ImportBatch.find({
          _id: { $in: batchIds },
          workspaceId: req.user.workspaceId,
        })
          .select("_id sourceName sourceKey fileType originalName")
          .lean()
      : [];

    const batchMap = new Map(
      batches.map((batch) => [String(batch._id), batch]),
    );

    const recordTypeMap = new Map();

    for (const group of recordGroups) {
      for (const id of group.ids) {
        recordTypeMap.set(String(id), group.sourceType);
      }
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "LedgerLens";
    workbook.created = new Date();

    const summarySheet = workbook.addWorksheet("Claim Summary");

    summarySheet.columns = [
      { header: "Field", key: "field", width: 28 },
      { header: "Value", key: "value", width: 55 },
    ];

    summarySheet.addRows([
      { field: "Claim ID", value: String(claim._id) },
      { field: "Order ID", value: claim.orderId || "" },
      { field: "Partner", value: claim.partnerName || "" },
      { field: "Partner Key", value: claim.partnerKey || "" },
      { field: "Partner Type", value: claim.partnerType || "" },
      { field: "Claim Type", value: claim.claimType },
      { field: "Claim Amount", value: claim.claimAmount },
      { field: "Currency", value: claim.currency || "INR" },
      { field: "Status", value: claim.status },
      { field: "Description", value: claim.description || "" },
      { field: "Expected Amount", value: evidence.expectedAmount ?? "" },
      { field: "Actual Amount", value: evidence.actualAmount ?? "" },
      { field: "Difference", value: evidence.difference ?? "" },
      { field: "Rate Card Version", value: evidence.rateCardVersion ?? "" },
      { field: "Created At", value: claim.createdAt || "" },
    ]);

    const evidenceSheet = workbook.addWorksheet("Source Evidence");

    evidenceSheet.columns = [
      { header: "Source Type", key: "sourceType", width: 18 },
      { header: "Partner / Source", key: "sourceName", width: 28 },
      { header: "File Name", key: "fileName", width: 32 },
      { header: "Source Row", key: "rowNumber", width: 14 },
      { header: "Record ID", key: "recordId", width: 28 },
      { header: "Standardized Data", key: "standardizedData", width: 80 },
    ];

    for (const record of records) {
      const batch = batchMap.get(String(record.importBatchId));
      const safeData = sanitizeEvidence(record.standardizedData || {});

      evidenceSheet.addRow({
        sourceType: recordTypeMap.get(String(record._id)) || "source",
        sourceName: batch?.sourceName || batch?.sourceKey || "",
        fileName: batch?.originalName || "",
        rowNumber: record.rowNumber,
        recordId: String(record._id),
        standardizedData: JSON.stringify(safeData),
      });
    }

    for (const sheet of [summarySheet, evidenceSheet]) {
      sheet.getRow(1).font = { bold: true };
      sheet.views = [{ state: "frozen", ySplit: 1 }];
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const safeOrderId = String(claim.orderId || claim._id).replace(
      /[^a-zA-Z0-9_-]/g,
      "_",
    );

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="ledgerlens-claim-${safeOrderId}-evidence.xlsx"`,
    );

    return res.status(200).send(Buffer.from(buffer));
  } catch (error) {
    next(error);
  }
}

async function listReviewCases(req, res, next) {
  try {
    const { status = "pending", reviewType, page = 1, limit = 20 } = req.query;

    const allowedStatuses = ["pending", "approved", "rejected", "resolved"];
    const allowedTypes = [
      "missing_order_id",
      "suggested_match",
      "reconciliation_exception",
      "data_validation",
    ];

    if (status !== "all" && !allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid review status.",
      });
    }

    if (reviewType && !allowedTypes.includes(reviewType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid review type.",
      });
    }

    const pageNumber = Math.max(1, Number.parseInt(page, 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Number.parseInt(limit, 10) || 20),
    );

    const filter = {
      workspaceId: req.user.workspaceId,
    };

    if (status !== "all") filter.status = status;
    if (reviewType) filter.reviewType = reviewType;

    const [cases, total] = await Promise.all([
      ReviewCase.find(filter)
        .sort({ createdAt: -1 })
        .skip((pageNumber - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      ReviewCase.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        cases,
        pagination: {
          total,
          page: pageNumber,
          limit: pageSize,
          totalPages: Math.ceil(total / pageSize),
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

async function decideReviewCase(req, res, next) {
  try {
    const { reviewId } = req.params;
    const { decision, note } = req.body;

    if (!mongoose.isValidObjectId(reviewId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid review case ID.",
      });
    }

    const allowedDecisions = ["approved", "rejected", "resolved"];

    if (!allowedDecisions.includes(decision)) {
      return res.status(400).json({
        success: false,
        message: "Decision must be approved, rejected, or resolved.",
      });
    }

    if (typeof note !== "string" || !note.trim()) {
      return res.status(400).json({
        success: false,
        message: "A decision note is required.",
      });
    }

    const reviewCase = await ReviewCase.findOne({
      _id: reviewId,
      workspaceId: req.user.workspaceId,
    });

    if (!reviewCase) {
      return res.status(404).json({
        success: false,
        message: "Review case not found.",
      });
    }

    if (reviewCase.status !== "pending") {
      return res.status(409).json({
        success: false,
        message: "Only pending review cases can receive a decision.",
      });
    }

    const previousStatus = reviewCase.status;
    const now = new Date();

    reviewCase.status = decision;
    reviewCase.decisionNote = note.trim();
    reviewCase.reviewedBy = req.user.id;
    reviewCase.reviewedAt = now;

    reviewCase.auditHistory.push({
      action: "human_decision",
      fromStatus: previousStatus,
      toStatus: decision,
      note: note.trim(),
      performedBy: req.user.id,
      performedAt: now,
    });

    await reviewCase.save();

    return res.status(200).json({
      success: true,
      message: `Review case ${decision}.`,
      data: { reviewCase },
    });
  } catch (error) {
    next(error);
  }
}

async function updateClaimStatus(req, res, next) {
  try {
    const { claimId } = req.params;
    const { status, note, recoveredAmount } = req.body;

    if (!mongoose.isValidObjectId(claimId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid claim ID.",
      });
    }

    const allowedTransitions = {
      open: ["submitted", "closed"],
      submitted: ["accepted", "rejected", "closed"],
      accepted: ["recovered", "closed"],
      rejected: ["closed"],
      recovered: ["closed"],
      closed: [],
    };

    const allowedStatuses = [
      "open",
      "submitted",
      "accepted",
      "rejected",
      "recovered",
      "closed",
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid claim status.",
      });
    }

    if (typeof note !== "string" || !note.trim()) {
      return res.status(400).json({
        success: false,
        message: "A status update note is required.",
      });
    }

    const claim = await Claim.findOne({
      _id: claimId,
      workspaceId: req.user.workspaceId,
    });

    if (!claim) {
      return res.status(404).json({
        success: false,
        message: "Claim not found.",
      });
    }

    const previousStatus = claim.status;
    const permittedStatuses = allowedTransitions[previousStatus] || [];

    if (!permittedStatuses.includes(status)) {
      return res.status(409).json({
        success: false,
        message: `Claim cannot transition from ${previousStatus} to ${status}.`,
      });
    }

    if (status === "recovered") {
      const amount = Number(recoveredAmount);

      if (
        recoveredAmount === undefined ||
        !Number.isFinite(amount) ||
        amount <= 0 ||
        amount > claim.claimAmount
      ) {
        return res.status(400).json({
          success: false,
          message:
            "A recovered amount greater than zero and not exceeding the claim amount is required.",
        });
      }

      claim.recoveredAmount = amount;
    } else if (recoveredAmount !== undefined) {
      return res.status(400).json({
        success: false,
        message:
          "Recovered amount can only be provided when marking a claim as recovered.",
      });
    }

    const now = new Date();

    claim.status = status;
    claim.updatedBy = req.user.id;

    claim.auditHistory.push({
      action: "status_changed",
      fromStatus: previousStatus,
      toStatus: status,
      note: note.trim(),
      performedBy: req.user.id,
      performedAt: now,
    });

    await claim.save();

    return res.status(200).json({
      success: true,
      message: `Claim status updated to ${status}.`,
      data: { claim },
    });
  } catch (error) {
    next(error);
  }
}

async function generateReviewCases(req, res, next) {
  try {
    const { runId } = req.params;

    if (!mongoose.isValidObjectId(runId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid reconciliation run ID.",
      });
    }

    const result = await generateReviewCasesForRun({
      runId,
      workspaceId: req.user.workspaceId,
      userId: req.user.id,
    });

    return res.status(201).json({
      success: true,
      message: result.message,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export {
  generateClaims,
  listClaims,
  getClaimsByPartner,
  exportClaimEvidence,
  listReviewCases,
  decideReviewCase,
  generateReviewCases,
  updateClaimStatus,
};
