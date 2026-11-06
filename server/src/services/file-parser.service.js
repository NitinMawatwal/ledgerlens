
import mongoose from "mongoose";
import path from "path";
import { parse as parseCsv } from "csv-parse/sync";
import ExcelJS from "exceljs";

import ImportBatch from "../models/ImportBatch.js";
import ImportRecord from "../models/ImportRecord.js";

const INSERT_BATCH_SIZE = 500;

const createUniqueHeaders = (headerRow) => {
  const usedHeaders = new Map();

  return headerRow.map((value, index) => {
    let header = String(value ?? "").trim();

    if (!header) {
      header = `column_${index + 1}`;
    }

    const normalized = header.toLowerCase();
    const count = usedHeaders.get(normalized) || 0;

    usedHeaders.set(normalized, count + 1);

    if (count > 0) {
      header = `${header}_${count + 1}`;
    }

    return header;
  });
};

const normalizeCellValue = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "object") {
    if ("result" in value) {
      return normalizeCellValue(value.result);
    }

    if ("text" in value) {
      return String(value.text);
    }

    if (Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("");
    }

    return JSON.stringify(value);
  }

  return value;
};

const isEmptyRow = (row) =>
  row.every(
    (value) =>
      value === null ||
      value === undefined ||
      String(value).trim() === ""
  );

const buildRecords = (headers, rows) => {
  const records = [];

  rows.forEach((row, index) => {
    if (isEmptyRow(row)) return;

    const rawData = {};

    headers.forEach((header, columnIndex) => {
      rawData[header] = normalizeCellValue(
        row[columnIndex]
      );
    });

    records.push({
      rowNumber: index + 2,
      rawData,
    });
  });

  return records;
};

const parseCsvFile = async (filePath) => {
  const fs = await import("fs/promises");
  const content = await fs.readFile(filePath, "utf8");

  const rows = parseCsv(content, {
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  });

  if (rows.length < 2) {
    throw new Error(
      "CSV must contain a header row and at least one data row"
    );
  }

  const headers = createUniqueHeaders(rows[0]);
  const records = buildRecords(headers, rows.slice(1));

  return { headers, records };
};

const parseExcelFile = async (filePath) => {
  const workbook = new ExcelJS.Workbook();

  await workbook.xlsx.readFile(filePath);

  const worksheet = workbook.worksheets[0];

  if (!worksheet) {
    throw new Error("Excel file does not contain a worksheet");
  }

  const rows = [];

  worksheet.eachRow({ includeEmpty: false }, (row) => {
    rows.push(
      row.values.slice(1).map(normalizeCellValue)
    );
  });

  if (rows.length < 2) {
    throw new Error(
      "Excel file must contain a header row and at least one data row"
    );
  }

  const headers = createUniqueHeaders(rows[0]);
  const records = buildRecords(headers, rows.slice(1));

  return { headers, records };
};

const saveRecordsInBatches = async ({
  records,
  workspaceId,
  importBatchId,
  session,
}) => {
  for (
    let start = 0;
    start < records.length;
    start += INSERT_BATCH_SIZE
  ) {
    const batch = records
      .slice(start, start + INSERT_BATCH_SIZE)
      .map((record) => ({
        workspaceId,
        importBatchId,
        rowNumber: record.rowNumber,
        rawData: record.rawData,
      }));

    await ImportRecord.insertMany(batch, {
      ordered: true,
      session,
    });
  }
};

export const parseImportFile = async ({
  importBatchId,
  workspaceId,
}) => {
  const existingBatch = await ImportBatch.findOne({
    _id: importBatchId,
    workspaceId,
  });

  if (!existingBatch) {
    const error = new Error("Import batch not found");
    error.status = 404;
    throw error;
  }

  // Only uploaded, failed or previously parsed files can be parsed.
  if (!["uploaded", "failed", "parsed"].includes(existingBatch.status)) {
    const error = new Error(
      existingBatch.status === "parsing"
        ? "This file is already being parsed"
        : "This file cannot be parsed in its current status"
    );
    error.status = 409;
    throw error;
  }

  // Atomically claim the import batch.
  // A second request cannot claim it while the first request is parsing.
  const importBatch = await ImportBatch.findOneAndUpdate(
    {
      _id: importBatchId,
      workspaceId,
      status: { $in: ["uploaded", "failed", "parsed"] },
    },
    {
      $set: { status: "parsing" },
    },
    { new: true }
  );

  if (!importBatch) {
    const error = new Error(
      "This file is already being processed or cannot be parsed"
    );
    error.status = 409;
    throw error;
  }

  let session;

  try {
    const extension = path
      .extname(importBatch.filePath)
      .toLowerCase();

    if (![".csv", ".xlsx"].includes(extension)) {
      const error = new Error("Unsupported file format");
      error.status = 400;
      throw error;
    }

    // Parse the file before opening the database transaction.
    const result =
      extension === ".csv"
        ? await parseCsvFile(importBatch.filePath)
        : await parseExcelFile(importBatch.filePath);

    if (result.records.length === 0) {
      throw new Error("The file contains no data rows");
    }

    // Replace records and update import metadata atomically.
    session = await mongoose.startSession();

    await session.withTransaction(async () => {
      await ImportRecord.deleteMany(
        {
          workspaceId,
          importBatchId,
        },
        { session }
      );

      await saveRecordsInBatches({
        records: result.records,
        workspaceId,
        importBatchId,
        session,
      });

      const updateResult = await ImportBatch.updateOne(
        {
          _id: importBatchId,
          workspaceId,
          status: "parsing",
        },
        {
          $set: {
            detectedHeaders: result.headers,
            rowCount: result.records.length,
            status: "parsed",
            validationSummary: {
              totalRows: result.records.length,
              validRows: 0,
              invalidRows: 0,
              errors: [],
            },
          },
        },
        { session }
      );

      if (updateResult.matchedCount !== 1) {
        throw new Error(
          "Import batch changed while parsing"
        );
      }
    });

    const updatedBatch = await ImportBatch.findOne({
      _id: importBatchId,
      workspaceId,
    });

    return {
      importBatch: updatedBatch,
      detectedHeaders: result.headers,
      rowCount: result.records.length,
    };
  } catch (error) {
    // If the transaction fails, MongoDB rolls back record changes.
    // Mark the import as failed outside the aborted transaction.
    await ImportBatch.updateOne(
      {
        _id: importBatchId,
        workspaceId,
        status: "parsing",
      },
      {
        $set: {
          status: "failed",
          "validationSummary.errors": [error.message],
        },
      }
    );

    throw error;
  } finally {
    if (session) {
      await session.endSession();
    }
  }
};

export const getImportRecords = async ({
  importBatchId,
  workspaceId,
  page = 1,
  limit = 50,
}) => {
  const importBatch = await ImportBatch.findOne({
    _id: importBatchId,
    workspaceId,
  });

  if (!importBatch) {
    const error = new Error("Import batch not found");
    error.status = 404;
    throw error;
  }

  if (importBatch.status !== "parsed") {
    const error = new Error(
      "File has not been parsed successfully yet"
    );
    error.status = 409;
    throw error;
  }

  const safePage = Math.max(1, Number(page) || 1);

  const safeLimit = Math.min(
    100,
    Math.max(1, Number(limit) || 50)
  );

  const filter = {
    workspaceId,
    importBatchId,
  };

  const [records, total] = await Promise.all([
    ImportRecord.find(filter)
      .sort({ rowNumber: 1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .lean(),

    ImportRecord.countDocuments(filter),
  ]);

  return {
    records,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
    },
  };
};
