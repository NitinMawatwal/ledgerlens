import {
  createColumnMapping,
  getColumnMappingVersions,
  rollbackColumnMapping,
  suggestColumnMapping,
} from "../services/column-mapping.service.js";

// Save approved column mapping
export const saveColumnMapping = async (req, res) => {
  const mapping = await createColumnMapping({
    importBatchId: req.body.importBatchId,
    mappings: req.body.mappings,
    workspaceId: req.user.workspaceId,
    userId: req.user.id,
  });

  res.status(201).json({
    success: true,
    message: "Column mapping saved successfully",
    data: {
      mapping,
    },
  });
};

// Get mapping history
export const getColumnMappings = async (req, res) => {
  const result = await getColumnMappingVersions({
    workspaceId: req.user.workspaceId,
    sourceKey: req.query.sourceKey,
    fileType: req.query.fileType,
  });

  res.status(200).json({
    success: true,
    data: result,
  });
};

// Roll back to an earlier mapping version
export const rollbackMapping = async (req, res) => {
  const mapping = await rollbackColumnMapping({
    mappingId: req.params.id,
    workspaceId: req.user.workspaceId,
    userId: req.user.id,
  });

  res.status(201).json({
    success: true,
    message: "Column mapping rolled back successfully",
    data: {
      mapping,
    },
  });
};

// Generate AI mapping suggestions (does not save anything)
export const suggestMapping = async (req, res) => {
  const result = await suggestColumnMapping({
    importBatchId: req.body.importBatchId,
    workspaceId: req.user.workspaceId,
  });

  res.status(200).json({
    success: true,
    message: "AI mapping suggestions generated successfully",
    data: result,
  });
};
