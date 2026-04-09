import { DashboardLayout } from "@/components/DashboardLayout";
import { Search, Plus, Download, MoreHorizontal, Globe, Phone, MapPin, Trash2, Pencil, TrendingUp, CheckSquare, ChevronDown, Zap, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Lead } from "@/lib/api";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Link } from "react-router-dom";

const statusColors: Record<string, string> = {
  new:       "bg-blue-500/15 text-blue-400 border border-blue-500/20",
  contacted: "bg-yellow-500/15 text-yellow-400 border border-yellow-500/20",
  replied:   "bg-green-500/15 text-green-400 border border-green-500/20",
  meeting:   "bg-purple-500/15 text-purple-400 border border-purple-500/20",
  closed:    "bg-gray-500/15 text-gray-400 border border-gray-500/20",
};

const calcScore = (lead: any): number => {
  let s = 0;
  if (lead.email)   s += 30;
  if (lead.phone)   s += 20;
  if (lead.website) s += 15;
  if (lead.rating)  s += Math.min(20, Math.round((lead.rating / 5) * 20));
  if (lead.reviews && lead.reviews > 10) s += 15;
  return Math.min(100, s);
};

const scoreColor = (score: number) =>
  score >= 75 ? "text-green-400 bg-green-400/10" :
  score >= 50 ? "text-yellow-400 bg-yellow-400/10" :
  score >= 25 ? "text-orange-400 bg-orange-400/10" :
               "text-muted-foreground bg-muted";

const EMPTY_FORM = {
  name: "", email: "", phone: "", website: "", address: "",
  status: "new" as Lead["status"],
  source: "Google Maps" as Lead["source"],
};

export default function Leads() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const queryClient = useQueryClient();

  const { data: leadsData, isLoading } = useQuery({
    queryKey: ["leads", searchQuery, statusFilter],
    queryFn: () => api.leads.list(searchQuery, statusFilter),
  });
  const leads = leadsData?.leads ?? [];
  const totalLeads = leadsData?.total ?? 0;

  const createMutation = useMutation({
    mutationFn: api.leads.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      setIsAddOpen(false);
      setFormData(EMPTY_FORM);
      toast.success("Lead added successfully!");
    },
    onError: (e: Error) => toast.error(e.message || "Failed to add lead"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Lead> }) => api.leads.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      setEditingLead(null);
      toast.success("Lead updated!");
    },
    onError: (e: Error) => toast.error(e.message || "Failed to update lead"),
  });

  const deleteMutation = useMutation({
    mutationFn: api.leads.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      toast.success("Lead deleted");
    },
    onError: (e: Error) => toast.error(e.message || "Failed to delete lead"),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;
    if (editingLead?.id) {
      updateMutation.mutate({ id: editingLead.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const openEdit = (lead: Lead) => {
    setEditingLead(lead);
    setFormData({
      name: lead.name, email: lead.email || "", phone: lead.phone || "",
      website: lead.website || "", address: lead.address || "",
      status: lead.status, source: lead.source,
    });
    setIsAddOpen(true);
  };

  const handleExport = async () => {
    try {
      const blob = await api.leads.exportCsv(searchQuery, statusFilter);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
      URL.revokeObjectURL(url);
      toast.success("CSV exported!");
    } catch {
      const headers = ["Name", "Email", "Phone", "Website", "Address", "Status", "Source", "Added"];
      const rows = leads.map((l) => [
        l.name, l.email || "", l.phone || "", l.website || "",
        l.address || "", l.status, l.source,
        l.created_at ? new Date(l.created_at).toLocaleDateString() : "",
      ]);
      const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
      URL.revokeObjectURL(url);
      toast.success("CSV exported!");
    }
  };

  // Bulk selection helpers
  const toggleSelect = (id: number) =>
    setSelectedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const selectAll = () =>
    setSelectedIds(leads.length === selectedIds.size ? new Set() : new Set(leads.map((l: any) => l.id)));
  const handleBulkDelete = () => {
    selectedIds.forEach(id => deleteMutation.mutate(id));
    setSelectedIds(new Set());
    toast.success(`Deleted ${selectedIds.size} leads`);
  };
  const handleBulkStatus = (status: string) => {
    selectedIds.forEach(id => updateMutation.mutate({ id, data: { status } as any }));
    setSelectedIds(new Set());
    toast.success(`${selectedIds.size} leads moved to ${status}`);
  };

  const LeadForm = () => (
    <form onSubmit={handleSubmit} className="space-y-4 mt-2">
      <div>
        <Label className="text-xs text-muted-foreground">Business Name <span className="text-destructive">*</span></Label>
        <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="e.g. Acme Restaurant" className="mt-1.5" required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Email</Label>
          <Input type="email" value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            placeholder="hello@business.com" className="mt-1.5" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Phone</Label>
          <Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            placeholder="+254 700 000 000" className="mt-1.5" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Website</Label>
          <Input value={formData.website} onChange={(e) => setFormData({ ...formData, website: e.target.value })}
            placeholder="https://..." className="mt-1.5" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Address</Label>
          <Input value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            placeholder="Nairobi, Kenya" className="mt-1.5" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Status</Label>
          <Select value={formData.status} onValueChange={(v: any) => setFormData({ ...formData, status: v })}>
            <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["new", "contacted", "replied", "meeting", "closed"].map((s) => (
                <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Source</Label>
          <Select value={formData.source} onValueChange={(v: any) => setFormData({ ...formData, source: v })}>
            <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Google Maps">Google Maps</SelectItem>
              <SelectItem value="Directory">Directory</SelectItem>
              <SelectItem value="LinkedIn">LinkedIn</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={createMutation.isPending || updateMutation.isPending}>
        {createMutation.isPending || updateMutation.isPending ? "Saving..." : editingLead ? "Update Lead" : "Add Lead"}
      </Button>
    </form>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Lead Database</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {isLoading ? "Loading…" : `${totalLeads} lead${totalLeads !== 1 ? "s" : ""}`}
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" size="sm" className="gap-2" onClick={handleExport}>
              <Download className="h-4 w-4" /> Export CSV
            </Button>
            <Dialog open={isAddOpen} onOpenChange={(o) => { setIsAddOpen(o); if (!o) { setFormData(EMPTY_FORM); setEditingLead(null); } }}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-2"><Plus className="h-4 w-4" /> Add Lead</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader><DialogTitle>{editingLead ? "Edit Lead" : "Add New Lead"}</DialogTitle></DialogHeader>
                <LeadForm />
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by name or email…" value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
          </div>
          <div className="flex gap-1 flex-wrap">
            {["all", "new", "contacted", "replied", "meeting", "closed"].map((s) => (
              <Button key={s} variant={statusFilter === s ? "default" : "outline"} size="sm"
                onClick={() => setStatusFilter(s)}>
                {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
              </Button>
            ))}
          </div>
        </div>

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 bg-primary/10 border border-primary/20 rounded-xl px-4 py-2.5">
            <CheckSquare className="h-4 w-4 text-primary flex-shrink-0" />
            <span className="text-sm font-medium text-primary">{selectedIds.size} lead{selectedIds.size !== 1 ? "s" : ""} selected</span>
            <div className="w-px h-4 bg-border" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="h-7 text-xs gap-1">
                  Move to stage <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {["new", "contacted", "replied", "meeting", "closed"].map(s => (
                  <DropdownMenuItem key={s} onClick={() => handleBulkStatus(s)}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive gap-1.5" onClick={handleBulkDelete}>
              <Trash2 className="h-3 w-3" /> Delete selected
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-1 ml-auto" onClick={() => setSelectedIds(new Set())}>
              ✕
            </Button>
          </div>
        )}

        {/* Table */}
        <div className="rounded-xl border border-border overflow-hidden glass-card">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="p-4 w-10">
                    <input type="checkbox" className="rounded"
                      checked={selectedIds.size === leads.length && leads.length > 0}
                      onChange={selectAll} />
                  </th>
                  <th className="text-left p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Business</th>
                  <th className="text-left p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contact</th>
                  <th className="text-left p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Location</th>
                  <th className="text-left p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                  <th className="text-left p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Score</th>
                  <th className="text-left p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Added</th>
                  <th className="w-12"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/50 animate-pulse">
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="p-4"><div className="h-4 bg-muted rounded w-3/4" /></td>
                      ))}
                    </tr>
                  ))
                ) : leads.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-16 text-center">
                      <div className="flex flex-col items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                          <Users className="h-7 w-7 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium mb-1">No leads found</p>
                          <p className="text-sm text-muted-foreground mb-4">
                            {searchQuery || statusFilter !== "all"
                              ? "Try adjusting your search or filters."
                              : "Scrape Google Maps to find businesses, or add leads manually."}
                          </p>
                          {!searchQuery && statusFilter === "all" && (
                            <div className="flex gap-3 justify-center">
                              <Link to="/automation"><Button size="sm" className="gap-2"><Zap className="h-3.5 w-3.5" /> Run a Scrape</Button></Link>
                              <Button size="sm" variant="outline" className="gap-2" onClick={() => setIsAddOpen(true)}>
                                <Plus className="h-3.5 w-3.5" /> Add Manually
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  leads.map((lead: Lead) => {
                    const score = calcScore(lead);
                    return (
                      <tr key={lead.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                        <td className="p-4">
                          <input type="checkbox" className="rounded"
                            checked={selectedIds.has(lead.id!)}
                            onChange={() => lead.id && toggleSelect(lead.id)} />
                        </td>
                        <td className="p-4">
                          <div className="font-medium text-sm">{lead.name}</div>
                          {lead.website && (
                            <a href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
                              target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs text-primary mt-1 hover:underline">
                              <Globe className="h-3 w-3" />
                              {lead.website.replace(/^https?:\/\//, "").slice(0, 30)}
                            </a>
                          )}
                        </td>
                        <td className="p-4">
                          {lead.email && <div className="text-sm">{lead.email}</div>}
                          {lead.phone && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                              <Phone className="h-3 w-3" /> {lead.phone}
                            </div>
                          )}
                        </td>
                        <td className="p-4 text-sm text-muted-foreground">
                          {lead.address && (
                            <div className="flex items-center gap-1">
                              <MapPin className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate max-w-[140px]">{lead.address}</span>
                            </div>
                          )}
                        </td>
                        <td className="p-4">
                          <span className={`inline-block px-2.5 py-1 text-xs rounded-full font-medium ${statusColors[lead.status]}`}>
                            {lead.status}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${scoreColor(score)}`}>
                            <TrendingUp className="h-3 w-3" />{score}
                          </span>
                        </td>
                        <td className="p-4 text-sm text-muted-foreground">
                          {lead.created_at ? new Date(lead.created_at).toLocaleDateString("en-KE") : "—"}
                        </td>
                        <td className="p-4">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="p-1 rounded hover:bg-muted transition-colors">
                                <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEdit(lead)}>
                                <Pencil className="h-4 w-4 mr-2" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive focus:text-destructive"
                                onClick={() => lead.id && deleteMutation.mutate(lead.id)}>
                                <Trash2 className="h-4 w-4 mr-2" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
