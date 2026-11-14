// Contas e dados da fazenda no PostgreSQL.
//
// Conexão pelas variáveis padrão do Postgres: PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE
// (ou DATABASE_URL). Sem PGHOST/DATABASE_URL o app continua no modo local (dados só no navegador).
//
// Rotas (todas sob /api):
//   GET  /auth/status        { db, superadmin }                 situação do banco
//   POST /auth/signup        cria conta e já entra               → { token, user }
//   POST /auth/login         entra                              → { token, user }
//   POST /auth/logout        encerra a sessão (Bearer)
//   GET  /auth/me            usuário da sessão (Bearer)
//   POST /auth/superadmin    cria/promove o super admin         (X-Admin-Password)
//   DELETE /auth/account     apaga a própria conta e os dados   (Bearer, LGPD)
//   GET  /data               todos os dados do usuário          (Bearer)
//   PUT  /data               grava um item { key, value }       (Bearer)
//   POST /accounts/list      lista contas                       (X-Admin-Password)
//   POST /accounts/reset     gera senha provisória para um e-mail (X-Admin-Password)
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import pg from 'pg';

const scrypt = promisify(crypto.scrypt);
const SESSION_DAYS = 30;
const MAX_FAILS = 5;
const LOCK_SECONDS = 60;
const MAX_ADMIN_FAILS = 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Itens que cada usuário pode guardar (mesmas chaves que o app usa no navegador). */
const DATA_KEYS = new Set(['myroca_farm_data_rio_verde_rural_v3', 'myroca_avatar_v1', 'myroca_avatar_prompted_v1']);
const MAX_VALUE = 6 * 1024 * 1024;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  phone       TEXT,
  farm_name   TEXT NOT NULL,
  city        TEXT NOT NULL,
  role        TEXT,
  pass_hash   TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  consent_at  TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE TABLE IF NOT EXISTS user_data (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key         TEXT NOT NULL,
  value       TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);`;

export function createAccounts({ adminPassword = '', allowedOrigin = '*' } = {}) {
  const enabled = !!(process.env.DATABASE_URL || process.env.PGHOST);
  const pool = enabled ? new pg.Pool(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL, max: 10 } : { max: 10 }) : null;
  pool?.on('error', (e) => console.error('[db]', e.message));
  let ready = false;
  const fails = new Map(); // tentativas de login erradas: e-mail → { n, until }
  const adminFails = new Map(); // senha de administração errada por IP+dia

  /** Cria as tabelas; tenta de novo até o Postgres aceitar conexões (ele pode subir depois do app). */
  async function migrate() {
    if (!pool) return;
    for (let i = 1; ; i++) {
      try {
        await pool.query(SCHEMA);
        await pool.query('DELETE FROM sessions WHERE expires_at < now()');
        ready = true;
        console.log('[db] PostgreSQL conectado e tabelas prontas');
        return;
      } catch (e) {
        if (i === 1 || i % 10 === 0) console.log(`[db] aguardando o PostgreSQL (${e.code || e.message})`);
        await new Promise((r) => setTimeout(r, Math.min(2000 * i, 10000)));
      }
    }
  }

  // ---------- utilidades
  const newId = () => 'u_' + crypto.randomBytes(9).toString('base64url');
  const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
  async function hashPassword(pw) {
    const salt = crypto.randomBytes(16);
    const h = await scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1 });
    return `scrypt$${salt.toString('base64')}$${Buffer.from(h).toString('base64')}`;
  }
  async function checkPassword(pw, stored) {
    const [, s, h] = String(stored || '').split('$');
    const salt = s ? Buffer.from(s, 'base64') : crypto.randomBytes(16);
    const want = h ? Buffer.from(h, 'base64') : crypto.randomBytes(64);
    const got = Buffer.from(await scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1 }));
    return !!h && got.length === want.length && crypto.timingSafeEqual(got, want);
  }
  function sameSecret(a, b) {
    const x = crypto.createHash('sha256').update(String(a)).digest();
    const y = crypto.createHash('sha256').update(String(b)).digest();
    return crypto.timingSafeEqual(x, y) && String(a).length > 0;
  }
  const strongPw = (pw, min) => typeof pw === 'string' && pw.length >= min && /[A-Za-z]/.test(pw) && /\d/.test(pw);
  const publicUser = (u) => ({
    id: u.id, email: u.email, name: u.name, phone: u.phone || undefined, farmName: u.farm_name, city: u.city,
    role: u.role === 'superadmin' ? 'superadmin' : undefined, createdAt: u.created_at, consentAt: u.consent_at,
  });
  async function newSession(userId) {
    const token = crypto.randomBytes(32).toString('base64url');
    await pool.query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + ($3 || ' days')::interval)", [sha(token), userId, String(SESSION_DAYS)]);
    return token;
  }
  async function sessionUser(req) {
    const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
    if (!m) return null;
    const r = await pool.query('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > now()', [sha(m[1].trim())]);
    return r.rows[0] || null;
  }
  function adminOk(req, ip) {
    const k = ip + new Date().toISOString().slice(0, 10);
    if ((adminFails.get(k) || 0) >= MAX_ADMIN_FAILS) return 'bloqueado';
    if (!adminPassword) return 'admin_sem_senha';
    if (!sameSecret(req.headers['x-admin-password'] || '', adminPassword)) { adminFails.set(k, (adminFails.get(k) || 0) + 1); return 'senha_incorreta'; }
    return '';
  }

  // ---------- HTTP
  function send(res, status, obj) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(obj));
  }
  async function readJson(req, limit) {
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > limit) throw Object.assign(new Error('grande'), { status: 413 });
      chunks.push(c);
    }
    if (!size) return {};
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw Object.assign(new Error('json'), { status: 400 }); }
  }

  /** Trata a rota se for de contas/dados. Retorna false quando não é uma rota daqui. */
  async function handle(req, res, ip) {
    const path = new URL(req.url, 'http://x').pathname.replace(/^\/api/, '').replace(/\/+$/, '');
    const isOurs = path.startsWith('/auth/') || path === '/data' || path.startsWith('/accounts/');
    if (!isOurs) return false;
    const origin = req.headers.origin;
    if (origin && allowedOrigin !== '*' && origin !== allowedOrigin) { send(res, 403, { ok: false, error: 'origem' }); return true; }
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return true; }

    if (path === '/auth/status') {
      let superadmin = false;
      if (ready) superadmin = (await pool.query("SELECT 1 FROM users WHERE role = 'superadmin' LIMIT 1")).rowCount > 0;
      send(res, 200, { ok: true, db: ready, superadmin });
      return true;
    }
    if (!pool) { send(res, 501, { ok: false, error: 'sem_banco' }); return true; }
    if (!ready) { send(res, 503, { ok: false, error: 'banco_iniciando' }); return true; }

    try {
      const body = req.method === 'GET' || req.method === 'DELETE' ? {} : await readJson(req, path === '/data' ? MAX_VALUE + 4096 : 64 * 1024);

      if (path === '/auth/signup' && req.method === 'POST') {
        const name = String(body.name || '').trim().slice(0, 120);
        const email = String(body.email || '').trim().toLowerCase().slice(0, 200);
        const farmName = String(body.farmName || '').trim().slice(0, 120);
        const city = String(body.city || '').trim().slice(0, 120);
        const phone = String(body.phone || '').trim().slice(0, 40);
        if (!name || !email || !farmName || !city || !body.password) return send(res, 400, { ok: false, error: 'errRequired' }), true;
        if (!EMAIL_RE.test(email)) return send(res, 400, { ok: false, error: 'errEmail' }), true;
        if (!strongPw(body.password, 8)) return send(res, 400, { ok: false, error: 'errPwShort' }), true;
        if (!body.consent) return send(res, 400, { ok: false, error: 'errConsent' }), true;
        const id = newId();
        const r = await pool.query(
          'INSERT INTO users (id, email, name, phone, farm_name, city, pass_hash, consent_at) VALUES ($1,$2,$3,$4,$5,$6,$7, now()) ON CONFLICT (email) DO NOTHING RETURNING *',
          [id, email, name, phone || null, farmName, city, await hashPassword(String(body.password))],
        );
        if (!r.rowCount) return send(res, 409, { ok: false, error: 'errExists' }), true;
        return send(res, 200, { ok: true, token: await newSession(id), user: publicUser(r.rows[0]) }), true;
      }

      if (path === '/auth/login' && req.method === 'POST') {
        const email = String(body.email || '').trim().toLowerCase();
        if (!email || !body.password) return send(res, 400, { ok: false, error: 'errRequired' }), true;
        const key = email + '|' + ip;
        const f = fails.get(key);
        if (f && f.until > Date.now()) return send(res, 429, { ok: false, error: 'errLocked', seconds: Math.ceil((f.until - Date.now()) / 1000) }), true;
        const u = (await pool.query('SELECT * FROM users WHERE email = $1', [email])).rows[0];
        // Confere a senha mesmo se o e-mail não existe, para não revelar quais e-mails têm conta
        const ok = await checkPassword(String(body.password), u?.pass_hash);
        if (!u || !ok) {
          const n = (f?.n || 0) + 1;
          fails.set(key, n >= MAX_FAILS ? { n: 0, until: Date.now() + LOCK_SECONDS * 1000 } : { n, until: 0 });
          return send(res, n >= MAX_FAILS ? 429 : 401, { ok: false, error: n >= MAX_FAILS ? 'errLocked' : 'errBadLogin', seconds: LOCK_SECONDS }), true;
        }
        fails.delete(key);
        return send(res, 200, { ok: true, token: await newSession(u.id), user: publicUser(u) }), true;
      }

      if (path === '/auth/superadmin' && req.method === 'POST') {
        const bad = adminOk(req, ip);
        if (bad) return send(res, bad === 'senha_incorreta' ? 401 : 403, { ok: false, error: bad }), true;
        const name = String(body.name || '').trim().slice(0, 120);
        const email = String(body.email || '').trim().toLowerCase();
        if (!name || !email || !body.password) return send(res, 400, { ok: false, error: 'errRequired' }), true;
        if (!EMAIL_RE.test(email)) return send(res, 400, { ok: false, error: 'errEmail' }), true;
        if (!strongPw(body.password, 10)) return send(res, 400, { ok: false, error: 'errPwShort' }), true;
        const hash = await hashPassword(String(body.password));
        const r = await pool.query(
          `INSERT INTO users (id, email, name, farm_name, city, role, pass_hash, consent_at) VALUES ($1,$2,$3,'SpaceAgro','Rio Verde (GO)','superadmin',$4, now())
           ON CONFLICT (email) DO UPDATE SET role = 'superadmin', name = EXCLUDED.name, pass_hash = EXCLUDED.pass_hash RETURNING *`,
          [newId(), email, name, hash],
        );
        return send(res, 200, { ok: true, token: await newSession(r.rows[0].id), user: publicUser(r.rows[0]) }), true;
      }

      if (path === '/accounts/list' && req.method === 'POST') {
        const bad = adminOk(req, ip);
        if (bad) return send(res, bad === 'senha_incorreta' ? 401 : 403, { ok: false, error: bad }), true;
        const r = await pool.query(`SELECT u.id, u.email, u.name, u.farm_name, u.city, u.role, u.created_at,
          (SELECT max(updated_at) FROM user_data d WHERE d.user_id = u.id) AS last_save FROM users u ORDER BY u.created_at DESC LIMIT 500`);
        return send(res, 200, { ok: true, users: r.rows.map((u) => ({ email: u.email, name: u.name, farmName: u.farm_name, city: u.city, role: u.role || '', createdAt: u.created_at, lastSave: u.last_save })) }), true;
      }

      if (path === '/accounts/reset' && req.method === 'POST') {
        const bad = adminOk(req, ip);
        if (bad) return send(res, bad === 'senha_incorreta' ? 401 : 403, { ok: false, error: bad }), true;
        const email = String(body.email || '').trim().toLowerCase();
        const temp = crypto.randomBytes(6).toString('base64url').replace(/[^A-Za-z0-9]/g, 'x') + Math.floor(10 + Math.random() * 89);
        const r = await pool.query('UPDATE users SET pass_hash = $2 WHERE email = $1 RETURNING id', [email, await hashPassword(temp)]);
        if (!r.rowCount) return send(res, 404, { ok: false, error: 'conta_nao_encontrada' }), true;
        await pool.query('DELETE FROM sessions WHERE user_id = $1', [r.rows[0].id]);
        return send(res, 200, { ok: true, tempPassword: temp }), true;
      }

      // ---- daqui para baixo: exige sessão
      const u = await sessionUser(req);
      if (!u) return send(res, 401, { ok: false, error: 'sessao_expirada' }), true;

      if (path === '/auth/me') return send(res, 200, { ok: true, user: publicUser(u) }), true;
      if (path === '/auth/logout' && req.method === 'POST') {
        const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
        await pool.query('DELETE FROM sessions WHERE token_hash = $1', [sha(m[1].trim())]);
        return send(res, 200, { ok: true }), true;
      }
      if (path === '/auth/account' && req.method === 'DELETE') {
        await pool.query('DELETE FROM users WHERE id = $1', [u.id]);
        return send(res, 200, { ok: true }), true;
      }
      if (path === '/data' && req.method === 'GET') {
        const r = await pool.query('SELECT key, value, updated_at FROM user_data WHERE user_id = $1', [u.id]);
        return send(res, 200, { ok: true, items: Object.fromEntries(r.rows.map((x) => [x.key, x.value])), updatedAt: Object.fromEntries(r.rows.map((x) => [x.key, x.updated_at])) }), true;
      }
      if (path === '/data' && req.method === 'PUT') {
        const key = String(body.key || '');
        if (!DATA_KEYS.has(key)) return send(res, 400, { ok: false, error: 'chave_invalida' }), true;
        if (body.value === null) {
          await pool.query('DELETE FROM user_data WHERE user_id = $1 AND key = $2', [u.id, key]);
          return send(res, 200, { ok: true }), true;
        }
        const value = String(body.value ?? '');
        if (value.length > MAX_VALUE) return send(res, 413, { ok: false, error: 'muito_grande' }), true;
        await pool.query(
          'INSERT INTO user_data (user_id, key, value, updated_at) VALUES ($1,$2,$3, now()) ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()',
          [u.id, key, value],
        );
        return send(res, 200, { ok: true }), true;
      }
      return send(res, 404, { ok: false, error: 'rota' }), true;
    } catch (e) {
      if (e.status) return send(res, e.status, { ok: false, error: e.message }), true;
      console.error('[db]', e);
      return send(res, 500, { ok: false, error: 'erro_interno' }), true;
    }
  }

  return { enabled, migrate, handle, isReady: () => ready };
}
