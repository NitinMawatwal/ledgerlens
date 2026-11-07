import mongoose from "mongoose";

const reconciliationResultSchema = new mongoose.Schema(
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

    // Settlement amounts and separately tracked tax deductions.
    expectedSettlementAmount: {
      type: Number,
      default: null,
    },

    actualSettlementAmount: {
      type: Number,
      default: null,
    },

    settlementDifference: {
      type: Number,
      default: null,
    },

    tcsAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    tdsAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // COD remittance amounts.
    expectedCodAmount: {
      type: Number,
      default: null,
    },

    actualCodRemittedAmount: {
      type: Number,
      default: null,
    },

    codDifference: {
      type: Number,
      default: null,
    },

    // Courier freight amounts.
    expectedFreightAmount: {
      type: Number,
      default: null,
    },

    actualFreightAmount: {
      type: Number,
      default: null,
    },

    freightDifference: {
      type: Number,
      default: null,
    },

    rateCardVersion: {
      type: Number,
      default: null,
    },

    freightBreakdown: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // Return verification.
    returnStatus: {
      type: String,
      enum: ["not_applicable", "pending", "received", "not_received"],
      default: "not_applicable",
    },

    warehouseReceivedAt: {
      type: Date,
      default: null,
    },

    // Multiple issues can exist for one order.
    statuses: {
      type: [
        {
          type: String,
          enum: [
            "settled",
            "short_paid",
            "unpaid_past_due",
            "freight_overcharged",
            "return_not_received",
            "needs_review",
          ],
        },
      ],
      default: [],
    },

    moneyAtRisk: {
      type: Number,
      default: 0,
      min: 0,
    },

    reviewRequired: {
      type: Boolean,
      default: false,
      index: true,
    },

    reviewReason: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

reconciliationResultSchema.index(
  {
    workspaceId: 1,
    reconciliationRunId: 1,
    orderRecordId: 1,
  },
  { unique: true },
);

reconciliationResultSchema.index({
  workspaceId: 1,
  reconciliationRunId: 1,
  statuses: 1,
});

reconciliationResultSchema.index({
  workspaceId: 1,
  reviewRequired: 1,
});

reconciliationResultSchema.index({
  workspaceId: 1,
  orderId: 1,
});

const ReconciliationResult = mongoose.model(
  "ReconciliationResult",
  reconciliationResultSchema,
);

export default ReconciliationResult;
