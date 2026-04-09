import { ReactNode, useState, useEffect, useRef } from "react";
import { Footer } from "@/pages/Landing";
import { Home, Users, BarChart3, Target, Settings, FileText, Zap, ChevronLeft, ChevronRight, LogOut, CreditCard, ContactRound, Menu, X, Search, ArrowRight, Bot, Brain } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

const navItems = [
  { icon: Home,         label: "Overview",   href: "/home" },
  { icon: Users,        label: "Leads",      href: "/leads" },
  { icon: ContactRound, label: "CRM",        href: "/crm" },
  { icon: BarChart3,    label: "Campaigns",  href: "/campaigns" },
  { icon: FileText,     label: "Templates",  href: "/templates" },
  { icon: Target,       label: "Pipeline",   href: "/pipeline" },
  { icon: Zap,          label: "Automation", href: "/automation" },
  { icon: Bot,          label: "AI Agent",    href: "/agent" },
  { icon: Brain,        label: "Autonomous",  href: "/autonomous" },
  { icon: Settings,     label: "Settings",    href: "/settings" },
];

// ── ⌘K Quick Launch Modal ─────────────────────────────────────
function QuickLaunch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) { setQuery(""); setTimeout(() => inputRef.current?.focus(), 50); } }, [open]);

  const filtered = query
    ? navItems.filter(n => n.label.toLowerCase().includes(query.toLowerCase()))
    : navItems;

  const go = (href: string) => { navigate(href); onClose(); };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-24 px-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background border border-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Go to…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            onKeyDown={e => {
              if (e.key === "Escape") onClose();
              if (e.key === "Enter" && filtered.length > 0) go(filtered[0].href);
            }}
          />
          <kbd className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border">ESC</kbd>
        </div>
        <div className="p-2 max-h-64 overflow-y-auto">
          {filtered.map(({ icon: Icon, label, href }) => (
            <button key={href} onClick={() => go(href)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm hover:bg-muted transition-colors text-left group">
              <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Icon className="h-3.5 w-3.5 text-primary" />
              </div>
              <span className="flex-1">{label}</span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No pages match "{query}"</p>
          )}
        </div>
        <div className="px-4 py-2 border-t border-border flex items-center gap-4 text-xs text-muted-foreground">
          <span><kbd className="bg-muted px-1.5 py-0.5 rounded border border-border">↵</kbd> to open</span>
          <span><kbd className="bg-muted px-1.5 py-0.5 rounded border border-border">ESC</kbd> to close</span>
        </div>
      </div>
    </div>
  );
}

export function DashboardLayout({ children }: { children: ReactNode }) {
  const location    = useLocation();
  const navigate    = useNavigate();
  const { user, org, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [quickOpen, setQuickOpen]   = useState(false);

  const handleLogout = () => { logout(); navigate("/login"); };

  const creditPct   = Math.min(100, ((org?.credits ?? 0) / 100) * 100);
  const creditColor = (org?.credits ?? 0) < 10 ? "bg-red-500" : (org?.credits ?? 0) < 30 ? "bg-yellow-500" : "bg-primary";

  // ⌘K / Ctrl+K listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setQuickOpen(v => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Close mobile nav on route change
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const SidebarContent = ({ isMobile = false }: { isMobile?: boolean }) => (
    <>
      {/* Logo */}
      <div className={`flex items-center border-b border-border h-16 px-4 ${!isMobile && collapsed ? "justify-center" : "justify-between"}`}>
        {(isMobile || !collapsed) && (
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg gradient-gold flex items-center justify-center flex-shrink-0">
              <Zap className="h-4 w-4 text-[hsl(222,20%,7%)]" />
            </div>
            <div>
              <p className="text-sm font-bold leading-none">Lead Engine</p>
              <p className="text-[10px] text-primary mt-0.5 truncate max-w-[120px]">{org?.name || "…"}</p>
            </div>
          </div>
        )}
        {!isMobile && collapsed && (
          <div className="w-8 h-8 rounded-lg gradient-gold flex items-center justify-center">
            <Zap className="h-4 w-4 text-[hsl(222,20%,7%)]" />
          </div>
        )}
        {!isMobile && !collapsed && (
          <button onClick={() => setCollapsed(true)} className="p-1 rounded-md hover:bg-muted text-muted-foreground">
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        {isMobile && (
          <button onClick={() => setMobileOpen(false)} className="p-1 rounded-md hover:bg-muted text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* ⌘K button */}
      {(isMobile || !collapsed) && (
        <div className="px-3 pt-3">
          <button onClick={() => setQuickOpen(true)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 hover:bg-muted text-muted-foreground text-xs transition-colors">
            <Search className="h-3.5 w-3.5" />
            <span className="flex-1 text-left">Quick navigate…</span>
            <kbd className="bg-background px-1.5 py-0.5 rounded border border-border text-[10px]">⌘K</kbd>
          </button>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto mt-1">
        {navItems.map(({ icon: Icon, label, href }) => {
          const active = href === "/" ? location.pathname === "/" : location.pathname.startsWith(href);
          return (
            <Link key={href} to={href} title={!isMobile && collapsed ? label : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all
                ${active ? "bg-primary/15 text-primary border-l-2 border-primary pl-[10px]" : "text-muted-foreground hover:bg-muted hover:text-foreground"}
                ${!isMobile && collapsed ? "justify-center" : ""}`}>
              <Icon className="h-4 w-4 flex-shrink-0" />
              {(isMobile || !collapsed) && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Credits bar */}
      {(isMobile || !collapsed) && (
        <div className="px-4 pb-2">
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-muted-foreground">Credits remaining</span>
              <span className="text-xs font-bold text-foreground">{(org?.credits ?? 0).toLocaleString()}</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${creditColor}`} style={{ width: `${creditPct}%` }} />
            </div>
            <Link to="/pricing" className="flex items-center gap-1.5 mt-2 text-xs text-primary hover:underline font-medium">
              <CreditCard className="h-3 w-3" /> Buy more credits
            </Link>
          </div>
        </div>
      )}

      {/* User + logout */}
      <div className={`p-3 border-t border-border ${!isMobile && collapsed ? "flex flex-col items-center gap-2" : ""}`}>
        {!isMobile && collapsed ? (
          <>
            <button onClick={handleLogout} className="p-2 rounded-md hover:bg-muted text-muted-foreground" title="Sign out">
              <LogOut className="h-4 w-4" />
            </button>
            <button onClick={() => setCollapsed(false)} className="p-2 rounded-md hover:bg-muted text-muted-foreground">
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold flex-shrink-0">
              {user?.name?.charAt(0)?.toUpperCase() || "?"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{user?.name}</p>
              <p className="text-[10px] text-muted-foreground truncate">{user?.email}</p>
            </div>
            <button onClick={handleLogout} className="p-1.5 rounded hover:bg-muted text-muted-foreground" title="Sign out">
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Desktop Sidebar */}
      <div className={`hidden md:flex flex-col border-r border-border transition-all duration-300 ${collapsed ? "w-[68px]" : "w-64"}`}
        style={{ backgroundColor: "hsl(var(--sidebar-background))" }}>
        <SidebarContent />
      </div>

      {/* Mobile sidebar drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-72 flex flex-col border-r border-border shadow-2xl"
            style={{ backgroundColor: "hsl(var(--sidebar-background))" }}>
            <SidebarContent isMobile />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 overflow-auto bg-background flex flex-col min-w-0">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-3 px-4 h-14 border-b border-border flex-shrink-0"
          style={{ backgroundColor: "hsl(var(--sidebar-background))" }}>
          <button onClick={() => setMobileOpen(true)} className="p-2 rounded-md hover:bg-muted text-muted-foreground">
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded gradient-gold flex items-center justify-center">
              <Zap className="h-3.5 w-3.5 text-[hsl(222,20%,7%)]" />
            </div>
            <span className="text-sm font-bold">Lead Engine</span>
          </div>
          <button onClick={() => setQuickOpen(true)} className="ml-auto p-2 rounded-md hover:bg-muted text-muted-foreground">
            <Search className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1">{children}</div>
        <Footer />
      </div>

      {/* ⌘K Quick Launch */}
      <QuickLaunch open={quickOpen} onClose={() => setQuickOpen(false)} />
    </div>
  );
}

