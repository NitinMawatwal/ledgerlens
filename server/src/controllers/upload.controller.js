import {
  createImportBatch,
  getWorkspaceImportBatches,
} from "../services/upload.service.js";

import { standardizeImportBatch } from "../services/standardization.service.js";

export const uploadFile = async (req, res) => {
  const importBatch = await createImportBatch({
    file: req.file,
    fileType: req.body.fileType,
    sourceName: req.body.sourceName,
    user: req.user,
  });

  const batchData = importBatch.toObject();
  delete batchData.filePath;

  res.status(201).json({
    success: true,
    message: "File uploaded successfully",
    data: {
      importBatch: batchData,
    },
  });
};

export const getUploads = async (req, res) => {
  const result = await getWorkspaceImportBatches({
    workspaceId: req.user.workspaceId,
    page: req.query.page,
    limit: req.query.limit,
  });

  res.status(200).json({
    success: true,
    data: result,
  });
};

export const standardizeUploadedFile = async (req, res) => {
  const result = await standardizeImportBatch({
    importBatchId: req.params.id,
    workspaceId: req.user.workspaceId,
  });

  const batch = result.importBatch;

  res.status(200).json({
    success: true,
    message: "File standardized successfully",
    data: {
      importBatch: {
        id: batch._id,
        originalName: batch.originalName,
        sourceName: batch.sourceName,
        fileType: batch.fileType,
        status: batch.status,
        standardizationStatus: batch.standardizationStatus,
        rowCount: batch.rowCount,
        activeMappingVersion: batch.activeMappingVersion,
        standardizationSummary: batch.standardizationSummary,
      },
      mappingVersion: result.mappingVersion,
      summary: result.summary,
    },
  });
};
