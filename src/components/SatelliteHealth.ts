import type { Feature, FeatureCollection } from 'geojson';
import maplibregl, { GeoJSONSource, Map as MLMap, Marker } from 'maplibre-gl';
import { FarmData } from '../types';
import { st } from '../i18n/satText';
import { fetchNasaSeries, summarizeNasa } from '../utils/nasaPower';

export interface SatelliteHealthOptions { getFarm: () => FarmData; getMap: () => MLMap; /** coluna de botões do mapa */ getTools: () => HTMLElement; }
interface Res {
  id: string; nome: string; cultura: string | null; nivel: 'ok' | 'atencao' | 'sem_dado'; alertas: string[];
  ultima_imagem?: { data: string; ndvi: number; ndmi: number }; dap_na_imagem?: number; fase_informada?: string;
  ndvi_esperado?: number; ndvi_mediana_pares?: number; zona_fraca_pct?: number;
}
interface Data { gerado_em: string; talhoes: Res[]; }
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const RAW = 'https://raw.githubusercontent.com/ProfGiancarllo/myroca/main/public/data/saude-talhoes.json';
const COLOR = { atencao: '#b45309', ok: '#2f6b4f', sem_dado: '#65756e' };

/** Botão no mapa que mostra os alertas de saúde da lavoura (Landsat 8/9, NASA/USGS) calculados pela rotina scripts/saude_satelite.py. */
export class SatelliteHealth {
  private btn: HTMLButtonElement | null = null;
  private markers: Marker[] = [];
  private pill: HTMLElement | null = null;
  private modal: HTMLElement | null = null;
  private on = false;
  private data: Data | null = null;

  constructor(private opts: SatelliteHealthOptions) {}

  start(): void {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'adjust-btn sat-btn'; b.textContent = st('btn'); b.setAttribute('aria-pressed', 'false');
    b.onclick = (e) => { e.stopPropagation(); void this.toggle(); };
    this.btn = b;
    this.opts.getTools().appendChild(b);
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
    this.on = false; this.clearMap(); this.pill?.remove(); this.pill = null;
    if (this.btn) { this.btn.textContent = st('btn'); this.btn.classList.remove('on'); this.btn.setAttribute('aria-pressed', 'false'); }
  }

  private say(text: string, cls = ''): void {
    if (!this.pill) { this.pill = document.createElement('div'); this.pill.setAttribute('role', 'status'); document.body.appendChild(this.pill); }
    this.pill.className = 'sat-pill ' + cls; this.pill.textContent = text;
  }

  private clearMap(): void {
    this.markers.forEach((m) => m.remove()); this.markers = [];
    (this.opts.getMap().getSource('sat-attention') as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: [] });
  }

  private paint(): void {
    const map = this.opts.getMap();
    this.clearMap();
    if (!this.data) { this.say(st('pillOff'), 'off'); return; }
    const byId = new Map(this.data.talhoes.map((r) => [r.id, r]));
    const hits = this.opts.getFarm().talhoes.filter((t) => byId.has(t.id));
    if (!hits.length) { this.say(st('pillNoMatch'), 'off'); return; }
    if (!map.getSource('sat-attention')) {
      map.addSource('sat-attention', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'sat-attention-fill', type: 'fill', source: 'sat-attention', paint: { 'fill-color': COLOR.atencao, 'fill-opacity': 0.12 } });
      map.addLayer({ id: 'sat-attention-line', type: 'line', source: 'sat-attention', paint: { 'line-color': COLOR.atencao, 'line-width': 3, 'line-dasharray': [2, 1.5] } });
    }
    const attentionPolys: Feature[] = [];
    let attention = 0; let lastImg = '';
    for (const t of hits) {
      const r = byId.get(t.id)!;
      if (r.nivel === 'atencao') attention++;
      if (r.ultima_imagem && r.ultima_imagem.data > lastImg) lastImg = r.ultima_imagem.data;
      const c = COLOR[r.nivel] || COLOR.sem_dado;
      if (r.nivel === 'atencao') { const ring = t.coordinates.map((p) => [p[1], p[0]]); ring.push(ring[0]); attentionPolys.push({ type: 'Feature', properties: { c }, geometry: { type: 'Polygon', coordinates: [ring] } }); }
      const lat = t.coordinates.reduce((s, p) => s + p[0], 0) / t.coordinates.length;
      const lng = t.coordinates.reduce((s, p) => s + p[1], 0) / t.coordinates.length;
      const label = r.nivel === 'atencao' ? '!' : r.nivel === 'ok' ? '✓' : '–';
      const el = document.createElement('div');
      el.className = 'sat-ico'; el.style.width = el.style.height = '28px'; el.style.zIndex = r.nivel === 'atencao' ? '1102' : '1101';
      el.innerHTML = `<span class="sat-dot ${r.nivel}">${label}</span>`;
      el.tabIndex = 0; el.title = `${t.name}: ${this.levelName(r.nivel)}`;
      el.setAttribute('role', 'button'); el.setAttribute('aria-label', el.title);
      el.addEventListener('click', (e) => { e.stopPropagation(); this.detail(t.name, r, lat, lng); });
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.detail(t.name, r, lat, lng); } });
      // fica logo acima do rótulo do talhão (T01, T12…), sem ser coberto por ele
      this.markers.push(new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, -14] }).setLngLat([lng, lat]).addTo(map));
    }
    (map.getSource('sat-attention') as GeoJSONSource).setData({ type: 'FeatureCollection', features: attentionPolys });
    const d = lastImg ? new Date(lastImg + 'T12:00:00').toLocaleDateString() : '—';
    this.say(attention ? st('pillSome', { n: attention, d }) : st('pillNone', { d }), attention ? 'hot' : '');
  }

  private levelName(n: string): string { return n === 'atencao' ? st('lvAtencao') : n === 'ok' ? st('lvOk') : st('lvSem'); }

  private detail(name: string, r: Res, lat: number, lng: number): void {
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
      <table class="fire-tbl">${tr}<tr id="sat-nasa-row"><th>${esc(st('rain'))}</th><td>…</td></tr></table>
      <h3>${esc(st('whatT'))}</h3><p>${esc(st('what'))}</p>
      <p class="fire-src">${esc(st('src', { g: this.data?.gerado_em ?? '' }))} ${esc(st('srcNasa'))}</p></div></div>`;
    this.modal.style.display = 'flex';
    // Chuva dos últimos 14 dias (NASA POWER): ajuda a explicar se o vigor baixo tem a ver com falta d'água
    const row = this.modal.querySelector<HTMLElement>('#sat-nasa-row td');
    void fetchNasaSeries(lat, lng, new Date().toISOString().slice(0, 10), 14).then((ser) => {
      const sm = summarizeNasa(ser);
      if (row) row.textContent = sm.daysWithData ? `${sm.rainTotal.toFixed(0)} mm · ${sm.dryDays} ${st('dry')}` : '—';
    }).catch(() => { if (row) row.textContent = '—'; });
  }
  private close(): void { if (this.modal) this.modal.style.display = 'none'; }
}
