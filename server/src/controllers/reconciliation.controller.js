import mongoose from "mongoose";

import ReconciliationRun from "../models/ReconciliationRun.js";
import ReconciliationResult from "../models/ReconciliationResult.js";
import { createReconciliationRun } from "../services/reconciliation-run.service.js";

export const startReconciliation = async (req, res, next) => {
  try {
    const { batchIds } = req.body;

    const result = await createReconciliationRun({
      workspaceId: req.user.workspaceId,
      userId: req.user.id,
      batchIds,
    });

    return res.status(201).json({
      success: true,
      message: "Reconciliation run completed successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getReconciliationResults = async (req, res, next) => {
  try {
    const { runId } = req.params;

    if (!mongoose.isValidObjectId(runId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid reconciliation run ID",
      });
    }

    const workspaceId = req.user.workspaceId;

    const run = await ReconciliationRun.findOne({
      _id: runId,
      workspaceId,
    }).lean();

    if (!run) {
      return res.status(404).json({
        success: false,
        message: "Reconciliation run not found",
      });
    }

    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const requestedLimit = Number.parseInt(req.query.limit, 10) || 50;
    const limit = Math.min(500, Math.max(1, requestedLimit));
    const skip = (page - 1) * limit;

    const filter = {
      workspaceId,
      reconciliationRunId: runId,
    };

    const [results, total] = await Promise.all([
      ReconciliationResult.find(filter)
        .select("-__v")
        .sort({ orderId: 1, _id: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      ReconciliationResult.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      message: "Reconciliation results retrieved successfully",
      data: {
        runId: run._id,
        summary: run.summary,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
        results,
      },
    });
  } catch (error) {
    next(error);
  }
};
