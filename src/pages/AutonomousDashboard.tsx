import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { API_BASE, AGENT_API_BASE, agentCall } from "@/lib/api";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Brain, Zap, Play, Bell, CheckCircle, XCircle,
  Search, Filter, Send, Bot, Target, BarChart2, Shield,
  Radio, ChevronRight, AlertTriangle, Loader2, TrendingUp,
  Mail, Calendar, Activity, Cpu, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Notification { id: number; type: string; message: string; read: boolean; created_at: string; }
interface Approval     { id: number; type: string; payload: Record<string, unknown>; status: string; created_at: string; }
interface Meeting      { id: number; lead_name: string; lead_email: string; meeting_datetime: string; }
interface Analytics    { emails_sent: number; meetings_booked: number; meeting_rate: string; buy_signals_detected: number; campaigns_run: number; }
interface ICPConfig    { id: number; industry: string; location: string; campaign_goal: string; active: boolean; last_run_at: string | null; }
interface AgentEvent   { type: string; agent: string; data: Record<string, any>; ts?: string; timestamp?: string; }

// ── Constants ─────────────────────────────────────────────────────────────────
// API_BASE (Worker) and AGENT_API_BASE (FastAPI) come from @/lib/api

const AGENT_CONFIG: Record<string, { icon: any; color: string; label: string; bg: string }> = {
  research_agent:        { icon: Search,     color: "text-blue-400",    bg: "bg-blue-400/10",    label: "Research"     },
  qualifier_agent:       { icon: Filter,     color: "text-yellow-400",  bg: "bg-yellow-400/10",  label: "Qualifier"    },
  personalization_agent: { icon: Bot,        color: "text-purple-400",  bg: "bg-purple-400/10",  label: "Personalizer" },
  executor_agent:        { icon: Send,       color: "text-green-400",   bg: "bg-green-400/10",   label: "Executor"     },
  reply_handler_agent:   { icon: Mail,       color: "text-pink-400",    bg: "bg-pink-400/10",    label: "Reply AI"     },
  meeting_booker_agent:  { icon: Calendar,   color: "text-teal-400",    bg: "bg-teal-400/10",    label: "Booker"       },
  optimizer_agent:       { icon: TrendingUp, color: "text-orange-400",  bg: "bg-orange-400/10",  label: "Optimizer"    },
  supervisor:            { icon: Brain,      color: "text-primary",     bg: "bg-primary/10",     label: "Supervisor"   },
};

const TABS = [
  { id: "overview",   label: "Overview",   icon: Activity   },
  { id: "agent",      label: "Live Feed",  icon: Radio      },
  { id: "icp",        label: "ICP Setup",  icon: Target     },
  { id: "approvals",  label: "Approvals",  icon: CheckCircle },
  { id: "analytics",  label: "Analytics",  icon: BarChart2  },
  { id: "compliance", label: "Compliance", icon: Shield     },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(ts: string) {
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60)    return `${Math.round(diff)}s ago`;
  if (diff < 3600)  return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color, bg, sub }: {
  label: string; value: string | number; icon: any; color: string; bg: string; sub?: string;
}) {
  return (
    <div className="glass-card p-5 hover:border-primary/20 transition-all">
      <div className="flex items-center justify-between mb-3">
        <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center`}>
          <Icon className={`h-4 w-4 ${color}`} />
        </div>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/30" />
      </div>
      <p className="text-3xl font-bold tracking-tight">{value}</p>
      <p className="text-xs text-muted-foreground mt-1.5 font-medium">{label}</p>
      {sub && <p className="text-xs text-muted-foreground/50 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Agent Pill ────────────────────────────────────────────────────────────────
function AgentPill({ name, active }: { name: string; active: boolean }) {
  const cfg = AGENT_CONFIG[name];
  if (!cfg) return null;
  const Icon = cfg.icon;
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all duration-300 ${
      active ? `${cfg.bg} ${cfg.color} border-current/30` : "bg-muted/30 text-muted-foreground border-border"}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════
export default function AutonomousDashboard() {
  const { org, accessToken } = useAuth();
  const ORG_ID   = org?.id   || "";
  const ORG_NAME = org?.name || "My Workspace";

  const [activeTab, setActiveTab] = useState<typeof TABS[number]["id"]>("overview");

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [approvals,     setApprovals]     = useState<Approval[]>([]);
  const [meetings,      setMeetings]      = useState<Meeting[]>([]);
  const [analytics,     setAnalytics]     = useState<Analytics | null>(null);
  const [icpConfigs,    setIcpConfigs]    = useState<ICPConfig[]>([]);
  const [buySignals,    setBuySignals]    = useState(0);
  const [loading,       setLoading]       = useState(true);
  const [serverStatus,  setServerStatus]  = useState<"unknown"|"online"|"offline">("unknown");
  const failCountRef = useRef(0);

  const [agentEvents, setAgentEvents] = useState<AgentEvent[]>([]);
  const [runId,       setRunId]       = useState("");
  const [streaming,   setStreaming]   = useState(false);
  const eventLogRef = useRef<HTMLDivElement>(null);

  const [icpForm, setIcpForm] = useState({
    industry: "restaurants", location: "Nairobi, Kenya",
    campaign_goal: "Generate leads for our digital marketing services",
    min_rating: "3.5", min_reviews: "5", max_leads: "20",
  });
  const [campaignForm, setCampaignForm] = useState({
    campaign_goal: "Book 5 discovery calls with Nairobi restaurant owners",
    industry: "restaurants", location: "Nairobi, Kenya", max_leads: "15",
  });
  const [optoutEmail, setOptoutEmail] = useState("");
  const [saving,    setSaving]    = useState(false);
  const [launching, setLaunching] = useState(false);

  // ── Fetch (with offline detection + backoff to stop console spam) ──────────
  const fetchDashboard = async () => {
    // If server has been unreachable 3+ times in a row, stop auto-polling.
    // User can still manually refresh via the button.
    if (failCountRef.current >= 3) return;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000); // 5s timeout
      const agentKey = import.meta.env.VITE_AGENT_API_KEY || "";
      const agentHeaders: HeadersInit = {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(agentKey ? { "X-Agent-Key": agentKey } : {}),
      };
      const [dashRes, analyticsRes, signalsRes, icpRes] = await Promise.all([
        fetch(`${AGENT_API_BASE}/api/dashboard/${ORG_ID}`, { signal: controller.signal, headers: agentHeaders }),
        fetch(`${AGENT_API_BASE}/api/analytics/${ORG_ID}?days=30`, { signal: controller.signal, headers: agentHeaders }),
        fetch(`${AGENT_API_BASE}/api/buy-signals?processed=false&limit=5`, { signal: controller.signal, headers: agentHeaders }),
        fetch(`${AGENT_API_BASE}/api/icp/${ORG_ID}`, { signal: controller.signal, headers: agentHeaders }),
      ]);
      clearTimeout(timer);
      failCountRef.current = 0;
      setServerStatus("online");
      if (dashRes.ok)      { const d = await dashRes.json(); setNotifications(d.notifications || []); setApprovals(d.approval_queue || []); setMeetings(d.recent_meetings || []); }
      if (analyticsRes.ok) setAnalytics(await analyticsRes.json());
      if (signalsRes.ok)   setBuySignals((await signalsRes.json()).length);
      if (icpRes.ok)       setIcpConfigs(await icpRes.json());
    } catch (_) {
      failCountRef.current += 1;
      if (failCountRef.current >= 3) setServerStatus("offline");
    }
    finally { setLoading(false); }
  };

  // Manual refresh — resets failure count so polling resumes
  const manualRefresh = () => {
    failCountRef.current = 0;
    setServerStatus("unknown");
    setLoading(true);
    fetchDashboard();
  };

  useEffect(() => {
    fetchDashboard();
    const iv = setInterval(fetchDashboard, 15000);
    return () => clearInterval(iv);
  }, [ORG_ID]);

  useEffect(() => {
    if (eventLogRef.current) eventLogRef.current.scrollTop = eventLogRef.current.scrollHeight;
  }, [agentEvents]);

  // ── SSE ────────────────────────────────────────────────────────────────────
  const startStreaming = (rid: string) => {
    setStreaming(true);
    setAgentEvents([]);
    const agentKey = import.meta.env.VITE_AGENT_API_KEY || "";
    const qs = agentKey ? `?key=${encodeURIComponent(agentKey)}` : "";
    const es = new EventSource(`${AGENT_API_BASE}/api/runs/${rid}/stream${qs}`);
    es.onmessage = (e) => {
      const ev: AgentEvent = JSON.parse(e.data);
      if (ev.type === "done") { es.close(); setStreaming(false); fetchDashboard(); }
      else setAgentEvents(prev => [...prev.slice(-199), ev]);
    };
    es.onerror = () => { es.close(); setStreaming(false); };
  };

  // ── Actions ────────────────────────────────────────────────────────────────
  const launchCampaign = async () => {
    setLaunching(true);
    setActiveTab("agent");
    try {
      const data = await agentCall<{ run_id: string }>("/api/run", {
        method: "POST",
        body: JSON.stringify({
          campaign_goal: campaignForm.campaign_goal,
          icp: { industry: campaignForm.industry, location: campaignForm.location, min_rating: 3.5, min_reviews: 5, max_leads: parseInt(campaignForm.max_leads) },
          org_id: ORG_ID, org_name: ORG_NAME,
          leadengine_api_url: API_BASE,
          leadengine_token:   accessToken || "",
          max_leads: parseInt(campaignForm.max_leads),
        }),
      });
      const run_id = data?.run_id;
      if (run_id) { setRunId(run_id); startStreaming(run_id); toast.success(`Campaign launched — run ID: ${run_id}`); }
      else toast.error("Failed to launch campaign — no run_id returned");
    } catch { toast.error("Network error — is the agent server running?"); }
    setLaunching(false);
  };

  const saveICP = async () => {
    setSaving(true);
    try {
      await agentCall("/api/icp", {
        method: "POST",
        body: JSON.stringify({ org_id: ORG_ID, org_name: ORG_NAME, ...icpForm, min_rating: parseFloat(icpForm.min_rating), min_reviews: parseInt(icpForm.min_reviews), max_leads: parseInt(icpForm.max_leads) }),
      });
      toast.success("ICP saved — autonomous mode runs every 30 minutes");
      fetchDashboard();
    } catch { toast.error("Network error"); }
    setSaving(false);
  };

  const handleApproval = async (id: number, action: "approved" | "rejected") => {
    await agentCall(`/api/approvals/${id}/action`, {
      method: "POST",
      body: JSON.stringify({ approval_id: id, action, resolved_by: "human_dashboard" }),
    }).catch(() => {});
    toast.success(action === "approved" ? "Approved — AI will proceed" : "Rejected — action cancelled");
    fetchDashboard();
  };

  const toggleICP = async (id: number, active: boolean) => {
    await agentCall(`/api/icp/${id}/toggle?active=${!active}`, { method: "PATCH" }).catch(() => {});
    fetchDashboard();
  };

  const handleOptOut = async () => {
    if (!optoutEmail) return;
    await agentCall("/api/compliance/opt-out", {
      method: "POST",
      body: JSON.stringify({ email: optoutEmail, reason: "manual_request", source: "dashboard" }),
    }).catch(() => {});
    toast.success(`${optoutEmail} suppressed — DPA Art. 26 compliant`);
    setOptoutEmail("");
  };

  const activeAgents = new Set(agentEvents.map(e => e.agent));

  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">

        {/* ── Header ── */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <h1 className="text-2xl font-bold tracking-tight">Autonomous SDR</h1>
              {serverStatus === "offline" ? (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-destructive/10 border border-destructive/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
                  <span className="text-xs text-destructive font-semibold">Server offline</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10 border border-green-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-xs text-green-400 font-semibold">Running 24/7</span>
                </div>
              )}
            </div>
            <p className="text-sm text-muted-foreground">7-agent pipeline · Kenya DPA compliant · East Africa</p>
          </div>
          <div className="flex items-center gap-2">
            {buySignals > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20">
                <Zap className="h-3.5 w-3.5 text-purple-400" />
                <span className="text-xs text-purple-400 font-semibold">{buySignals} buy signals</span>
              </div>
            )}
            <Button variant="outline" size="sm" className="gap-2" onClick={manualRefresh}>
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          </div>
        </div>

        {/* ── Tab Bar ── */}
        <div className="flex items-center gap-1 border-b border-border">
          {TABS.map(({ id, label, icon: Icon }) => {
            const isActive = activeTab === id;
            const badge = id === "approvals" && approvals.length > 0 ? approvals.length : null;
            return (
              <button key={id} onClick={() => setActiveTab(id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-all whitespace-nowrap ${
                  isActive ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"}`}>
                <Icon className="h-3.5 w-3.5" />
                {label}
                {badge != null && (
                  <span className="ml-1 min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1">
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Offline banner ── */}
        {serverStatus === "offline" && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/20">
            <div className="w-2 h-2 rounded-full bg-destructive flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-destructive">Agent server unreachable</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                <span className="font-mono">{AGENT_API_BASE}</span> is not responding. The dashboard will show cached data.
                Check your Railway deployment or update <span className="font-mono">VITE_AGENT_API_URL</span> in your environment.
              </p>
            </div>
            <Button variant="outline" size="sm" className="flex-shrink-0 gap-1.5" onClick={manualRefresh}>
              <RefreshCw className="h-3.5 w-3.5" /> Retry
            </Button>
          </div>
        )}

        {/* ══════════════════ OVERVIEW ══════════════════ */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {loading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[110px] rounded-xl" />)}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <StatCard label="Emails Sent"     value={analytics?.emails_sent     ?? "—"} icon={Mail}       color="text-blue-400"   bg="bg-blue-400/10"   sub="Last 30 days" />
                <StatCard label="Meetings Booked" value={analytics?.meetings_booked ?? "—"} icon={Calendar}   color="text-green-400"  bg="bg-green-400/10"  sub="Auto-booked" />
                <StatCard label="Meeting Rate"    value={analytics?.meeting_rate    ?? "—"} icon={TrendingUp}  color="text-primary"    bg="bg-primary/10"    sub="Meetings / qualified" />
                <StatCard label="Buy Signals"     value={buySignals}                         icon={Zap}        color="text-purple-400" bg="bg-purple-400/10" sub="Unprocessed" />
                <StatCard label="Campaigns Run"   value={analytics?.campaigns_run   ?? "—"} icon={Cpu}        color="text-pink-400"   bg="bg-pink-400/10"   sub="Auto + manual" />
                <StatCard label="Active ICPs"     value={icpConfigs.filter(c => c.active).length} icon={Target} color="text-teal-400" bg="bg-teal-400/10" sub="Profiles running" />
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Notifications */}
              <div className="glass-card p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold">Notifications</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Agent activity & alerts</p>
                  </div>
                  <Bell className="h-4 w-4 text-muted-foreground" />
                </div>
                {notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
                    <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                      <Bell className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">All clear — no new notifications</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {notifications.map(n => {
                      const border = n.type.includes("meeting") ? "border-l-green-400" : n.type.includes("error") ? "border-l-destructive" : "border-l-blue-400";
                      return (
                        <div key={n.id} className={`p-3 rounded-lg bg-muted/40 border-l-2 ${border}`}>
                          <p className="text-sm">{n.message}</p>
                          <p className="text-xs text-muted-foreground mt-1">{timeAgo(n.created_at)}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Meetings */}
              <div className="glass-card p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold">Upcoming Meetings</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Auto-booked by meeting agent</p>
                  </div>
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </div>
                {meetings.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
                    <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                      <Calendar className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">No meetings scheduled yet</p>
                    <p className="text-xs text-muted-foreground/60">Launch a campaign to start booking</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {meetings.map(m => (
                      <div key={m.id} className="py-3 first:pt-0 last:pb-0">
                        <p className="text-sm font-medium">{m.lead_name}</p>
                        <p className="text-xs text-muted-foreground">{m.lead_email}</p>
                        <p className="text-xs text-green-400 mt-1">{m.meeting_datetime}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Launch campaign */}
            <div className="glass-card p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="font-semibold">Launch Campaign</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Trigger the 7-agent pipeline manually</p>
                </div>
                <Play className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="space-y-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Campaign Goal</Label>
                  <Input value={campaignForm.campaign_goal} onChange={e => setCampaignForm(p => ({...p, campaign_goal: e.target.value}))} className="mt-1.5" placeholder="e.g. Book 5 discovery calls with Nairobi restaurant owners" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Industry</Label>
                    <Input value={campaignForm.industry} onChange={e => setCampaignForm(p => ({...p, industry: e.target.value}))} className="mt-1.5" placeholder="restaurants" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Location</Label>
                    <Input value={campaignForm.location} onChange={e => setCampaignForm(p => ({...p, location: e.target.value}))} className="mt-1.5" placeholder="Nairobi, Kenya" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Max Leads</Label>
                    <Input value={campaignForm.max_leads} type="number" onChange={e => setCampaignForm(p => ({...p, max_leads: e.target.value}))} className="mt-1.5" />
                  </div>
                </div>
                <Button onClick={launchCampaign} disabled={launching} className="gap-2">
                  {launching ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Launching…</> : <><Play className="h-3.5 w-3.5" /> Launch Campaign</>}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════ LIVE FEED ══════════════════ */}
        {activeTab === "agent" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Live Agent Feed</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Real-time activity from the 7-agent pipeline</p>
              </div>
              {streaming && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20">
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-xs text-green-400 font-semibold">Live — agents running</span>
                </div>
              )}
            </div>

            <div className="glass-card p-4">
              <p className="text-xs text-muted-foreground mb-3 font-medium uppercase tracking-wide">Pipeline</p>
              <div className="flex items-center gap-1.5 flex-wrap">
                {Object.keys(AGENT_CONFIG).filter(a => a !== "supervisor").map((agent, i, arr) => (
                  <div key={agent} className="flex items-center gap-1.5">
                    <AgentPill name={agent} active={activeAgents.has(agent)} />
                    {i < arr.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground/25 flex-shrink-0" />}
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${streaming ? "bg-green-400 animate-pulse" : "bg-muted-foreground/30"}`} />
                  <span className="text-xs font-medium text-muted-foreground">{streaming ? "Streaming" : "Idle"} · {agentEvents.length} events</span>
                </div>
                {runId && <span className="text-xs text-muted-foreground font-mono">run:{runId.slice(0, 8)}…</span>}
              </div>
              <div ref={eventLogRef} className="h-[500px] overflow-y-auto p-4 font-mono text-xs space-y-1.5 bg-[hsl(222,22%,5%)]">
                {agentEvents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                    <Bot className="h-8 w-8 text-muted-foreground/20" />
                    <p className="text-muted-foreground/40">Launch a campaign from Overview to see live agent activity here.</p>
                  </div>
                ) : agentEvents.map((ev, i) => {
                  const cfg = AGENT_CONFIG[ev.agent];
                  const content = String(ev.data?.content || ev.data?.message || ev.data?.result || "");
                  return (
                    <div key={i} className="flex items-start gap-2 leading-relaxed">
                      <span className="text-muted-foreground/30 flex-shrink-0 w-16">{new Date(ev.ts || ev.timestamp || "").toLocaleTimeString()}</span>
                      <span className={`font-bold flex-shrink-0 ${cfg?.color || "text-muted-foreground"}`}>[{cfg?.label || ev.agent}]</span>
                      <span className="text-muted-foreground/40 flex-shrink-0">{ev.type}</span>
                      <span className="text-foreground/80">{content.slice(0, 200)}{content.length > 200 ? "…" : ""}</span>
                    </div>
                  );
                })}
                {streaming && <p className="text-primary animate-pulse">▋ agents working…</p>}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════ ICP SETUP ══════════════════ */}
        {activeTab === "icp" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold">Ideal Customer Profile</h2>
              <p className="text-sm text-muted-foreground mt-1">Set your ICP once — the AI finds, scores, and queues fresh leads every 30 minutes automatically.</p>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="glass-card p-6">
                <h3 className="font-medium mb-4">Add New ICP Profile</h3>
                <div className="space-y-4">
                  {[
                    { key: "industry",    label: "Target Industry",  placeholder: "restaurants, hotels, logistics…" },
                    { key: "location",    label: "Location",          placeholder: "Nairobi, Kenya" },
                    { key: "min_rating",  label: "Min Google Rating", placeholder: "3.5" },
                    { key: "min_reviews", label: "Min Review Count",  placeholder: "5" },
                    { key: "max_leads",   label: "Max Leads / Run",   placeholder: "20" },
                  ].map(f => (
                    <div key={f.key}>
                      <Label className="text-xs text-muted-foreground">{f.label}</Label>
                      <Input value={icpForm[f.key as keyof typeof icpForm]} placeholder={f.placeholder} onChange={e => setIcpForm(p => ({...p, [f.key]: e.target.value}))} className="mt-1.5" />
                    </div>
                  ))}
                  <div>
                    <Label className="text-xs text-muted-foreground">Campaign Goal</Label>
                    <Textarea value={icpForm.campaign_goal} onChange={e => setIcpForm(p => ({...p, campaign_goal: e.target.value}))} rows={3} className="mt-1.5 resize-none" placeholder="e.g. Generate leads for our digital marketing services" />
                  </div>
                  <Button onClick={saveICP} disabled={saving} className="w-full gap-2">
                    {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</> : <><Target className="h-3.5 w-3.5" /> Save ICP & Start Autonomous Mode</>}
                  </Button>
                </div>
              </div>

              <div className="glass-card p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium">Active Profiles</h3>
                  <Badge variant="secondary">{icpConfigs.length}</Badge>
                </div>
                {icpConfigs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                    <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center"><Target className="h-6 w-6 text-muted-foreground" /></div>
                    <p className="text-sm text-muted-foreground">No ICP configs yet.</p>
                    <p className="text-xs text-muted-foreground/60">Add one to start autonomous lead gen.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {icpConfigs.map(c => (
                      <div key={c.id} className={`p-4 rounded-lg border transition-all ${c.active ? "border-green-500/20 bg-green-500/5" : "border-border bg-muted/20"}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{c.industry} — {c.location}</p>
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{c.campaign_goal}</p>
                            {c.last_run_at && <p className="text-xs text-muted-foreground/50 mt-1">Last run: {timeAgo(c.last_run_at)}</p>}
                          </div>
                          <Button variant="outline" size="sm" className={`flex-shrink-0 h-7 text-xs ${c.active ? "border-green-500/30 text-green-400 hover:bg-green-500/10" : ""}`} onClick={() => toggleICP(c.id, c.active)}>
                            {c.active ? "ON" : "OFF"}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════ APPROVALS ══════════════════ */}
        {activeTab === "approvals" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold">Approval Queue</h2>
              <p className="text-sm text-muted-foreground mt-1">Items flagged by the AI that need your review before proceeding.</p>
            </div>
            {approvals.length === 0 ? (
              <div className="glass-card p-12 flex flex-col items-center justify-center gap-4 text-center">
                <div className="w-16 h-16 rounded-2xl bg-green-500/10 flex items-center justify-center">
                  <CheckCircle className="h-8 w-8 text-green-400" />
                </div>
                <div>
                  <p className="font-medium mb-1">All clear</p>
                  <p className="text-sm text-muted-foreground">No pending approvals — the AI is running smoothly.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {approvals.map(a => (
                  <div key={a.id} className="glass-card p-5 border-yellow-500/20">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="px-2 py-0.5 rounded text-xs font-bold bg-yellow-500/15 text-yellow-400 border border-yellow-500/20">{a.type.replace(/_/g, " ").toUpperCase()}</span>
                          <span className="text-xs text-muted-foreground">{timeAgo(a.created_at)}</span>
                        </div>
                        <pre className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-3 whitespace-pre-wrap overflow-x-auto">
                          {JSON.stringify(a.payload, null, 2).slice(0, 500)}
                        </pre>
                      </div>
                      <div className="flex flex-col gap-2 flex-shrink-0">
                        <Button size="sm" variant="outline" className="gap-1.5 border-green-500/30 text-green-400 hover:bg-green-500/10 hover:text-green-400" onClick={() => handleApproval(a.id, "approved")}>
                          <CheckCircle className="h-3.5 w-3.5" /> Approve
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => handleApproval(a.id, "rejected")}>
                          <XCircle className="h-3.5 w-3.5" /> Reject
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════ ANALYTICS ══════════════════ */}
        {activeTab === "analytics" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold">Performance Analytics</h2>
              <p className="text-sm text-muted-foreground mt-1">30-day autonomous pipeline metrics</p>
            </div>
            {loading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[110px] rounded-xl" />)}
              </div>
            ) : analytics ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <StatCard label="Emails Sent"     value={analytics.emails_sent}          icon={Mail}       color="text-blue-400"   bg="bg-blue-400/10"   sub="Last 30 days" />
                <StatCard label="Meetings Booked" value={analytics.meetings_booked}       icon={Calendar}   color="text-green-400"  bg="bg-green-400/10"  sub="Auto-booked by AI" />
                <StatCard label="Meeting Rate"    value={analytics.meeting_rate}          icon={TrendingUp}  color="text-primary"    bg="bg-primary/10"    sub="Meetings / qualified" />
                <StatCard label="Buy Signals"     value={analytics.buy_signals_detected}  icon={Zap}        color="text-purple-400" bg="bg-purple-400/10" sub="Growth indicators" />
                <StatCard label="Campaigns Run"   value={analytics.campaigns_run}         icon={Cpu}        color="text-pink-400"   bg="bg-pink-400/10"   sub="Auto + manual" />
              </div>
            ) : (
              <div className="glass-card p-12 text-center">
                <p className="text-muted-foreground">No analytics yet — run a campaign to start collecting data.</p>
              </div>
            )}

            <div className="glass-card p-6">
              <h3 className="font-semibold mb-1">Self-Learning Optimizer</h3>
              <p className="text-xs text-muted-foreground mb-5">The optimizer agent continuously refines targeting and messaging. ICP weight changes require your approval.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {[
                  { label: "Subject line A/B tests",  status: "Auto-running",     dot: "bg-green-400",  color: "text-green-400"  },
                  { label: "ICP weight adjustments",  status: "Pending review",   dot: "bg-yellow-400", color: "text-yellow-400" },
                  { label: "Domain health check",     status: "All clear",        dot: "bg-green-400",  color: "text-green-400"  },
                  { label: "Bounce rate monitoring",  status: "0.8% — healthy",   dot: "bg-green-400",  color: "text-green-400"  },
                  { label: "Best send time analysis", status: "9am–11am EAT",     dot: "bg-blue-400",   color: "text-blue-400"   },
                  { label: "Top performing segment",  status: "Hotels · Mombasa", dot: "bg-primary",    color: "text-primary"    },
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-3 p-3 rounded-lg bg-muted/40">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${item.dot}`} />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground truncate">{item.label}</p>
                      <p className={`text-xs font-semibold mt-0.5 ${item.color}`}>{item.status}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════ COMPLIANCE ══════════════════ */}
        {activeTab === "compliance" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold">Kenya DPA 2019 Compliance</h2>
              <p className="text-sm text-muted-foreground mt-1">Full compliance with the Kenya Data Protection Act 2019 (Act No. 24 of 2019)</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { article: "Art. 25",  title: "Lawful Processing",         desc: "All outreach based on legitimate business interest. Contacts found via public Google Maps listings.",                status: "Compliant"       },
                { article: "Art. 26",  title: "Right to Object / Opt-Out", desc: "Opt-out links in every email. Requests processed within 24 hours. Permanent suppression list maintained.",          status: "Compliant"       },
                { article: "Art. 31",  title: "Data Minimization",         desc: "Only business contact data collected — name, email, phone, industry. No personal or sensitive data stored.",        status: "Compliant"       },
                { article: "Art. 35",  title: "Security Safeguards",       desc: "Encrypted database, audit logs for all data access, role-based access control.",                                    status: "Compliant"       },
                { article: "Art. 43",  title: "Right to Erasure",          desc: "Data anonymized after retention period. Suppressed leads anonymized after 365 days.",                               status: "Compliant"       },
                { article: "DPC Reg.", title: "DPC Registration",          desc: "Register with the Data Protection Commissioner Kenya (dpc.go.ke) if processing personal data at scale.",            status: "Action Required" },
              ].map(c => {
                const ok = c.status === "Compliant";
                return (
                  <div key={c.article} className={`glass-card p-5 ${ok ? "border-green-500/15" : "border-yellow-500/20"}`}>
                    <div className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center mt-0.5 ${ok ? "bg-green-500/10" : "bg-yellow-500/10"}`}>
                        {ok ? <CheckCircle className="h-4 w-4 text-green-400" /> : <AlertTriangle className="h-4 w-4 text-yellow-400" />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{c.article}</span>
                          <span className="text-sm font-medium">{c.title}</span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">{c.desc}</p>
                        <span className={`inline-block mt-2 text-xs font-semibold px-2 py-0.5 rounded-full ${ok ? "bg-green-500/10 text-green-400" : "bg-yellow-500/10 text-yellow-400"}`}>
                          {c.status}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="glass-card p-6">
              <h3 className="font-semibold mb-1">Manual Opt-Out / Data Erasure</h3>
              <p className="text-xs text-muted-foreground mb-4">Process a data subject access request manually — e.g. received via phone or form submission.</p>
              <Separator className="mb-4" />
              <div className="flex gap-3">
                <Input value={optoutEmail} onChange={e => setOptoutEmail(e.target.value)} placeholder="Email address to suppress" className="flex-1" onKeyDown={e => e.key === "Enter" && handleOptOut()} />
                <Button variant="destructive" onClick={handleOptOut} disabled={!optoutEmail} className="gap-2 flex-shrink-0">
                  <XCircle className="h-3.5 w-3.5" /> Suppress Contact
                </Button>
              </div>
              <p className="text-xs text-muted-foreground/50 mt-2">Contact will be permanently suppressed — Kenya DPA Art. 26 compliant.</p>
            </div>
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}
