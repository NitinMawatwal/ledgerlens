import mongoose from "mongoose";

const reviewCaseSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },

    reconciliationRunId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ReconciliationRun",
      required: true,
    },

    reconciliationResultId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ReconciliationResult",
      required: true,
    },

    orderRecordId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ImportRecord",
      required: true,
    },

    orderId: {
      type: String,
      trim: true,
      default: null,
    },

    reviewType: {
      type: String,
      enum: [
        "missing_order_id",
        "suggested_match",
        "reconciliation_exception",
        "data_validation",
      ],
      required: true,
    },

    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },

    suggestedMatch: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "resolved"],
      default: "pending",
      index: true,
    },

    decisionNote: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null,
    },

    auditHistory: [
      {
        action: {
          type: String,
          required: true,
        },
        fromStatus: {
          type: String,
          default: null,
        },
        toStatus: {
          type: String,
          default: null,
        },
        note: {
          type: String,
          maxlength: 1000,
          default: null,
        },
        performedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        performedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    reviewedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

// One review case per order result and review type.
reviewCaseSchema.index(
  {
    workspaceId: 1,
    reconciliationRunId: 1,
    reconciliationResultId: 1,
    reviewType: 1,
  },
  { unique: true },
);

reviewCaseSchema.index({
  workspaceId: 1,
  status: 1,
  createdAt: -1,
});

const ReviewCase = mongoose.model("ReviewCase", reviewCaseSchema);

export default ReviewCase;
