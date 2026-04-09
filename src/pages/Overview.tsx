import { DashboardLayout } from "@/components/DashboardLayout";
import { Users, Mail, MessageSquare, Target, ArrowUpRight, Zap, CheckCircle, ChevronRight, TrendingUp } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar,
} from "recharts";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";
import { useState } from "react";
import { Button } from "@/components/ui/button";

const CHART_COLORS = {
  leads:   "#F5B324",
  emails:  "#4ade80",
  replies: "#60a5fa",
  bar:     "#F5B324",
};

const TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: "hsl(222 18% 10%)",
    border: "1px solid hsl(222 15% 18%)",
    borderRadius: "8px",
    fontSize: "12px",
  },
  labelStyle: { color: "hsl(210 20% 95%)" },
};

const CHECKLIST = [
  { id: "scrape",    label: "Run your first scrape",        href: "/automation", desc: "Find businesses on Google Maps" },
  { id: "enrich",    label: "Enrich a lead's email",        href: "/leads",      desc: "Apollo + Hunter find decision-maker emails" },
  { id: "campaign",  label: "Create a campaign",            href: "/campaigns",  desc: "Set up your outreach sequence" },
  { id: "send",      label: "Send your first email",        href: "/campaigns",  desc: "AI-personalised cold email" },
];

function OnboardingChecklist({ totalLeads, emailsSent }: { totalLeads: number; emailsSent: number }) {
  const [dismissed, setDismissed] = useState(false);
  const completed = {
    scrape:   totalLeads > 0,
    enrich:   totalLeads > 0,
    campaign: emailsSent > 0,
    send:     emailsSent > 0,
  } as Record<string, boolean>;
  const doneCount = Object.values(completed).filter(Boolean).length;
  if (dismissed || doneCount === CHECKLIST.length) return null;

  return (
    <div className="glass-card p-5 border-primary/20">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-semibold text-sm">Get started with Lead Engine</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{doneCount}/{CHECKLIST.length} steps completed</p>
        </div>
        <button onClick={() => setDismissed(true)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Dismiss</button>
      </div>
      <div className="h-1.5 bg-muted rounded-full mb-4 overflow-hidden">
        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(doneCount / CHECKLIST.length) * 100}%` }} />
      </div>
      <div className="space-y-2">
        {CHECKLIST.map(step => {
          const done = completed[step.id];
          return (
            <Link key={step.id} to={done ? "#" : step.href}
              className={`flex items-center gap-3 p-3 rounded-lg transition-all ${done ? "opacity-50" : "hover:bg-muted/50"}`}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${done ? "bg-green-500" : "border-2 border-border"}`}>
                {done && <CheckCircle className="h-3.5 w-3.5 text-white fill-white" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${done ? "line-through text-muted-foreground" : ""}`}>{step.label}</p>
                <p className="text-xs text-muted-foreground">{step.desc}</p>
              </div>
              {!done && <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default function Overview() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["stats"],
    queryFn: api.stats,
    retry: 1,
  });
  const { data: weeklyData = [], isLoading: weeklyLoading } = useQuery({
    queryKey: ["weeklyStats"],
    queryFn: api.weeklyStats,
    retry: 1,
  });
  const { data: pipeline = [], isLoading: pipelineLoading } = useQuery({
    queryKey: ["pipeline"],
    queryFn: api.pipeline,
    retry: 1,
  });
  const { data: recentLeads = [], isLoading: recentLoading } = useQuery({
    queryKey: ["recentLeads"],
    queryFn: api.recentLeads,
    retry: 1,
  });

  const totalLeads  = (stats as any)?.totalLeads  ?? 0;
  const emailsSent  = (stats as any)?.emailsSent  ?? 0;
  const replies     = (stats as any)?.replies     ?? 0;
  const convRate    = (stats as any)?.conversionRate ?? 0;

  const statCards = [
    { label: "Total Leads",      value: statsLoading ? null : totalLeads.toLocaleString(),  icon: Users,        color: "text-blue-400",   bg: "bg-blue-400/10",   trend: "+12% this week" },
    { label: "Emails Sent",      value: statsLoading ? null : emailsSent.toLocaleString(),  icon: Mail,         color: "text-green-400",  bg: "bg-green-400/10",  trend: "via campaigns" },
    { label: "Replies",          value: statsLoading ? null : replies.toLocaleString(),     icon: MessageSquare,color: "text-blue-300",   bg: "bg-blue-300/10",   trend: `${emailsSent ? ((replies/emailsSent)*100).toFixed(1) : 0}% reply rate` },
    { label: "Conversion Rate",  value: statsLoading ? null : `${convRate}%`,              icon: Target,       color: "text-primary",    bg: "bg-primary/10",    trend: "leads → closed" },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
            <p className="text-sm text-muted-foreground mt-1">Your lead generation performance at a glance</p>
          </div>
          <Link to="/automation">
            <Button size="sm" className="gap-2">
              <Zap className="h-3.5 w-3.5" /> New Scrape
            </Button>
          </Link>
        </div>

        {/* Onboarding checklist (auto-hides when complete) */}
        {!statsLoading && <OnboardingChecklist totalLeads={totalLeads} emailsSent={emailsSent} />}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="glass-card p-5 hover:border-primary/20 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <div className={`w-9 h-9 rounded-lg ${stat.bg} flex items-center justify-center`}>
                    <Icon className={`h-4 w-4 ${stat.color}`} />
                  </div>
                  <ArrowUpRight className="h-3.5 w-3.5 text-green-400" />
                </div>
                {stat.value === null ? (
                  <Skeleton className="h-8 w-20 mb-1.5" />
                ) : (
                  <p className="text-3xl font-bold tracking-tight">{stat.value}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1.5 font-medium">{stat.label}</p>
                <p className="text-xs text-muted-foreground/70 mt-0.5">{stat.trend}</p>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Weekly Activity */}
          <div className="lg:col-span-2 glass-card p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-semibold">Weekly Activity</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Last 7 days</p>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                {[
                  { color: CHART_COLORS.leads,   label: "Leads" },
                  { color: CHART_COLORS.emails,  label: "Emails" },
                  { color: CHART_COLORS.replies, label: "Opens" },
                ].map(({ color, label }) => (
                  <span key={label} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                    {label}
                  </span>
                ))}
              </div>
            </div>

            {weeklyLoading ? (
              <div className="h-[280px] flex items-center justify-center">
                <Skeleton className="h-full w-full rounded-lg" />
              </div>
            ) : (weeklyData as any[]).every((d: any) => d.leads === 0 && d.emails === 0) ? (
              <div className="h-[280px] flex flex-col items-center justify-center gap-4 text-center">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <TrendingUp className="h-7 w-7 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium mb-1">No activity yet this week</p>
                  <p className="text-xs text-muted-foreground mb-4">Run a scrape to start seeing your pipeline fill up here.</p>
                  <Link to="/automation">
                    <Button size="sm" className="gap-2">
                      <Zap className="h-3.5 w-3.5" /> Run your first scrape
                    </Button>
                  </Link>
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={weeklyData as any[]}>
                  <defs>
                    <linearGradient id="gLeads" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={CHART_COLORS.leads} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={CHART_COLORS.leads} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 15% 18%)" />
                  <XAxis dataKey="name" stroke="hsl(215 15% 40%)" tick={{ fontSize: 12 }} />
                  <YAxis stroke="hsl(215 15% 40%)" tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Area type="monotone" dataKey="leads"   stroke={CHART_COLORS.leads}   fill="url(#gLeads)" strokeWidth={2} />
                  <Area type="monotone" dataKey="emails"  stroke={CHART_COLORS.emails}  fill="transparent"  strokeWidth={2} strokeDasharray="5 3" />
                  <Area type="monotone" dataKey="replies" stroke={CHART_COLORS.replies} fill="transparent"  strokeWidth={2} strokeDasharray="5 3" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Pipeline */}
          <div className="glass-card p-6">
            <h3 className="font-semibold mb-1">Pipeline</h3>
            <p className="text-xs text-muted-foreground mb-6">Leads by stage</p>
            {pipelineLoading ? (
              <Skeleton className="h-[280px] w-full rounded-lg" />
            ) : (pipeline as any[]).length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={pipeline as any[]} layout="vertical" barSize={14}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 15% 18%)" horizontal={false} />
                  <XAxis type="number" stroke="hsl(215 15% 40%)" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis dataKey="status" type="category" stroke="hsl(215 15% 40%)" tick={{ fontSize: 11 }} width={80} />
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Bar dataKey="count" fill={CHART_COLORS.bar} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-[280px] text-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                  <Target className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium mb-1">Pipeline is empty</p>
                  <p className="text-xs text-muted-foreground mb-3">Scrape leads to populate your pipeline.</p>
                  <Link to="/automation">
                    <Button size="sm" variant="outline" className="gap-2 text-xs">
                      <Zap className="h-3 w-3" /> Start scraping
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Recent Leads */}
        <div className="glass-card p-6">
          <div className="flex justify-between items-center mb-5">
            <div>
              <h3 className="font-semibold">Recent Leads</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Last 10 added</p>
            </div>
            <Link to="/leads" className="text-xs text-primary hover:underline font-medium">View all →</Link>
          </div>

          {recentLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : (recentLeads as any[]).length > 0 ? (
            <div className="divide-y divide-border">
              {(recentLeads as any[]).map((lead: any, i: number) => (
                <div key={i} className="flex justify-between items-center py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{lead.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {lead.email || lead.phone || "No contact info yet"}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0 ml-4">
                    <span className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary font-medium">
                      {lead.status}
                    </span>
                    <p className="text-xs text-muted-foreground mt-1">{lead.source}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Users className="h-7 w-7 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium mb-1">No leads yet</p>
                <p className="text-xs text-muted-foreground mb-4">Your scraped leads will appear here. Start with a keyword and location.</p>
                <Link to="/automation">
                  <Button size="sm" className="gap-2">
                    <Zap className="h-3.5 w-3.5" /> Run your first scrape →
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
