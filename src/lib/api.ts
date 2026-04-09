// ── Worker API (Cloudflare) — auth, leads, payments, campaigns ───────────────
export const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8787";

// ── Agent API (FastAPI) — AI pipeline, ICP, autonomous dashboard ─────────────
export const AGENT_API_BASE = import.meta.env.VITE_AGENT_API_URL || "http://localhost:8000";

// Shared secret that guards FastAPI routes — sent as X-Agent-Key header
const AGENT_API_KEY = import.meta.env.VITE_AGENT_API_KEY || "";

let _token: string | null = null;
export const setToken = (t: string | null) => { _token = t; };

// ── Worker fetch helper (uses JWT Bearer) ─────────────────────────────────────
async function call<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const t = token ?? _token;
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

// ── Agent fetch helper (uses JWT Bearer + X-Agent-Key) ────────────────────────
// Every call to the FastAPI agent server must include:
//   Authorization: Bearer <user JWT>  — identifies the org/user
//   X-Agent-Key: <shared secret>      — guards the server from public access
export async function agentCall<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const t = token ?? _token;
  const res = await fetch(`${AGENT_API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
      ...(AGENT_API_KEY ? { "X-Agent-Key": AGENT_API_KEY } : {}),
      ...(options.headers || {}),
    },
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || data?.detail || `HTTP ${res.status}`);
  return data;
}

const post  = <T>(path: string, body: unknown, token?: string) =>
  call<T>(path, { method: "POST",  body: JSON.stringify(body) }, token);
const patch = <T>(path: string, body: unknown) =>
  call<T>(path, { method: "PATCH", body: JSON.stringify(body) });
const del   = <T>(path: string) =>
  call<T>(path, { method: "DELETE" });

export const api = {
  auth: {
    register:        (name: string, email: string, password: string, orgName: string) =>
      post<any>("/api/auth/register", { name, email, password, orgName }),
    verifyEmail:     (email: string, code: string) =>
      post<any>("/api/auth/verify-email", { email, code }),
    login:           (email: string, password: string) =>
      post<any>("/api/auth/login", { email, password }),
    loginOtpRequest: (email: string) =>
      post<any>("/api/auth/login-otp/request", { email }),
    loginOtpVerify:  (email: string, code: string) =>
      post<any>("/api/auth/login-otp/verify", { email, code }),
    google:          (code: string) =>
      post<any>("/api/auth/google", { code }),
    refresh:         (refreshToken: string) =>
      post<any>("/api/auth/refresh", { refreshToken }),
    logout:          (refreshToken: string) =>
      post<any>("/api/auth/logout", { refreshToken }),
    me:              (token: string) =>
      call<any>("/api/auth/me", {}, token),
  },
  org: {
    get:     () => call<any>("/api/org"),
    credits: () => call<any>("/api/org/credits"),
  },
  pricing:     () => call<any[]>("/api/pricing"),
  payments: {
    publicKey:  () => call<{ publicKey: string }>("/api/payments/public-key"),
    initialize: (package_id: number, email?: string) =>
      post<any>("/api/payments/initialize", { package_id, email }),
    verify:     (reference: string) =>
      call<any>(`/api/payments/verify?reference=${encodeURIComponent(reference)}`),
  },
  leads: {
    list: (search = "", status = "all", page = 1) =>
      call<{ leads: any[]; total: number; page: number; limit: number }>(
        `/api/leads?search=${encodeURIComponent(search)}&status=${status}&page=${page}`
      ),
    create:    (data: any) => post<any>("/api/leads", data),
    update:    (id: number, data: any) => patch<any>(`/api/leads/${id}`, data),
    delete:    (id: number) => del<void>(`/api/leads/${id}`),
    enrich:    (id: number) => post<any>(`/api/leads/${id}/enrich`, {}),
    exportCsv: async (search = "", status = "all"): Promise<Blob> => {
      const res = await fetch(
        `${API_BASE}/api/leads/export?search=${encodeURIComponent(search)}&status=${status}`,
        { headers: _token ? { Authorization: `Bearer ${_token}` } : {} }
      );
      if (!res.ok) throw new Error("Export failed");
      return res.blob();
    },
  },
  scrape:      (keyword: string, location: string, max = 20) =>
    post<any>("/api/scrape", { keyword, location, max }),
  campaigns: {
    list:           () => call<any[]>("/api/campaigns"),
    create:         (data: any) => post<any>("/api/campaigns", data),
    update:         (id: number, data: any) => patch<any>(`/api/campaigns/${id}`, data),
    launch:         (id: number) => post<any>(`/api/campaigns/${id}/launch`, {}),
    launchWhatsApp: (id: number) => post<any>(`/api/campaigns/${id}/launch-whatsapp`, {}),
  },
  templates: {
    list:   () => call<any[]>("/api/templates"),
    create: (data: any) => post<any>("/api/templates", data),
    delete: (id: number) => del<void>(`/api/templates/${id}`),
  },
  automation: {
    get:  () => call<any>("/api/automation"),
    save: (data: any) => post<any>("/api/automation", data),
  },
  stats:       () => call<any>("/api/stats"),
  weeklyStats: () => call<any[]>("/api/stats/weekly"),
  pipeline:    () => call<any[]>("/api/pipeline"),
  admin: {
    listOrgs:     () => call<any[]>("/api/admin/orgs"),
    grantCredits: (orgId: string, credits: number, reason?: string) =>
      post<any>("/api/admin/grant-credits", { orgId, credits, reason }),
  },
  recentLeads: () => call<any[]>("/api/recent-leads"),
};
