# Integrating LeadForge Agent into LeadEngine Frontend

## Step 1 — Add env variable

In your LeadEngine `.env`:
```
VITE_AGENT_API_URL=http://YOUR_VULTR_IP:8000
```

## Step 2 — Copy the dashboard page

Copy `frontend/src/pages/AgentDashboard.tsx` into your LeadEngine project at:
`src/pages/AgentDashboard.tsx`

## Step 3 — Add the route in App.tsx

```tsx
// Add import at top
import AgentDashboard from "@/pages/AgentDashboard";

// Add route inside <Routes> (protected)
<Route path="/agent" element={<ProtectedRoute><AgentDashboard /></ProtectedRoute>} />
```

## Step 4 — Add nav link in DashboardLayout.tsx

```tsx
// Add to navItems array
{ icon: Bot, label: "AI Agent", href: "/agent" },

// Add import
import { Bot } from "lucide-react";
```

## Step 5 — Add SENDER_EMAIL / SENDER_NAME to wrangler.toml if not set

The agent's executor calls `/api/outreach/send-email` which needs
`SENDER_EMAIL` and `SENDER_NAME` from your Worker config.

## Step 6 — Deploy worker update

After copying the new `worker/index.ts` (which has the two new agent endpoints):
```bash
cd worker && npm run deploy
```
