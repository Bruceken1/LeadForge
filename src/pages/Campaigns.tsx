import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Play, Pause, Mail, Users, MessageSquare, Loader2, Rocket, Phone, BarChart2, TrendingUp, CheckCircle } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Link } from "react-router-dom";

const statusStyle: Record<string, string> = {
  active:    "bg-green-500/15 text-green-400 border border-green-500/20",
  paused:    "bg-yellow-500/15 text-yellow-400 border border-yellow-500/20",
  draft:     "bg-muted text-muted-foreground border border-border",
  completed: "bg-blue-500/15 text-blue-400 border border-blue-500/20",
};

function SendProgressBar({ sent, total, label }: { sent: number; total: number; label: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((sent / total) * 100)) : 0;
  return (
    <div className="mt-3">
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs font-medium">{sent}/{total} <span className="text-muted-foreground">({pct}%)</span></span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function Campaigns() {
  const qc = useQueryClient();
  const { data: campaigns = [], isLoading } = useQuery({ queryKey: ["campaigns"], queryFn: api.campaigns.list });
  const { data: templates = [] } = useQuery({ queryKey: ["templates"], queryFn: api.templates.list });

  const [isOpen, setIsOpen]   = useState(false);
  const [launchingId, setLaunchingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: '', template_id: '', keyword: '', location: 'Nairobi, Kenya' });

  const createMutation = useMutation({
    mutationFn: () => api.campaigns.create({
      name: form.name,
      template_id: form.template_id ? +form.template_id : undefined,
      keyword: form.keyword,
      location: form.location,
      leads_count: 0, sent_count: 0, opened_count: 0, replied_count: 0, bounced_count: 0, status: 'draft',
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      setIsOpen(false);
      setForm({ name: '', template_id: '', keyword: '', location: 'Nairobi, Kenya' });
      toast.success("Campaign created! Launch it when you're ready.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const launchEmailMutation = useMutation({
    mutationFn: (id: number) => api.campaigns.launch(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      setLaunchingId(null);
      toast.success("📧 Email campaign launched! Sending over the next few hours.");
    },
    onError: (e: Error) => { setLaunchingId(null); toast.error(e.message); },
  });

  const launchWhatsAppMutation = useMutation({
    mutationFn: (id: number) => api.campaigns.launchWhatsApp(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      setLaunchingId(null);
      toast.success("💬 WhatsApp campaign launched! Messages sending shortly.");
    },
    onError: (e: Error) => { setLaunchingId(null); toast.error(e.message); },
  });

  const pauseMutation = useMutation({
    mutationFn: (id: number) => api.campaigns.update(id, { status: 'paused' } as any),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["campaigns"] }); toast.success("Campaign paused"); },
  });

  const totalSent    = (campaigns as any[]).reduce((a, c) => a + (c.sent_count    || 0), 0);
  const totalReplied = (campaigns as any[]).reduce((a, c) => a + (c.replied_count || 0), 0);
  const totalLeads   = (campaigns as any[]).reduce((a, c) => a + (c.leads_count   || 0), 0);

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Campaigns</h1>
            <p className="text-sm text-muted-foreground mt-1">Create and manage outreach campaigns</p>
          </div>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2"><Plus className="h-4 w-4" /> New Campaign</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader><DialogTitle>New Campaign</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Campaign Name</Label>
                  <Input className="mt-1.5" placeholder="Nairobi Restaurants Q2"
                    value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Template</Label>
                  <Select value={form.template_id} onValueChange={v => setForm(f => ({ ...f, template_id: v }))}>
                    <SelectTrigger className="mt-1.5"><SelectValue placeholder="Choose template…" /></SelectTrigger>
                    <SelectContent>
                      {(templates as any[]).map((t: any) => (
                        <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Keyword filter</Label>
                    <Input className="mt-1.5" placeholder="restaurants"
                      value={form.keyword} onChange={e => setForm(f => ({ ...f, keyword: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Location filter</Label>
                    <Input className="mt-1.5" placeholder="Nairobi"
                      value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  <strong>Email</strong> sends to leads with found emails · <strong>WhatsApp</strong> sends to leads with phone numbers.
                </p>
                <Button className="w-full" disabled={!form.name || createMutation.isPending}
                  onClick={() => createMutation.mutate()}>
                  {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Create Campaign
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Summary bar */}
        {(campaigns as any[]).length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Total Leads",  value: totalLeads,   icon: Users,     color: "text-blue-400",  bg: "bg-blue-400/10"  },
              { label: "Emails Sent",  value: totalSent,    icon: Mail,      color: "text-green-400", bg: "bg-green-400/10" },
              { label: "Replies",      value: totalReplied, icon: MessageSquare, color: "text-primary",   bg: "bg-primary/10"   },
            ].map(({ label, value, icon: Icon, color, bg }) => (
              <div key={label} className="glass-card p-4 flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`h-4 w-4 ${color}`} />
                </div>
                <div>
                  <p className="text-xl font-bold">{value.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {isLoading ? (
          <div className="grid gap-4">
            {[1,2,3].map(i => <div key={i} className="glass-card p-6 animate-pulse h-40" />)}
          </div>
        ) : (campaigns as any[]).length === 0 ? (
          <div className="glass-card p-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-5">
              <Rocket className="h-8 w-8 text-primary" />
            </div>
            <h3 className="font-semibold text-base mb-2">No campaigns yet</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
              Create a campaign, pick a template, and launch personalised outreach to your scraped leads in one click.
            </p>
            <div className="flex gap-3 justify-center">
              <Button onClick={() => setIsOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> New Campaign</Button>
              <Link to="/leads"><Button variant="outline" className="gap-2"><Users className="h-4 w-4" /> View Leads</Button></Link>
            </div>
          </div>
        ) : (
          <div className="grid gap-4">
            {(campaigns as any[]).map((c: any) => {
              const replyRate  = c.sent_count > 0 ? ((c.replied_count / c.sent_count) * 100).toFixed(1) : "0";
              const openRate   = c.sent_count > 0 ? ((c.opened_count  / c.sent_count) * 100).toFixed(1) : "0";
              return (
                <div key={c.id} className="glass-card p-6 hover:border-primary/25 transition-all">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="font-semibold">{c.name}</h3>
                        <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${statusStyle[c.status]}`}>
                          {c.status}
                        </span>
                        {c.status === "active" && (
                          <span className="flex items-center gap-1 text-xs text-green-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /> Live
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {c.keyword && `${c.keyword} · `}{c.location || ''}{c.created_at && ` · ${new Date(c.created_at).toLocaleDateString()}`}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                      {c.status === 'draft' && (
                        <>
                          <Button size="sm" className="gap-1.5"
                            disabled={launchingId === c.id}
                            onClick={() => { setLaunchingId(c.id); launchEmailMutation.mutate(c.id); }}>
                            {launchingId === c.id && launchEmailMutation.isPending
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Mail className="h-3.5 w-3.5" />}
                            Email
                          </Button>
                          <Button size="sm" variant="outline" className="gap-1.5 border-green-500/40 text-green-400 hover:bg-green-500/10"
                            disabled={launchingId === c.id}
                            onClick={() => { setLaunchingId(c.id); launchWhatsAppMutation.mutate(c.id); }}>
                            {launchingId === c.id && launchWhatsAppMutation.isPending
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Phone className="h-3.5 w-3.5" />}
                            WhatsApp
                          </Button>
                        </>
                      )}
                      {c.status === 'active' && (
                        <Button variant="outline" size="sm" className="gap-1.5"
                          onClick={() => pauseMutation.mutate(c.id)}>
                          <Pause className="h-3.5 w-3.5" /> Pause
                        </Button>
                      )}
                      {c.status === 'paused' && (
                        <>
                          <Button size="sm" className="gap-1.5"
                            onClick={() => { setLaunchingId(c.id); launchEmailMutation.mutate(c.id); }}>
                            <Play className="h-3.5 w-3.5" /> Resume Email
                          </Button>
                          <Button size="sm" variant="outline" className="gap-1.5 border-green-500/40 text-green-400"
                            onClick={() => { setLaunchingId(c.id); launchWhatsAppMutation.mutate(c.id); }}>
                            <Phone className="h-3.5 w-3.5" /> Resume WA
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Send progress bar */}
                  {c.leads_count > 0 && (
                    <SendProgressBar sent={c.sent_count || 0} total={c.leads_count} label="Send progress" />
                  )}

                  {/* Stats row */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 pt-4 mt-3 border-t border-border/40">
                    {[
                      { icon: Users,         label: "Leads",    value: c.leads_count,    sub: null },
                      { icon: Mail,          label: "Sent",     value: c.sent_count,     sub: null },
                      { icon: BarChart2,     label: "Opened",   value: c.opened_count,   sub: `${openRate}%` },
                      { icon: MessageSquare, label: "Replied",  value: c.replied_count,  sub: `${replyRate}%` },
                      { icon: TrendingUp,    label: "Bounced",  value: c.bounced_count,  sub: null },
                    ].map(({ icon: Icon, label, value, sub }) => (
                      <div key={label} className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-primary flex-shrink-0" />
                        <div>
                          <p className="text-lg font-bold leading-none">{value ?? 0}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{label}{sub ? ` · ${sub}` : ""}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

