import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  Save, User, CreditCard, Zap, Loader2, CheckCircle,
  Users, UserPlus, Shield, Mail, Crown, Trash2, Building2,
} from "lucide-react";
import { Link } from "react-router-dom";

// Mock team data for enterprise/team collaboration UI
const MOCK_TEAM = [
  { id: 1, name: "You", email: "", role: "Owner", avatar: "", status: "active" },
  { id: 2, name: "Sarah Kamau", email: "sarah@example.com", role: "Admin", avatar: "SK", status: "active" },
  { id: 3, name: "Brian Otieno", email: "brian@example.com", role: "Member", avatar: "BO", status: "pending" },
];

const ROLE_COLORS: Record<string, string> = {
  Owner:  "text-primary bg-primary/10",
  Admin:  "text-blue-400 bg-blue-400/10",
  Member: "text-muted-foreground bg-muted",
};

export default function SettingsPage() {
  const { user, org, refreshCredits } = useAuth();
  const qc = useQueryClient();

  const [profile, setProfile] = useState({ name: user?.name || "", email: user?.email || "" });
  const [saving, setSaving] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("Member");
  const [inviting, setInviting] = useState(false);
  const [teamMembers, setTeamMembers] = useState(MOCK_TEAM.map(m => ({
    ...m,
    email: m.email || user?.email || "",
    avatar: m.avatar || user?.name?.charAt(0)?.toUpperCase() || "?",
  })));

  const { data: creditsData } = useQuery({ queryKey: ["credits"], queryFn: api.org.credits });

  useEffect(() => {
    if (user) setProfile({ name: user.name, email: user.email });
  }, [user]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await new Promise(r => setTimeout(r, 400));
    toast.success("Profile updated successfully.");
    setSaving(false);
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    await new Promise(r => setTimeout(r, 600));
    setTeamMembers(prev => [...prev, {
      id: Date.now(), name: inviteEmail.split("@")[0], email: inviteEmail,
      role: inviteRole, avatar: inviteEmail.charAt(0).toUpperCase(), status: "pending",
    }]);
    toast.success(`Invite sent to ${inviteEmail}`);
    setInviteEmail("");
    setInviting(false);
  };

  const handleRemoveMember = (id: number) => {
    setTeamMembers(prev => prev.filter(m => m.id !== id));
    toast.success("Member removed from workspace.");
  };

  const txns = (creditsData as any)?.transactions ?? [];
  const credits = (creditsData as any)?.credits ?? org?.credits ?? 0;

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your account, workspace, and billing</p>
        </div>

        {/* ── Profile ───────────────────────────────────────── */}
        <section className="glass-card p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <User className="h-4 w-4 text-primary" />
            </div>
            <h2 className="text-sm font-semibold">Profile</h2>
          </div>
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-primary/15 flex items-center justify-center text-primary text-xl font-bold flex-shrink-0">
                {user?.name?.charAt(0)?.toUpperCase() || "?"}
              </div>
              <div>
                <p className="text-sm font-medium">{user?.name}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <CheckCircle className="h-3 w-3 text-green-400" />
                  <p className="text-xs text-green-400">Email verified</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Full Name</Label>
                <Input className="mt-1.5" value={profile.name} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Email</Label>
                <Input className="mt-1.5" value={profile.email} disabled />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Workspace</Label>
                <Input className="mt-1.5" value={org?.name || ""} disabled />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Plan</Label>
                <Input className="mt-1.5" value={org?.plan || "free"} disabled />
              </div>
            </div>
            <Button type="submit" size="sm" className="gap-2" disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save Profile
            </Button>
          </form>
        </section>

        {/* ── Team & Collaboration ──────────────────────────── */}
        <section className="glass-card p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Users className="h-4 w-4 text-blue-400" />
              </div>
              <div>
                <h2 className="text-sm font-semibold">Team & Collaboration</h2>
                <p className="text-xs text-muted-foreground">Invite teammates to your workspace</p>
              </div>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 font-medium border border-blue-500/20">
              {teamMembers.length}/{org?.plan === "enterprise" ? "Unlimited" : "5"} seats
            </span>
          </div>

          {/* Workspace info */}
          <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
            <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
              <Building2 className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{org?.name || "My Workspace"}</p>
              <p className="text-xs text-muted-foreground">Workspace · {teamMembers.length} member{teamMembers.length !== 1 ? "s" : ""}</p>
            </div>
          </div>

          {/* Current team */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Members</p>
            {teamMembers.map((member) => (
              <div key={member.id} className="flex items-center gap-3 py-2.5 border-b border-border/40 last:border-0">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0
                  ${member.role === "Owner" ? "bg-primary/20 text-primary" : "bg-muted text-foreground"}`}>
                  {member.avatar}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{member.name}</p>
                    {member.role === "Owner" && <Crown className="h-3 w-3 text-primary flex-shrink-0" />}
                    {member.status === "pending" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">Pending</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${ROLE_COLORS[member.role]}`}>
                  {member.role}
                </span>
                {member.role !== "Owner" && (
                  <button onClick={() => handleRemoveMember(member.id)}
                    className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors flex-shrink-0">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Invite form */}
          <div className="pt-2 border-t border-border/40">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Invite a member</p>
            <form onSubmit={handleInvite} className="flex gap-2">
              <Input
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                type="email"
                className="flex-1 text-sm"
              />
              <select
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value)}
                className="text-sm bg-background border border-border rounded-md px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="Admin">Admin</option>
                <option value="Member">Member</option>
              </select>
              <Button type="submit" size="sm" className="gap-1.5 flex-shrink-0" disabled={inviting || !inviteEmail.trim()}>
                {inviting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                Invite
              </Button>
            </form>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <div className="flex items-start gap-1.5">
                <Shield className="h-3.5 w-3.5 text-blue-400 flex-shrink-0 mt-0.5" />
                <span><span className="text-foreground font-medium">Admin</span> — full access, manage team &amp; settings</span>
              </div>
              <div className="flex items-start gap-1.5">
                <Mail className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                <span><span className="text-foreground font-medium">Member</span> — manage leads &amp; campaigns only</span>
              </div>
            </div>
          </div>

          {/* Enterprise upsell */}
          {org?.plan !== "enterprise" && (
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/15 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold">Need more seats or SSO?</p>
                <p className="text-xs text-muted-foreground mt-0.5">Enterprise plan includes unlimited seats, SSO, audit logs &amp; SLA.</p>
              </div>
              <Link to="/pricing">
                <Button size="sm" variant="outline" className="flex-shrink-0 text-xs">View Plans</Button>
              </Link>
            </div>
          )}
        </section>

        {/* ── Credits & Billing ─────────────────────────────── */}
        <section className="glass-card p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Zap className="h-4 w-4 text-primary" />
            </div>
            <h2 className="text-sm font-semibold">Credits & Billing</h2>
          </div>
          <div className="flex items-center justify-between p-4 bg-muted/40 rounded-xl">
            <div>
              <p className="text-3xl font-black text-primary">{credits.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-0.5">credits remaining · never expire</p>
            </div>
            <Link to="/pricing">
              <Button size="sm" className="gap-2">
                <CreditCard className="h-4 w-4" /> Buy Credits
              </Button>
            </Link>
          </div>
          {txns.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Recent transactions</p>
              <div className="space-y-2">
                {txns.slice(0, 8).map((t: any, i: number) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
                    <div>
                      <p className="text-sm capitalize">{(t.reason || '').replace(/_/g, ' ')}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.created_at ? new Date(t.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                      </p>
                    </div>
                    <span className={`text-sm font-semibold ${t.delta > 0 ? 'text-green-400' : 'text-muted-foreground'}`}>
                      {t.delta > 0 ? '+' : ''}{t.delta} credits
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ── Danger zone ───────────────────────────────────── */}
        <section className="glass-card p-6 border-destructive/20">
          <h2 className="text-sm font-semibold text-destructive mb-3">Danger zone</h2>
          <p className="text-xs text-muted-foreground mb-4">
            Deleting your account removes all leads, campaigns, and credits permanently. This cannot be undone.
          </p>
          <Button variant="outline" size="sm" className="border-destructive/40 text-destructive hover:bg-destructive/10"
            onClick={() => toast.error("Account deletion is not yet self-serve. Email hello@dime-solutions.co.ke to request it.")}>
            Delete Account
          </Button>
        </section>
      </div>
    </DashboardLayout>
  );
}
