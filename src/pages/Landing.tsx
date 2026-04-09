import { Link } from "react-router-dom";
import {
  Zap, Search, Mail, Phone, Target, BarChart3,
  CheckCircle, ArrowRight, Star, Shield, Clock, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const FEATURES = [
  {
    icon: Search,
    title: "Google Maps Scraping",
    desc: "Find thousands of local businesses by keyword and location. Every lead includes name, phone, address, rating, and website.",
  },
  {
    icon: Mail,
    title: "AI Email Outreach",
    desc: "Gemini AI writes a personalised cold email for every lead referencing their city, industry, and rating. Sent via Resend with full bounce tracking.",
  },
  {
    icon: Phone,
    title: "WhatsApp Campaigns",
    desc: "Reach leads directly on WhatsApp using their scraped phone numbers. Works alongside email for maximum response rates.",
  },
  {
    icon: Target,
    title: "Advanced Lead Qualification",
    desc: "Automatic lead scoring based on business rating, review count, website quality, and enrichment confidence. Focus your time on the hottest leads.",
  },
  {
    icon: BarChart3,
    title: "CRM Pipeline",
    desc: "Track every lead from New → Contacted → Replied → Meeting → Closed. Move cards between stages with one click.",
  },
  {
    icon: Shield,
    title: "Deliverability Built-in",
    desc: "Rate limiting, suppression lists, one-click unsubscribe, and bounce handling keep your sender reputation clean.",
  },
  {
    icon: Users,
    title: "Team Collaboration",
    desc: "Invite teammates, assign roles (Admin / Member), and share leads and campaigns across your whole sales team — all in one workspace.",
  },
  {
    icon: Star,
    title: "Data Quality & Enrichment",
    desc: "Apollo.io + Hunter.io dual enrichment, automatic duplicate removal, email validation, and phone formatting so every record is clean before outreach.",
  },
];

const PLANS = [
  {
    name: "Starter",
    price: "$7",
    period: "/mo",
    credits: "500",
    perLead: "1.4¢",
    seats: "1 seat",
    features: ["500 scrape credits/mo", "AI email personalisation", "Email + WhatsApp outreach", "CRM pipeline", "CSV export", "Email enrichment"],
    cta: "Get Started",
    highlight: false,
  },
  {
    name: "Growth",
    price: "$22",
    period: "/mo",
    credits: "2,500",
    perLead: "0.88¢",
    seats: "Up to 3 seats",
    features: ["2,500 scrape credits/mo", "Everything in Starter", "Advanced lead scoring", "Team collaboration (3 seats)", "Campaign analytics", "Priority support"],
    cta: "Get Started",
    highlight: true,
  },
  {
    name: "Scale",
    price: "$55",
    period: "/mo",
    credits: "8,000",
    perLead: "0.69¢",
    seats: "Up to 10 seats",
    features: ["8,000 scrape credits/mo", "Everything in Growth", "Duplicate & bounce filtering", "Daily automation pipeline", "Webhook integrations", "Dedicated support"],
    cta: "Get Started",
    highlight: false,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    credits: "Unlimited",
    perLead: "Volume pricing",
    seats: "Unlimited seats",
    features: ["Unlimited credits", "Everything in Scale", "SSO / SAML login", "Audit logs", "SLA guarantee", "Onboarding call"],
    cta: "Contact Sales",
    highlight: false,
  },
];

const TESTIMONIALS = [
  {
    name: "Amara Okonkwo",
    role: "Founder, Digital Edge Agency",
    body: "We went from spending 3 hours manually finding leads to having 200 fresh contacts every morning. The WhatsApp campaign got us 18 replies in the first week.",
    stars: 5,
  },
  {
    name: "James Kiprotich",
    role: "Sales Director, Nairobi Tech Hub",
    body: "The AI emails don't sound like templates at all — they mention specific things about each business. Our reply rate jumped from 2% to 11%.",
    stars: 5,
  },
  {
    name: "Grace Wambui",
    role: "CEO, BrandForward Kenya",
    body: "Set it up on a Friday afternoon. By Monday we had scraped 400 restaurants in Mombasa and sent personalised emails to 80 of them. Three booked calls.",
    stars: 5,
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── NAV ─────────────────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg gradient-gold flex items-center justify-center">
              <Zap className="h-4 w-4 text-[hsl(222,20%,7%)]" />
            </div>
            <div>
              <p className="text-sm font-bold leading-none">Lead Engine</p>
              <p className="text-[10px] text-primary">by Dime Solutions</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#pricing"  className="hover:text-foreground transition-colors">Pricing</a>
            <a href="#testimonials" className="hover:text-foreground transition-colors">Reviews</a>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <Link to="/register">
              <Button size="sm" className="gap-1.5">
                Start free <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* ── HERO ────────────────────────────────────────────── */}
      <section className="pt-40 pb-24 px-6 text-center relative overflow-hidden">
        {/* Gold glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-primary/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-4 py-1.5 text-xs text-primary font-medium mb-6">
            <Zap className="h-3 w-3" /> 100 free scrape credits on signup — no card required
          </div>

          <h1 className="text-5xl md:text-6xl font-bold tracking-tight leading-[1.1] mb-6">
            Find leads.<br />
            <span className="text-primary">Close deals.</span><br />
            Automatically.
          </h1>

          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            Lead Engine scrapes Google Maps for local businesses, finds their email addresses,
            writes personalised outreach with AI, and sends via email and WhatsApp — all on autopilot.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/register">
              <Button size="lg" className="gap-2 px-8 text-base h-12">
                Start for free <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <a href="#features">
              <Button variant="outline" size="lg" className="px-8 text-base h-12">
                See how it works
              </Button>
            </a>
          </div>

          <div className="flex justify-center gap-8 mt-10 text-sm text-muted-foreground">
            {["No credit card", "100 free leads", "Setup in 5 min"].map(t => (
              <span key={t} className="flex items-center gap-1.5">
                <CheckCircle className="h-4 w-4 text-green-400" /> {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── STATS BAR ───────────────────────────────────────── */}
      <section className="border-y border-border/50 bg-card/40 py-10">
        <div className="max-w-4xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { value: "2,000+", label: "leads/month free" },
            { value: "1,500",  label: "AI emails/day free" },
            { value: "3,000",  label: "outreach emails/mo free" },
            { value: "< 5 min", label: "to first scrape" },
          ].map(({ value, label }) => (
            <div key={label}>
              <p className="text-3xl font-bold text-primary">{value}</p>
              <p className="text-sm text-muted-foreground mt-1">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ────────────────────────────────────────── */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Everything you need to fill your pipeline
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              From finding businesses to booking meetings — the entire outreach workflow in one tool.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="glass-card p-6 hover:border-primary/30 transition-all">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ────────────────────────────────────── */}
      <section className="py-24 px-6 border-y border-border/50 bg-card/20">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">How it works</h2>
            <p className="text-muted-foreground">Four steps from keyword to closed deal</p>
          </div>

          <div className="space-y-6">
            {[
              {
                step: "01",
                title: "Scrape businesses from Google Maps",
                desc: "Enter a keyword (e.g. \"restaurants\") and a location (e.g. \"Mombasa\"). Lead Engine finds up to 20 businesses per search including name, phone, website, address, and star rating.",
              },
              {
                step: "02",
                title: "Emails found automatically",
                desc: "For every business with a website, Apollo.io and Hunter.io search their domain for decision-maker email addresses. No manual research required.",
              },
              {
                step: "03",
                title: "AI writes a personal email for each lead",
                desc: "Gemini AI reads each lead's city, industry, and Google rating then writes a unique, human-sounding email. No templates, no mail-merge feel.",
              },
              {
                step: "04",
                title: "Email and WhatsApp outreach sent automatically",
                desc: "Emails go via Resend with bounce tracking. WhatsApp messages via Twilio. Rate-limited to protect your sender reputation. Replies land in your normal inbox.",
              },
            ].map(({ step, title, desc }) => (
              <div key={step} className="flex gap-6 glass-card p-6">
                <div className="text-4xl font-black text-primary/20 leading-none flex-shrink-0 w-12">
                  {step}
                </div>
                <div>
                  <h3 className="font-semibold mb-1.5">{title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ────────────────────────────────────── */}
      <section id="testimonials" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">What our users say</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TESTIMONIALS.map(({ name, role, body, stars }) => (
              <div key={name} className="glass-card p-6 flex flex-col">
                <div className="flex gap-0.5 mb-4">
                  {Array.from({ length: stars }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-primary text-primary" />
                  ))}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed flex-1">"{body}"</p>
                <div className="mt-5 pt-4 border-t border-border/50">
                  <p className="text-sm font-semibold">{name}</p>
                  <p className="text-xs text-muted-foreground">{role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── DATA QUALITY ────────────────────────────────────── */}
      <section className="py-24 px-6 border-y border-border/50 bg-card/20">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-full px-4 py-1.5 text-xs text-green-400 font-medium mb-5">
              <Shield className="h-3 w-3" /> Data Quality & Enrichment
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Clean data. Better conversations.</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Bad data kills campaigns. Lead Engine runs every record through multi-layer validation before any outreach is sent.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              {
                icon: Target,
                title: "AI Lead Scoring",
                desc: "Every lead is automatically scored 0–100 based on Google rating, review count, website presence, enrichment confidence, and industry match. Filter by score to work only your hottest prospects.",
                badge: "Advanced",
                color: "text-primary bg-primary/10",
              },
              {
                icon: Shield,
                title: "Dual Email Enrichment",
                desc: "Apollo.io searches company domains first. Hunter.io fills the gaps. Confidence scores tell you exactly how reliable each email is — low-confidence addresses are flagged before sending.",
                badge: "Accuracy",
                color: "text-blue-400 bg-blue-400/10",
              },
              {
                icon: CheckCircle,
                title: "Deduplication & Validation",
                desc: "Automatic phone number formatting, email syntax validation, and cross-campaign deduplication ensure you never contact the same business twice from different scrapes.",
                badge: "Clean data",
                color: "text-green-400 bg-green-400/10",
              },
              {
                icon: BarChart3,
                title: "Enrichment Analytics",
                desc: "See your enrichment hit rate, average lead score, and data quality metrics at a glance — so you can fine-tune your search parameters for maximum ROI.",
                badge: "Insights",
                color: "text-yellow-400 bg-yellow-400/10",
              },
            ].map(({ icon: Icon, title, desc, badge, color }) => (
              <div key={title} className="glass-card p-6 hover:border-primary/20 transition-all">
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2.5 mb-2">
                      <h3 className="font-semibold">{title}</h3>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${color}`}>{badge}</span>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TEAM COLLABORATION ──────────────────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-1.5 text-xs text-blue-400 font-medium mb-6">
                <Users className="h-3 w-3" /> Team & Enterprise
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-5 leading-tight">
                Built for teams,<br />not just solo sellers
              </h2>
              <p className="text-muted-foreground mb-8 leading-relaxed">
                From solo founders to full sales teams — Lead Engine scales with you. Collaborate on leads, share campaigns, and manage your whole pipeline together.
              </p>
              <div className="space-y-4">
                {[
                  { title: "Shared workspace", desc: "All leads, campaigns, and templates visible to your whole team" },
                  { title: "Role-based access", desc: "Owner, Admin, and Member roles with granular permissions" },
                  { title: "Enterprise SSO", desc: "SAML / SSO login for companies on the Enterprise plan" },
                  { title: "Audit logs", desc: "Track every action across your workspace for compliance" },
                ].map(({ title, desc }) => (
                  <div key={title} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-blue-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <CheckCircle className="h-3 w-3 text-blue-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Visual team card */}
            <div className="glass-card p-6 space-y-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold">Workspace · Dime Solutions</p>
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">Growth Plan</span>
              </div>
              {[
                { name: "Grace Wambui", role: "Owner", avatar: "GW", color: "bg-primary/20 text-primary", active: true },
                { name: "James Kiprotich", role: "Admin", avatar: "JK", color: "bg-blue-500/20 text-blue-400", active: true },
                { name: "Amara Okonkwo", role: "Member", avatar: "AO", color: "bg-muted text-foreground", active: false },
              ].map(({ name, role, avatar, color, active }) => (
                <div key={name} className="flex items-center gap-3 py-2 border-b border-border/40 last:border-0">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${color}`}>{avatar}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{name}</p>
                    <p className="text-xs text-muted-foreground">{role}</p>
                  </div>
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${active ? "bg-green-400" : "bg-muted-foreground/40"}`} />
                </div>
              ))}
              <div className="pt-2">
                <div className="flex items-center gap-3 p-3 border border-dashed border-border rounded-lg text-muted-foreground text-sm">
                  <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0">+</div>
                  <span>Invite a teammate…</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── PRICING ─────────────────────────────────────────── */}
      <section id="pricing" className="py-24 px-6 border-t border-border/50 bg-card/20">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-6">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Simple credit-based pricing</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Buy credits, use them when you need them. 1 credit = 1 business scraped.
              Credits never expire. Full features on every plan.
            </p>
          </div>

          {/* Free tier callout */}
          <div className="glass-card p-4 border-primary/20 bg-primary/5 text-center mb-10">
            <p className="text-sm">
              <span className="text-primary font-semibold">Start completely free</span>
              {" "}— 100 credits on signup, no card required. Enough to scrape 100 businesses and send outreach today.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {PLANS.map((plan) => (
              <div key={plan.name}
                className={`glass-card p-6 flex flex-col relative ${plan.highlight ? "border-primary/50 ring-1 ring-primary/30 scale-[1.02]" : ""}`}>
                {plan.highlight && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="gradient-gold text-[hsl(222,20%,7%)] text-xs font-bold px-4 py-1 rounded-full">
                      Most Popular
                    </span>
                  </div>
                )}
                <div className="mb-5">
                  <p className="font-bold text-base">{plan.name}</p>
                  <div className="flex items-end gap-0.5 mt-2">
                    <p className="text-3xl font-black">{plan.price}</p>
                    {plan.period && <p className="text-sm text-muted-foreground mb-1">{plan.period}</p>}
                  </div>
                  <p className="text-sm text-primary font-medium mt-1">{plan.credits} credits</p>
                  <p className="text-xs text-muted-foreground">{plan.perLead} per lead</p>
                  <div className="flex items-center gap-1.5 mt-2">
                    <Users className="h-3 w-3 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">{plan.seats}</p>
                  </div>
                </div>
                <ul className="space-y-2.5 flex-1 mb-6">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <CheckCircle className="h-4 w-4 text-green-400 flex-shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link to={plan.name === "Enterprise" ? "mailto:hello@dime-solutions.co.ke" : "/register"}>
                  <Button className="w-full" variant={plan.highlight ? "default" : "outline"}>
                    {plan.cta}
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────── */}
      <section className="py-24 px-6 text-center border-t border-border/50">
        <div className="max-w-2xl mx-auto">
          <div className="w-14 h-14 rounded-2xl gradient-gold flex items-center justify-center mx-auto mb-6">
            <Zap className="h-7 w-7 text-[hsl(222,20%,7%)]" />
          </div>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Start finding leads today
          </h2>
          <p className="text-muted-foreground mb-8">
            100 free credits. No credit card. Your first 100 businesses scraped and ready for outreach in under 5 minutes.
          </p>
          <Link to="/register">
            <Button size="lg" className="gap-2 px-10 text-base h-12">
              Create free account <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-border/50 bg-card/30 py-12 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-10">
          {/* Brand */}
          <div className="md:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-7 h-7 rounded-lg gradient-gold flex items-center justify-center">
                <Zap className="h-3.5 w-3.5 text-[hsl(222,20%,7%)]" />
              </div>
              <div>
                <p className="text-sm font-bold leading-none">Lead Engine</p>
                <p className="text-[10px] text-primary">by Dime Solutions</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              B2B lead generation and outreach automation for modern sales teams.
            </p>
          </div>

          {/* Product */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Product</p>
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              <li><a href="#features" className="hover:text-foreground transition-colors">Features</a></li>
              <li><a href="#pricing"  className="hover:text-foreground transition-colors">Pricing</a></li>
              <li><Link to="/register" className="hover:text-foreground transition-colors">Get started free</Link></li>
              <li><Link to="/login"    className="hover:text-foreground transition-colors">Sign in</Link></li>
            </ul>
          </div>

          {/* Tools */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Powered by</p>
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              <li>SerpApi — Google Maps</li>
              <li>Apollo.io — Email enrichment</li>
              <li>Gemini AI — Personalisation</li>
              <li>Resend — Email delivery</li>
              <li>Twilio — WhatsApp</li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Company</p>
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              <li>
                <a href="https://dime-solutions.co.ke" target="_blank" rel="noopener noreferrer"
                  className="hover:text-foreground transition-colors">
                  Dime Solutions
                </a>
              </li>
              <li><a href="mailto:hello@dime-solutions.co.ke" className="hover:text-foreground transition-colors">Contact us</a></li>
              <li><span className="text-xs">Nairobi, Kenya 🇰🇪</span></li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-border/50 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Dime Solutions. All rights reserved.
          </p>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            Built for East African businesses
          </div>
        </div>
      </div>
    </footer>
  );
}
