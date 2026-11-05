
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

const transactions = [
  {
    id: "ORD-W-204118",
    partner: "Website",
    date: "05 Nov 2026",
    expected: "₹1,409.00",
    received: "₹0.00",
    difference: "-₹1,409.00",
    status: "Unpaid",
  },
  {
    id: "ORD-M-88120",
    partner: "Marketplace 1",
    date: "04 Nov 2026",
    expected: "₹899.00",
    received: "₹862.00",
    difference: "-₹37.00",
    status: "Short paid",
  },
  {
    id: "ORD-W-204377",
    partner: "Website",
    date: "04 Nov 2026",
    expected: "-₹96.00",
    received: "-₹142.00",
    difference: "-₹46.00",
    status: "Overcharged",
  },
  {
    id: "ORD-W-204401",
    partner: "Website",
    date: "03 Nov 2026",
    expected: "₹2,180.00",
    received: "₹2,180.00",
    difference: "₹0.00",
    status: "Settled",
  },
];

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

  return (
    <div className="dashboard-content">
      <section className="page-heading">
        <div>
          <div className="eyebrow">THURSDAY, 05 NOVEMBER 2026</div>
          <h1>Good morning, Arjun.</h1>
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
          value="30,000"
          note="Across all sales channels"
          icon={Package}
          variant="blue"
        />

        <MetricCard
          label="Successfully matched"
          value="28,460"
          note="94.9% match rate"
          icon={CheckCircle2}
          variant="green"
        />

        <MetricCard
          label="Money at risk"
          value="₹4.82L"
          note="Across 1,240 exceptions"
          icon={IndianRupee}
          variant="amber"
        />

        <MetricCard
          label="Pending claims"
          value="186"
          note="₹2.14L awaiting recovery"
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
            <span className="muted-label">November 2026</span>
          </div>

          <div className="exposure-value">₹4,82,450</div>
          <p className="exposure-caption">
            Total amount identified across unresolved discrepancies.
          </p>

          <div className="exposure-bar">
            <div className="bar-short" />
            <div className="bar-unpaid" />
            <div className="bar-freight" />
          </div>

          <div className="legend">
            <span>
              <i className="dot amber-dot" /> Short paid <strong>₹1.84L</strong>
            </span>
            <span>
              <i className="dot red-dot" /> Unpaid <strong>₹2.14L</strong>
            </span>
            <span>
              <i className="dot blue-dot" /> Other <strong>₹0.84L</strong>
            </span>
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

          <div className="exception-item">
            <div className="exception-icon red-bg">
              <IndianRupee size={17} />
            </div>
            <div>
              <strong>Unpaid settlements</strong>
              <span>42 orders need follow-up</span>
            </div>
            <b>42</b>
          </div>

          <div className="exception-item">
            <div className="exception-icon amber-bg">
              <ArrowDownRight size={17} />
            </div>
            <div>
              <strong>Short payments</strong>
              <span>96 orders have a difference</span>
            </div>
            <b>96</b>
          </div>

          <div className="exception-item">
            <div className="exception-icon blue-bg">
              <Wallet size={17} />
            </div>
            <div>
              <strong>Freight discrepancies</strong>
              <span>48 charges need review</span>
            </div>
            <b>48</b>
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
                <th>CHANNEL</th>
                <th>DATE</th>
                <th>EXPECTED</th>
                <th>RECEIVED</th>
                <th>DIFFERENCE</th>
                <th>STATUS</th>
              </tr>
            </thead>

            <tbody>
              {transactions.map((transaction) => (
                <tr key={transaction.id}>
                  <td className="order-id">{transaction.id}</td>
                  <td>{transaction.partner}</td>
                  <td className="muted-cell">{transaction.date}</td>
                  <td>{transaction.expected}</td>
                  <td>{transaction.received}</td>
                  <td
                    className={
                      transaction.difference === "₹0.00"
                        ? "positive"
                        : "negative"
                    }
                  >
                    {transaction.difference}
                  </td>
                  <td>
                    <StatusBadge status={transaction.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="table-footer">
          <span>Showing 4 sample transactions</span>
          <button
            className="text-button"
            onClick={() => navigate("/reconciliation")}
          >
            View reconciliation <ArrowUpRight size={14} />
          </button>
        </div>
      </section>

      <footer className="dashboard-footer">
        <span>LedgerLens · Finance operations</span>
        <span>Demo workspace · Sample data</span>
      </footer>
    </div>
  );
}

export default Dashboard;
