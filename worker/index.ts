/**
 * Lead Engine SaaS — Cloudflare Worker (fixed)
 *
 * Fixes in this version:
 *  1. CORS — getCorsHeaders() defined and attached to EVERY response
 *  2. ok() / fail() helpers defined before use
 *  3. Email OTP verification on signup (6-digit code via Resend)
 *  4. Login OTP option (users can request a one-time code instead of password)
 *  5. Rate limiting — auth endpoints locked after 5 failed attempts
 *  6. Security — no timing attacks on password compare, safe error messages
 *  7. stray floating return{} block removed
 */

export interface Env {
  FRONTEND_URL_ALT: string;
  DB: D1Database;
  JWT_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  SERPAPI_KEY: string;
  GEMINI_API_KEY: string;
  APOLLO_API_KEY: string;
  HUNTER_API_KEY: string;
  RESEND_API_KEY: string;
  TWILIO_ACCOUNT_SID: string;   // twilio.com — WhatsApp outreach
  TWILIO_AUTH_TOKEN: string;
  TWILIO_WHATSAPP_FROM: string; // e.g. whatsapp:+14155238886
  FRONTEND_URL: string;
  APP_DOMAIN: string;
  ADMIN_EMAIL: string;  // superuser — unlimited credits, can see all orgs
  PAYSTACK_SECRET_KEY: string;   // paystack.com/docs — sk_live_... or sk_test_...
  PAYSTACK_PUBLIC_KEY: string;   // pk_live_... or pk_test_... (returned to frontend)
  SENDER_EMAIL: string;          // fallback sender email for agent outreach
  SENDER_NAME: string;           // fallback sender name for agent outreach
}

// ═══════════════════════════════════════════════════════════════
//  CORS — defined first, used everywhere
// ═══════════════════════════════════════════════════════════════

function getCorsHeaders(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get('Origin') || '';
  // Allow localhost in dev, and the real frontend in prod
  const allowed = [
    env.FRONTEND_URL,
    env.FRONTEND_URL_ALT,
    'http://localhost:5173',
    'http://localhost:4173',
  ].filter(Boolean);
  const allowOrigin = allowed.includes(origin) ? origin : (env.FRONTEND_URL || '*');
  return {
    'Access-Control-Allow-Origin':      allowOrigin,
    'Access-Control-Allow-Methods':     'GET,POST,PATCH,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers':     'Content-Type,Authorization',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age':           '86400',
    'Vary':                             'Origin',
  };
}

// ── Response helpers ───────────────────────────────────────────
function ok(data: unknown, status: number, req: Request, env: Env): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req, env) },
  });
}

function fail(msg: string, status: number, req: Request, env: Env): Response {
  return ok({ error: msg }, status, req, env);
}

// ═══════════════════════════════════════════════════════════════
//  ROUTER
// ═══════════════════════════════════════════════════════════════

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url    = new URL(req.url);
    const path   = url.pathname;
    const method = req.method.toUpperCase();

    // Preflight — MUST return CORS headers
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: getCorsHeaders(req, env) });
    }

    try {
      // ── Public auth ──────────────────────────────────────────
      if (path === '/api/auth/register'            && method === 'POST') return authRegister(req, env);
      if (path === '/api/auth/verify-email'        && method === 'POST') return authVerifyEmail(req, env);
      if (path === '/api/auth/login'               && method === 'POST') return authLogin(req, env);
      if (path === '/api/auth/login-otp/request'   && method === 'POST') return authLoginOtpRequest(req, env);
      if (path === '/api/auth/login-otp/verify'    && method === 'POST') return authLoginOtpVerify(req, env);
      if (path === '/api/auth/google'              && method === 'POST') return authGoogle(req, env);
      if (path === '/api/auth/refresh'             && method === 'POST') return authRefresh(req, env);
      if (path === '/api/auth/logout'              && method === 'POST') return authLogout(req, env);

      // ── Public ───────────────────────────────────────────────
      if (path === '/api/pricing'                  && method === 'GET')  return getPricing(req, env);
      if (path === '/api/health'                   && method === 'GET')  return ok({ ok: true, ts: new Date().toISOString() }, 200, req, env);

      // Paystack payment — initialize is public (needs user email), verify is public (called from callback)
      if (path === '/api/payments/initialize'      && method === 'POST') return paystackInitialize(req, env);
      if (path === '/api/payments/verify'          && method === 'GET')  return paystackVerify(req, env);
      if (path === '/api/webhooks/paystack'        && method === 'POST') return paystackWebhook(req, env);
      if (path === '/api/payments/public-key'      && method === 'GET')  return ok({ publicKey: env.PAYSTACK_PUBLIC_KEY }, 200, req, env);
      if (path === '/api/unsubscribe'              && method === 'GET')  return handleUnsubscribe(req, env);

      if (path === '/api/webhooks/resend'          && method === 'POST') return handleResendWebhook(req, env);

      // ── Protected — require JWT ──────────────────────────────
      const auth = await requireAuth(req, env);
      if (auth instanceof Response) return auth;
      const { userId, orgId } = auth;

      // ── LeadForge Agent outreach endpoints (protected) ───────
      if (path === '/api/outreach/send-email'      && method === 'POST') return agentSendEmail(req, env, orgId);
      if (path === '/api/outreach/send-whatsapp'   && method === 'POST') return agentSendWhatsApp(req, env, orgId);

      if (path === '/api/auth/me'                  && method === 'GET')  return getMe(req, env, userId, orgId);
      if (path === '/api/org'                      && method === 'GET')  return getOrg(req, env, orgId);
      if (path === '/api/org/credits'              && method === 'GET')  return getCredits(req, env, orgId);

      if (path === '/api/leads/export'             && method === 'GET')  return exportLeads(req, env, orgId);
      if (path === '/api/leads'                    && method === 'GET')  return listLeads(req, env, orgId);
      if (path === '/api/leads'                    && method === 'POST') return createLead(req, env, orgId);
      const lm = path.match(/^\/api\/leads\/(\d+)$/);
      if (lm && method === 'PATCH')  return updateLead(req, env, orgId, +lm[1]);
      if (lm && method === 'DELETE') return deleteLead(req, env, orgId, +lm[1]);
      const em = path.match(/^\/api\/leads\/(\d+)\/enrich$/);
      if (em && method === 'POST')   return enrichOneLead(req, env, orgId, +em[1]);

      if (path === '/api/scrape'                   && method === 'POST') return handleScrape(req, env, ctx, orgId);

      if (path === '/api/campaigns'                && method === 'GET')  return listCampaigns(req, env, orgId);
      if (path === '/api/campaigns'                && method === 'POST') return createCampaign(req, env, orgId, userId);
      const cpm = path.match(/^\/api\/campaigns\/(\d+)$/);
      if (cpm && method === 'PATCH') return updateCampaign(req, env, orgId, +cpm[1]);
      const clm = path.match(/^\/api\/campaigns\/(\d+)\/launch$/);
      if (clm && method === 'POST')  return launchCampaign(req, env, ctx, orgId, +clm[1]);
      const wam = path.match(/^\/api\/campaigns\/(\d+)\/launch-whatsapp$/);
      if (wam && method === 'POST')  return launchWhatsAppCampaign(req, env, ctx, orgId, +wam[1]);

      if (path === '/api/templates'                && method === 'GET')  return listTemplates(req, env, orgId);
      if (path === '/api/templates'                && method === 'POST') return createTemplate(req, env, orgId);
      const tm = path.match(/^\/api\/templates\/(\d+)$/);
      if (tm && method === 'DELETE') return deleteTemplate(req, env, orgId, +tm[1]);

      if (path === '/api/automation'               && method === 'GET')  return getAutomation(req, env, orgId);
      if (path === '/api/automation'               && method === 'POST') return saveAutomation(req, env, orgId);

      if (path === '/api/stats'                    && method === 'GET')  return getStats(req, env, orgId);
      if (path === '/api/stats/weekly'             && method === 'GET')  return getWeeklyStats(req, env, orgId);
      if (path === '/api/pipeline'                 && method === 'GET')  return getPipeline(req, env, orgId);
      if (path === '/api/recent-leads'             && method === 'GET')  return getRecentLeads(req, env, orgId);

      // ── Admin-only routes ────────────────────────────────────
      if (path === '/api/admin/orgs'               && method === 'GET')  return adminListOrgs(req, env, userId);
      if (path === '/api/admin/grant-credits'      && method === 'POST') return adminGrantCredits(req, env, userId);

      return fail('Not found', 404, req, env);
    } catch (e: any) {
      console.error('Unhandled:', e?.message, e?.stack);
      return fail('Internal server error', 500, req, env);
    }
  },

  async scheduled(_: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runDailyPipeline(env));
  },
};

// ═══════════════════════════════════════════════════════════════
//  RATE LIMITING
//  Max 5 attempts per 15-minute window per key.
//  After 5 failures, locked for 1 hour.
// ═══════════════════════════════════════════════════════════════

async function checkRateLimit(env: Env, key: string): Promise<{ allowed: boolean; retryAfter?: string }> {
  const now = new Date();
  const row: any = await env.DB.prepare('SELECT * FROM rate_limits WHERE key=?').bind(key).first();

  if (row) {
    // Check hard lock first
    if (row.locked_until && new Date(row.locked_until) > now) {
      return { allowed: false, retryAfter: row.locked_until };
    }
    // Check window
    if (new Date(row.window_end) > now) {
      if (row.attempts >= 5) {
        const lockedUntil = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
        await env.DB.prepare('UPDATE rate_limits SET locked_until=? WHERE key=?').bind(lockedUntil, key).run();
        return { allowed: false, retryAfter: lockedUntil };
      }
      // Increment
      await env.DB.prepare('UPDATE rate_limits SET attempts=attempts+1 WHERE key=?').bind(key).run();
    } else {
      // Window expired — reset
      const windowEnd = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
      await env.DB.prepare('UPDATE rate_limits SET attempts=1, window_end=?, locked_until=NULL WHERE key=?').bind(windowEnd, key).run();
    }
  } else {
    const windowEnd = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
    await env.DB.prepare('INSERT INTO rate_limits (key,attempts,window_end) VALUES (?,?,?)').bind(key, 1, windowEnd).run();
  }
  return { allowed: true };
}

async function clearRateLimit(env: Env, key: string) {
  await env.DB.prepare('DELETE FROM rate_limits WHERE key=?').bind(key).run();
}

function getClientIp(req: Request): string {
  return req.headers.get('CF-Connecting-IP')
    || req.headers.get('X-Forwarded-For')?.split(',')[0].trim()
    || 'unknown';
}

// ═══════════════════════════════════════════════════════════════
//  OTP HELPERS
// ═══════════════════════════════════════════════════════════════

function generateOtp(): string {
  // 6-digit numeric code
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const num   = new DataView(bytes.buffer).getUint32(0, false);
  return String(num % 1_000_000).padStart(6, '0');
}

async function sendOtpEmail(env: Env, to: string, code: string, type: 'verify_email' | 'login_otp'): Promise<boolean> {
  if (!env.RESEND_API_KEY) { console.warn('RESEND_API_KEY not set — OTP:', code); return true; } // log in dev

  const subject = type === 'verify_email'
    ? 'Verify your Lead Engine account'
    : 'Your Lead Engine login code';

  const body = type === 'verify_email'
    ? `Your verification code is: ${code}\n\nThis code expires in 15 minutes.\n\nIf you didn't create a Lead Engine account, ignore this email.`
    : `Your one-time login code is: ${code}\n\nThis code expires in 10 minutes.\n\nIf you didn't request this, someone may be trying to access your account.`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.RESEND_API_KEY}` },
    body: JSON.stringify({
      from: `Lead Engine <noreply@${env.APP_DOMAIN || 'leadengine.co'}>`,
      to: [to],
      subject,
      text: body,
    }),
  });
  return res.ok;
}

async function createOtp(env: Env, email: string, type: 'verify_email' | 'login_otp', ttlMinutes = 15): Promise<string> {
  // Invalidate any existing unused OTPs of same type for this email
  await env.DB.prepare('UPDATE otps SET used=1 WHERE email=? AND type=? AND used=0').bind(email, type).run();
  const code      = generateOtp();
  const codeHash  = await sha256hex(code); // store hash, never plain code
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
  await env.DB.prepare('INSERT INTO otps (email,code,type,expires_at) VALUES (?,?,?,?)').bind(email, codeHash, type, expiresAt).run();
  return code; // return plain code to send in email
}

async function verifyOtp(env: Env, email: string, code: string, type: 'verify_email' | 'login_otp'): Promise<boolean> {
  const codeHash = await sha256hex(code);
  const row: any = await env.DB.prepare(
    `SELECT id FROM otps WHERE email=? AND code=? AND type=? AND used=0 AND expires_at > datetime('now')`
  ).bind(email, codeHash, type).first();
  if (!row) return false;
  await env.DB.prepare('UPDATE otps SET used=1 WHERE id=?').bind(row.id).run();
  return true;
}

// ═══════════════════════════════════════════════════════════════
//  CRYPTO HELPERS
// ═══════════════════════════════════════════════════════════════

async function hashPassword(password: string): Promise<string> {
  const enc  = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key  = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' }, key, 256
  );
  const toHex = (b: Uint8Array) => [...b].map(x => x.toString(16).padStart(2,'0')).join('');
  return `${toHex(salt)}:${toHex(new Uint8Array(bits))}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [saltHex, hashHex] = stored.split(':');
    const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map(b => parseInt(b, 16)));
    const key  = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' }, key, 256
    );
    const attempt = [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2,'0')).join('');
    // Constant-time compare using crypto.subtle to prevent timing attacks
    const enc = new TextEncoder();
    const a   = await crypto.subtle.importKey('raw', enc.encode(attempt), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const b   = await crypto.subtle.importKey('raw', enc.encode(hashHex),  { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sa  = await crypto.subtle.sign('HMAC', a, enc.encode('cmp'));
    const sb  = await crypto.subtle.sign('HMAC', b, enc.encode('cmp'));
    const ha  = [...new Uint8Array(sa)].map(b => b.toString(16).padStart(2,'0')).join('');
    const hb  = [...new Uint8Array(sb)].map(b => b.toString(16).padStart(2,'0')).join('');
    return ha === hb;
  } catch { return false; }
}

async function sha256hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,'0')).join('');
}

function b64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

async function signJWT(payload: Record<string, unknown>, secret: string): Promise<string> {
  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body   = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const data   = `${header}.${body}`;
  const key    = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig    = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return `${data}.${b64url(sig)}`;
}

async function verifyJWT(token: string, secret: string): Promise<Record<string, any> | null> {
  try {
    const [header, body, sig] = token.split('.');
    const key    = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const sigBuf = Uint8Array.from(atob(sig.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
    const valid  = await crypto.subtle.verify('HMAC', key, sigBuf, new TextEncoder().encode(`${header}.${body}`));
    if (!valid) return null;
    const payload = JSON.parse(atob(body.replace(/-/g,'+').replace(/_/g,'/')));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

function makeAccessToken(userId: string, orgId: string, secret: string) {
  return signJWT({ sub: userId, org: orgId, exp: Math.floor(Date.now() / 1000) + 900 }, secret); // 15 min
}

function makeRefreshToken(): string {
  return [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2,'0')).join('');
}

async function createSession(env: Env, userId: string, req: Request): Promise<string> {
  const rt         = makeRefreshToken();
  const tokenHash  = await sha256hex(rt);
  const expiresAt  = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
  await env.DB.prepare('INSERT INTO sessions (user_id,token_hash,expires_at,ip,user_agent) VALUES (?,?,?,?,?)')
    .bind(userId, tokenHash, expiresAt, getClientIp(req), req.headers.get('User-Agent') || null).run();
  return rt;
}

// ═══════════════════════════════════════════════════════════════
//  AUTH MIDDLEWARE
// ═══════════════════════════════════════════════════════════════

async function requireAuth(req: Request, env: Env): Promise<{ userId: string; orgId: string } | Response> {
  const header  = req.headers.get('Authorization') || '';
  const token   = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return fail('Unauthorized', 401, req, env);
  const payload = await verifyJWT(token, env.JWT_SECRET);
  if (!payload) return fail('Token expired or invalid. Please log in again.', 401, req, env);
  return { userId: payload.sub, orgId: payload.org };
}

// ═══════════════════════════════════════════════════════════════
//  ADMIN HELPERS
// ═══════════════════════════════════════════════════════════════

function isAdmin(env: Env, userId: string, userEmail?: string): boolean {
  // Admin is identified by ADMIN_EMAIL env var
  return !!(env.ADMIN_EMAIL && userEmail && userEmail.toLowerCase() === env.ADMIN_EMAIL.toLowerCase());
}

async function requireAdmin(req: Request, env: Env, userId: string): Promise<boolean> {
  const user: any = await env.DB.prepare('SELECT email FROM users WHERE id=?').bind(userId).first();
  return isAdmin(env, userId, user?.email);
}

async function adminListOrgs(req: Request, env: Env, userId: string): Promise<Response> {
  if (!await requireAdmin(req, env, userId)) return fail('Forbidden', 403, req, env);
  const { results } = await env.DB.prepare(
    `SELECT o.*, 
      (SELECT COUNT(*) FROM leads l WHERE l.org_id = o.id) as lead_count,
      (SELECT COUNT(*) FROM users u WHERE u.org_id = o.id) as user_count
     FROM orgs o ORDER BY o.created_at DESC`
  ).all();
  return ok(results, 200, req, env);
}

async function adminGrantCredits(req: Request, env: Env, userId: string): Promise<Response> {
  if (!await requireAdmin(req, env, userId)) return fail('Forbidden', 403, req, env);
  const { orgId, credits, reason } = await req.json() as any;
  if (!orgId || !credits) return fail('orgId and credits required', 422, req, env);
  await env.DB.batch([
    env.DB.prepare('UPDATE orgs SET credits=credits+? WHERE id=?').bind(credits, orgId),
    env.DB.prepare('INSERT INTO credit_txns (org_id,delta,reason) VALUES (?,?,?)').bind(orgId, credits, reason || 'admin_grant'),
  ]);
  return ok({ ok: true }, 200, req, env);
}

// ═══════════════════════════════════════════════════════════════
//  AUTH HANDLERS
// ═══════════════════════════════════════════════════════════════

async function authRegister(req: Request, env: Env): Promise<Response> {
  const ip = getClientIp(req);
  const rl = await checkRateLimit(env, `register:${ip}`);
  if (!rl.allowed) return fail('Too many attempts. Try again later.', 429, req, env);

  const { name, email, password, orgName } = await req.json() as any;
  if (!name?.trim() || !email?.trim() || !password || !orgName?.trim())
    return fail('All fields required', 422, req, env);
  if (password.length < 8)
    return fail('Password must be at least 8 characters', 422, req, env);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return fail('Invalid email address', 422, req, env);

  const existing = await env.DB.prepare('SELECT id FROM users WHERE email=?').bind(email.toLowerCase()).first();
  if (existing) return fail('Email already registered', 409, req, env);

  const hash   = await hashPassword(password);
  const slug   = orgName.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')
               + '-' + [...crypto.getRandomValues(new Uint8Array(3))].map(b=>b.toString(16).padStart(2,'0')).join('');
  const orgId  = crypto.randomUUID().replace(/-/g,'');
  const userId = crypto.randomUUID().replace(/-/g,'');

  const isAdminUser = !!(env.ADMIN_EMAIL && email.toLowerCase() === env.ADMIN_EMAIL.toLowerCase());
  const initialCredits = isAdminUser ? 999999 : 0;
  const plan = isAdminUser ? 'business' : 'free';

  await env.DB.batch([
    env.DB.prepare('INSERT INTO orgs (id,name,slug,plan,credits) VALUES (?,?,?,?,?)').bind(orgId, orgName.trim(), slug, plan, initialCredits),
    env.DB.prepare('INSERT INTO users (id,org_id,email,name,password_hash,role,email_verified) VALUES (?,?,?,?,?,?,?)').bind(userId, orgId, email.toLowerCase(), name.trim(), hash, 'owner', isAdminUser ? 1 : 0),
    env.DB.prepare('INSERT INTO automation_config (org_id) VALUES (?)').bind(orgId),
    env.DB.prepare("INSERT INTO templates (org_id,name,subject,body,category) SELECT ?,name,subject,body,category FROM templates WHERE org_id='system'").bind(orgId),
  ]);

  // Send email verification OTP
  const otpCode = await createOtp(env, email.toLowerCase(), 'verify_email', 15);
  await sendOtpEmail(env, email.toLowerCase(), otpCode, 'verify_email');

  return ok({ message: 'Account created. Check your email for a 6-digit verification code.', userId, requiresVerification: true }, 201, req, env);
}

async function authVerifyEmail(req: Request, env: Env): Promise<Response> {
  const { email, code } = await req.json() as any;
  if (!email || !code) return fail('Email and code required', 422, req, env);

  const rl = await checkRateLimit(env, `verify:${email.toLowerCase()}`);
  if (!rl.allowed) return fail('Too many attempts. Try again in 1 hour.', 429, req, env);

  const valid = await verifyOtp(env, email.toLowerCase(), String(code).trim(), 'verify_email');
  if (!valid) return fail('Invalid or expired code', 400, req, env);

  // Mark verified and grant signup credits
  const user: any = await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email.toLowerCase()).first();
  if (!user) return fail('User not found', 404, req, env);

  await env.DB.batch([
    env.DB.prepare('UPDATE users SET email_verified=1 WHERE id=?').bind(user.id),
    env.DB.prepare('UPDATE orgs SET credits=credits+100 WHERE id=?').bind(user.org_id),
    env.DB.prepare('INSERT INTO credit_txns (org_id,delta,reason) VALUES (?,?,?)').bind(user.org_id, 100, 'signup_bonus'),
  ]);

  await clearRateLimit(env, `verify:${email.toLowerCase()}`);

  const accessToken  = await makeAccessToken(user.id, user.org_id, env.JWT_SECRET);
  const refreshToken = await createSession(env, user.id, req);

  return ok({ accessToken, refreshToken, userId: user.id, orgId: user.org_id }, 200, req, env);
}

async function authLogin(req: Request, env: Env): Promise<Response> {
  const ip = getClientIp(req);
  const { email, password } = await req.json() as any;
  if (!email || !password) return fail('Email and password required', 422, req, env);

  // Rate limit by IP and by email
  const rlIp    = await checkRateLimit(env, `login:${ip}`);
  const rlEmail = await checkRateLimit(env, `login:${email.toLowerCase()}`);
  if (!rlIp.allowed || !rlEmail.allowed)
    return fail('Too many failed attempts. Try again later.', 429, req, env);

  const user: any = await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email.toLowerCase()).first();

  // Always run password hash even if user not found — prevents timing attack / user enumeration
  const dummyHash = 'a'.repeat(96);
  const valid = user?.password_hash
    ? await verifyPassword(password, user.password_hash)
    : await verifyPassword(password, dummyHash).then(() => false);

  if (!user || !valid) return fail('Invalid email or password', 401, req, env);

  if (!user.email_verified) {
    // Resend verification OTP
    const otpCode = await createOtp(env, email.toLowerCase(), 'verify_email', 15);
    await sendOtpEmail(env, email.toLowerCase(), otpCode, 'verify_email');
    return fail('Please verify your email first. A new code has been sent.', 403, req, env);
  }

  await clearRateLimit(env, `login:${ip}`);
  await clearRateLimit(env, `login:${email.toLowerCase()}`);
  await env.DB.prepare("UPDATE users SET last_login=datetime('now') WHERE id=?").bind(user.id).run();

  const accessToken  = await makeAccessToken(user.id, user.org_id, env.JWT_SECRET);
  const refreshToken = await createSession(env, user.id, req);

  return ok({ accessToken, refreshToken, userId: user.id, orgId: user.org_id }, 200, req, env);
}

async function authLoginOtpRequest(req: Request, env: Env): Promise<Response> {
  const { email } = await req.json() as any;
  if (!email) return fail('Email required', 422, req, env);

  const rl = await checkRateLimit(env, `otp:${email.toLowerCase()}`);
  if (!rl.allowed) return fail('Too many requests. Try again later.', 429, req, env);

  const user: any = await env.DB.prepare('SELECT id FROM users WHERE email=? AND email_verified=1').bind(email.toLowerCase()).first();
  // Always return success even if email not found — prevents enumeration
  if (user) {
    const code = await createOtp(env, email.toLowerCase(), 'login_otp', 10);
    await sendOtpEmail(env, email.toLowerCase(), code, 'login_otp');
  }
  return ok({ message: 'If that email is registered, a login code has been sent.' }, 200, req, env);
}

async function authLoginOtpVerify(req: Request, env: Env): Promise<Response> {
  const { email, code } = await req.json() as any;
  if (!email || !code) return fail('Email and code required', 422, req, env);

  const rl = await checkRateLimit(env, `otp_verify:${email.toLowerCase()}`);
  if (!rl.allowed) return fail('Too many attempts. Try again later.', 429, req, env);

  const valid = await verifyOtp(env, email.toLowerCase(), String(code).trim(), 'login_otp');
  if (!valid) return fail('Invalid or expired code', 400, req, env);

  const user: any = await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email.toLowerCase()).first();
  if (!user) return fail('User not found', 404, req, env);

  await clearRateLimit(env, `otp_verify:${email.toLowerCase()}`);
  await env.DB.prepare("UPDATE users SET last_login=datetime('now') WHERE id=?").bind(user.id).run();

  const accessToken  = await makeAccessToken(user.id, user.org_id, env.JWT_SECRET);
  const refreshToken = await createSession(env, user.id, req);

  return ok({ accessToken, refreshToken, userId: user.id, orgId: user.org_id }, 200, req, env);
}

async function authGoogle(req: Request, env: Env): Promise<Response> {
  const { code, redirectUri } = await req.json() as any;
  if (!code) return fail('code required', 422, req, env);

  const ip = getClientIp(req);
  const rl = await checkRateLimit(env, `google:${ip}`);
  if (!rl.allowed) return fail('Too many attempts', 429, req, env);

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri:  redirectUri || `${env.FRONTEND_URL}/auth/callback`,
      grant_type:    'authorization_code',
    }),
  });
  const tokenData: any = await tokenRes.json();
  if (!tokenRes.ok) {
    console.error('Google token exchange failed:', JSON.stringify(tokenData));
    return fail('Google sign-in failed. Please try again.', 401, req, env);
  }

  const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const gUser: any = await userRes.json();
  if (!gUser.sub) return fail('Could not get Google profile', 401, req, env);

  let user: any = await env.DB.prepare('SELECT * FROM users WHERE google_id=?').bind(gUser.sub).first();

  if (!user) {
    user = await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(gUser.email.toLowerCase()).first();
    if (user) {
      // Link Google to existing account
      await env.DB.prepare('UPDATE users SET google_id=?, avatar_url=?, email_verified=1 WHERE id=?')
        .bind(gUser.sub, gUser.picture, user.id).run();
    } else {
      // New user — create org + user
      const orgId  = crypto.randomUUID().replace(/-/g,'');
      const userId = crypto.randomUUID().replace(/-/g,'');
      const orgName= `${gUser.name}'s Workspace`;
      const slug   = gUser.email.split('@')[0].replace(/[^a-z0-9]/g,'-')
                   + '-' + [...crypto.getRandomValues(new Uint8Array(3))].map(b=>b.toString(16).padStart(2,'0')).join('');
      const isAdminGoogle = !!(env.ADMIN_EMAIL && gUser.email.toLowerCase() === env.ADMIN_EMAIL.toLowerCase());
      const googleCredits = isAdminGoogle ? 999999 : 100;
      const googlePlan    = isAdminGoogle ? 'business' : 'free';
      await env.DB.batch([
        env.DB.prepare('INSERT INTO orgs (id,name,slug,plan,credits) VALUES (?,?,?,?,?)').bind(orgId, orgName, slug, googlePlan, googleCredits),
        env.DB.prepare('INSERT INTO users (id,org_id,email,name,google_id,avatar_url,role,email_verified) VALUES (?,?,?,?,?,?,?,?)').bind(userId, orgId, gUser.email.toLowerCase(), gUser.name, gUser.sub, gUser.picture, 'owner', 1),
        env.DB.prepare('INSERT INTO automation_config (org_id) VALUES (?)').bind(orgId),
        env.DB.prepare('INSERT INTO credit_txns (org_id,delta,reason) VALUES (?,?,?)').bind(orgId, googleCredits, isAdminGoogle ? 'admin_account' : 'signup_bonus'),
        env.DB.prepare("INSERT INTO templates (org_id,name,subject,body,category) SELECT ?,name,subject,body,category FROM templates WHERE org_id='system'").bind(orgId),
      ]);
      user = await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(userId).first();
    }
  }

  await clearRateLimit(env, `google:${ip}`);
  await env.DB.prepare("UPDATE users SET last_login=datetime('now') WHERE id=?").bind(user.id).run();

  const accessToken  = await makeAccessToken(user.id, user.org_id, env.JWT_SECRET);
  const refreshToken = await createSession(env, user.id, req);

  return ok({ accessToken, refreshToken, userId: user.id, orgId: user.org_id }, 200, req, env);
}

async function authRefresh(req: Request, env: Env): Promise<Response> {
  const { refreshToken } = await req.json() as any;
  if (!refreshToken) return fail('refreshToken required', 422, req, env);
  const hash = await sha256hex(refreshToken);
  const session: any = await env.DB.prepare(
    `SELECT s.*, u.org_id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at > datetime('now')`
  ).bind(hash).first();
  if (!session) return fail('Session expired. Please log in again.', 401, req, env);
  const accessToken = await makeAccessToken(session.user_id, session.org_id, env.JWT_SECRET);
  return ok({ accessToken }, 200, req, env);
}

async function authLogout(req: Request, env: Env): Promise<Response> {
  const { refreshToken } = await req.json() as any;
  if (refreshToken) {
    const hash = await sha256hex(refreshToken);
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(hash).run();
  }
  return ok({ ok: true }, 200, req, env);
}

async function getMe(req: Request, env: Env, userId: string, orgId: string): Promise<Response> {
  const [user, org] = await Promise.all([
    env.DB.prepare('SELECT id,email,name,role,avatar_url,email_verified,created_at,last_login FROM users WHERE id=?').bind(userId).first(),
    env.DB.prepare('SELECT * FROM orgs WHERE id=?').bind(orgId).first(),
  ]);
  return ok({ user, org }, 200, req, env);
}

// ═══════════════════════════════════════════════════════════════
//  ORG & CREDITS
// ═══════════════════════════════════════════════════════════════

async function getOrg(req: Request, env: Env, orgId: string): Promise<Response> {
  const org = await env.DB.prepare('SELECT * FROM orgs WHERE id=?').bind(orgId).first();
  return ok(org, 200, req, env);
}

async function getCredits(req: Request, env: Env, orgId: string): Promise<Response> {
  const [org, { results: txns }] = await Promise.all([
    env.DB.prepare('SELECT credits FROM orgs WHERE id=?').bind(orgId).first<{credits:number}>(),
    env.DB.prepare('SELECT * FROM credit_txns WHERE org_id=? ORDER BY created_at DESC LIMIT 20').bind(orgId).all(),
  ]);
  return ok({ credits: org?.credits ?? 0, transactions: txns }, 200, req, env);
}

async function getPricing(req: Request, env: Env): Promise<Response> {
  const { results } = await env.DB.prepare('SELECT * FROM credit_packages ORDER BY credits ASC').all();
  return ok(results, 200, req, env);
}

async function deductCredits(env: Env, orgId: string, amount: number, reason: string, refId?: string): Promise<boolean> {
  const org: any = await env.DB.prepare('SELECT credits FROM orgs WHERE id=?').bind(orgId).first();
  if (!org || org.credits < amount) return false;
  await env.DB.batch([
    env.DB.prepare('UPDATE orgs SET credits=credits-? WHERE id=? AND credits>=?').bind(amount, orgId, amount),
    env.DB.prepare('INSERT INTO credit_txns (org_id,delta,reason,ref_id) VALUES (?,?,?,?)').bind(orgId, -amount, reason, refId || null),
  ]);
  return true;
}

// ═══════════════════════════════════════════════════════════════
//  LEAD HANDLERS
// ═══════════════════════════════════════════════════════════════

async function listLeads(req: Request, env: Env, orgId: string): Promise<Response> {
  const url    = new URL(req.url);
  const search = url.searchParams.get('search') || '';
  const status = url.searchParams.get('status') || 'all';
  const page   = Math.max(1, +(url.searchParams.get('page') || '1'));
  const limit  = Math.min(200, +(url.searchParams.get('limit') || '50'));
  const offset = (page - 1) * limit;
  let q = 'WHERE org_id=?'; const p: any[] = [orgId];
  if (search) { q += ' AND (name LIKE ? OR email LIKE ? OR city LIKE ?)'; p.push(`%${search}%`,`%${search}%`,`%${search}%`); }
  if (status !== 'all') { q += ' AND status=?'; p.push(status); }
  const [{ results }, count] = await Promise.all([
    env.DB.prepare(`SELECT * FROM leads ${q} ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(...p, limit, offset).all(),
    env.DB.prepare(`SELECT COUNT(*) as c FROM leads ${q}`).bind(...p).first<{c:number}>(),
  ]);
  return ok({ leads: results, total: count?.c ?? 0, page, limit }, 200, req, env);
}

async function createLead(req: Request, env: Env, orgId: string): Promise<Response> {
  const body: any = await req.json().catch(() => null);
  if (!body?.name?.trim()) return fail('name required', 422, req, env);
  const row = await env.DB.prepare(
    'INSERT INTO leads (org_id,name,email,phone,website,address,city,country,industry,status,source,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *'
  ).bind(orgId, body.name.trim(), body.email||null, body.phone||null, body.website||null,
         body.address||null, body.city||null, body.country||'Kenya',
         body.industry||null, body.status||'new', body.source||'Manual', body.notes||null).first();
  return ok(row, 201, req, env);
}

async function updateLead(req: Request, env: Env, orgId: string, id: number): Promise<Response> {
  const body: any = await req.json().catch(() => ({}));
  const allowed   = ['name','email','phone','website','address','city','country','industry','status','source','notes','assigned_to'];
  const updates   = Object.entries(body).filter(([k]) => allowed.includes(k));
  if (!updates.length) return fail('no valid fields', 422, req, env);
  const set = updates.map(([k]) => `${k}=?`).join(', ');
  const row = await env.DB.prepare(
    `UPDATE leads SET ${set}, updated_at=datetime('now') WHERE id=? AND org_id=? RETURNING *`
  ).bind(...updates.map(([,v]) => v), id, orgId).first();
  if (!row) return fail('not found', 404, req, env);
  return ok(row, 200, req, env);
}

async function deleteLead(req: Request, env: Env, orgId: string, id: number): Promise<Response> {
  const info = await env.DB.prepare('DELETE FROM leads WHERE id=? AND org_id=?').bind(id, orgId).run();
  if (!info.meta.changes) return fail('not found', 404, req, env);
  return new Response(null, { status: 204, headers: getCorsHeaders(req, env) });
}

async function exportLeads(req: Request, env: Env, orgId: string): Promise<Response> {
  const url = new URL(req.url);
  const search = url.searchParams.get('search') || '';
  const status = url.searchParams.get('status') || 'all';
  let q = 'WHERE org_id=?'; const p: any[] = [orgId];
  if (search) { q += ' AND (name LIKE ? OR email LIKE ?)'; p.push(`%${search}%`,`%${search}%`); }
  if (status !== 'all') { q += ' AND status=?'; p.push(status); }
  const { results } = await env.DB.prepare(`SELECT * FROM leads ${q} ORDER BY created_at DESC`).bind(...p).all();
  const header = 'Name,Email,Email Status,Phone,Website,Address,City,Industry,Status,Source,Rating,Added\n';
  const rows   = (results as any[]).map(r =>
    [r.name,r.email,r.email_status,r.phone,r.website,r.address,r.city,r.industry,r.status,r.source,r.rating,r.created_at]
      .map(v => `"${(v??'').toString().replace(/"/g,'""')}"`)
      .join(',')
  ).join('\n');
  return new Response(header + rows, {
    headers: { 'Content-Type':'text/csv', 'Content-Disposition':'attachment; filename="leads.csv"', ...getCorsHeaders(req, env) },
  });
}

async function enrichOneLead(req: Request, env: Env, orgId: string, id: number): Promise<Response> {
  const lead: any = await env.DB.prepare('SELECT * FROM leads WHERE id=? AND org_id=?').bind(id, orgId).first();
  if (!lead) return fail('not found', 404, req, env);
  const updated = await enrichLead(env, lead);
  return ok(updated, 200, req, env);
}

// ═══════════════════════════════════════════════════════════════
//  ENGINE 1 — SERPAPI SCRAPER
// ═══════════════════════════════════════════════════════════════

async function handleScrape(req: Request, env: Env, ctx: ExecutionContext, orgId: string): Promise<Response> {
  const body: any = await req.json().catch(() => ({}));
  const keyword   = (body.keyword || 'restaurants').trim();
  const location  = (body.location || 'Nairobi, Kenya').trim();
  const max       = Math.min(+(body.max || 20), 20);
  const org: any  = await env.DB.prepare('SELECT credits FROM orgs WHERE id=?').bind(orgId).first();
  if (!org || org.credits < 1) return fail('Insufficient credits. Purchase more to continue scraping.', 402, req, env);
  const job: any  = await env.DB.prepare('INSERT INTO scrape_jobs (org_id,keyword,location,status) VALUES (?,?,?,?) RETURNING id').bind(orgId, keyword, location, 'running').first();
  ctx.waitUntil(runScrapeJob(env, orgId, job.id, keyword, location, max));
  return ok({ ok: true, jobId: job.id, message: `Scraping "${keyword}" in "${location}"…` }, 202, req, env);
}

async function runScrapeJob(env: Env, orgId: string, jobId: number, keyword: string, location: string, max: number) {
  let found = 0, added = 0;
  const newLeadIds: number[] = [];
  try {
    if (!env.SERPAPI_KEY) throw new Error('SERPAPI_KEY not set');
    const params = new URLSearchParams({ engine:'google_maps', q:`${keyword} in ${location}`, type:'search', hl:'en', api_key:env.SERPAPI_KEY });
    const res    = await fetch(`https://serpapi.com/search.json?${params}`);
    if (!res.ok) throw new Error(`SerpApi ${res.status}`);
    const data: any  = await res.json();
    const places     = (data.local_results || []).slice(0, max);
    found = places.length;

    for (const place of places) {
      const org: any = await env.DB.prepare('SELECT credits FROM orgs WHERE id=?').bind(orgId).first();
      if (!org || org.credits < 1) break;
      const placeId = place.place_id || null;
      if (placeId) {
        const exists = await env.DB.prepare('SELECT id FROM leads WHERE org_id=? AND place_id=?').bind(orgId, placeId).first();
        if (exists) continue;
      }
      const parts = (place.address || '').split(',');
      const city  = parts.length >= 2 ? parts[parts.length - 2].trim() : location.split(',')[0].trim();

      const newLead: any = await env.DB.prepare(
        'INSERT INTO leads (org_id,name,phone,website,address,city,country,rating,reviews,status,source,place_id,industry) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id'
      ).bind(orgId, place.title||null, place.phone||null, place.website||null, place.address||null, city, 'Kenya', place.rating||null, place.reviews||0, 'new', 'Google Maps', placeId, place.type||keyword).first();

      if (newLead?.id) newLeadIds.push(newLead.id);
      await deductCredits(env, orgId, 1, 'scrape', String(jobId));
      added++;
      await sleep(100);
    }

    await env.DB.prepare('UPDATE scrape_jobs SET status=?,leads_found=?,leads_new=?,credits_used=?,finished_at=datetime(\'now\') WHERE id=?').bind('done', found, added, added, jobId).run();

    // Auto-enrich emails for all new leads that have a website
    // Run in background — don't block the scrape completion
    if (newLeadIds.length > 0 && (env.APOLLO_API_KEY || env.HUNTER_API_KEY)) {
      for (const leadId of newLeadIds) {
        const lead: any = await env.DB.prepare('SELECT * FROM leads WHERE id=?').bind(leadId).first();
        if (lead?.website) {
          await enrichLead(env, lead);
          await sleep(400); // respect API rate limits
        }
      }
    }

  } catch (e: any) {
    console.error('Scrape error:', e.message);
    await env.DB.prepare("UPDATE scrape_jobs SET status='failed', finished_at=datetime('now') WHERE id=?").bind(jobId).run();
  }
}

// ═══════════════════════════════════════════════════════════════
//  ENGINE 2 — EMAIL ENRICHMENT
// ═══════════════════════════════════════════════════════════════

async function enrichLead(env: Env, lead: any): Promise<any> {
  if (lead.email && lead.email_status === 'verified') return lead;
  const domain = lead.website ? extractDomain(lead.website) : null;
  if (!domain) return lead;
  if (env.APOLLO_API_KEY) {
    try {
      // Correct Apollo endpoint: /api/v1/people/match enriches by domain
      // The old /v1/mixed_people/search endpoint does NOT return emails
      const res = await fetch('https://api.apollo.io/api/v1/people/match', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'x-api-key': env.APOLLO_API_KEY,
        },
        body: JSON.stringify({
          domain,
          reveal_personal_emails: false,
          reveal_phone_number: false,
        }),
      });
      if (res.ok) {
        const data: any = await res.json();
        const email = data?.person?.email || data?.contact?.email;
        if (email) {
          return await env.DB.prepare(
            "UPDATE leads SET email=?, email_status='verified', enriched_at=datetime('now'), updated_at=datetime('now') WHERE id=? RETURNING *"
          ).bind(email, lead.id).first();
        }
      } else {
        console.error('Apollo enrichment:', res.status, domain);
      }
    } catch(e:any) { console.error('Apollo error:', e.message); }
  }
  if (env.HUNTER_API_KEY) {
    try {
      const res  = await fetch(`https://api.hunter.io/v2/domain-search?domain=${domain}&limit=3&api_key=${env.HUNTER_API_KEY}`);
      const data: any = await res.json();
      const best = (data?.data?.emails||[])[0];
      if (best?.value) {
        const s = best?.verification?.result === 'deliverable' ? 'verified' : 'unknown';
        return await env.DB.prepare('UPDATE leads SET email=?, email_status=?, enriched_at=datetime(\'now\'), updated_at=datetime(\'now\') WHERE id=? RETURNING *').bind(best.value, s, lead.id).first();
      }
    } catch(e:any) { console.error('Hunter:', e.message); }
  }
  await env.DB.prepare("UPDATE leads SET email_status='unknown', enriched_at=datetime('now') WHERE id=?").bind(lead.id).run();
  return lead;
}

// ═══════════════════════════════════════════════════════════════
//  ENGINE 3 — GEMINI AI
// ═══════════════════════════════════════════════════════════════

async function generateEmail(env: Env, lead: any, template: any, config: any): Promise<{subject:string;body:string}> {
  const senderName = config?.sender_name || 'The Team';
  const tone       = config?.ai_tone || 'professional';
  if (!env.GEMINI_API_KEY || !config?.use_ai) return interpolate(template, lead, senderName);
  const prompt = `Write a cold outreach email on behalf of ${senderName}.\nTARGET: Business: ${lead.name}, City: ${lead.city||'Nairobi'}, Industry: ${lead.industry||'local business'}, Rating: ${lead.rating||'unknown'}\nTEMPLATE:\nSubject: ${template.subject}\nBody: ${template.body}\nRULES: tone=${tone}, max 120 words, sound human, replace all {{tokens}}, one CTA, no buzzwords.\nReturn ONLY JSON: {"subject":"...","body":"..."}`;
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
      { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ contents:[{parts:[{text:prompt}]}], generationConfig:{temperature:0.7,maxOutputTokens:512,responseMimeType:'application/json'} }) });
    if (res.ok) {
      const data: any = await res.json();
      const parsed = JSON.parse((data?.candidates?.[0]?.content?.parts?.[0]?.text||'').replace(/```json|```/g,'').trim());
      if (parsed?.subject && parsed?.body) return parsed;
    }
  } catch(e:any) { console.error('Gemini:', e.message); }
  return interpolate(template, lead, senderName);
}

function interpolate(tpl: any, lead: any, senderName: string): {subject:string;body:string} {
  const tokens: Record<string,string> = { '{{name}}':lead.name,'{{business}}':lead.name,'{{city}}':lead.city||'your city','{{industry}}':lead.industry||'your industry','{{website}}':lead.website||'','{{sender_name}}':senderName };
  const r = (s:string) => Object.entries(tokens).reduce((t,[k,v])=>t.replaceAll(k,v),s);
  return { subject: r(tpl.subject), body: r(tpl.body) };
}

// ═══════════════════════════════════════════════════════════════
//  ENGINE 4 — RESEND EMAIL
// ═══════════════════════════════════════════════════════════════

async function sendEmail(env: Env, to: string, subject: string, body: string, senderEmail: string, senderName: string): Promise<string|null> {
  if (!env.RESEND_API_KEY) { console.error('sendEmail: RESEND_API_KEY not set'); return null; }
  if (!senderEmail) { console.error('sendEmail: senderEmail is empty — set it in Automation settings'); return null; }
  if (!to) { console.error('sendEmail: recipient email is empty'); return null; }
  console.log(`sendEmail: ${senderName} <${senderEmail}> → ${to} | subject: ${subject.slice(0,50)}`);
  const unsubUrl = `https://${env.APP_DOMAIN}/api/unsubscribe?email=${encodeURIComponent(to)}`;
  const res = await fetch('https://api.resend.com/emails', {
    method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${env.RESEND_API_KEY}`},
    body: JSON.stringify({ from:`${senderName} <${senderEmail}>`, to:[to], subject, text:body, reply_to:senderEmail, headers:{'List-Unsubscribe':`<${unsubUrl}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'} }),
  });
  const data: any = await res.json();
  if (!res.ok) { console.error('Resend:', JSON.stringify(data)); return null; }
  return data?.id || null;
}

// ═══════════════════════════════════════════════════════════════
//  CAMPAIGNS
// ═══════════════════════════════════════════════════════════════

async function listCampaigns(req: Request, env: Env, orgId: string): Promise<Response> {
  const { results } = await env.DB.prepare('SELECT * FROM campaigns WHERE org_id=? ORDER BY created_at DESC').bind(orgId).all();
  return ok(results, 200, req, env);
}
async function createCampaign(req: Request, env: Env, orgId: string, userId: string): Promise<Response> {
  const body: any = await req.json().catch(() => ({}));
  if (!body.name?.trim()) return fail('name required', 422, req, env);
  const row = await env.DB.prepare('INSERT INTO campaigns (org_id,name,template_id,keyword,location,created_by) VALUES (?,?,?,?,?,?) RETURNING *').bind(orgId, body.name.trim(), body.template_id||null, body.keyword||null, body.location||null, userId).first();
  return ok(row, 201, req, env);
}
async function updateCampaign(req: Request, env: Env, orgId: string, id: number): Promise<Response> {
  const body: any = await req.json().catch(() => ({}));
  const allowed   = ['name','status','template_id','keyword','location'];
  const updates   = Object.entries(body).filter(([k])=>allowed.includes(k));
  if (!updates.length) return fail('no valid fields', 422, req, env);
  const set = updates.map(([k])=>`${k}=?`).join(', ');
  const row = await env.DB.prepare(`UPDATE campaigns SET ${set}, updated_at=datetime('now') WHERE id=? AND org_id=? RETURNING *`).bind(...updates.map(([,v])=>v), id, orgId).first();
  return ok(row, 200, req, env);
}
async function launchCampaign(req: Request, env: Env, ctx: ExecutionContext, orgId: string, id: number): Promise<Response> {
  const campaign: any = await env.DB.prepare('SELECT * FROM campaigns WHERE id=? AND org_id=?').bind(id, orgId).first();
  if (!campaign) return fail('campaign not found', 404, req, env);
  if (!campaign.template_id) return fail('assign a template first', 422, req, env);
  const template: any = await env.DB.prepare("SELECT * FROM templates WHERE id=? AND (org_id=? OR org_id='system')").bind(campaign.template_id, orgId).first();
  if (!template) return fail('template not found', 404, req, env);
  const config: any   = await env.DB.prepare('SELECT * FROM automation_config WHERE org_id=?').bind(orgId).first();
  if (!config?.sender_email) return fail('Set your sender email in Automation settings first', 422, req, env);
  await env.DB.prepare("UPDATE campaigns SET status='active', updated_at=datetime('now') WHERE id=?").bind(id).run();
  ctx.waitUntil(executeCampaign(env, orgId, campaign, template, config));
  return ok({ ok:true, message:'Launched! Emails will send at a safe pace.' }, 202, req, env);
}
async function executeCampaign(env: Env, orgId: string, campaign: any, template: any, config: any) {
  const limit   = config?.daily_email_limit || 30;
  const delayMs = (config?.email_delay_min || 5) * 60 * 1000;

  // First: try to enrich any leads that have websites but no email yet
  const { results: unenriched } = await env.DB.prepare(
    "SELECT * FROM leads WHERE org_id=? AND website IS NOT NULL AND email IS NULL AND status='new' LIMIT 30"
  ).bind(orgId).all();
  for (const lead of unenriched as any[]) {
    await enrichLead(env, lead);
    await sleep(300);
  }

  // Now fetch leads that have emails (after enrichment attempt)
  const { results: leads } = await env.DB.prepare(
    "SELECT * FROM leads WHERE org_id=? AND email IS NOT NULL AND status='new' AND email NOT IN (SELECT email FROM suppressed WHERE org_id=?) AND NOT EXISTS (SELECT 1 FROM outreach o WHERE o.lead_id=leads.id AND o.campaign_id=?) ORDER BY CASE email_status WHEN 'verified' THEN 1 WHEN 'catch_all' THEN 2 ELSE 3 END, rating DESC NULLS LAST LIMIT ?"
  ).bind(orgId, orgId, campaign.id, limit).all();

  if (leads.length === 0) {
    console.log(`Campaign ${campaign.id}: no leads with emails found after enrichment`);
    await env.DB.prepare("UPDATE campaigns SET status='completed', updated_at=datetime('now') WHERE id=?").bind(campaign.id).run();
    return;
  }

  let sent = 0;
  for (const lead of leads as any[]) {
    try {
      const { subject, body } = await generateEmail(env, lead, template, config);
      const msgId = await sendEmail(env, (lead as any).email, subject, body, config.sender_email, config.sender_name||'');
      if (!msgId) {
        console.error(`Failed to send email to lead ${(lead as any).id}`);
        continue;
      }
      await env.DB.batch([
        env.DB.prepare('INSERT INTO outreach (org_id,lead_id,campaign_id,template_id,subject,body,message_id) VALUES (?,?,?,?,?,?,?)').bind(orgId,(lead as any).id,campaign.id,template.id,subject,body,msgId),
        env.DB.prepare("UPDATE leads SET status='contacted', updated_at=datetime('now') WHERE id=?").bind((lead as any).id),
        env.DB.prepare("UPDATE campaigns SET sent_count=sent_count+1, updated_at=datetime('now') WHERE id=?").bind(campaign.id),
      ]);
      sent++;
      // Small gap between sends — enough to avoid burst, not enough to kill the Worker
      await sleep(500);
    } catch(e:any) { console.error('Campaign send error:', e.message); }
  }
  await env.DB.prepare("UPDATE campaigns SET status='completed', updated_at=datetime('now') WHERE id=?").bind(campaign.id).run();
  console.log(`Campaign ${campaign.id} complete. Sent ${sent}/${leads.length} emails.`);
}

// ═══════════════════════════════════════════════════════════════
//  WHATSAPP OUTREACH (Twilio)
//  Free: Twilio sandbox gives ~1,000 free messages for testing
//  Production: ~$0.005/message via Twilio WhatsApp Business API
// ═══════════════════════════════════════════════════════════════

async function sendWhatsApp(env: Env, to: string, body: string): Promise<string | null> {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_WHATSAPP_FROM) {
    console.warn('Twilio not configured');
    return null;
  }
  // Ensure number is in whatsapp: format
  const toFormatted = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)}`,
        'Content-Type':  'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        From: env.TWILIO_WHATSAPP_FROM,
        To:   toFormatted,
        Body: body,
      }),
    }
  );
  const data: any = await res.json();
  if (!res.ok) { console.error('Twilio error:', JSON.stringify(data)); return null; }
  return data?.sid || null;
}

async function launchWhatsAppCampaign(req: Request, env: Env, ctx: ExecutionContext, orgId: string, id: number): Promise<Response> {
  const campaign: any = await env.DB.prepare('SELECT * FROM campaigns WHERE id=? AND org_id=?').bind(id, orgId).first();
  if (!campaign) return fail('campaign not found', 404, req, env);
  if (!campaign.template_id) return fail('assign a template first', 422, req, env);
  const template: any = await env.DB.prepare("SELECT * FROM templates WHERE id=? AND (org_id=? OR org_id='system')").bind(campaign.template_id, orgId).first();
  if (!template) return fail('template not found', 404, req, env);
  const config: any = await env.DB.prepare('SELECT * FROM automation_config WHERE org_id=?').bind(orgId).first();

  if (!env.TWILIO_ACCOUNT_SID) return fail('Twilio not configured. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_WHATSAPP_FROM secrets.', 422, req, env);

  await env.DB.prepare("UPDATE campaigns SET status='active', updated_at=datetime('now') WHERE id=?").bind(id).run();
  ctx.waitUntil(executeWhatsAppCampaign(env, orgId, campaign, template, config));
  return ok({ ok: true, message: 'WhatsApp campaign launched! Messages will send at a safe pace.' }, 202, req, env);
}

async function executeWhatsAppCampaign(env: Env, orgId: string, campaign: any, template: any, config: any) {
  const limit   = config?.daily_email_limit || 30; // reuse daily limit setting
  const delayMs = (config?.email_delay_min || 2) * 60 * 1000;
  const senderName = config?.sender_name || 'The Team';

  // Get leads with phone numbers that haven't been WhatsApp-contacted in this campaign
  const { results: leads } = await env.DB.prepare(
    "SELECT * FROM leads WHERE org_id=? AND phone IS NOT NULL AND status='new' AND NOT EXISTS (SELECT 1 FROM outreach o WHERE o.lead_id=leads.id AND o.campaign_id=?) ORDER BY rating DESC NULLS LAST LIMIT ?"
  ).bind(orgId, campaign.id, limit).all();

  if (leads.length === 0) {
    await env.DB.prepare("UPDATE campaigns SET status='completed', updated_at=datetime('now') WHERE id=?").bind(campaign.id).run();
    return;
  }

  let sent = 0;
  for (const lead of leads as any[]) {
    try {
      // Format phone — ensure it has country code
      let phone = (lead.phone || '').replace(/[\s\-\(\)]/g, '');
      if (phone.startsWith('0')) phone = '+254' + phone.slice(1); // Kenya default
      if (!phone.startsWith('+')) phone = '+' + phone;

      const { body } = interpolate(template, lead, senderName);
      const msgId = await sendWhatsApp(env, phone, body);
      if (!msgId) continue;

      await env.DB.batch([
        env.DB.prepare('INSERT INTO outreach (org_id,lead_id,campaign_id,template_id,subject,body,message_id) VALUES (?,?,?,?,?,?,?)').bind(orgId, lead.id, campaign.id, template.id, 'WhatsApp', body, msgId),
        env.DB.prepare("UPDATE leads SET status='contacted', updated_at=datetime('now') WHERE id=?").bind(lead.id),
        env.DB.prepare("UPDATE campaigns SET sent_count=sent_count+1, updated_at=datetime('now') WHERE id=?").bind(campaign.id),
      ]);
      sent++;
      await sleep(500);
    } catch(e:any) { console.error('WhatsApp send error:', e.message); }
  }
  await env.DB.prepare("UPDATE campaigns SET status='completed', updated_at=datetime('now') WHERE id=?").bind(campaign.id).run();
  console.log(`WhatsApp campaign ${campaign.id} complete. Sent ${sent} messages.`);
}

// ═══════════════════════════════════════════════════════════════
//  TEMPLATES
// ═══════════════════════════════════════════════════════════════
async function listTemplates(req: Request, env: Env, orgId: string): Promise<Response> {
  const { results } = await env.DB.prepare("SELECT * FROM templates WHERE org_id=? OR org_id='system' ORDER BY id ASC").bind(orgId).all();
  return ok(results, 200, req, env);
}
async function createTemplate(req: Request, env: Env, orgId: string): Promise<Response> {
  const body: any = await req.json().catch(() => ({}));
  if (!body.name||!body.subject||!body.body) return fail('name, subject, body required', 422, req, env);
  const row = await env.DB.prepare('INSERT INTO templates (org_id,name,subject,body,category) VALUES (?,?,?,?,?) RETURNING *').bind(orgId, body.name.trim(), body.subject.trim(), body.body.trim(), body.category||'Cold Outreach').first();
  return ok(row, 201, req, env);
}
async function deleteTemplate(req: Request, env: Env, orgId: string, id: number): Promise<Response> {
  const info = await env.DB.prepare('DELETE FROM templates WHERE id=? AND org_id=?').bind(id, orgId).run();
  if (!info.meta.changes) return fail('not found or system template', 404, req, env);
  return new Response(null, { status: 204, headers: getCorsHeaders(req, env) });
}

// ═══════════════════════════════════════════════════════════════
//  AUTOMATION CONFIG
// ═══════════════════════════════════════════════════════════════
async function getAutomation(req: Request, env: Env, orgId: string): Promise<Response> {
  const row = await env.DB.prepare('SELECT * FROM automation_config WHERE org_id=?').bind(orgId).first();
  return ok(row, 200, req, env);
}
async function saveAutomation(req: Request, env: Env, orgId: string): Promise<Response> {
  const body: any  = await req.json().catch(() => ({}));
  const allowed    = ['scraping_enabled','email_enabled','schedule_enabled','keywords','location','max_leads_per_run','daily_email_limit','email_delay_min','sender_email','sender_name','ai_tone','use_ai'];
  const updates    = Object.entries(body).filter(([k])=>allowed.includes(k));
  if (!updates.length) return fail('no valid fields', 422, req, env);
  const set = updates.map(([k])=>`${k}=?`).join(', ');
  const row = await env.DB.prepare(`UPDATE automation_config SET ${set}, updated_at=datetime('now') WHERE org_id=? RETURNING *`).bind(...updates.map(([,v])=>v), orgId).first();
  return ok(row, 200, req, env);
}

// ═══════════════════════════════════════════════════════════════
//  WEEKLY ACTIVITY STATS (real data — last 7 days)
// ═══════════════════════════════════════════════════════════════

async function getWeeklyStats(req: Request, env: Env, orgId: string): Promise<Response> {
  // Build last 7 days array
  const days: { date: string; name: string }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push({
      date: d.toISOString().slice(0, 10),
      name: d.toLocaleDateString('en-US', { weekday: 'short' }),
    });
  }

  // Leads created per day
  const { results: leadsRows } = await env.DB.prepare(
    `SELECT DATE(created_at) as day, COUNT(*) as count
     FROM leads WHERE org_id=? AND created_at >= DATE('now', '-6 days')
     GROUP BY day`
  ).bind(orgId).all();

  // Emails sent per day
  const { results: emailRows } = await env.DB.prepare(
    `SELECT DATE(sent_at) as day, COUNT(*) as count
     FROM outreach WHERE org_id=? AND sent_at >= DATE('now', '-6 days')
     GROUP BY day`
  ).bind(orgId).all();

  // Replies per day (leads that moved to 'replied' status — approximated by outreach opened_at)
  const { results: replyRows } = await env.DB.prepare(
    `SELECT DATE(opened_at) as day, COUNT(*) as count
     FROM outreach WHERE org_id=? AND opened_at IS NOT NULL AND opened_at >= DATE('now', '-6 days')
     GROUP BY day`
  ).bind(orgId).all();

  const leadsMap   = Object.fromEntries((leadsRows as any[]).map(r => [r.day, r.count]));
  const emailsMap  = Object.fromEntries((emailRows as any[]).map(r => [r.day, r.count]));
  const repliesMap = Object.fromEntries((replyRows as any[]).map(r => [r.day, r.count]));

  const weekly = days.map(({ date, name }) => ({
    name,
    leads:   leadsMap[date]   ?? 0,
    emails:  emailsMap[date]  ?? 0,
    replies: repliesMap[date] ?? 0,
  }));

  return ok(weekly, 200, req, env);
}

// ═══════════════════════════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════════════════════════
async function getStats(req: Request, env: Env, orgId: string): Promise<Response> {
  const [total, replied, meeting, closed, sent, bounced, org] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) as c FROM leads WHERE org_id=?').bind(orgId).first<{c:number}>(),
    env.DB.prepare("SELECT COUNT(*) as c FROM leads WHERE org_id=? AND status='replied'").bind(orgId).first<{c:number}>(),
    env.DB.prepare("SELECT COUNT(*) as c FROM leads WHERE org_id=? AND status='meeting'").bind(orgId).first<{c:number}>(),
    env.DB.prepare("SELECT COUNT(*) as c FROM leads WHERE org_id=? AND status='closed'").bind(orgId).first<{c:number}>(),
    env.DB.prepare('SELECT COUNT(*) as c FROM outreach WHERE org_id=?').bind(orgId).first<{c:number}>(),
    env.DB.prepare('SELECT COUNT(*) as c FROM outreach WHERE org_id=? AND bounced=1').bind(orgId).first<{c:number}>(),
    env.DB.prepare('SELECT credits FROM orgs WHERE id=?').bind(orgId).first<{credits:number}>(),
  ]);
  const t=total?.c??0, s=sent?.c??0, r=(replied?.c??0)+(meeting?.c??0)+(closed?.c??0), cl=closed?.c??0;
  return ok({ totalLeads:t, emailsSent:s, replies:r, replyRate:s>0?+((r/s)*100).toFixed(1):0, conversionRate:t>0?+((cl/t)*100).toFixed(1):0, bounced:bounced?.c??0, credits:org?.credits??0 }, 200, req, env);
}
async function getPipeline(req: Request, env: Env, orgId: string): Promise<Response> {
  const { results } = await env.DB.prepare("SELECT status, COUNT(*) as count FROM leads WHERE org_id=? GROUP BY status ORDER BY CASE status WHEN 'new' THEN 1 WHEN 'contacted' THEN 2 WHEN 'replied' THEN 3 WHEN 'meeting' THEN 4 WHEN 'closed' THEN 5 ELSE 6 END").bind(orgId).all();
  return ok(results, 200, req, env);
}
async function getRecentLeads(req: Request, env: Env, orgId: string): Promise<Response> {
  const { results } = await env.DB.prepare('SELECT * FROM leads WHERE org_id=? ORDER BY created_at DESC LIMIT 10').bind(orgId).all();
  return ok(results, 200, req, env);
}

// ═══════════════════════════════════════════════════════════════
//  DAILY CRON PIPELINE
// ═══════════════════════════════════════════════════════════════
async function runDailyPipeline(env: Env) {
  const { results: orgs } = await env.DB.prepare("SELECT o.id, a.* FROM orgs o JOIN automation_config a ON a.org_id=o.id WHERE (a.scraping_enabled=1 OR a.email_enabled=1) AND a.schedule_enabled=1").all();
  for (const cfg of orgs as any[]) {
    try { await runOrgPipeline(env, cfg.id, cfg); } catch(e:any) { console.error(`Org ${cfg.id}:`, e.message); }
  }
}
async function runOrgPipeline(env: Env, orgId: string, config: any) {
  if (config.scraping_enabled) {
    const org: any = await env.DB.prepare('SELECT credits FROM orgs WHERE id=?').bind(orgId).first();
    if (org && org.credits > 0) {
      for (const kw of (config.keywords||'restaurants').split(',').map((k:string)=>k.trim())) {
        const job: any = await env.DB.prepare('INSERT INTO scrape_jobs (org_id,keyword,location,status) VALUES (?,?,?,?) RETURNING id').bind(orgId, kw, config.location, 'running').first();
        await runScrapeJob(env, orgId, job.id, kw, config.location, config.max_leads_per_run||20);
        await sleep(2000);
      }
    }
  }
  if (config.email_enabled) {
    const { results } = await env.DB.prepare("SELECT * FROM leads WHERE org_id=? AND website IS NOT NULL AND (email IS NULL OR email_status='unknown') AND status='new' LIMIT 50").bind(orgId).all();
    for (const lead of results as any[]) { await enrichLead(env, lead); await sleep(400); }
  }
  if (config.email_enabled && config.sender_email) {
    const template: any = await env.DB.prepare('SELECT * FROM templates WHERE org_id=? ORDER BY id LIMIT 1').bind(orgId).first();
    if (!template) return;
    const { results } = await env.DB.prepare("SELECT * FROM leads WHERE org_id=? AND email IS NOT NULL AND email_status IN ('verified','catch_all') AND status='new' AND email NOT IN (SELECT email FROM suppressed WHERE org_id=?) ORDER BY email_status DESC, rating DESC NULLS LAST LIMIT ?").bind(orgId, orgId, config.daily_email_limit||30).all();
    let sent = 0;
    for (const lead of results as any[]) {
      const { subject, body } = await generateEmail(env, lead, template, config);
      const msgId = await sendEmail(env, (lead as any).email, subject, body, config.sender_email, config.sender_name||'');
      if (msgId) {
        await env.DB.batch([
          env.DB.prepare('INSERT INTO outreach (org_id,lead_id,template_id,subject,body,message_id) VALUES (?,?,?,?,?,?)').bind(orgId,(lead as any).id,template.id,subject,body,msgId),
          env.DB.prepare("UPDATE leads SET status='contacted', updated_at=datetime('now') WHERE id=?").bind((lead as any).id),
        ]);
        sent++;
        if (sent < results.length) await sleep((config.email_delay_min||5)*60*1000);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  LEADFORGE AGENT OUTREACH ENDPOINTS
//  Called directly by the executor_agent tool
// ═══════════════════════════════════════════════════════════════

async function agentSendEmail(req: Request, env: Env, orgId: string): Promise<Response> {
  const body: any = await req.json().catch(() => ({}));
  const { to, subject, body: emailBody, sender_email, sender_name, lead_id } = body;
  if (!to || !subject || !emailBody) return fail('to, subject, body required', 422, req, env);

  const senderEmail = sender_email || env.SENDER_EMAIL;
  const senderName  = sender_name  || env.SENDER_NAME;

  if (!senderEmail) return fail('Configure sender_email in Automation settings or provide it in the request', 422, req, env);

  const msgId = await sendEmail(env, to, subject, emailBody, senderEmail, senderName);
  if (!msgId) return fail('Email send failed — check RESEND_API_KEY and sender domain', 500, req, env);

  // Log to outreach table if lead_id provided
  if (lead_id) {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO outreach (org_id,lead_id,subject,body,message_id) VALUES (?,?,?,?,?)').bind(orgId, lead_id, subject, emailBody, msgId),
      env.DB.prepare("UPDATE leads SET status='contacted', updated_at=datetime('now') WHERE id=? AND org_id=?").bind(lead_id, orgId),
    ]);
  }

  return ok({ ok: true, message_id: msgId }, 200, req, env);
}

async function agentSendWhatsApp(req: Request, env: Env, orgId: string): Promise<Response> {
  const body: any = await req.json().catch(() => ({}));
  const { phone, message, lead_id } = body;
  if (!phone || !message) return fail('phone and message required', 422, req, env);

  const msgId = await sendWhatsApp(env, phone, message);
  if (!msgId) return fail('WhatsApp send failed — check TWILIO secrets', 500, req, env);

  if (lead_id) {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO outreach (org_id,lead_id,subject,body,message_id) VALUES (?,?,?,?,?)").bind(orgId, lead_id, 'WhatsApp', message, msgId),
      env.DB.prepare("UPDATE leads SET status='contacted', updated_at=datetime('now') WHERE id=? AND org_id=?").bind(lead_id, orgId),
    ]);
  }

  return ok({ ok: true, sid: msgId }, 200, req, env);
}

// ═══════════════════════════════════════════════════════════════
//  WEBHOOKS & COMPLIANCE
// ═══════════════════════════════════════════════════════════════
async function handleResendWebhook(req: Request, env: Env): Promise<Response> {
  const body: any = await req.json().catch(() => ({}));
  const msgId = body?.data?.email_id;
  if (!msgId) return ok({ ok:true }, 200, req, env);
  const o: any = await env.DB.prepare('SELECT * FROM outreach WHERE message_id=?').bind(msgId).first();
  if (!o) return ok({ ok:true }, 200, req, env);
  if (body.type === 'email.opened') {
    await env.DB.prepare("UPDATE outreach SET opened_at=datetime('now') WHERE message_id=?").bind(msgId).run();
    if (o.campaign_id) await env.DB.prepare('UPDATE campaigns SET opened_count=opened_count+1 WHERE id=?').bind(o.campaign_id).run();
  }
  if (body.type === 'email.bounced' || body.type === 'email.complained') {
    const lead: any = await env.DB.prepare('SELECT email FROM leads WHERE id=?').bind(o.lead_id).first();
    if (lead?.email) await env.DB.prepare('INSERT OR IGNORE INTO suppressed (org_id,email,reason) VALUES (?,?,?)').bind(o.org_id, lead.email, body.type==='email.complained'?'complaint':'bounce').run();
    await env.DB.prepare("UPDATE leads SET status=?, email_status='invalid', updated_at=datetime('now') WHERE id=?").bind(body.type==='email.complained'?'unsubscribed':'bounced', o.lead_id).run();
    await env.DB.prepare('UPDATE outreach SET bounced=1 WHERE message_id=?').bind(msgId).run();
    if (o.campaign_id) await env.DB.prepare('UPDATE campaigns SET bounced_count=bounced_count+1 WHERE id=?').bind(o.campaign_id).run();
  }
  return ok({ ok:true }, 200, req, env);
}
async function handleUnsubscribe(req: Request, env: Env): Promise<Response> {
  const email = new URL(req.url).searchParams.get('email');
  if (!email) return new Response('Missing email', { status: 400 });
  const lead: any = await env.DB.prepare('SELECT org_id FROM leads WHERE email=? LIMIT 1').bind(email).first();
  if (lead?.org_id) {
    await env.DB.prepare("INSERT OR IGNORE INTO suppressed (org_id,email,reason) VALUES (?,?,'unsubscribe')").bind(lead.org_id, email).run();
    await env.DB.prepare("UPDATE leads SET status='unsubscribed', updated_at=datetime('now') WHERE email=? AND org_id=?").bind(email, lead.org_id).run();
  }
  return new Response('You have been unsubscribed.', { headers: { 'Content-Type': 'text/plain' } });
}

// ═══════════════════════════════════════════════════════════════
//  PAYSTACK PAYMENT INTEGRATION
//  Flow:
//   1. Frontend calls POST /api/payments/initialize with pkg_id
//   2. Worker creates Paystack transaction → returns access_code
//   3. Frontend shows Paystack Popup with access_code
//   4. On success Paystack redirects to callback_url with ?reference=xxx
//   5. Frontend calls GET /api/payments/verify?reference=xxx
//   6. Worker verifies with Paystack → credits org
//   7. Paystack also fires charge.success webhook as backup
// ═══════════════════════════════════════════════════════════════

async function paystackInitialize(req: Request, env: Env): Promise<Response> {
  // Can be called authenticated or with just email (for logged-in users via Bearer)
  let orgId: string | null = null;
  let userEmail: string | null = null;

  // Try to get auth from Bearer token first
  const authHeader = req.headers.get('Authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    const payload = await verifyJWT(authHeader.slice(7), env.JWT_SECRET);
    if (payload) {
      orgId = payload.org;
      const user: any = await env.DB.prepare('SELECT email FROM users WHERE id=?').bind(payload.sub).first();
      userEmail = user?.email || null;
    }
  }

  const body: any = await req.json().catch(() => ({}));
  const pkgId = body.package_id;
  if (!pkgId) return fail('package_id required', 422, req, env);

  // Get package details
  const pkg: any = await env.DB.prepare('SELECT * FROM credit_packages WHERE id=?').bind(pkgId).first();
  if (!pkg) return fail('Package not found', 404, req, env);

  // Use email from body if provided (for non-authenticated or backup)
  const email = userEmail || body.email;
  if (!email) return fail('email required', 422, req, env);

  // Generate a unique reference: le_{orgId}_{pkgId}_{timestamp}
  const reference = `le_${orgId || 'guest'}_pkg${pkgId}_${Date.now()}`;

  // Initialize Paystack transaction (server-side — secret key never leaves backend)
  const paystackRes = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      amount:    pkg.price_usd,  // price_usd is already in kobo/cents (e.g. 999 = KSh 9.99)
      currency:  'KES',          // Kenya Shillings — change to NGN, GHS, ZAR etc as needed
      reference,
      metadata: {
        org_id:   orgId,
        pkg_id:   pkgId,
        credits:  pkg.credits,
        pkg_name: pkg.name,
        custom_fields: [
          { display_name: 'Credits', variable_name: 'credits', value: String(pkg.credits) },
          { display_name: 'Package', variable_name: 'package', value: pkg.name },
        ],
      },
      callback_url: `${env.FRONTEND_URL}/payment/callback`,
    }),
  });

  const paystackData: any = await paystackRes.json();
  if (!paystackRes.ok || !paystackData.status) {
    console.error('Paystack init failed:', JSON.stringify(paystackData));
    return fail(paystackData?.message || 'Payment initialization failed', 500, req, env);
  }

  return ok({
    accessCode:       paystackData.data.access_code,
    authorizationUrl: paystackData.data.authorization_url,
    reference:        paystackData.data.reference,
    amount:           pkg.price_usd,
    currency:         'KES',
    packageName:      pkg.name,
    credits:          pkg.credits,
  }, 200, req, env);
}

async function paystackVerify(req: Request, env: Env): Promise<Response> {
  const reference = new URL(req.url).searchParams.get('reference');
  if (!reference) return fail('reference required', 422, req, env);

  // Verify with Paystack
  const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { 'Authorization': `Bearer ${env.PAYSTACK_SECRET_KEY}` },
  });
  const verifyData: any = await verifyRes.json();

  if (!verifyRes.ok || verifyData.data?.status !== 'success') {
    return fail(verifyData?.message || 'Payment not successful', 402, req, env);
  }

  const tx = verifyData.data;
  const meta = tx.metadata || {};
  const orgId   = meta.org_id;
  const credits  = parseInt(meta.credits) || 0;
  const pkgId    = meta.pkg_id;
  const pkgName  = meta.pkg_name || 'Credit Pack';

  if (!orgId || !credits) return fail('Invalid transaction metadata', 400, req, env);

  // Idempotency — check if we already processed this reference
  const existing = await env.DB.prepare(
    "SELECT id FROM credit_txns WHERE ref_id=?"
  ).bind(reference).first();

  if (existing) {
    // Already credited — return success idempotently
    const org: any = await env.DB.prepare('SELECT credits FROM orgs WHERE id=?').bind(orgId).first();
    return ok({ ok: true, alreadyProcessed: true, credits: org?.credits ?? 0 }, 200, req, env);
  }

  // Credit the org
  await env.DB.batch([
    env.DB.prepare('UPDATE orgs SET credits=credits+? WHERE id=?').bind(credits, orgId),
    env.DB.prepare('INSERT INTO credit_txns (org_id,delta,reason,ref_id) VALUES (?,?,?,?)')
      .bind(orgId, credits, `purchase:${pkgName}`, reference),
  ]);

  const org: any = await env.DB.prepare('SELECT credits FROM orgs WHERE id=?').bind(orgId).first();
  return ok({ ok: true, credits: org?.credits ?? 0, added: credits }, 200, req, env);
}

async function paystackWebhook(req: Request, env: Env): Promise<Response> {
  // Verify signature — HMAC SHA512 of raw body using secret key
  const signature = req.headers.get('x-paystack-signature') || '';
  const rawBody   = await req.text();

  const key  = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(env.PAYSTACK_SECRET_KEY),
    { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']
  );
  const sig  = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const hash = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2,'0')).join('');

  if (hash !== signature) {
    console.error('Invalid Paystack webhook signature');
    return new Response('Unauthorized', { status: 401 });
  }

  let body: any;
  try { body = JSON.parse(rawBody); } catch { return new Response('Bad JSON', { status: 400 }); }

  // Only handle successful charges
  if (body.event !== 'charge.success') return new Response('OK', { status: 200 });

  const tx   = body.data;
  const meta = tx.metadata || {};
  const reference = tx.reference;
  const orgId     = meta.org_id;
  const credits   = parseInt(meta.credits) || 0;
  const pkgName   = meta.pkg_name || 'Credit Pack';

  if (!orgId || !credits || !reference) return new Response('OK', { status: 200 });

  // Idempotency check
  const existing = await env.DB.prepare("SELECT id FROM credit_txns WHERE ref_id=?").bind(reference).first();
  if (existing) return new Response('OK', { status: 200 });

  // Credit the org
  await env.DB.batch([
    env.DB.prepare('UPDATE orgs SET credits=credits+? WHERE id=?').bind(credits, orgId),
    env.DB.prepare('INSERT INTO credit_txns (org_id,delta,reason,ref_id) VALUES (?,?,?,?)')
      .bind(orgId, credits, `purchase:${pkgName}`, reference),
  ]);

  console.log(`Paystack webhook: credited ${credits} to org ${orgId} (ref: ${reference})`);
  return new Response('OK', { status: 200 });
}

// ═══════════════════════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════════════════════
function extractDomain(url: string): string|null {
  try { return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, ''); }
  catch { return null; }
}
function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }
