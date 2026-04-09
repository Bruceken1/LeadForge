import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Mail, Copy, Edit, Trash2, Loader2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const categoryColors: Record<string, string> = {
  "Cold Outreach": "bg-primary/15 text-primary border border-primary/20",
  "Follow Up":     "bg-yellow-500/15 text-yellow-400 border border-yellow-500/20",
  "Meeting":       "bg-green-500/15 text-green-400 border border-green-500/20",
  "Value Add":     "bg-purple-500/15 text-purple-400 border border-purple-500/20",
};

const TOKEN_HINT = "Tokens: {{name}} {{business}} {{city}} {{industry}} {{website}} {{sender_name}}";

export default function Templates() {
  const qc = useQueryClient();
  const { data: templates = [], isLoading } = useQuery({ queryKey: ["templates"], queryFn: api.templates.list });

  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState({ name: '', subject: '', body: '', category: 'Cold Outreach' });

  const createMutation = useMutation({
    mutationFn: () => api.templates.create(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["templates"] }); setIsOpen(false); toast.success("Template created!"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Email Templates</h1>
            <p className="text-sm text-muted-foreground mt-1">Reusable templates with dynamic tokens for personalisation</p>
          </div>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2"><Plus className="h-4 w-4" /> New Template</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader><DialogTitle>New Email Template</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Template Name</Label>
                    <Input className="mt-1.5" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="Cold Outreach — Restaurants" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Category</Label>
                    <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                      <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['Cold Outreach','Follow Up','Meeting','Value Add'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Subject Line</Label>
                  <Input className="mt-1.5" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                    placeholder="Quick idea for {{business}} 💡" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Body</Label>
                  <textarea className="mt-1.5 w-full min-h-[180px] rounded-lg border border-border bg-input px-3 py-2 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-ring"
                    value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                    placeholder={`Hi {{name}},\n\nI noticed {{business}} in {{city}}...\n\nBest,\n{{sender_name}}`} />
                  <p className="text-xs text-muted-foreground mt-1">{TOKEN_HINT}</p>
                </div>
                <Button className="w-full" disabled={!form.name || !form.subject || !form.body || createMutation.isPending}
                  onClick={() => createMutation.mutate()}>
                  {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Save Template
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1,2,3,4].map(i => <div key={i} className="glass-card p-6 animate-pulse h-40" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(templates as any[]).map((t: any) => (
              <div key={t.id} className="glass-card p-6 group hover:border-primary/25 transition-all">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Mail className="h-4 w-4 text-primary flex-shrink-0" />
                    <h3 className="text-sm font-semibold truncate">{t.name}</h3>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ml-2 ${categoryColors[t.category] || 'bg-muted text-muted-foreground'}`}>
                    {t.category}
                  </span>
                </div>
                <p className="text-xs font-medium text-foreground/80 mb-2 truncate">📧 {t.subject}</p>
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3 whitespace-pre-line">{t.body}</p>
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/40">
                  <span className="text-xs text-muted-foreground">
                    {t.campaigns_count || 0} campaign{t.campaigns_count !== 1 ? 's' : ''}
                    {t.is_ai ? ' · AI generated' : ''}
                  </span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button title="Copy" onClick={() => { navigator.clipboard.writeText(t.body); toast.success("Copied!"); }}
                      className="p-1.5 rounded hover:bg-muted transition-colors">
                      <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
