import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Zap, Loader2, CheckCircle, Mail } from "lucide-react";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

export default function Register() {
  const { register, verifyEmail } = useAuth();
  const nav = useNavigate();

  // Step: 'form' | 'verify'
  const [step, setStep]     = useState<'form' | 'verify'>('form');
  const [loading, setLoading] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [form, setForm] = useState({ name: "", email: "", password: "", orgName: "" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    setLoading(true);
    try {
      await register(form.name, form.email, form.password, form.orgName);
      setPendingEmail(form.email);
      setStep('verify');
      toast.success("Account created! Check your email for a 6-digit code.");
    } catch (err: any) {
      toast.error(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpCode.length !== 6) { toast.error("Enter the 6-digit code from your email"); return; }
    setLoading(true);
    try {
      await verifyEmail(pendingEmail, otpCode);
      toast.success("Email verified! Welcome to Lead Engine.");
      nav("/home");
    } catch (err: any) {
      toast.error(err.message || "Invalid code");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = () => {
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: `${window.location.origin}/auth/callback`,
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      prompt: "consent",
    });
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  };

  // ── OTP verification step ──────────────────────────────────
  if (step === 'verify') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl gradient-gold flex items-center justify-center">
              <Zap className="h-5 w-5 text-[hsl(222,20%,7%)]" />
            </div>
            <p className="text-lg font-bold">Lead Engine</p>
          </div>

          <div className="glass-card p-8">
            <div className="flex justify-center mb-4">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                <Mail className="h-7 w-7 text-primary" />
              </div>
            </div>
            <h1 className="text-xl font-bold text-center mb-1">Check your email</h1>
            <p className="text-sm text-muted-foreground text-center mb-6">
              We sent a 6-digit code to <span className="text-foreground font-medium">{pendingEmail}</span>
            </p>

            <form onSubmit={handleVerify} className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground">Verification code</Label>
                <Input
                  className="mt-1.5 text-2xl tracking-[0.5em] text-center font-mono"
                  value={otpCode}
                  onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  maxLength={6}
                  inputMode="numeric"
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading || otpCode.length !== 6}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Verify & Get Started
              </Button>
            </form>

            <p className="text-xs text-muted-foreground text-center mt-4">
              Didn't get it? Check your spam folder, or{" "}
              <button className="text-primary hover:underline" onClick={() => setStep('form')}>
                go back
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Registration form step ─────────────────────────────────
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl gradient-gold flex items-center justify-center">
            <Zap className="h-5 w-5 text-[hsl(222,20%,7%)]" />
          </div>
          <div>
            <p className="text-lg font-bold leading-none">Lead Engine</p>
            <p className="text-xs text-primary">by Dime Solutions</p>
          </div>
        </div>

        <div className="flex justify-center gap-6 mb-6">
          {["100 free credits", "No card needed", "Cancel anytime"].map(v => (
            <div key={v} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle className="h-3.5 w-3.5 text-green-400" /> {v}
            </div>
          ))}
        </div>

        <div className="glass-card p-8">
          <h1 className="text-xl font-bold mb-1">Create your workspace</h1>
          <p className="text-sm text-muted-foreground mb-6">Start finding and closing leads today</p>

          <Button variant="outline" className="w-full gap-3 mb-4" onClick={handleGoogle}>
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </Button>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
            <div className="relative flex justify-center"><span className="bg-card px-3 text-xs text-muted-foreground">or</span></div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Your Name</Label>
                <Input className="mt-1.5" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Jane Doe" required />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Company / Workspace</Label>
                <Input className="mt-1.5" value={form.orgName}
                  onChange={e => setForm(f => ({ ...f, orgName: e.target.value }))} placeholder="Acme Agency" required />
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Work Email</Label>
              <Input type="email" className="mt-1.5" value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="jane@acme.com" required />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Password</Label>
              <Input type="password" className="mt-1.5" value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder="At least 8 characters" required />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create Free Account
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              By signing up you agree to our Terms of Service
            </p>
          </form>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-4">
          Already have an account?{" "}
          <Link to="/login" className="text-primary hover:underline font-medium">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
