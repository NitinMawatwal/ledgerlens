import { useCallback, useEffect, useState } from "react";

import {
  RefreshCw,
  TrendingUp,
  Wallet,
  AlertCircle,
  CheckCircle2,
  Clock3,
  Receipt,
  LoaderCircle,
  BarChart3,
} from "lucide-react";

import api from "../services/api";
import "./Analytics.css";

const formatCurrency = (value) => {
  const amount = Number(value || 0);

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatDate = (value) => {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const AGE_BUCKETS = [
  "0-7 days",
  "8-15 days",
  "16-30 days",
  "Over 30 days",
];

function MetricCard({ title, value, description, icon: Icon }) {
  return (
    <div className="analytics-metric-card">
      <div className="analytics-metric-top">
        <span>{title}</span>
        <div className="analytics-metric-icon">
          <Icon size={19} />
        </div>
      </div>

      <strong>{value}</strong>
      <small>{description}</small>
    </div>
  );
}

function Analytics() {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const response = await api.get("/analytics/summary");

      setAnalytics(response.data.data || null);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to load analytics. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  if (loading) {
    return (
      <div className="analytics-page">
        <div className="analytics-loading">
          <LoaderCircle className="analytics-spin" size={25} />
          <span>Loading financial analytics...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="analytics-page">
        <div className="analytics-heading">
          <div>
            <span className="analytics-eyebrow">
              FINANCIAL INSIGHTS
            </span>
            <h1>Analytics</h1>
            <p>
              Understand financial exposure, partner performance
              and recoveries.
            </p>
          </div>

          <button
            className="analytics-refresh-button"
            onClick={loadAnalytics}
          >
            <RefreshCw size={16} />
            Retry
          </button>
        </div>

        <div className="analytics-error">
          <AlertCircle size={19} />
          {error}
        </div>
      </div>
    );
  }

  const reconciliation = analytics?.reconciliation || {};
  const claims = analytics?.claims || {};
  const taxes = analytics?.taxes || {};

  const partners = claims.partners || [];
  const taxPartners = taxes.partners || [];
  const performanceTrend = analytics?.performanceTrend || [];

  const maximumPartnerRisk = Math.max(
    1,
    ...partners.map((partner) =>
      Number(partner.outstandingAmount || 0)
    )
  );

  const maximumAgeRisk = Math.max(
    1,
    ...AGE_BUCKETS.map((bucket) =>
      Number(claims.ageBreakdown?.[bucket] || 0)
    )
  );

  const maximumTrendRisk = Math.max(
    1,
    ...performanceTrend.map((item) =>
      Number(item.moneyAtRisk || 0)
    )
  );

  return (
    <div className="analytics-page">
      <div className="analytics-heading">
        <div>
          <span className="analytics-eyebrow">
            FINANCIAL INSIGHTS
          </span>

          <h1>Analytics</h1>

          <p>
            Understand financial exposure, partner performance
            and recoveries.
          </p>
        </div>

        <button
          className="analytics-refresh-button"
          onClick={loadAnalytics}
          disabled={loading}
        >
          <RefreshCw size={16} />
          Refresh analytics
        </button>
      </div>

      <div className="analytics-last-run">
        <span>
          Latest reconciliation:
          {" "}
          <strong>
            {formatDate(reconciliation.completedAt)}
          </strong>
        </span>

        <span>
          {reconciliation.runId
            ? "Latest successful run"
            : "No completed reconciliation yet"}
        </span>
      </div>

      {/* Financial overview */}
      <section className="analytics-section">
        <div className="analytics-section-heading">
          <div>
            <h2>Financial overview</h2>
            <p>
              Current reconciliation and claims position.
            </p>
          </div>
        </div>

        <div className="analytics-metrics-grid">
          <MetricCard
            title="Money at risk"
            value={formatCurrency(reconciliation.moneyAtRisk)}
            description="From the latest reconciliation"
            icon={Wallet}
          />

          <MetricCard
            title="Outstanding claims"
            value={formatCurrency(claims.outstandingAmount)}
            description={`${claims.activeCount || 0} active claims`}
            icon={AlertCircle}
          />

          <MetricCard
            title="Money recovered"
            value={formatCurrency(claims.recoveredAmount)}
            description={`${claims.recoveredCount || 0} recovered claims`}
            icon={CheckCircle2}
          />

          <MetricCard
            title="Match rate"
            value={`${Number(reconciliation.matchRate || 0).toFixed(1)}%`}
            description={`${reconciliation.matchedOrders || 0} of ${
              reconciliation.totalOrders || 0
            } orders matched`}
            icon={TrendingUp}
          />
        </div>
      </section>

      {/* Partner exposure */}
      <section className="analytics-section">
        <div className="analytics-section-heading">
          <div>
            <h2>Money at risk by partner</h2>
            <p>
              Outstanding claim exposure grouped by marketplace,
              payment provider and courier.
            </p>
          </div>
        </div>

        <div className="analytics-panel">
          {partners.length === 0 ? (
            <div className="analytics-empty">
              No outstanding partner claims are available.
            </div>
          ) : (
            <div className="analytics-bars">
              {partners.map((partner) => {
                const amount = Number(
                  partner.outstandingAmount || 0
                );

                const width = Math.max(
                  0,
                  (amount / maximumPartnerRisk) * 100
                );

                return (
                  <div
                    className="analytics-bar-row"
                    key={partner.partnerKey}
                  >
                    <div className="analytics-bar-label">
                      <div>
                        <strong>{partner.partnerName}</strong>
                        <small>
                          {partner.partnerType} ·{" "}
                          {partner.claimCount} active claims
                        </small>
                      </div>

                      <strong>{formatCurrency(amount)}</strong>
                    </div>

                    <div className="analytics-bar-track">
                      <div
                        className="analytics-bar-fill"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Claim aging */}
      <section className="analytics-section">
        <div className="analytics-section-heading">
          <div>
            <h2>Outstanding claims by age</h2>
            <p>
              Prioritize older claims that need partner follow-up.
            </p>
          </div>
        </div>

        <div className="analytics-panel">
          <div className="analytics-age-grid">
            {AGE_BUCKETS.map((bucket) => {
              const amount = Number(
                claims.ageBreakdown?.[bucket] || 0
              );

              const width = Math.max(
                0,
                (amount / maximumAgeRisk) * 100
              );

              return (
                <div className="analytics-age-item" key={bucket}>
                  <div className="analytics-age-top">
                    <span>{bucket}</span>
                    <strong>{formatCurrency(amount)}</strong>
                  </div>

                  <div className="analytics-bar-track">
                    <div
                      className="analytics-bar-fill age-fill"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Tax summaries */}
      <section className="analytics-section">
        <div className="analytics-section-heading">
          <div>
            <h2>TCS and TDS summary</h2>
            <p>
              Partner-wise tax deductions, reported separately
              from financial leakage.
            </p>
          </div>
        </div>

        <div className="analytics-tax-summary">
          <div className="analytics-tax-card">
            <span>Total TCS</span>
            <strong>{formatCurrency(taxes.tcsAmount)}</strong>
            <small>Tax collected at source</small>
          </div>

          <div className="analytics-tax-card">
            <span>Total TDS</span>
            <strong>{formatCurrency(taxes.tdsAmount)}</strong>
            <small>Tax deducted at source</small>
          </div>
        </div>

        <div className="analytics-panel analytics-table-panel">
          {taxPartners.length === 0 ? (
            <div className="analytics-empty">
              No settlement tax records are available for the
              latest reconciliation.
            </div>
          ) : (
            <div className="analytics-table-wrapper">
              <table className="analytics-table">
                <thead>
                  <tr>
                    <th>PARTNER</th>
                    <th>TCS</th>
                    <th>TDS</th>
                  </tr>
                </thead>

                <tbody>
                  {taxPartners.map((partner) => (
                    <tr key={partner.partnerKey}>
                      <td>
                        <strong>{partner.partnerName}</strong>
                      </td>

                      <td>{formatCurrency(partner.tcsAmount)}</td>

                      <td>{formatCurrency(partner.tdsAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Reconciliation performance */}
      <section className="analytics-section">
        <div className="analytics-section-heading">
          <div>
            <h2>Reconciliation performance</h2>
            <p>
              Recent completed reconciliation runs.
            </p>
          </div>
        </div>

        <div className="analytics-metrics-grid analytics-performance-grid">
          <MetricCard
            title="Total orders"
            value={reconciliation.totalOrders || 0}
            description="Latest reconciliation"
            icon={BarChart3}
          />

          <MetricCard
            title="Settled orders"
            value={reconciliation.settledOrders || 0}
            description="Successfully settled"
            icon={CheckCircle2}
          />

          <MetricCard
            title="Short-paid orders"
            value={reconciliation.shortPaidOrders || 0}
            description="Payment discrepancies"
            icon={AlertCircle}
          />

          <MetricCard
            title="Freight overcharges"
            value={reconciliation.freightOverchargedOrders || 0}
            description="Rate card discrepancies"
            icon={Receipt}
          />
        </div>

        <div className="analytics-panel">
          {performanceTrend.length === 0 ? (
            <div className="analytics-empty">
              No reconciliation history is available yet.
            </div>
          ) : (
            <div className="analytics-trend-list">
              {performanceTrend.map((item, index) => {
                const width =
                  (Number(item.moneyAtRisk || 0) /
                    maximumTrendRisk) *
                  100;

                return (
                  <div
                    className="analytics-trend-item"
                    key={`${item.completedAt}-${index}`}
                  >
                    <div className="analytics-trend-heading">
                      <span>
                        {formatDate(item.completedAt)}
                      </span>

                      <strong>
                        {formatCurrency(item.moneyAtRisk)}
                      </strong>
                    </div>

                    <div className="analytics-bar-track">
                      <div
                        className="analytics-bar-fill trend-fill"
                        style={{ width: `${width}%` }}
                      />
                    </div>

                    <small>
                      {item.totalOrders} orders ·{" "}
                      {item.settledOrders} settled ·{" "}
                      {item.shortPaidOrders} short paid
                    </small>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <div className="analytics-footnote">
        <Clock3 size={15} />
        Analytics are based on the latest completed reconciliation
        and the current workspace claims.
      </div>
    </div>
  );
}

export default Analytics;