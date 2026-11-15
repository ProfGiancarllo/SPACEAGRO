/**
 * Dados reais da fazenda que vão junto com a pergunta para a IA (Claude) da Estrela.
 *
 * Por talhão, em uma só estrutura:
 *  - clima observado: NASA POWER, últimos 14 dias (período exato e dias com dado);
 *  - balanço hídrico de 30 dias e umidade do solo (Open-Meteo/ERA5-Land, chuva da NASA POWER quando há);
 *  - previsão do tempo para 7 dias (Open-Meteo);
 *  - saúde da lavoura por satélite (Landsat 8/9, NASA/USGS) e estresse hídrico (ECOSTRESS, NASA),
 *    lidos dos arquivos que as rotinas automáticas publicam;
 *  - histórico de produtividade (safras anteriores + colheitas do diário), que o servidor usa
 *    no modelo estatístico de previsão de produtividade.
 * Cada fonte é opcional: se falhar ou demorar, o talhão segue com o que houver e diz o que faltou.
 */
import { FarmData, Talhao } from '../types';
import { calculateTalhaoCropStatus } from '../utils/cropCalendar';
import { fetchNasaSeries, polygonCentroid, summarizeNasa } from '../utils/nasaPower';
import { waterForPoint } from '../utils/waterRisk';
import { cropKey, currentForecast, yieldSeries } from '../utils/forecast';

/** Tamanho máximo do contexto enviado (o servidor aceita até 40 mil caracteres). */
export const MAX_CONTEXT_CHARS = 38000;
/** Até quantos talhões recebem dados de clima e satélite (os demais vão só com os dados cadastrados). */
const MAX_FIELDS_WITH_DATA = 30;
/** Cada fonte tem este tempo para responder; a pergunta não espera mais que isso. */
const SOURCE_TIMEOUT_MS = 12000;

const RAW_BASE = 'https://raw.githubusercontent.com/ProfGiancarllo/myroca/main/public/data/';

const r1 = (x: number | null | undefined): number | null => (typeof x === 'number' && isFinite(x) ? Math.round(x * 10) / 10 : null);
const r0 = (x: number | null | undefined): number | null => (typeof x === 'number' && isFinite(x) ? Math.round(x) : null);

function withTimeout<T>(p: Promise<T>, ms = SOURCE_TIMEOUT_MS): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    p.then((v) => { clearTimeout(timer); resolve(v); }, () => { clearTimeout(timer); resolve(null); });
  });
}

// ---------------- Arquivos das rotinas de satélite (Landsat e ECOSTRESS)
interface SatFile { gerado_em?: string; fonte?: string; aviso?: string; limite_esi?: number; talhoes: Array<Record<string, any>> }
const fileCache = new Map<string, { t: number; p: Promise<SatFile | null> }>();

function loadSatFile(name: string): Promise<SatFile | null> {
  const hit = fileCache.get(name);
  if (hit && Date.now() - hit.t < 3600_000) return hit.p;
  const base = ((import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL) || '/';
  const p = (async () => {
    for (const url of [`${RAW_BASE}${name}?h=${Math.floor(Date.now() / 3600000)}`, `${base}data/${name}`]) {
      try {
        const r = await fetch(url, { cache: 'no-cache' });
        if (!r.ok) continue;
        const j = (await r.json()) as SatFile;
        if (j && Array.isArray(j.talhoes)) return j;
      } catch { /* tenta a próxima */ }
    }
    return null;
  })();
  fileCache.set(name, { t: Date.now(), p });
  void p.then((v) => { if (!v) fileCache.delete(name); });
  return p;
}

function satHealth(file: SatFile | null, tl: Talhao): object | undefined {
  const s = file?.talhoes.find((x) => x.id === tl.id);
  if (!s) return undefined;
  const img = s.ultima_imagem;
  return {
    nivel: s.nivel,
    alertas: s.alertas,
    ultimaImagem: img ? { data: img.data, diasAtras: img.dias_atras, ndvi: typeof img.ndvi === 'number' ? Math.round(img.ndvi * 1000) / 1000 : null, ndmi: typeof img.ndmi === 'number' ? Math.round(img.ndmi * 1000) / 1000 : null } : null,
    faseNaImagem: s.fase_informada, diasAposPlantioNaImagem: s.dap_na_imagem,
    ndviEsperadoParaAFase: s.ndvi_esperado, ndviMedianaDeTalhoesParecidos: s.ndvi_mediana_pares,
    zonaFracaPct: s.zona_fraca_pct,
    serieNdvi: Array.isArray(s.serie) ? s.serie.slice(-4).map((p: any) => ({ data: p.data, ndvi: p.ndvi })) : undefined,
  };
}

function waterStress(file: SatFile | null, tl: Talhao): object | undefined {
  const s = file?.talhoes.find((x) => x.id === tl.id);
  if (!s) return undefined;
  const img = s.ultima_imagem;
  return {
    nivel: s.nivel,
    alertas: s.alertas,
    ultimaImagem: img ? { data: img.data, hora: img.hora_local, diasAtras: img.dias_atras, esi: img.esi } : null,
    esiAnterior: s.esi_anterior,
    zonaAbaixoDoLimitePct: s.zona_fraca_pct,
  };
}

// ---------------- Previsão do tempo (Open-Meteo, 7 dias), em cache por quadrícula de 0,1°
interface DayFc { data: string; chuvaMm: number | null; chanceChuvaPct: number | null; tMaxC: number | null; tMinC: number | null }
const fcCache = new Map<string, { t: number; p: Promise<DayFc[] | null> }>();

function forecast7d(lat: number, lng: number): Promise<DayFc[] | null> {
  const k = `${lat.toFixed(1)}_${lng.toFixed(1)}`;
  const hit = fcCache.get(k);
  if (hit && Date.now() - hit.t < 3 * 3600_000) return hit.p;
  const p = (async () => {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(2)}&longitude=${lng.toFixed(2)}&daily=precipitation_sum,precipitation_probability_max,temperature_2m_max,temperature_2m_min&forecast_days=7&timezone=auto`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const j = await r.json();
    const d = j?.daily;
    if (!d?.time?.length) return null;
    return (d.time as string[]).map((data, i) => ({
      data, chuvaMm: r1(d.precipitation_sum?.[i]), chanceChuvaPct: r0(d.precipitation_probability_max?.[i]),
      tMaxC: r0(d.temperature_2m_max?.[i]), tMinC: r0(d.temperature_2m_min?.[i]),
    }));
  })().catch(() => null);
  fcCache.set(k, { t: Date.now(), p });
  void p.then((v) => { if (!v) fcCache.delete(k); });
  return p;
}

// ---------------- Montagem
export interface FieldCtxOpts { name: (tl: Talhao) => string; refDate: string; today: string }

async function fieldData(tl: Talhao, o: FieldCtxOpts, health: SatFile | null, stress: SatFile | null, withRemote: boolean) {
  const st = calculateTalhaoCropStatus(tl, o.refDate);
  const d = tl.diary || [];
  const tipos: Record<string, number> = {};
  d.forEach((e) => { tipos[e.type] = (tipos[e.type] || 0) + 1; });
  const hist = yieldSeries(tl);
  const base = currentForecast(tl);
  const out: Record<string, unknown> = {
    name: o.name(tl), crop: tl.crop, cropKey: cropKey(tl.crop) || undefined, cultivar: tl.cultivar, areaHa: r1(tl.areaHectares),
    plantingDate: tl.plantingDate, cycleDays: tl.cycleDays, stage: st.stageBadgeText, daysSincePlanting: tl.plantingDate ? st.daysPassed : undefined,
    expectedHarvest: tl.harvestDateExpected, nextCrop: tl.nextCropPlan?.crop,
    diario: { registros: d.length, porTipo: tipos, ultimoRegistro: d.map((e) => e.date).sort().pop() },
    // histórico na unidade do app (sc/ha; algodão em @/ha). O servidor calcula a previsão estatística com ele.
    historicoProdutividade: hist.slice(-12).map((p) => ({ date: p.date, yield: r1(p.value), doDiario: p.fromDiary })),
    mediaDasSafrasAnteriores: base.value !== null ? { valor: r1(base.value), safras: base.basedOn } : undefined,
  };
  if (!withRemote || !tl.coordinates || tl.coordinates.length < 3) {
    out.dadosRemotos = withRemote ? 'talhão sem desenho no mapa: sem clima e satélite' : 'não consultados (limite de talhões por pergunta)';
    return out;
  }
  const c = polygonCentroid(tl.coordinates);
  const [nasa, water, fc] = await Promise.all([
    withTimeout(fetchNasaSeries(c.lat, c.lng, o.today, 14)),
    withTimeout(waterForPoint(c.lat, c.lng)),
    withTimeout(forecast7d(c.lat, c.lng)),
  ]);
  const faltou: string[] = [];
  if (nasa) {
    const sm = summarizeNasa(nasa);
    if (sm.daysWithData) {
      const comDado = nasa.days.filter((x) => x.rain !== null).map((x) => x.date);
      out.climaObservadoNasa = {
        fonte: 'NASA POWER', periodo: `${comDado[0]} a ${comDado[comDado.length - 1]}`, diasComDado: sm.daysWithData,
        chuvaMm: r0(sm.rainTotal), chuvaMmUltimos7: r0(sm.rainLast7), diasSecos: sm.dryDays,
        tempMediaC: r0(sm.tavg), tempMaxC: r0(sm.tmaxPeak), tempMinC: r0(sm.tminLow), radiacaoMJm2: r1(sm.radAvg),
      };
    } else faltou.push('NASA POWER sem dado no período');
  } else faltou.push('NASA POWER não respondeu');
  if (water) {
    out.balancoHidrico30d = {
      fonte: `${water.rainSrc} (chuva) + ${water.src} (evapotranspiração e solo)`,
      chuvaMm: r0(water.rain30), evapotranspiracaoMm: r0(water.et0), saldoMm: r0(water.balance),
      umidadeSolo0a100cm: water.soil === null ? null : Math.round(water.soil * 1000) / 1000, risco: water.level,
    };
  } else faltou.push('balanço hídrico indisponível');
  if (fc) out.previsaoTempo7d = { fonte: 'Open-Meteo', dias: fc };
  else faltou.push('previsão do tempo indisponível');
  const h = satHealth(health, tl);
  if (h) out.saudeSatelite = h; else faltou.push('sem análise Landsat para este talhão');
  const s = waterStress(stress, tl);
  if (s) out.estresseHidricoSatelite = s; else faltou.push('sem análise ECOSTRESS para este talhão');
  if (faltou.length) out.dadosFaltando = faltou;
  return out;
}

/** Remove detalhes, do menos para o mais importante, até o contexto caber no limite. */
function fitContext(ctx: Record<string, any>, focused: boolean): Record<string, any> {
  const size = () => JSON.stringify(ctx).length;
  const all: Record<string, any>[] = ctx.fields || [];
  // o primeiro talhão (o citado na pergunta, quando houver) mantém todos os detalhes
  const fields = all.slice(focused ? 1 : 0);
  const steps: Array<() => void> = [
    () => fields.forEach((f) => { if (f.saudeSatelite) delete f.saudeSatelite.serieNdvi; }),
    () => fields.forEach((f) => { if (f.previsaoTempo7d) f.previsaoTempo7d.dias = f.previsaoTempo7d.dias.slice(0, 3); }),
    () => fields.forEach((f) => { if (Array.isArray(f.historicoProdutividade)) f.historicoProdutividade = f.historicoProdutividade.slice(-5); }),
    () => { if (Array.isArray(ctx.problemasDoDiario)) ctx.problemasDoDiario = ctx.problemasDoDiario.slice(0, 10); },
    () => fields.forEach((f) => { delete f.diario?.porTipo; if (f.saudeSatelite) delete f.saudeSatelite.alertas; if (f.estresseHidricoSatelite) delete f.estresseHidricoSatelite.alertas; }),
  ];
  for (const step of steps) { if (size() <= MAX_CONTEXT_CHARS) break; step(); }
  if (size() > MAX_CONTEXT_CHARS) ctx.avisoContexto = 'Fazenda grande: alguns detalhes foram resumidos para caber na pergunta.';
  while (size() > MAX_CONTEXT_CHARS && all.length > 1) { all.pop(); ctx.avisoContexto = 'Fazenda grande: nem todos os talhões couberam nesta pergunta; pergunte por um talhão pelo nome.'; }
  return ctx;
}

/**
 * Junta todos os dados reais da fazenda. `focus` (talhão citado na pergunta) entra primeiro,
 * para nunca ficar de fora quando a fazenda tiver muitos talhões.
 */
export async function buildFarmContext(farm: FarmData, o: FieldCtxOpts, extra: Record<string, unknown>, focus?: Talhao | null): Promise<Record<string, any>> {
  const [health, stress] = await Promise.all([withTimeout(loadSatFile('saude-talhoes.json')), withTimeout(loadSatFile('estresse-hidrico.json'))]);
  const list = focus ? [focus, ...farm.talhoes.filter((x) => x.id !== focus.id)] : [...farm.talhoes];
  const fields = await Promise.all(list.map((tl, i) => fieldData(tl, o, health, stress, i < MAX_FIELDS_WITH_DATA)));
  const ctx: Record<string, any> = {
    ...extra,
    fontesSatelite: {
      landsat: health ? { fonte: health.fonte, geradoEm: health.gerado_em, aviso: health.aviso } : 'indisponível agora',
      ecostress: stress ? { fonte: stress.fonte, geradoEm: stress.gerado_em, limiteEsi: stress.limite_esi } : 'indisponível agora',
    },
    fields,
  };
  return fitContext(ctx, !!focus);
}
