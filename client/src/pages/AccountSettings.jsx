
import { useEffect, useState } from "react";
import {
  UserRound,
  Mail,
  ShieldCheck,
  LockKeyhole,
  Save,
} from "lucide-react";

import api from "../services/api";
import { getStoredUser } from "../services/auth";

const roleLabels = {
  co_founder: "Co-founder",
  finance_executive: "Finance Executive",
};

function AccountSettings() {
  const storedUser = getStoredUser();

  const [name, setName] = useState(storedUser?.name || "");
  const [email, setEmail] = useState(storedUser?.email || "");
  const [role, setRole] = useState(storedUser?.role || "");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [profileSaving, setProfileSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);

  const [profileMessage, setProfileMessage] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadAccount() {
      try {
        const response = await api.get("/account/settings");
        const user = response.data.data.user;

        if (!active) return;

        setName(user.name || "");
        setEmail(user.email || "");
        setRole(user.role || "");

        localStorage.setItem("ledgerlens_user", JSON.stringify(user));
      } catch (err) {
        if (active) {
          setError(
            err.response?.data?.message ||
              "Unable to load account details."
          );
        }
      }
    }

    loadAccount();

    return () => {
      active = false;
    };
  }, []);

  const handleProfileSave = async (event) => {
    event.preventDefault();

    if (name.trim().length < 2 || name.trim().length > 80) {
      setError("Name must contain 2 to 80 characters.");
      return;
    }

    try {
      setProfileSaving(true);
      setError("");
      setProfileMessage("");

      const response = await api.patch("/account/settings", {
        name: name.trim(),
      });

      const updatedUser = response.data.data.user;

      localStorage.setItem(
        "ledgerlens_user",
        JSON.stringify(updatedUser)
      );

      setName(updatedUser.name);
      setEmail(updatedUser.email);
      setRole(updatedUser.role);

      setProfileMessage("Profile updated successfully.");
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to update your profile."
      );
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordChange = async (event) => {
    event.preventDefault();

    setError("");
    setPasswordMessage("");

    if (newPassword.length < 8) {
      setError("New password must contain at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    try {
      setPasswordSaving(true);

      const response = await api.patch("/account/password", {
        currentPassword,
        newPassword,
      });

      setPasswordMessage(
        response.data.message || "Password changed successfully."
      );

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to change your password."
      );
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-heading">
        <span className="section-eyebrow">PERSONAL PREFERENCES</span>
        <h1>Account settings</h1>
        <p>Manage your personal information and account security.</p>
      </div>

      {error && (
        <div className="settings-feedback error">
          {error}
        </div>
      )}

      <div className="account-settings-layout">
        <section className="settings-card">
          <div className="settings-card-heading">
            <div className="settings-icon">
              <UserRound size={20} />
            </div>

            <div>
              <h2>Personal information</h2>
              <p>Update the name associated with your account.</p>
            </div>
          </div>

          <form onSubmit={handleProfileSave}>
            <label className="settings-field">
              Full name

              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                minLength={2}
                maxLength={80}
                required
              />
            </label>

            <label className="settings-field">
              Email address

              <div className="account-readonly-field">
                <Mail size={16} />
                <input type="email" value={email} disabled />
              </div>

              <small>Email address cannot currently be changed.</small>
            </label>

            <div className="settings-readonly-row">
              <span>Account role</span>
              <strong>{roleLabels[role] || role}</strong>
            </div>

            {profileMessage && (
              <div className="settings-feedback success">
                <ShieldCheck size={16} />
                {profileMessage}
              </div>
            )}

            <button
              type="submit"
              className="settings-save-button"
              disabled={profileSaving}
            >
              <Save size={16} />
              {profileSaving ? "Saving..." : "Save profile"}
            </button>
          </form>
        </section>

        <section className="settings-card">
          <div className="settings-card-heading">
            <div className="settings-icon">
              <LockKeyhole size={20} />
            </div>

            <div>
              <h2>Change password</h2>
              <p>Verify your current password before changing it.</p>
            </div>
          </div>

          <form onSubmit={handlePasswordChange}>
            <label className="settings-field">
              Current password

              <input
                type="password"
                value={currentPassword}
                onChange={(event) =>
                  setCurrentPassword(event.target.value)
                }
                autoComplete="current-password"
                required
              />
            </label>

            <label className="settings-field">
              New password

              <input
                type="password"
                value={newPassword}
                onChange={(event) =>
                  setNewPassword(event.target.value)
                }
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                required
              />
            </label>

            <label className="settings-field">
              Confirm new password

              <input
                type="password"
                value={confirmPassword}
                onChange={(event) =>
                  setConfirmPassword(event.target.value)
                }
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                required
              />
            </label>

            {passwordMessage && (
              <div className="settings-feedback success">
                <ShieldCheck size={16} />
                {passwordMessage}
              </div>
            )}

            <button
              type="submit"
              className="settings-save-button"
              disabled={passwordSaving}
            >
              <LockKeyhole size={16} />
              {passwordSaving ? "Updating..." : "Change password"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

export default AccountSettings;
