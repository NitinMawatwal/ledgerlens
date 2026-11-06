import mongoose from "mongoose";

const columnMappingSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },

    sourceName: {
      type: String,
      required: true,
      trim: true,
    },

    sourceKey: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },

    fileType: {
      type: String,
      enum: ["orders", "settlements", "cod", "freight", "returns"],
      required: true,
    },

    version: {
      type: Number,
      required: true,
      min: 1,
    },

    // Standard LedgerLens field -> original partner column
    mappings: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    sourceHeaders: {
      type: [String],
      default: [],
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    rollbackFromVersion: {
      type: Number,
      default: null,
    },
  },
  { timestamps: true }
);

// A source and file type cannot have duplicate version numbers.
columnMappingSchema.index(
  {
    workspaceId: 1,
    sourceKey: 1,
    fileType: 1,
    version: 1,
  },
  { unique: true }
);

// Efficiently retrieve the active mapping.
columnMappingSchema.index({
  workspaceId: 1,
  sourceKey: 1,
  fileType: 1,
  isActive: 1,
});

const ColumnMapping = mongoose.model(
  "ColumnMapping",
  columnMappingSchema
);

export default ColumnMapping;