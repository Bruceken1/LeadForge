import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Loader2, CheckCircle, XCircle, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PaymentCallback() {
  const nav = useNavigate();
  const { refreshCredits } = useAuth();
  const [status, setStatus] = useState<"loading" | "success" | "failed">("loading");
  const [credits, setCredits] = useState(0);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const reference = new URLSearchParams(window.location.search).get("reference")
      || new URLSearchParams(window.location.search).get("trxref");

    if (!reference) {
      setStatus("failed");
      setMessage("No payment reference found.");
      return;
    }

    api.payments.verify(reference)
      .then(async (data) => {
        await refreshCredits();
        setCredits(data.added || 0);
        setStatus("success");
      })
      .catch((e: Error) => {
        setStatus("failed");
        setMessage(e.message || "Payment verification failed.");
      });
  }, []);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-10">
          <div className="w-9 h-9 rounded-xl gradient-gold flex items-center justify-center">
            <Zap className="h-4 w-4 text-[hsl(222,20%,7%)]" />
          </div>
          <p className="text-lg font-bold">Lead Engine</p>
        </div>

        <div className="glass-card p-10">
          {status === "loading" && (
            <>
              <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
              <h2 className="text-xl font-bold mb-2">Verifying payment…</h2>
              <p className="text-sm text-muted-foreground">Please wait while we confirm your payment with Paystack.</p>
            </>
          )}

          {status === "success" && (
            <>
              <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-5">
                <CheckCircle className="h-8 w-8 text-green-400" />
              </div>
              <h2 className="text-xl font-bold mb-2">Payment successful!</h2>
              <p className="text-muted-foreground mb-6">
                <span className="text-2xl font-black text-primary">{credits.toLocaleString()}</span>
                {" "}credits have been added to your account.
              </p>
              <Button className="w-full" onClick={() => nav("/")}>
                Go to Dashboard
              </Button>
              <p className="text-xs text-muted-foreground mt-4">
                Credits never expire. Use them anytime.
              </p>
            </>
          )}

          {status === "failed" && (
            <>
              <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-5">
                <XCircle className="h-8 w-8 text-destructive" />
              </div>
              <h2 className="text-xl font-bold mb-2">Payment not confirmed</h2>
              <p className="text-sm text-muted-foreground mb-6">
                {message || "We could not verify your payment. If money was deducted, please contact support — it will be resolved."}
              </p>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => nav("/pricing")}>
                  Try again
                </Button>
                <Button className="flex-1" onClick={() => nav("/")}>
                  Dashboard
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-4">
                If you were charged, email <a href="mailto:hello@dime-solutions.co.ke" className="text-primary">hello@dime-solutions.co.ke</a>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
