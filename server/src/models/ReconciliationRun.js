import mongoose from "mongoose";

const reconciliationRunSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },

    startedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    status: {
      type: String,
      enum: [
        "pending",
        "processing",
        "completed",
        "completed_with_errors",
        "failed",
      ],
      default: "pending",
      index: true,
    },

    sourceBatchIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ImportBatch",
      },
    ],

    summary: {
      totalOrders: { type: Number, default: 0 },
      settledOrders: { type: Number, default: 0 },
      shortPaidOrders: { type: Number, default: 0 },
      unpaidOrders: { type: Number, default: 0 },
      freightOverchargedOrders: { type: Number, default: 0 },
      returnsNotReceived: { type: Number, default: 0 },
      unmatchedRecords: { type: Number, default: 0 },
      totalMoneyAtRisk: { type: Number, default: 0 },
    },

    errorMessage: {
      type: String,
      default: null,
    },

    startedAt: {
      type: Date,
      default: null,
    },

    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

reconciliationRunSchema.index({
  workspaceId: 1,
  createdAt: -1,
});

const ReconciliationRun = mongoose.model(
  "ReconciliationRun",
  reconciliationRunSchema,
);

export default ReconciliationRun;
