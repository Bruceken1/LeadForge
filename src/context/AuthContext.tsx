import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { api, setToken } from "@/lib/api";

interface User { id: string; email: string; name: string; role: string; avatar_url?: string; email_verified: number; }
interface Org  { id: string; name: string; plan: string; credits: number; }

interface AuthCtx {
  user: User | null;
  org: Org | null;
  accessToken: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginOtpRequest: (email: string) => Promise<void>;
  loginOtpVerify: (email: string, code: string) => Promise<void>;
  register: (name: string, email: string, password: string, orgName: string) => Promise<{ requiresVerification: boolean }>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  loginWithGoogle: (code: string) => Promise<void>;
  logout: () => void;
  refreshCredits: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]               = useState<User | null>(null);
  const [org, setOrg]                 = useState<Org | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    const rt = localStorage.getItem("le_refresh");
    if (!rt) { setLoading(false); return; }
    api.auth.refresh(rt)
      .then(async ({ accessToken: at }) => {
        setToken(at);
        setAccessToken(at);
        const { user: u, org: o } = await api.auth.me(at);
        setUser(u); setOrg(o);
      })
      .catch(() => { localStorage.removeItem("le_refresh"); setToken(null); })
      .finally(() => setLoading(false));
  }, []);

  const persist = async (at: string, rt: string) => {
    localStorage.setItem("le_refresh", rt);
    setToken(at);
    setAccessToken(at);
    const { user: u, org: o } = await api.auth.me(at);
    setUser(u); setOrg(o);
  };

  const login = async (email: string, password: string) => {
    const d = await api.auth.login(email, password);
    await persist(d.accessToken, d.refreshToken);
  };

  const loginOtpRequest = async (email: string) => {
    await api.auth.loginOtpRequest(email);
  };

  const loginOtpVerify = async (email: string, code: string) => {
    const d = await api.auth.loginOtpVerify(email, code);
    await persist(d.accessToken, d.refreshToken);
  };

  const register = async (name: string, email: string, password: string, orgName: string) => {
    const d = await api.auth.register(name, email, password, orgName);
    return { requiresVerification: d.requiresVerification ?? true };
  };

  const verifyEmail = async (email: string, code: string) => {
    const d = await api.auth.verifyEmail(email, code);
    await persist(d.accessToken, d.refreshToken);
  };

  const loginWithGoogle = async (code: string) => {
    const d = await api.auth.google(code);
    await persist(d.accessToken, d.refreshToken);
  };

  const logout = () => {
    const rt = localStorage.getItem("le_refresh");
    if (rt) api.auth.logout(rt).catch(() => {});
    localStorage.removeItem("le_refresh");
    setToken(null);
    setUser(null); setOrg(null); setAccessToken(null);
  };

  const refreshCredits = async () => {
    if (!accessToken) return;
    const { user: u, org: o } = await api.auth.me(accessToken);
    setUser(u); setOrg(o);
  };

  return (
    <AuthContext.Provider value={{ user, org, accessToken, loading, login, loginOtpRequest, loginOtpVerify, register, verifyEmail, loginWithGoogle, logout, refreshCredits }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
};
