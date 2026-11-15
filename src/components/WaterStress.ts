import type { Feature } from 'geojson';
import maplibregl, { GeoJSONSource, Map as MLMap, Marker } from 'maplibre-gl';
import { FarmData } from '../types';
import { MapToolRail, ICONS } from './MapToolRail';
import { tt } from '../i18n/toolsText';
import { wt } from '../i18n/waterText';
import { getCurrentLanguage } from '../i18n/index';
import { addDaysIso, fetchNasaSeries } from '../utils/nasaPower';

export interface WaterStressOptions { getFarm: () => FarmData; getMap: () => MLMap; /** barra de ferramentas do mapa */ tools: () => MapToolRail; }
interface Res {
  id: string; nome: string; cultura: string | null; nivel: 'ok' | 'atencao' | 'sem_dado'; alertas: string[];
  ultima_imagem?: { data: string; hora_local: string; dias_atras: number; esi: number; pct_valido: number };
  esi_anterior?: { data: string; esi: number }; zona_fraca_pct?: number;
}
interface Data { gerado_em: string; limite_esi?: number; talhoes: Res[]; }
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const RAW = 'https://raw.githubusercontent.com/ProfGiancarllo/myroca/main/public/data/estresse-hidrico.json';
const COLOR = { atencao: '#b45309', ok: '#2f6b4f', sem_dado: '#65756e' };
/** Data sempre explícita e sem ambiguidade: DD/MM/AAAA (pt/es) ou data por extenso curta (en). */
const dmy = (iso: string) => getCurrentLanguage() === 'en' ? new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
const RAIN_WARN_MM = 15;

/** Botão no mapa com o estresse hídrico (ECOSTRESS/NASA). Sempre diz o dia exato da imagem e cruza com a chuva que veio depois (NASA POWER). */
export class WaterStress {
  private markers: Marker[] = [];
  private pill: HTMLElement | null = null;
  private modal: HTMLElement | null = null;
  private on = false;
  private data: Data | null = null;

  constructor(private opts: WaterStressOptions) {}

  start(): void {
    this.opts.tools().add({ id: 'water', group: 'analisar', order: 20, icon: ICONS.water, label: wt('btn'), desc: tt('waterD'), key: 'h', onClick: () => void this.toggle() });
  }

  private async load(): Promise<Data | null> {
    const base = ((import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL) || '/';
    for (const url of [RAW + '?h=' + Math.floor(Date.now() / 3600000), base + 'data/estresse-hidrico.json']) {
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
    this.opts.tools().setState('water', { on: true, busy: true, label: wt('loading') });
    this.data = await this.load();
    if (!this.on) return;
    this.opts.tools().setState('water', { busy: false, label: wt('btnOn') });
    this.paint();
  }

  private off(): void {
    this.on = false; this.clearMap(); this.pill?.remove(); this.pill = null;
    this.opts.tools().setState('water', { on: false, busy: false, label: wt('btn') });
  }

  private say(text: string, cls = ''): void {
    if (!this.pill) { this.pill = document.createElement('div'); this.pill.setAttribute('role', 'status'); document.body.appendChild(this.pill); }
    this.pill.className = 'sat-pill water-pill ' + cls; this.pill.textContent = text;
  }

  private clearMap(): void {
    this.markers.forEach((m) => m.remove()); this.markers = [];
    (this.opts.getMap().getSource('water-attention') as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: [] });
  }

  private paint(): void {
    const map = this.opts.getMap();
    this.clearMap();
    if (!this.data) { this.say(wt('pillOff'), 'off'); return; }
    const byId = new Map(this.data.talhoes.map((r) => [r.id, r]));
    const hits = this.opts.getFarm().talhoes.filter((t) => byId.has(t.id));
    if (!hits.length) { this.say(wt('pillNoMatch'), 'off'); return; }
    if (!map.getSource('water-attention')) {
      map.addSource('water-attention', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'water-attention-fill', type: 'fill', source: 'water-attention', paint: { 'fill-color': COLOR.atencao, 'fill-opacity': 0.12 } });
      map.addLayer({ id: 'water-attention-line', type: 'line', source: 'water-attention', paint: { 'line-color': COLOR.atencao, 'line-width': 3, 'line-dasharray': [1, 1.5] } });
    }
    const polys: Feature[] = [];
    let attention = 0; let lastImg = '';
    for (const t of hits) {
      const r = byId.get(t.id)!;
      if (r.nivel === 'atencao') attention++;
      if (r.ultima_imagem && r.ultima_imagem.data > lastImg) lastImg = r.ultima_imagem.data;
      if (r.nivel === 'atencao') { const ring = t.coordinates.map((p) => [p[1], p[0]]); ring.push(ring[0]); polys.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }); }
      const lat = t.coordinates.reduce((s, p) => s + p[0], 0) / t.coordinates.length;
      const lng = t.coordinates.reduce((s, p) => s + p[1], 0) / t.coordinates.length;
      const el = document.createElement('div');
      el.className = 'sat-ico water-ico'; el.style.width = el.style.height = '28px'; el.style.zIndex = r.nivel === 'atencao' ? '1102' : '1101';
      const when = r.ultima_imagem ? ` · ${dmy(r.ultima_imagem.data)}` : '';
      el.innerHTML = `<span class="sat-dot ${r.nivel}">${r.nivel === 'atencao' ? '!' : r.nivel === 'ok' ? '✓' : '–'}</span>`;
      el.tabIndex = 0; el.title = `${t.name}: ${this.levelName(r.nivel)}${when}`;
      el.setAttribute('role', 'button'); el.setAttribute('aria-label', el.title);
      el.addEventListener('click', (e) => { e.stopPropagation(); this.detail(t.name, r, lat, lng); });
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.detail(t.name, r, lat, lng); } });
      // empilhado acima do marcador de saúde da lavoura, para os dois poderem ficar ligados juntos
      this.markers.push(new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, -46] }).setLngLat([lng, lat]).addTo(map));
    }
    (map.getSource('water-attention') as GeoJSONSource).setData({ type: 'FeatureCollection', features: polys });
    const d = lastImg ? dmy(lastImg) : '—';
    this.say(attention ? wt('pillSome', { n: attention, d }) : wt('pillNone', { d }), attention ? 'hot' : '');
  }

  private levelName(n: string): string { return n === 'atencao' ? wt('lvAtencao') : n === 'ok' ? wt('lvOk') : wt('lvSem'); }

  private detail(name: string, r: Res, lat: number, lng: number): void {
    if (!this.modal) {
      this.modal = document.createElement('div'); this.modal.className = 'mkp-overlay sat-modal water-modal';
      this.modal.setAttribute('role', 'dialog'); this.modal.setAttribute('aria-modal', 'true');
      this.modal.addEventListener('click', (e) => { const el = e.target as HTMLElement; if (el === this.modal || el.closest('[data-sa="close"]')) this.close(); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close(); });
      document.body.appendChild(this.modal);
    }
    const u = r.ultima_imagem;
    const rows: [string, string][] = [];
    if (u) {
      rows.push([wt('imgDay'), `${dmy(u.data)}, ${u.hora_local}`], [wt('imgAge'), wt('ageVal', { n: u.dias_atras })], [wt('esi'), u.esi.toFixed(2)]);
      if (r.esi_anterior) rows.push([wt('esiPrev'), `${r.esi_anterior.esi.toFixed(2)} (${dmy(r.esi_anterior.data)})`]);
      if (r.zona_fraca_pct !== undefined) rows.push([wt('zona'), r.zona_fraca_pct.toFixed(0) + '%']);
      rows.push([wt('valid'), (u.pct_valido * 100).toFixed(0) + '%']);
    }
    const tr = rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('');
    const banner = u ? `<p class="water-day"><strong>${esc(wt('banner', { d: dmy(u.data) }))}</strong> · ${esc(wt('ageVal', { n: u.dias_atras }))}</p>` : '';
    const rainRow = u ? `<tr id="water-rain-row"><th>${esc(wt('rainAfter'))}</th><td>${esc(wt('rainLoading'))}</td></tr>` : '';
    this.modal.innerHTML = `<div class="mkp-card fire-card"><div class="mkp-head sat-head ${r.nivel}"><div><h2>${esc(name)}</h2><p>${esc(wt('title'))} · ${esc(this.levelName(r.nivel))}</p></div><button type="button" class="mkp-x" data-sa="close" aria-label="${esc(wt('close'))}">×</button></div><div class="mkp-body">
      ${banner}<div id="water-rain-warn"></div>
      <ul>${r.alertas.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
      <table class="fire-tbl">${tr}${rainRow}</table>
      <h3>${esc(wt('whatT'))}</h3><p>${esc(wt('what'))}</p>
      <p class="fire-src">${esc(wt('src', { g: this.data?.gerado_em ?? '' }))}</p></div></div>`;
    this.modal.style.display = 'flex';
    if (u) void this.rainAfter(u.data, lat, lng);
  }

  /** Chuva (NASA POWER) do dia seguinte ao da imagem até o último dia que a NASA já publicou. */
  private async rainAfter(imgDate: string, lat: number, lng: number): Promise<void> {
    const cell = this.modal?.querySelector<HTMLElement>('#water-rain-row td');
    const warn = this.modal?.querySelector<HTMLElement>('#water-rain-warn');
    if (!cell) return;
    const first = addDaysIso(imgDate, 1);
    const today = new Date().toISOString().slice(0, 10);
    const span = Math.round((new Date(today + 'T12:00:00Z').getTime() - new Date(first + 'T12:00:00Z').getTime()) / 86400000);
    if (span < 1) { cell.textContent = wt('rainNone'); return; }
    try {
      const ser = await fetchNasaSeries(lat, lng, addDaysIso(today, -1), Math.min(span, 90));
      const days = ser.days.filter((d) => d.date >= first && d.rain !== null);
      if (!days.length) { cell.textContent = wt('rainPending'); if (warn) warn.innerHTML = `<p class="water-warn soft">${esc(wt('rainLag', { n: span, d: dmy(imgDate) }))}</p>`; return; }
      const mm = days.reduce((s, d) => s + (d.rain as number), 0);
      const last = days[days.length - 1].date;
      cell.textContent = mm < 0.5 ? `${wt('rainNone')} (${dmy(first)} – ${dmy(last)})` : wt('rainVal', { mm: mm.toFixed(0), n: days.length, d: dmy(last) });
      const lines: string[] = [];
      if (mm >= RAIN_WARN_MM) lines.push(wt('rainWarn', { mm: mm.toFixed(0) }));
      const lag = Math.round((new Date(today + 'T12:00:00Z').getTime() - new Date(last + 'T12:00:00Z').getTime()) / 86400000) - 1;
      if (lag >= 1) lines.push(wt('rainLag', { n: lag, d: dmy(last) }));
      if (warn && lines.length) warn.innerHTML = lines.map((l, i) => `<p class="water-warn${i ? ' soft' : ''}">${esc(l)}</p>`).join('');
    } catch { cell.textContent = '—'; }
  }
  private close(): void { if (this.modal) this.modal.style.display = 'none'; }
}
