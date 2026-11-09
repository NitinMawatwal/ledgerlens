
import { useEffect, useState } from "react";
import {
  Building2,
  Wallet,
  Save,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import api from "../services/api";
import { getStoredUser } from "../services/auth";

function Settings() {
  const user = getStoredUser();
  const isCoFounder = user?.role === "co_founder";

  const [settings, setSettings] = useState({
    name: "",
    currency: "INR",
    reconciliationTolerance: 10,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadSettings = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await api.get("/workspace/settings");
      const workspace = response.data.data.workspace;

      setSettings({
        name: workspace.name || "",
        currency: workspace.settings.currency || "INR",
        reconciliationTolerance:
          workspace.settings.reconciliationTolerance ?? 10,
      });
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to load workspace settings."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleChange = (event) => {
    const { name, value } = event.target;

    setSettings((previous) => ({
      ...previous,
      [name]:
        name === "reconciliationTolerance"
          ? value === ""
            ? ""
            : Number(value)
          : value,
    }));
  };

  const handleSave = async (event) => {
    event.preventDefault();

    if (!isCoFounder) return;

    if (!settings.name.trim()) {
      setError("Workspace name is required.");
      return;
    }

    if (
      settings.reconciliationTolerance === "" ||
      !Number.isFinite(settings.reconciliationTolerance) ||
      settings.reconciliationTolerance < 0 ||
      settings.reconciliationTolerance > 10000
    ) {
      setError("Tolerance must be between 0 and 10000.");
      return;
    }

    try {
      setSaving(true);
      setMessage("");
      setError("");

      const response = await api.patch("/workspace/settings", settings);

      const workspace = response.data.data.workspace;

      setSettings({
        name: workspace.name,
        currency: workspace.settings.currency,
        reconciliationTolerance:
          workspace.settings.reconciliationTolerance,
      });

      setMessage("Workspace settings saved successfully.");
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to save workspace settings."
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="settings-page-loading">
        <RefreshCw size={18} className="settings-spin" />
        Loading workspace settings...
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-heading">
        <span className="section-eyebrow">WORKSPACE MANAGEMENT</span>
        <h1>Workspace settings</h1>
        <p>Configure your workspace and reconciliation preferences.</p>
      </div>

      {message && (
        <div className="settings-feedback success">
          <ShieldCheck size={17} />
          {message}
        </div>
      )}

      {error && (
        <div className="settings-feedback error">
          {error}
        </div>
      )}

      <form onSubmit={handleSave}>
        <div className="settings-grid">
          <section className="settings-card">
            <div className="settings-card-heading">
              <div className="settings-icon">
                <Building2 size={20} />
              </div>

              <div>
                <h2>Workspace information</h2>
                <p>Manage your finance workspace identity.</p>
              </div>
            </div>

            <label className="settings-field">
              Workspace name

              <input
                type="text"
                name="name"
                value={settings.name}
                onChange={handleChange}
                minLength={2}
                maxLength={100}
                disabled={!isCoFounder}
                required
              />
            </label>

            <div className="settings-readonly-row">
              <span>Your role</span>
              <strong>
                {isCoFounder ? "Co-founder" : "Finance Executive"}
              </strong>
            </div>
          </section>

          <section className="settings-card">
            <div className="settings-card-heading">
              <div className="settings-icon">
                <Wallet size={20} />
              </div>

              <div>
                <h2>Finance configuration</h2>
                <p>Configure currency and reconciliation tolerance.</p>
              </div>
            </div>

            <label className="settings-field">
              Workspace currency

              <select
                name="currency"
                value={settings.currency}
                onChange={handleChange}
                disabled={!isCoFounder}
              >
                <option value="INR">INR - Indian Rupee (₹)</option>
                <option value="USD">USD - US Dollar ($)</option>
                <option value="AUD">AUD - Australian Dollar ($)</option>
                <option value="GBP">GBP - British Pound (£)</option>
                <option value="EUR">EUR - Euro (€)</option>
              </select>
            </label>

            <label className="settings-field">
              Reconciliation tolerance

              <div className="settings-input-with-prefix">
                <span>{settings.currency}</span>
                <input
                  type="number"
                  name="reconciliationTolerance"
                  min="0"
                  max="10000"
                  step="0.01"
                  value={settings.reconciliationTolerance}
                  onChange={handleChange}
                  disabled={!isCoFounder}
                />
              </div>

              <small>
                Differences within this amount are treated as acceptable
                during reconciliation.
              </small>
            </label>
          </section>
        </div>

        {!isCoFounder && (
          <div className="settings-notice">
            <ShieldCheck size={19} />
            <div>
              <strong>Read-only access</strong>
              <p>
                Only the Co-founder can modify workspace-wide settings.
              </p>
            </div>
          </div>
        )}

        {isCoFounder && (
          <div className="settings-actions">
            <button
              type="button"
              className="settings-secondary-button"
              onClick={loadSettings}
              disabled={saving}
            >
              Reset
            </button>

            <button
              type="submit"
              className="settings-save-button"
              disabled={saving}
            >
              <Save size={16} />
              {saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}

export default Settings;
