/**
 * Cliente único do Open-Meteo para o app inteiro.
 *
 * O Open-Meteo gratuito tem limite diário de pedidos por endereço de internet. Para não estourar:
 *  - respostas ficam guardadas no navegador (valem entre recargas da página), com validade por tipo de dado;
 *  - pedidos iguais feitos ao mesmo tempo viram um só;
 *  - pontos são arredondados para 0,1° (~11 km) com `omPoint`, então talhões vizinhos dividem o mesmo pedido;
 *  - se o serviço recusar por limite (HTTP 429), o app para de pedir por 1 hora;
 *  - recusado ou fora do ar, tenta pelo servidor da Estrela (outro endereço, com cache próprio) e,
 *    em último caso, devolve a última resposta guardada (até 24 h) marcada como antiga.
 */
import { estelaBaseUrl } from '../admin/server';

const PREFIX = 'myroca_om_v1_';
const BLOCK_KEY = 'myroca_om_block_until';
const STALE_MAX_MS = 24 * 3600_000;
const MAX_ENTRIES = 60;

interface Entry { at: number; data: unknown }
export interface OmResult<T> { data: T; at: number; stale: boolean; via: 'open-meteo' | 'servidor' | 'cache' }

const inflight = new Map<string, Promise<OmResult<any> | null>>();

/** Ponto arredondado para 0,1°, em texto pronto para a URL. */
export function omPoint(lat: number, lng: number): { lat: string; lng: string } {
  return { lat: (Math.round(lat * 10) / 10).toFixed(1), lng: (Math.round(lng * 10) / 10).toFixed(1) };
}

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function readEntry(url: string): Entry | null {
  try { return JSON.parse(localStorage.getItem(PREFIX + hash(url)) || 'null'); } catch { return null; }
}

function writeEntry(url: string, data: unknown): void {
  try {
    localStorage.setItem(PREFIX + hash(url), JSON.stringify({ at: Date.now(), data }));
    // limpa as mais antigas para não encher o armazenamento
    const keys: { k: string; at: number }[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) { try { keys.push({ k, at: JSON.parse(localStorage.getItem(k) || '{}').at || 0 }); } catch { keys.push({ k, at: 0 }); } }
    }
    if (keys.length > MAX_ENTRIES) keys.sort((a, b) => a.at - b.at).slice(0, keys.length - MAX_ENTRIES).forEach((x) => localStorage.removeItem(x.k));
  } catch { /* sem armazenamento: segue sem cache */ }
}

function blocked(): boolean {
  try { return Date.now() < Number(localStorage.getItem(BLOCK_KEY) || 0); } catch { return false; }
}

function block(): void {
  try { localStorage.setItem(BLOCK_KEY, String(Date.now() + 3600_000)); } catch { /* ignora */ }
}

async function getJson(url: string, init: RequestInit, timeoutMs: number): Promise<{ status: number; json: any }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal });
    return { status: r.status, json: r.ok ? await r.json() : null };
  } finally {
    clearTimeout(timer);
  }
}

/** Plano B: o servidor da Estrela busca o mesmo endereço (só domínios do Open-Meteo) e guarda por um tempo. */
async function viaServer(url: string): Promise<any | null> {
  const base = estelaBaseUrl();
  if (!base) return null;
  try {
    const r = await getJson(base + '/om', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) }, 15000);
    return r.status === 200 && r.json && !r.json.error ? r.json : null;
  } catch { return null; }
}

/**
 * Busca um endereço do Open-Meteo com cache. `ttlMs` = por quanto tempo a resposta guardada vale como atual.
 * Devolve null só quando não há nenhuma fonte nem cópia guardada.
 */
export function omFetch<T = any>(url: string, ttlMs: number, timeoutMs = 12000): Promise<OmResult<T> | null> {
  const cached = readEntry(url);
  if (cached && Date.now() - cached.at < ttlMs) return Promise.resolve({ data: cached.data as T, at: cached.at, stale: false, via: 'cache' });
  const running = inflight.get(url);
  if (running) return running;
  const p = (async (): Promise<OmResult<T> | null> => {
    if (!blocked()) {
      try {
        const r = await getJson(url, {}, timeoutMs);
        if (r.status === 200 && r.json && !r.json.error) { writeEntry(url, r.json); return { data: r.json, at: Date.now(), stale: false, via: 'open-meteo' }; }
        if (r.status === 429) block();
      } catch { /* fora do ar ou demorou: tenta o plano B */ }
    }
    const s = await viaServer(url);
    if (s) { writeEntry(url, s); return { data: s, at: Date.now(), stale: false, via: 'servidor' }; }
    if (cached && Date.now() - cached.at < STALE_MAX_MS) return { data: cached.data as T, at: cached.at, stale: true, via: 'cache' };
    return null;
  })();
  inflight.set(url, p);
  void p.finally(() => inflight.delete(url));
  return p;
}

/** true quando o app está sem pedir ao Open-Meteo por ter batido no limite diário. */
export function omLimited(): boolean { return blocked(); }
