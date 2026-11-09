
import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Settings,
  CircleHelp,
  ChevronDown,
  UserRound,
  Mail,
  LogOut,
} from "lucide-react";

import Sidebar from "./sidebar";
import { getStoredUser, logoutUser } from "../../services/auth";

const pageTitles = {
  "/": "Overview",
  "/reconciliation": "Reconciliation",
  "/uploads": "File imports",
  "/claims": "Claims",
  "/analytics": "Analytics",
  "/settings": "Workspace settings",
  "/account-settings": "Account settings",
};

const formatRole = (role) => {
  const roles = {
    co_founder: "Co-founder",
    finance_executive: "Finance Executive",
  };

  return roles[role] || role || "Workspace member";
};

const getInitials = (name) => {
  if (!name) return "U";

  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
};

function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  const [profileOpen, setProfileOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const currentTitle = pageTitles[location.pathname] || "LedgerLens";
  const user = getStoredUser();

  const userName = user?.name || "User";
  const userEmail = user?.email || "Email unavailable";
  const userRole = formatRole(user?.role);

  const handleLogout = () => {
    setProfileOpen(false);
    logoutUser();
    navigate("/login", { replace: true });
  };

  const openWorkspaceSettings = () => {
    setProfileOpen(false);
    navigate("/settings");
  };

  const openAccountSettings = () => {
    setProfileOpen(false);
    navigate("/account-settings");
  };

  return (
    <div className="app-shell">
      <Sidebar />

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span>
            <strong>{currentTitle}</strong>
          </div>

          <div className="topbar-actions">
            <button
              type="button"
              className="header-icon-button"
              title="Workspace settings"
              aria-label="Open workspace settings"
              onClick={openWorkspaceSettings}
            >
              <Settings size={19} />
            </button>

            <button
              type="button"
              className="header-icon-button"
              title="Help"
              aria-label="Help"
              onClick={() => navigate("/settings")}
            >
              <CircleHelp size={19} />
            </button>

            <div className="header-profile-container">
              <button
                type="button"
                className={`header-profile-button ${
                  profileOpen ? "profile-active" : ""
                }`}
                onClick={() => {
                  setProfileOpen((previous) => !previous);
                  setDetailsOpen(false);
                }}
                aria-expanded={profileOpen}
                aria-label="Open user profile menu"
              >
                <span className="header-avatar">
                  {getInitials(userName)}
                </span>

                <ChevronDown
                  size={14}
                  className={profileOpen ? "chevron-open" : ""}
                />
              </button>

              {profileOpen && (
                <div className="header-profile-dropdown">
                  <div className="header-profile-info">
                    <span className="header-avatar large">
                      {getInitials(userName)}
                    </span>

                    <div>
                      <strong>{userName}</strong>
                      <span>{userRole}</span>
                    </div>
                  </div>

                  <div className="dropdown-divider" />

                  <button
                    type="button"
                    className="header-dropdown-item"
                    onClick={() =>
                      setDetailsOpen((previous) => !previous)
                    }
                  >
                    <UserRound size={16} />
                    My profile

                    <ChevronDown
                      size={13}
                      className={detailsOpen ? "chevron-open" : ""}
                    />
                  </button>

                  {detailsOpen && (
                    <div className="header-profile-details">
                      <Mail size={14} />
                      <span>{userEmail}</span>
                    </div>
                  )}

                  <button
                    type="button"
                    className="header-dropdown-item"
                    onClick={openAccountSettings}
                  >
                    <Settings size={16} />
                    Account settings
                  </button>

                  <div className="dropdown-divider" />

                  <button
                    type="button"
                    className="header-dropdown-item logout-action"
                    onClick={handleLogout}
                  >
                    <LogOut size={16} />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <Outlet />
      </main>
    </div>
  );
}

export default AppLayout;
