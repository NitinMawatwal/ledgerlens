import mongoose from "mongoose";

import {
  parseImportFile,
  getImportRecords,
} from "../services/file-parser.service.js";

// Remove unnecessary customer-identifying information
// from API responses without modifying database records.
const sanitizeRecordData = (data) => {
  if (!data || typeof data !== "object") {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(sanitizeRecordData);
  }

  return Object.fromEntries(
    Object.entries(data)
      .filter(([key]) => {
        const normalizedKey = key
          .replace(/([a-z])([A-Z])/g, "$1_$2")
          .toLowerCase();

        return !(
          /^(customer|buyer|recipient|consignee|contact)_(name|id)$/.test(
            normalizedKey,
          ) ||
          /^(full_name|name)$/.test(normalizedKey) ||
          /(phone|mobile|email|address)/.test(normalizedKey)
        );
      })
      .map(([key, value]) => [key, sanitizeRecordData(value)]),
  );
};

export const parseUploadedFile = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid import batch ID",
    });
  }

  const result = await parseImportFile({
    importBatchId: id,
    workspaceId: req.user.workspaceId,
  });

  res.status(200).json({
    success: true,
    message: "File parsed successfully",
    data: {
      importBatch: {
        id: result.importBatch._id,
        originalName: result.importBatch.originalName,
        fileType: result.importBatch.fileType,
        fileFormat: result.importBatch.fileFormat,
        status: result.importBatch.status,
        detectedHeaders: result.detectedHeaders,
        rowCount: result.rowCount,
      },
    },
  });
};

export const getParsedRecords = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid import batch ID",
    });
  }

  const result = await getImportRecords({
    importBatchId: id,
    workspaceId: req.user.workspaceId,
    page: req.query.page,
    limit: req.query.limit,
  });

  const sanitizedRecords = result.records.map((record) => ({
    ...record,
    rawData: sanitizeRecordData(record.rawData),
    standardizedData: sanitizeRecordData(record.standardizedData),
  }));

  res.status(200).json({
    success: true,
    data: {
      ...result,
      records: sanitizedRecords,
    },
  });
};
