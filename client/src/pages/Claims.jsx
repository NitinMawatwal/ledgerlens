
import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Download,
  FileSpreadsheet,
  IndianRupee,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";

import api from "../services/api";
import "./Claims.css";

const formatCurrency = (amount = 0) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(amount) || 0);

const formatDate = (date) =>
  date
    ? new Date(date).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

function StatusBadge({ status }) {
  return (
    <span className={`claim-status ${status}`}>
      <span />
      {status.replaceAll("_", " ")}
    </span>
  );
}

function Claims() {
  const [activeTab, setActiveTab] = useState("claims");

  const [claims, setClaims] = useState([]);
  const [partners, setPartners] = useState([]);
  const [reviewCases, setReviewCases] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");

  const [selectedItem, setSelectedItem] = useState(null);
  const [decision, setDecision] = useState("");
  const [note, setNote] = useState("");
  const [recoveredAmount, setRecoveredAmount] = useState("");

  const [saving, setSaving] = useState(false);

  async function loadClaims() {
    setLoading(true);
    setError("");

    try {
      const params = {};

      if (statusFilter !== "all") {
        params.status = statusFilter;
      }

      if (typeFilter !== "all") {
        params.claimType = typeFilter;
      }

      const [claimsResponse, partnersResponse, reviewsResponse] =
        await Promise.all([
          api.get("/claims", { params }),
          api.get("/claims/partners"),
          api.get("/claims/reviews"),
        ]);

      setClaims(claimsResponse.data.data.claims || []);
      setPartners(partnersResponse.data.data.partners || []);
      setReviewCases(reviewsResponse.data.data.cases || []);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to load claims. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadClaims();
  }, [statusFilter, typeFilter]);

  const filteredClaims = claims.filter((claim) => {
    const query = search.toLowerCase();

    return (
      String(claim.orderId || "").toLowerCase().includes(query) ||
      String(claim.partnerName || "").toLowerCase().includes(query) ||
      String(claim.partnerKey || "").toLowerCase().includes(query)
    );
  });

  const outstandingAmount = partners.reduce(
    (total, partner) => total + (partner.activeClaimAmount || 0),
    0,
  );

  const recoveredAmountTotal = partners.reduce(
    (total, partner) => total + (partner.recoveredAmount || 0),
    0,
  );

  const activeClaimCount = partners.reduce(
    (total, partner) => total + (partner.activeClaims || 0),
    0,
  );

  async function exportEvidence(claimId, orderId) {
    try {
      setError("");
      const response = await api.get(
        `/claims/${claimId}/evidence`,
        { responseType: "blob" },
      );

      const blobUrl = window.URL.createObjectURL(
        new Blob([response.data]),
      );

      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `ledgerlens-${orderId || claimId}-evidence.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();

      window.URL.revokeObjectURL(blobUrl);
    } catch {
      setError("Unable to export claim evidence.");
    }
  }

  function openStatusDialog(claim, nextStatus) {
    setSelectedItem(claim);
    setDecision(nextStatus);
    setNote("");
    setRecoveredAmount(
      nextStatus === "recovered" ? String(claim.claimAmount) : "",
    );
  }

  async function updateClaimStatus(event) {
    event.preventDefault();

    if (!selectedItem) return;

    setSaving(true);
    setError("");

    try {
      const payload = {
        status: decision,
        note,
      };

      if (decision === "recovered") {
        payload.recoveredAmount = Number(recoveredAmount);
      }

      await api.patch(
        `/claims/${selectedItem._id}/status`,
        payload,
      );

      setSelectedItem(null);
      setSuccess("Claim status updated successfully.");

      await loadClaims();
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to update claim status.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function decideReviewCase(reviewId, reviewDecision) {
    const reviewNote = window.prompt(
      `Enter a note for ${reviewDecision}:`,
    );

    if (!reviewNote?.trim()) return;

    try {
      setError("");

      await api.patch(`/claims/reviews/${reviewId}/decision`, {
        decision: reviewDecision,
        note: reviewNote.trim(),
      });

      setSuccess("Review case updated successfully.");
      await loadClaims();
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to update review case.",
      );
    }
  }

  function getNextStatuses(status) {
    const transitions = {
      open: ["submitted", "closed"],
      submitted: ["accepted", "rejected", "closed"],
      accepted: ["recovered", "closed"],
      rejected: ["closed"],
      recovered: ["closed"],
      closed: [],
    };

    return transitions[status] || [];
  }

  return (
    <div className="claims-page">
      <section className="page-heading">
        <div>
          <span className="eyebrow">FINANCIAL RECOVERY</span>
          <h1>Claims management</h1>
          <p>
            Track partner discrepancies, recoveries and pending investigations.
          </p>
        </div>

        <button
          className="primary-button"
          onClick={loadClaims}
          disabled={loading}
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </section>

      {error && (
        <div className="claims-alert error">
          <AlertCircle size={17} />
          {error}
        </div>
      )}

      {success && (
        <div className="claims-alert success">
          <CheckCircle2 size={17} />
          {success}
          <button onClick={() => setSuccess("")}>Dismiss</button>
        </div>
      )}

      <section className="claims-metrics">
        <div className="claims-metric">
          <div className="claims-metric-icon amber">
            <IndianRupee size={19} />
          </div>
          <span>Outstanding exposure</span>
          <h2>{formatCurrency(outstandingAmount)}</h2>
          <small>Across active claims</small>
        </div>

        <div className="claims-metric">
          <div className="claims-metric-icon green">
            <CheckCircle2 size={19} />
          </div>
          <span>Amount recovered</span>
          <h2>{formatCurrency(recoveredAmountTotal)}</h2>
          <small>Recorded recoveries</small>
        </div>

        <div className="claims-metric">
          <div className="claims-metric-icon blue">
            <FileSpreadsheet size={19} />
          </div>
          <span>Total claims</span>
          <h2>{partners.reduce((sum, p) => sum + p.totalClaims, 0)}</h2>
          <small>Across all partners</small>
        </div>

        <div className="claims-metric">
          <div className="claims-metric-icon red">
            <Clock3 size={19} />
          </div>
          <span>Active claims</span>
          <h2>{activeClaimCount}</h2>
          <small>Awaiting resolution</small>
        </div>
      </section>

      <section className="claims-partners">
        <div className="claims-section-heading">
          <div>
            <span className="eyebrow">PARTNER PERFORMANCE</span>
            <h3>Claims by partner</h3>
          </div>
        </div>

        {loading && partners.length === 0 ? (
          <p className="claims-empty">Loading partner summaries...</p>
        ) : partners.length === 0 ? (
          <p className="claims-empty">No partner claims available.</p>
        ) : (
          <div className="partner-grid">
            {partners.map((partner) => (
              <div className="partner-card" key={partner.partnerKey}>
                <div className="partner-card-top">
                  <div>
                    <strong>{partner.partnerName}</strong>
                    <span>{partner.partnerType}</span>
                  </div>
                  <span className="partner-count">
                    {partner.totalClaims} claims
                  </span>
                </div>

                <div className="partner-amount">
                  {formatCurrency(partner.activeClaimAmount)}
                </div>
                <small>Outstanding amount</small>

                <div className="partner-card-footer">
                  <span>
                    Recovered:{" "}
                    <strong>
                      {formatCurrency(partner.recoveredAmount)}
                    </strong>
                  </span>
                  <span>
                    {partner.activeClaims} active
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="claims-table-section">
        <div className="claims-tabs">
          <button
            className={activeTab === "claims" ? "active" : ""}
            onClick={() => setActiveTab("claims")}
          >
            Claims
          </button>

          <button
            className={activeTab === "reviews" ? "active" : ""}
            onClick={() => setActiveTab("reviews")}
          >
            Review queue
            {reviewCases.length > 0 && (
              <span className="review-count">{reviewCases.length}</span>
            )}
          </button>
        </div>

        {activeTab === "claims" ? (
          <>
            <div className="claims-section-heading table-title">
              <div>
                <span className="eyebrow">RECOVERY TRACKER</span>
                <h3>All claims</h3>
              </div>
            </div>

            <div className="claims-filters">
              <div className="claims-search">
                <Search size={16} />
                <input
                  placeholder="Search order or partner..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>

              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="all">All statuses</option>
                <option value="open">Open</option>
                <option value="submitted">Submitted</option>
                <option value="accepted">Accepted</option>
                <option value="rejected">Rejected</option>
                <option value="recovered">Recovered</option>
                <option value="closed">Closed</option>
              </select>

              <select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value)}
              >
                <option value="all">All claim types</option>
                <option value="short_paid">Short paid</option>
                <option value="unpaid_past_due">Unpaid</option>
                <option value="freight_overcharged">Freight overcharged</option>
                <option value="return_not_received">Return not received</option>
              </select>
            </div>

            <div className="table-wrapper">
              <table className="claims-table">
                <thead>
                  <tr>
                    <th>ORDER</th>
                    <th>PARTNER</th>
                    <th>CLAIM TYPE</th>
                    <th>AMOUNT</th>
                    <th>RECOVERED</th>
                    <th>STATUS</th>
                    <th>CREATED</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredClaims.map((claim) => (
                    <tr key={claim._id}>
                      <td className="order-id">{claim.orderId || "—"}</td>
                      <td>{claim.partnerName}</td>
                      <td>
                        {claim.claimType.replaceAll("_", " ")}
                      </td>
                      <td>{formatCurrency(claim.claimAmount)}</td>
                      <td>{formatCurrency(claim.recoveredAmount)}</td>
                      <td>
                        <StatusBadge status={claim.status} />
                      </td>
                      <td>{formatDate(claim.createdAt)}</td>
                      <td>
                        <div className="claim-actions">
                          <button
                            className="claim-action-button"
                            title="Export evidence"
                            onClick={() =>
                              exportEvidence(claim._id, claim.orderId)
                            }
                          >
                            <Download size={15} />
                          </button>

                          {getNextStatuses(claim.status).length > 0 && (
                            <select
                              aria-label={`Update status for ${claim.orderId}`}
                              defaultValue=""
                              onChange={(event) => {
                                if (event.target.value) {
                                  openStatusDialog(claim, event.target.value);
                                  event.target.value = "";
                                }
                              }}
                            >
                              <option value="">Update</option>
                              {getNextStatuses(claim.status).map((next) => (
                                <option key={next} value={next}>
                                  {next.replaceAll("_", " ")}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}

                  {!loading && filteredClaims.length === 0 && (
                    <tr>
                      <td colSpan="8" className="claims-empty">
                        No claims match the selected filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            <div className="claims-section-heading table-title">
              <div>
                <span className="eyebrow">HUMAN VERIFICATION</span>
                <h3>Review queue</h3>
              </div>
            </div>

            {reviewCases.length === 0 ? (
              <div className="claims-empty">
                <ShieldCheck size={28} />
                <strong>No pending review cases</strong>
                <span>All generated review cases have been processed.</span>
              </div>
            ) : (
              <div className="review-list">
                {reviewCases.map((review) => (
                  <div className="review-card" key={review._id}>
                    <div className="review-card-main">
                      <div className="review-icon">
                        <AlertCircle size={18} />
                      </div>

                      <div>
                        <strong>{review.orderId || "Order ID missing"}</strong>
                        <span>
                          {review.reviewType.replaceAll("_", " ")}
                        </span>
                        <p>{review.reason}</p>
                        <small>
                          Created {formatDate(review.createdAt)}
                        </small>
                      </div>
                    </div>

                    <div className="review-actions">
                      <button
                        className="review-button approve"
                        onClick={() =>
                          decideReviewCase(review._id, "approved")
                        }
                      >
                        Approve
                      </button>

                      <button
                        className="review-button reject"
                        onClick={() =>
                          decideReviewCase(review._id, "rejected")
                        }
                      >
                        Reject
                      </button>

                      <button
                        className="review-button resolve"
                        onClick={() =>
                          decideReviewCase(review._id, "resolved")
                        }
                      >
                        Resolve
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {selectedItem && (
        <div className="claims-modal-backdrop">
          <form className="claims-modal" onSubmit={updateClaimStatus}>
            <h3>Update claim status</h3>
            <p>
              {selectedItem.orderId} · {selectedItem.partnerName}
            </p>

            <label>New status</label>
            <input
              value={decision.replaceAll("_", " ")}
              disabled
            />

            {decision === "recovered" && (
              <>
                <label>Recovered amount (₹)</label>
                <input
                  type="number"
                  min="0.01"
                  max={selectedItem.claimAmount}
                  step="0.01"
                  value={recoveredAmount}
                  onChange={(event) =>
                    setRecoveredAmount(event.target.value)
                  }
                  required
                />
              </>
            )}

            <label>Update note</label>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Explain this status update..."
              required
              maxLength={1000}
            />

            <div className="claims-modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setSelectedItem(null)}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="primary-button"
                disabled={saving}
              >
                {saving ? "Saving..." : "Confirm update"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default Claims;
