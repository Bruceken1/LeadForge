import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Zap, Loader2, Mail, KeyRound } from "lucide-react";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

type Mode = 'password' | 'otp_request' | 'otp_verify';

export default function Login() {
  const { login, loginOtpRequest, loginOtpVerify } = useAuth();
  const nav = useNavigate();

  const [mode, setMode]       = useState<Mode>('password');
  const [loading, setLoading] = useState(false);
  const [email, setEmail]     = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      nav("/home");
    } catch (err: any) {
      toast.error(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleOtpRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { toast.error("Enter your email"); return; }
    setLoading(true);
    try {
      await loginOtpRequest(email);
      setMode('otp_verify');
      toast.success("Login code sent — check your email");
    } catch (err: any) {
      toast.error(err.message || "Failed to send code");
    } finally {
      setLoading(false);
    }
  };

  const handleOtpVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpCode.length !== 6) { toast.error("Enter the 6-digit code"); return; }
    setLoading(true);
    try {
      await loginOtpVerify(email, otpCode);
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

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <a href="/home" className="flex items-center justify-center gap-3 mb-8 hover:opacity-80 transition-opacity">
          <div className="w-10 h-10 rounded-xl gradient-gold flex items-center justify-center">
            <Zap className="h-5 w-5 text-[hsl(222,20%,7%)]" />
          </div>
          <div>
            <p className="text-lg font-bold leading-none">Lead Engine</p>
            <p className="text-xs text-primary">by Dime Solutions</p>
          </div>
        </a>

        <div className="glass-card p-8">
          <h1 className="text-xl font-bold mb-1">Welcome back</h1>
          <p className="text-sm text-muted-foreground mb-6">Sign in to your workspace</p>

          {/* Google */}
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

          {/* Mode toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden mb-5">
            <button onClick={() => setMode('password')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-medium transition-colors
                ${mode === 'password' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              <KeyRound className="h-3.5 w-3.5" /> Password
            </button>
            <button onClick={() => setMode(mode === 'otp_verify' ? 'otp_verify' : 'otp_request')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-medium transition-colors
                ${mode !== 'password' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              <Mail className="h-3.5 w-3.5" /> Email code
            </button>
          </div>

          {/* Password login */}
          {mode === 'password' && (
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground">Email</Label>
                <Input type="email" className="mt-1.5" value={email}
                  onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Password</Label>
                <Input type="password" className="mt-1.5" value={password}
                  onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Sign In
              </Button>
            </form>
          )}

          {/* OTP request */}
          {mode === 'otp_request' && (
            <form onSubmit={handleOtpRequest} className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground">Email</Label>
                <Input type="email" className="mt-1.5" value={email}
                  onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Send Login Code
              </Button>
            </form>
          )}

          {/* OTP verify */}
          {mode === 'otp_verify' && (
            <form onSubmit={handleOtpVerify} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Code sent to <span className="text-foreground font-medium">{email}</span>
              </p>
              <div>
                <Label className="text-xs text-muted-foreground">6-digit code</Label>
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
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Sign In
              </Button>
              <button type="button" className="w-full text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setMode('otp_request')}>
                ← Send a new code
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-sm text-muted-foreground mt-4">
          Don't have an account?{" "}
          <Link to="/register" className="text-primary hover:underline font-medium">Start free →</Link>
        </p>
      </div>
    </div>
  );
}
