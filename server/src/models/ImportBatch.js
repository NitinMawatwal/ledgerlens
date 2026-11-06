
import mongoose from "mongoose";

const importBatchSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },

    standardizationStatus: {
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

    standardizationSummary: {
      totalRows: { type: Number, default: 0 },
      standardizedRows: { type: Number, default: 0 },
      failedRows: { type: Number, default: 0 },
      errors: { type: [String], default: [] },
    },

    activeMappingVersion: {
      type: Number,
      default: null,
    },

    activeMappingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ColumnMapping",
      default: null,
    },

    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    sourceName: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "Unspecified",
    },
    
    sourceKey: {
      type: String,
      trim: true,
      lowercase: true,
      default: "unspecified",
      index: true,
    },

    originalName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },

    storedName: {
      type: String,
      required: true,
      unique: true,
    },

    filePath: {
      type: String,
      required: true,
    },

    fileType: {
      type: String,
      enum: ["orders", "settlements", "cod","freight", "returns"],
      required: true,
    },

    fileFormat: {
      type: String,
      enum: ["csv", "xlsx"],
      required: true,
    },

    fileSize: {
      type: Number,
      required: true,
      min: 1,
    },

    status: {
      type: String,
      enum: [
        "uploaded",
        "parsing",
        "parsed",
        "mapping_required",
        "ready",
        "failed",
      ],
      default: "uploaded",
    },

    detectedHeaders: {
      type: [String],
      default: [],
    },

    rowCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    columnMapping: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    validationSummary: {
      totalRows: {
        type: Number,
        default: 0,
      },
      validRows: {
        type: Number,
        default: 0,
      },
      invalidRows: {
        type: Number,
        default: 0,
      },
      errors: {
        type: [String],
        default: [],
      },
    },
  },
  {
    timestamps: true,
  }
);

importBatchSchema.index({
  workspaceId: 1,
  createdAt: -1,
});

importBatchSchema.index({
  workspaceId: 1,
  status: 1,
});

const ImportBatch = mongoose.model(
  "ImportBatch",
  importBatchSchema
);

export default ImportBatch;
