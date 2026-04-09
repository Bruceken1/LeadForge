import { DashboardLayout } from "@/components/DashboardLayout";
import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Phone, Mail, Globe, MapPin, Star, MoreHorizontal,
  Plus, Search, X, ChevronRight, MessageSquare,
  Pencil, Trash2, Tag, Clock, TrendingUp, Users,
  FileText, CheckCircle, AlertCircle, Zap, ArrowUpRight,
  Building2, Calendar, StickyNote, Activity,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────
type NoteEntry = { id: string; text: string; created_at: string; author: string };
type ActivityEntry = { id: string; type: "email" | "call" | "note" | "stage" | "whatsapp"; text: string; created_at: string };

// ── Constants ──────────────────────────────────────────────────
const STAGES = [
  { key: "new",       label: "New",        color: "bg-blue-500",   text: "text-blue-400",   border: "border-blue-500",   bg: "bg-blue-500/10"   },
  { key: "contacted", label: "Contacted",  color: "bg-yellow-500", text: "text-yellow-400", border: "border-yellow-500", bg: "bg-yellow-500/10" },
  { key: "replied",   label: "Replied",    color: "bg-green-500",  text: "text-green-400",  border: "border-green-500",  bg: "bg-green-500/10"  },
  { key: "meeting",   label: "Meeting",    color: "bg-purple-500", text: "text-purple-400", border: "border-purple-500", bg: "bg-purple-500/10" },
  { key: "closed",    label: "Closed",     color: "bg-primary",    text: "text-primary",    border: "border-primary",    bg: "bg-primary/10"    },
];

const STAGE_MAP = Object.fromEntries(STAGES.map(s => [s.key, s]));

const SCORE_COLOR = (score: number) =>
  score >= 75 ? "text-green-400 bg-green-400/10" :
  score >= 50 ? "text-yellow-400 bg-yellow-400/10" :
  score >= 25 ? "text-orange-400 bg-orange-400/10" :
               "text-muted-foreground bg-muted";

// Fake enrichment score based on available fields
const calcScore = (lead: any): number => {
  let s = 0;
  if (lead.email)   s += 30;
  if (lead.phone)   s += 20;
  if (lead.website) s += 15;
  if (lead.rating)  s += Math.min(20, Math.round((lead.rating / 5) * 20));
  if (lead.reviews && lead.reviews > 10) s += 15;
  return Math.min(100, s);
};

// ── Sub-components ─────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${SCORE_COLOR(score)}`}>
      <TrendingUp className="h-3 w-3" />{score}
    </span>
  );
}

function StageBadge({ status }: { status: string }) {
  const s = STAGE_MAP[status] ?? STAGES[0];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${s.text} ${s.bg} ${s.border}/30`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.color}`} />
      {s.label}
    </span>
  );
}

function EmptyState({ onAction }: { onAction: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
        <Users className="h-8 w-8 text-primary" />
      </div>
      <h3 className="font-semibold text-lg mb-2">No leads in your CRM yet</h3>
      <p className="text-sm text-muted-foreground max-w-sm mb-6">
        Scrape businesses from Google Maps or add leads manually to start building your pipeline.
      </p>
      <div className="flex gap-3">
        <Button onClick={onAction} className="gap-2">
          <Plus className="h-4 w-4" /> Add Lead Manually
        </Button>
        <a href="/automation">
          <Button variant="outline" className="gap-2">
            <Zap className="h-4 w-4" /> Run a Scrape
          </Button>
        </a>
      </div>
    </div>
  );
}

// ── Lead Detail Panel ──────────────────────────────────────────
function LeadDetailPanel({ lead, onClose, onUpdate, onDelete }: {
  lead: any; onClose: () => void;
  onUpdate: (id: number, data: any) => void;
  onDelete: (id: number) => void;
}) {
  const score = calcScore(lead);
  const [noteText, setNoteText] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "activity" | "notes">("overview");
  const [editField, setEditField] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const [notes, setNotes] = useState<NoteEntry[]>([
    { id: "1", text: "Spoke to manager — interested in digital marketing services.", created_at: new Date(Date.now() - 86400000 * 2).toISOString(), author: "You" },
  ]);
  const [activities] = useState<ActivityEntry[]>([
    { id: "a1", type: "stage",    text: "Stage moved to Contacted",        created_at: new Date(Date.now() - 86400000).toISOString() },
    { id: "a2", type: "email",    text: "Cold email sent via campaign",     created_at: new Date(Date.now() - 86400000 * 3).toISOString() },
    { id: "a3", type: "note",     text: "Note added",                       created_at: new Date(Date.now() - 86400000 * 4).toISOString() },
  ]);

  const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
  const fmtTime = (d: string) => new Date(d).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" });

  const startEdit = (field: string, current: string) => { setEditField(field); setEditVal(current || ""); };
  const saveEdit = () => {
    if (!editField) return;
    onUpdate(lead.id, { [editField]: editVal });
    setEditField(null);
  };

  const addNote = () => {
    if (!noteText.trim()) return;
    const n: NoteEntry = { id: Date.now().toString(), text: noteText.trim(), created_at: new Date().toISOString(), author: "You" };
    setNotes(prev => [n, ...prev]);
    setNoteText("");
    toast.success("Note saved");
  };

  const actIcon = (type: ActivityEntry["type"]) => {
    if (type === "email")    return <Mail className="h-3.5 w-3.5 text-blue-400" />;
    if (type === "call")     return <Phone className="h-3.5 w-3.5 text-green-400" />;
    if (type === "note")     return <StickyNote className="h-3.5 w-3.5 text-yellow-400" />;
    if (type === "stage")    return <Activity className="h-3.5 w-3.5 text-primary" />;
    if (type === "whatsapp") return <MessageSquare className="h-3.5 w-3.5 text-green-400" />;
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="w-full max-w-lg bg-background border-l border-border flex flex-col h-full overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-border flex-shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-primary/15 flex items-center justify-center text-primary font-bold text-lg flex-shrink-0">
              {lead.name?.charAt(0)?.toUpperCase() || "?"}
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-base truncate">{lead.name}</h2>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <StageBadge status={lead.status} />
                <ScoreBadge score={score} />
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground flex-shrink-0 ml-2">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Quick actions */}
        <div className="flex gap-2 px-5 py-3 border-b border-border/50 flex-shrink-0">
          {lead.email && (
            <a href={`mailto:${lead.email}`}>
              <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                <Mail className="h-3.5 w-3.5" /> Email
              </Button>
            </a>
          )}
          {lead.phone && (
            <a href={`tel:${lead.phone}`}>
              <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                <Phone className="h-3.5 w-3.5" /> Call
              </Button>
            </a>
          )}
          {lead.phone && (
            <a href={`https://wa.me/${lead.phone?.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                <MessageSquare className="h-3.5 w-3.5" /> WhatsApp
              </Button>
            </a>
          )}
          {lead.website && (
            <a href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                <Globe className="h-3.5 w-3.5" /> Website
              </Button>
            </a>
          )}
        </div>

        {/* Stage mover */}
        <div className="px-5 py-3 border-b border-border/50 flex-shrink-0">
          <p className="text-xs text-muted-foreground mb-2 font-medium">Move stage</p>
          <div className="flex gap-1.5 flex-wrap">
            {STAGES.map(s => (
              <button key={s.key}
                onClick={() => onUpdate(lead.id, { status: s.key })}
                className={`text-xs px-2.5 py-1 rounded-full border transition-all font-medium
                  ${lead.status === s.key ? `${s.color} text-background border-transparent` : `${s.text} ${s.bg} ${s.border}/30 hover:opacity-80`}`}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border flex-shrink-0">
          {(["overview", "activity", "notes"] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 text-xs font-medium capitalize transition-colors
                ${activeTab === tab ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}>
              {tab}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-5">

          {/* OVERVIEW */}
          {activeTab === "overview" && (
            <div className="space-y-4">
              {/* Contact info */}
              <div className="glass-card p-4 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contact Info</p>
                {[
                  { icon: Mail,     field: "email",   label: "Email",   val: lead.email   },
                  { icon: Phone,    field: "phone",   label: "Phone",   val: lead.phone   },
                  { icon: Globe,    field: "website", label: "Website", val: lead.website },
                  { icon: MapPin,   field: "address", label: "Address", val: lead.address },
                  { icon: Building2,field: "city",    label: "City",    val: lead.city    },
                ].map(({ icon: Icon, field, label, val }) => (
                  <div key={field} className="flex items-start gap-3 group">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      {editField === field ? (
                        <div className="flex gap-1.5 mt-1">
                          <Input value={editVal} onChange={e => setEditVal(e.target.value)} className="h-7 text-xs" autoFocus
                            onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditField(null); }} />
                          <Button size="sm" className="h-7 px-2" onClick={saveEdit}><CheckCircle className="h-3.5 w-3.5" /></Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditField(null)}><X className="h-3.5 w-3.5" /></Button>
                        </div>
                      ) : (
                        <p className="text-sm truncate cursor-pointer hover:text-primary" onClick={() => startEdit(field, val)}>
                          {val || <span className="text-muted-foreground italic">Not set — click to add</span>}
                        </p>
                      )}
                    </div>
                    <button onClick={() => startEdit(field, val)} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted flex-shrink-0">
                      <Pencil className="h-3 w-3 text-muted-foreground" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Business details */}
              <div className="glass-card p-4 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Business Details</p>
                {lead.rating && (
                  <div className="flex items-center gap-2">
                    <Star className="h-3.5 w-3.5 text-primary fill-primary" />
                    <span className="text-sm">{lead.rating} stars</span>
                    {lead.reviews && <span className="text-xs text-muted-foreground">({lead.reviews} reviews)</span>}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm">{lead.industry || lead.source || "—"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Added {lead.created_at ? fmtDate(lead.created_at) : "—"}</span>
                </div>
              </div>

              {/* Lead score breakdown */}
              <div className="glass-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Lead Score</p>
                  <ScoreBadge score={score} />
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden mb-3">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${score}%` }} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "Has Email",   ok: !!lead.email   },
                    { label: "Has Phone",   ok: !!lead.phone   },
                    { label: "Has Website", ok: !!lead.website },
                    { label: "High Rating", ok: (lead.rating || 0) >= 4 },
                  ].map(({ label, ok }) => (
                    <div key={label} className="flex items-center gap-1.5 text-xs">
                      {ok ? <CheckCircle className="h-3 w-3 text-green-400" /> : <AlertCircle className="h-3 w-3 text-muted-foreground" />}
                      <span className={ok ? "text-foreground" : "text-muted-foreground"}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Danger */}
              <div className="pt-2 border-t border-border/50 flex justify-end">
                <Button size="sm" variant="outline" className="gap-2 border-destructive/30 text-destructive hover:bg-destructive/10"
                  onClick={() => { onDelete(lead.id); onClose(); }}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete Lead
                </Button>
              </div>
            </div>
          )}

          {/* ACTIVITY */}
          {activeTab === "activity" && (
            <div className="space-y-3">
              {activities.map(a => (
                <div key={a.id} className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                    {actIcon(a.type)}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm">{a.text}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{fmtDate(a.created_at)} at {fmtTime(a.created_at)}</p>
                  </div>
                </div>
              ))}
              {activities.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">No activity recorded yet.</p>
              )}
            </div>
          )}

          {/* NOTES */}
          {activeTab === "notes" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <textarea
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  placeholder="Add a note about this lead…"
                  className="w-full h-24 bg-muted/40 border border-border rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
                />
                <Button size="sm" className="gap-2 w-full" onClick={addNote} disabled={!noteText.trim()}>
                  <StickyNote className="h-3.5 w-3.5" /> Save Note
                </Button>
              </div>
              <div className="space-y-3">
                {notes.map(n => (
                  <div key={n.id} className="glass-card p-3">
                    <p className="text-sm leading-relaxed">{n.text}</p>
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-xs text-muted-foreground">{n.author} · {fmtDate(n.created_at)}</p>
                      <button onClick={() => setNotes(prev => prev.filter(x => x.id !== n.id))}
                        className="text-xs text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
                {notes.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No notes yet.</p>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main CRM Page ──────────────────────────────────────────────
const EMPTY_FORM = {
  name: "", email: "", phone: "", website: "", address: "",
  status: "new" as const, source: "Manual" as const,
};

export default function CRM() {
  const qc = useQueryClient();
  const [view, setView] = useState<"board" | "list">("board");
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [selectedLead, setSelectedLead] = useState<any | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [draggingId, setDraggingId] = useState<number | null>(null);

  const { data: leadsData, isLoading } = useQuery({
    queryKey: ["leads", search, stageFilter],
    queryFn: () => api.leads.list(search, stageFilter === "all" ? "all" : stageFilter),
  });
  const leads: any[] = leadsData?.leads ?? [];
  const total = leadsData?.total ?? 0;

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => api.leads.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      // Refresh selectedLead with updated data
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.leads.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      toast.success("Lead deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createMutation = useMutation({
    mutationFn: api.leads.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      setIsAddOpen(false);
      setForm(EMPTY_FORM);
      toast.success("Lead added to CRM!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleUpdate = (id: number, data: any) => {
    updateMutation.mutate({ id, data });
    if (selectedLead?.id === id) setSelectedLead((prev: any) => ({ ...prev, ...data }));
  };

  const handleBulkStage = (status: string) => {
    selectedIds.forEach(id => updateMutation.mutate({ id, data: { status } }));
    setSelectedIds(new Set());
    toast.success(`${selectedIds.size} leads moved to ${status}`);
  };

  const handleBulkDelete = () => {
    selectedIds.forEach(id => deleteMutation.mutate(id));
    setSelectedIds(new Set());
  };

  const toggleSelect = (id: number) =>
    setSelectedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const selectAll = () =>
    setSelectedIds(leads.length === selectedIds.size ? new Set() : new Set(leads.map((l: any) => l.id)));

  // Drag & drop for board view
  const onDragStart = (id: number) => setDraggingId(id);
  const onDropStage = (status: string) => {
    if (draggingId) handleUpdate(draggingId, { status });
    setDraggingId(null);
  };

  // Summary stats
  const stageCounts = Object.fromEntries(STAGES.map(s => [s.key, leads.filter((l: any) => l.status === s.key).length]));
  const avgScore = leads.length ? Math.round(leads.reduce((a, l) => a + calcScore(l), 0) / leads.length) : 0;

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full">

        {/* Top bar */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 flex-shrink-0">
          <div>
            <h1 className="text-2xl font-bold">CRM</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{total} leads · avg score {avgScore}</p>
          </div>
          <div className="flex items-center gap-3">
            {/* View toggle */}
            <div className="flex bg-muted rounded-lg p-1 gap-0.5">
              {(["board", "list"] as const).map(v => (
                <button key={v} onClick={() => setView(v)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all capitalize
                    ${view === v ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  {v}
                </button>
              ))}
            </div>
            <Button size="sm" className="gap-2" onClick={() => setIsAddOpen(true)}>
              <Plus className="h-4 w-4" /> Add Lead
            </Button>
          </div>
        </div>

        {/* Pipeline summary bar */}
        <div className="flex gap-3 px-6 pb-4 overflow-x-auto flex-shrink-0">
          {STAGES.map(s => (
            <div key={s.key} className={`glass-card px-4 py-2.5 flex items-center gap-3 min-w-[130px] cursor-pointer hover:border-primary/30 transition-all
              ${stageFilter === s.key ? "border-primary/50 ring-1 ring-primary/20" : ""}`}
              onClick={() => setStageFilter(prev => prev === s.key ? "all" : s.key)}>
              <div className={`w-2.5 h-2.5 rounded-full ${s.color} flex-shrink-0`} />
              <div>
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-lg font-bold leading-none mt-0.5">{stageCounts[s.key] ?? 0}</p>
              </div>
            </div>
          ))}
          <div className="glass-card px-4 py-2.5 flex items-center gap-3 min-w-[130px]">
            <TrendingUp className="h-4 w-4 text-primary flex-shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Avg Score</p>
              <p className="text-lg font-bold leading-none mt-0.5">{avgScore}</p>
            </div>
          </div>
        </div>

        {/* Search + bulk actions */}
        <div className="flex items-center gap-3 px-6 pb-4 flex-shrink-0">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search leads…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 text-sm" />
          </div>

          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-lg px-3 py-1.5">
              <span className="text-xs font-medium text-primary">{selectedIds.size} selected</span>
              <div className="w-px h-4 bg-border" />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-7 text-xs gap-1">
                    Move to <ChevronRight className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {STAGES.map(s => (
                    <DropdownMenuItem key={s.key} onClick={() => handleBulkStage(s.key)}>
                      <span className={`w-2 h-2 rounded-full ${s.color} mr-2`} />{s.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive gap-1" onClick={handleBulkDelete}>
                <Trash2 className="h-3 w-3" /> Delete
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-1" onClick={() => setSelectedIds(new Set())}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-hidden px-6 pb-6">

          {isLoading ? (
            <div className="grid grid-cols-5 gap-4">
              {STAGES.map(s => (
                <div key={s.key} className="glass-card p-3 space-y-2">
                  <div className="h-4 w-20 bg-muted animate-pulse rounded" />
                  {[1,2,3].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />)}
                </div>
              ))}
            </div>
          ) : leads.length === 0 && !search ? (
            <EmptyState onAction={() => setIsAddOpen(true)} />
          ) : view === "board" ? (

            /* ── BOARD VIEW ── */
            <div className="flex gap-4 h-full overflow-x-auto pb-2">
              {STAGES.map(stage => {
                const stageLeads = leads.filter((l: any) => l.status === stage.key);
                return (
                  <div key={stage.key}
                    className={`min-w-[240px] w-[240px] flex flex-col glass-card overflow-hidden border-t-2 ${stage.border} transition-all
                      ${draggingId ? "ring-1 ring-primary/20" : ""}`}
                    onDragOver={e => e.preventDefault()}
                    onDrop={() => onDropStage(stage.key)}>

                    <div className="flex items-center justify-between p-3 border-b border-border/50 flex-shrink-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-semibold ${stage.text}`}>{stage.label}</span>
                        <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{stageLeads.length}</span>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 space-y-2">
                      {stageLeads.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-10 text-center">
                          <p className="text-xs text-muted-foreground">Drop leads here</p>
                        </div>
                      )}
                      {stageLeads.map((lead: any) => {
                        const score = calcScore(lead);
                        return (
                          <div key={lead.id}
                            draggable
                            onDragStart={() => onDragStart(lead.id)}
                            onDragEnd={() => setDraggingId(null)}
                            onClick={() => setSelectedLead(lead)}
                            className="bg-background/60 hover:bg-muted/50 rounded-lg p-3 cursor-pointer border border-border/50 hover:border-primary/20 transition-all group relative">

                            <div className="flex items-start justify-between gap-1 mb-2">
                              <p className="text-sm font-medium leading-tight truncate">{lead.name}</p>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                                  <button className="p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                                    <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-40">
                                  <p className="text-xs text-muted-foreground px-2 py-1 font-medium">Move to</p>
                                  <DropdownMenuSeparator />
                                  {STAGES.filter(s => s.key !== stage.key).map(s => (
                                    <DropdownMenuItem key={s.key} onClick={() => handleUpdate(lead.id, { status: s.key })}>
                                      <span className={`w-2 h-2 rounded-full ${s.color} mr-2`} />{s.label}
                                    </DropdownMenuItem>
                                  ))}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem className="text-destructive" onClick={() => deleteMutation.mutate(lead.id)}>
                                    <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>

                            {lead.city && <p className="text-xs text-muted-foreground truncate mb-1.5">{lead.city}</p>}

                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {lead.email && <Mail className="h-3 w-3 text-muted-foreground" />}
                                {lead.phone && <Phone className="h-3 w-3 text-muted-foreground" />}
                                {lead.rating && (
                                  <div className="flex items-center gap-0.5">
                                    <Star className="h-3 w-3 text-primary fill-primary" />
                                    <span className="text-xs text-muted-foreground">{lead.rating}</span>
                                  </div>
                                )}
                              </div>
                              <ScoreBadge score={score} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

          ) : (

            /* ── LIST VIEW ── */
            <div className="glass-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="p-3 w-10">
                        <input type="checkbox" className="rounded"
                          checked={selectedIds.size === leads.length && leads.length > 0}
                          onChange={selectAll} />
                      </th>
                      <th className="text-left p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Business</th>
                      <th className="text-left p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contact</th>
                      <th className="text-left p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Stage</th>
                      <th className="text-left p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Score</th>
                      <th className="text-left p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Added</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {leads.length === 0 ? (
                      <tr><td colSpan={7} className="p-12 text-center text-sm text-muted-foreground">No leads found.</td></tr>
                    ) : leads.map((lead: any) => {
                      const score = calcScore(lead);
                      return (
                        <tr key={lead.id}
                          className="border-b border-border/40 hover:bg-muted/20 transition-colors cursor-pointer"
                          onClick={() => setSelectedLead(lead)}>
                          <td className="p-3" onClick={e => e.stopPropagation()}>
                            <input type="checkbox" className="rounded"
                              checked={selectedIds.has(lead.id)}
                              onChange={() => toggleSelect(lead.id)} />
                          </td>
                          <td className="p-3">
                            <p className="text-sm font-medium">{lead.name}</p>
                            <p className="text-xs text-muted-foreground">{lead.city || lead.address || "—"}</p>
                          </td>
                          <td className="p-3">
                            <p className="text-sm">{lead.email || <span className="text-muted-foreground">—</span>}</p>
                            <p className="text-xs text-muted-foreground">{lead.phone || ""}</p>
                          </td>
                          <td className="p-3"><StageBadge status={lead.status} /></td>
                          <td className="p-3"><ScoreBadge score={score} /></td>
                          <td className="p-3 text-sm text-muted-foreground">
                            {lead.created_at ? new Date(lead.created_at).toLocaleDateString("en-KE") : "—"}
                          </td>
                          <td className="p-3" onClick={e => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button className="p-1 rounded hover:bg-muted">
                                  <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setSelectedLead(lead)}>
                                  <FileText className="h-4 w-4 mr-2" /> View Details
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive" onClick={() => deleteMutation.mutate(lead.id)}>
                                  <Trash2 className="h-4 w-4 mr-2" /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Lead Dialog */}
      <Dialog open={isAddOpen} onOpenChange={o => { setIsAddOpen(o); if (!o) setForm(EMPTY_FORM); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add Lead to CRM</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); if (form.name.trim()) createMutation.mutate(form); }} className="space-y-4 mt-2">
            <div>
              <Label className="text-xs text-muted-foreground">Business Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Acme Restaurant" className="mt-1.5" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Email</Label>
                <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="hello@biz.com" className="mt-1.5" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Phone</Label>
                <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+254 700 000 000" className="mt-1.5" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Website</Label>
                <Input value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="https://..." className="mt-1.5" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">City</Label>
                <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Nairobi" className="mt-1.5" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Stage</Label>
                <Select value={form.status} onValueChange={(v: any) => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{STAGES.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Source</Label>
                <Select value={form.source} onValueChange={(v: any) => setForm(f => ({ ...f, source: v }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Manual">Manual</SelectItem>
                    <SelectItem value="Google Maps">Google Maps</SelectItem>
                    <SelectItem value="LinkedIn">LinkedIn</SelectItem>
                    <SelectItem value="Directory">Directory</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Adding…" : "Add to CRM"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Lead Detail Panel */}
      {selectedLead && (
        <LeadDetailPanel
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onUpdate={handleUpdate}
          onDelete={id => deleteMutation.mutate(id)}
        />
      )}
    </DashboardLayout>
  );
}
