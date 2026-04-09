import { ReactNode, useState } from "react";
import { Home, Users, BarChart3, Target, Settings, FileText, Zap, ChevronLeft, ChevronRight, LogOut, CreditCard } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

const navItems = [
  { icon: Home,      label: "Overview",   href: "/" },
  { icon: Users,     label: "Leads",      href: "/leads" },
  { icon: BarChart3, label: "Campaigns",  href: "/campaigns" },
  { icon: FileText,  label: "Templates",  href: "/templates" },
  { icon: Target,    label: "Pipeline",   href: "/pipeline" },
  { icon: Zap,       label: "Automation", href: "/automation" },
  { icon: Settings,  label: "Settings",   href: "/settings" },
];

export function DashboardLayout({ children }: { children: ReactNode }) {
  const location    = useLocation();
  const navigate    = useNavigate();
  const { user, org, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = () => { logout(); navigate("/login"); };

  const creditPct   = Math.min(100, ((org?.credits ?? 0) / 100) * 100);
  const creditColor = (org?.credits ?? 0) < 10 ? "bg-red-500" : (org?.credits ?? 0) < 30 ? "bg-yellow-500" : "bg-primary";

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <div className={`flex flex-col border-r border-border transition-all duration-300 ${collapsed ? "w-[68px]" : "w-64"}`}
        style={{ backgroundColor: "hsl(var(--sidebar-background))" }}>

        {/* Logo */}
        <div className={`flex items-center border-b border-border h-16 px-4 ${collapsed ? "justify-center" : "justify-between"}`}>
          {!collapsed && (
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
          {collapsed && <div className="w-8 h-8 rounded-lg gradient-gold flex items-center justify-center"><Zap className="h-4 w-4 text-[hsl(222,20%,7%)]" /></div>}
          {!collapsed && (
            <button onClick={() => setCollapsed(true)} className="p-1 rounded-md hover:bg-muted text-muted-foreground">
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {navItems.map(({ icon: Icon, label, href }) => {
            const active = href === "/" ? location.pathname === "/" : location.pathname.startsWith(href);
            return (
              <Link key={href} to={href} title={collapsed ? label : undefined}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all
                  ${active ? "bg-primary/15 text-primary border-l-2 border-primary pl-[10px]" : "text-muted-foreground hover:bg-muted hover:text-foreground"}
                  ${collapsed ? "justify-center" : ""}`}>
                <Icon className="h-4 w-4 flex-shrink-0" />
                {!collapsed && <span>{label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Credits bar */}
        {!collapsed && (
          <div className="px-4 pb-2">
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-muted-foreground">Credits remaining</span>
                <span className="text-xs font-bold text-foreground">{(org?.credits ?? 0).toLocaleString()}</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${creditColor}`} style={{ width: `${creditPct}%` }} />
              </div>
              <Link to="/pricing" className="flex items-center gap-1.5 mt-2 text-xs text-primary hover:underline">
                <CreditCard className="h-3 w-3" /> Buy more credits
              </Link>
            </div>
          </div>
        )}

        {/* User + logout */}
        <div className={`p-3 border-t border-border ${collapsed ? "flex justify-center" : ""}`}>
          {collapsed ? (
            <button onClick={handleLogout} className="p-2 rounded-md hover:bg-muted text-muted-foreground" title="Sign out">
              <LogOut className="h-4 w-4" />
            </button>
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
          {collapsed && (
            <button onClick={() => setCollapsed(false)} className="p-2 rounded-md hover:bg-muted text-muted-foreground mt-2">
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-auto bg-background">{children}</div>
    </div>
  );
}
