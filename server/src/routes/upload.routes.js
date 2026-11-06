import { Router } from "express";

import {
  uploadFile,
  getUploads,
  standardizeUploadedFile,
} from "../controllers/upload.controller.js";

import {
  parseUploadedFile,
  getParsedRecords,
} from "../controllers/file-parser.controller.js";

import { authenticate } from "../middleware/auth.middleware.js";
import { uploadSingleFile } from "../middleware/upload.middleware.js";

const router = Router();

router.post("/", authenticate, uploadSingleFile, uploadFile);
router.get("/", authenticate, getUploads);
router.post("/:id/parse", authenticate, parseUploadedFile);
router.get("/:id/records", authenticate, getParsedRecords);
router.post("/:id/standardize", authenticate, standardizeUploadedFile);

export default router;
