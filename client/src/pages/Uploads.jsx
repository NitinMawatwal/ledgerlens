
import { useEffect, useMemo, useState } from "react";
import {
  UploadCloud,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  Eye,
  Settings2,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  History,
  RotateCcw,
  X,
  LoaderCircle,
  Sparkles,
  WandSparkles,
} from "lucide-react";

import api from "../services/api";
import "./Uploads.css";

const FILE_TYPES = [
  { value: "orders", label: "Orders" },
  { value: "settlements", label: "Settlements" },
  { value: "cod", label: "COD remittances" },
  { value: "freight", label: "Freight invoices" },
  { value: "returns", label: "Returns" },
];

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

const formatDate = (date) => {
  if (!date) return "—";

  return new Date(date).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatBytes = (bytes) => {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getStatusClass = (status) => {
  const value = (status || "uploaded").toLowerCase();

  if (["standardized", "completed", "parsed"].includes(value)) {
    return "success";
  }

  if (["failed", "error"].includes(value)) {
    return "error";
  }

  if (["processing", "pending"].includes(value)) {
    return "processing";
  }

  return "neutral";
};

const getConfidenceLabel = (score) => {
  if (score >= 0.85) return "High";
  if (score >= 0.6) return "Medium";
  return "Low";
};

function Uploads() {
  const [batches, setBatches] = useState([]);

  const [pagination, setPagination] = useState({
    page: 1,
    totalPages: 1,
    total: 0,
  });

  const [fileType, setFileType] = useState("orders");
  const [sourceName, setSourceName] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [actionLoading, setActionLoading] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [selectedBatch, setSelectedBatch] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewPage, setPreviewPage] = useState(1);

  const [mappings, setMappings] = useState({});
  const [mappingVersions, setMappingVersions] = useState(null);
  const [mappingPanelOpen, setMappingPanelOpen] = useState(false);

  // AI mapping suggestion state
  const [aiSuggestion, setAiSuggestion] = useState(null);

  const [filterType, setFilterType] = useState("all");

  const filteredBatches = useMemo(() => {
    if (filterType === "all") return batches;

    return batches.filter((batch) => batch.fileType === filterType);
  }, [batches, filterType]);

  // --------------------------------------------------
  // LOAD IMPORT HISTORY
  // --------------------------------------------------

  const loadUploads = async (page = 1) => {
    try {
      setLoading(true);
      setError("");

      const response = await api.get("/uploads", {
        params: { page, limit: 20 },
      });

      const data = response.data.data;

      setBatches(data.batches || []);

      setPagination(
        data.pagination || {
          page: 1,
          totalPages: 1,
          total: 0,
        },
      );
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to load import history.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUploads();
  }, []);

  const clearMessages = () => {
    setError("");
    setSuccess("");
  };

  // --------------------------------------------------
  // UPLOAD FILE
  // --------------------------------------------------

  const handleUpload = async (event) => {
    event.preventDefault();
    clearMessages();

    if (!selectedFile) {
      setError("Please select a CSV or Excel file.");
      return;
    }

    if (!sourceName.trim()) {
      setError("Please enter the source or partner name.");
      return;
    }

    const extension = selectedFile.name
      .split(".")
      .pop()
      .toLowerCase();

    if (!["csv", "xlsx"].includes(extension)) {
      setError("Only CSV and XLSX files are supported.");
      return;
    }

    try {
      setUploading(true);

      const formData = new FormData();

      formData.append("file", selectedFile);
      formData.append("fileType", fileType);
      formData.append("sourceName", sourceName.trim());

      const response = await api.post("/uploads", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      const batch = response.data.data.importBatch;

      setSuccess(`"${batch.originalName}" uploaded successfully.`);
      setSelectedFile(null);
      setSourceName("");

      const fileInput = document.getElementById("import-file-input");

      if (fileInput) {
        fileInput.value = "";
      }

      await loadUploads(1);
    } catch (err) {
      setError(
        err.response?.data?.message || "File upload failed.",
      );
    } finally {
      setUploading(false);
    }
  };

  // --------------------------------------------------
  // PARSE FILE
  // --------------------------------------------------

  const handleParse = async (batch) => {
    clearMessages();
    setActionLoading(`parse-${batch._id}`);

    try {
      const response = await api.post(
        `/uploads/${batch._id}/parse`,
      );

      setSuccess(
        `File parsed successfully. ${response.data.data.importBatch.rowCount} rows detected.`,
      );

      await loadUploads(pagination.page);
    } catch (err) {
      setError(
        err.response?.data?.message || "Unable to parse this file.",
      );
    } finally {
      setActionLoading("");
    }
  };

  // --------------------------------------------------
  // PREVIEW FILE RECORDS
  // --------------------------------------------------

  const handlePreview = async (batch, page = 1) => {
    clearMessages();
    setActionLoading(`preview-${batch._id}`);

    try {
      const response = await api.get(
        `/uploads/${batch._id}/records`,
        {
          params: { page, limit: 10 },
        },
      );

      setSelectedBatch(batch);
      setPreview(response.data.data);
      setPreviewPage(page);

      setMappingPanelOpen(false);
      setMappingVersions(null);
      setMappings({});
      setAiSuggestion(null);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to load file preview.",
      );
    } finally {
      setActionLoading("");
    }
  };

  // --------------------------------------------------
  // OPEN COLUMN MAPPING PANEL
  // --------------------------------------------------

  const handleOpenMapping = async (batch) => {
    clearMessages();
    setActionLoading(`mapping-${batch._id}`);

    try {
      const response = await api.get("/mappings", {
        params: {
          sourceKey: batch.sourceKey,
          fileType: batch.fileType,
        },
      });

      const data = response.data.data;
      const active = data.activeMapping;

      setSelectedBatch(batch);
      setMappingVersions(data);
      setMappings(active?.mappings || {});
      setAiSuggestion(null);

      setMappingPanelOpen(true);
      setPreview(null);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to load column mappings.",
      );
    } finally {
      setActionLoading("");
    }
  };

  // --------------------------------------------------
  // GENERATE AI MAPPING SUGGESTIONS
  // --------------------------------------------------

  const handleSuggestMapping = async () => {
    if (!selectedBatch) return;

    clearMessages();
    setActionLoading("ai-suggest");

    try {
      const response = await api.post("/mappings/suggest", {
        importBatchId: selectedBatch._id,
      });

      setAiSuggestion(response.data.data);

      if (
        !Object.keys(response.data.data.mappings || {}).length
      ) {
        setSuccess(
          "AI could not confidently identify any columns. You can map them manually.",
        );
      } else {
        setSuccess(
          "AI suggestions generated. Review them before applying.",
        );
      }
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to generate AI mapping suggestions.",
      );
    } finally {
      setActionLoading("");
    }
  };

  // --------------------------------------------------
  // APPLY AI SUGGESTIONS TO FORM
  // This does not save the mapping.
  // --------------------------------------------------

  const handleApplyAiSuggestions = () => {
    if (!aiSuggestion?.mappings) return;

    setMappings(aiSuggestion.mappings);

    setSuccess(
      "AI suggestions applied to the form. Review the fields and save to approve.",
    );
  };

  // --------------------------------------------------
  // SAVE APPROVED MAPPING
  // --------------------------------------------------

  const handleSaveMapping = async () => {
    if (!selectedBatch) return;

    clearMessages();
    setActionLoading("save-mapping");

    try {
      const cleanedMappings = Object.fromEntries(
        Object.entries(mappings).filter(
          ([, sourceHeader]) => sourceHeader,
        ),
      );

      await api.post("/mappings", {
        importBatchId: selectedBatch._id,
        mappings: cleanedMappings,
      });

      setSuccess("Column mapping saved successfully.");

      setAiSuggestion(null);

      const response = await api.get("/mappings", {
        params: {
          sourceKey: selectedBatch.sourceKey,
          fileType: selectedBatch.fileType,
        },
      });

      setMappingVersions(response.data.data);

      setMappings(
        response.data.data.activeMapping?.mappings || {},
      );
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to save column mapping.",
      );
    } finally {
      setActionLoading("");
    }
  };

  // --------------------------------------------------
  // ROLLBACK MAPPING
  // --------------------------------------------------

  const handleRollback = async (version) => {
    if (!version?._id || !selectedBatch) return;

    clearMessages();
    setActionLoading(`rollback-${version._id}`);

    try {
      await api.post(`/mappings/${version._id}/rollback`);

      setSuccess(
        `Mapping version ${version.version} restored successfully.`,
      );

      setAiSuggestion(null);

      const response = await api.get("/mappings", {
        params: {
          sourceKey: selectedBatch.sourceKey,
          fileType: selectedBatch.fileType,
        },
      });

      setMappingVersions(response.data.data);

      setMappings(
        response.data.data.activeMapping?.mappings || {},
      );
    } catch (err) {
      setError(
        err.response?.data?.message || "Mapping rollback failed.",
      );
    } finally {
      setActionLoading("");
    }
  };

  // --------------------------------------------------
  // STANDARDIZE FILE
  // --------------------------------------------------

  const handleStandardize = async (batch) => {
    clearMessages();
    setActionLoading(`standardize-${batch._id}`);

    try {
      const response = await api.post(
        `/uploads/${batch._id}/standardize`,
      );

      const summary = response.data.data.summary;

      setSuccess(
        `Standardization completed. ${
          summary.successfulRecords ??
          summary.standardizedRecords ??
          0
        } records processed.`,
      );

      await loadUploads(pagination.page);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to standardize this file.",
      );
    } finally {
      setActionLoading("");
    }
  };

  // --------------------------------------------------
  // CLOSE MODAL
  // --------------------------------------------------

  const closeDetails = () => {
    setSelectedBatch(null);
    setPreview(null);
    setMappingVersions(null);
    setMappingPanelOpen(false);
    setMappings({});
    setAiSuggestion(null);
  };

  const getBatchId = (batch) => batch._id || batch.id;

  const getBatchStatus = (batch) =>
    batch.standardizationStatus &&
    batch.standardizationStatus !== "pending"
      ? batch.standardizationStatus
      : batch.status;

  const getAvailableHeaders = () =>
    selectedBatch?.detectedHeaders ||
    selectedBatch?.headers ||
    [];

  // --------------------------------------------------
  // RENDER
  // --------------------------------------------------

  return (
    <div className="uploads-page">
      <div className="uploads-heading">
        <div>
          <span className="uploads-eyebrow">
            DATA MANAGEMENT
          </span>

          <h1>File imports</h1>

          <p>
            Upload, inspect and standardize financial reports
            from your partners.
          </p>
        </div>

        <button
          className="uploads-secondary-button"
          onClick={() => loadUploads(pagination.page)}
          disabled={loading}
        >
          <RefreshCw size={15} />
          Refresh
        </button>
      </div>

      {/* ALERTS */}

      {error && (
        <div className="uploads-alert uploads-alert-error">
          <AlertCircle size={17} />

          <span>{error}</span>

          <button
            onClick={() => setError("")}
            aria-label="Dismiss error"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {success && (
        <div className="uploads-alert uploads-alert-success">
          <CheckCircle2 size={17} />

          <span>{success}</span>

          <button
            onClick={() => setSuccess("")}
            aria-label="Dismiss success"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* STATISTICS */}

      <div className="uploads-stats">
        <div className="uploads-stat-card">
          <span>Total imports</span>
          <strong>{pagination.total}</strong>
          <FileSpreadsheet size={19} />
        </div>

        <div className="uploads-stat-card">
          <span>Current page</span>
          <strong>
            {pagination.page} / {pagination.totalPages || 1}
          </strong>
          <History size={19} />
        </div>

        <div className="uploads-stat-card">
          <span>File categories</span>
          <strong>5</strong>
          <FileText size={19} />
        </div>
      </div>

      {/* UPLOAD SECTION */}

      <section className="uploads-card">
        <div className="uploads-section-heading">
          <div>
            <span className="uploads-eyebrow">
              NEW IMPORT
            </span>

            <h2>Upload financial report</h2>

            <p>
              Supported formats: CSV and XLSX. Maximum file
              size: 10 MB.
            </p>
          </div>

          <UploadCloud size={24} />
        </div>

        <form
          onSubmit={handleUpload}
          className="uploads-form"
        >
          <div className="uploads-form-grid">
            <label className="uploads-field">
              <span>File category</span>

              <select
                value={fileType}
                onChange={(event) =>
                  setFileType(event.target.value)
                }
              >
                {FILE_TYPES.map((type) => (
                  <option
                    key={type.value}
                    value={type.value}
                  >
                    {type.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="uploads-field">
              <span>Source / Partner name</span>

              <input
                value={sourceName}
                onChange={(event) =>
                  setSourceName(event.target.value)
                }
                placeholder="e.g. Shopify, Razorpay, Delhivery"
                maxLength={100}
                required
              />
            </label>
          </div>

          <label
            className="uploads-file-picker"
            htmlFor="import-file-input"
          >
            <UploadCloud size={27} />

            <strong>
              {selectedFile
                ? selectedFile.name
                : "Choose a file to upload"}
            </strong>

            <span>
              {selectedFile
                ? formatBytes(selectedFile.size)
                : "Drag-and-drop is not enabled yet. Click to browse."}
            </span>

            <input
              id="import-file-input"
              type="file"
              accept=".csv,.xlsx"
              onChange={(event) =>
                setSelectedFile(
                  event.target.files?.[0] || null,
                )
              }
            />
          </label>

          <div className="uploads-form-footer">
            <span>
              Customer-identifying fields are filtered from
              record previews.
            </span>

            <button
              className="uploads-primary-button"
              type="submit"
              disabled={uploading}
            >
              {uploading ? (
                <LoaderCircle
                  className="spin"
                  size={16}
                />
              ) : (
                <UploadCloud size={16} />
              )}

              {uploading ? "Uploading..." : "Upload file"}
            </button>
          </div>
        </form>
      </section>

      {/* IMPORT HISTORY */}

      <section className="uploads-card">
        <div className="uploads-section-heading">
          <div>
            <span className="uploads-eyebrow">
              IMPORT HISTORY
            </span>

            <h2>Uploaded files</h2>

            <p>
              Review, parse and standardize your uploaded reports.
            </p>
          </div>

          <select
            className="uploads-filter"
            value={filterType}
            onChange={(event) =>
              setFilterType(event.target.value)
            }
          >
            <option value="all">All categories</option>

            {FILE_TYPES.map((type) => (
              <option
                key={type.value}
                value={type.value}
              >
                {type.label}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="uploads-empty">
            <LoaderCircle
              className="spin"
              size={24}
            />
            <p>Loading import history...</p>
          </div>
        ) : filteredBatches.length === 0 ? (
          <div className="uploads-empty">
            <FileSpreadsheet size={30} />

            <strong>No imports found</strong>

            <p>
              Upload your first financial report to get started.
            </p>
          </div>
        ) : (
          <div className="uploads-table-wrapper">
            <table className="uploads-table">
              <thead>
                <tr>
                  <th>FILE</th>
                  <th>SOURCE</th>
                  <th>CATEGORY</th>
                  <th>ROWS</th>
                  <th>STATUS</th>
                  <th>UPLOADED</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>

              <tbody>
                {filteredBatches.map((batch) => {
                  const batchId = getBatchId(batch);
                  const status = getBatchStatus(batch);
                  const busy = actionLoading.includes(batchId);

                  return (
                    <tr key={batchId}>
                      <td>
                        <div className="uploads-file-cell">
                          <FileSpreadsheet size={18} />

                          <div>
                            <strong>
                              {batch.originalName}
                            </strong>

                            <span>
                              {formatBytes(batch.fileSize)}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td>{batch.sourceName || "—"}</td>

                      <td>
                        {FILE_TYPES.find(
                          (item) =>
                            item.value === batch.fileType,
                        )?.label || batch.fileType}
                      </td>

                      <td>{batch.rowCount ?? "—"}</td>

                      <td>
                        <span
                          className={`uploads-status ${getStatusClass(
                            status,
                          )}`}
                        >
                          {status || "Uploaded"}
                        </span>
                      </td>

                      <td>{formatDate(batch.createdAt)}</td>

                      <td>
                        <div className="uploads-actions">
                          {batch.status === "uploaded" && (
                            <button
                              title="Parse file"
                              onClick={() =>
                                handleParse(batch)
                              }
                              disabled={busy}
                            >
                              <RefreshCw size={15} />
                            </button>
                          )}

                          {["parsed", "standardized"].includes(
                            batch.status,
                          ) && (
                            <button
                              title="Preview records"
                              onClick={() =>
                                handlePreview(batch)
                              }
                              disabled={busy}
                            >
                              <Eye size={15} />
                            </button>
                          )}

                          {batch.status === "parsed" && (
                            <>
                              <button
                                title="Column mapping"
                                onClick={() =>
                                  handleOpenMapping(batch)
                                }
                                disabled={busy}
                              >
                                <Settings2 size={15} />
                              </button>

                              <button
                                title="Standardize file"
                                onClick={() =>
                                  handleStandardize(batch)
                                }
                                disabled={busy}
                              >
                                <CheckCircle2 size={15} />
                              </button>
                            </>
                          )}

                          {busy && (
                            <LoaderCircle
                              className="spin"
                              size={15}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* PAGINATION */}

        <div className="uploads-pagination">
          <span>
            {pagination.total} total imports
          </span>

          <div>
            <button
              onClick={() =>
                loadUploads(pagination.page - 1)
              }
              disabled={
                pagination.page <= 1 || loading
              }
              aria-label="Previous page"
            >
              <ChevronLeft size={16} />
            </button>

            <span>
              Page {pagination.page} of{" "}
              {pagination.totalPages || 1}
            </span>

            <button
              onClick={() =>
                loadUploads(pagination.page + 1)
              }
              disabled={
                pagination.page >=
                  pagination.totalPages ||
                loading
              }
              aria-label="Next page"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>

      {/* FILE DETAILS MODAL */}

      {selectedBatch && (
        <div
          className="uploads-modal-backdrop"
          onClick={closeDetails}
        >
          <section
            className="uploads-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="uploads-modal-heading">
              <div>
                <span className="uploads-eyebrow">
                  {mappingPanelOpen
                    ? "COLUMN MAPPING"
                    : "FILE PREVIEW"}
                </span>

                <h2>{selectedBatch.originalName}</h2>

                <p>
                  {selectedBatch.sourceName} ·{" "}
                  {selectedBatch.fileType}
                </p>
              </div>

              <button
                onClick={closeDetails}
                aria-label="Close preview"
              >
                <X size={19} />
              </button>
            </div>

            {/* MAPPING PANEL */}

            {mappingPanelOpen ? (
              <div className="uploads-mapping-content">
                <div className="uploads-mapping-heading">
                  <div>
                    <h3>Map source columns</h3>

                    <p>
                      Select the source column corresponding
                      to each standard field. Each source
                      column can only be used once.
                    </p>
                  </div>

                  <button
                    className="uploads-secondary-button"
                    onClick={handleSuggestMapping}
                    disabled={
                      actionLoading === "ai-suggest"
                    }
                  >
                    {actionLoading === "ai-suggest" ? (
                      <LoaderCircle
                        className="spin"
                        size={15}
                      />
                    ) : (
                      <Sparkles size={15} />
                    )}

                    {actionLoading === "ai-suggest"
                      ? "Analyzing..."
                      : "Suggest with AI"}
                  </button>
                </div>

                {/* AI SUGGESTION PREVIEW */}

                {aiSuggestion && (
                  <div className="uploads-active-mapping">
                    <div className="uploads-section-heading">
                      <div>
                        <h3>
                          <WandSparkles
                            size={17}
                            style={{
                              display: "inline",
                              marginRight: 7,
                            }}
                          />
                          AI mapping suggestions
                        </h3>

                        <p>
                          Analyzed{" "}
                          {aiSuggestion.sampleRowsUsed}{" "}
                          sample rows. Review before applying.
                        </p>
                      </div>
                    </div>

                    {Object.keys(
                      aiSuggestion.mappings || {},
                    ).length === 0 ? (
                      <p className="uploads-muted">
                        No confident mappings were found.
                        Please map the columns manually.
                      </p>
                    ) : (
                      <>
                        <div className="uploads-mapping-list">
                          {Object.entries(
                            aiSuggestion.mappings,
                          ).map(([field, header]) => {
                            const score =
                              aiSuggestion.confidence?.[
                                field
                              ] ?? 0;

                            return (
                              <div
                                className="uploads-version-row"
                                key={field}
                              >
                                <div>
                                  <strong>{field}</strong>

                                  <span>
                                    Source column: {header}
                                  </span>
                                </div>

                                <div>
                                  <strong>
                                    {Math.round(score * 100)}%
                                  </strong>

                                  <span>
                                    {getConfidenceLabel(score)}{" "}
                                    confidence
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <button
                          className="uploads-primary-button"
                          onClick={
                            handleApplyAiSuggestions
                          }
                        >
                          <CheckCircle2 size={15} />
                          Apply suggestions to form
                        </button>
                      </>
                    )}

                    {aiSuggestion.notes?.length > 0 && (
                      <div style={{ marginTop: 12 }}>
                        <strong>AI notes</strong>

                        {aiSuggestion.notes.map(
                          (note, index) => (
                            <p
                              className="uploads-muted"
                              key={index}
                            >
                              {note}
                            </p>
                          ),
                        )}
                      </div>
                    )}

                    <p className="uploads-muted">
                      AI suggestions are not saved automatically.
                      Review the dropdowns and click Save mapping
                      to approve them.
                    </p>
                  </div>
                )}

                {/* ACTIVE MAPPING */}

                {mappingVersions?.activeMapping && (
                  <div className="uploads-active-mapping">
                    Active mapping: Version{" "}
                    {mappingVersions.activeMapping.version}
                  </div>
                )}

                {/* MANUAL MAPPING DROPDOWNS */}

                <div className="uploads-mapping-list">
                  {(STANDARD_FIELDS[
                    selectedBatch.fileType
                  ] || []).map((field) => (
                    <label
                      className="uploads-mapping-row"
                      key={field}
                    >
                      <span>{field}</span>

                      <select
                        value={mappings[field] || ""}
                        onChange={(event) =>
                          setMappings((previous) => ({
                            ...previous,
                            [field]: event.target.value,
                          }))
                        }
                      >
                        <option value="">
                          Not mapped
                        </option>

                        {getAvailableHeaders().map(
                          (header) => {
                            const usedElsewhere =
                              Object.entries(mappings).some(
                                ([otherField, value]) =>
                                  otherField !== field &&
                                  value === header,
                              );

                            return (
                              <option
                                key={header}
                                value={header}
                                disabled={usedElsewhere}
                              >
                                {header}
                              </option>
                            );
                          },
                        )}
                      </select>
                    </label>
                  ))}
                </div>

                {/* SAVE MAPPING */}

                <button
                  className="uploads-primary-button"
                  onClick={handleSaveMapping}
                  disabled={
                    actionLoading === "save-mapping"
                  }
                >
                  {actionLoading === "save-mapping" ? (
                    <LoaderCircle
                      className="spin"
                      size={15}
                    />
                  ) : (
                    <CheckCircle2 size={15} />
                  )}

                  Save mapping
                </button>

                {/* MAPPING HISTORY */}

                <div className="uploads-version-section">
                  <h3>
                    <History size={16} />
                    Mapping history
                  </h3>

                  {mappingVersions?.versions?.length ? (
                    mappingVersions.versions.map(
                      (version) => (
                        <div
                          className="uploads-version-row"
                          key={version._id}
                        >
                          <div>
                            <strong>
                              Version {version.version}
                            </strong>

                            <span>
                              {formatDate(version.createdAt)}
                              {version.isActive
                                ? " · Active"
                                : ""}
                            </span>
                          </div>

                          {!version.isActive && (
                            <button
                              onClick={() =>
                                handleRollback(version)
                              }
                              disabled={
                                actionLoading ===
                                `rollback-${version._id}`
                              }
                            >
                              {actionLoading ===
                              `rollback-${version._id}` ? (
                                <LoaderCircle
                                  className="spin"
                                  size={14}
                                />
                              ) : (
                                <RotateCcw size={14} />
                              )}

                              Roll back
                            </button>
                          )}
                        </div>
                      ),
                    )
                  ) : (
                    <p className="uploads-muted">
                      No saved mapping versions yet.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              /* FILE PREVIEW PANEL */

              <div className="uploads-preview-content">
                <div className="uploads-preview-summary">
                  <span>
                    {preview?.pagination?.total ??
                      selectedBatch.rowCount ??
                      0}{" "}
                    total records
                  </span>

                  <span>
                    Preview page {previewPage}
                  </span>
                </div>

                <div className="uploads-table-wrapper">
                  <table className="uploads-table preview-table">
                    <thead>
                      <tr>
                        <th>ROW</th>

                        {Object.keys(
                          preview?.records?.[0]?.rawData || {},
                        ).map((header) => (
                          <th key={header}>{header}</th>
                        ))}
                      </tr>
                    </thead>

                    <tbody>
                      {(preview?.records || []).map(
                        (record, index) => (
                          <tr
                            key={record._id || index}
                          >
                            <td>
                              {record.rowNumber ||
                                index + 1}
                            </td>

                            {Object.keys(
                              record.rawData || {},
                            ).map((header) => (
                              <td key={header}>
                                {String(
                                  record.rawData[header] ??
                                    "—",
                                )}
                              </td>
                            ))}
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>

                {/* PREVIEW PAGINATION */}

                <div className="uploads-pagination">
                  <span>
                    {preview?.pagination?.total || 0}{" "}
                    records
                  </span>

                  <div>
                    <button
                      disabled={previewPage <= 1}
                      onClick={() =>
                        handlePreview(
                          selectedBatch,
                          previewPage - 1,
                        )
                      }
                    >
                      <ChevronLeft size={16} />
                    </button>

                    <span>Page {previewPage}</span>

                    <button
                      disabled={
                        previewPage >=
                        (preview?.pagination
                          ?.totalPages || 1)
                      }
                      onClick={() =>
                        handlePreview(
                          selectedBatch,
                          previewPage + 1,
                        )
                      }
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>

                {/* PREVIEW ACTIONS */}

                <div className="uploads-modal-actions">
                  <button
                    className="uploads-secondary-button"
                    onClick={() =>
                      handleOpenMapping(selectedBatch)
                    }
                  >
                    <Settings2 size={15} />
                    Configure column mapping
                  </button>

                  <button
                    className="uploads-primary-button"
                    onClick={() =>
                      handleStandardize(selectedBatch)
                    }
                    disabled={
                      actionLoading ===
                      `standardize-${selectedBatch._id}`
                    }
                  >
                    <CheckCircle2 size={15} />
                    Standardize records
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export default Uploads;
