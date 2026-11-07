import mongoose from "mongoose";

const weightSlabSchema = new mongoose.Schema(
  {
    minWeight: {
      type: Number,
      required: true,
      min: 0,
    },

    maxWeight: {
      type: Number,
      required: true,
      min: 0,
    },

    baseCharge: {
      type: Number,
      required: true,
      min: 0,
    },

    additionalChargePerKg: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { _id: false },
);

const rateCardSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },

    courierName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    courierKey: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },

    channelName: {
      type: String,
      trim: true,
      default: null,
    },

    zone: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    weightSlabs: {
      type: [weightSlabSchema],
      required: true,
      validate: {
        validator(slabs) {
          if (!slabs.length) return false;

          const sorted = [...slabs].sort((a, b) => a.minWeight - b.minWeight);

          for (let i = 0; i < sorted.length; i += 1) {
            if (sorted[i].maxWeight <= sorted[i].minWeight) {
              return false;
            }

            if (i > 0 && sorted[i].minWeight < sorted[i - 1].maxWeight) {
              return false;
            }
          }

          return true;
        },
        message: "Weight slabs must be valid and must not overlap",
      },
    },

    codFee: {
      type: Number,
      default: 0,
      min: 0,
    },

    codFeePercentage: {
      type: Number,
      default: 0,
      min: 0,
    },

    rtoFee: {
      type: Number,
      default: 0,
      min: 0,
    },

    additionalCharges: {
      type: Number,
      default: 0,
      min: 0,
    },

    effectiveFrom: {
      type: Date,
      required: true,
    },

    effectiveTo: {
      type: Date,
      default: null,
    },

    version: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

// Find applicable rate cards for a courier, zone and date.
rateCardSchema.index({
  workspaceId: 1,
  courierKey: 1,
  zone: 1,
  isActive: 1,
  effectiveFrom: 1,
});

// Prevent duplicate versions for the same courier and zone.
rateCardSchema.index(
  {
    workspaceId: 1,
    courierKey: 1,
    zone: 1,
    version: 1,
  },
  { unique: true },
);

const RateCard = mongoose.model("RateCard", rateCardSchema);

export default RateCard;
