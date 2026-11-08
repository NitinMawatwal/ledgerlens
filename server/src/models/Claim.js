import mongoose from "mongoose";

const claimSchema = new mongoose.Schema(
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
      index: true,
    },

    partnerName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    partnerKey: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },

    partnerType: {
      type: String,
      enum: ["marketplace", "courier", "other"],
      default: "other",
    },

    claimType: {
      type: String,
      enum: [
        "short_paid",
        "unpaid_past_due",
        "freight_overcharged",
        "return_not_received",
      ],
      required: true,
    },

    claimAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    recoveredAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    currency: {
      type: String,
      default: "INR",
      immutable: true,
    },

    status: {
      type: String,
      enum: [
        "open",
        "submitted",
        "accepted",
        "rejected",
        "recovered",
        "closed",
      ],
      default: "open",
      index: true,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null,
    },

    evidence: {
      orderRecordIds: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "ImportRecord",
        },
      ],
      settlementRecordIds: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "ImportRecord",
        },
      ],
      codRecordIds: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "ImportRecord",
        },
      ],
      freightRecordIds: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "ImportRecord",
        },
      ],
      returnRecordIds: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "ImportRecord",
        },
      ],
      expectedAmount: { type: Number, default: null },
      actualAmount: { type: Number, default: null },
      difference: { type: Number, default: null },
      rateCardVersion: { type: Number, default: null },
      sourceBatchIds: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "ImportBatch",
        },
      ],
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

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

claimSchema.index(
  {
    workspaceId: 1,
    reconciliationRunId: 1,
    reconciliationResultId: 1,
    claimType: 1,
  },
  { unique: true },
);

claimSchema.index({
  workspaceId: 1,
  partnerKey: 1,
  status: 1,
  createdAt: -1,
});

claimSchema.index({
  workspaceId: 1,
  createdAt: -1,
});

const Claim = mongoose.model("Claim", claimSchema);

export default Claim;
