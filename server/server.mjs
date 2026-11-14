// Servidor de produção do SpaceAgro (Docker / Portainer).
//
//   /            app (arquivos do build do Vite, pasta dist)
//   /api/...     servidor da Estrela: o mesmo código do Cloudflare Worker (worker/estela-worker.js)
//   /healthz     verificação de saúde do container
//
// Variáveis de ambiente
//   ANTHROPIC_API_KEY   chave da API do Claude (Estrela)
//   OPENAI_API_KEY      chave da OpenAI para a voz da Estrela (opcional)
//   ADMIN_PASSWORD      senha do painel de super admin (opcional; sem ela o painel fica desligado)
//   ALLOWED_ORIGIN      ex.: https://spaceagro.pro
//   MODEL / TTS_VOICE   padrões (opcionais)
//   SITE_URL            endereço público do app, de onde a Estrela lê data/mercado.json
//   FIRMS_MAP_KEY       chave da NASA FIRMS para os alertas de queimadas (opcional)
//   PGHOST/PGUSER/PGPASSWORD/PGDATABASE (ou DATABASE_URL)  banco das contas e fazendas (server/accounts.mjs)
//   PORT                porta interna (padrão 3000)
//   DATA_DIR            onde o painel grava modelo/voz/chaves (padrão /data, use um volume)
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../worker/estela-worker.js';
import { createAccounts } from './accounts.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(process.env.DIST_DIR || path.join(HERE, '..', 'dist'));
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || '/data';
const MAX_BODY = 64 * 1024;

// ---------- Armazenamento no lugar do KV da Cloudflare (um arquivo JSON no volume)
const kvFile = path.join(DATA_DIR, 'estela-config.json');
const kv = {
  async get(key) {
    try { return JSON.parse(await fsp.readFile(kvFile, 'utf8'))[key] ?? null; } catch { return null; }
  },
  async put(key, value) {
    let all = {};
    try { all = JSON.parse(await fsp.readFile(kvFile, 'utf8')); } catch { all = {}; }
    all[key] = value;
    await fsp.mkdir(DATA_DIR, { recursive: true });
    const tmp = kvFile + '.tmp';
    await fsp.writeFile(tmp, JSON.stringify(all), { mode: 0o600 });
    await fsp.rename(tmp, kvFile);
  },
};
let kvOk = true;
try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.accessSync(DATA_DIR, fs.constants.W_OK); } catch { kvOk = false; }

// Chaves coladas no Portainer às vezes vêm com espaço, aspas ou quebra de linha; isso invalida a chave
const clean = (v) => String(v || '').trim().replace(/^["']|["']$/g, '').trim();
const env = {
  ANTHROPIC_API_KEY: clean(process.env.ANTHROPIC_API_KEY),
  OPENAI_API_KEY: clean(process.env.OPENAI_API_KEY),
  ADMIN_PASSWORD: clean(process.env.ADMIN_PASSWORD),
  ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN || '*',
  MODEL: process.env.MODEL || '',
  TTS_VOICE: process.env.TTS_VOICE || '',
  SITE_URL: process.env.SITE_URL || '',
  FIRMS_MAP_KEY: clean(process.env.FIRMS_MAP_KEY),
  CONFIG: kvOk ? kv : undefined,
};

// ---------- Contas e dados da fazenda no PostgreSQL (opcional: só com PGHOST ou DATABASE_URL)
const accounts = createAccounts({ adminPassword: env.ADMIN_PASSWORD, allowedOrigin: env.ALLOWED_ORIGIN });
void accounts.migrate();
const clientIp = (req) => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'x';

// ---------- API da Estrela: converte a requisição do Node para o formato do Worker
async function handleApi(req, res) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) return send(res, 413, 'text/plain', 'muito grande');
    chunks.push(c);
  }
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
  // IP real do visitante (o Traefik envia em X-Forwarded-For) para os limites diários
  headers.set('CF-Connecting-IP', clientIp(req));
  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks);
  const request = new Request(`http://localhost${req.url}`, { method: req.method, headers, body });

  let out;
  try {
    out = await worker.fetch(request, env);
  } catch (e) {
    console.error('[estela]', e);
    return send(res, 500, 'application/json', '{"ok":false,"error":"erro_interno"}');
  }
  const h = {};
  out.headers.forEach((v, k) => { h[k] = v; });
  res.writeHead(out.status, h);
  if (!out.body) return res.end();
  for await (const c of out.body) res.write(c);
  res.end();
}

// ---------- Arquivos do app
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8',
  '.geojson': 'application/geo+json', '.kml': 'application/vnd.google-earth.kml+xml', '.glb': 'model/gltf-binary',
};

async function handleStatic(req, res) {
  let rel;
  try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { return send(res, 400, 'text/plain', 'bad request'); }
  let file = path.join(DIST, path.normalize(rel));
  if (!file.startsWith(DIST)) return send(res, 403, 'text/plain', 'forbidden');
  let st = await fsp.stat(file).catch(() => null);
  if (st?.isDirectory()) { file = path.join(file, 'index.html'); st = await fsp.stat(file).catch(() => null); }
  // Rotas sem extensão caem no app (index.html)
  if (!st && !path.extname(rel)) { file = path.join(DIST, 'index.html'); st = await fsp.stat(file).catch(() => null); }
  if (!st) return send(res, 404, 'text/plain', 'não encontrado');

  const ext = path.extname(file).toLowerCase();
  const hashed = rel.startsWith('/assets/') && /-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/.test(rel);
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': st.size,
    'Cache-Control': ext === '.html' ? 'no-cache' : hashed ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

function send(res, status, type, body) {
  if (res.headersSent) return res.end();
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

http
  .createServer((req, res) => {
    const url = req.url || '/';
    if (url === '/healthz') return send(res, 200, 'text/plain', 'ok');
    if (url === '/api' || url.startsWith('/api/') || url.startsWith('/api?')) {
      return void accounts
        .handle(req, res, clientIp(req))
        .then((handled) => (handled ? undefined : handleApi(req, res)))
        .catch((e) => { console.error(e); send(res, 500, 'text/plain', 'erro'); });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'text/plain', 'method not allowed');
    handleStatic(req, res).catch((e) => { console.error(e); send(res, 500, 'text/plain', 'erro'); });
  })
  .listen(PORT, () => {
    console.log(`SpaceAgro na porta ${PORT}`);
    console.log(`Estrela: Claude ${env.ANTHROPIC_API_KEY ? 'configurado pela env' : 'sem chave na env'}, voz ${env.OPENAI_API_KEY ? 'ligada' : 'desligada'}, painel admin ${env.ADMIN_PASSWORD ? 'ligado' : 'desligado'}, dados em ${kvOk ? DATA_DIR : '(sem volume gravável)'}`);
    console.log(`Contas: ${accounts.enabled ? 'PostgreSQL' : 'modo local (sem banco configurado)'}`);
  });
