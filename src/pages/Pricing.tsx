import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Zap, Check, ArrowLeft, Loader2, CreditCard, Shield, RefreshCw, Users, Mail, Star, Target, TrendingDown } from "lucide-react";
import { toast } from "sonner";

const FEATURES = [
  "Google Maps lead scraping",
  "AI email personalisation",
  "Dual enrichment (Apollo + Hunter)",
  "Email + WhatsApp campaigns",
  "CRM pipeline & lead scoring",
  "CSV export",
  "Bounce & unsubscribe handling",
  "Deduplication & validation",
  "Team collaboration",
  "Campaign analytics",
];

// Savings label shown per package index (matches typical 4-package setup from DB)
const SAVINGS_LABELS: Record<number, string> = {
  1: "Save 12%",
  2: "Save 22%",
  3: "Save 31%",
};

const POPULAR_IDX = 1;

declare global {
  interface Window {
    PaystackPop: {
      setup: (options: {
        key: string;
        email: string;
        amount: number;
        currency: string;
        ref: string;
        access_code: string;
        onClose: () => void;
        // IMPORTANT: Paystack validates callback as typeof === 'function'
        // Do NOT pass async functions — wrap in a regular function instead
        callback: (response: { reference: string }) => void;
      }) => { openIframe: () => void };
    };
  }
}

export default function Pricing() {
  const nav = useNavigate();
  const { user, org, refreshCredits } = useAuth();
  const qc = useQueryClient();
  const [buyingId, setBuyingId] = useState<number | null>(null);
  const [verifying, setVerifying] = useState(false);

  const { data: packages = [] } = useQuery({ queryKey: ["pricing"], queryFn: api.pricing });
  const { data: pkData } = useQuery({
    queryKey: ["publicKey"],
    queryFn: api.payments.publicKey,
    enabled: !!user,
  });
  const publicKey = pkData?.publicKey || "";

  const initMutation = useMutation({
    mutationFn: (pkgId: number) => api.payments.initialize(pkgId, user?.email),
    onSuccess: async (data) => {
      if (!user?.email) { toast.error("Please log in to purchase credits"); setBuyingId(null); return; }

      await loadPaystackScript();

      if (!window.PaystackPop) {
        toast.error("Paystack failed to load — check your connection and try again");
        setBuyingId(null);
        return;
      }

      // *** KEY FIX: callback must be a plain synchronous function ***
      // Paystack checks typeof callback === 'function' but async functions
      // sometimes fail their internal validation. Use a sync wrapper.
      const handler = window.PaystackPop.setup({
        key:         publicKey,
        email:       user.email,
        amount:      data.amount,
        currency:    data.currency || "KES",
        ref:         data.reference,
        access_code: data.accessCode,
        onClose() {
          setBuyingId(null);
          toast.info("Payment cancelled. No charge was made.");
        },
        // Sync wrapper — kick off async work without making callback itself async
        callback(response: { reference: string }) {
          setBuyingId(null);
          setVerifying(true);
          // Use a plain Promise chain (not async/await) inside sync function
          api.payments.verify(response.reference)
            .then((result) => refreshCredits().then(() => {
              qc.invalidateQueries({ queryKey: ["stats"] });
              toast.success(`✅ ${data.credits.toLocaleString()} credits added!`);
              nav("/");
            }))
            .catch((e: Error) => {
              toast.error(e.message || "Payment verification failed — contact support if you were charged");
            })
            .finally(() => setVerifying(false));
        },
      });

      handler.openIframe();
    },
    onError: (e: Error) => {
      setBuyingId(null);
      toast.error(e.message || "Failed to initialize payment");
    },
  });

  const handleBuy = (pkgId: number) => {
    if (!user) { nav("/register"); return; }
    setBuyingId(pkgId);
    initMutation.mutate(pkgId);
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-4 mb-10">
          <div className="w-9 h-9 rounded-xl gradient-gold flex items-center justify-center flex-shrink-0">
            <Zap className="h-4 w-4 text-[hsl(222,20%,7%)]" />
          </div>
          <span className="text-lg font-bold">Lead Engine</span>
          {user && (
            <div className="ml-auto flex items-center gap-6">
              <span className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{(org?.credits ?? 0).toLocaleString()}</span> credits remaining
              </span>
              <button onClick={() => nav(-1)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
            </div>
          )}
          {!user && (
            <button onClick={() => nav(-1)} className="ml-auto flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
          )}
        </div>

        {verifying && (
          <div className="mb-6 glass-card p-4 flex items-center gap-3 border-primary/30">
            <RefreshCw className="h-4 w-4 text-primary animate-spin" />
            <p className="text-sm">Verifying your payment with Paystack…</p>
          </div>
        )}

        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold tracking-tight">Top up your credits</h1>
          <p className="text-muted-foreground mt-3 max-w-lg mx-auto">
            1 credit = 1 business scraped. No subscriptions. Buy once, use whenever.
          </p>
          <div className="flex justify-center gap-6 mt-5 flex-wrap">
            {["Credits never expire", "Instant top-up", "No subscriptions"].map(f => (
              <span key={f} className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Check className="h-4 w-4 text-green-400" /> {f}
              </span>
            ))}
          </div>
        </div>

        {/* Packages */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {(packages as any[]).map((pkg: any, i: number) => {
            const isPopular = i === POPULAR_IDX;
            const isBuying  = buyingId === pkg.id;
            // price_usd is in cents (e.g. 700 = KSh 7). Per-lead = price / credits * 100 for display in cents
            const perLead   = ((pkg.price_usd / pkg.credits)).toFixed(2);
            const savings   = SAVINGS_LABELS[i];

            return (
              <div key={pkg.id}
                className={`glass-card p-6 flex flex-col relative transition-all duration-200
                  ${isPopular ? 'border-primary/50 ring-1 ring-primary/30 scale-[1.02]' : 'hover:border-primary/25 hover:scale-[1.01]'}`}>
                {isPopular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap">
                    <span className="gradient-gold text-[hsl(222,20%,7%)] text-xs font-bold px-3 py-1 rounded-full">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="mb-5">
                  <div className="flex items-center justify-between">
                    <p className="font-bold">{pkg.name}</p>
                    {savings && !isPopular && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 font-medium flex items-center gap-1">
                        <TrendingDown className="h-2.5 w-2.5" />{savings}
                      </span>
                    )}
                  </div>
                  <p className="text-3xl font-black mt-2">
                    KSh {(pkg.price_usd / 100).toFixed(0)}
                  </p>
                  <p className="text-sm text-primary font-semibold mt-1.5">
                    {pkg.credits.toLocaleString()} credits
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{perLead}¢ per lead</p>
                </div>

                <Button className="w-full mt-auto gap-2" size="sm"
                  variant={isPopular ? "default" : "outline"}
                  disabled={isBuying || verifying || (buyingId !== null)}
                  onClick={() => handleBuy(pkg.id)}>
                  {isBuying
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Processing…</>
                    : <><CreditCard className="h-3.5 w-3.5" /> Buy now</>
                  }
                </Button>
              </div>
            );
          })}
        </div>

        {/* Enterprise card */}
        <div className="glass-card p-5 mb-10 flex flex-col sm:flex-row items-start sm:items-center gap-4 border-blue-500/20">
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
            <Users className="h-5 w-5 text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Need an Enterprise plan?</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              Unlimited credits, unlimited team seats, SSO / SAML login, audit logs, and a dedicated SLA. Custom pricing for your volume.
            </p>
          </div>
          <a href="mailto:hello@dime-solutions.co.ke" className="flex-shrink-0">
            <Button size="sm" variant="outline" className="gap-1.5 border-blue-500/30 text-blue-400 hover:bg-blue-500/10">
              <Mail className="h-3.5 w-3.5" /> Contact Sales
            </Button>
          </a>
        </div>

        {/* Paystack trust badge */}
        <div className="glass-card p-5 mb-8 flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center flex-shrink-0">
            <Shield className="h-5 w-5 text-green-400" />
          </div>
          <div>
            <p className="text-sm font-semibold">Secure payments via Paystack</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Pay by card, M-Pesa, or bank transfer. Powered by Paystack — PCI DSS compliant and trusted
              by 100,000+ African businesses. Your card details never touch our servers.
            </p>
          </div>
        </div>

        {!user && (
          <div className="glass-card p-6 mb-8 flex items-center justify-between">
            <div>
              <p className="font-semibold">Not ready to pay?</p>
              <p className="text-sm text-muted-foreground mt-0.5">Sign up free — 100 credits on us, no card needed.</p>
            </div>
            <Link to="/register"><Button>Start Free</Button></Link>
          </div>
        )}

        {/* Features */}
        <div className="glass-card p-6">
          <p className="font-semibold mb-1">Everything included on all plans</p>
          <p className="text-xs text-muted-foreground mb-4">No feature gating. Every plan gets the full toolkit.</p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {FEATURES.map(f => (
              <div key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                <Check className="h-4 w-4 text-green-400 flex-shrink-0 mt-0.5" /> {f}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function loadPaystackScript(): Promise<void> {
  return new Promise((resolve) => {
    if (window.PaystackPop) { resolve(); return; }
    const existing = document.querySelector('script[src*="paystack"]');
    if (existing) { setTimeout(resolve, 500); return; }
    const script = document.createElement('script');
    script.src = 'https://js.paystack.co/v1/inline.js';
    script.onload = () => resolve();
    script.onerror = () => resolve(); // resolve anyway — error handled by PaystackPop check
    document.head.appendChild(script);
  });
}
