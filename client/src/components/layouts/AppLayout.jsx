
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./sidebar";

const pageTitles = {
  "/": "Overview",
  "/reconciliation": "Reconciliation",
  "/uploads": "File imports",
  "/claims": "Claims",
  "/analytics": "Analytics",
  "/settings": "Settings",
};

function AppLayout() {
  const location = useLocation();
  const currentTitle = pageTitles[location.pathname] || "LedgerLens";

  return (
    <div className="app-shell">
      <Sidebar />

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span>
            <strong>{currentTitle}</strong>
          </div>
        </header>

        <Outlet />
      </main>
    </div>
  );
}

export default AppLayout;
