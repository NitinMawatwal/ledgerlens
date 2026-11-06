import ImportBatch from "../models/ImportBatch.js";
import ImportRecord from "../models/ImportRecord.js";
import ColumnMapping from "../models/ColumnMapping.js";

const UPDATE_BATCH_SIZE = 500;

const REQUIRED_FIELDS = {
  orders: ["orderAmount"],
  settlements: ["netAmount"],
  cod: ["remittedAmount"],
  freight: ["totalFreight"],
  returns: ["returnStatus"],
};

const createError = (message, status = 400) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const isEmptyValue = (value) =>
  value === null || value === undefined || String(value).trim() === "";

const standardizeRecord = (rawData, mappings, fileType) => {
  const standardizedData = {};
  const validationErrors = [];

  for (const [standardField, sourceHeader] of Object.entries(mappings)) {
    standardizedData[standardField] = rawData[sourceHeader] ?? null;
  }

  for (const requiredField of REQUIRED_FIELDS[fileType] || []) {
    if (isEmptyValue(standardizedData[requiredField])) {
      validationErrors.push(`Required field "${requiredField}" is missing`);
    }
  }

  return {
    standardizedData,
    validationErrors,
    status: validationErrors.length > 0 ? "failed" : "standardized",
  };
};

export const standardizeImportBatch = async ({
  importBatchId,
  workspaceId,
}) => {
  const existingBatch = await ImportBatch.findOne({
    _id: importBatchId,
    workspaceId,
  });

  if (!existingBatch) {
    throw createError("Import batch not found", 404);
  }

  if (existingBatch.status !== "parsed") {
    throw createError("File must be parsed before standardization", 409);
  }

  if (
    !["pending", "failed", "completed", "completed_with_errors"].includes(
      existingBatch.standardizationStatus,
    )
  ) {
    throw createError("This import is already being standardized", 409);
  }

  // Atomically claim the import for standardization.
  const importBatch = await ImportBatch.findOneAndUpdate(
    {
      _id: importBatchId,
      workspaceId,
      status: "parsed",
      $or: [
        {
          standardizationStatus: {
            $in: ["pending", "failed", "completed", "completed_with_errors"],
          },
        },
        {
          standardizationStatus: { $exists: false },
        },
      ],
    },
    {
      $set: {
        standardizationStatus: "processing",
      },
    },
    { new: true },
  );

  if (!importBatch) {
    throw createError("This import is already being standardized", 409);
  }

  try {
    if (!importBatch.sourceKey || importBatch.sourceKey === "unspecified") {
      throw createError("Import batch does not have a valid source name");
    }

    // Always use the currently active mapping.
    const mapping = await ColumnMapping.findOne({
      workspaceId,
      sourceKey: importBatch.sourceKey,
      fileType: importBatch.fileType,
      isActive: true,
    }).lean();

    if (!mapping) {
      throw createError(
        `No active column mapping found for ${importBatch.sourceName} ${importBatch.fileType}`,
        404,
      );
    }

    const mappingEntries = Object.entries(mapping.mappings || {});

    if (mappingEntries.length === 0) {
      throw createError("The active column mapping is empty");
    }

    let totalRows = 0;
    let standardizedRows = 0;
    let failedRows = 0;
    const errorSummary = [];

    const operations = [];

    const cursor = ImportRecord.find({
      workspaceId,
      importBatchId,
    })
      .select("_id rawData")
      .lean()
      .cursor();

    for await (const record of cursor) {
      totalRows += 1;

      const result = standardizeRecord(
        record.rawData,
        mapping.mappings,
        importBatch.fileType,
      );

      if (result.status === "standardized") {
        standardizedRows += 1;
      } else {
        failedRows += 1;

        if (errorSummary.length < 20) {
          errorSummary.push(
            `Row ${totalRows}: ${result.validationErrors.join(", ")}`,
          );
        }
      }

      operations.push({
        updateOne: {
          filter: {
            _id: record._id,
            workspaceId,
            importBatchId,
          },
          update: {
            $set: {
              standardizedData: result.standardizedData,
              mappingVersionId: mapping._id,
              mappingVersion: mapping.version,
              standardizationStatus: result.status,
              validationErrors: result.validationErrors,
            },
          },
        },
      });

      if (operations.length >= UPDATE_BATCH_SIZE) {
        await ImportRecord.bulkWrite(operations, {
          ordered: false,
        });

        operations.length = 0;
      }
    }

    if (operations.length > 0) {
      await ImportRecord.bulkWrite(operations, {
        ordered: false,
      });
    }

    if (totalRows === 0) {
      throw createError("No imported records were found", 400);
    }

    const finalStatus =
      failedRows === 0 ? "completed" : "completed_with_errors";

    const updatedBatch = await ImportBatch.findOneAndUpdate(
      {
        _id: importBatchId,
        workspaceId,
        standardizationStatus: "processing",
      },
      {
        $set: {
          standardizationStatus: finalStatus,
          activeMappingId: mapping._id,
          activeMappingVersion: mapping.version,
          standardizationSummary: {
            totalRows,
            standardizedRows,
            failedRows,
            errors: errorSummary,
          },
        },
      },
      { new: true },
    );

    if (!updatedBatch) {
      throw new Error("Unable to update standardization summary");
    }

    return {
      importBatch: updatedBatch,
      mappingVersion: mapping.version,
      summary: {
        totalRows,
        standardizedRows,
        failedRows,
        status: finalStatus,
        errors: errorSummary,
      },
    };
  } catch (error) {
    await ImportBatch.updateOne(
      {
        _id: importBatchId,
        workspaceId,
        standardizationStatus: "processing",
      },
      {
        $set: {
          standardizationStatus: "failed",
          "standardizationSummary.errors": [error.message],
        },
      },
    );

    throw error;
  }
};
