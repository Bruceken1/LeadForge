import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { useEffect } from "react";
import { setToken } from "@/lib/api";

// Auth pages
import Landing      from "@/pages/Landing";
import Login        from "@/pages/Login";
import Register     from "@/pages/Register";
import AuthCallback from "@/pages/AuthCallback";
import Pricing          from "@/pages/Pricing";
import PaymentCallback  from "@/pages/PaymentCallback";

// App pages
import AgentDashboard      from "@/pages/AgentDashboard";
import AutonomousDashboard from "@/pages/AutonomousDashboard";
import Overview     from "@/pages/Overview";
import Leads        from "@/pages/Leads";
import Campaigns    from "@/pages/Campaigns";
import Templates    from "@/pages/Templates";
import Pipeline     from "@/pages/Pipeline";
import Automation   from "@/pages/Automation";
import SettingsPage from "@/pages/Settings";
import CRM          from "@/pages/CRM";
import NotFound     from "@/pages/NotFound";

import { ProtectedRoute } from "@/components/ProtectedRoute";

const qc = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 }
  }
});

function TokenSync() {
  const { accessToken } = useAuth();
  useEffect(() => { setToken(accessToken); }, [accessToken]);
  return null;
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <TokenSync />
        <Router>
          <Routes>
            <Route path="/"               element={<Landing />} />
            <Route path="/payment/callback" element={<PaymentCallback />} />
            <Route path="/login"          element={<Login />} />
            <Route path="/register"       element={<Register />} />
            <Route path="/auth/callback"  element={<AuthCallback />} />
            <Route path="/pricing"        element={<Pricing />} />

            {/* Protected routes */}
            <Route path="/home"          element={<ProtectedRoute><Overview /></ProtectedRoute>} />
            <Route path="/leads"         element={<ProtectedRoute><Leads /></ProtectedRoute>} />
            <Route path="/crm"           element={<ProtectedRoute><CRM /></ProtectedRoute>} />
            <Route path="/campaigns"     element={<ProtectedRoute><Campaigns /></ProtectedRoute>} />
            <Route path="/templates"     element={<ProtectedRoute><Templates /></ProtectedRoute>} />
            <Route path="/pipeline"      element={<ProtectedRoute><Pipeline /></ProtectedRoute>} />
            <Route path="/automation"    element={<ProtectedRoute><Automation /></ProtectedRoute>} />
            <Route path="/settings"      element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
            <Route path="/agent"         element={<ProtectedRoute><AgentDashboard /></ProtectedRoute>} />

            {/* NEW: Autonomous AI SDR Dashboard */}
            <Route path="/autonomous"    element={<ProtectedRoute><AutonomousDashboard /></ProtectedRoute>} />

            <Route path="*"              element={<NotFound />} />
          </Routes>
        </Router>
        <Toaster position="top-center" richColors closeButton />
      </AuthProvider>
    </QueryClientProvider>
  );
}
