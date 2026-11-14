import maplibregl, { Map as MLMap, Marker } from 'maplibre-gl';
import { FarmData } from '../types';
import { ft } from '../i18n/fireText';
import { NEAR_KM, FireNear, annotate, bboxOf, fetchFires } from '../utils/fires';

export interface FireAlertOptions { getFarm: () => FarmData; getMap: () => MLMap; }
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const MUTE_KEY = 'myroca_fire_mute_v1';
const POLL_MS = 15 * 60 * 1000;

export class FireAlert {
  private markers: Marker[] = [];
  private fires: FireNear[] = [];
  private banner: HTMLElement | null = null;
  private pill: HTMLElement | null = null;
  private modal: HTMLElement | null = null;
  private alerted = new Set<string>();
  private muted = false;
  private status: 'idle' | 'ok' | 'off' = 'idle';
  private updated = '';
  private lastRun = 0;
  private audio: AudioContext | null = null;
  private pendingBeep = false;

  constructor(private opts: FireAlertOptions) {
    try { this.muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* ignora */ }
  }

  start(): void {
    void this.refresh();
    window.setInterval(() => void this.refresh(), POLL_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - this.lastRun > 10 * 60 * 1000) void this.refresh(); });
    const unlock = () => { this.ensureAudio(); if (this.pendingBeep) { this.pendingBeep = false; this.beep(); } };
    window.addEventListener('pointerdown', unlock, { once: true });
  }

  /** Resumo para a Estrela comentar. */
  summary(): object | null {
    if (this.status !== 'ok') return null;
    const near = this.fires.filter((f) => f.km <= NEAR_KM);
    const n0 = this.fires[0];
    return {
      fonte: 'NASA FIRMS (VIIRS), últimas 48 h', atualizadoEm: this.updated, focosNaRegiao: this.fires.length, focosAte5km: near.length,
      maisProximo: n0 ? { km: Math.round(n0.km * 10) / 10, talhao: n0.field, dentroDoTalhao: n0.inside, detectadoEm: n0.at.toISOString(), confianca: n0.conf } : null,
    };
  }

  async refresh(): Promise<void> {
    this.lastRun = Date.now();
    const farm = this.opts.getFarm();
    const map = this.opts.getMap();
    const c = map.getCenter();
    const r = await fetchFires(bboxOf(farm.talhoes, [c.lat, c.lng]), 2);
    if (!r.ok) { if (this.status !== 'ok') { this.status = 'off'; } this.paintPill(); return; }
    this.status = 'ok';
    this.updated = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    this.fires = annotate(r.fires, farm.talhoes);
    this.paintLayer();
    this.paintPill();
    this.paintBanner();
  }

  private paintLayer(): void {
    const map = this.opts.getMap();
    this.markers.forEach((m) => m.remove());
    this.markers = [];
    for (const f of this.fires) {
      const near = f.km <= NEAR_KM;
      const el = document.createElement('div');
      el.className = 'fire-ico';
      el.style.width = el.style.height = near ? '26px' : '14px';
      el.style.zIndex = near ? '3' : '2';
      el.innerHTML = `<span class="fire-dot ${near ? 'near' : 'far'}"></span>`;
      el.tabIndex = 0;
      el.title = ft('title');
      el.setAttribute('role', 'button'); el.setAttribute('aria-label', ft('title'));
      el.addEventListener('click', (e) => { e.stopPropagation(); this.openDetail(f); });
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.openDetail(f); } });
      this.markers.push(new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([f.lng, f.lat]).addTo(map));
    }
  }

  private paintPill(): void {
    if (!this.pill) {
      this.pill = document.createElement('div');
      this.pill.className = 'fire-pill';
      this.pill.setAttribute('role', 'status');
      document.body.appendChild(this.pill);
    }
    const p = this.pill;
    if (this.status === 'off') { p.textContent = ft('pillOff'); p.className = 'fire-pill off'; return; }
    if (this.status !== 'ok') return;
    p.textContent = this.fires.length ? ft('pillSome', { n: this.fires.length, t: this.updated }) : ft('pillNone', { t: this.updated });
    p.className = 'fire-pill ' + (this.fires.some((f) => f.km <= NEAR_KM) ? 'hot' : '');
  }

  private paintBanner(): void {
    const near = this.fires.filter((f) => f.km <= NEAR_KM);
    if (!near.length) { this.banner?.remove(); this.banner = null; return; }
    const first = near[0];
    const msg = first.inside ? ft('bannerIn', { field: first.field }) : ft('bannerNear', { n: near.length, km: first.km.toFixed(1), field: first.field });
    if (!this.banner) {
      this.banner = document.createElement('div');
      this.banner.className = 'fire-banner';
      this.banner.setAttribute('role', 'alert');
      document.body.appendChild(this.banner);
      this.banner.addEventListener('click', (e) => {
        const a = (e.target as HTMLElement).closest('[data-fa]')?.getAttribute('data-fa');
        if (a === 'see') this.openDetail(this.fires.filter((f) => f.km <= NEAR_KM)[0]);
        if (a === 'mute') { this.muted = !this.muted; try { localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0'); } catch { /* ignora */ } this.paintBanner(); }
        if (a === 'x') { this.banner?.remove(); this.banner = null; }
      });
    }
    this.banner.innerHTML = `<span class="fire-banner-msg">${esc(msg)}</span><button type="button" data-fa="see">${esc(ft('see'))}</button><button type="button" data-fa="mute" aria-pressed="${this.muted}">${esc(this.muted ? ft('unmute') : ft('mute'))}</button><button type="button" class="fire-x" data-fa="x" aria-label="${esc(ft('dismiss'))}">×</button>`;
    const fresh = near.some((f) => !this.alerted.has(f.id));
    near.forEach((f) => this.alerted.add(f.id));
    if (fresh && !this.muted) this.beep();
  }

  private ensureAudio(): void {
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      if (!this.audio) this.audio = new AC();
      if (this.audio.state === 'suspended') void this.audio.resume();
    } catch { /* ignora */ }
  }
  private beep(): void {
    this.ensureAudio();
    const a = this.audio;
    if (!a || a.state !== 'running') { this.pendingBeep = true; return; }
    try {
      const t0 = a.currentTime;
      [880, 660, 880, 660].forEach((hz, i) => {
        const o = a.createOscillator(), g = a.createGain();
        o.type = 'square'; o.frequency.value = hz;
        g.gain.setValueAtTime(0.0001, t0 + i * 0.28); g.gain.exponentialRampToValueAtTime(0.18, t0 + i * 0.28 + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.28 + 0.25);
        o.connect(g).connect(a.destination); o.start(t0 + i * 0.28); o.stop(t0 + i * 0.28 + 0.27);
      });
    } catch { /* ignora */ }
  }

  private dirName(deg: number): string { return ft('dirs').split('|')[Math.round(deg / 45) % 8]; }

  private openDetail(f: FireNear | undefined): void {
    if (!f) return;
    const map = this.opts.getMap();
    map.easeTo({ center: [f.lng, f.lat], zoom: Math.max(map.getZoom(), 13) });
    if (!this.modal) {
      this.modal = document.createElement('div');
      this.modal.className = 'mkp-overlay fire-modal';
      this.modal.setAttribute('role', 'dialog'); this.modal.setAttribute('aria-modal', 'true');
      this.modal.addEventListener('click', (e) => { const el = e.target as HTMLElement; if (el === this.modal || el.closest('[data-fa="close"]')) this.closeDetail(); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.closeDetail(); });
      document.body.appendChild(this.modal);
    }
    const conf = f.conf === 'h' || f.conf === 'high' ? ft('confh') : f.conf === 'n' || f.conf === 'nominal' ? ft('confn') : f.conf === 'l' || f.conf === 'low' ? ft('confl') : f.conf;
    const dist = f.inside ? ft('inside', { field: f.field }) : ft('away', { km: f.km.toFixed(1), field: f.field, dir: this.dirName(f.dir) });
    const row = (k: string, v: string) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`;
    this.modal.innerHTML = `<div class="mkp-card fire-card"><div class="mkp-head fire-head"><div><h2>${esc(ft('title'))}</h2><p>${esc(dist)}</p></div><button type="button" class="mkp-x" data-fa="close" aria-label="${esc(ft('close'))}">×</button></div><div class="mkp-body">
      <table class="fire-tbl">${row(ft('when'), f.at.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }))}${row(ft('sat'), f.sat)}${row(ft('conf'), conf)}${row(ft('frp'), f.frp.toFixed(1) + ' MW')}${row(ft('where'), f.lat.toFixed(4) + ', ' + f.lng.toFixed(4))}</table>
      <h3>${esc(ft('whatT'))}</h3><p>${esc(ft('what'))}</p>
      <h3>${esc(ft('doT'))}</h3><ul>${ft('do').split('|').map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <p class="fire-src">${esc(ft('src'))}</p></div></div>`;
    this.modal.style.display = 'flex';
  }
  private closeDetail(): void { if (this.modal) this.modal.style.display = 'none'; }
}
