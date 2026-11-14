/** Textos da camada Landsat 30 m (NASA HLS) do mapa. */
import { getCurrentLanguage } from './index';

type D = Record<string, string>;
const pt: D = {
  name: 'Landsat 30 m (NASA)',
  note: 'Landsat 8/9 da NASA (HLS), 30 m por pixel. O satélite passa a cada ~8 dias; o app escolhe a passagem mais recente sem nuvem sobre a área. Troque a data para ver outra passagem.',
  searching: 'Procurando a imagem Landsat mais recente sem nuvem…',
  found: 'Passagem de {d}{c}.', cloudy: ' (com {p}% de nuvem; não há imagem limpa nos últimos 90 dias)',
  none: 'Nenhuma passagem Landsat encontrada aqui nos últimos 90 dias.',
};
const en: D = {
  name: 'Landsat 30 m (NASA)',
  note: 'NASA Landsat 8/9 (HLS), 30 m per pixel. The satellite passes about every 8 days; the app picks the latest cloud-free pass over the area. Change the date to see another pass.',
  searching: 'Looking for the latest cloud-free Landsat image…',
  found: 'Pass of {d}{c}.', cloudy: ' ({p}% cloud; no clear image in the last 90 days)',
  none: 'No Landsat pass found here in the last 90 days.',
};
const es: D = {
  name: 'Landsat 30 m (NASA)',
  note: 'Landsat 8/9 de la NASA (HLS), 30 m por píxel. El satélite pasa cada ~8 días; la app elige el paso más reciente sin nubes sobre el área. Cambie la fecha para ver otro paso.',
  searching: 'Buscando la imagen Landsat más reciente sin nubes…',
  found: 'Paso del {d}{c}.', cloudy: ' (con {p}% de nubes; no hay imagen limpia en los últimos 90 días)',
  none: 'No se encontró ningún paso Landsat aquí en los últimos 90 días.',
};
const de: D = {
  name: 'Landsat 30 m (NASA)',
  note: 'NASA Landsat 8/9 (HLS), 30 m pro Pixel. Der Satellit überfliegt etwa alle 8 Tage; die App wählt den neuesten wolkenfreien Überflug. Ändern Sie das Datum für einen anderen Überflug.',
  searching: 'Suche nach dem neuesten wolkenfreien Landsat-Bild…',
  found: 'Überflug vom {d}{c}.', cloudy: ' ({p}% Wolken; kein klares Bild in den letzten 90 Tagen)',
  none: 'Kein Landsat-Überflug hier in den letzten 90 Tagen gefunden.',
};
const zh: D = {
  name: 'Landsat 30 米（NASA）',
  note: 'NASA Landsat 8/9（HLS），每像素 30 米。卫星约每 8 天过境一次；应用会自动选择该区域最近一次无云的过境。更改日期可查看其他过境。',
  searching: '正在查找最近的无云 Landsat 影像…',
  found: '{d} 过境{c}。', cloudy: '（云量 {p}%；最近 90 天没有晴空影像）',
  none: '最近 90 天此处没有 Landsat 过境。',
};
const fr: D = {
  name: 'Landsat 30 m (NASA)',
  note: 'Landsat 8/9 de la NASA (HLS), 30 m par pixel. Le satellite passe environ tous les 8 jours ; l’app choisit le passage sans nuages le plus récent sur la zone. Changez la date pour voir un autre passage.',
  searching: 'Recherche de l’image Landsat sans nuages la plus récente…',
  found: 'Passage du {d}{c}.', cloudy: ' ({p} % de nuages ; aucune image claire sur les 90 derniers jours)',
  none: 'Aucun passage Landsat trouvé ici sur les 90 derniers jours.',
};
const ALL: Record<string, D> = { pt, en, es, de, zh, fr };
export function lt(key: string, params?: Record<string, string | number>): string {
  let s = (ALL[getCurrentLanguage()] || en)[key] ?? en[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
}
