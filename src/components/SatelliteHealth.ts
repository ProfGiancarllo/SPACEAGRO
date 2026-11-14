import L from 'leaflet';
import { FarmData } from '../types';
import { st } from '../i18n/satText';

export interface SatelliteHealthOptions { getFarm: () => FarmData; getMap: () => L.Map; }
interface Res {
  id: string; nome: string; cultura: string | null; nivel: 'ok' | 'atencao' | 'sem_dado'; alertas: string[];
  ultima_imagem?: { data: string; ndvi: number; ndmi: number }; dap_na_imagem?: number; fase_informada?: string;
  ndvi_esperado?: number; ndvi_mediana_pares?: number; zona_fraca_pct?: number;
}
interface Data { gerado_em: string; talhoes: Res[]; }
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const RAW = 'https://raw.githubusercontent.com/ProfGiancarllo/myroca/main/public/data/saude-talhoes.json';
const COLOR = { atencao: '#b45309', ok: '#2f6b4f', sem_dado: '#65756e' };

/** Botão no mapa que mostra os alertas de saúde da lavoura (Sentinel-2) calculados pela rotina scripts/saude_satelite.py. */
export class SatelliteHealth {
  private btn: HTMLButtonElement | null = null;
  private layer: L.LayerGroup | null = null;
  private pill: HTMLElement | null = null;
  private modal: HTMLElement | null = null;
  private on = false;
  private data: Data | null = null;

  constructor(private opts: SatelliteHealthOptions) {}

  start(): void {
    const self = this;
    const Ctl = L.Control.extend({ onAdd() {
      const b = L.DomUtil.create('button', 'adjust-btn sat-btn') as HTMLButtonElement; b.type = 'button';
      L.DomEvent.disableClickPropagation(b); b.textContent = st('btn'); b.setAttribute('aria-pressed', 'false');
      b.onclick = () => void self.toggle(); self.btn = b; return b;
    } });
    new Ctl({ position: 'topleft' }).addTo(this.opts.getMap());
  }

  private async load(): Promise<Data | null> {
    const base = ((import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL) || '/';
    for (const url of [RAW + '?h=' + Math.floor(Date.now() / 3600000), base + 'data/saude-talhoes.json']) {
      try {
        const r = await fetch(url, { cache: 'no-cache' });
        if (!r.ok) continue;
        const j = (await r.json()) as Data;
        if (j && Array.isArray(j.talhoes)) return j;
      } catch { /* tenta a próxima */ }
    }
    return null;
  }

  private async toggle(): Promise<void> {
    if (this.on) { this.off(); return; }
    this.on = true;
    if (this.btn) { this.btn.textContent = st('loading'); this.btn.classList.add('on'); this.btn.setAttribute('aria-pressed', 'true'); }
    this.data = await this.load();
    if (!this.on) return;
    if (this.btn) this.btn.textContent = st('btnOn');
    this.paint();
  }

  private off(): void {
    this.on = false; this.layer?.remove(); this.layer = null; this.pill?.remove(); this.pill = null;
    if (this.btn) { this.btn.textContent = st('btn'); this.btn.classList.remove('on'); this.btn.setAttribute('aria-pressed', 'false'); }
  }

  private say(text: string, cls = ''): void {
    if (!this.pill) { this.pill = document.createElement('div'); this.pill.setAttribute('role', 'status'); document.body.appendChild(this.pill); }
    this.pill.className = 'sat-pill ' + cls; this.pill.textContent = text;
  }

  private paint(): void {
    const map = this.opts.getMap();
    this.layer?.remove(); this.layer = null;
    if (!this.data) { this.say(st('pillOff'), 'off'); return; }
    const byId = new Map(this.data.talhoes.map((r) => [r.id, r]));
    const hits = this.opts.getFarm().talhoes.filter((t) => byId.has(t.id));
    if (!hits.length) { this.say(st('pillNoMatch'), 'off'); return; }
    if (!map.getPane('satellite')) { const pn = map.createPane('satellite'); pn.style.zIndex = '630'; }
    const layer = (this.layer = L.layerGroup().addTo(map));
    let attention = 0; let lastImg = '';
    for (const t of hits) {
      const r = byId.get(t.id)!;
      if (r.nivel === 'atencao') attention++;
      if (r.ultima_imagem && r.ultima_imagem.data > lastImg) lastImg = r.ultima_imagem.data;
      const c = COLOR[r.nivel] || COLOR.sem_dado;
      if (r.nivel === 'atencao') L.polygon(t.coordinates, { color: c, weight: 3, dashArray: '6 4', fillOpacity: 0.12, interactive: false, pane: 'satellite' }).addTo(layer);
      const lat = t.coordinates.reduce((s, p) => s + p[0], 0) / t.coordinates.length;
      const lng = t.coordinates.reduce((s, p) => s + p[1], 0) / t.coordinates.length;
      const label = r.nivel === 'atencao' ? '!' : r.nivel === 'ok' ? '✓' : '–';
      const icon = L.divIcon({ className: 'sat-ico', html: `<span class="sat-dot ${r.nivel}">${label}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] });
      const m = L.marker([lat, lng], { icon, pane: 'satellite', keyboard: true, title: `${t.name}: ${this.levelName(r.nivel)}`, zIndexOffset: r.nivel === 'atencao' ? 1000 : 0 }).addTo(layer);
      const el = m.getElement();
      if (el) {
        el.setAttribute('role', 'button'); el.setAttribute('aria-label', `${t.name}: ${this.levelName(r.nivel)}`);
        el.addEventListener('click', (e) => { e.stopPropagation(); this.detail(t.name, r); });
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.detail(t.name, r); } });
      }
    }
    const d = lastImg ? new Date(lastImg + 'T12:00:00').toLocaleDateString() : '—';
    this.say(attention ? st('pillSome', { n: attention, d }) : st('pillNone', { d }), attention ? 'hot' : '');
  }

  private levelName(n: string): string { return n === 'atencao' ? st('lvAtencao') : n === 'ok' ? st('lvOk') : st('lvSem'); }

  private detail(name: string, r: Res): void {
    if (!this.modal) {
      this.modal = document.createElement('div'); this.modal.className = 'mkp-overlay sat-modal';
      this.modal.setAttribute('role', 'dialog'); this.modal.setAttribute('aria-modal', 'true');
      this.modal.addEventListener('click', (e) => { const el = e.target as HTMLElement; if (el === this.modal || el.closest('[data-sa="close"]')) this.close(); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close(); });
      document.body.appendChild(this.modal);
    }
    const u = r.ultima_imagem;
    const rows: [string, string][] = [];
    if (u) rows.push([st('img'), new Date(u.data + 'T12:00:00').toLocaleDateString()], [st('ndvi'), u.ndvi.toFixed(2)]);
    if (r.ndvi_esperado !== undefined) rows.push([st('esp'), r.ndvi_esperado.toFixed(2)]);
    if (u) rows.push([st('ndmi'), u.ndmi.toFixed(2)]);
    if (r.ndvi_mediana_pares !== undefined) rows.push([st('pares'), r.ndvi_mediana_pares.toFixed(2)]);
    if (r.zona_fraca_pct !== undefined) rows.push([st('zona'), r.zona_fraca_pct.toFixed(0) + '%']);
    if (r.dap_na_imagem !== undefined) rows.push([st('dap'), String(r.dap_na_imagem)]);
    if (r.fase_informada) rows.push([st('fase'), r.fase_informada]);
    const tr = rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('');
    this.modal.innerHTML = `<div class="mkp-card fire-card"><div class="mkp-head sat-head ${r.nivel}"><div><h2>${esc(name)}</h2><p>${esc(st('title'))} · ${esc(this.levelName(r.nivel))}</p></div><button type="button" class="mkp-x" data-sa="close" aria-label="${esc(st('close'))}">×</button></div><div class="mkp-body">
      <ul>${r.alertas.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
      <table class="fire-tbl">${tr}</table>
      <h3>${esc(st('whatT'))}</h3><p>${esc(st('what'))}</p>
      <p class="fire-src">${esc(st('src', { g: this.data?.gerado_em ?? '' }))}</p></div></div>`;
    this.modal.style.display = 'flex';
  }
  private close(): void { if (this.modal) this.modal.style.display = 'none'; }
}
