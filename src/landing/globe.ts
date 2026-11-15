/**
 * Globo da página inicial: Terra girando com imagem de satélite e focos de calor reais
 * (retrato NASA FIRMS em public/data/focos-landing.json). Ao chegar na fazenda de demonstração,
 * um tour guiado aproxima de cada talhão, um por vez, e mostra os dados reais dele; depois passa
 * pela água da fazenda, aponta o foco de calor mais próximo e termina na visão geral com os totais.
 */
import maplibregl, { Map as MLMap } from 'maplibre-gl';
import { calculatePolygonAreaHectares, calculatePolygonCenter, getRioVerdeDemoFarm } from '../utils/geo';
import { calculateTalhaoCropStatus } from '../utils/cropCalendar';
import { translateCropName } from '../i18n';
import { Talhao, WaterPoint } from '../types';

const ESRI_IMG = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const FIRES_URL = './data/focos-landing.json';
const NEAR_KM = 50;
const HOLD_FIELD = 3600;   // tempo parado em cada talhão (ms)
const HOLD_POINT = 3000;
const HOLD_FIRE = 4200;
const MOVE_MS = 1800;
const PLANET_BASE = { center: [-52, -14] as [number, number], pitch: 0, bearing: 0 };
/** Zoom em que o planeta inteiro cabe na caixa (1.55 numa caixa de ~550 px). */
const planetZoom = (w: number) => Math.max(0.6, 1.55 + Math.log2(Math.max(200, w) / 548));

export interface FireSnapshot { total: number; primeiraDeteccao: string; ultimaDeteccao: string; focos: [number, number, number][] }
export interface FarmStats { nearCount: number; nearestKm: number | null }
export type GlobeView = 'planet' | 'flying' | 'tour' | 'paused' | 'done';
export interface GlobeLabels {
  locale: string;
  ha: string;
  step: string;          // "{i} de {n}"
  crop: string; area: string; phase: string; harvest: string;
  water: string; struct: string;
  fireTitle: string; fireBody: string; // "{d} km", "{r}"
  nearestFire: string;   // "{d} km"
  cardTitle: string; cardFields: string; cardArea: string; cardWater: string; cardFire: string;
}
export interface GlobeOptions {
  cooperative: { windows: string; mac: string; mobile: string };
  labels: GlobeLabels;
  onFires?: (snap: FireSnapshot) => void;
  onFarm?: (stats: FarmStats) => void;
  onView?: (view: GlobeView) => void;
  onError?: () => void;
}
export interface GlobeHandle { flyToFarm(): void; flyToPlanet(): void; togglePause(): void; replay(): void; destroy(): void }

const km = (a: [number, number], b: [number, number]) => {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad, dLng = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const boundsOf = (pts: [number, number][]): [[number, number], [number, number]] => {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]];
};

type Step = { kind: 'field'; t: Talhao; i: number } | { kind: 'point'; w: WaterPoint } | { kind: 'fire' } | { kind: 'end' };

export function mountGlobe(container: HTMLElement, opt: GlobeOptions): GlobeHandle | null {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const L = opt.labels;
  const nf = new Intl.NumberFormat(L.locale);
  const fill = (tpl: string, v: Record<string, string>) => tpl.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
  const today = new Date().toISOString().slice(0, 10);

  // Dados reais da fazenda de demonstração ([lat, lng] -> [lng, lat])
  const farm = getRioVerdeDemoFarm();
  const fields = farm.talhoes.filter((t) => t.coordinates.length >= 3);
  const ll = (c: [number, number]): [number, number] => [c[1], c[0]];
  const fieldsGeo: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: fields.map((t) => {
      const ring = t.coordinates.map(ll);
      ring.push(ring[0]);
      return { type: 'Feature', properties: { id: t.id }, geometry: { type: 'Polygon', coordinates: [ring] } };
    }),
  };
  const farmBounds = boundsOf(fields.flatMap((t) => t.coordinates.map(ll)));
  const farmCenter: [number, number] = [(farmBounds[0][0] + farmBounds[1][0]) / 2, (farmBounds[0][1] + farmBounds[1][1]) / 2];
  const WATER = new Set(['nascente', 'poco', 'rio']);
  const points = (farm.waterPoints || []).filter((w) => WATER.has(w.type) || w.type === 'sede' || w.type === 'estacao_meteo');
  const tourPoints = points.filter((w) => WATER.has(w.type));
  const short = (name: string) => { const m = name.match(/(\d+)\s*$/); return m ? 'T' + m[1].padStart(2, '0') : name; };
  const areaOf = (t: Talhao) => t.areaHectares || calculatePolygonAreaHectares(t.coordinates);

  const PLANET = { ...PLANET_BASE, zoom: planetZoom(container.clientWidth) };
  let map: MLMap;
  try {
    map = new maplibregl.Map({
      container,
      style: {
        version: 8,
        projection: { type: 'globe' },
        sources: {
          esri: { type: 'raster', tiles: [ESRI_IMG], tileSize: 256, maxzoom: 16, attribution: 'Imagem: Esri World Imagery' },
          farm: { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: farmCenter } } },
          fields: { type: 'geojson', data: fieldsGeo },
        },
        sky: {
          'sky-color': '#050d0a', 'horizon-color': '#0f2a1d', 'fog-color': '#0b1a14',
          'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.5, 'fog-ground-blend': 0.5,
          'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0],
        },
        layers: [
          { id: 'bg', type: 'background', paint: { 'background-color': '#08140f' } },
          { id: 'esri', type: 'raster', source: 'esri' },
          { id: 'fields-fill', type: 'fill', source: 'fields', minzoom: 8, paint: { 'fill-color': '#a5d468', 'fill-opacity': 0.14 } },
          { id: 'fields-line', type: 'line', source: 'fields', minzoom: 8, paint: { 'line-color': '#c9ec98', 'line-opacity': 0.75, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.8, 13, 1.6] } },
          { id: 'field-active-fill', type: 'fill', source: 'fields', filter: ['==', ['get', 'id'], ''], paint: { 'fill-color': '#a5d468', 'fill-opacity': 0.38 } },
          { id: 'field-active-line', type: 'line', source: 'fields', filter: ['==', ['get', 'id'], ''], paint: { 'line-color': '#ffffff', 'line-width': 3.2 } },
          { id: 'farm-pt', type: 'circle', source: 'farm', maxzoom: 9, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 4, 8, 8], 'circle-color': '#a5d468', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } },
        ],
      },
      center: PLANET.center,
      zoom: PLANET.zoom,
      minZoom: 0.5,
      maxZoom: 15,
      maxTileCacheSize: 400,
      fadeDuration: 150,
      attributionControl: false,
      cooperativeGestures: true,
      locale: {
        'CooperativeGesturesHandler.WindowsHelpText': opt.cooperative.windows,
        'CooperativeGesturesHandler.MacHelpText': opt.cooperative.mac,
        'CooperativeGesturesHandler.MobileHelpText': opt.cooperative.mobile,
      },
    });
  } catch {
    opt.onError?.();
    return null;
  }
  map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: 'Focos de calor: NASA FIRMS (VIIRS NOAA-20)' }), 'bottom-right');
  map.once('idle', () => container.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show'));

  // ---------- estado ----------
  let view: GlobeView = 'planet';
  const setView = (v: GlobeView) => { view = v; opt.onView?.(v); };
  let nearestFire: [number, number] | null = null, nearestKm: number | null = null;
  let chips: maplibregl.Marker[] = [];
  let info: HTMLElement | null = null, edge: HTMLElement | null = null, card: HTMLElement | null = null;
  let steps: Step[] = [], stepIdx = 0, stepTimer = 0;

  // ---------- rotação do planeta ----------
  let spinning = !reduce, interacted = false, visible = true, raf = 0, last = 0;
  const spin = (ts: number) => {
    raf = requestAnimationFrame(spin);
    const dt = last ? Math.min(64, ts - last) : 16; last = ts;
    if (!spinning || !visible || document.hidden || view !== 'planet' || map.isMoving()) return;
    const c = map.getCenter();
    map.setCenter([c.lng + dt * 0.0045, c.lat]);
  };
  raf = requestAnimationFrame(spin);
  let resumeTimer = 0;
  const onUser = () => {
    interacted = true;
    if (view === 'planet') {
      spinning = false;
      clearTimeout(resumeTimer);
      resumeTimer = window.setTimeout(() => { if (!reduce && view === 'planet') spinning = true; }, 5000);
    } else if (view === 'tour') pauseTour();
  };
  ['mousedown', 'touchstart', 'wheel'].forEach((e) => container.addEventListener(e, onUser, { passive: true }));
  const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; }, { threshold: 0.05 });
  io.observe(container);

  // ---------- peças visuais do tour ----------
  const setActive = (id: string) => {
    map.setFilter('field-active-fill', ['==', ['get', 'id'], id]);
    map.setFilter('field-active-line', ['==', ['get', 'id'], id]);
  };
  const showInfo = (html: string) => {
    info?.remove();
    info = document.createElement('div');
    info.className = 'lp-gm-info';
    info.innerHTML = html;
    container.appendChild(info);
  };
  const addChip = (lngLat: [number, number], html: string, cls: string, anchor: 'center' | 'left' = 'center') => {
    const el = document.createElement('div');
    el.innerHTML = `<div class="lp-gm ${cls}">${html}</div>`;
    chips.push(new maplibregl.Marker({ element: el, anchor, offset: anchor === 'left' ? [-7, 0] : [0, 0] }).setLngLat(lngLat).addTo(map));
  };
  const placeEdge = () => {
    if (!edge || !nearestFire) return;
    const a = map.project(farmCenter), b = map.project(nearestFire);
    const W = container.clientWidth, H = container.clientHeight, pad = 22;
    let x = b.x, y = b.y;
    const onScreen = b.x > pad && b.x < W - pad && b.y > pad && b.y < H - pad;
    edge.hidden = onScreen; // com o foco visível, o cartão já explica
    if (!onScreen) {
      const dx = b.x - a.x, dy = b.y - a.y;
      const tx = dx > 0 ? (W - pad - a.x) / dx : dx < 0 ? (pad - a.x) / dx : Infinity;
      const ty = dy > 0 ? (H - pad - a.y) / dy : dy < 0 ? (pad - a.y) / dy : Infinity;
      const tt = Math.min(tx, ty);
      x = a.x + dx * tt; y = a.y + dy * tt;
    }
    const w = edge.offsetWidth / 2 + 8;
    edge.style.left = `${Math.round(Math.min(W - w, Math.max(w, x)))}px`;
    edge.style.top = `${Math.round(Math.min(H - 20, Math.max(20, y)))}px`;
    edge.style.setProperty('--ang', `${Math.atan2(b.y - a.y, b.x - a.x)}rad`);
  };
  map.on('move', placeEdge);
  // Rótulos dos talhões e da água somem quando a câmera se afasta (evita amontoar)
  map.on('zoom', () => container.classList.toggle('lp-gm-far', map.getZoom() < 11.2));
  const countUp = (el: HTMLElement, to: number, suffix = '') => {
    if (reduce) { el.textContent = nf.format(Math.round(to)) + suffix; return; }
    const t0 = performance.now(), dur = 1400;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      el.textContent = nf.format(Math.round(to * (1 - Math.pow(1 - k, 3)))) + suffix;
      if (k < 1 && el.isConnected) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const clearTour = () => {
    clearTimeout(stepTimer);
    chips.forEach((m) => m.remove()); chips = [];
    info?.remove(); info = null; edge?.remove(); edge = null; card?.remove(); card = null;
    if (map.getLayer('field-active-fill')) setActive('');
    if (map.getLayer('fire-link')) map.setLayoutProperty('fire-link', 'visibility', 'none');
  };
  const camera = (bounds: [[number, number], [number, number]], maxZoom: number) => {
    const narrow = container.clientWidth < 520;
    map.fitBounds(bounds, {
      padding: narrow ? { top: 30, bottom: 175, left: 30, right: 30 } : { top: 60, bottom: 150, left: 50, right: 50 },
      maxZoom, bearing: -12, pitch: reduce ? 0 : 18, duration: reduce ? 0 : MOVE_MS, essential: false,
    });
  };

  // ---------- passos do tour ----------
  const runStep = () => {
    if (view !== 'tour') return;
    const s = steps[stepIdx];
    if (!s) return;
    const next = (hold: number) => { stepTimer = window.setTimeout(() => { stepIdx++; runStep(); }, reduce ? Math.max(hold, 3000) : hold + MOVE_MS); };
    const n = fields.length;
    if (s.kind === 'field') {
      const t = s.t;
      const center = calculatePolygonCenter(t.coordinates);
      camera(boundsOf(t.coordinates.map(ll)), 14);
      setActive(t.id);
      const st = calculateTalhaoCropStatus(t, today);
      showInfo(`<p class="lp-gm-step">${fill(L.step, { i: String(s.i + 1), n: String(n) })}</p>
        <h4><b>${short(t.name)}</b> ${esc(t.name)}</h4>
        <dl>
          <div><dt>${L.crop}</dt><dd>${esc(translateCropName(t.crop))}</dd></div>
          <div><dt>${L.area}</dt><dd>${nf.format(Math.round(areaOf(t)))} ${L.ha}</dd></div>
          <div><dt>${L.phase}</dt><dd>${esc(st.stageBadgeText || '')}</dd></div>
          <div><dt>${L.harvest}</dt><dd>${esc(String(st.expectedHarvest || ''))}</dd></div>
        </dl>`);
      // o número do talhão fica no mapa depois de visitado
      stepTimer = window.setTimeout(() => {
        addChip(ll(center), `<b>${short(t.name)}</b>`, 'lp-gm-field');
        next(HOLD_FIELD - 400);
      }, reduce ? 0 : MOVE_MS + 400);
      return;
    }
    if (s.kind === 'point') {
      setActive('');
      const p = ll(s.w.coordinates);
      const d = 0.012;
      camera([[p[0] - d, p[1] - d], [p[0] + d, p[1] + d]], 14);
      showInfo(`<p class="lp-gm-step">${WATER.has(s.w.type) ? L.water : L.struct}</p><h4>${esc(s.w.name)}</h4>`);
      stepTimer = window.setTimeout(() => {
        addChip(p, `<i aria-hidden="true"></i><span>${esc(s.w.name)}</span>`, `lp-gm-point ${WATER.has(s.w.type) ? 'is-water' : 'is-struct'}`, 'left');
        next(HOLD_POINT - 400);
      }, reduce ? 0 : MOVE_MS + 400);
      return;
    }
    if (s.kind === 'fire') {
      setActive('');
      if (!nearestFire || nearestKm === null) { stepIdx++; runStep(); return; }
      camera(boundsOf([farmBounds[0], farmBounds[1], nearestFire]), 12);
      if (map.getLayer('fire-link')) map.setLayoutProperty('fire-link', 'visibility', 'visible');
      const d = nf.format(Math.round(nearestKm));
      showInfo(`<p class="lp-gm-step lp-gm-step-fire">${L.cardFire}</p><h4>${fill(L.fireTitle, { d })}</h4><p class="lp-gm-note">${fill(L.fireBody, { r: String(NEAR_KM) })}</p>`);
      edge = document.createElement('div');
      edge.className = 'lp-gm-edge';
      edge.innerHTML = `<i aria-hidden="true"></i><span>${fill(L.nearestFire, { d })}</span>`;
      container.appendChild(edge);
      placeEdge();
      next(HOLD_FIRE);
      return;
    }
    // fim: visão geral com os totais (a distância do foco fica no painel)
    info?.remove(); info = null;
    edge?.remove(); edge = null;
    camera(farmBounds, 13);
    const water = points.filter((w) => WATER.has(w.type)).length;
    const totalHa = fields.reduce((a, t) => a + areaOf(t), 0);
    card = document.createElement('div');
    card.className = 'lp-gm-card';
    card.innerHTML = `<p>${L.cardTitle}</p><dl>
      <div><dt>${L.cardFields}</dt><dd data-n="f">0</dd></div>
      <div><dt>${L.cardArea}</dt><dd data-n="a">0</dd></div>
      <div><dt>${L.cardWater}</dt><dd data-n="w">0</dd></div>
      <div><dt>${L.cardFire}</dt><dd data-n="k">—</dd></div></dl>`;
    container.appendChild(card);
    countUp(card.querySelector('[data-n=f]')!, fields.length);
    countUp(card.querySelector('[data-n=a]')!, totalHa);
    countUp(card.querySelector('[data-n=w]')!, water);
    if (nearestKm !== null) countUp(card.querySelector('[data-n=k]')!, nearestKm, ' km');
    setView('done');
  };
  const startTour = () => {
    clearTour();
    const sorted = [...fields].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    steps = [
      ...sorted.map((t, i) => ({ kind: 'field' as const, t, i })),
      ...tourPoints.map((w) => ({ kind: 'point' as const, w })),
      { kind: 'fire' as const },
      { kind: 'end' as const },
    ];
    stepIdx = 0;
    setView('tour');
    runStep();
  };
  function pauseTour() {
    if (view !== 'tour') return;
    clearTimeout(stepTimer);
    map.stop();
    setView('paused');
  }
  const resumeTour = () => { if (view !== 'paused') return; setView('tour'); runStep(); };

  // ---------- voos ----------
  const flyToFarm = () => {
    spinning = false; setView('flying');
    const cam = map.cameraForBounds(farmBounds, { padding: 40, bearing: -12, pitch: 18 });
    const target = { center: farmCenter, zoom: Math.min(cam?.zoom ?? 12, 12.5), pitch: reduce ? 0 : 18, bearing: -12 };
    if (reduce) { map.jumpTo(target); startTour(); return; }
    map.flyTo({ ...target, duration: 9000, curve: 1.6, essential: false });
    map.once('moveend', () => { if (view === 'flying') startTour(); });
  };
  const flyToPlanet = () => {
    clearTour();
    setView('flying');
    if (reduce) { map.jumpTo(PLANET); setView('planet'); return; }
    map.flyTo({ ...PLANET, center: [map.getCenter().lng, PLANET.center[1]], duration: 6000, curve: 1.5 });
    map.once('moveend', () => { setView('planet'); spinning = !reduce; });
  };

  // ---------- focos de calor reais ----------
  map.on('load', async () => {
    try {
      const snap = (await (await fetch(FIRES_URL)).json()) as FireSnapshot;
      map.addSource('fires', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: snap.focos.map(([lng, lat, frp]) => ({ type: 'Feature', properties: { frp }, geometry: { type: 'Point', coordinates: [lng, lat] } })) },
      });
      map.addLayer({
        id: 'fires-heat', type: 'heatmap', source: 'fires', maxzoom: 7,
        paint: {
          'heatmap-weight': ['interpolate', ['linear'], ['get', 'frp'], 0, 0.25, 50, 1],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 1, 0.9, 6, 2],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 1, 3, 4, 8, 7, 14],
          'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.95, 7, 0],
          'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(255,120,0,0)', 0.2, 'rgba(255,120,0,0.55)', 0.5, '#ff7a1a', 0.8, '#ffb347', 1, '#fff1c2'],
        },
      }, 'fields-fill');
      map.addLayer({
        id: 'fires-pt', type: 'circle', source: 'fires', minzoom: 5,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 2.5, 10, 6, 14, 9],
          'circle-color': '#ff7a1a', 'circle-stroke-color': '#ffe2b8', 'circle-stroke-width': 1,
          'circle-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0, 6, 0.95],
          'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0, 6, 1],
        },
      }, 'fields-fill');
      opt.onFires?.(snap);
      let near = 0;
      for (const [lng, lat] of snap.focos) {
        const d = km(farmCenter, [lng, lat]);
        if (d <= NEAR_KM) near++;
        if (nearestKm === null || d < nearestKm) { nearestKm = d; nearestFire = [lng, lat]; }
      }
      if (nearestFire) {
        map.addSource('fire-link', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [farmCenter, nearestFire] } } });
        map.addLayer({ id: 'fire-link', type: 'line', source: 'fire-link', layout: { visibility: 'none' }, paint: { 'line-color': '#ff9a4d', 'line-width': 2, 'line-dasharray': [2, 2] } }, 'field-active-fill');
      }
      opt.onFarm?.({ nearCount: near, nearestKm });
    } catch {
      opt.onFires?.({ total: 0, primeiraDeteccao: '', ultimaDeteccao: '', focos: [] });
    }
    // Voo automático até a fazenda, se o visitante ainda não mexeu no globo
    if (!reduce) window.setTimeout(() => { if (!interacted && view === 'planet' && visible) flyToFarm(); }, 9000);
  });

  return {
    flyToFarm,
    flyToPlanet,
    togglePause() { if (view === 'tour') pauseTour(); else resumeTour(); },
    replay() { startTour(); },
    destroy() {
      clearTour();
      cancelAnimationFrame(raf);
      clearTimeout(resumeTimer);
      io.disconnect();
      map.remove();
    },
  };
}

export { NEAR_KM };
