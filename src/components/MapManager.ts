/**
 * Mapa da fazenda em MapLibre GL (WebGL).
 *
 * Convenção do app: coordenadas como [lat, lng]. O MapLibre usa [lng, lat]; a conversão fica toda aqui (ll/llPoly).
 * Escala de zoom: o MapLibre trabalha com "tiles" de 512 px, então o zoom dele é 1 a menos que o do Leaflet
 * para a mesma escala na tela. Os limites antigos (15, 14, 16…) foram convertidos com Z().
 */
import type { Feature, FeatureCollection } from 'geojson';
import maplibregl, { GeoJSONSource, LngLatBoundsLike, Map as MLMap, Marker, Popup, RasterTileSource } from 'maplibre-gl';
import { twinLook, TwinLook } from '../utils/twinLook';
import { NASA_LAYERS, NasaLayerId, nasaTileUrl, matrixZoom, NASA_TRUECOLOR, nasaTrueColorUrl, nasaDefaultDate, LANDSAT, landsatUrl, findLandsatDate } from '../utils/nasaLayers';
import { lt } from '../i18n/landsatText';
import { ensureSnapshot, farmBounds, Snap } from '../utils/farmSnapshot';
import { CAR_PROPERTY, CAR_RESERVA, CAR_NATIVA, CAR_APP, CAR_VIEW, CAR_FIT } from '../data/farmCar';
import { segmentField } from '../utils/segment';
import { Talhao, WaterPoint, WaterPointType, WATER_POINT_META } from '../types';
import { calculatePolygonAreaHectares, calculatePerimeterKm, calculatePolygonCenter, formatHectares } from '../utils/geo';
import { calculateTalhaoCropStatus, getCropColor } from '../utils/cropCalendar';
import { t, translateCropName, translateCropPhase, translateStructureType, formatNumber, formatDateI18n } from '../i18n';

export interface MapEvents {
  onDrawingProgress: (pointCount: number, currentAreaHa: number) => void;
  onDrawingComplete: (coords: [number, number][], areaHa: number, perimeterKm: number) => void;
  onWaterPointClick: (lat: number, lng: number) => void;
  onTalhaoEdit: (talhao: Talhao) => void;
  onTalhaoDelete: (talhaoId: string) => void;
  onWaterPointDelete: (waterPointId: string) => void;
  onTalhaoGeometry?: (talhao: Talhao) => void;
}

type LatLng = [number, number];
type FC = FeatureCollection;

/** Progresso do ciclo (0–100) para o anel do rótulo. */
const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const clampPct = (v: number) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));

/** Zoom do Leaflet → zoom equivalente no MapLibre (mesma escala na tela). */
const Z = (leafletZoom: number) => leafletZoom - 1;
const ll = (c: LatLng): [number, number] => [c[1], c[0]];
const ring = (cs: LatLng[]): [number, number][] => { const r = cs.map(ll); if (r.length && (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1])) r.push(r[0]); return r; };
const polyFeature = (cs: LatLng[], props: Record<string, unknown> = {}, id?: number): Feature => ({ type: 'Feature', id, properties: props, geometry: { type: 'Polygon', coordinates: [ring(cs)] } });
const lineFeature = (cs: LatLng[], props: Record<string, unknown> = {}): Feature => ({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: cs.map(ll) } });
const pointFeature = (c: LatLng, props: Record<string, unknown> = {}): Feature => ({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: ll(c) } });
const fc = (features: Feature[]): FC => ({ type: 'FeatureCollection', features });
const EMPTY: FC = fc([]);
const boundsOf = (pts: LatLng[]): maplibregl.LngLatBounds => {
  const b = new maplibregl.LngLatBounds();
  pts.forEach((p) => b.extend(ll(p)));
  return b;
};
/** Distância em metros (haversine). */
const distM = (a: LatLng, b: LatLng) => {
  const R = 6371000, r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLng = (b[1] - a[1]) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

/** Controle simples: um elemento HTML posicionado num canto do mapa. */
class ElControl implements maplibregl.IControl {
  constructor(private el: HTMLElement) {}
  onAdd(): HTMLElement { return this.el; }
  onRemove(): void { this.el.remove(); }
}

const ESRI_IMG = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const ESRI_LABELS = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';
const OSM = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

type BaseId = 'esri' | 'landsat' | 'nasa' | 'osm';

export class MapManager {
  private map: MLMap;
  private ready: Promise<void>;
  private layersReady = false;
  private events: MapEvents;

  // Desenho de talhão
  private isDrawingTalhao = false;
  private drawingPoints: LatLng[] = [];
  private guideTo: LatLng | null = null;

  // Estrutura (ponto de água etc.)
  private isPlacingWaterPoint = false;
  private pendingWaterType: WaterPointType = 'nascente';

  private currentReferenceDate = '2026-11-09';
  private lastTalhoes: Talhao[] = [];
  private expandedTalhaoIds: Set<string> = new Set();
  private talhaoMarkers: Marker[] = [];
  private waterMarkers: Marker[] = [];
  private previewMarkers: Marker[] = [];
  private carMarkers: Marker[] = [];
  private hoverId: number | null = null;
  private popup: Popup | null = null;

  private base: BaseId = 'esri';
  private nasaDate = nasaDefaultDate();
  private labelsOn = true;
  private nasaDateBox: HTMLElement | null = null;
  private landsatDate = nasaDefaultDate();
  /** Ponto onde foi feita a última busca de passagem Landsat (refaz se o mapa for para longe). */
  private landsatProbe: maplibregl.LngLat | null = null;
  private landsatSeq = 0;
  private landsatReady = false;

  constructor(containerId: string, events: MapEvents) {
    this.events = events;
    const RIO_VERDE_RURAL: LatLng = [-17.805, -51.085];

    this.map = new maplibregl.Map({
      container: containerId,
      center: ll(RIO_VERDE_RURAL),
      zoom: Z(13),
      maxZoom: Z(19.5),
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      style: {
        version: 8,
        sources: {
          esri: { type: 'raster', tiles: [ESRI_IMG], tileSize: 256, maxzoom: 19, attribution: `Tiles &copy; Esri &mdash; ${t('attribSatellite')}` },
          nasa: { type: 'raster', tiles: [nasaTrueColorUrl(this.nasaDate)], tileSize: 256, maxzoom: NASA_TRUECOLOR.maxNativeZoom, attribution: 'NASA GIBS &mdash; VIIRS NOAA-20' },
          landsat: { type: 'raster', tiles: [landsatUrl(this.landsatDate)], tileSize: 256, maxzoom: LANDSAT.maxNativeZoom, attribution: 'NASA HLS &mdash; Landsat 8/9 (30 m)' },
          osm: { type: 'raster', tiles: [OSM], tileSize: 256, maxzoom: 19, attribution: '&copy; OpenStreetMap contributors' },
          labels: { type: 'raster', tiles: [ESRI_LABELS], tileSize: 256, maxzoom: 19, attribution: 'Labels &copy; Esri' },
        },
        layers: [
          { id: 'bg', type: 'background', paint: { 'background-color': '#e8eee9' } },
          { id: 'base-esri', type: 'raster', source: 'esri' },
          { id: 'base-landsat', type: 'raster', source: 'landsat', layout: { visibility: 'none' } },
          { id: 'base-nasa', type: 'raster', source: 'nasa', layout: { visibility: 'none' } },
          { id: 'base-osm', type: 'raster', source: 'osm', layout: { visibility: 'none' } },
        ],
      },
    });
    this.map.getCanvas().setAttribute('aria-label', 'Mapa da propriedade');
    // só em desenvolvimento: acesso ao mapa pelo console para depuração
    if ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) (window as unknown as { __saMap?: MLMap }).__saMap = this.map;

    this.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    // créditos das imagens sempre à vista (exigência do OpenStreetMap, Esri e das regras do Space Apps); compacto só em tela estreita
    this.map.addControl(new maplibregl.AttributionControl({ compact: window.innerWidth < 640 }), 'bottom-right');
    // no celular os créditos começam recolhidos no botão "i" (abertos, cobriam o mapa e os avisos)
    if (window.innerWidth < 640) this.map.once('idle', () => this.map.getContainer().querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show'));
    this.map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
    this.addLayerSwitcher();
    // ao perder ou voltar a internet, prende ou solta o mapa (ver applySnapLimits)
    window.addEventListener('online', () => this.applySnapLimits());
    window.addEventListener('offline', () => this.applySnapLimits());

    this.ready = new Promise((resolve) => this.map.on('load', () => { this.setupLayers(); resolve(); }));

    const updateZoomClass = () => {
      const c = this.map.getContainer(), z = this.map.getZoom();
      c.classList.toggle('map-zoom-low', z < Z(15));
      c.classList.toggle('map-zoom-below-14', z < Z(14));
      // longe da fazenda (vendo país ou mundo) as etiquetas dos talhões se espalhariam: ficam ocultas
      c.classList.toggle('map-zoom-far', z < Z(11));
    };
    let lastZ = this.map.getZoom();
    this.map.on('zoomend', () => {
      updateZoomClass();
      // os rótulos só mudam de formato quando cruza um limite de zoom
      const z = this.map.getZoom();
      if (this.lastTalhoes.length && Math.abs(z - lastZ) > 0.05) this.renderTalhoes(this.lastTalhoes);
      lastZ = z;
    });
    updateZoomClass();

    // a coluna da Estrela abre/minimiza (ou a janela muda): o mapa acompanha o novo tamanho
    window.addEventListener('resize', () => this.map.resize());
    window.addEventListener('estela-layout', () => this.map.resize());
    this.setupMapListeners();
    this.addAdjustControl();
    this.addWandControl();
  }

  /** Camadas de dados (na ordem de desenho, de baixo para cima). */
  private setupLayers(): void {
    const m = this.map;
    const src = (id: string) => m.addSource(id, { type: 'geojson', data: EMPTY });
    // foto fixa da fazenda (gêmeo digital) e satélite ao vivo por baixo dela
    m.addSource('snapbg', { type: 'raster', tiles: [ESRI_IMG], tileSize: 256, maxzoom: 19 });
    m.addLayer({ id: 'snapbg', type: 'raster', source: 'snapbg', layout: { visibility: 'none' } });
    m.addLayer({ id: 'labels', type: 'raster', source: 'labels' });

    ['car', 'talhoes', 'talhoes-prev', 'phase-flash', 'leaders', 'draw', 'preview', 'adjust', 'wand'].forEach(src);
    // CAR: vegetação nativa, reserva legal, APP e limite do imóvel
    m.addLayer({ id: 'car-fill', type: 'fill', source: 'car', paint: { 'fill-color': ['get', 'fill'], 'fill-opacity': ['get', 'fo'] }, filter: ['==', ['geometry-type'], 'Polygon'] });
    m.addLayer({ id: 'car-line', type: 'line', source: 'car', paint: { 'line-color': ['get', 'stroke'], 'line-width': ['get', 'w'] }, filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['!=', ['get', 'kind'], 'limite']] });
    m.addLayer({ id: 'car-limit', type: 'line', source: 'car', paint: { 'line-color': '#f59e0b', 'line-width': 3, 'line-dasharray': [2.5, 2] }, filter: ['==', ['get', 'kind'], 'limite'] });

    // talhões: textura/cor da cultura e fase, contorno branco, realce ao passar o mouse
    m.addLayer({ id: 'talhoes-fill', type: 'fill', source: 'talhoes', paint: {
      'fill-pattern': ['get', 'pattern'],
      'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.85, 0.6],
    } });
    // aparência anterior das lavouras (some devagar quando o tempo avança)
    m.addLayer({ id: 'talhoes-prev-fill', type: 'fill', source: 'talhoes-prev', paint: { 'fill-pattern': ['get', 'pattern'], 'fill-opacity': 0 } });
    // contorno que pulsa nos talhões que mudaram de fase
    m.addLayer({ id: 'phase-flash', type: 'line', source: 'phase-flash', paint: { 'line-color': '#d9ff9e', 'line-width': 2, 'line-opacity': 0, 'line-blur': 1 } });
    m.addLayer({ id: 'talhoes-line', type: 'line', source: 'talhoes', paint: {
      'line-color': '#ffffff', 'line-opacity': 0.9,
      'line-width': ['case', ['boolean', ['feature-state', 'hover'], false], 3.5, 1.5],
    } });
    m.addLayer({ id: 'leaders', type: 'line', source: 'leaders', minzoom: Z(11), paint: { 'line-color': ['get', 'color'], 'line-width': 1.5, 'line-dasharray': [1.5, 2], 'line-opacity': 0.85 }, filter: ['==', ['geometry-type'], 'LineString'] });
    m.addLayer({ id: 'leaders-dot', type: 'circle', source: 'leaders', minzoom: Z(11), paint: { 'circle-radius': 3, 'circle-color': '#ffffff', 'circle-stroke-color': ['get', 'color'], 'circle-stroke-width': 1.5 }, filter: ['==', ['geometry-type'], 'Point'] });

    // desenho, prévia digitada, ajuste e varinha
    const dashed = (id: string, color: string, fillOpacity: number) => {
      m.addLayer({ id: `${id}-fill`, type: 'fill', source: id, paint: { 'fill-color': color, 'fill-opacity': fillOpacity }, filter: ['==', ['geometry-type'], 'Polygon'] });
      m.addLayer({ id: `${id}-line`, type: 'line', source: id, paint: { 'line-color': color, 'line-width': 3, 'line-dasharray': [2, 2] }, filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'LineString']]] });
      m.addLayer({ id: `${id}-pt`, type: 'circle', source: id, paint: {
        'circle-radius': ['case', ['get', 'first'], 8, 6], 'circle-color': ['case', ['get', 'first'], '#22c55e', '#3b82f6'],
        'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2,
      }, filter: ['==', ['geometry-type'], 'Point'] });
    };
    dashed('draw', '#22c55e', 0.25);
    dashed('preview', '#22c55e', 0.28);
    m.addLayer({ id: 'adjust-line', type: 'line', source: 'adjust', paint: { 'line-color': '#ffd84d', 'line-width': 2, 'line-dasharray': [2, 2] } });
    m.addLayer({ id: 'wand-fill', type: 'fill', source: 'wand', paint: { 'fill-color': '#ffd84d', 'fill-opacity': 0.25 } });
    m.addLayer({ id: 'wand-line', type: 'line', source: 'wand', paint: { 'line-color': '#ffd84d', 'line-width': 3, 'line-dasharray': [2, 1.5] } });

    // interação com os talhões
    m.on('mousemove', 'talhoes-fill', (e) => {
      const id = e.features?.[0]?.id as number | undefined;
      if (id === undefined || id === this.hoverId) return;
      if (this.hoverId !== null) m.setFeatureState({ source: 'talhoes', id: this.hoverId }, { hover: false });
      this.hoverId = id; m.setFeatureState({ source: 'talhoes', id }, { hover: true });
      if (!this.isDrawingTalhao && !this.isPlacingWaterPoint && !this.wandOn) m.getCanvas().style.cursor = 'pointer';
    });
    m.on('mouseleave', 'talhoes-fill', () => {
      if (this.hoverId !== null) m.setFeatureState({ source: 'talhoes', id: this.hoverId }, { hover: false });
      this.hoverId = null; m.getCanvas().style.cursor = '';
    });
    m.on('click', 'talhoes-fill', (e) => {
      if (this.isDrawingTalhao || this.isPlacingWaterPoint || this.wandOn || this.adjusting) return;
      const idx = e.features?.[0]?.id as number | undefined;
      const tl = idx !== undefined ? this.lastTalhoes[idx] : undefined;
      if (!tl) return;
      this.expandedTalhaoIds.add(tl.id);
      this.map.getContainer().querySelector(`.talhao-label-badge[data-talhaoid="${tl.id}"]`)?.classList.add('user-expanded');
      this.openTalhaoPopup(tl, e.lngLat);
    });

    this.layersReady = true;
    // reaplica o que foi pedido antes de o mapa terminar de carregar
    if (this.lastTalhoes.length) this.renderTalhoes(this.lastTalhoes);
  }

  private setData(id: string, data: FC): void {
    const s = this.map.getSource(id) as GeoJSONSource | undefined;
    if (s) s.setData(data);
  }

  // ==========================================
  // SELETOR DE MAPA BASE (Esri / NASA / OSM) + RÓTULOS
  // ==========================================
  private addLayerSwitcher(): void {
    const box = document.createElement('div');
    box.className = 'maplibregl-ctrl ml-layers';
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'ml-layers-btn'; btn.title = t('layerSatellite'); btn.setAttribute('aria-label', 'Camadas'); btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 2 8l10 5 10-5-10-5Z"/><path d="m2 13 10 5 10-5"/><path d="m2 17.5 10 5 10-5" opacity=".55"/></svg>';
    const menu = document.createElement('div');
    menu.className = 'ml-layers-menu'; menu.hidden = true;
    const opts: [BaseId, string][] = [['esri', t('layerSatellite')], ['landsat', lt('name')], ['nasa', t('layerNasa')], ['osm', t('layerRoads')]];
    menu.innerHTML = `
      <fieldset><legend class="sr-only">Mapa base</legend>
        ${opts.map(([id, name]) => `<label><input type="radio" name="ml-base" value="${id}" ${id === this.base ? 'checked' : ''}/> <span>${name}</span></label>`).join('')}
      </fieldset>
      <label class="ml-sep"><input type="checkbox" name="ml-labels" ${this.labelsOn ? 'checked' : ''}/> <span>${t('layerLabels')}</span></label>`;
    const date = document.createElement('div');
    date.className = 'nasa-date-ctl'; date.hidden = true;
    date.innerHTML = `<label><span>${t('layerNasaDate')}</span><input type="date" value="${this.nasaDate}" max="${nasaDefaultDate()}" min="2013-04-01" title="${t('layerNasaNote')}" /></label><p class="nasa-date-status" hidden></p><p class="nasa-date-note">${t('layerNasaNote')}</p>`;
    this.nasaDateBox = date;
    box.append(btn, menu, date);
    btn.onclick = () => { menu.hidden = !menu.hidden; btn.setAttribute('aria-expanded', String(!menu.hidden)); };
    document.addEventListener('click', (e) => { if (!box.contains(e.target as Node)) { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); } });
    menu.querySelectorAll<HTMLInputElement>('input[name="ml-base"]').forEach((r) => r.addEventListener('change', () => this.setBase(r.value as BaseId)));
    menu.querySelector<HTMLInputElement>('input[name="ml-labels"]')!.addEventListener('change', (e) => {
      this.labelsOn = (e.target as HTMLInputElement).checked;
      void this.ready.then(() => this.map.setLayoutProperty('labels', 'visibility', this.labelsOn ? 'visible' : 'none'));
    });
    date.querySelector('input')!.addEventListener('change', (e) => {
      const v = (e.target as HTMLInputElement).value;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
      if (this.base === 'landsat') { this.setLandsatDate(v); this.dateStatus(''); return; }
      this.nasaDate = v;
      (this.map.getSource('nasa') as RasterTileSource | undefined)?.setTiles([nasaTrueColorUrl(v)]);
    });
    // Landsat: ao levar o mapa para longe (> ~60 km) da última busca, procura a passagem mais recente do novo lugar
    this.map.on('moveend', () => {
      if (this.base !== 'landsat' || !this.landsatProbe) return;
      if (this.map.getCenter().distanceTo(this.landsatProbe) > 60_000) void this.pickLandsat();
    });
    this.map.addControl(new ElControl(box), 'top-right');
  }

  private setBase(id: BaseId): void {
    this.base = id;
    void this.ready.then(() => {
      // Landsat só aparece depois que a busca escolhe a data (antes disso os tiles do dia ainda não existem)
      const show = (b: BaseId) => b === id && (b !== 'landsat' || this.landsatReady);
      (['esri', 'landsat', 'nasa', 'osm'] as BaseId[]).forEach((b) => this.map.setLayoutProperty(`base-${b}`, 'visibility', show(b) ? 'visible' : 'none'));
      this.applySnapZoom();
    });
    const box = this.nasaDateBox;
    if (box) {
      box.hidden = id !== 'nasa' && id !== 'landsat';
      const input = box.querySelector('input')!;
      box.querySelector<HTMLElement>('.nasa-date-note')!.textContent = id === 'landsat' ? lt('note') : t('layerNasaNote');
      input.value = id === 'landsat' ? this.landsatDate : this.nasaDate;
      if (id !== 'landsat') this.dateStatus('');
    }
    if (id === 'landsat' && !this.landsatProbe) void this.pickLandsat();
  }

  private dateStatus(txt: string): void {
    const p = this.nasaDateBox?.querySelector<HTMLElement>('.nasa-date-status');
    if (p) { p.textContent = txt; p.hidden = !txt; }
  }

  private setLandsatDate(d: string): void {
    this.landsatDate = d;
    (this.map.getSource('landsat') as RasterTileSource | undefined)?.setTiles([landsatUrl(d)]);
    if (!this.landsatReady) {
      this.landsatReady = true;
      if (this.base === 'landsat') void this.ready.then(() => this.map.setLayoutProperty('base-landsat', 'visibility', 'visible'));
    }
    const input = this.nasaDateBox?.querySelector('input');
    if (input && this.base === 'landsat') input.value = d;
  }

  /** Procura a passagem Landsat mais recente e sem nuvem no centro do mapa e a mostra. */
  private async pickLandsat(): Promise<void> {
    const c = this.map.getCenter();
    this.landsatProbe = c;
    const seq = ++this.landsatSeq;
    this.dateStatus(lt('searching'));
    const pick = await findLandsatDate(c.lat, c.lng).catch(() => null);
    if (seq !== this.landsatSeq) return; // outra busca começou depois
    if (!pick) { this.dateStatus(lt('none')); return; }
    this.setLandsatDate(pick.date);
    const d = new Date(pick.date + 'T12:00:00Z').toLocaleDateString(undefined, { timeZone: 'UTC' });
    this.dateStatus(lt('found', { d, c: pick.cloud > 0.15 ? lt('cloudy', { p: Math.round(pick.cloud * 100) }) : '' }));
  }

  // ==========================================
  // CLIQUES NO MAPA
  // ==========================================
  private setupMapListeners(): void {
    this.map.on('click', (e) => {
      const p: LatLng = [e.lngLat.lat, e.lngLat.lng];
      if (this.isPlacingWaterPoint) {
        this.endPlacingWaterPoint();
        this.events.onWaterPointClick(p[0], p[1]);
        return;
      }
      if (this.wandOn) { this.wandAt(p); return; }
      if (this.isDrawingTalhao) this.addDrawingPoint(p[0], p[1]);
    });
    this.map.on('mousemove', (e) => {
      if (this.isDrawingTalhao && this.drawingPoints.length > 0) {
        this.guideTo = [e.lngLat.lat, e.lngLat.lng];
        this.updateDrawingVisuals(false);
      }
    });
  }

  // ==========================================
  // TALHÕES
  // ==========================================
  private patterns = new Set<string>();
  /** Textura da lavoura (linhas de plantio/pontos) como imagem para o 'fill-pattern'. */
  private ensurePattern(look: TwinLook): string {
    const id = `twin-${look.kind}-${look.base.slice(1)}`;
    if (this.patterns.has(id) || this.map.hasImage(id)) { this.patterns.add(id); return id; }
    const S = 12, c = document.createElement('canvas'); c.width = S; c.height = S;
    const g = c.getContext('2d')!;
    g.fillStyle = look.base; g.fillRect(0, 0, S, S);
    g.fillStyle = look.row; g.globalAlpha = 0.75;
    if (look.kind === 'rows') { g.fillRect(0, 0, 2, S); g.fillRect(6, 0, 2, S); }
    if (look.kind === 'dots') { [[2, 2], [8, 6], [4, 9]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 1.1, 0, Math.PI * 2); g.fill(); }); }
    this.map.addImage(id, g.getImageData(0, 0, S, S));
    this.patterns.add(id);
    return id;
  }

  public renderTalhoes(talhoes: Talhao[], referenceDate?: string): void {
    // Passagem de tempo (+1 semana, voltar…): guarda como estava para animar a mudança
    const prevRef = this.currentReferenceDate;
    const timeJump = !!referenceDate && referenceDate !== prevRef && this.layersReady && this.lastPolys.length > 0;
    const before = timeJump ? new Map(talhoes.map((tl) => [tl.id, calculateTalhaoCropStatus(tl, prevRef)])) : null;
    const prevPolys = timeJump ? this.lastPolys : null;
    if (referenceDate) this.currentReferenceDate = referenceDate;
    this.lastTalhoes = talhoes;
    this.talhaoMarkers.forEach((mk) => mk.remove());
    this.talhaoMarkers = [];
    if (!this.layersReady) return; // o 'load' chama de novo

    const z = this.map.getZoom();
    const isBelowZoom14 = z < Z(14) || (talhoes.length > 8 && z < Z(15.3));
    this.map.getContainer().classList.toggle('map-zoom-below-14', isBelowZoom14);

    const polys: Feature[] = [];
    const leaders: Feature[] = [];
    const placed: { x: number; y: number }[] = [];

    talhoes.forEach((talhao, index) => {
      if (!talhao.coordinates?.length) return;
      const cropColor = getCropColor(talhao.crop);
      const cropStatus = calculateTalhaoCropStatus(talhao, this.currentReferenceDate);
      let pattern = '';
      try { pattern = this.ensurePattern(twinLook(talhao.crop, cropStatus.phase.key)); } catch { pattern = ''; }
      polys.push(polyFeature(talhao.coordinates, { pattern, color: cropColor }, index));

      // rótulo: centro do talhão, afastado se colidir com outro rótulo
      const trueCenter = calculatePolygonCenter(talhao.coordinates) as LatLng;
      let pt = this.map.project(ll(trueCenter));
      const minDistance = isBelowZoom14 ? 40 : 80;
      let moved = false;
      for (const q of placed) {
        const dx = pt.x - q.x, dy = pt.y - q.y, dist = Math.hypot(dx, dy);
        if (dist < minDistance) {
          moved = true;
          const angle = dist > 0.001 ? Math.atan2(dy, dx) : Math.PI / 2;
          const push = minDistance - dist + 24;
          pt = new maplibregl.Point(pt.x + Math.cos(angle) * push, pt.y + Math.sin(angle) * push);
        }
      }
      placed.push({ x: pt.x, y: pt.y });
      const lngLat = this.map.unproject(pt);
      const badgeCenter: LatLng = [lngLat.lat, lngLat.lng];
      if (moved) {
        leaders.push(lineFeature([trueCenter, badgeCenter], { color: cropColor }));
        leaders.push(pointFeature(trueCenter, { color: cropColor }));
      }

      const isExpanded = this.expandedTalhaoIds.has(talhao.id);
      const shortName = `T${String(index + 1).padStart(2, '0')}`;
      const displayName = isBelowZoom14 && !isExpanded ? shortName : talhao.name;
      const el = document.createElement('div');
      el.className = 'custom-talhao-label-container';
      el.innerHTML = `
        <div class="talhao-label-badge ${isExpanded ? 'user-expanded' : ''}" data-talhaoid="${talhao.id}" style="border-left: 4px solid ${cropColor}">
          <div class="talhao-label-header">
            <span class="tl-ring" style="--pct:${clampPct(cropStatus.progressPercent)}; --c:${cropColor}" title="${translateCropPhase(cropStatus.phase.key)} · ${cropStatus.progressPercent}%"><span class="talhao-crop-dot" style="background-color: ${cropColor}; color: ${cropColor}"></span></span>
            <span class="talhao-label-name">${displayName}</span>
          </div>
          <div class="talhao-badge-details">
            <div class="talhao-label-ha">${formatHectares(talhao.areaHectares)} • ${translateCropName(talhao.crop)}</div>
            <div class="talhao-label-phase" style="color: ${cropStatus.phase.badgeColor}">
              ${cropStatus.phase.icon} ${translateCropPhase(cropStatus.phase.key)} (${cropStatus.daysPassed}d • ${cropStatus.progressPercent}%)
            </div>
          </div>
        </div>`;
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (this.expandedTalhaoIds.has(talhao.id)) this.expandedTalhaoIds.delete(talhao.id);
        else this.expandedTalhaoIds.add(talhao.id);
        this.renderTalhoes(this.lastTalhoes);
      });
      this.talhaoMarkers.push(new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(ll(badgeCenter)).addTo(this.map));
    });

    this.setData('talhoes', fc(polys));
    this.setData('leaders', fc(leaders));
    this.lastPolys = polys;
    if (timeJump && before && prevPolys) this.playTimeLapse(prevRef, this.currentReferenceDate, before, talhoes, prevPolys);
  }

  // ==========================================
  // PASSAGEM DO TEMPO: data correndo, lavouras mudando de cor e destaque nas que mudaram de fase
  // ==========================================
  private lastPolys: Feature[] = [];
  private lapseTimer = 0;
  private lapseRaf = 0;
  private phaseChips: Marker[] = [];
  private static LAPSE: Record<string, [string, string, string, string, string]> = {
    pt: ['dias', '{n} talhão mudou de fase', '{n} talhões mudaram de fase', 'Nenhum talhão mudou de fase', 'e mais {n}'],
    en: ['days', '{n} field changed phase', '{n} fields changed phase', 'No field changed phase', 'and {n} more'],
    es: ['días', '{n} lote cambió de fase', '{n} lotes cambiaron de fase', 'Ningún lote cambió de fase', 'y {n} más'],
    de: ['Tage', '{n} Feld hat die Phase gewechselt', '{n} Felder haben die Phase gewechselt', 'Kein Feld hat die Phase gewechselt', 'und {n} weitere'],
    zh: ['天', '{n} 块地进入新阶段', '{n} 块地进入新阶段', '没有地块进入新阶段', '另有 {n} 块'],
    fr: ['jours', '{n} parcelle a changé de phase', '{n} parcelles ont changé de phase', 'Aucune parcelle n’a changé de phase', 'et {n} autres'],
  };
  private lt(i: number, n = 0): string { const l = (document.documentElement.lang || 'pt').slice(0, 2); return (MapManager.LAPSE[l] || MapManager.LAPSE.pt)[i].replace('{n}', String(n)); }

  private playTimeLapse(fromIso: string, toIso: string, before: Map<string, { phase: { key: string } }>, talhoes: Talhao[], prevPolys: Feature[]): void {
    const m = this.map, box = m.getContainer();
    const reduce = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.clearTimeout(this.lapseTimer); cancelAnimationFrame(this.lapseRaf);
    box.querySelectorAll('.tl-lapse, .tl-sweep').forEach((e) => e.remove());
    this.phaseChips.forEach((c) => c.remove()); this.phaseChips = [];

    const days = Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 864e5);
    const changed = talhoes.filter((tl) => {
      const b = before.get(tl.id);
      return b && tl.coordinates?.length && b.phase.key !== calculateTalhaoCropStatus(tl, toIso).phase.key;
    });

    // 1) cartão com a data correndo dia a dia
    const card = document.createElement('div');
    card.className = 'tl-lapse'; card.setAttribute('role', 'status');
    card.innerHTML = `<div class="tl-lapse-delta">${days > 0 ? '+' : ''}${days} ${this.lt(0)}</div><div class="tl-lapse-date"></div><div class="tl-lapse-sum"></div><ul class="tl-lapse-list"></ul>`;
    box.appendChild(card);
    const dateEl = card.querySelector('.tl-lapse-date') as HTMLElement, sumEl = card.querySelector('.tl-lapse-sum') as HTMLElement;
    // 2) faixa de luz atravessando o mapa (o tempo passando)
    if (!reduce) { const sw = document.createElement('div'); sw.className = 'tl-sweep'; box.appendChild(sw); window.setTimeout(() => sw.remove(), 1500); }

    // 3) lavouras: a aparência antiga some e a nova aparece
    (m.getSource('talhoes-prev') as GeoJSONSource | undefined)?.setData(fc(prevPolys));
    const dur = reduce ? 1 : 1400, t0 = performance.now();
    const flashFc = fc(changed.map((tl) => polyFeature(tl.coordinates as LatLng[])));
    (m.getSource('phase-flash') as GeoJSONSource | undefined)?.setData(flashFc);
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / dur), e = k * k * (3 - 2 * k);
      m.setPaintProperty('talhoes-prev-fill', 'fill-opacity', 0.6 * (1 - e));
      // data: do início ao fim, um dia de cada vez
      const d = new Date(Date.parse(fromIso) + Math.round(days * e) * 864e5).toISOString().slice(0, 10);
      dateEl.textContent = formatDateI18n(d);
      // contorno pulsando nos talhões que mudaram de fase (3 pulsos)
      const pulse = Math.sin(k * Math.PI * 3) ** 2;
      if (m.getLayer('phase-flash')) { m.setPaintProperty('phase-flash', 'line-width', 2 + 5 * pulse); m.setPaintProperty('phase-flash', 'line-opacity', 0.35 + 0.65 * pulse); }
      if (k < 1) { this.lapseRaf = requestAnimationFrame(step); return; }
      // fim: resumo e etiquetas com a nova fase
      sumEl.textContent = changed.length ? this.lt(changed.length === 1 ? 1 : 2, changed.length) : this.lt(3);
      card.classList.add('done');
      (m.getSource('talhoes-prev') as GeoJSONSource | undefined)?.setData(EMPTY);
      // a nova fase de cada talhão vai numa lista dentro do cartão (etiquetas soltas no mapa se amontoavam);
      // o contorno pulsando mostra no mapa quais talhões mudaram
      const MAX = 6;
      const list = card.querySelector('.tl-lapse-list') as HTMLElement;
      list.innerHTML = changed.slice(0, MAX).map((tl) => {
        const st = calculateTalhaoCropStatus(tl, toIso);
        const name = tl.name.replace(/s*[[^]]*]s*/, '');
        return `<li style="--c:${st.phase.badgeColor}"><b>${escapeHtml(name)}</b><span>${escapeHtml(translateCropPhase(st.phase.key))}</span></li>`;
      }).join('') + (changed.length > MAX ? `<li class="more">${this.lt(4, changed.length - MAX)}</li>` : '');
      this.lapseTimer = window.setTimeout(() => {
        card.classList.add('out');
        this.phaseChips.forEach((c) => c.getElement().classList.add('out'));
        (m.getSource('phase-flash') as GeoJSONSource | undefined)?.setData(EMPTY);
        window.setTimeout(() => { card.remove(); this.phaseChips.forEach((c) => c.remove()); this.phaseChips = []; }, 400);
      }, changed.length ? 5200 : 3200);
    };
    this.lapseRaf = requestAnimationFrame(step);
  }

  private openTalhaoPopup(talhao: Talhao, at: maplibregl.LngLat): void {
    const cropStatus = calculateTalhaoCropStatus(talhao, this.currentReferenceDate);
    const cropLabel = translateCropName(talhao.crop);
    const phaseLabel = translateCropPhase(cropStatus.phase.key);
    const el = document.createElement('div');
    el.className = 'talhao-popup';
    el.innerHTML = `
      <div class="popup-header" style="border-bottom: 3px solid ${talhao.color}">
        <span class="color-dot" style="background-color: ${talhao.color}"></span>
        <div><h3 class="popup-title">${talhao.name}</h3></div>
      </div>
      <div class="popup-body">
        <div class="popup-row"><span class="popup-label">${t('sheetAreaLabel')}</span><span class="popup-value highlight">${formatHectares(talhao.areaHectares)}</span></div>
        <div class="popup-row"><span class="popup-label">${t('sheetPerimeterLabel')}</span><span class="popup-value">${formatNumber(talhao.perimeterKm, 2)} km</span></div>
        ${talhao.crop ? `<div class="popup-row"><span class="popup-label">${t('lblCrop')}:</span><span class="popup-value crop-badge">${cropLabel} ${talhao.cultivar ? `(${talhao.cultivar})` : ''}</span></div>` : ''}
        <div class="popup-row"><span class="popup-label">${t('legendCropsTitle')}:</span><span class="popup-value" style="color: ${cropStatus.phase.badgeColor}; font-weight: 700;">${cropStatus.phase.icon} ${phaseLabel}</span></div>
        ${talhao.plantingDate ? `<div class="popup-row"><span class="popup-label">${t('lblPlantingDate')} / ${t('lblExpectedHarvest')}:</span><span class="popup-value" style="font-size: 12px;">${formatDateI18n(talhao.plantingDate)} • ${cropStatus.expectedHarvest ? formatDateI18n(cropStatus.expectedHarvest) : ''} (${talhao.cycleDays || ''}d)</span></div>` : ''}
        ${talhao.nextCropPlan ? `<div class="popup-row"><span class="popup-label">${t('drawerNextCrop')}:</span><span class="popup-value" style="font-size: 12px; color: #2f6690;">${translateCropName(talhao.nextCropPlan.crop)} (${talhao.nextCropPlan.plannedPlanting})</span></div>` : ''}
        ${talhao.notes ? `<div class="popup-row notes"><span class="popup-label">${t('lblNotes')}:</span><p class="popup-notes-text">${talhao.notes}</p></div>` : ''}
      </div>
      <div class="popup-actions">
        <button class="popup-btn edit-btn" type="button">${t('btnEdit')}</button>
        <button class="popup-btn delete-btn" type="button">${t('btnDelete')}</button>
      </div>`;
    el.querySelector<HTMLButtonElement>('.edit-btn')!.onclick = (e) => { e.stopPropagation(); this.closePopup(); this.events.onTalhaoEdit(talhao); };
    el.querySelector<HTMLButtonElement>('.delete-btn')!.onclick = (e) => { e.stopPropagation(); this.closePopup(); this.events.onTalhaoDelete(talhao.id); };
    this.showPopup(el, at, 300);
  }

  private showPopup(el: HTMLElement, at: maplibregl.LngLatLike, maxWidth: number): void {
    this.closePopup();
    this.popup = new maplibregl.Popup({ maxWidth: `${maxWidth}px`, offset: 12, className: 'sa-popup' }).setLngLat(at).setDOMContent(el).addTo(this.map);
  }
  private closePopup(): void { this.popup?.remove(); this.popup = null; }

  // ==========================================
  // ESTRUTURAS E PONTOS DE ÁGUA
  // ==========================================
  public renderWaterPoints(waterPoints: WaterPoint[]): void {
    this.waterMarkers.forEach((mk) => mk.remove());
    this.waterMarkers = [];
    waterPoints.forEach((wp) => {
      const meta = WATER_POINT_META[wp.type];
      const el = document.createElement('div');
      el.className = 'water-point-container';
      el.innerHTML = `
        <div class="water-point-pin" style="background-color: ${meta.color}; box-shadow: 0 8px 24px rgba(24, 43, 37, 0.12)" title="${wp.name}">
          <span class="water-point-emoji">${meta.icon}</span>
        </div>
        <div class="water-point-tag water-point-hover-tag">${wp.name}</div>`;
      el.setAttribute('role', 'button'); el.setAttribute('aria-label', wp.name); el.tabIndex = 0;
      const open = (ev: Event) => {
        ev.stopPropagation();
        if (this.isDrawingTalhao || this.isPlacingWaterPoint) return;
        const box = document.createElement('div');
        box.className = 'water-popup';
        box.innerHTML = `
          <div class="popup-header" style="border-bottom: 3px solid ${meta.color}">
            <span class="water-icon">${meta.icon}</span>
            <div>
              <h3 class="popup-title">${wp.name}</h3>
              <span class="water-type-pill" style="background-color: ${meta.badgeBg}; color: ${meta.color}">${translateStructureType(wp.type)}</span>
            </div>
          </div>
          <div class="popup-body">
            <div class="popup-row"><span class="popup-label">${t('thLat')} / ${t('thLng')}:</span><span class="popup-value coords">${formatNumber(wp.coordinates[0], 5)}, ${formatNumber(wp.coordinates[1], 5)}</span></div>
            ${wp.notes ? `<div class="popup-row notes"><span class="popup-label">${t('lblNotes')}:</span><p class="popup-notes-text">${wp.notes}</p></div>` : ''}
          </div>
          <div class="popup-actions"><button class="popup-btn delete-btn" type="button">${t('btnDelete')}</button></div>`;
        box.querySelector<HTMLButtonElement>('.delete-btn')!.onclick = (e) => { e.stopPropagation(); this.closePopup(); this.events.onWaterPointDelete(wp.id); };
        this.showPopup(box, ll(wp.coordinates as LatLng), 280);
      };
      el.addEventListener('click', open);
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') open(e); });
      this.waterMarkers.push(new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(ll(wp.coordinates as LatLng)).addTo(this.map));
    });
  }

  // ==========================================
  // DESENHO DE TALHÃO
  // ==========================================
  public startDrawingTalhao(): void {
    this.cancelDrawing();
    this.endPlacingWaterPoint();
    this.isDrawingTalhao = true;
    this.map.getContainer().classList.add('drawing-mode-active');
    this.map.getCanvas().style.cursor = 'crosshair';
    this.events.onDrawingProgress(0, 0);
  }

  private addDrawingPoint(lat: number, lng: number): void {
    // perto do primeiro ponto (com 3+ pontos): fecha o talhão
    if (this.drawingPoints.length >= 3) {
      const first = this.drawingPoints[0];
      const px = this.map.project(ll(first)), q = this.map.project([lng, lat]);
      if (distM([lat, lng], first) < 30 || Math.hypot(px.x - q.x, px.y - q.y) < 14) { this.finishDrawingTalhao(); return; }
    }
    this.drawingPoints.push([lat, lng]);
    this.updateDrawingVisuals();
  }

  private updateDrawingVisuals(notify = true): void {
    const pts = this.drawingPoints;
    const f: Feature[] = [];
    if (pts.length >= 3) f.push(polyFeature(pts));
    else if (pts.length === 2) f.push(lineFeature(pts));
    if (this.guideTo && pts.length) f.push(lineFeature([pts[pts.length - 1], this.guideTo]));
    pts.forEach((p, i) => f.push(pointFeature(p, { first: i === 0 })));
    this.setData('draw', fc(f));
    if (notify) this.events.onDrawingProgress(pts.length, pts.length >= 3 ? calculatePolygonAreaHectares(pts) : 0);
  }

  public undoLastDrawingPoint(): void {
    if (!this.isDrawingTalhao || this.drawingPoints.length === 0) return;
    this.drawingPoints.pop();
    if (!this.drawingPoints.length) this.guideTo = null;
    this.updateDrawingVisuals();
  }

  public finishDrawingTalhao(): void {
    if (this.drawingPoints.length < 3) return;
    const coords = [...this.drawingPoints];
    this.cancelDrawing();
    this.events.onDrawingComplete(coords, calculatePolygonAreaHectares(coords), calculatePerimeterKm(coords));
  }

  public cancelDrawing(): void {
    this.isDrawingTalhao = false;
    this.drawingPoints = [];
    this.guideTo = null;
    this.setData('draw', EMPTY);
    this.map.getContainer().classList.remove('drawing-mode-active');
    this.map.getCanvas().style.cursor = '';
  }

  public startPlacingWaterPoint(type: WaterPointType): void {
    this.cancelDrawing();
    this.isPlacingWaterPoint = true;
    this.pendingWaterType = type;
    this.map.getContainer().classList.add('water-placing-active');
    this.map.getCanvas().style.cursor = 'crosshair';
  }

  public endPlacingWaterPoint(): void {
    this.isPlacingWaterPoint = false;
    this.map.getContainer().classList.remove('water-placing-active');
    if (!this.isDrawingTalhao) this.map.getCanvas().style.cursor = '';
  }

  // ==========================================
  // CÂMERA
  // ==========================================
  public fitBoundsToTalhao(talhao: Talhao): void {
    if (!talhao.coordinates.length) return;
    this.map.fitBounds(boundsOf(talhao.coordinates as LatLng[]), { padding: 60, maxZoom: Z(16) });
  }

  public fitBoundsToFarm(talhoes: Talhao[], waterPoints: WaterPoint[]): void {
    const all: LatLng[] = [];
    talhoes.forEach((tl) => tl.coordinates.forEach((c) => all.push(c as LatLng)));
    waterPoints.forEach((wp) => all.push(wp.coordinates as LatLng));
    if (all.length) this.map.fitBounds(boundsOf(all), { padding: 50, maxZoom: Z(16) });
    else this.map.jumpTo({ center: ll([-17.805, -51.085]), zoom: Z(13) });
  }

  public panTo(lat: number, lng: number, zoom = 15): void {
    this.map.jumpTo({ center: [lng, lat], zoom: Z(zoom) });
  }

  // ==========================================
  // PRÉVIA DE COORDENADAS DIGITADAS
  // ==========================================
  public previewTypedCoordinates(coords: [number, number][]): void {
    this.clearTypedPreview();
    if (!coords.length) return;
    const f: Feature[] = [];
    if (coords.length >= 3) f.push(polyFeature(coords));
    else if (coords.length === 2) f.push(lineFeature(coords));
    coords.forEach((c, i) => f.push(pointFeature(c, { first: i === 0 })));
    this.setData('preview', fc(f));
    if (coords.length >= 3) {
      const el = document.createElement('div');
      el.className = 'custom-talhao-label-container';
      el.innerHTML = `<div class="talhao-label-badge" style="border-left: 5px solid #245b43; border-style: dashed;"><div class="talhao-label-name">Prévia do Talhão</div><div class="talhao-label-ha">${formatHectares(calculatePolygonAreaHectares(coords))}</div></div>`;
      el.style.pointerEvents = 'none';
      this.previewMarkers.push(new maplibregl.Marker({ element: el }).setLngLat(ll(calculatePolygonCenter(coords) as LatLng)).addTo(this.map));
    }
    this.map.fitBounds(boundsOf(coords), { padding: 80, maxZoom: Z(16) });
  }

  public clearTypedPreview(): void {
    this.setData('preview', EMPTY);
    this.previewMarkers.forEach((mk) => mk.remove());
    this.previewMarkers = [];
  }

  public previewTypedWaterPoint(lat: number, lng: number, type: WaterPointType): void {
    this.clearTypedPreview();
    const meta = WATER_POINT_META[type];
    const el = document.createElement('div');
    el.className = 'water-point-container';
    el.innerHTML = `<div class="water-point-pin" style="background-color: ${meta.color}; box-shadow: 0 8px 24px rgba(24, 43, 37, 0.12)"><span class="water-point-emoji">${meta.icon}</span></div><div class="water-point-tag">Prévia: ${meta.label}</div>`;
    this.previewMarkers.push(new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(this.map));
    this.map.jumpTo({ center: [lng, lat], zoom: Z(15) });
  }

  // ==========================================
  // GÊMEO DIGITAL: foto fixa da fazenda como fundo (offline após a 1ª vez)
  // ==========================================
  private snapUrl = '';
  private snapBounds: [[number, number], [number, number]] | null = null;
  private snapData: ImageData | null = null;
  private snapOn = false;
  private snapCtl: HTMLElement | null = null;

  /** Em zoom alto e com internet, a imagem ao vivo (mais nítida) aparece por cima da foto fixa. */
  private applySnapZoom(): void {
    if (!this.snapOn || !this.map.getLayer('snapshot')) return;
    const esri = this.base === 'esri';
    const hi = this.map.getZoom() >= Z(15) && navigator.onLine;
    // foto fixa e satélite ao vivo por baixo dela só valem com a base de alta resolução; com NASA/OSM somem
    this.map.setPaintProperty('snapshot', 'raster-opacity', hi || !esri ? 0 : 1);
    this.map.setLayoutProperty('snapbg', 'visibility', esri && navigator.onLine ? 'visible' : 'none');
  }

  /** Limites de zoom e de arraste: com internet o mapa é livre (mundo todo); sem internet fica preso à foto fixa da fazenda. */
  private applySnapLimits(): void {
    if (!navigator.onLine && this.snapBounds) {
      const [[s, w], [n, e]] = this.snapBounds;
      const b: LngLatBoundsLike = [[w, s], [e, n]];
      this.map.setMinZoom(this.map.cameraForBounds(b)?.zoom ?? Z(13));
      this.map.setMaxBounds(b);
      return;
    }
    this.map.setMaxBounds(null);
    this.map.setMinZoom(0);
  }

  public refitAfterResize(talhoes: Talhao[], waterPoints: WaterPoint[]): void {
    this.map.resize();
    this.applySnapLimits();
    this.fitBoundsToFarm(talhoes, waterPoints);
  }

  public async useFarmSnapshot(talhoes: Talhao[], waterPoints: WaterPoint[], force = false): Promise<void> {
    await this.ready;
    const pts: LatLng[] = [];
    talhoes.forEach((tl) => tl.coordinates.forEach((c) => pts.push([c[0], c[1]])));
    waterPoints.forEach((w) => pts.push([w.coordinates[0], w.coordinates[1]]));
    const demo = talhoes.length > 0 && talhoes.every((tl) => tl.isExample);
    const b = demo ? CAR_VIEW : farmBounds(pts);
    if (!b) return;
    const snap: Snap | null = await ensureSnapshot(b, force);
    if (!snap) return;
    if (this.snapUrl) URL.revokeObjectURL(this.snapUrl);
    this.snapUrl = URL.createObjectURL(snap.blob);
    this.snapBounds = snap.bounds as [[number, number], [number, number]];
    this.snapData = null;
    void this.loadSnapData();
    const [[s, w], [n, e]] = this.snapBounds;
    const corners: [[number, number], [number, number], [number, number], [number, number]] = [[w, n], [e, n], [e, s], [w, s]];
    const m = this.map;
    const existing = m.getSource('snapshot') as maplibregl.ImageSource | undefined;
    if (existing) existing.updateImage({ url: this.snapUrl, coordinates: corners });
    else {
      m.addSource('snapshot', { type: 'image', url: this.snapUrl, coordinates: corners });
      m.addLayer({ id: 'snapshot', type: 'raster', source: 'snapshot', paint: { 'raster-fade-duration': 0 } }, 'labels');
    }
    this.snapOn = true;
    m.setLayoutProperty('snapbg', 'visibility', navigator.onLine ? 'visible' : 'none');
    m.setMaxZoom(Z(17.5));
    this.applySnapLimits();
    m.on('zoomend', () => this.applySnapZoom());
    m.on('resize', () => this.applySnapLimits());
    if (demo) this.drawCarLayers(); else { this.setData('car', EMPTY); this.carMarkers.forEach((mk) => mk.remove()); this.carMarkers = []; }

    if (!this.snapCtl) {
      const d = document.createElement('div');
      d.className = 'maplibregl-ctrl snap-ctl';
      this.snapCtl = d;
      m.addControl(new ElControl(d), 'bottom-left');
    }
    const dt = new Date(snap.date).toLocaleDateString(document.documentElement.lang || undefined);
    this.snapCtl.innerHTML = `${dt} <button type="button" title="↻" aria-label="Atualizar foto da fazenda">↻</button>`;
    const rb = this.snapCtl.querySelector('button');
    if (rb) rb.onclick = () => { this.snapCtl!.textContent = '…'; void this.useFarmSnapshot(talhoes, waterPoints, true); };

    m.resize();
    if (demo) m.fitBounds(boundsOf(CAR_FIT as LatLng[]), { padding: 24, animate: false });
    else m.fitBounds(boundsOf(pts), { padding: 60, maxZoom: Z(16), animate: false });
    this.applySnapZoom();
  }

  // ---- Fazenda de exemplo: limite do imóvel, Reserva Legal e APP (do CAR) ----
  private static CARTXT: Record<string, [string, string, string]> = {
    pt: ['Reserva Legal', 'APP (área de preservação)', 'Limite do imóvel'],
    en: ['Legal Reserve', 'APP (protected area)', 'Property boundary'],
    es: ['Reserva Legal', 'APP (área protegida)', 'Límite del inmueble'],
    de: ['Gesetzliches Schutzgebiet', 'APP (Schutzzone)', 'Grundstücksgrenze'],
    zh: ['法定保护区', 'APP（保护区）', '地产边界'],
    fr: ['Réserve légale', 'APP (zone protégée)', 'Limite de la propriété'],
  };
  private drawCarLayers(): void {
    const l = (document.documentElement.lang || 'pt').slice(0, 2), tx = MapManager.CARTXT[l] || MapManager.CARTXT.pt;
    const f: Feature[] = [];
    CAR_NATIVA.forEach((r) => f.push(polyFeature(r as LatLng[], { kind: 'nativa', fill: '#84cc16', fo: 0.22, stroke: '#4d7c0f', w: 0.8 })));
    CAR_RESERVA.forEach((r) => f.push(polyFeature(r as LatLng[], { kind: 'reserva', fill: '#15803d', fo: 0.42, stroke: '#14532d', w: 1.4 })));
    CAR_APP.forEach((r) => f.push(polyFeature(r as LatLng[], { kind: 'app', fill: '#3b82f6', fo: 0.4, stroke: '#1d4ed8', w: 1 })));
    f.push(polyFeature(CAR_PROPERTY as LatLng[], { kind: 'limite', fill: '#000000', fo: 0, stroke: '#f59e0b', w: 3 }));
    this.setData('car', fc(f));
    // rótulos "Reserva Legal" nas maiores matas
    this.carMarkers.forEach((mk) => mk.remove());
    this.carMarkers = [];
    const area = (r: LatLng[]) => { const b = boundsOf(r); return (b.getNorth() - b.getSouth()) * (b.getEast() - b.getWest()); };
    (CAR_RESERVA as LatLng[][]).map((r) => ({ r, a: area(r) })).sort((x, y) => y.a - x.a).slice(0, 6).forEach(({ r }) => {
      let sy = 0, sx = 0; r.forEach((c) => { sy += c[0]; sx += c[1]; });
      const el = document.createElement('div'); el.className = 'car-label'; el.innerHTML = `<span>${tx[0]}</span>`; el.style.pointerEvents = 'none';
      this.carMarkers.push(new maplibregl.Marker({ element: el }).setLngLat([sx / r.length, sy / r.length]).addTo(this.map));
    });
  }

  // ==========================================
  // AJUSTAR TALHÕES: arrastar os cantos até a borda da lavoura
  // ==========================================
  private adjusting = false;
  private adjustBtn: HTMLButtonElement | null = null;
  private adjustMarkers: Marker[] = [];
  private static ADJ: Record<string, [string, string, string]> = {
    pt: ['Ajustar talhões', 'Concluir ajuste', 'Arraste os cantos até a borda da lavoura'],
    en: ['Adjust fields', 'Done adjusting', 'Drag the corners to the field edge'],
    es: ['Ajustar lotes', 'Terminar ajuste', 'Arrastre las esquinas al borde del lote'],
    de: ['Felder anpassen', 'Fertig', 'Ecken an den Feldrand ziehen'],
    zh: ['调整地块', '完成调整', '拖动角点到地块边缘'],
    fr: ['Ajuster les parcelles', 'Terminer', 'Faites glisser les coins au bord de la parcelle'],
  };
  private adjText(i: number): string { const l = (document.documentElement.lang || 'pt').slice(0, 2); return (MapManager.ADJ[l] || MapManager.ADJ.pt)[i]; }

  private topLeftBox: HTMLElement | null = null;
  private static TOOLS: Record<string, string> = { pt: 'Ferramentas', en: 'Tools', es: 'Herramientas', de: 'Werkzeuge', zh: '工具', fr: 'Outils' };
  /**
   * Menu "Ferramentas" do canto superior esquerdo: um botão que abre a lista (ajustar, marcar lavoura, saúde por satélite,
   * estresse hídrico…). Devolve a lista, onde cada recurso põe o seu botão. A ferramenta ligada (classe "on") continua à vista
   * com o menu fechado, para o produtor ver o que está ativo e poder desligar.
   */
  public topLeft(): HTMLElement {
    if (!this.topLeftBox) {
      const d = document.createElement('div');
      d.className = 'maplibregl-ctrl map-tools';
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'adjust-btn map-tools-toggle'; btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', 'map-tools-menu');
      const label = MapManager.TOOLS[(document.documentElement.lang || 'pt').slice(0, 2)] || MapManager.TOOLS.pt;
      btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg><span>${escapeHtml(label)}</span>`;
      const menu = document.createElement('div');
      menu.className = 'map-tools-menu'; menu.id = 'map-tools-menu'; menu.setAttribute('role', 'group'); menu.setAttribute('aria-label', label);
      const setOpen = (open: boolean) => { d.classList.toggle('open', open); btn.setAttribute('aria-expanded', String(open)); };
      btn.onclick = (e) => { e.stopPropagation(); setOpen(!d.classList.contains('open')); };
      // escolher uma ferramenta fecha o menu (os botões param a propagação, por isso a escuta é na captura);
      // cliques dentro dos painéis das ferramentas (ex.: controle da marcação de lavoura) não fecham
      menu.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('button.adjust-btn')) window.setTimeout(() => setOpen(false), 0); }, true);
      document.addEventListener('click', (e) => { if (!d.contains(e.target as Node)) setOpen(false); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && d.classList.contains('open')) { setOpen(false); btn.focus(); } });
      d.append(btn, menu);
      this.topLeftBox = menu;
      this.map.addControl(new ElControl(d), 'top-left');
    }
    return this.topLeftBox;
  }

  public addAdjustControl(): void {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'adjust-btn'; b.textContent = this.adjText(0);
    b.onclick = (e) => { e.stopPropagation(); this.setAdjustMode(!this.adjusting); };
    this.adjustBtn = b;
    this.topLeft().appendChild(b);
  }

  public setAdjustMode(on: boolean): void {
    this.adjusting = on;
    this.adjustMarkers.forEach((mk) => mk.remove());
    this.adjustMarkers = [];
    this.setData('adjust', EMPTY);
    if (this.adjustBtn) { this.adjustBtn.textContent = this.adjText(on ? 1 : 0); this.adjustBtn.classList.toggle('on', on); }
    this.map.getContainer().classList.toggle('adjusting', on);
    if (!on) return;
    if (this.wandOn) this.setWandMode(false);
    const outline = () => this.setData('adjust', fc(this.lastTalhoes.filter((tl) => tl.coordinates.length).map((tl) => polyFeature(tl.coordinates as LatLng[]))));
    outline();
    this.lastTalhoes.forEach((tl) => {
      tl.coordinates.forEach((c, i) => {
        const el = document.createElement('div'); el.className = 'adj-handle-wrap'; el.innerHTML = '<div class="adj-handle"></div>';
        const mk = new maplibregl.Marker({ element: el, draggable: true }).setLngLat(ll(c as LatLng)).addTo(this.map);
        mk.on('drag', () => { const p = mk.getLngLat(); tl.coordinates[i] = [p.lat, p.lng]; outline(); });
        mk.on('dragend', () => {
          tl.areaHectares = calculatePolygonAreaHectares(tl.coordinates);
          tl.perimeterKm = calculatePerimeterKm(tl.coordinates);
          this.events.onTalhaoGeometry?.(tl);
          const keep = this.adjusting; this.renderTalhoes(this.lastTalhoes); if (keep) this.setAdjustMode(true);
        });
        this.adjustMarkers.push(mk);
      });
    });
    this.map.getContainer().setAttribute('data-adjust-tip', this.adjText(2));
  }

  // ==========================================
  // MARCAR LAVOURA POR COR (varinha mágica) sobre a foto da fazenda
  // ==========================================
  private wandOn = false;
  private wandBtn: HTMLButtonElement | null = null;
  private wandPanel: HTMLElement | null = null;
  private wandSeed: LatLng | null = null;
  private wandTol = 20;
  private wandCoords: LatLng[] | null = null;
  private static WAND: Record<string, string[]> = {
    pt: ['Marcar lavoura (toque)', 'Cancelar marcação', 'Toque dentro de uma lavoura na imagem', 'Mais área', 'Menos área', 'Usar este talhão', 'Não consegui identificar. Toque em outro ponto.'],
    en: ['Mark field (tap)', 'Cancel marking', 'Tap inside a field on the image', 'More area', 'Less area', 'Use this field', 'Could not detect it. Tap another spot.'],
    es: ['Marcar lote (toque)', 'Cancelar marcado', 'Toque dentro de un lote en la imagen', 'Más área', 'Menos área', 'Usar este lote', 'No se pudo identificar. Toque otro punto.'],
    de: ['Feld markieren (tippen)', 'Abbrechen', 'Tippen Sie in ein Feld im Bild', 'Mehr Fläche', 'Weniger Fläche', 'Dieses Feld verwenden', 'Nicht erkannt. Anderen Punkt antippen.'],
    zh: ['点选地块', '取消标记', '在图像中点击一块农田', '扩大', '缩小', '使用此地块', '未能识别，请点击其他位置。'],
    fr: ['Marquer la parcelle (toucher)', 'Annuler', 'Touchez l’intérieur d’une parcelle sur l’image', 'Plus de surface', 'Moins de surface', 'Utiliser cette parcelle', 'Non détectée. Touchez un autre point.'],
  };
  private wt(i: number): string { const l = (document.documentElement.lang || 'pt').slice(0, 2); return (MapManager.WAND[l] || MapManager.WAND.pt)[i]; }

  private async loadSnapData(): Promise<void> {
    if (!this.snapUrl) return;
    const im = new Image(); im.src = this.snapUrl;
    try { await im.decode(); } catch { return; }
    const sc = Math.min(1, 1800 / im.naturalWidth), c = document.createElement('canvas');
    c.width = Math.round(im.naturalWidth * sc); c.height = Math.round(im.naturalHeight * sc);
    const g = c.getContext('2d', { willReadFrequently: true })!; g.drawImage(im, 0, 0, c.width, c.height);
    try { this.snapData = g.getImageData(0, 0, c.width, c.height); } catch { this.snapData = null; }
  }
  private static R = 6378137;
  private mx(lng: number) { return (lng * Math.PI * MapManager.R) / 180; }
  private my(lat: number) { return Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * MapManager.R; }
  private toPx(p: LatLng): [number, number] | null {
    if (!this.snapBounds || !this.snapData) return null;
    const [[s, w], [n, e]] = this.snapBounds, W = this.snapData.width, H = this.snapData.height;
    const x = ((this.mx(p[1]) - this.mx(w)) / (this.mx(e) - this.mx(w))) * W, y = ((this.my(n) - this.my(p[0])) / (this.my(n) - this.my(s))) * H;
    return x < 0 || y < 0 || x >= W || y >= H ? null : [x, y];
  }
  private toLatLng(x: number, y: number): LatLng {
    const [[s, w], [n, e]] = this.snapBounds!, W = this.snapData!.width, H = this.snapData!.height;
    const X = this.mx(w) + (x / W) * (this.mx(e) - this.mx(w)), Y = this.my(n) - (y / H) * (this.my(n) - this.my(s));
    return [((2 * Math.atan(Math.exp(Y / MapManager.R)) - Math.PI / 2) * 180) / Math.PI, (X * 180) / (Math.PI * MapManager.R)];
  }

  public addWandControl(): void {
    const box = document.createElement('div'); box.className = 'wand-box';
    const b = document.createElement('button'); b.type = 'button'; b.className = 'adjust-btn wand-btn'; b.textContent = this.wt(0);
    b.onclick = (e) => { e.stopPropagation(); this.setWandMode(!this.wandOn); };
    this.wandBtn = b;
    const pn = document.createElement('div'); pn.className = 'wand-panel'; pn.style.display = 'none'; this.wandPanel = pn;
    pn.addEventListener('click', (e) => e.stopPropagation());
    box.append(b, pn);
    this.topLeft().appendChild(box);
  }

  public setWandMode(on: boolean): void {
    this.wandOn = on; this.wandCoords = null; this.wandSeed = null;
    this.setData('wand', EMPTY);
    if (on) this.setAdjustMode(false);
    if (this.wandBtn) { this.wandBtn.textContent = this.wt(on ? 1 : 0); this.wandBtn.classList.toggle('on', on); }
    if (this.wandPanel) { this.wandPanel.style.display = on ? 'block' : 'none'; this.wandPanel.textContent = on ? this.wt(2) : ''; }
    this.map.getContainer().classList.toggle('wand-active', on);
    this.map.getCanvas().style.cursor = on ? 'crosshair' : '';
  }

  private wandAt(p: LatLng, tol?: number): void {
    if (tol !== undefined) this.wandTol = tol;
    const pt = this.toPx(p);
    if (!pt || !this.snapData) { if (this.wandPanel) this.wandPanel.textContent = this.wt(6); return; }
    this.wandSeed = p;
    const seg = segmentField(this.snapData, pt[0], pt[1], this.wandTol);
    if (!seg || seg.areaFrac > 0.7) { this.wandCoords = null; this.setData('wand', EMPTY); if (this.wandPanel) this.wandPanel.textContent = this.wt(6); return; }
    const coords = seg.poly.map(([x, y]) => this.toLatLng(x, y));
    this.wandCoords = coords;
    this.setData('wand', fc([polyFeature(coords)]));
    const pn = this.wandPanel!; pn.innerHTML = '';
    const info = document.createElement('div'); info.textContent = formatHectares(calculatePolygonAreaHectares(coords)); info.style.fontWeight = '700'; pn.appendChild(info);
    const mk = (txt: string, fn: () => void, cls = '') => { const bt = document.createElement('button'); bt.type = 'button'; bt.textContent = txt; bt.className = 'wand-mini ' + cls; bt.onclick = fn; pn.appendChild(bt); };
    mk(this.wt(4), () => this.wandAt(this.wandSeed!, Math.max(8, this.wandTol - 8)));
    mk(this.wt(3), () => this.wandAt(this.wandSeed!, Math.min(90, this.wandTol + 8)));
    mk(this.wt(5), () => { const c = this.wandCoords!; this.setWandMode(false); this.events.onDrawingComplete(c, calculatePolygonAreaHectares(c), calculatePerimeterKm(c)); }, 'ok');
  }

  // ==========================================
  // CAMADAS DA NASA (GIBS) SOBRE O MAPA
  // ==========================================
  private nasaOn = new Set<NasaLayerId>();
  private nasaStatus = new Map<NasaLayerId, { ok: number; err: number }>();
  public nasaLayerOn(id: NasaLayerId): boolean { return this.nasaOn.has(id); }
  public nasaLayerFailed(id: NasaLayerId): boolean { const s = this.nasaStatus.get(id); return !!s && s.err > 0 && s.ok === 0; }

  public setNasaLayer(id: NasaLayerId, on: boolean, tryIdx = 0): void {
    void this.ready.then(() => {
      const m = this.map, sid = `nasa-${id}`;
      if (m.getLayer(sid)) m.removeLayer(sid);
      if (m.getSource(sid)) m.removeSource(sid);
      if (!on) { this.nasaOn.delete(id); return; }
      const d = NASA_LAYERS.find((x) => x.id === id);
      const matrix = d?.matrices[tryIdx];
      if (!d || !matrix) return;
      const st = { ok: 0, err: 0 }; this.nasaStatus.set(id, st);
      m.addSource(sid, { type: 'raster', tiles: [nasaTileUrl(d, matrix)], tileSize: 256, maxzoom: matrixZoom(matrix), attribution: 'NASA GIBS' });
      m.addLayer({ id: sid, type: 'raster', source: sid, paint: { 'raster-opacity': 0.7 } }, 'car-fill');
      this.nasaOn.add(id);
      const onData = (e: maplibregl.MapSourceDataEvent) => { if (e.sourceId === sid && e.tile) st.ok++; };
      const onErr = (e: maplibregl.ErrorEvent & { sourceId?: string }) => { if (e.sourceId === sid) st.err++; };
      m.on('sourcedata', onData);
      m.on('error', onErr);
      // terminou de carregar sem nenhum tile: tenta o próximo conjunto de matriz da camada
      m.once('idle', () => {
        m.off('sourcedata', onData); m.off('error', onErr);
        if (st.ok === 0 && st.err > 0 && this.nasaOn.has(id) && tryIdx + 1 < d.matrices.length) this.setNasaLayer(id, true, tryIdx + 1);
      });
    });
  }

  public getMap(): MLMap { return this.map; }

  public invalidateSize(): void {
    this.map.resize();
  }
}
