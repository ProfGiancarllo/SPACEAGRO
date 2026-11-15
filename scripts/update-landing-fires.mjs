#!/usr/bin/env node
// Atualiza o retrato dos focos de calor mostrado no globo da página inicial.
// Fonte: NASA FIRMS, arquivo público das últimas 24 h (VIIRS NOAA-20, América do Sul). Não usa chave.
// Uso: node scripts/update-landing-fires.mjs
import { writeFileSync } from 'node:fs';

const SRC = 'https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_South_America_24h.csv';
const OUT = new URL('../public/data/focos-landing.json', import.meta.url);

const res = await fetch(SRC);
if (!res.ok) throw new Error(`FIRMS respondeu ${res.status}`);
const lines = (await res.text()).trim().split('\n');
const head = lines.shift().split(',');
const col = (n) => head.indexOf(n);
const [iLat, iLng, iDate, iTime, iConf, iFrp] = ['latitude', 'longitude', 'acq_date', 'acq_time', 'confidence', 'frp'].map(col);

const focos = [];
let first = '', last = '';
for (const line of lines) {
  const c = line.split(',');
  if (c[iConf] === 'low') continue; // só confiança nominal ou alta
  const lat = Number(c[iLat]), lng = Number(c[iLng]), frp = Number(c[iFrp]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
  const when = `${c[iDate]}T${c[iTime].padStart(4, '0').slice(0, 2)}:${c[iTime].padStart(4, '0').slice(2)}Z`;
  if (!first || when < first) first = when;
  if (!last || when > last) last = when;
  focos.push([Math.round(lng * 1000) / 1000, Math.round(lat * 1000) / 1000, Math.round(frp * 10) / 10]);
}

const data = {
  fonte: 'NASA FIRMS · VIIRS NOAA-20 (375 m) · últimas 24 h · América do Sul',
  url: SRC,
  baixadoEm: new Date().toISOString(),
  primeiraDeteccao: first,
  ultimaDeteccao: last,
  total: focos.length,
  focos, // [lng, lat, FRP em MW]
};
writeFileSync(OUT, JSON.stringify(data));
console.log(`${focos.length} focos salvos (${first} a ${last}) em ${OUT.pathname}`);
