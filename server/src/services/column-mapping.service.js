import mongoose from "mongoose";

import ColumnMapping from "../models/ColumnMapping.js";
import ImportBatch from "../models/ImportBatch.js";

const STANDARD_FIELDS = {
  orders: [
    "orderId",
    "orderDate",
    "channel",
    "customerId",
    "customerName",
    "productName",
    "sku",
    "quantity",
    "unitPrice",
    "orderAmount",
    "paymentMethod",
    "paymentStatus",
    "courier",
    "trackingId",
  ],

  settlements: [
    "orderId",
    "settlementId",
    "settlementDate",
    "grossAmount",
    "commission",
    "shippingFee",
    "otherFees",
    "refundAmount",
    "tcs",
    "tds",
    "netAmount",
    "paymentReference",
  ],

  cod: [
    "orderId",
    "trackingId",
    "remittanceDate",
    "codCollectedAmount",
    "remittedAmount",
    "deductions",
    "courier",
  ],

  freight: [
    "orderId",
    "trackingId",
    "invoiceNumber",
    "invoiceDate",
    "shipmentDate",
    "billedWeight",
    "zone",
    "freightCharge",
    "codFee",
    "rtoFee",
    "additionalCharges",
    "totalFreight",
    "courier",
    "isRto",
    "codAmount",
  ],

  returns: [
    "orderId",
    "trackingId",
    "returnDate",
    "returnStatus",
    "warehouseReceivedAt",
    "refundAmount",
  ],
};

const createError = (message, status = 400) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const validateMappings = (mappings, headers, fileType) => {
  if (!mappings || typeof mappings !== "object" || Array.isArray(mappings)) {
    throw createError("Mappings must be a valid object");
  }

  const allowedFields = STANDARD_FIELDS[fileType];

  if (!allowedFields) {
    throw createError("Unsupported file type");
  }

  const entries = Object.entries(mappings);

  if (entries.length === 0) {
    throw createError("Please map at least one column");
  }

  const usedHeaders = new Set();

  for (const [standardField, sourceHeader] of entries) {
    if (!allowedFields.includes(standardField)) {
      throw createError(`Invalid standard field: ${standardField}`);
    }

    if (typeof sourceHeader !== "string" || !headers.includes(sourceHeader)) {
      throw createError(
        `Invalid source column for ${standardField}: ${sourceHeader}`,
      );
    }

    if (usedHeaders.has(sourceHeader)) {
      throw createError(
        `Source column "${sourceHeader}" is mapped more than once`,
      );
    }

    usedHeaders.add(sourceHeader);
  }

  return mappings;
};

const createMappingVersion = async ({
  workspaceId,
  sourceName,
  sourceKey,
  fileType,
  mappings,
  sourceHeaders,
  createdBy,
  rollbackFromVersion = null,
}) => {
  const session = await mongoose.startSession();

  let savedMapping;

  try {
    await session.withTransaction(async () => {
      const latestMapping = await ColumnMapping.findOne({
        workspaceId,
        sourceKey,
        fileType,
      })
        .sort({ version: -1 })
        .session(session);

      const nextVersion = latestMapping ? latestMapping.version + 1 : 1;

      await ColumnMapping.updateMany(
        {
          workspaceId,
          sourceKey,
          fileType,
          isActive: true,
        },
        {
          $set: { isActive: false },
        },
        { session },
      );

      const [newMapping] = await ColumnMapping.create(
        [
          {
            workspaceId,
            sourceName,
            sourceKey,
            fileType,
            version: nextVersion,
            mappings,
            sourceHeaders,
            isActive: true,
            createdBy,
            rollbackFromVersion,
          },
        ],
        { session },
      );

      savedMapping = newMapping;
    });

    return savedMapping;
  } catch (error) {
    if (error.code === 11000) {
      throw createError(
        "Another mapping version was saved simultaneously. Please retry.",
        409,
      );
    }

    throw error;
  } finally {
    await session.endSession();
  }
};

export const createColumnMapping = async ({
  importBatchId,
  mappings,
  workspaceId,
  userId,
}) => {
  if (!mongoose.isValidObjectId(importBatchId)) {
    throw createError("Invalid import batch ID");
  }

  const importBatch = await ImportBatch.findOne({
    _id: importBatchId,
    workspaceId,
  });

  if (!importBatch) {
    throw createError("Import batch not found", 404);
  }

  if (importBatch.status !== "parsed") {
    throw createError(
      "The file must be parsed before creating a column mapping",
      409,
    );
  }

  if (!importBatch.sourceKey || importBatch.sourceKey === "unspecified") {
    throw createError("Import batch does not have a valid source name");
  }

  const validatedMappings = validateMappings(
    mappings,
    importBatch.detectedHeaders,
    importBatch.fileType,
  );

  return createMappingVersion({
    workspaceId,
    sourceName: importBatch.sourceName,
    sourceKey: importBatch.sourceKey,
    fileType: importBatch.fileType,
    mappings: validatedMappings,
    sourceHeaders: importBatch.detectedHeaders,
    createdBy: userId,
  });
};

export const getColumnMappingVersions = async ({
  workspaceId,
  sourceKey,
  fileType,
}) => {
  if (!sourceKey || !fileType) {
    throw createError("Both sourceKey and fileType are required");
  }

  if (!STANDARD_FIELDS[fileType]) {
    throw createError("Unsupported file type");
  }

  const versions = await ColumnMapping.find({
    workspaceId,
    sourceKey: sourceKey.trim().toLowerCase(),
    fileType,
  })
    .sort({ version: -1 })
    .select("-workspaceId")
    .lean();

  return {
    sourceKey: sourceKey.trim().toLowerCase(),
    fileType,
    activeMapping: versions.find((version) => version.isActive) || null,
    versions,
  };
};

export const rollbackColumnMapping = async ({
  mappingId,
  workspaceId,
  userId,
}) => {
  if (!mongoose.isValidObjectId(mappingId)) {
    throw createError("Invalid mapping ID");
  }

  const previousMapping = await ColumnMapping.findOne({
    _id: mappingId,
    workspaceId,
  });

  if (!previousMapping) {
    throw createError("Mapping version not found", 404);
  }

  if (previousMapping.isActive) {
    throw createError("This mapping version is already active");
  }

  return createMappingVersion({
    workspaceId,
    sourceName: previousMapping.sourceName,
    sourceKey: previousMapping.sourceKey,
    fileType: previousMapping.fileType,
    mappings: previousMapping.mappings,
    sourceHeaders: previousMapping.sourceHeaders,
    createdBy: userId,
    rollbackFromVersion: previousMapping.version,
  });
};

export { STANDARD_FIELDS };
