
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  ArrowLeftRight,
  FileUp,
  ClipboardList,
  ChartNoAxesCombined,
  Settings as SettingsIcon,
  ChevronDown,
  MoreHorizontal,
} from "lucide-react";

const navigationItems = [
  { label: "Overview", path: "/", icon: LayoutDashboard },
  { label: "Reconciliation", path: "/reconciliation", icon: ArrowLeftRight },
  { label: "File imports", path: "/uploads", icon: FileUp },
  { label: "Claims", path: "/claims", icon: ClipboardList },
  { label: "Analytics", path: "/analytics", icon: ChartNoAxesCombined },
];

function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">L</div>
        <div>
          <h2>ledgerlens</h2>
          <span>FINANCE OPERATIONS</span>
        </div>
      </div>

      <div className="workspace">
        <div className="workspace-avatar">HT</div>
        <div className="workspace-info">
          <strong>Haven &amp; Thread</strong>
          <span>Finance workspace</span>
        </div>
        <ChevronDown size={15} />
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
          >
            <Icon size={18} strokeWidth={1.8} />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>

      <div className="sidebar-bottom">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `sidebar-item ${isActive ? "active" : ""}`
          }
        >
          <SettingsIcon size={18} strokeWidth={1.8} />
          <span>Settings</span>
        </NavLink>

        <div className="profile">
          <div className="profile-avatar">AK</div>
          <div className="profile-info">
            <strong>Arjun Kumar</strong>
            <span>Finance executive</span>
          </div>
          <MoreHorizontal size={18} />
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;
