/**
 * Controle de acesso.
 *
 * Dois modos, escolhidos sozinhos na abertura do app (initCloud):
 *  - Servidor (quando /api/auth/status responde db:true): contas e dados da fazenda ficam no PostgreSQL
 *    do servidor. O navegador guarda uma cópia (cache) para o app abrir rápido e funcionar sem internet;
 *    cada gravação vai para o servidor logo depois (cloudSave).
 *  - Local (modo demonstração, sem servidor): contas e senhas ficam no navegador; a senha é guardada
 *    apenas como hash PBKDF2 (nunca em texto).
 * "Conhecer sem conta" (visitante) é sempre local.
 */
import { estelaBaseUrl } from '../admin/server';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone?: string;
  farmName: string;
  city: string;
  /** Só no modo local */
  salt?: string;
  /** Só no modo local */
  hash?: string;
  createdAt: string;
  consentAt: string;
  /** 'superadmin' libera o painel de administração neste aparelho. Ações no servidor exigem também a senha de administração. */
  role?: 'superadmin';
}

export type AuthErrorKey = 'errRequired' | 'errEmail' | 'errPwShort' | 'errPwMismatch' | 'errConsent' | 'errExists' | 'errBadLogin' | 'errLocked' | 'errCrypto' | 'errOffline' | 'errServer';
export class AuthError extends Error {
  constructor(public key: AuthErrorKey, public seconds = 0) {
    super(key);
  }
}

const USERS_KEY = 'myroca_users_v1';
const SESSION_KEY = 'myroca_session_v1';
const FAIL_KEY = 'myroca_auth_fail_v1';
const ITER = 150000;
const MAX_FAILS = 5;
const LOCK_SECONDS = 60;
const SESSION_DAYS = 30;
export const GUEST_ID = 'guest';

function readJson<T>(storage: Storage, key: string, fallback: T): T {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(storage: Storage, key: string, v: unknown): void {
  try {
    storage.setItem(key, JSON.stringify(v));
  } catch {
    /* ignora */
  }
}

const users = (): UserProfile[] => readJson<UserProfile[]>(localStorage, USERS_KEY, []);

function b64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
}
function unb64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function hashPassword(password: string, salt: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new AuthError('errCrypto');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: ITER }, key, 256);
  return b64(bits);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export interface SignupInput {
  name: string;
  email: string;
  phone?: string;
  farmName: string;
  city: string;
  password: string;
  password2: string;
  consent: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function signup(input: SignupInput, keep: boolean): Promise<UserProfile> {
  if (cloud.on) return cloudSignup(input, keep);
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name || !input.farmName.trim() || !input.city.trim() || !email || !input.password) throw new AuthError('errRequired');
  if (!EMAIL_RE.test(email)) throw new AuthError('errEmail');
  if (input.password.length < 8 || !/[A-Za-z]/.test(input.password) || !/\d/.test(input.password)) throw new AuthError('errPwShort');
  if (input.password !== input.password2) throw new AuthError('errPwMismatch');
  if (!input.consent) throw new AuthError('errConsent');
  const all = users();
  if (all.some((u) => u.email === email)) throw new AuthError('errExists');

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const now = new Date().toISOString();
  const user: UserProfile = {
    id: 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    name,
    email,
    phone: input.phone?.trim() || undefined,
    farmName: input.farmName.trim(),
    city: input.city.trim(),
    salt: b64(salt),
    hash: await hashPassword(input.password, salt),
    createdAt: now,
    consentAt: now,
  };
  // Primeira conta do aparelho: herda os dados que já existiam antes do controle de acesso.
  if (all.length === 0) adoptLegacyData(user.id);
  writeJson(localStorage, USERS_KEY, [...all, user]);
  startSession(user.id, keep);
  return user;
}

export async function login(emailRaw: string, password: string, keep: boolean): Promise<UserProfile> {
  const email = emailRaw.trim().toLowerCase();
  if (!email || !password) throw new AuthError('errRequired');
  if (cloud.on) return cloudLogin(email, password, keep);
  const fails = readJson<Record<string, { n: number; until: number }>>(localStorage, FAIL_KEY, {});
  const f = fails[email];
  if (f && f.until > Date.now()) throw new AuthError('errLocked', Math.ceil((f.until - Date.now()) / 1000));

  const user = users().find((u) => u.email === email);
  // Calcula o hash mesmo se o e-mail não existe, para não revelar quais e-mails têm conta.
  const salt = user?.salt ? unb64(user.salt) : crypto.getRandomValues(new Uint8Array(16));
  const h = await hashPassword(password, salt);
  if (!user || !user.hash || !timingSafeEqual(h, user.hash)) {
    const n = (f?.n || 0) + 1;
    fails[email] = n >= MAX_FAILS ? { n: 0, until: Date.now() + LOCK_SECONDS * 1000 } : { n, until: 0 };
    writeJson(localStorage, FAIL_KEY, fails);
    if (n >= MAX_FAILS) throw new AuthError('errLocked', LOCK_SECONDS);
    throw new AuthError('errBadLogin');
  }
  delete fails[email];
  writeJson(localStorage, FAIL_KEY, fails);
  startSession(user.id, keep);
  return user;
}

// ---- Super admin ----
export interface SuperAdminInput { name: string; email: string; password: string; password2: string }

export function hasSuperAdmin(): boolean {
  if (cloud.on) return cloud.superadmin;
  return users().some((u) => u.role === 'superadmin');
}

export function isSuperAdmin(): boolean {
  const u = currentUser();
  return !!u && u.id !== GUEST_ID && (u as UserProfile).role === 'superadmin';
}

/**
 * Cria a conta de super admin (só depois de o painel confirmar a senha do servidor).
 * No modo servidor a conta é criada no banco, com a mesma senha de administração (adminPassword).
 */
export async function createSuperAdmin(input: SuperAdminInput, adminPassword = ''): Promise<UserProfile> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name || !email || !input.password) throw new AuthError('errRequired');
  if (!EMAIL_RE.test(email)) throw new AuthError('errEmail');
  if (input.password.length < 10 || !/[A-Za-z]/.test(input.password) || !/\d/.test(input.password)) throw new AuthError('errPwShort');
  if (input.password !== input.password2) throw new AuthError('errPwMismatch');
  if (cloud.on) {
    const r = await api<{ token: string; user: UserProfile }>('POST', '/auth/superadmin', { name, email, password: input.password }, { 'X-Admin-Password': adminPassword });
    if (!r.ok) throw toAuthError(r);
    cloud.superadmin = true;
    startCloudSession(r.data.user, r.data.token, false);
    await pullAll();
    return r.data.user;
  }
  const all = users();
  if (all.some((u) => u.email === email)) throw new AuthError('errExists');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const now = new Date().toISOString();
  const user: UserProfile = {
    id: 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    name, email, farmName: 'SpaceAgro', city: 'Rio Verde (GO)',
    salt: b64(salt), hash: await hashPassword(input.password, salt),
    createdAt: now, consentAt: now, role: 'superadmin',
  };
  writeJson(localStorage, USERS_KEY, [...all, user]);
  startSession(user.id, false);
  return user;
}

export function enterAsGuest(): void {
  startSession(GUEST_ID, false);
}

interface Session { userId: string; at: number; token?: string }

function startSession(userId: string, keep: boolean, token?: string): void {
  const s: Session = { userId, at: Date.now(), ...(token ? { token } : {}) };
  writeJson(sessionStorage, SESSION_KEY, s);
  if (keep) writeJson(localStorage, SESSION_KEY, s);
  else try { localStorage.removeItem(SESSION_KEY); } catch { /* ignora */ }
}

function readSession(): Session | null {
  const s = readJson<Session | null>(sessionStorage, SESSION_KEY, null) || readJson<Session | null>(localStorage, SESSION_KEY, null);
  if (!s || Date.now() - s.at > SESSION_DAYS * 86400000) return null;
  return s;
}

/** Usuário da sessão atual (ou null se não houver sessão válida). */
export function currentUser(): UserProfile | { id: typeof GUEST_ID; name: string } | null {
  const s = readSession();
  if (!s) return null;
  if (s.userId === GUEST_ID) return { id: GUEST_ID, name: 'Guest' };
  if (s.token) return readJson<Record<string, UserProfile>>(localStorage, CLOUD_USERS_KEY, {})[s.userId] || null;
  return users().find((u) => u.id === s.userId) || null;
}

export function logout(): void {
  const s = readSession();
  if (s?.token) {
    const base = estelaBaseUrl();
    if (base) void fetch(base + '/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + s.token }, keepalive: true }).catch(() => undefined);
  }
  try {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
  } catch { /* ignora */ }
}

/** Se as contas estão no servidor (então "esqueci a senha" é com o administrador). */
export function isCloudMode(): boolean {
  return cloud.on;
}

/** Apaga a conta e os dados dela neste aparelho (só no modo local). */
export function deleteAccount(email: string): void {
  if (cloud.on) return;
  const e = email.trim().toLowerCase();
  const all = users();
  const u = all.find((x) => x.email === e);
  if (!u) return;
  writeJson(localStorage, USERS_KEY, all.filter((x) => x.id !== u.id));
  for (const base of DATA_KEYS) try { localStorage.removeItem(`${base}:${u.id}`); } catch { /* ignora */ }
}

// ---- Dados separados por usuário ----
const DATA_KEYS = ['myroca_farm_data_rio_verde_rural_v3', 'myroca_avatar_v1', 'myroca_avatar_prompted_v1'];

/** Chave de armazenamento do usuário atual. Sem sessão, usa a chave original (compatível com o modo antigo). */
export function scopedKey(base: string): string {
  const u = currentUser();
  return u ? `${base}:${u.id}` : base;
}

function adoptLegacyData(userId: string): void {
  for (const base of DATA_KEYS) {
    try {
      const v = localStorage.getItem(base);
      if (v !== null && localStorage.getItem(`${base}:${userId}`) === null) localStorage.setItem(`${base}:${userId}`, v);
    } catch { /* ignora */ }
  }
}

// =====================================================================================
// Modo servidor: contas e dados no PostgreSQL (server/accounts.mjs)
// =====================================================================================
const CLOUD_USERS_KEY = 'myroca_cloud_users_v1'; // perfis (sem senha) das contas que entraram neste aparelho
const DIRTY_KEY = 'myroca_cloud_dirty_v1'; // itens gravados aqui que ainda não chegaram ao servidor
const cloud = { on: false, superadmin: false };

type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string; seconds?: number };

async function api<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}, timeoutMs = 15000): Promise<ApiResult<T>> {
  const base = estelaBaseUrl();
  if (!base) return { ok: false, status: 0, error: 'sem_servidor' };
  const token = readSession()?.token;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(base + path, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    let j: Record<string, unknown> = {};
    try { j = await r.json(); } catch { j = {}; }
    if (!r.ok || j.ok === false) return { ok: false, status: r.status, error: String(j.error || 'erro'), seconds: Number(j.seconds) || 0 };
    return { ok: true, data: j as T };
  } catch {
    return { ok: false, status: 0, error: 'sem_conexao' };
  } finally {
    clearTimeout(timer);
  }
}

const AUTH_KEYS: string[] = ['errRequired', 'errEmail', 'errPwShort', 'errPwMismatch', 'errConsent', 'errExists', 'errBadLogin', 'errLocked'];
function toAuthError(r: { error: string; seconds?: number }): AuthError {
  if (AUTH_KEYS.includes(r.error)) return new AuthError(r.error as AuthErrorKey, r.seconds || 0);
  return new AuthError(r.error === 'sem_conexao' ? 'errOffline' : 'errServer');
}

/**
 * Descobre, na abertura do app, se o servidor tem banco de contas.
 * Sem internet, quem já entrou com conta do servidor continua usando a cópia local.
 */
export async function initCloud(): Promise<void> {
  if (!estelaBaseUrl()) return;
  const r = await api<{ db: boolean; superadmin: boolean }>('GET', '/auth/status', undefined, {}, 6000);
  if (r.ok) { cloud.on = !!r.data.db; cloud.superadmin = !!r.data.superadmin; }
  else cloud.on = !!readSession()?.token;
}

function rememberProfile(u: UserProfile): void {
  const all = readJson<Record<string, UserProfile>>(localStorage, CLOUD_USERS_KEY, {});
  all[u.id] = u;
  writeJson(localStorage, CLOUD_USERS_KEY, all);
}

function startCloudSession(u: UserProfile, token: string, keep: boolean): void {
  rememberProfile(u);
  startSession(u.id, keep, token);
}

/** Na abertura do app: confere a sessão no servidor, envia o que ficou pendente e baixa os dados. */
export async function syncOnStart(): Promise<void> {
  const s = readSession();
  if (!cloud.on || !s?.token) return;
  const me = await api<{ user: UserProfile }>('GET', '/auth/me');
  if (!me.ok) {
    if (me.status === 401) logout(); // sessão vencida ou senha trocada: pede login de novo
    return; // sem internet: segue com a cópia local
  }
  rememberProfile(me.data.user);
  await pushDirty();
  await pullAll();
}

async function cloudSignup(input: SignupInput, keep: boolean): Promise<UserProfile> {
  if (input.password !== input.password2) throw new AuthError('errPwMismatch');
  const r = await api<{ token: string; user: UserProfile }>('POST', '/auth/signup', {
    name: input.name, email: input.email, phone: input.phone, farmName: input.farmName, city: input.city, password: input.password, consent: input.consent,
  });
  if (!r.ok) throw toAuthError(r);
  startCloudSession(r.data.user, r.data.token, keep);
  adoptLocalData(r.data.user);
  await pushAll();
  return r.data.user;
}

async function cloudLogin(email: string, password: string, keep: boolean): Promise<UserProfile> {
  const r = await api<{ token: string; user: UserProfile }>('POST', '/auth/login', { email, password });
  if (!r.ok) throw toAuthError(r);
  startCloudSession(r.data.user, r.data.token, keep);
  const got = await pullAll();
  // Conta nova no servidor sem dados: traz a fazenda que a pessoa já tinha neste aparelho
  if (got === 0 && adoptLocalData(r.data.user)) await pushAll();
  return r.data.user;
}

/**
 * Leva para a conta do servidor os dados que já existiam neste aparelho:
 * da conta local com o mesmo e-mail ou, se não houver contas locais, os dados de antes do login.
 */
function adoptLocalData(u: UserProfile): boolean {
  const local = users().find((x) => x.email === u.email);
  let moved = false;
  for (const base of DATA_KEYS) {
    try {
      const target = `${base}:${u.id}`;
      if (localStorage.getItem(target) !== null) continue;
      const v = local ? localStorage.getItem(`${base}:${local.id}`) : users().length === 0 ? localStorage.getItem(base) : null;
      if (v !== null) { localStorage.setItem(target, v); moved = true; }
    } catch { /* ignora */ }
  }
  return moved;
}

/** Baixa todos os dados da conta para a cópia local. Retorna quantos itens vieram (-1 se falhou). */
async function pullAll(): Promise<number> {
  const s = readSession();
  if (!s?.token) return 0;
  const r = await api<{ items: Record<string, string> }>('GET', '/data', undefined, {}, 30000);
  if (!r.ok) return -1;
  const dirty = new Set(readJson<string[]>(localStorage, DIRTY_KEY, []));
  let n = 0;
  for (const [k, v] of Object.entries(r.data.items || {})) {
    if (!DATA_KEYS.includes(k) || dirty.has(`${s.userId}|${k}`)) continue;
    try { localStorage.setItem(`${k}:${s.userId}`, v); n++; } catch { /* ignora */ }
  }
  return n;
}

async function pushAll(): Promise<void> {
  const s = readSession();
  if (!s?.token) return;
  for (const base of DATA_KEYS) if (localStorage.getItem(`${base}:${s.userId}`) !== null) markDirty(s.userId, base);
  await pushDirty();
}

function markDirty(userId: string, base: string): void {
  const d = new Set(readJson<string[]>(localStorage, DIRTY_KEY, []));
  d.add(`${userId}|${base}`);
  writeJson(localStorage, DIRTY_KEY, [...d]);
}

let pushing: Promise<void> | null = null;
/** Envia ao servidor tudo o que foi gravado neste aparelho e ainda não chegou lá. */
async function pushDirty(): Promise<void> {
  if (pushing) return pushing;
  pushing = (async () => {
    const s = readSession();
    if (!s?.token) return;
    for (const item of readJson<string[]>(localStorage, DIRTY_KEY, [])) {
      const [userId, base] = item.split('|');
      if (userId !== s.userId) continue;
      const value = localStorage.getItem(`${base}:${userId}`);
      const r = await api('PUT', '/data', { key: base, value }, {}, 30000);
      if (r.ok) {
        writeJson(localStorage, DIRTY_KEY, readJson<string[]>(localStorage, DIRTY_KEY, []).filter((x) => x !== item));
      } else {
        if (r.status === 401) logout();
        break; // sem conexão: tenta de novo na próxima gravação ou quando a internet voltar
      }
    }
  })().finally(() => { pushing = null; });
  return pushing;
}

const timers: Record<string, number> = {};
/** Chamado depois de cada gravação local (fazenda, avatar): agenda o envio ao servidor. */
export function cloudSave(base: string): void {
  const s = readSession();
  if (!cloud.on || !s?.token || !DATA_KEYS.includes(base)) return;
  markDirty(s.userId, base);
  window.clearTimeout(timers[base]);
  timers[base] = window.setTimeout(() => void pushDirty(), 1200);
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { if (cloud.on) void pushDirty(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && cloud.on) void pushDirty(); });
}
