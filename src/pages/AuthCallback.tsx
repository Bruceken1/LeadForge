import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function AuthCallback() {
  const { loginWithGoogle } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");
    if (!code) { toast.error("OAuth failed — no code received"); nav("/login"); return; }
    loginWithGoogle(code)
      .then(() => { toast.success("Signed in with Google!"); nav("/home"); })
      .catch((e: any) => { toast.error(e.message || "Google sign-in failed"); nav("/login"); });
  }, []);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Completing sign in…</p>
      </div>
    </div>
  );
}
