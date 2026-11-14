/**
 * Focos de calor (NASA FIRMS, VIIRS 375 m) via Worker da Estrela (rota /fires).
 * A chave FIRMS fica só no Worker (segredo FIRMS_MAP_KEY); o app nunca a vê.
 */
import { Talhao } from '../types';
import { estelaBaseUrl } from '../admin/server';

export interface Fire { lat: number; lng: number; date: string; time: string; sat: string; conf: string; frp: number; temp: number; dn: string; }
export interface FireNear extends Fire { id: string; km: number; field: string; fieldId: string; dir: number; inside: boolean; at: Date; }
export type FiresResult = { ok: true; fires: Fire[]; geradoEm: string } | { ok: false; error: string };

export const NEAR_KM = 5;

export function bboxOf(talhoes: Talhao[], fallback: [number, number], margin = 0.25): [number, number, number, number] {
  const pts = talhoes.flatMap((t) => t.coordinates);
  if (!pts.length) pts.push(fallback);
  const lats = pts.map((p) => p[0]), lngs = pts.map((p) => p[1]);
  return [Math.min(...lngs) - margin, Math.min(...lats) - margin, Math.max(...lngs) + margin, Math.max(...lats) + margin];
}

export async function fetchFires(bbox: [number, number, number, number], days = 2): Promise<FiresResult> {
  const base = estelaBaseUrl();
  if (!base) return { ok: false, error: 'sem_servidor' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(base + '/fires', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bbox, days }), signal: ctrl.signal });
    const j = await r.json();
    if (!j || !j.ok) return { ok: false, error: String(j?.error || 'erro') };
    return { ok: true, fires: Array.isArray(j.fires) ? j.fires : [], geradoEm: String(j.geradoEm || '') };
  } catch { return { ok: false, error: 'rede' }; } finally { clearTimeout(timer); }
}

const KX = 111.32;
function toXY(lat: number, lng: number, lat0: number): [number, number] { return [lng * KX * Math.cos((lat0 * Math.PI) / 180), lat * 110.57]; }
function segDist(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
function inside(p: [number, number], poly: [number, number][]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    if (poly[i][1] > p[1] !== poly[j][1] > p[1] && p[0] < ((poly[j][0] - poly[i][0]) * (p[1] - poly[i][1])) / (poly[j][1] - poly[i][1]) + poly[i][0]) c = !c;
  }
  return c;
}
/** Distância (km) do foco ao talhão mais próximo; 0 se estiver dentro. Direção em graus (0 = norte). */
export function nearestField(f: Fire, talhoes: Talhao[]): { km: number; field: Talhao; dir: number; inside: boolean } | null {
  let best: { km: number; field: Talhao; dir: number; inside: boolean } | null = null;
  for (const t of talhoes) {
    if (t.coordinates.length < 3) continue;
    const poly = t.coordinates.map((c) => toXY(c[0], c[1], f.lat));
    const p = toXY(f.lat, f.lng, f.lat);
    const ins = inside(p, poly);
    let d = Infinity;
    for (let i = 0; i < poly.length; i++) d = Math.min(d, segDist(p, poly[i], poly[(i + 1) % poly.length]));
    if (ins) d = 0;
    if (!best || d < best.km) {
      const cx = poly.reduce((s, q) => s + q[0], 0) / poly.length, cy = poly.reduce((s, q) => s + q[1], 0) / poly.length;
      const ang = (Math.atan2(p[0] - cx, p[1] - cy) * 180) / Math.PI;
      best = { km: d, field: t, dir: (ang + 360) % 360, inside: ins };
    }
  }
  return best;
}

export function annotate(fires: Fire[], talhoes: Talhao[]): FireNear[] {
  const out: FireNear[] = [];
  for (const f of fires) {
    if (f.conf === 'l' || f.conf === 'low') continue; // baixa confiança: muitos falsos positivos
    const n = nearestField(f, talhoes);
    if (!n) continue;
    const hh = f.time.slice(0, 2), mm = f.time.slice(2, 4);
    out.push({ ...f, id: `${f.lat.toFixed(3)},${f.lng.toFixed(3)},${f.date},${f.time}`, km: n.km, field: n.field.name, fieldId: n.field.id, dir: n.dir, inside: n.inside, at: new Date(`${f.date}T${hh}:${mm}:00Z`) });
  }
  return out.sort((a, b) => a.km - b.km);
}
