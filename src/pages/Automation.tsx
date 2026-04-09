import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Zap, Clock, Mail, Globe, Save, Search, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type AutomationConfig } from "@/lib/api";
import { useState, useEffect } from "react";
import { toast } from "sonner";

export default function Automation() {
  const qc = useQueryClient();
  const { data: config, isLoading } = useQuery({ queryKey: ["automation"], queryFn: api.automation.get });

  const [form, setForm] = useState<Partial<AutomationConfig>>({});
  const [scrapeKeyword, setScrapeKeyword] = useState("");
  const [scrapeLocation, setScrapeLocation] = useState("Nairobi, Kenya");
  const [scrapeMax, setScrapeMax] = useState(20);
  const [scraping, setScraping] = useState(false);

  useEffect(() => { if (config) setForm(config); }, [config]);

  const saveMutation = useMutation({
    mutationFn: () => api.automation.save(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["automation"] }); toast.success("Settings saved!"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleScrape = async () => {
    if (!scrapeKeyword.trim()) { toast.error("Enter a keyword"); return; }
    setScraping(true);
    const creditsBefore = scrapeMax;
    try {
      const result = await api.scrape(scrapeKeyword, scrapeLocation, scrapeMax);
      // Credit deduction toast — show how many credits were used
      const found = result?.found ?? result?.count ?? scrapeMax;
      toast.success(`✅ ${result.message}`, { description: `−${found} credits used` });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["credits"] });
    } catch (e: any) {
      toast.error(e.message || "Scrape failed");
    } finally {
      setScraping(false);
    }
  };

  const set = (k: keyof AutomationConfig, v: any) => setForm(f => ({ ...f, [k]: v }));

  if (isLoading) return <DashboardLayout><div className="p-8 text-muted-foreground">Loading…</div></DashboardLayout>;

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold">Automation</h1>
          <p className="text-sm text-muted-foreground mt-1">Configure the full Scrape → Enrich → Email pipeline</p>
        </div>

        {/* ── Manual Scrape ── */}
        <div className="glass-card p-6 space-y-4">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Search className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Manual Scrape</h2>
              <p className="text-xs text-muted-foreground">Trigger a Google Maps scrape right now</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1">
              <label className="text-xs text-muted-foreground mb-1.5 block">Keyword</label>
              <Input value={scrapeKeyword} onChange={e => setScrapeKeyword(e.target.value)}
                placeholder="restaurants, hotels…" />
            </div>
            <div className="sm:col-span-1">
              <label className="text-xs text-muted-foreground mb-1.5 block">Location</label>
              <Input value={scrapeLocation} onChange={e => setScrapeLocation(e.target.value)}
                placeholder="Nairobi, Kenya" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Max leads</label>
              <Input type="number" value={scrapeMax} onChange={e => setScrapeMax(+e.target.value)}
                min={1} max={60} />
            </div>
          </div>
          <Button onClick={handleScrape} disabled={scraping} className="gap-2">
            {scraping ? <><Loader2 className="h-4 w-4 animate-spin" /> Scraping…</> : <><Search className="h-4 w-4" /> Run Scrape Now</>}
          </Button>
          <p className="text-xs text-muted-foreground">
            Uses Google Places API. Deduplicates by place_id. New leads appear in the Leads table instantly.
          </p>
        </div>

        {/* ── Scheduled Scraping ── */}
        <div className="glass-card p-6 space-y-4">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Globe className="h-4 w-4 text-primary" />
            </div>
            <h2 className="text-sm font-semibold">Scheduled Lead Scraping</h2>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Enable Auto-Scraping</p>
              <p className="text-xs text-muted-foreground">Scrape new leads daily via cron</p>
            </div>
            <Switch checked={!!form.scraping_enabled} onCheckedChange={v => set('scraping_enabled', v ? 1 : 0)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Keywords (comma-separated)</label>
              <Input value={form.keywords || ''} onChange={e => set('keywords', e.target.value)}
                placeholder="restaurants, hotels, law firms" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Location</label>
              <Input value={form.location || ''} onChange={e => set('location', e.target.value)}
                placeholder="Nairobi, Kenya" />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Max leads per run</label>
            <Input type="number" value={form.max_leads_per_day || 50}
              onChange={e => set('max_leads_per_day', +e.target.value)} className="w-32" min={1} max={60} />
          </div>
        </div>

        {/* ── Email Outreach ── */}
        <div className="glass-card p-6 space-y-4">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Mail className="h-4 w-4 text-primary" />
            </div>
            <h2 className="text-sm font-semibold">Email Outreach</h2>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Enable Auto-Emailing</p>
              <p className="text-xs text-muted-foreground">Enrich emails with Hunter.io and send via Resend</p>
            </div>
            <Switch checked={!!form.email_enabled} onCheckedChange={v => set('email_enabled', v ? 1 : 0)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Sender name</label>
              <Input value={form.sender_name || ''} onChange={e => set('sender_name', e.target.value)}
                placeholder="David from Dime Solutions" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Sender email</label>
              <Input value={form.sender_email || ''} onChange={e => set('sender_email', e.target.value)}
                placeholder="outreach@dime-solutions.co.ke" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Daily email limit</label>
              <Input type="number" value={form.daily_email_limit || 30}
                onChange={e => set('daily_email_limit', +e.target.value)} min={1} max={50} />
              <p className="text-xs text-muted-foreground mt-1">Max 50/day to protect sender reputation</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Delay between sends (minutes)</label>
              <Input type="number" value={form.email_delay_min || 5}
                onChange={e => set('email_delay_min', +e.target.value)} min={2} />
              <p className="text-xs text-muted-foreground mt-1">Min 2 min to look human to spam filters</p>
            </div>
          </div>
        </div>

        {/* ── Schedule ── */}
        <div className="glass-card p-6 space-y-4">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Clock className="h-4 w-4 text-primary" />
            </div>
            <h2 className="text-sm font-semibold">Daily Schedule</h2>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Run pipeline daily</p>
              <p className="text-xs text-muted-foreground">Scrape → Enrich → Email, every day at the time below</p>
            </div>
            <Switch checked={!!form.schedule_enabled} onCheckedChange={v => set('schedule_enabled', v ? 1 : 0)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Time (EAT — East Africa Time)</label>
            <Input type="time" value={form.schedule_time || '09:00'}
              onChange={e => set('schedule_time', e.target.value)} className="w-36" />
          </div>
        </div>

        {/* ── AI ── */}
        <div className="glass-card p-6 space-y-4">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Zap className="h-4 w-4 text-primary" />
            </div>
            <h2 className="text-sm font-semibold">AI Email Personalisation</h2>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Use Claude AI</p>
              <p className="text-xs text-muted-foreground">Personalise every email using the lead's rating, city, and industry</p>
            </div>
            <Switch checked={!!form.use_ai} onCheckedChange={v => set('use_ai', v ? 1 : 0)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-2 block">Email tone</label>
            <div className="flex gap-2 flex-wrap">
              {['professional', 'friendly', 'direct'].map(tone => (
                <button key={tone} onClick={() => set('ai_tone', tone)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors ${
                    form.ai_tone === tone ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
                  }`}>
                  {tone}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Pipeline info ── */}
        <div className="glass-card p-5 border-primary/20 bg-primary/5">
          <p className="text-xs font-semibold text-primary mb-3">How the pipeline works</p>
          <div className="space-y-2">
            {[
              { step: '1', label: 'Scrape', desc: 'Google Places API finds businesses by keyword + location' },
              { step: '2', label: 'Enrich', desc: 'Hunter.io finds email addresses from business websites' },
              { step: '3', label: 'Personalise', desc: 'Claude AI writes a personalised email for each lead' },
              { step: '4', label: 'Send', desc: 'Resend delivers emails with unsubscribe link + bounce tracking' },
              { step: '5', label: 'Track', desc: 'Opens, replies, bounces update lead status automatically' },
            ].map(({ step, label, desc }) => (
              <div key={step} className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{step}</span>
                <div>
                  <span className="text-xs font-semibold text-foreground">{label} — </span>
                  <span className="text-xs text-muted-foreground">{desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="gap-2">
          {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Settings
        </Button>
      </div>
    </DashboardLayout>
  );
}
