import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ArrowLeftRight,
  Play,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  LoaderCircle,
  RotateCcw,
} from "lucide-react";

import api from "../services/api";
import "./Reconciliation.css";

const FILE_TYPES = [
  { value: "orders", label: "Orders" },
  { value: "settlements", label: "Settlements" },
  { value: "cod", label: "COD remittances" },
  { value: "freight", label: "Freight invoices" },
  { value: "returns", label: "Returns" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All orders" },
  { value: "settled", label: "Settled" },
  { value: "short_paid", label: "Short paid" },
  { value: "unpaid_past_due", label: "Unpaid past due" },
  { value: "freight_overcharged", label: "Freight overcharged" },
  { value: "return_not_received", label: "Return not received" },
  { value: "needs_review", label: "Needs review" },
];

const formatCurrency = (value) => {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const amount = Number(value);

  if (!Number.isFinite(amount)) return "—";

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
};

const formatDate = (value) => {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getBatchId = (batch) =>
  String(batch?._id || batch?.id || "");

const getBatchLabel = (batch) =>
  `${batch.sourceName || "Unknown source"} · ${
    batch.originalName || "Unnamed file"
  }`;

/*
 * A standardized batch can have:
 * status = "parsed"
 * standardizationStatus = "standardized"
 *
 * Some responses expose the completed standardization state as
 * "completed". Failed batches must never be selectable.
 */
const isStandardized = (batch) => {
  const batchStatus = String(batch?.status || "").toLowerCase();
  const standardizationStatus = String(
    batch?.standardizationStatus || ""
  ).toLowerCase();

  const isFailed =
    batchStatus === "failed" ||
    standardizationStatus === "failed";

  const validBatchStatus = [
    "parsed",
    "completed",
    "standardized",
  ].includes(batchStatus);

  const validStandardizationStatus = [
    "standardized",
    "completed",
  ].includes(standardizationStatus);

  return (
    validBatchStatus &&
    validStandardizationStatus &&
    !isFailed
  );
};

const getStatusLabel = (status) => {
  const labels = {
    settled: "Settled",
    short_paid: "Short paid",
    unpaid_past_due: "Unpaid past due",
    freight_overcharged: "Freight overcharged",
    return_not_received: "Return not received",
    needs_review: "Needs review",
    not_evaluated: "Not evaluated",
    received: "Received",
    not_received: "Not received",
    not_applicable: "Not applicable",
  };

  return (
    labels[status] ||
    String(status || "Unknown").replaceAll("_", " ")
  );
};

const getStatusClass = (status) => {
  if (status === "settled" || status === "received") {
    return "success";
  }

  if (
    status === "short_paid" ||
    status === "freight_overcharged" ||
    status === "return_not_received" ||
    status === "unpaid_past_due"
  ) {
    return "danger";
  }

  if (status === "needs_review") {
    return "warning";
  }

  return "neutral";
};

const firstDefined = (...values) =>
  values.find((value) => value !== undefined && value !== null);

const getResultStatuses = (result) => {
  if (Array.isArray(result.statuses)) {
    return result.statuses;
  }

  const statuses = [
    result.settlementStatus,
    result.codStatus,
    result.freightStatus,
    result.returnStatus,
    result.status,
  ];

  return [...new Set(statuses.filter(Boolean))];
};

const getPaymentAmounts = (result) => {
  const expectedCOD = firstDefined(
    result.expectedCodAmount,
    result.expectedCODAmount
  );

  const actualCOD = firstDefined(
    result.actualCodAmount,
    result.actualCODAmount,
    result.actualCodRemittedAmount
  );

  const codDifference = firstDefined(
    result.codDifference,
    result.codAmountDifference
  );

  const expectedSettlement = firstDefined(
    result.expectedSettlementAmount,
    result.expectedAmount
  );

  const actualSettlement = firstDefined(
    result.actualSettlementAmount,
    result.actualAmount
  );

  const settlementDifference = firstDefined(
    result.settlementDifference,
    result.difference
  );

  if (
    expectedCOD !== undefined ||
    actualCOD !== undefined ||
    codDifference !== undefined
  ) {
    return {
      expected: expectedCOD,
      actual: actualCOD,
      difference: codDifference,
      paymentType: "COD",
    };
  }

  return {
    expected: expectedSettlement,
    actual: actualSettlement,
    difference: settlementDifference,
    paymentType: "Settlement",
  };
};

function Reconciliation() {
  const [batches, setBatches] = useState([]);
  const [selectedBatchIds, setSelectedBatchIds] = useState([]);

  const [loadingBatches, setLoadingBatches] = useState(true);
  const [running, setRunning] = useState(false);
  const [loadingResults, setLoadingResults] = useState(false);

  const [run, setRun] = useState(null);
  const [summary, setSummary] = useState(null);
  const [results, setResults] = useState([]);

  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 1,
  });

  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [expandedOrder, setExpandedOrder] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Load uploaded batches.
  const loadBatches = useCallback(async () => {
    try {
      setLoadingBatches(true);
      setError("");

      const response = await api.get("/uploads", {
        params: {
          page: 1,
          limit: 100,
        },
      });

      const allBatches = response.data.data?.batches || [];

      setBatches(allBatches);

      // Select the newest standardized batch from each category.
      const latestByType = new Map();

      for (const batch of allBatches) {
        if (!isStandardized(batch)) continue;

        const existing = latestByType.get(batch.fileType);

        if (
          !existing ||
          new Date(batch.createdAt) >
            new Date(existing.createdAt)
        ) {
          latestByType.set(batch.fileType, batch);
        }
      }

      setSelectedBatchIds(
        [...latestByType.values()]
          .map(getBatchId)
          .filter(Boolean)
      );
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to load imported batches. Please refresh and try again."
      );
    } finally {
      setLoadingBatches(false);
    }
  }, []);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  const selectedBatches = useMemo(
    () =>
      batches.filter((batch) =>
        selectedBatchIds.includes(getBatchId(batch))
      ),
    [batches, selectedBatchIds]
  );

  const selectedTypes = useMemo(
    () => new Set(selectedBatches.map((batch) => batch.fileType)),
    [selectedBatches]
  );

  const missingTypes = FILE_TYPES.filter(
    (type) => !selectedTypes.has(type.value)
  );

  const toggleBatch = (batchId) => {
    setSelectedBatchIds((current) =>
      current.includes(batchId)
        ? current.filter((id) => id !== batchId)
        : [...current, batchId]
    );
  };

  const selectLatestBatches = () => {
    const latestByType = new Map();

    for (const batch of batches) {
      if (!isStandardized(batch)) continue;

      const existing = latestByType.get(batch.fileType);

      if (
        !existing ||
        new Date(batch.createdAt) >
          new Date(existing.createdAt)
      ) {
        latestByType.set(batch.fileType, batch);
      }
    }

    setSelectedBatchIds(
      [...latestByType.values()]
        .map(getBatchId)
        .filter(Boolean)
    );
  };

  // Load order-level reconciliation results.
  const loadResults = useCallback(async (runId, page = 1) => {
    if (!runId) return;

    try {
      setLoadingResults(true);
      setError("");

      const response = await api.get(
        `/reconciliation/${runId}/results`,
        {
          params: {
            page,
            limit: 50,
          },
        }
      );

      const data = response.data.data || {};

      setSummary(data.summary || null);
      setResults(data.results || []);

      setPagination(
        data.pagination || {
          page: 1,
          limit: 50,
          total: 0,
          totalPages: 1,
        }
      );
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to load reconciliation results."
      );
    } finally {
      setLoadingResults(false);
    }
  }, []);

  // Start reconciliation.
  const handleRunReconciliation = async () => {
    setError("");
    setSuccess("");
    setExpandedOrder("");

    if (selectedBatchIds.length === 0) {
      setError("Select at least one standardized import batch.");
      return;
    }

    if (!selectedTypes.has("orders")) {
      setError("An Orders batch is required to run reconciliation.");
      return;
    }

    const unstandardized = selectedBatches.filter(
      (batch) => !isStandardized(batch)
    );

    if (unstandardized.length > 0) {
      setError("Every selected batch must be standardized.");
      return;
    }

    try {
      setRunning(true);

      const response = await api.post("/reconciliation/run", {
        batchIds: selectedBatchIds,
      });

      const completedRun = response.data.data?.run;

      if (!completedRun?._id) {
        throw new Error(
          "The server did not return a reconciliation run ID."
        );
      }

      setRun(completedRun);
      setSummary(completedRun.summary || null);
      setStatusFilter("all");
      setSearch("");

      setSuccess(
        `Reconciliation completed. ${
          response.data.data.matchedOrderCount ?? 0
        } orders processed.`
      );

      await loadResults(completedRun._id, 1);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.message ||
          "Unable to run reconciliation."
      );
    } finally {
      setRunning(false);
    }
  };

  const handlePageChange = async (nextPage) => {
    if (
      !run?._id ||
      nextPage < 1 ||
      nextPage > pagination.totalPages
    ) {
      return;
    }

    await loadResults(run._id, nextPage);
  };

  const filteredResults = useMemo(() => {
    return results.filter((result) => {
      const statuses = getResultStatuses(result);

      const matchesStatus =
        statusFilter === "all" ||
        statuses.includes(statusFilter);

      const query = search.trim().toLowerCase();

      const matchesSearch =
        !query ||
        String(result.orderId || "")
          .toLowerCase()
          .includes(query);

      return matchesStatus && matchesSearch;
    });
  }, [results, statusFilter, search]);

  const renderStatusBadges = (statuses = []) => {
    if (!statuses.length) {
      return (
        <span className="recon-muted">
          No status
        </span>
      );
    }

    return (
      <div className="recon-status-list">
        {statuses.map((status) => (
          <span
            className={`recon-badge ${getStatusClass(status)}`}
            key={status}
          >
            {getStatusLabel(status)}
          </span>
        ))}
      </div>
    );
  };

  // Expanded order calculation and evidence details.
  const renderExpandedDetails = (result) => {
    const payment = getPaymentAmounts(result);

    const expectedCOD = firstDefined(
      result.expectedCodAmount,
      result.expectedCODAmount
    );

    const actualCOD = firstDefined(
      result.actualCodAmount,
      result.actualCODAmount,
      result.actualCodRemittedAmount
    );

    const expectedFreight = firstDefined(
      result.expectedFreightAmount,
      result.expectedFreight
    );

    const actualFreight = firstDefined(
      result.actualFreightAmount,
      result.actualFreight
    );

    const freightDifference = firstDefined(
      result.freightDifference,
      result.freightAmountDifference
    );

    return (
      <div className="recon-detail-panel">
        <div className="recon-detail-grid">
          <div>
            <span>{payment.paymentType} expected</span>
            <strong>{formatCurrency(payment.expected)}</strong>
          </div>

          <div>
            <span>{payment.paymentType} received</span>
            <strong>{formatCurrency(payment.actual)}</strong>
          </div>

          <div>
            <span>Payment difference</span>
            <strong>{formatCurrency(payment.difference)}</strong>
          </div>

          <div>
            <span>COD collected / expected</span>
            <strong>{formatCurrency(expectedCOD)}</strong>
          </div>

          <div>
            <span>COD remitted</span>
            <strong>{formatCurrency(actualCOD)}</strong>
          </div>

          <div>
            <span>Expected freight</span>
            <strong>{formatCurrency(expectedFreight)}</strong>
          </div>

          <div>
            <span>Actual freight</span>
            <strong>{formatCurrency(actualFreight)}</strong>
          </div>

          <div>
            <span>Freight difference</span>
            <strong>{formatCurrency(freightDifference)}</strong>
          </div>

          <div>
            <span>TCS (separate)</span>
            <strong>{formatCurrency(result.tcsAmount)}</strong>
          </div>

          <div>
            <span>TDS (separate)</span>
            <strong>{formatCurrency(result.tdsAmount)}</strong>
          </div>

          <div>
            <span>Return status</span>
            <strong>{getStatusLabel(result.returnStatus)}</strong>
          </div>

          <div>
            <span>Warehouse received</span>
            <strong>{formatDate(result.warehouseReceivedAt)}</strong>
          </div>

          <div>
            <span>Rate card version</span>
            <strong>{result.rateCardVersion || "—"}</strong>
          </div>

          <div>
            <span>Money at risk</span>
            <strong className="recon-risk-value">
              {formatCurrency(result.moneyAtRisk)}
            </strong>
          </div>
        </div>

        {result.reviewReason && (
          <div className="recon-review-reason">
            <AlertCircle size={16} />

            <div>
              <strong>Review reason</strong>
              <p>{result.reviewReason}</p>
            </div>
          </div>
        )}

        {Array.isArray(result.freightBreakdown) &&
          result.freightBreakdown.length > 0 && (
            <div className="recon-freight-breakdown">
              <strong>Freight calculation details</strong>

              {result.freightBreakdown.map((item, index) => (
                <div key={item.recordId || index}>
                  <span>Shipment {index + 1}</span>

                  <span>
                    Expected: {formatCurrency(item.expectedAmount)}
                  </span>

                  <span>
                    Actual: {formatCurrency(item.actualAmount)}
                  </span>

                  <span>{getStatusLabel(item.status)}</span>
                </div>
              ))}
            </div>
          )}

        <div className="recon-evidence-counts">
          <span>
            <FileSpreadsheet size={14} />
            Orders: 1
          </span>

          <span>
            Settlements: {result.settlementRecordIds?.length || 0}
          </span>

          <span>
            COD: {result.codRecordIds?.length || 0}
          </span>

          <span>
            Freight: {result.freightRecordIds?.length || 0}
          </span>

          <span>
            Returns: {result.returnRecordIds?.length || 0}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="recon-page">
      <div className="recon-page-heading">
        <div>
          <span className="recon-eyebrow">
            FINANCIAL OPERATIONS
          </span>

          <h1>Reconciliation</h1>

          <p>
            Match orders against settlements, COD remittances,
            freight invoices and returns.
          </p>
        </div>

        <button
          className="recon-secondary-button"
          onClick={loadBatches}
          disabled={loadingBatches || running}
        >
          <RefreshCw size={16} />
          Refresh batches
        </button>
      </div>

      {error && (
        <div className="recon-alert error">
          <AlertCircle size={17} />
          <span>{error}</span>

          <button onClick={() => setError("")}>
            Dismiss
          </button>
        </div>
      )}

      {success && (
        <div className="recon-alert success">
          <CheckCircle2 size={17} />
          <span>{success}</span>

          <button onClick={() => setSuccess("")}>
            Dismiss
          </button>
        </div>
      )}

      {/* STEP 1: Select standardized import batches */}
      <section className="recon-card">
        <div className="recon-section-heading">
          <div>
            <span className="recon-eyebrow">STEP 1</span>
            <h2>Select import batches</h2>

            <p>
              Select standardized reports to include in this
              reconciliation. The latest standardized batch per
              category is preselected.
            </p>
          </div>

          <button
            className="recon-text-button"
            onClick={selectLatestBatches}
            disabled={loadingBatches}
          >
            <RotateCcw size={15} />
            Select latest batches
          </button>
        </div>

        {loadingBatches ? (
          <div className="recon-loading">
            <LoaderCircle className="recon-spin" size={22} />
            Loading imported batches...
          </div>
        ) : (
          <>
            <div className="recon-batch-grid">
              {FILE_TYPES.map((type) => {
                const typeBatches = batches.filter(
                  (batch) => batch.fileType === type.value
                );

                return (
                  <div
                    className="recon-batch-category"
                    key={type.value}
                  >
                    <div className="recon-category-heading">
                      <strong>{type.label}</strong>
                      <span>{typeBatches.length} uploaded</span>
                    </div>

                    {typeBatches.length === 0 ? (
                      <div className="recon-no-batch">
                        No files uploaded
                      </div>
                    ) : (
                      typeBatches.map((batch) => {
                        const id = getBatchId(batch);
                        const standardized = isStandardized(batch);
                        const selected = selectedBatchIds.includes(id);

                        return (
                          <label
                            className={`recon-batch-option ${
                              selected ? "selected" : ""
                            } ${
                              !standardized ? "disabled" : ""
                            }`}
                            key={id}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              disabled={!standardized || !id}
                              onChange={() => toggleBatch(id)}
                            />

                            <span className="recon-batch-option-content">
                              <strong>{getBatchLabel(batch)}</strong>

                              <small>
                                {batch.rowCount ?? 0} rows ·{" "}
                                {formatDate(batch.createdAt)}
                              </small>

                              <span
                                className={`recon-badge ${
                                  standardized ? "success" : "warning"
                                }`}
                              >
                                {standardized
                                  ? "Standardized"
                                  : batch.standardizationStatus ||
                                    batch.status ||
                                    "Not ready"}
                              </span>
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                );
              })}
            </div>

            <div className="recon-selection-footer">
              <div>
                <strong>
                  {selectedBatchIds.length} batches selected
                </strong>

                <span>
                  {selectedTypes.size} of 5 categories selected
                </span>
              </div>

              {missingTypes.length > 0 && (
                <span className="recon-missing-types">
                  Missing:{" "}
                  {missingTypes.map((item) => item.label).join(", ")}
                </span>
              )}
            </div>
          </>
        )}

        <div className="recon-run-footer">
          <div>
            <strong>Ready to reconcile?</strong>

            <span>
              An Orders batch is required. Other categories are
              optional, but selecting all five gives the most
              complete result.
            </span>
          </div>

          <button
            className="recon-primary-button"
            onClick={handleRunReconciliation}
            disabled={
              loadingBatches ||
              running ||
              loadingResults ||
              selectedBatchIds.length === 0 ||
              !selectedTypes.has("orders")
            }
          >
            {running ? (
              <LoaderCircle className="recon-spin" size={17} />
            ) : (
              <Play size={16} />
            )}

            {running
              ? "Running reconciliation..."
              : "Run reconciliation"}
          </button>
        </div>
      </section>

      {/* STEP 2: Display reconciliation results */}
      {summary && run && (
        <>
          <section className="recon-run-info">
            <div>
              <span className="recon-eyebrow">
                LATEST RECONCILIATION
              </span>

              <h2>Run results</h2>

              <p>
                Run ID: {String(run._id)} · Completed{" "}
                {formatDate(run.completedAt)}
              </p>
            </div>

            <span className="recon-badge success">
              {getStatusLabel(run.status || "completed")}
            </span>
          </section>

          <section className="recon-summary-grid">
            <div className="recon-summary-card">
              <span>Total orders</span>
              <strong>{summary.totalOrders ?? 0}</strong>
              <small>Orders processed</small>
            </div>

            <div className="recon-summary-card">
              <span>Settled orders</span>
              <strong className="success-text">
                {summary.settledOrders ?? 0}
              </strong>
              <small>Payment matched</small>
            </div>

            <div className="recon-summary-card">
              <span>Short paid</span>
              <strong className="danger-text">
                {summary.shortPaidOrders ?? 0}
              </strong>
              <small>Payment discrepancy</small>
            </div>

            <div className="recon-summary-card">
              <span>Freight overcharged</span>
              <strong className="danger-text">
                {summary.freightOverchargedOrders ?? 0}
              </strong>
              <small>Rate card discrepancy</small>
            </div>

            <div className="recon-summary-card">
              <span>Returns not received</span>
              <strong className="warning-text">
                {summary.returnsNotReceived ?? 0}
              </strong>
              <small>Warehouse confirmation pending</small>
            </div>

            <div className="recon-summary-card risk-card">
              <span>Total money at risk</span>
              <strong>
                {formatCurrency(summary.totalMoneyAtRisk)}
              </strong>
              <small>Potential recoverable exposure</small>
            </div>
          </section>

          <section className="recon-card recon-results-card">
            <div className="recon-section-heading">
              <div>
                <span className="recon-eyebrow">STEP 2</span>
                <h2>Order-level results</h2>

                <p>
                  Inspect matched orders, discrepancies and
                  supporting calculation details.
                </p>
              </div>

              <span className="recon-result-count">
                {pagination.total} orders
              </span>
            </div>

            <div className="recon-results-toolbar">
              <label className="recon-search">
                <Search size={16} />

                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search order ID..."
                />
              </label>

              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value)
                }
                aria-label="Filter reconciliation status"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option
                    key={option.value}
                    value={option.value}
                  >
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {loadingResults ? (
              <div className="recon-loading">
                <LoaderCircle className="recon-spin" size={22} />
                Loading reconciliation results...
              </div>
            ) : filteredResults.length === 0 ? (
              <div className="recon-empty">
                <FileSpreadsheet size={30} />

                <strong>No matching orders</strong>

                <p>
                  Try another status filter or search for a
                  different order ID.
                </p>
              </div>
            ) : (
              <div className="recon-table-wrapper">
                <table className="recon-table">
                  <thead>
                    <tr>
                      <th>ORDER ID</th>
                      <th>PAYMENT EXPECTED</th>
                      <th>PAYMENT RECEIVED</th>
                      <th>DIFFERENCE</th>
                      <th>STATUS</th>
                      <th>MONEY AT RISK</th>
                      <th></th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredResults.map((result, index) => {
                      const payment = getPaymentAmounts(result);

                      const rowId = String(
                        result._id ||
                          result.orderRecordId ||
                          index
                      );

                      const statuses = getResultStatuses(result);
                      const expanded = expandedOrder === rowId;

                      return (
                        <Fragment key={rowId}>
                          <tr>
                            <td>
                              <strong>
                                {result.orderId || "Missing ID"}
                              </strong>
                            </td>

                            <td>
                              {formatCurrency(payment.expected)}
                            </td>

                            <td>
                              {formatCurrency(payment.actual)}
                            </td>

                            <td>
                              {formatCurrency(payment.difference)}
                            </td>

                            <td>
                              {renderStatusBadges(statuses)}
                            </td>

                            <td className="recon-risk-value">
                              {formatCurrency(result.moneyAtRisk)}
                            </td>

                            <td>
                              <button
                                className="recon-expand-button"
                                onClick={() =>
                                  setExpandedOrder(
                                    expanded ? "" : rowId
                                  )
                                }
                                aria-label={
                                  expanded
                                    ? "Hide order details"
                                    : "Show order details"
                                }
                              >
                                {expanded ? (
                                  <ChevronUp size={17} />
                                ) : (
                                  <ChevronDown size={17} />
                                )}
                              </button>
                            </td>
                          </tr>

                          {expanded && (
                            <tr className="recon-expanded-row">
                              <td colSpan="7">
                                {renderExpandedDetails(result)}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="recon-pagination">
              <span>
                Page {pagination.page} of{" "}
                {pagination.totalPages || 1}
              </span>

              <div>
                <button
                  onClick={() =>
                    handlePageChange(pagination.page - 1)
                  }
                  disabled={
                    pagination.page <= 1 || loadingResults
                  }
                  aria-label="Previous page"
                >
                  <ChevronLeft size={17} />
                </button>

                <button
                  onClick={() =>
                    handlePageChange(pagination.page + 1)
                  }
                  disabled={
                    pagination.page >= pagination.totalPages ||
                    loadingResults
                  }
                  aria-label="Next page"
                >
                  <ChevronRight size={17} />
                </button>
              </div>
            </div>
          </section>
        </>
      )}

      {!summary && !loadingBatches && (
        <div className="recon-first-run">
          <div className="recon-first-run-icon">
            <ArrowLeftRight size={25} />
          </div>

          <div>
            <strong>
              Your reconciliation results will appear here
            </strong>

            <p>
              Select your standardized import batches above and run
              reconciliation to see order-level payment and freight
              checks.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default Reconciliation;