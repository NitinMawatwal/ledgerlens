
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowDownRight,
  ArrowUpRight,
  CircleAlert,
  CheckCircle2,
  Clock3,
  IndianRupee,
  Package,
  Plus,
  Wallet,
} from "lucide-react";
import api from "../services/api";

const formatCurrency = (amount) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount || 0);

const formatDate = (date) => {
  if (!date) return "—";

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
};

const formatNumber = (number) =>
  new Intl.NumberFormat("en-IN").format(number || 0);

const getGreeting = () => {
  const hour = new Date().getHours();

  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
};

const getStatusLabel = (status) => {
  const labels = {
    short_paid: "Short paid",
    unpaid_past_due: "Unpaid",
    freight_overcharged: "Overcharged",
    needs_review: "Needs review",
  };

  return labels[status] || status;
};

function MetricCard({ label, value, note, icon: Icon, variant }) {
  return (
    <div className="metric-card">
      <div className="metric-top">
        <span>{label}</span>
        <div className={`metric-icon ${variant}`}>
          <Icon size={19} strokeWidth={1.8} />
        </div>
      </div>

      <h2>{value}</h2>
      <p>{note}</p>
    </div>
  );
}

function StatusBadge({ status }) {
  const className = status.toLowerCase().replaceAll(" ", "-");

  return (
    <span className={`status-badge ${className}`}>
      <span className="status-dot" />
      {status}
    </span>
  );
}

function Dashboard() {
  const navigate = useNavigate();

  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    const fetchDashboard = async () => {
      try {
        setLoading(true);
        setError("");

        const response = await api.get("/dashboard/summary");

        if (isMounted) {
          setDashboard(response.data.data);
        }
      } catch (err) {
        if (isMounted) {
          setError(
            err.response?.data?.message ||
              "Unable to load dashboard data. Please try again.",
          );
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchDashboard();

    return () => {
      isMounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="dashboard-content">
        <section className="page-heading">
          <div>
            <span className="eyebrow">FINANCE OVERVIEW</span>
            <h1>Loading dashboard...</h1>
            <p>Fetching your latest reconciliation data.</p>
          </div>
        </section>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-content">
        <section className="page-heading">
          <div>
            <span className="eyebrow">FINANCE OVERVIEW</span>
            <h1>Dashboard unavailable</h1>
            <p>{error}</p>
          </div>

          <button
            className="primary-button"
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </section>
      </div>
    );
  }

  const reconciliation = dashboard?.reconciliation || {};
  const claims = dashboard?.claims || {};
  const exposure = reconciliation.exposureBreakdown || {};

  const totalOrders = reconciliation.totalOrders || 0;
  const matchedOrders = reconciliation.matchedOrders || 0;
  const matchRate = reconciliation.matchRate || 0;
  const moneyAtRisk = reconciliation.moneyAtRisk || 0;

  const activeClaims = claims.activeCount || 0;
  const outstandingAmount = claims.outstandingAmount || 0;
  const recoveredAmount = claims.recoveredAmount || 0;

  const shortPaid = exposure.shortPaid || 0;
  const unpaid = exposure.unpaid || 0;
  const freightOvercharged = exposure.freightOvercharged || 0;
  const otherExposure = exposure.other || 0;

  const totalExposure =
    shortPaid + unpaid + freightOvercharged + otherExposure;

  const getBarWidth = (amount) =>
    totalExposure > 0 ? `${(amount / totalExposure) * 100}%` : "0%";

  const recentDiscrepancies = reconciliation.recentDiscrepancies || [];

  const exceptions = [
    {
      label: "Unpaid settlements",
      description: "Orders awaiting payment",
      count: reconciliation.unpaidOrders || 0,
      icon: IndianRupee,
      variant: "red-bg",
    },
    {
      label: "Short payments",
      description: "Orders with payment differences",
      count: reconciliation.shortPaidOrders || 0,
      icon: ArrowDownRight,
      variant: "amber-bg",
    },
    {
      label: "Freight discrepancies",
      description: "Charges exceeding expected freight",
      count: reconciliation.freightOverchargedOrders || 0,
      icon: Wallet,
      variant: "blue-bg",
    },
  ];

  return (
    <div className="dashboard-content">
      <section className="page-heading">
        <div>
          <div className="eyebrow">
            {new Date().toLocaleDateString("en-IN", {
              weekday: "long",
              day: "2-digit",
              month: "long",
              year: "numeric",
            }).toUpperCase()}
          </div>
          <h1>{getGreeting()}.</h1>
          <p>Here's what's happening with your reconciliations.</p>
        </div>

        <button
          className="primary-button"
          onClick={() => navigate("/uploads")}
        >
          <Plus size={17} />
          Import files
        </button>
      </section>

      <section className="metrics-grid">
        <MetricCard
          label="Total orders"
          value={formatNumber(totalOrders)}
          note="In the latest reconciliation"
          icon={Package}
          variant="blue"
        />

        <MetricCard
          label="Successfully matched"
          value={formatNumber(matchedOrders)}
          note={`${matchRate.toFixed(1)}% match rate`}
          icon={CheckCircle2}
          variant="green"
        />

        <MetricCard
          label="Money at risk"
          value={formatCurrency(moneyAtRisk)}
          note="Across identified discrepancies"
          icon={IndianRupee}
          variant="amber"
        />

        <MetricCard
          label="Pending claims"
          value={formatNumber(activeClaims)}
          note={`${formatCurrency(outstandingAmount)} awaiting recovery`}
          icon={Clock3}
          variant="red"
        />
      </section>

      <section className="insight-row">
        <div className="insight-main">
          <div className="section-heading">
            <div>
              <span className="eyebrow">FINANCIAL EXPOSURE</span>
              <h3>Money at risk</h3>
            </div>
            <span className="muted-label">
              Latest reconciliation
            </span>
          </div>

          <div className="exposure-value">
            {formatCurrency(moneyAtRisk)}
          </div>

          <p className="exposure-caption">
            Total amount identified across reconciliation discrepancies.
          </p>

          <div className="exposure-bar">
            <div
              className="bar-short"
              style={{ width: getBarWidth(shortPaid) }}
            />
            <div
              className="bar-unpaid"
              style={{ width: getBarWidth(unpaid) }}
            />
            <div
              className="bar-freight"
              style={{ width: getBarWidth(freightOvercharged + otherExposure) }}
            />
          </div>

          <div className="legend">
            <span>
              <i className="dot amber-dot" /> Short paid{" "}
              <strong>{formatCurrency(shortPaid)}</strong>
            </span>

            <span>
              <i className="dot red-dot" /> Unpaid{" "}
              <strong>{formatCurrency(unpaid)}</strong>
            </span>

            <span>
              <i className="dot blue-dot" /> Freight overcharged{" "}
              <strong>{formatCurrency(freightOvercharged)}</strong>
            </span>

            {otherExposure > 0 && (
              <span>
                Other <strong>{formatCurrency(otherExposure)}</strong>
              </span>
            )}
          </div>

          <div className="exposure-caption">
            TCS: {formatCurrency(reconciliation.tcsAmount)} · TDS:{" "}
            {formatCurrency(reconciliation.tdsAmount)} (reported separately)
          </div>
        </div>

        <div className="insight-side">
          <div className="section-heading">
            <div>
              <span className="eyebrow">NEEDS ATTENTION</span>
              <h3>Open exceptions</h3>
            </div>
            <CircleAlert size={19} className="attention-icon" />
          </div>

          {exceptions.map((item) => {
            const Icon = item.icon;

            return (
              <div className="exception-item" key={item.label}>
                <div className={`exception-icon ${item.variant}`}>
                  <Icon size={17} />
                </div>

                <div>
                  <strong>{item.label}</strong>
                  <span>{item.description}</span>
                </div>

                <b>{formatNumber(item.count)}</b>
              </div>
            );
          })}

          <div className="exception-item">
            <div className="exception-icon blue-bg">
              <Package size={17} />
            </div>
            <div>
              <strong>Returns not received</strong>
              <span>Awaiting warehouse confirmation</span>
            </div>
            <b>{formatNumber(reconciliation.returnsNotReceived)}</b>
          </div>
        </div>
      </section>

      <section className="transactions-section">
        <div className="section-heading transaction-heading">
          <div>
            <span className="eyebrow">LATEST ACTIVITY</span>
            <h3>Recent discrepancies</h3>
          </div>

          <button
            className="text-button"
            onClick={() => navigate("/reconciliation")}
          >
            View all <ArrowUpRight size={15} />
          </button>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>ORDER ID</th>
                <th>PARTNER</th>
                <th>DATE</th>
                <th>EXPECTED</th>
                <th>RECEIVED</th>
                <th>DIFFERENCE</th>
                <th>STATUS</th>
              </tr>
            </thead>

            <tbody>
              {recentDiscrepancies.length > 0 ? (
                recentDiscrepancies.map((item, index) => {
                  const isFreight = item.status === "freight_overcharged";
                  const difference = Math.abs(item.difference || 0);

                  return (
                    <tr key={`${item.orderId}-${item.status}-${index}`}>
                      <td className="order-id">{item.orderId}</td>
                      <td>{item.partner || "—"}</td>
                      <td className="muted-cell">
                        {formatDate(item.createdAt)}
                      </td>
                      <td>{formatCurrency(item.expected)}</td>
                      <td>{formatCurrency(item.actual)}</td>
                      <td className="negative">
                        {isFreight ? "+" : "-"}
                        {formatCurrency(difference)}
                      </td>
                      <td>
                        <StatusBadge
                          status={getStatusLabel(item.status)}
                        />
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="7" className="muted-cell">
                    No discrepancies found in the latest reconciliation.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="table-footer">
          <span>
            Showing {recentDiscrepancies.length} recent discrepancies
          </span>
          <button
            className="text-button"
            onClick={() => navigate("/reconciliation")}
          >
            View reconciliation <ArrowUpRight size={14} />
          </button>
        </div>
      </section>

      <section className="insight-row">
        <div className="insight-main">
          <div className="section-heading">
            <div>
              <span className="eyebrow">CLAIMS RECOVERY</span>
              <h3>Recovery overview</h3>
            </div>
          </div>

          <div className="exposure-value">
            {formatCurrency(recoveredAmount)}
          </div>
          <p className="exposure-caption">
            Amount recovered from {formatNumber(claims.recoveredCount)} claims.
          </p>

          <div className="exposure-caption">
            Outstanding: <strong>{formatCurrency(outstandingAmount)}</strong>
          </div>
        </div>

        <div className="insight-side">
          <div className="section-heading">
            <div>
              <span className="eyebrow">CLAIM AGING</span>
              <h3>Outstanding by age</h3>
            </div>
          </div>

          {Object.entries(claims.ageBreakdown || {}).map(([age, amount]) => (
            <div className="exception-item" key={age}>
              <div>
                <strong>{age}</strong>
              </div>
              <b>{formatCurrency(amount)}</b>
            </div>
          ))}
        </div>
      </section>

      <footer className="dashboard-footer">
        <span>LedgerLens · Finance operations</span>
        <span>
          {reconciliation.runId
            ? `Latest run · ${reconciliation.runId}`
            : "No reconciliation run yet"}
        </span>
      </footer>
    </div>
  );
}

export default Dashboard;
