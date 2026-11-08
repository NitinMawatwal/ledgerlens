
import { useEffect, useState } from "react";
import {
  Routes,
  Route,
  Navigate,
  Outlet,
} from "react-router-dom";

import AppLayout from "./components/layouts/AppLayout";
import Login from "./pages/Login";

import Dashboard from "./pages/Dashboard";
import Reconciliation from "./pages/Reconciliation";
import Uploads from "./pages/Uploads";
import Claims from "./pages/Claims";
import Analytics from "./pages/Analytics";
import Settings from "./pages/Settings";

import {
  getCurrentUser,
  logoutUser,
} from "./services/auth";

function ProtectedLayout() {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    let active = true;

    async function verifySession() {
      const token = localStorage.getItem("ledgerlens_token");

      if (!token) {
        if (active) {
          setAuthenticated(false);
          setLoading(false);
        }
        return;
      }

      try {
        await getCurrentUser();

        if (active) {
          setAuthenticated(true);
        }
      } catch {
        logoutUser();

        if (active) {
          setAuthenticated(false);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    verifySession();

    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return <div className="auth-loading">Loading workspace...</div>;
  }

  if (!authenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<ProtectedLayout />}>
        <Route element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="reconciliation" element={<Reconciliation />} />
          <Route path="uploads" element={<Uploads />} />
          <Route path="claims" element={<Claims />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
