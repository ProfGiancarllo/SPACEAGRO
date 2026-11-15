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
import { cropMarket, loadMarket, slotMargin } from '../utils/market';
import type { CropKey } from '../utils/rotation';
import { fetchFarmForecast, sprayWindow } from '../utils/hourlyForecast';
import { omFetch, omPoint, omLimited } from '../utils/openMeteo';

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
    const pt = omPoint(lat, lng);
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${pt.lat}&longitude=${pt.lng}&daily=precipitation_sum,precipitation_probability_max,temperature_2m_max,temperature_2m_min&forecast_days=16&timezone=auto`;
    const got = await omFetch(url, 3 * 3600_000);
    const d = got?.data?.daily;
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

// ---------------- Perspectiva do clima para os próximos meses (Open-Meteo, modelo sazonal ECMWF), em cache por quadrícula de 0,5°
interface MonthOutlook { mes: string; chuvaVsNormalMm: number | null; temperaturaVsNormalC: number | null }
const seasCache = new Map<string, { t: number; p: Promise<MonthOutlook[] | null> }>();

function seasonal(lat: number, lng: number): Promise<MonthOutlook[] | null> {
  const k = `${(Math.round(lat * 2) / 2).toFixed(1)}_${(Math.round(lng * 2) / 2).toFixed(1)}`;
  const hit = seasCache.get(k);
  if (hit && Date.now() - hit.t < 12 * 3600_000) return hit.p;
  const p = (async () => {
    const url = `https://seasonal-api.open-meteo.com/v1/seasonal?latitude=${(Math.round(lat * 2) / 2).toFixed(1)}&longitude=${(Math.round(lng * 2) / 2).toFixed(1)}&monthly=temperature_2m_anomaly,precipitation_anomaly&timezone=auto`;
    const got = await omFetch(url, 12 * 3600_000);
    const m = got?.data?.monthly;
    if (!m?.time?.length) return null;
    // a primeira data pode ser o mês corrente já parcial; mantém até 5 meses
    return (m.time as string[]).slice(0, 5).map((t, i) => ({
      mes: t.slice(0, 7), chuvaVsNormalMm: r0(m.precipitation_anomaly?.[i]), temperaturaVsNormalC: r1(m.temperature_2m_anomaly?.[i]),
    }));
  })().catch(() => null);
  seasCache.set(k, { t: Date.now(), p });
  void p.then((v) => { if (!v) seasCache.delete(k); });
  return p;
}

// ---------------- Receita, custo e margem estimados (preço de referência da bolsa × produtividade esperada − custo de referência)
function monthsTo(iso?: string): number | undefined {
  if (!iso) return undefined;
  const t = Date.parse(iso); if (!isFinite(t)) return undefined;
  return Math.max(0, (t - Date.now()) / (30.4 * 86400000));
}

function finance(tl: Talhao, histMedia: number | null): object | undefined {
  const k = cropKey(tl.crop) as CropKey | '';
  if (!k) return undefined;
  const cm = cropMarket(k);
  if (!cm || !(cm.m.price > 0)) return undefined;
  const sm = slotMargin(k, 'low', histMedia, 0, 1, monthsTo(tl.harvestDateExpected));
  if (!sm) return undefined;
  const area = tl.areaHectares > 0 ? tl.areaHectares : null;
  const tot = (v: number) => (area ? r0(v * area) : null);
  return {
    unidadePreco: `R$/${sm.unit}`,
    produtividadeUsada: `${r1(sm.yieldUsed)} ${sm.unit}/ha (${sm.yieldFromHistory ? 'média das safras do talhão' : 'referência regional, o talhão não tem histórico'})`,
    precoNaColheita: { pessimista: r1(sm.price.pess), base: r1(sm.price.base), otimista: r1(sm.price.opt) },
    precoAtual: r1(cm.m.price),
    baseDoPreco: sm.basis === 'futures' ? `curva de contratos futuros da bolsa${sm.contract ? ` (${sm.contract})` : ''}` : 'tendência de 12 meses',
    custoPorHa: r0(sm.cost),
    custoEditadoPeloProdutor: cm.edited.cost,
    avisoCusto: cm.edited.cost ? undefined : 'custo é uma REFERÊNCIA genérica do app, não o custo real da fazenda; peça para o produtor informar o custo dele em Safra > Trocar de safra',
    receitaPorHa: { pessimista: r0(sm.revenue.pess), base: r0(sm.revenue.base), otimista: r0(sm.revenue.opt) },
    margemPorHa: { pessimista: r0(sm.margin.pess), base: r0(sm.margin.base), otimista: r0(sm.margin.opt) },
    areaHa: area ? r1(area) : undefined,
    receitaDoTalhao: area ? { pessimista: tot(sm.revenue.pess), base: tot(sm.revenue.base), otimista: tot(sm.revenue.opt) } : undefined,
    custoDoTalhao: area ? tot(sm.cost) : undefined,
    margemDoTalhao: area ? { pessimista: tot(sm.margin.pess), base: tot(sm.margin.base), otimista: tot(sm.margin.opt) } : undefined,
    precoDeReferenciaReal: !cm.m.example,
    fontePreco: cm.m.source,
    precoEm: cm.m.asOf,
  };
}

// ---------------- Tempo agora e próximas 48 h na fazenda (os mesmos dados do cartão "Clima na fazenda")
async function weatherNow(farm: FarmData): Promise<object | undefined> {
  const t = farm.talhoes.find((x) => x.coordinates && x.coordinates.length >= 3);
  const c = t ? polygonCentroid(t.coordinates) : { lat: -17.8, lng: -51.07 };
  const fc = await withTimeout(fetchFarmForecast(c.lat, c.lng));
  if (!fc) return undefined;
  const day = (date: string) => {
    const hs = fc.hours.filter((h) => h.time.slice(0, 10) === date);
    const d = fc.days.find((x) => x.date === date);
    const wet = hs.filter((h) => (h.pop ?? 0) >= 50).map((h) => h.time.slice(11, 16));
    const pops = hs.map((h) => h.pop).filter((v): v is number => v !== null);
    return { data: date, tMaxC: r0(d?.tmax), tMinC: r0(d?.tmin), chanceChuvaMaxPct: pops.length ? Math.max(...pops) : null, chuvaMm: r1(hs.reduce((a, h) => a + (h.precip ?? 0), 0)), horasComChuvaProvavel: wet.length ? `${wet[0]} a ${wet[wet.length - 1]}` : null };
  };
  const today = fc.now.time.slice(0, 10);
  const win = sprayWindow(fc.hours);
  return {
    fonte: 'Open-Meteo (previsão por hora, fuso da fazenda)', horaLocal: fc.now.time.slice(11, 16),
    agora: { temperaturaC: r0(fc.now.temp), sensacaoC: r0(fc.now.feels), condicao: fc.now.cond, chanceChuvaPct: r0(fc.now.pop), ventoKmh: r0(fc.now.wind), umidadePct: r0(fc.now.hum) },
    hoje: day(today),
    amanha: fc.days.find((d) => d.date > today) ? day(fc.days.find((d) => d.date > today)!.date) : undefined,
    janelaPulverizacao24h: win ? { inicio: win.start.replace('T', ' '), fimDaUltimaHoraBoa: win.end.replace('T', ' ') } : 'sem janela boa nas próximas 24 h',
    regraPulverizacao: 'pelo menos 2 h com chance de chuva < 30%, vento 3 a 10 km/h, < 30 °C e umidade >= 55%',
  };
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
  const fin = finance(tl, base.value);
  const out: Record<string, unknown> = {
    name: o.name(tl), crop: tl.crop, cropKey: cropKey(tl.crop) || undefined, cultivar: tl.cultivar, areaHa: r1(tl.areaHectares),
    plantingDate: tl.plantingDate, cycleDays: tl.cycleDays, stage: st.stageBadgeText, daysSincePlanting: tl.plantingDate ? st.daysPassed : undefined,
    expectedHarvest: tl.harvestDateExpected, nextCrop: tl.nextCropPlan?.crop,
    diario: { registros: d.length, porTipo: tipos, ultimoRegistro: d.map((e) => e.date).sort().pop() },
    // histórico na unidade do app (sc/ha; algodão em @/ha). O servidor calcula a previsão estatística com ele.
    historicoProdutividade: hist.slice(-12).map((p) => ({ date: p.date, yield: r1(p.value), doDiario: p.fromDiary })),
    mediaDasSafrasAnteriores: base.value !== null ? { valor: r1(base.value), safras: base.basedOn } : undefined,
    estimativaFinanceira: fin,
  };
  if (!withRemote || !tl.coordinates || tl.coordinates.length < 3) {
    out.dadosRemotos = withRemote ? 'talhão sem desenho no mapa: sem clima e satélite' : 'não consultados (limite de talhões por pergunta)';
    return out;
  }
  const c = polygonCentroid(tl.coordinates);
  const [nasa, water, fc, seas] = await Promise.all([
    withTimeout(fetchNasaSeries(c.lat, c.lng, o.today, 14)),
    withTimeout(waterForPoint(c.lat, c.lng)),
    withTimeout(forecast7d(c.lat, c.lng)),
    withTimeout(seasonal(c.lat, c.lng)),
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
  if (fc) {
    const longe = fc.slice(7);
    out.previsaoTempo7d = { fonte: 'Open-Meteo', dias: fc.slice(0, 7) };
    if (longe.length) out.previsaoTempo8a16dias = { fonte: 'Open-Meteo', chuvaTotalMm: r0(longe.reduce((a, d) => a + (d.chuvaMm || 0), 0)), diasComChuvaProvavel: longe.filter((d) => (d.chanceChuvaPct || 0) >= 60).length, observacao: 'tempo mais incerto quanto mais longe' };
  } else faltou.push('previsão do tempo indisponível');
  if (seas) out.perspectivaClimaProximosMeses = { fonte: 'Open-Meteo, modelo sazonal ECMWF', unidade: 'diferença para o normal do mês: chuva em mm, temperatura em °C', meses: seas, observacao: 'tendência com acerto limitado; fale em "tende a" e nunca como certeza' };
  else faltou.push('perspectiva de clima dos próximos meses indisponível');
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
    () => fields.forEach((f) => { delete f.previsaoTempo8a16dias; if (f.perspectivaClimaProximosMeses) f.perspectivaClimaProximosMeses.meses = f.perspectivaClimaProximosMeses.meses.slice(0, 3); }),
    () => fields.forEach((f) => { if (f.previsaoTempo7d) f.previsaoTempo7d.dias = f.previsaoTempo7d.dias.slice(0, 3); }),
    () => fields.forEach((f) => { if (f.estimativaFinanceira) { delete f.estimativaFinanceira.receitaPorHa; delete f.estimativaFinanceira.precoNaColheita; delete f.estimativaFinanceira.avisoCusto; } }),
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
  const [health, stress, , tempo] = await Promise.all([withTimeout(loadSatFile('saude-talhoes.json')), withTimeout(loadSatFile('estresse-hidrico.json')), withTimeout(loadMarket()), weatherNow(farm)]);
  const list = focus ? [focus, ...farm.talhoes.filter((x) => x.id !== focus.id)] : [...farm.talhoes];
  const fields = await Promise.all(list.map((tl, i) => fieldData(tl, o, health, stress, i < MAX_FIELDS_WITH_DATA)));
  const ctx: Record<string, any> = {
    ...extra,
    tempoNaFazenda: tempo ?? (omLimited() ? 'previsão indisponível agora: o serviço de previsão (Open-Meteo) atingiu o limite de consultas; volta sozinho em até 1 hora' : 'previsão por hora indisponível agora'),
    fontesSatelite: {
      landsat: health ? { fonte: health.fonte, geradoEm: health.gerado_em, aviso: health.aviso } : 'indisponível agora',
      ecostress: stress ? { fonte: stress.fonte, geradoEm: stress.gerado_em, limiteEsi: stress.limite_esi } : 'indisponível agora',
    },
    fields,
  };
  return fitContext(ctx, !!focus);
}
