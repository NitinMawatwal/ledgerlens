
import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  ArrowLeftRight,
  FileUp,
  ClipboardList,
  ChartNoAxesCombined,
  ChevronDown,
  Building2,
  ShieldCheck,
} from "lucide-react";

import { getStoredUser } from "../../services/auth";

const navigationItems = [
  { label: "Overview", path: "/", icon: LayoutDashboard },
  { label: "Reconciliation", path: "/reconciliation", icon: ArrowLeftRight },
  { label: "File imports", path: "/uploads", icon: FileUp },
  { label: "Claims", path: "/claims", icon: ClipboardList },
  { label: "Analytics", path: "/analytics", icon: ChartNoAxesCombined },
];

const formatRole = (role) => {
  const roles = {
    co_founder: "Co-founder",
    finance_executive: "Finance Executive",
  };

  return roles[role] || role || "Workspace member";
};

const getInitials = (name) => {
  if (!name) return "W";

  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
};

function Sidebar() {
  const navigate = useNavigate();

  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const user = getStoredUser();

  const workspaceName = user?.workspaceName || "Haven & Thread";
  const userRole = formatRole(user?.role);

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">L</div>
        <div>
          <h2>ledgerlens</h2>
          <span>FINANCE OPERATIONS</span>
        </div>
      </div>

      <div className="sidebar-dropdown-container">
        <button
          type="button"
          className={`workspace ${
            workspaceOpen ? "dropdown-active" : ""
          }`}
          onClick={() => setWorkspaceOpen((previous) => !previous)}
          aria-expanded={workspaceOpen}
        >
          <div className="workspace-avatar">
            {getInitials(workspaceName)}
          </div>

          <div className="workspace-info">
            <strong>{workspaceName}</strong>
            <span>Finance workspace</span>
          </div>

          <ChevronDown
            size={15}
            className={workspaceOpen ? "chevron-open" : ""}
          />
        </button>

        {workspaceOpen && (
          <div className="sidebar-dropdown workspace-dropdown">
            <div className="dropdown-heading">CURRENT WORKSPACE</div>

            <div className="workspace-dropdown-current">
              <div className="workspace-avatar">
                {getInitials(workspaceName)}
              </div>

              <div>
                <strong>{workspaceName}</strong>
                <span>Active workspace</span>
              </div>

              <span className="active-indicator">Active</span>
            </div>

            <div className="dropdown-divider" />

            <div className="workspace-detail">
              <Building2 size={15} />
              <span>Finance operations workspace</span>
            </div>

            <div className="workspace-detail">
              <ShieldCheck size={15} />
              <span>Your role: {userRole}</span>
            </div>

            <button
              type="button"
              className="dropdown-action"
              onClick={() => {
                setWorkspaceOpen(false);
                navigate("/settings");
              }}
            >
              Workspace settings
            </button>

            <p className="dropdown-note">
              Your account currently has one active workspace.
            </p>
          </div>
        )}
      </div>

      <div className="nav-section">
        <span className="nav-heading">WORKSPACE</span>

        {navigationItems.map(({ label, path, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            end={path === "/"}
            className={({ isActive }) =>
              `sidebar-item ${isActive ? "active" : ""}`
            }
            onClick={() => setWorkspaceOpen(false)}
          >
            <Icon size={18} strokeWidth={1.8} />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </aside>
  );
}

export default Sidebar;
