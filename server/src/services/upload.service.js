
import path from "path";
import { unlink } from "fs/promises";

import ImportBatch from "../models/ImportBatch.js";

const ALLOWED_FILE_TYPES = [
  "orders",
  "settlements",
  "cod",
  "freight",
  "returns",
];

const removeUploadedFile = async (filePath) => {
  if (!filePath) return;

  try {
    await unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error(
        "Failed to remove uploaded file:",
        error.message
      );
    }
  }
};

const normalizeSourceName = (sourceName) =>
  sourceName.trim().replace(/\s+/g, " ").toLowerCase();

export const createImportBatch = async ({
  file,
  fileType,
  sourceName,
  user,
}) => {
  if (!file) {
    const error = new Error("Please select a file to upload");
    error.status = 400;
    throw error;
  }

  if (!ALLOWED_FILE_TYPES.includes(fileType)) {
    await removeUploadedFile(file.path);

    const error = new Error(
      "Invalid file category. Choose orders, settlements, cod or returns"
    );

    error.status = 400;
    throw error;
  }

  if (
    typeof sourceName !== "string" ||
    !sourceName.trim() ||
    sourceName.trim().length > 100
  ) {
    await removeUploadedFile(file.path);

    const error = new Error(
      "Please provide a valid source name (maximum 100 characters)"
    );

    error.status = 400;
    throw error;
  }

  const extension = path.extname(file.originalname).toLowerCase();

  const fileFormat = extension === ".csv" ? "csv" : "xlsx";

  const safeOriginalName = path.basename(
    file.originalname.replace(/\\/g, "/")
  );

  const cleanSourceName = sourceName.trim().replace(/\s+/g, " ");

  try {
    const importBatch = new ImportBatch({
      workspaceId: user.workspaceId,
      uploadedBy: user.id,
      sourceName: cleanSourceName,
      sourceKey: normalizeSourceName(cleanSourceName),
      originalName: safeOriginalName,
      storedName: file.filename,
      filePath: file.path,
      fileType,
      fileFormat,
      fileSize: file.size,
      status: "uploaded",
    });

    await importBatch.save();

    return importBatch;
  } catch (error) {
    await removeUploadedFile(file.path);
    throw error;
  }
};

export const getWorkspaceImportBatches = async ({
  workspaceId,
  page = 1,
  limit = 20,
}) => {
  const safePage = Math.max(1, Number(page) || 1);

  const safeLimit = Math.min(
    100,
    Math.max(1, Number(limit) || 20)
  );

  const filter = { workspaceId };

  const [batches, total] = await Promise.all([
    ImportBatch.find(filter)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .select("-filePath")
      .lean(),

    ImportBatch.countDocuments(filter),
  ]);

  return {
    batches,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
    },
  };
};
