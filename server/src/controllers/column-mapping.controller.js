import {
  createColumnMapping,
  getColumnMappingVersions,
  rollbackColumnMapping,
} from "../services/column-mapping.service.js";

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