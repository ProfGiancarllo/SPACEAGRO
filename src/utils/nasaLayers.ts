/**
 * Camadas de satélite da NASA (GIBS / Worldview) para sobrepor ao mapa. Sem chave de acesso.
 * Padrão WMTS: gibs.earthdata.nasa.gov/wmts/epsg3857/best/{camada}/default/{matriz}/{z}/{y}/{x}.{ext}
 * "default" = data mais recente disponível da camada.
 */
export type NasaLayerId = 'ndvi' | 'rain' | 'smap' | 'lst';
export interface NasaLayerDef {
  id: NasaLayerId;
  layer: string;
  /** Conjuntos de matriz de tiles a tentar, em ordem (o primeiro que responder é mantido). */
  matrices: string[];
  ext: 'png' | 'jpg';
  gradient: string; // legenda: do valor baixo ao alto
  res: string;
}

export const NASA_LAYERS: NasaLayerDef[] = [
  { id: 'ndvi', layer: 'MODIS_Terra_NDVI_8Day', matrices: ['GoogleMapsCompatible_Level9', 'GoogleMapsCompatible_Level8'], ext: 'png', gradient: 'linear-gradient(90deg,#8c510a,#d8b365,#f6e8c3,#a6d96a,#1a9850,#00441b)', res: '250 m · 8 dias' },
  { id: 'rain', layer: 'IMERG_Precipitation_Rate', matrices: ['GoogleMapsCompatible_Level6', 'GoogleMapsCompatible_Level7'], ext: 'png', gradient: 'linear-gradient(90deg,#c6dbef,#6baed6,#2171b5,#6a51a3,#ae017e)', res: '10 km · 30 min' },
  { id: 'smap', layer: 'SMAP_L3_Passive_Enhanced_Day_Soil_Moisture', matrices: ['GoogleMapsCompatible_Level6', 'GoogleMapsCompatible_Level7'], ext: 'png', gradient: 'linear-gradient(90deg,#fff5e6,#e6c27a,#7fcdbb,#2c7fb8,#08306b)', res: '9 km · 2 a 3 dias' },
  { id: 'lst', layer: 'MODIS_Terra_L3_Land_Surface_Temp_Daily_Day', matrices: ['GoogleMapsCompatible_Level7', 'GoogleMapsCompatible_Level6'], ext: 'png', gradient: 'linear-gradient(90deg,#313695,#74add1,#ffffbf,#f46d43,#a50026)', res: '1 km · diário' },
];

export const matrixZoom = (m: string): number => Number(m.replace(/\D/g, '')) || 6;

/**
 * Imagem de satélite "cor verdadeira" diária da NASA, usada como opção de mapa base.
 * No padrão do mapa (EPSG:3857) a melhor resolução disponível é o nível 9 (~300 m/pixel).
 */
export const NASA_TRUECOLOR = { layer: 'VIIRS_NOAA20_CorrectedReflectance_TrueColor', matrix: 'GoogleMapsCompatible_Level9', maxNativeZoom: 9 };
export const nasaTrueColorUrl = (date: string): string =>
  `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${NASA_TRUECOLOR.layer}/default/${date}/${NASA_TRUECOLOR.matrix}/{z}/{y}/{x}.jpg`;
/** Ontem (a imagem do dia corrente costuma estar incompleta). */
export const nasaDefaultDate = (): string => new Date(Date.now() - 864e5).toISOString().slice(0, 10);
export const nasaTileUrl = (d: NasaLayerDef, matrix: string): string =>
  `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${d.layer}/default/${matrix}/{z}/{y}/{x}.${d.ext}`;

/**
 * Landsat 8/9 a 30 m (NASA HLS L30: Harmonized Landsat Sentinel-2, reflectância corrigida), cor verdadeira.
 * No EPSG:3857 vai até o nível 12 (~38 m/pixel); acima disso o mapa amplia a mesma imagem.
 * Cada dia só tem as faixas por onde o satélite passou (revisita de ~8 dias com os dois satélites), por isso a data
 * é escolhida por findLandsatDate: a passagem mais recente sobre o ponto, com pouca nuvem.
 */
export const LANDSAT = { layer: 'HLS_L30_Nadir_BRDF_Adjusted_Reflectance', matrix: 'GoogleMapsCompatible_Level12', maxNativeZoom: 12 };
export const landsatUrl = (date: string): string =>
  `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${LANDSAT.layer}/default/${date}/${LANDSAT.matrix}/{z}/{y}/{x}.png`;

export interface LandsatPick { date: string; cloud: number; cover: number }

const tileXY = (lat: number, lng: number, z: number): [number, number] => {
  const n = 2 ** z, r = (lat * Math.PI) / 180;
  return [Math.floor(((lng + 180) / 360) * n), Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n)];
};

/** Lê um tile e devolve a fração com dado (não transparente) e a fração de nuvem (pixels claros) entre os que têm dado. */
async function tileStats(url: string): Promise<{ cover: number; cloud: number } | null> {
  const r = await fetch(url);
  if (!r.ok) return null;
  const blob = await r.blob();
  if (blob.size < 4000) return { cover: 0, cloud: 0 }; // tile vazio: sem passagem nesse dia
  const bmp = await createImageBitmap(blob);
  const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) return null;
  g.drawImage(bmp, 0, 0);
  const px = g.getImageData(0, 0, c.width, c.height).data;
  let data = 0, cloud = 0;
  for (let i = 0; i < px.length; i += 16) { // amostra 1 a cada 4 pixels
    if (px[i + 3] < 128) continue;
    data++;
    if (px[i] > 175 && px[i + 1] > 175 && px[i + 2] > 175) cloud++;
  }
  const total = px.length / 16;
  return { cover: data / total, cloud: data ? cloud / data : 1 };
}

/**
 * Procura, do dia mais recente para trás (até `maxDays`), a imagem Landsat sobre o ponto com cobertura e pouca nuvem.
 * Se nenhuma estiver limpa, devolve a de menos nuvem encontrada; null se não houver nenhuma passagem.
 */
export async function findLandsatDate(lat: number, lng: number, maxDays = 90): Promise<LandsatPick | null> {
  const [x, y] = tileXY(lat, lng, LANDSAT.maxNativeZoom);
  const day = (k: number) => new Date(Date.now() - (k + 1) * 864e5).toISOString().slice(0, 10);
  let best: LandsatPick | null = null;
  for (let k0 = 0; k0 < maxDays; k0 += 10) {
    const dates = Array.from({ length: Math.min(10, maxDays - k0) }, (_, i) => day(k0 + i));
    const stats = await Promise.all(dates.map((d) =>
      tileStats(landsatUrl(d).replace('{z}', String(LANDSAT.maxNativeZoom)).replace('{y}', String(y)).replace('{x}', String(x))).catch(() => null)));
    for (let i = 0; i < dates.length; i++) {
      const s = stats[i];
      if (!s || s.cover < 0.5) continue;
      const pick = { date: dates[i], cloud: s.cloud, cover: s.cover };
      if (s.cloud <= 0.15) return pick; // mais recente sem nuvem
      if (!best || s.cloud < best.cloud) best = pick;
    }
  }
  return best;
}
