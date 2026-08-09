// Couche d'authentification et d'autorisation du serveur.
//
// Objectif : la clé serveur Supabase (secret ou service_role historique) ne doit JAMAIS être exploitable
// depuis le navigateur. Toutes les routes de données exigent désormais un jeton
// de session (JWT HS256 signé côté serveur) qui transporte l'identité vérifiée
// de l'utilisateur : user_id, company_id et role. Le NIP n'est plus validé dans
// le navigateur : il est vérifié ici, côté serveur, contre la base de données.
//
// NOTE ARCHITECTURE : ce module implémente des sessions JWT signées par le
// serveur (SESSION_SECRET). La cible long terme reste Supabase Auth (comptes
// avec courriel + RLS par jeton Supabase) — voir SECURITY.md. En attendant,
// aucune requête de données n'est servie sans identité vérifiée.
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import type express from 'express';
import { resolveCompanyId, supabase, supabaseEnabled } from './db.js';

export type AppRole = 'admin' | 'secretary' | 'accountant' | 'employee';

export interface AuthContext {
  userId: string;
  companyId: string;
  role: AppRole;
  name: string;
}

// Rôles hérités de l'ancienne version de l'app encore présents en base
const LEGACY_ROLE_MAP: Record<string, AppRole> = {
  admin: 'admin', owner: 'admin',
  secretary: 'secretary', accountant: 'accountant',
  employee: 'employee', subcontractor: 'employee'
};

export function normalizeRole(role: string | null | undefined): AppRole {
  return LEGACY_ROLE_MAP[String(role || '').toLowerCase()] || 'employee';
}

// ---------------------------------------------------------------------------
// Secret de session
// ---------------------------------------------------------------------------
// SESSION_SECRET doit être défini dans les variables d'environnement (Vercel).
// En production, démarrer sans secret stable rendrait les sessions incohérentes
// entre les instances serverless. On échoue donc explicitement au lieu de créer
// silencieusement un secret différent sur chaque instance.
const SESSION_SECRET: string = (() => {
  const fromEnv = process.env.SESSION_SECRET;
  if (fromEnv && fromEnv.trim().length >= 32) return fromEnv.trim();
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET doit contenir au moins 32 caractères en production');
  }
  const ephemeral = crypto.randomBytes(32).toString('hex');
  if (supabaseEnabled) {
    console.warn('[auth] SESSION_SECRET manquant : secret éphémère généré. ' +
      'Définissez SESSION_SECRET dans les variables d’environnement pour des sessions stables en production.');
  }
  return ephemeral;
})();

const SESSION_TTL_SECONDS = 4 * 60 * 60; // 4 h
export const SESSION_COOKIE_NAME = 'gcp_session';

// ---------------------------------------------------------------------------
// JWT HS256 minimal (crypto natif Node — aucune dépendance supplémentaire)
// ---------------------------------------------------------------------------
const b64url = (buf: Buffer | string) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const b64urlJson = (obj: unknown) => b64url(JSON.stringify(obj));

function hmac(data: string): string {
  return b64url(crypto.createHmac('sha256', SESSION_SECRET).update(data).digest());
}

// Référence opaque utilisée par l'annuaire public. Elle est stable pour le
// couple compagnie/utilisateur, mais ne révèle aucun UUID de la base.
export function createLoginHandle(companyId: string, userId: string): string {
  return hmac(`directory-login|${companyId}|${userId}`);
}

export function signSession(ctx: AuthContext): { token: string; expiresAt: number } {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + SESSION_TTL_SECONDS;
  const header = b64urlJson({ alg: 'HS256', typ: 'JWT' });
  const payload = b64urlJson({
    sub: ctx.userId,
    company_id: ctx.companyId,
    role: ctx.role,
    name: ctx.name,
    iat: now,
    exp
  });
  const signature = hmac(`${header}.${payload}`);
  return { token: `${header}.${payload}.${signature}`, expiresAt: exp * 1000 };
}

export function verifySession(token: string): AuthContext | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  const expected = hmac(`${header}.${payload}`);
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    if (!data.sub || !data.company_id || !data.exp) return null;
    if (Math.floor(Date.now() / 1000) >= data.exp) return null;
    return {
      userId: String(data.sub),
      companyId: String(data.company_id),
      role: normalizeRole(data.role),
      name: String(data.name || '')
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Limitation des tentatives de connexion (anti force brute sur les NIP)
// ---------------------------------------------------------------------------
// La table auth_login_attempts est partagée entre toutes les instances Vercel.
// Le Map local reste uniquement un filet de sécurité lorsque Supabase est
// indisponible; il n'est jamais considéré comme la protection principale.
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const loginAttempts = new Map<string, { count: number; firstAt: number }>();

const throttleHash = (key: string) =>
  crypto.createHash('sha256').update(`${SESSION_SECRET}|${key}`).digest('hex');

function isMemoryLoginThrottled(key: string): boolean {
  const entry = loginAttempts.get(key);
  if (!entry) return false;
  if (Date.now() - entry.firstAt > LOGIN_WINDOW_MS) {
    loginAttempts.delete(key);
    return false;
  }
  return entry.count >= LOGIN_MAX_ATTEMPTS;
}

function recordMemoryLoginFailure(key: string): void {
  const entry = loginAttempts.get(key);
  if (!entry || Date.now() - entry.firstAt > LOGIN_WINDOW_MS) {
    loginAttempts.set(key, { count: 1, firstAt: Date.now() });
  } else {
    entry.count += 1;
  }
}

function clearMemoryLoginFailures(key: string): void {
  loginAttempts.delete(key);
}

export async function isLoginThrottled(key: string): Promise<boolean> {
  if (!supabaseEnabled || !supabase) return isMemoryLoginThrottled(key);
  try {
    const { data, error } = await supabase
      .from('auth_login_attempts')
      .select('failure_count, first_failed_at, blocked_until')
      .eq('key_hash', throttleHash(key))
      .maybeSingle();
    if (error) throw error;
    if (!data) return false;
    const blockedUntil = data.blocked_until ? new Date(data.blocked_until).getTime() : 0;
    if (blockedUntil > Date.now()) return true;
    const firstAt = data.first_failed_at ? new Date(data.first_failed_at).getTime() : 0;
    return firstAt > Date.now() - LOGIN_WINDOW_MS && Number(data.failure_count || 0) >= LOGIN_MAX_ATTEMPTS;
  } catch (error: any) {
    console.error('[auth] throttle partagé indisponible :', error?.message || error);
    return isMemoryLoginThrottled(key);
  }
}

export async function recordLoginFailure(key: string): Promise<void> {
  recordMemoryLoginFailure(key);
  if (!supabaseEnabled || !supabase) return;
  try {
    // La fonction SQL verrouille la ligne et incrémente atomiquement : deux
    // instances Vercel concurrentes ne peuvent pas perdre une tentative.
    const { error } = await supabase.rpc('record_auth_login_failure', {
      p_key_hash: throttleHash(key),
      p_window_seconds: Math.floor(LOGIN_WINDOW_MS / 1000),
      p_max_attempts: LOGIN_MAX_ATTEMPTS
    });
    if (error) throw error;
  } catch (error: any) {
    console.error('[auth] échec de mise à jour du throttle partagé :', error?.message || error);
  }
}

export async function clearLoginFailures(key: string): Promise<void> {
  clearMemoryLoginFailures(key);
  if (!supabaseEnabled || !supabase) return;
  try {
    const { error } = await supabase
      .from('auth_login_attempts')
      .delete()
      .eq('key_hash', throttleHash(key));
    if (error) throw error;
  } catch (error: any) {
    console.error('[auth] échec du nettoyage du throttle partagé :', error?.message || error);
  }
}

// ---------------------------------------------------------------------------
// Vérification des identifiants côté serveur (le NIP ne quitte plus la base)
// ---------------------------------------------------------------------------
export interface CredentialCheck {
  ok: boolean;
  ctx?: AuthContext;
  reason?: 'unavailable' | 'invalid' | 'inactive';
}

const PIN_RE = /^\d{4}$/;
const LOGIN_HANDLE_RE = /^[A-Za-z0-9_-]{43}$/;
const BCRYPT_RE = /^\$2[aby]\$/;
const BCRYPT_ROUNDS = 12;

export async function hashPin(pin: string): Promise<string> {
  if (!PIN_RE.test(pin)) throw new Error('Le NIP doit contenir exactement quatre chiffres');
  return bcrypt.hash(pin, BCRYPT_ROUNDS);
}

export async function verifyPin(pin: string, storedHash: string): Promise<{ match: boolean; legacyPlaintext: boolean }> {
  if (!PIN_RE.test(pin) || !storedHash) return { match: false, legacyPlaintext: false };
  if (BCRYPT_RE.test(storedHash)) {
    return { match: await bcrypt.compare(pin, storedHash), legacyPlaintext: false };
  }
  if (!PIN_RE.test(storedHash)) return { match: false, legacyPlaintext: false };
  const candidate = Buffer.from(pin);
  const legacy = Buffer.from(storedHash);
  const match = candidate.length === legacy.length && crypto.timingSafeEqual(candidate, legacy);
  return { match, legacyPlaintext: match };
}

export async function verifyCredentials(loginHandle: string, nip: string): Promise<CredentialCheck> {
  if (!supabaseEnabled || !supabase) return { ok: false, reason: 'unavailable' };
  if (!LOGIN_HANDLE_RE.test(loginHandle) || !PIN_RE.test(nip)) return { ok: false, reason: 'invalid' };

  const companyId = await resolveCompanyId();
  const { data: users, error } = await supabase
    .from('app_users')
    .select('id, full_name, role, company_id, access_code_hash, is_active')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .limit(250);
  const submittedHandle = Buffer.from(loginHandle);
  const user = (users || []).find(candidate => {
    const expectedHandle = Buffer.from(createLoginHandle(companyId, String(candidate.id)));
    return expectedHandle.length === submittedHandle.length && crypto.timingSafeEqual(expectedHandle, submittedHandle);
  });
  if (error || !user) return { ok: false, reason: 'invalid' };
  if (user.is_active === false) return { ok: false, reason: 'inactive' };

  const stored = String(user.access_code_hash || '');
  const verified = await verifyPin(nip, stored);
  if (!verified.match) return { ok: false, reason: 'invalid' };

  // Migration transparente des quatre chiffres historiques : après la première
  // connexion réussie, la valeur en clair n'existe plus dans la base.
  if (verified.legacyPlaintext) {
    const nextHash = await hashPin(nip);
    const { error: migrateError } = await supabase
      .from('app_users')
      .update({ access_code_hash: nextHash })
      .eq('id', user.id)
      .eq('company_id', companyId);
    if (migrateError) throw migrateError;
  }
  return {
    ok: true,
    ctx: {
      userId: String(user.id),
      companyId: String(companyId),
      role: normalizeRole(user.role),
      name: String(user.full_name || '')
    }
  };
}

// ---------------------------------------------------------------------------
// Middleware Express
// ---------------------------------------------------------------------------
export interface AuthedRequest extends express.Request {
  auth?: AuthContext;
}

export function extractAuth(req: express.Request): AuthContext | null {
  const authorization = String(req.headers.authorization || '').trim();
  const bearer = authorization.match(/^Bearer\s+([^\s]+)$/i);
  if (bearer) return verifySession(bearer[1]);

  const cookieHeader = req.headers.cookie || '';
  const cookie = cookieHeader
    .split(';')
    .map(value => value.trim())
    .find(value => value.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (!cookie) return null;
  const token = decodeURIComponent(cookie.slice(SESSION_COOKIE_NAME.length + 1));
  return verifySession(token);
}

// Exige une session valide. Toutes les routes de données passent par ici.
export function requireAuth(req: AuthedRequest, res: express.Response, next: express.NextFunction): void {
  const ctx = extractAuth(req);
  if (!ctx) {
    res.status(401).json({ error: 'authentification requise', code: 'AUTH_REQUIRED' });
    return;
  }
  req.auth = ctx;
  next();
}

// Variante pour /api/chat : identité exigée dès que le cloud est configuré ;
// en mode purement local (Supabase absent), le chat reste accessible mais sans
// aucune action (les tools ne sont jamais proposés sans rôle vérifié).
export function attachAuthOptional(req: AuthedRequest, _res: express.Response, next: express.NextFunction): void {
  const ctx = extractAuth(req);
  if (ctx) req.auth = ctx;
  next();
}

// ---------------------------------------------------------------------------
// Journal d'audit (best effort : ne bloque jamais la requête)
// ---------------------------------------------------------------------------
// Table "audit_logs" — voir supabase_security.sql pour le DDL.
export function logAudit(
  auth: AuthContext | null,
  action: string,
  target: string,
  targetId?: string | null,
  details?: Record<string, unknown>
): void {
  const entry = {
    at: new Date().toISOString(),
    user_id: auth?.userId || null,
    user_name: auth?.name || null,
    role: auth?.role || null,
    company_id: auth?.companyId || null,
    action,
    target,
    target_id: targetId || null,
    details: details || null
  };
  if (supabaseEnabled && supabase) {
    supabase.from('audit_logs').insert(entry).then(({ error }) => {
      if (error) console.warn('[audit] insertion échouée (table audit_logs manquante ?) :', error.message, JSON.stringify(entry));
    });
  } else {
    console.info('[audit]', JSON.stringify(entry));
  }
}
