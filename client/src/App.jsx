
import { Routes, Route } from "react-router-dom";

import AppLayout from "./components/layouts/AppLayout";
import Dashboard from "./pages/Dashboard";
import Reconciliation from "./pages/Reconciliation";
import Uploads from "./pages/Uploads";
import Claims from "./pages/Claims";
import Analytics from "./pages/Analytics";
import Settings from "./pages/Settings";

function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="reconciliation" element={<Reconciliation />} />
        <Route path="uploads" element={<Uploads />} />
        <Route path="claims" element={<Claims />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}

export default App;
