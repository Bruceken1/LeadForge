import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Zap, Play, Square, CheckCircle, XCircle, Clock,
  User, Search, Filter, Mail, AlertTriangle, Loader2,
  ChevronRight, Bot, Brain, Target, Send,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { API_BASE, AGENT_API_BASE, agentCall } from "@/lib/api";

// Agent API URL and auth helpers come from @/lib/api

// ── Types ──────────────────────────────────────────────────────────
interface AgentEvent {
  type:      string;
  agent:     string;
  data:      Record<string, any>;
  timestamp: string;
}

interface AgentRun {
  id:            string;
  status:        "running" | "completed" | "failed" | "paused_for_review" | "cancelled";
  campaign_goal: string;
  qualified:     number;
  sent:          number;
  created_at:    string;
}

// ── Agent avatar / color map ───────────────────────────────────────
const AGENT_CONFIG: Record<string, { icon: any; color: string; label: string }> = {
  supervisor:            { icon: Brain,   color: "text-primary",      label: "Supervisor" },
  research_agent:        { icon: Search,  color: "text-blue-400",     label: "Research" },
  qualifier_agent:       { icon: Filter,  color: "text-yellow-400",   label: "Qualifier" },
  personalization_agent: { icon: Bot,     color: "text-purple-400",   label: "Personalizer" },
  executor_agent:        { icon: Send,    color: "text-green-400",    label: "Executor" },
  human:                 { icon: User,    color: "text-orange-400",   label: "You" },
};

const STATUS_CONFIG = {
  running:              { icon: Loader2,       color: "text-primary",    label: "Running",      spin: true  },
  completed:            { icon: CheckCircle,   color: "text-green-400",  label: "Complete",     spin: false },
  failed:               { icon: XCircle,       color: "text-red-400",    label: "Failed",       spin: false },
  paused_for_review:    { icon: AlertTriangle, color: "text-orange-400", label: "Needs Review", spin: false },
  cancelled:            { icon: Square,        color: "text-muted-foreground", label: "Cancelled", spin: false },
};

export default function AgentDashboard() {
  const { user, org, accessToken } = useAuth();

  // Form
  const [goal,      setGoal]      = useState("Find and contact restaurant owners in Nairobi who need a website");
  const [industry,  setIndustry]  = useState("restaurants");
  const [location,  setLocation]  = useState("Nairobi, Kenya");
  const [minRating, setMinRating] = useState("3.5");
  const [maxLeads,  setMaxLeads]  = useState("20");

  // State
  const [runId,         setRunId]         = useState<string | null>(null);
  const [events,        setEvents]        = useState<AgentEvent[]>([]);
  const [status,        setStatus]        = useState<AgentRun["status"] | null>(null);
  const [runs,          setRuns]          = useState<AgentRun[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [pendingReview, setPendingReview] = useState<string | null>(null);

  const eventLogRef = useRef<HTMLDivElement>(null);
  const sseRef      = useRef<EventSource | null>(null);

  // Load recent runs on mount
  useEffect(() => {
    if (org?.id) fetchRuns();
  }, [org?.id]);

  // Auto-scroll event log
  useEffect(() => {
    if (eventLogRef.current) {
      eventLogRef.current.scrollTop = eventLogRef.current.scrollHeight;
    }
  }, [events]);

  async function fetchRuns() {
    try {
      const data = await agentCall<any>(`/api/agent/runs?org_id=${org?.id}`);
      setRuns(Array.isArray(data) ? data : data?.runs ?? data?.data ?? []);
    } catch {
      setRuns([]);
    }
  }

  function startSSE(id: string) {
    sseRef.current?.close();
    const agentKey = import.meta.env.VITE_AGENT_API_KEY || "";
    const qs = agentKey ? `?key=${encodeURIComponent(agentKey)}` : "";
    const es = new EventSource(`${AGENT_API_BASE}/api/agent/stream/${id}${qs}`);
    sseRef.current = es;

    es.onmessage = (e) => {
      try {
        const payload: AgentEvent = JSON.parse(e.data);

        if (payload.type === "done") {
          const s = (payload as any).status ?? "completed";
          setStatus(s);
          es.close();
          fetchRuns();
          return;
        }

        if (payload.type === "paused") {
          setStatus("paused_for_review");
          setPendingReview(id);
        }

        setEvents(prev => [...prev, payload]);
      } catch {}
    };

    es.onerror = () => { es.close(); };
  }

  async function handleStart() {
    if (!accessToken || !org) { toast.error("Please log in"); return; }
    setLoading(true);
    setEvents([]);
    setStatus(null);

    try {
      const { run_id } = await agentCall<{ run_id: string }>("/api/agent/run", {
        method: "POST",
        body: JSON.stringify({
          campaign_goal:      goal,
          icp:                { industry, location, min_rating: parseFloat(minRating), keywords: [] },
          org_id:             org.id,
          org_name:           org.name,
          leadengine_api_url: API_BASE,
          leadengine_token:   accessToken,
          max_leads:          parseInt(maxLeads),
        }),
      });
      setRunId(run_id);
      setStatus("running");
      startSSE(run_id);
      toast.success("Agent started — watch the live feed below");
      fetchRuns();
    } catch (e: any) {
      toast.error(e.message || "Failed to start agent");
    } finally {
      setLoading(false);
    }
  }

  async function handleStop() {
    if (!runId) return;
    await agentCall(`/api/agent/run/${runId}`, { method: "DELETE" }).catch(() => {});
    sseRef.current?.close();
    setStatus("cancelled");
    toast.info("Agent stopped");
    fetchRuns();
  }

  async function handleApprove(approved: boolean) {
    if (!pendingReview) return;
    await agentCall("/api/agent/approve", {
      method: "POST",
      body: JSON.stringify({
        run_id:    pendingReview,
        lead_name: "high-value lead",
        approved,
        notes:     approved ? "Approved by user" : "Rejected by user",
      }),
    }).catch(() => {});
    setPendingReview(null);
    setStatus("running");
    if (approved) {
      startSSE(pendingReview);
      toast.success("Lead approved — agent resuming");
    } else {
      toast.info("Lead rejected — agent skipping");
    }
  }

  const isRunning = status === "running";
  const statusCfg = status ? STATUS_CONFIG[status] : null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border/50 px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg gradient-gold flex items-center justify-center">
          <Zap className="h-4 w-4 text-[hsl(222,20%,7%)]" />
        </div>
        <div>
          <p className="font-bold leading-none">LeadForge Agent</p>
          <p className="text-xs text-primary">Autonomous SDR — powered by Groq + Llama 3</p>
        </div>
        {statusCfg && (
          <div className={`ml-auto flex items-center gap-2 text-sm font-medium ${statusCfg.color}`}>
            <statusCfg.icon className={`h-4 w-4 ${statusCfg.spin ? "animate-spin" : ""}`} />
            {statusCfg.label}
          </div>
        )}
      </div>

      <div className="flex h-[calc(100vh-65px)]">
        {/* ── LEFT: Config + Controls ─────────────────────────── */}
        <div className="w-80 border-r border-border/50 flex flex-col overflow-y-auto">
          <div className="p-5 space-y-5 flex-1">
            <div>
              <h2 className="text-sm font-semibold mb-3">Campaign Goal</h2>
              <textarea
                className="w-full text-sm bg-muted/40 border border-border rounded-lg p-3 resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                rows={3}
                value={goal}
                onChange={e => setGoal(e.target.value)}
                placeholder="Describe what you want the agent to achieve…"
                disabled={isRunning}
              />
            </div>

            <div>
              <h2 className="text-sm font-semibold mb-3">Ideal Customer Profile (ICP)</h2>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Industry</Label>
                  <Select value={industry} onValueChange={setIndustry} disabled={isRunning}>
                    <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["restaurants","hotels","law firms","real estate","healthcare","schools","tech startups","retail","NGOs"].map(i => (
                        <SelectItem key={i} value={i}>{i}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Location</Label>
                  <Select value={location} onValueChange={setLocation} disabled={isRunning}>
                    <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["Nairobi, Kenya","Mombasa, Kenya","Kisumu, Kenya","Kampala, Uganda","Dar es Salaam, Tanzania","Kigali, Rwanda"].map(l => (
                        <SelectItem key={l} value={l}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Min Rating</Label>
                    <Input className="mt-1 h-8 text-sm" value={minRating}
                      onChange={e => setMinRating(e.target.value)} disabled={isRunning} />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Max Leads</Label>
                    <Input className="mt-1 h-8 text-sm" type="number" value={maxLeads}
                      onChange={e => setMaxLeads(e.target.value)} disabled={isRunning} />
                  </div>
                </div>
              </div>
            </div>

            {/* Human review panel */}
            {status === "paused_for_review" && pendingReview && (
              <div className="glass-card p-4 border-orange-400/30 bg-orange-400/5">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="h-4 w-4 text-orange-400" />
                  <p className="text-sm font-semibold text-orange-400">High-Value Lead Detected</p>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  The agent found a high-priority lead (ICP score ≥ 85, 100+ reviews).
                  Approve to send personalised outreach, or reject to skip.
                </p>
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1 bg-green-500 hover:bg-green-600"
                    onClick={() => handleApprove(true)}>
                    <CheckCircle className="h-3.5 w-3.5 mr-1.5" /> Approve
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 border-red-400/40 text-red-400"
                    onClick={() => handleApprove(false)}>
                    <XCircle className="h-3.5 w-3.5 mr-1.5" /> Reject
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Start / Stop */}
          <div className="p-5 border-t border-border/50">
            {!isRunning ? (
              <Button className="w-full gap-2" onClick={handleStart} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {loading ? "Starting…" : "Run Agent"}
              </Button>
            ) : (
              <Button className="w-full gap-2" variant="outline" onClick={handleStop}>
                <Square className="h-4 w-4" /> Stop Agent
              </Button>
            )}
            <p className="text-xs text-muted-foreground text-center mt-2">
              Powered by Llama 3 via Groq
            </p>
          </div>
        </div>

        {/* ── CENTRE: Live Event Feed ──────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-6 py-3 border-b border-border/50 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Live Agent Activity</h2>
            {events.length > 0 && (
              <span className="text-xs text-muted-foreground">{events.length} events</span>
            )}
          </div>

          <div ref={eventLogRef} className="flex-1 overflow-y-auto p-4 space-y-2">
            {events.length === 0 && !isRunning && (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <p className="font-semibold">LeadForge Agent ready</p>
                  <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                    Configure your ICP and campaign goal, then click Run Agent.
                    The 5-agent system will research, qualify, and contact leads autonomously.
                  </p>
                </div>
                <div className="flex gap-2 text-xs text-muted-foreground">
                  {Object.entries(AGENT_CONFIG).filter(([k]) => k !== "human").map(([key, cfg]) => (
                    <div key={key} className="flex items-center gap-1">
                      <cfg.icon className={`h-3 w-3 ${cfg.color}`} />
                      {cfg.label}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {events.map((event, i) => {
              const cfg = AGENT_CONFIG[event.agent] || AGENT_CONFIG.supervisor;
              const Icon = cfg.icon;
              return (
                <div key={i} className="flex gap-3 text-sm animate-in fade-in-0 slide-in-from-bottom-2 duration-200">
                  <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(event.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className={`text-xs rounded-lg p-2.5
                      ${event.type === "error"
                        ? "bg-red-500/10 text-red-400 border border-red-500/20"
                        : event.type === "paused"
                        ? "bg-orange-400/10 text-orange-400 border border-orange-400/20"
                        : "bg-muted/40 text-foreground"}`}>
                      {event.data?.content ?? event.data?.message ?? JSON.stringify(event.data).slice(0, 200)}
                    </div>
                  </div>
                </div>
              );
            })}

            {isRunning && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2 pl-10">
                <div className="flex gap-1">
                  {[0,1,2].map(i => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce"
                      style={{ animationDelay: `${i * 150}ms` }} />
                  ))}
                </div>
                Agent is thinking…
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Recent Runs ───────────────────────────────── */}
        <div className="w-64 border-l border-border/50 overflow-y-auto">
          <div className="px-4 py-3 border-b border-border/50">
            <h2 className="text-sm font-semibold">Recent Runs</h2>
          </div>
          <div className="p-3 space-y-2">
            {runs.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">No runs yet</p>
            )}
            {runs.map(run => {
              const cfg = STATUS_CONFIG[run.status] ?? STATUS_CONFIG.cancelled;
              const Icon = cfg.icon;
              return (
                <div key={run.id}
                  className={`p-3 rounded-lg cursor-pointer transition-colors
                    ${run.id === runId
                      ? "bg-primary/10 border border-primary/20"
                      : "bg-muted/30 hover:bg-muted/50"}`}
                  onClick={() => {
                    setRunId(run.id);
                    setStatus(run.status);
                    setEvents([]);
                    if (run.status === "running" || run.status === "paused_for_review") {
                      startSSE(run.id);
                    }
                  }}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <Icon className={`h-3 w-3 ${cfg.color} ${cfg.spin ? "animate-spin" : ""}`} />
                    <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                  </div>
                  <p className="text-xs text-foreground truncate">{run.campaign_goal}</p>
                  <div className="flex gap-3 mt-1.5 text-[10px] text-muted-foreground">
                    <span>{run.qualified ?? 0} qualified</span>
                    <span>{run.sent ?? 0} sent</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {new Date(run.created_at).toLocaleDateString()}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
