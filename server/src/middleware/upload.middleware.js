
import multer from "multer";
import path from "path";
import { randomUUID } from "crypto";
import { mkdirSync } from "fs";
import { fileURLToPath } from "url";

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);

const uploadDirectory = path.resolve(
  currentDirectory,
  "../../uploads"
);

// Ensure the upload directory exists.
mkdirSync(uploadDirectory, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, callback) => {
    callback(null, uploadDirectory);
  },

  filename: (req, file, callback) => {
    const extension = path
      .extname(file.originalname)
      .toLowerCase();

    callback(null, `${randomUUID()}${extension}`);
  },
});

const allowedMimeTypes = {
  ".csv": [
    "text/csv",
    "application/csv",
    "application/vnd.ms-excel",
    "text/plain",
  ],
  ".xlsx": [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],
};

const fileFilter = (req, file, callback) => {
  const extension = path
    .extname(file.originalname)
    .toLowerCase();

  const allowedTypes = allowedMimeTypes[extension];

  if (!allowedTypes) {
    const error = new Error(
      "Only CSV and XLSX files are supported"
    );

    error.status = 400;
    return callback(error);
  }

  if (!allowedTypes.includes(file.mimetype)) {
    const error = new Error(
      "File type does not match the supported format"
    );

    error.status = 400;
    return callback(error);
  }

  callback(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
  },
});

export const uploadSingleFile = (req, res, next) => {
  upload.single("file")(req, res, (error) => {
    if (error) {
      if (error instanceof multer.MulterError) {
        error.status = 400;

        if (error.code === "LIMIT_FILE_SIZE") {
          error.message = "File size must not exceed 10 MB";
        }

        if (error.code === "LIMIT_UNEXPECTED_FILE") {
          error.message = "Only one file can be uploaded at a time";
        }
      }

      next(error);
      return;
    }

    next();
  });
};

export default upload;
