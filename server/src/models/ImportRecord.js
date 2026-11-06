
import mongoose from "mongoose";

const importRecordSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },

    importBatchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ImportBatch",
      required: true,
      index: true,
    },

    rowNumber: {
      type: Number,
      required: true,
    },

    // Original values exactly as extracted from the uploaded file.
    rawData: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    // Values transformed using the approved column mapping.
    standardizedData: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // Mapping version used to standardize this record.
    mappingVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ColumnMapping",
      default: null,
    },

    mappingVersion: {
      type: Number,
      default: null,
    },

    standardizationStatus: {
      type: String,
      enum: ["pending", "standardized", "failed"],
      default: "pending",
      index: true,
    },

    validationErrors: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

importRecordSchema.index(
  {
    workspaceId: 1,
    importBatchId: 1,
    rowNumber: 1,
  },
  { unique: true }
);

// Efficiently retrieve standardized records for an import.
importRecordSchema.index({
  workspaceId: 1,
  importBatchId: 1,
  standardizationStatus: 1,
});

const ImportRecord = mongoose.model(
  "ImportRecord",
  importRecordSchema
);

export default ImportRecord;
