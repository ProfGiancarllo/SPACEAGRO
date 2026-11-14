// Intermediário da Estrela (Cloudflare Worker). As chaves de API ficam SÓ aqui: nunca vão para o app.
//
// Rotas
//   POST /               pergunta para a Estrela (API do Claude, Anthropic)
//   POST /tts            voz natural da Estrela (OpenAI)
//   POST /admin/status   situação da configuração           (exige senha de administração)
//   POST /admin/config   grava chaves, modelo e voz          (exige senha de administração)
//   POST /admin/test     faz uma pergunta de teste ao Claude (exige senha de administração)
//
// Configuração na Cloudflare (Settings → Variables and Secrets / Bindings)
//   ADMIN_PASSWORD    (segredo, obrigatório para o painel)  senha do painel de super admin do app
//   CONFIG            (binding KV, recomendado)             onde o painel guarda chaves, modelo e voz
//   ALLOWED_ORIGIN                                          ex.: https://seusite.com
//   ANTHROPIC_API_KEY (segredo, opcional)                   alternativa a cadastrar a chave pelo painel
//   OPENAI_API_KEY    (segredo, opcional)                   alternativa a cadastrar a chave pelo painel
//   MODEL / TTS_VOICE (opcionais)                           valores padrão se o painel não definir
//
// Chamamos a API por HTTP direto (fetch) porque o Worker é colado no editor da Cloudflare, sem etapa de build
// para instalar o SDK da Anthropic.

const MAX_PER_IP_PER_DAY = 40;
const MAX_TTS_PER_IP_PER_DAY = 200;
const MAX_ADMIN_FAILS_PER_IP_PER_DAY = 10;
const hits = new Map(); // limites simples por IP (reiniciam quando o worker reinicia)

const MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'];
const DEFAULT_MODEL = 'claude-opus-5-5';
const VOICES = ['coral', 'nova', 'shimmer', 'sage', 'alloy', 'ash', 'ballad', 'echo', 'verse'];

// >>> ZARC (gerado por scripts/zarc_rioverde.py; não editar à mão)
const ZARC_RIO_VERDE = "ZARC Rio Verde-GO, safra 2026/2027 (MAPA). Risco climático de perda: 20%=menor, 30%, 40%=maior. Decêndio = 10 dias.\n- Algodão Herbáceo (sequeiro): risco 20% em todos os solos e ciclos: 1º dec jan; 1º dec dez a 3º dec dez. Só em alguns solos/ciclos ou com risco maior (30-40%): 2º dec jan a 3º dec fev\n- Amendoim (sequeiro): risco 20% em todos os solos e ciclos: 1º dec jan a 2º dec jan; 3º dec out a 3º dec dez. Só em alguns solos/ciclos ou com risco maior (30-40%): 3º dec jan a 1º dec fev; 1º dec out a 2º dec out\n- Arroz (sequeiro): risco 20% em todos os solos e ciclos: 3º dec out a 1º dec dez. Só em alguns solos/ciclos ou com risco maior (30-40%): 1º dec jan a 3º dec jan; 1º dec out a 2º dec out; 2º dec dez a 3º dec dez\n- Cevada Cervejeira (irrigado): risco 20% em todos os solos e ciclos: 1º dec mai a 1º dec jun\n- Cevada Grãos (irrigado): risco 20% em todos os solos e ciclos: 2º dec abr a 1º dec jun\n- Cevada Grãos (sequeiro): risco 20% em todos os solos e ciclos: nenhum. Só em alguns solos/ciclos ou com risco maior (30-40%): 1º dec mar a 3º dec abr\n- Feijão (irrigado): risco 20% em todos os solos e ciclos: 1º dec jan a 1º dec jul; 3º dec set a 3º dec dez. Só em alguns solos/ciclos ou com risco maior (30-40%): 2º dec jul a 2º dec set\n- Feijão (sequeiro): risco 20% em todos os solos e ciclos: nenhum. Só em alguns solos/ciclos ou com risco maior (30-40%): 1º dec out a 3º dec dez\n- Feijão 2ª Safra (sequeiro): risco 20% em todos os solos e ciclos: nenhum. Só em alguns solos/ciclos ou com risco maior (30-40%): 1º dec jan a 2º dec mar\n- Feijão Caupi (sequeiro): risco 20% em todos os solos e ciclos: nenhum. Só em alguns solos/ciclos ou com risco maior (30-40%): 1º dec jan a 2º dec mar\n- Girassol (sequeiro): risco 20% em todos os solos e ciclos: 2º dec jan. Só em alguns solos/ciclos ou com risco maior (30-40%): 3º dec jan a 2º dec mar; 2º dec out a 3º dec out\n- Mamona (sequeiro): risco 20% em todos os solos e ciclos: nenhum. Só em alguns solos/ciclos ou com risco maior (30-40%): 3º dec jan a 2º dec mar\n- Milho 1ª Safra (sequeiro): risco 20% em todos os solos e ciclos: 1º dec nov a 2º dec dez. Só em alguns solos/ciclos ou com risco maior (30-40%): 2º dec out a 3º dec out; 3º dec dez\n- Milho 1ª Safra consorciado com Braquiária (sequeiro): risco 20% em todos os solos e ciclos: 1º dec nov a 2º dec dez. Só em alguns solos/ciclos ou com risco maior (30-40%): 2º dec out a 3º dec out; 3º dec dez\n- Milho 2ª Safra (sequeiro): risco 20% em todos os solos e ciclos: 1º dec jan. Só em alguns solos/ciclos ou com risco maior (30-40%): 2º dec jan a 3º dec fev\n- Milho 2ª Safra consorciado com Braquiária (sequeiro): risco 20% em todos os solos e ciclos: 1º dec jan. Só em alguns solos/ciclos ou com risco maior (30-40%): 2º dec jan a 3º dec fev\n- Soja (sequeiro): risco 20% em todos os solos e ciclos: 1º dec jan; 3º dec out a 3º dec dez. Só em alguns solos/ciclos ou com risco maior (30-40%): 3º dec set a 2º dec out\n- Sorgo Forrageiro (sequeiro): risco 20% em todos os solos e ciclos: 3º dec out a 3º dec dez. Só em alguns solos/ciclos ou com risco maior (30-40%): 1º dec out a 2º dec out\n- Sorgo Forrageiro 2ª Safra (sequeiro): risco 20% em todos os solos e ciclos: 1º dec jan a 2º dec jan. Só em alguns solos/ciclos ou com risco maior (30-40%): 3º dec jan a 1º dec abr\n- Sorgo Granífero (sequeiro): risco 20% em todos os solos e ciclos: 2º dec out a 3º dec dez. Só em alguns solos/ciclos ou com risco maior (30-40%): 1º dec out\n- Sorgo Granífero 2ª Safra (sequeiro): risco 20% em todos os solos e ciclos: 1º dec jan a 3º dec jan. Só em alguns solos/ciclos ou com risco maior (30-40%): 1º dec fev a 3º dec mar";
// <<< ZARC

// >>> CONAB (gerado por scripts/conab_goias.py; não editar à mão)
const CONAB_GOIAS = "CONAB, Goiás (dado do ESTADO, não do município). Produtividade média em kg/ha (sc/ha = kg/ha ÷ 60 para soja, milho, feijão, sorgo, trigo).\n- Soja, GO: 2017/18: 3609; 2018/19: 3480; 2019/20: 3712; 2020/21: 3672; 2021/22: 4025; 2022/23: 3942; 2023/24: 3487; 2024/25: 4183; 2025/26: 3910; 2026/27 (previsão): 3908\n- Milho 1ª safra, GO: 2017/18: 8000; 2018/19: 7560; 2019/20: 7980; 2020/21: 9000; 2021/22: 10205; 2022/23: 9323; 2023/24: 9506; 2024/25: 10397; 2025/26: 10409; 2026/27 (previsão): 10498\n- Feijão 1ª safra, GO: 2017/18: 2496; 2018/19: 2100; 2019/20: 2400; 2020/21: 2340; 2021/22: 2400; 2022/23: 2343; 2023/24: 2230; 2024/25: 2340; 2025/26: 2359; 2026/27 (previsão): 2458\n- Sorgo, GO: 2017/18: 3100; 2018/19: 3780; 2019/20: 2930; 2020/21: 2400; 2021/22: 2860; 2022/23: 3853; 2023/24: 3466; 2024/25: 4006; 2025/26: 3226; 2026/27 (previsão): 3791\n- Trigo, GO: 2017: 5330; 2018: 5400; 2019: 4900; 2020: 4000; 2021: 2350; 2022: 2250; 2023: 3338; 2024: 2133; 2025: 4178; 2026 (previsão): 3690\n- Algodão em caroço, GO (kg/ha): 2021/22: 4500; 2022/23: 4496; 2023/24: 4984; 2024/25: 4452; 2025/26: 5038; 2026/27 (previsão): 4475\nPrevisão CONAB para GO, safra 2026/27 (levantamento de nov/2026), área em mil ha, produtividade kg/ha, variação sobre 2025/26:\n- Soja: área 5199.3 mil ha (+0.9%), produtividade 3908 kg/ha (-0.1%)\n- Milho 1ª safra: área 188.0 mil ha (+26.2%), produtividade 10498 kg/ha (+0.9%)\n- Milho 2ª safra: área 1805.2 mil ha (+3.1%), produtividade 5774 kg/ha (+14.9%)\n- Feijão total: área 123.6 mil ha (-2.7%), produtividade 2394 kg/ha (-1.6%)\n- Sorgo: área 643.7 mil ha (+2.0%), produtividade 3791 kg/ha (+17.5%)\n- Trigo (safra 2026): área 40.0 mil ha (-11.1%), produtividade 3690 kg/ha (-11.7%)\nProgresso de semeadura em GO, safra 2026/27, semana até 06/11/2026 (fração da área; [mesma semana de 2025, semana anterior, esta semana, média de 5 anos]):\n- Arroz: 6% semeado (semana anterior 0%; 2025: 30%; média 5 anos: 41%)\n- Feijão 1ª: 57% semeado (semana anterior 35%; 2025: 5%; média 5 anos: 63%)\n- Milho 1ª: 61% semeado (semana anterior 15%; 2025: 8%; média 5 anos: 25%)\n- Soja: 74% semeado (semana anterior 58%; 2025: 43%; média 5 anos: 60%)";
const GO_YIELD_KG = {"Soja":{"2017/18":3609,"2018/19":3480,"2019/20":3712,"2020/21":3672,"2021/22":4025,"2022/23":3942,"2023/24":3487,"2024/25":4183,"2025/26":3910,"2026/27 (previsão)":3908},"Milho 1ª safra":{"2017/18":8000,"2018/19":7560,"2019/20":7980,"2020/21":9000,"2021/22":10205,"2022/23":9323,"2023/24":9506,"2024/25":10397,"2025/26":10409,"2026/27 (previsão)":10498},"Feijão 1ª safra":{"2017/18":2496,"2018/19":2100,"2019/20":2400,"2020/21":2340,"2021/22":2400,"2022/23":2343,"2023/24":2230,"2024/25":2340,"2025/26":2359,"2026/27 (previsão)":2458},"Sorgo":{"2017/18":3100,"2018/19":3780,"2019/20":2930,"2020/21":2400,"2021/22":2860,"2022/23":3853,"2023/24":3466,"2024/25":4006,"2025/26":3226,"2026/27 (previsão)":3791},"Trigo":{"2017":5330,"2018":5400,"2019":4900,"2020":4000,"2021":2350,"2022":2250,"2023":3338,"2024":2133,"2025":4178,"2026 (previsão)":3690},"Algodão em caroço":{"2021/22":4500,"2022/23":4496,"2023/24":4984,"2024/25":4452,"2025/26":5038,"2026/27 (previsão)":4475}};
// <<< CONAB

const SYSTEM =
  'Você é a Estrela, agrônoma do app SpaceAgro (Rio Verde-GO). ' +
  'FALE COMO O PRODUTOR FALA: português simples do dia a dia, direto ao ponto, frases curtas, sem rodeio, sem termo técnico (se precisar, explique com palavras da roça). ' +
  'Responda no idioma da pergunta. TEXTO PURO: nunca use markdown (nada de **, *, #, listas com - ou números, tabelas ou emojis). Nada de introdução ("Claro!", "Ótima pergunta"). ' +
  'FORMATO FIXO, cada parte numa linha separada, no máximo 45 palavras no total: ' +
  'linha 1 = a resposta à pergunta, com sua opinião e o motivo em uma frase (cite o dado, ex.: "dados da NASA: 33 mm em 14 dias"); ' +
  'linha 2 (só se houver pendência ou problema no diário) = começa com "Atenção:" e traz SÓ o item mais importante, com o talhão; ' +
  'linha 3 = começa com "Próximo passo:" e diz UMA ação e onde clicar. Um assunto por linha; não junte vários talhões e temas na mesma frase. ' +
  'Quando tiver "nasaPower14dias" no contexto, use esses números (chuva, dias secos, temperatura, sol) para justificar a opinião em uma frase e diga "dados da NASA". '+
  'COMO VOCÊ AGE: (1) SEMPRE dê a sua opinião, clara e direta ("Eu faria assim", "Eu não faria isso agora"), com o motivo em uma frase, usando os dados da fazenda; ' +
  'não fique em cima do muro. (2) SEMPRE ajude o produtor a usar o aplicativo: diga onde clicar. Mapa do app: menu "Safra" > "Safra atual" (planejamento da lavoura em curso), "Trocar de safra" (comparar culturas e preços), ' +
  '"Diário de safra" (registrar plantio, adubação, aplicações, chuva, colheita), "Dados NASA" (mapas de satélite e risco hídrico); menu "Talhões" (criar/editar talhões); "Estruturas e água"; "Fazenda" (importar/exportar). ' +
  '(3) Seja INTERVENTORA: use "pendencias" e "problemasDoDiario" do contexto. Se houver itens, cobre o mais importante na linha "Atenção:", nomeando o talhão e o que refazer (ex.: "Atenção: no Talhão 2 a colheita de 380 sc/ha está fora do normal; corrija em Safra > Diário de safra."). Os demais ficam para as próximas respostas. ' +
  'Códigos de problema: data_futura=data depois de hoje; sem_quantidade=falta dose/quantidade; valor_improvavel=número fora do normal; sem_produto=falta produto ou cultivar; duplicado=registro repetido; plantio_fora_do_diario=plantio sem registro no diário. ' +
  'Tipos de pendência: crop=falta a cultura; planting=falta data de plantio; harvest=ciclo terminou e falta registrar a colheita; cultivar=falta a cultivar; diary=sem registros recentes. ' +
  'Insista com educação: se o produtor ignorar, lembre de novo na resposta seguinte. Registros corretos melhoram a previsão do app para a fazenda dele, diga isso. ' +
  'Se o histórico da fazenda estiver vazio, lembre UMA vez, em uma frase, de registrar em Safra > Diário de safra. ' +
  '(4) TERMINE sempre com a linha "Próximo passo:" e UMA ação concreta. ' +
  'LIMITES: não invente números; se faltar dado, diga qual e onde cadastrar. Não receite defensivos nem dose: nisso, mande consultar o agrônomo responsável. ' +
  'Sobre preços, dê sua leitura dos números e deixe claro que a decisão de vender ou comprar é do produtor; não prometa preço futuro. ' +
  'Para época de plantio, use SOMENTE a tabela do ZARC abaixo (Ministério da Agricultura), cite "ZARC/MAPA", explique que o risco depende do solo e do ciclo da cultivar e que a janela vale para o município, ' +
  'e lembre que o produtor deve conferir a portaria vigente com o agrônomo. Se a cultura não estiver na tabela, diga que não há dado.\n\n' + ZARC_RIO_VERDE + '\n\n' +
  'Para produtividade média, previsão de safra e andamento do plantio, use SOMENTE os dados da CONAB abaixo (são do estado de Goiás, não de Rio Verde: diga isso e cite "CONAB"). ' +
  'Não compare com a produtividade da fazenda sem dizer que a média estadual é só uma referência.\n\n' + CONAB_GOIAS;

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const allow = env.ALLOWED_ORIGIN || '*';
    const cors = {
      'Access-Control-Allow-Origin': allow === '*' ? '*' : allow,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password',
      Vary: 'Origin',
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method !== 'POST') return new Response('ok', { headers: cors });
    if (allow !== '*' && origin !== allow) return new Response('forbidden', { status: 403, headers: cors });

    const ip = req.headers.get('CF-Connecting-IP') || 'x';
    const day = new Date().toISOString().slice(0, 10);
    const path = new URL(req.url).pathname.replace(/\/+$/, '');

    if (path.endsWith('/admin/status') || path.endsWith('/admin/config') || path.endsWith('/admin/test')) {
      return admin(path, req, env, cors, ip + day);
    }
    if (path.endsWith('/fires')) return fires(req, env, cors, ip + day + ':fi');
    if (path.endsWith('/forecast')) return forecast(req, env, cors, ip + day + ':fc');
    if (path.endsWith('/tts')) return tts(req, env, cors, ip + day + ':tts');
    return ask(req, env, cors, ip + day);
  },
};

// ---------------- Configuração (painel → KV; senão, variáveis da Cloudflare)
async function readConfig(env) {
  let saved = {};
  if (env.CONFIG) {
    try { saved = JSON.parse((await env.CONFIG.get('config')) || '{}'); } catch { saved = {}; }
  }
  return {
    anthropicKey: saved.anthropicKey || env.ANTHROPIC_API_KEY || '',
    anthropicFrom: saved.anthropicKey ? 'painel' : env.ANTHROPIC_API_KEY ? 'cloudflare' : '',
    openaiKey: saved.openaiKey || env.OPENAI_API_KEY || '',
    openaiFrom: saved.openaiKey ? 'painel' : env.OPENAI_API_KEY ? 'cloudflare' : '',
    model: MODELS.includes(saved.model) ? saved.model : MODELS.includes(env.MODEL) ? env.MODEL : DEFAULT_MODEL,
    voice: VOICES.includes(saved.voice) ? saved.voice : VOICES.includes(env.TTS_VOICE) ? env.TTS_VOICE : 'coral',
    updatedAt: saved.updatedAt || null,
    raw: saved,
  };
}


// ---------------- Modelo estatístico de produtividade (previsão regional + aprendizado com as colheitas do produtor)
// Método (bayesiano normal-normal, sem custo de IA):
//  1. Priori do nível do talhão = produtividade média de Goiás (CONAB) prevista para a safra, com incerteza entre fazendas (TAU).
//  2. Cada colheita registrada no diário é corrigida pela diferença entre a safra dela e a atual (usa a série do estado) e atualiza o nível.
//  3. Colheitas fora do plausível (ex.: 380 sc/ha de soja) são recusadas e devolvidas como alerta; não entram no cálculo.
//  4. A faixa (p10-p90) soma a variabilidade de ano para ano. Com mais colheitas, o peso da fazenda sobe e o da média do estado cai.
const FC = {
  soja: { name: 'Soja', kg: 60 }, milho: { name: 'Milho 1ª safra', kg: 60 }, feijao: { name: 'Feijão 1ª safra', kg: 60 },
  sorgo: { name: 'Sorgo', kg: 60 }, trigo: { name: 'Trigo', kg: 60 }, algodao: { name: 'Algodão em caroço', kg: 15 },
};
const TAU = 0.12;        // desvio do nível de uma fazenda em relação à média do estado (fração da média)
const OBS_SD = 0.08;     // ruído de uma safra do talhão em torno do nível dele (fração), piso do desvio entre anos
const Z90 = 1.2816;      // p10-p90
const safraDe = (iso) => { const y = Number(iso.slice(0, 4)), m = Number(iso.slice(5, 7)); return m >= 7 ? `${y}/${String((y + 1) % 100).padStart(2, '0')}` : `${y - 1}/${String(y % 100).padStart(2, '0')}`; };
const chaveSafra = (k, cur) => (k === 'trigo' ? cur.slice(0, 4) : cur);

function serieEstado(cropKey) {
  const def = FC[cropKey]; const raw = def && GO_YIELD_KG[def.name]; if (!raw) return null;
  const done = {}; let prev = null;
  for (const [k, v] of Object.entries(raw)) { if (/previs/i.test(k)) prev = v; else done[k.replace(/\s.*/, '')] = v; }
  return { done, prev };
}

/** history: [{date:'YYYY-MM-DD', yield: número na unidade do app (sc/ha ou @/ha), forecast?: número}] */
function forecastYield(cropKey, history, curSafra) {
  const def = FC[cropKey]; const st = serieEstado(cropKey);
  if (!def || !st) return { ok: false, error: 'cultura_sem_dado' };
  const toUnit = (kg) => kg / def.kg;
  const anos = Object.keys(st.done).sort(); const last8 = anos.slice(-8);
  const vals = last8.map((k) => toUnit(st.done[k]));
  const n = vals.length; const xs = vals.map((_, i) => i);
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = vals.reduce((a, b) => a + b, 0) / n;
  const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0) || 1; const b = xs.reduce((a, x, i) => a + (x - mx) * (vals[i] - my), 0) / sxx;
  const resid = vals.map((v, i) => v - (my + b * (i - mx)));
  const sdRes = Math.sqrt(resid.reduce((a, r) => a + r * r, 0) / Math.max(1, n - 2));
  const trendNow = my + b * (n - mx);
  const mu0 = st.prev != null ? toUnit(st.prev) : trendNow;                      // média esperada do estado na safra atual
  const sdYear = Math.max(sdRes * 1.3, OBS_SD * mu0);                              // variabilidade de ano para ano numa fazenda
  const tau = TAU * mu0;
  const prior = { mean: mu0, sd: Math.hypot(tau, 0), fonte: st.prev != null ? 'CONAB, previsão de Goiás' : 'CONAB, tendência de Goiás' };

  let precision = 1 / (tau * tau), num = mu0 / (tau * tau); const used = [], flagged = [];
  for (const h of history || []) {
    const y = Number(h.yield); if (!(y > 0) || typeof h.date !== 'string' || h.date.length < 10) { flagged.push({ date: h.date, yield: h.yield, motivo: 'valor_ou_data_invalida' }); continue; }
    const sa = safraDe(h.date); const ref = st.done[chaveSafra(cropKey, sa)];
    const refU = ref != null ? toUnit(ref) : mu0;
    if (y < 0.4 * refU || y > 1.8 * refU) { flagged.push({ date: h.date, yield: y, motivo: 'fora_do_plausivel', esperado_estado: Math.round(refU * 10) / 10 }); continue; }
    const adj = y * (mu0 / refU);                                                  // leva a colheita antiga para o nível da safra atual
    const s2 = sdYear * sdYear; precision += 1 / s2; num += adj / s2; used.push({ date: h.date, yield: y, ajustada: Math.round(adj * 10) / 10 });
  }
  const v = 1 / precision, m = num * v;
  const sdPred = Math.sqrt(v + sdYear * sdYear);
  const wFarm = used.length ? 1 - (1 / (tau * tau)) / precision : 0;
  const fc = (history || []).filter((h) => Number(h.forecast) > 0 && Number(h.yield) > 0);
  const ratio = fc.length ? fc.reduce((a, h) => a + Number(h.yield) / Number(h.forecast), 0) / fc.length : null;
  const r1 = (x) => Math.round(x * 10) / 10;
  return {
    ok: true, crop: cropKey, safra: curSafra, unit: def.kg === 15 ? '@' : 'sc',
    prior: { mean: r1(prior.mean), sd: r1(prior.sd), fonte: prior.fonte },
    forecast: { expected: r1(m), p10: r1(m - Z90 * sdPred), p90: r1(m + Z90 * sdPred) },
    farmData: { used: used.length, flagged, weightFarm: Math.round(wFarm * 100) / 100 },
    calibration: ratio === null ? null : { n: fc.length, actualOverForecast: Math.round(ratio * 100) / 100 },
    method: 'Bayesiano normal: média de Goiás (CONAB) como ponto de partida; cada colheita do talhão desloca a previsão. Referência estadual, não é garantia.',
  };
}

async function forecast(req, env, cors, key) {
  const n = (hits.get(key) || 0) + 1; hits.set(key, n);
  if (n > 300) return json({ ok: false, error: 'limite_diario' }, cors, 429);
  let body; try { body = await req.json(); } catch { return json({ ok: false, error: 'json_invalido' }, cors, 400); }
  const crop = String(body.crop || '').toLowerCase();
  const hist = Array.isArray(body.history) ? body.history.slice(0, 60) : [];
  const cur = typeof body.safra === 'string' ? body.safra.slice(0, 9) : safraDe(new Date().toISOString().slice(0, 10));
  const out = forecastYield(crop, hist, cur);
  return json(out, cors, out.ok ? 200 : 404);
}

// ---------------- Focos de calor (NASA FIRMS). Chave: segredo FIRMS_MAP_KEY na Cloudflare
const FIRMS_SOURCES = ['VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT'];
async function firmsCsv(key, src, box, days) {
  const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/${src}/${box.join(',')}/${days}`;
  const ck = typeof caches !== 'undefined' ? caches.default : null;
  const ckReq = new Request('https://fires.cache.invalid/' + src + '/' + box.map((v) => v.toFixed(1)).join('_') + '/' + days);
  if (ck) { const hit = await ck.match(ckReq); if (hit) return hit.text(); }
  const r = await fetch(url);
  if (!r.ok) throw new Error('firms_' + r.status);
  const txt = await r.text();
  if (/^(invalid|error|you)/i.test(txt.trim()) || !txt.includes('latitude')) throw new Error('firms_resp');
  if (ck) await ck.put(ckReq, new Response(txt, { headers: { 'Cache-Control': 'max-age=600' } }));
  return txt;
}
function parseFirms(txt, src) {
  const lines = txt.trim().split(/\r?\n/);
  const h = lines.shift().split(',');
  const ix = (n) => h.indexOf(n);
  const out = [];
  for (const ln of lines) {
    const c = ln.split(',');
    const lat = parseFloat(c[ix('latitude')]), lng = parseFloat(c[ix('longitude')]);
    if (!isFinite(lat) || !isFinite(lng)) continue;
    out.push({
      lat, lng, date: c[ix('acq_date')], time: String(c[ix('acq_time')] || '').padStart(4, '0'),
      sat: src.includes('NOAA21') ? 'NOAA-21' : 'NOAA-20', conf: String(c[ix('confidence')] || '').toLowerCase(),
      frp: parseFloat(c[ix('frp')]) || 0, temp: parseFloat(c[ix('bright_ti4')]) || 0, dn: c[ix('daynight')] || '',
    });
  }
  return out;
}
async function fires(req, env, cors, key) {
  const n = (hits.get(key) || 0) + 1; hits.set(key, n);
  if (n > 400) return json({ ok: false, error: 'limite_diario' }, cors, 429);
  if (!env.FIRMS_MAP_KEY) return json({ ok: false, error: 'sem_chave' }, cors);
  let body; try { body = await req.json(); } catch { return json({ ok: false, error: 'json_invalido' }, cors, 400); }
  const b = Array.isArray(body.bbox) ? body.bbox.map(Number) : [];
  if (b.length !== 4 || b.some((v) => !isFinite(v))) return json({ ok: false, error: 'bbox_invalido' }, cors, 400);
  const [w, s, e, nn] = [Math.max(-180, b[0]), Math.max(-90, b[1]), Math.min(180, b[2]), Math.min(90, b[3])];
  if (e - w > 4 || nn - s > 4 || e <= w || nn <= s) return json({ ok: false, error: 'area_grande' }, cors, 400);
  const days = Math.min(5, Math.max(1, parseInt(body.days, 10) || 2));
  const all = []; const falhas = [];
  for (const src of FIRMS_SOURCES) {
    try { all.push(...parseFirms(await firmsCsv(env.FIRMS_MAP_KEY, src, [w, s, e, nn], days), src)); } catch (err) { falhas.push(src + ':' + (err.message || 'erro')); }
  }
  if (!all.length && falhas.length === FIRMS_SOURCES.length) return json({ ok: false, error: 'firms_indisponivel', detalhe: falhas }, cors, 502);
  const seen = new Set(); const fires = [];
  for (const f of all) {
    const k = f.lat.toFixed(3) + f.lng.toFixed(3) + f.date + f.time;
    if (seen.has(k)) continue; seen.add(k); fires.push(f);
  }
  return json({ ok: true, geradoEm: new Date().toISOString(), fonte: 'NASA FIRMS (VIIRS 375 m)', falhas, fires: fires.slice(0, 500) }, cors);
}

// ---------------- Pergunta para a Estrela (API do Claude)
async function ask(req, env, cors, key) {
  const n = (hits.get(key) || 0) + 1;
  hits.set(key, n);
  if (n > MAX_PER_IP_PER_DAY) return json({ answer: 'Limite diário de perguntas atingido. Tente amanhã.' }, cors);

  let body;
  try { body = await req.json(); } catch { return json({ answer: '' }, cors, 400); }
  const question = String(body.question || '').slice(0, 800);
  const ctx = JSON.stringify(body.context || {}).slice(0, 9000);
  if (!question) return json({ answer: '' }, cors, 400);

  const cfg = await readConfig(env);
  if (!cfg.anthropicKey) return json({ answer: '', error: 'claude_nao_configurado' }, cors, 503);
  const out = await callClaude(cfg, `Dados da fazenda: ${ctx}\n\nPergunta: ${question}`, await precosMercado(env));
  if (!out.ok) return json({ answer: '' }, cors, 502);
  return json({ answer: out.text }, cors);
}


// ---------------- Preços de mercado (o site publica data/mercado.json a cada publicação: FRED + Yahoo Finance CBOT/ICE)
let mercadoCache = { t: 0, texto: '' };
async function precosMercado(env) {
  if (Date.now() - mercadoCache.t < 3600_000) return mercadoCache.texto;
  let texto = 'Preços de mercado: sem dados reais disponíveis agora. Não cite preços; diga que o painel Mercado do app mostra os valores.';
  try {
    const base = env.SITE_URL || 'https://profgiancarllo.github.io/myroca';
    const r = await fetch(`${base}/data/mercado.json`, { cf: { cacheTtl: 3600 } });
    if (r.ok) {
      const m = await r.json();
      const reais = Object.entries(m.crops || {}).filter(([, c]) => c && c.example !== true && m.example !== true && Number(c.price) > 0);
      if (reais.length) {
        const nome = { soja: 'soja', milho: 'milho', trigo: 'trigo', algodao: 'algodão', sorgo: 'sorgo' };
        const linhas = reais.map(([k, c]) => `- ${nome[k] || k}: R$ ${Number(c.price).toFixed(2)}/${c.unit}${typeof c.trend12m === 'number' ? ` (${c.trend12m > 0 ? '+' : ''}${c.trend12m.toFixed(1)}% em 12 meses)` : ''}${c.source ? `, fonte ${c.source}` : ''}${c.asOf ? `, em ${c.asOf}` : ''}`);
        const usd = m.fx?.usd || {};
        const cambio = m.fx ? `; dólar R$ ${Number(m.fx.last).toFixed(4)} por US$${usd.EUR ? `; € ${usd.EUR} por US$` : ''}${usd.CNY ? `; ¥ ${usd.CNY} por US$` : ''}` : '';
        texto = 'Preços de referência (bolsa internacional convertida para R$, SEM prêmio nem base local de Rio Verde; diga isso e que o preço pago ao produtor pode diferir). Fonte: FRED/Yahoo Finance (CBOT/ICE)' + cambio + '.\n' + linhas.join('\n') +
          '\nMoeda: o app mostra os preços na moeda do idioma da conversa (português: R$; inglês e espanhol: US$; alemão e francês: €; chinês: ¥). Converta pelo câmbio acima ao responder em outro idioma.' +
          '\nNão faça previsão de preço nem recomende vender ou comprar; apresente só os números e a tendência.';
      }
    }
  } catch { /* mantém o texto padrão */ }
  mercadoCache = { t: Date.now(), texto };
  return texto;
}

/** Uma chamada à API de Mensagens do Claude. Respostas curtas de chat: esforço baixo. */
async function callClaude(cfg, userText, extraSystem = '') {
  const fallbackOk = cfg.model !== 'claude-haiku-5-5'; // o Haiku 5.5 não tem fallback no servidor
  const headers = { 'content-type': 'application/json', 'x-api-key': cfg.anthropicKey, 'anthropic-version': '2023-06-01' };
  if (fallbackOk) headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
  const payload = {
    model: cfg.model,
    max_tokens: 16000,
    system: extraSystem ? SYSTEM + '\n\n' + extraSystem : SYSTEM,
    output_config: { effort: 'low' },
    messages: [{ role: 'user', content: userText }],
  };
  // Se o modelo recusar por política, a própria API refaz a pergunta num modelo de reserva
  if (fallbackOk) payload.fallbacks = 'default';
  const started = Date.now();
  let r;
  try {
    r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers, body: JSON.stringify(payload) });
  } catch {
    return { ok: false, status: 0, error: 'sem_conexao' };
  }
  const ms = Date.now() - started;
  if (!r.ok) {
    let type = '';
    try { type = (await r.json())?.error?.type || ''; } catch { /* ignora */ }
    return { ok: false, status: r.status, error: type || 'erro_api', ms };
  }
  const j = await r.json();
  if (j.stop_reason === 'refusal') {
    return { ok: true, ms, model: j.model, text: 'Não posso ajudar com esse pedido. Pergunte sobre a lavoura, o clima ou o diário da fazenda.' };
  }
  const text = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('').trim();
  return { ok: !!text, ms, model: j.model, text, error: text ? '' : 'resposta_vazia' };
}

// ---------------- Voz natural (OpenAI)
async function tts(req, env, cors, key) {
  const cfg = await readConfig(env);
  if (!cfg.openaiKey) return new Response('voz não configurada', { status: 501, headers: cors });
  const n = (hits.get(key) || 0) + 1;
  hits.set(key, n);
  if (n > MAX_TTS_PER_IP_PER_DAY) return new Response('limite diário de voz atingido', { status: 429, headers: cors });
  let body;
  try { body = await req.json(); } catch { return new Response('', { status: 400, headers: cors }); }
  const text = String(body.text || '').replace(/\s+/g, ' ').trim().slice(0, 600);
  const lang = String(body.lang || 'pt-BR');
  const voice = VOICES.includes(body.voice) ? body.voice : cfg.voice;
  if (!text) return new Response('', { status: 400, headers: cors });
  const r = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.openaiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      voice,
      input: text,
      instructions: `Fale no idioma ${lang}, com sotaque natural desse idioma (em português, sotaque brasileiro). Tom caloroso, calmo e confiante, como uma agrônoma conversando com um produtor rural. Ritmo de conversa, sem soar como locução.`,
      response_format: 'mp3',
    }),
  });
  if (!r.ok) {
    // Motivo da OpenAI (ex.: invalid_api_key, insufficient_quota, model_not_found), sem expor a chave
    let code = '';
    try { const e = (await r.json())?.error || {}; code = e.code || e.type || ''; } catch { /* ignora */ }
    console.error(`[estela/tts] OpenAI recusou: HTTP ${r.status} ${code}`);
    return new Response(`voz indisponível: ${r.status} ${code}`.trim(), { status: 502, headers: cors });
  }
  return new Response(r.body, { headers: { ...cors, 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' } });
}

// ---------------- Painel de super admin
async function admin(path, req, env, cors, key) {
  if (!env.ADMIN_PASSWORD) return json({ ok: false, error: 'admin_sem_senha' }, cors, 501);
  const failKey = key + ':adminfail';
  if ((hits.get(failKey) || 0) >= MAX_ADMIN_FAILS_PER_IP_PER_DAY) return json({ ok: false, error: 'bloqueado' }, cors, 429);
  const given = req.headers.get('X-Admin-Password') || '';
  if (!(await sameSecret(given, env.ADMIN_PASSWORD))) {
    hits.set(failKey, (hits.get(failKey) || 0) + 1);
    return json({ ok: false, error: 'senha_incorreta' }, cors, 401);
  }

  let body = {};
  try { body = await req.json(); } catch { body = {}; }
  const cfg = await readConfig(env);

  if (path.endsWith('/admin/status')) return json({ ok: true, ...publicStatus(env, cfg) }, cors);

  if (path.endsWith('/admin/test')) {
    if (!cfg.anthropicKey) return json({ ok: false, error: 'claude_nao_configurado' }, cors);
    const q = String(body.question || 'Diga em uma frase quem você é.').slice(0, 300);
    const out = await callClaude(cfg, q);
    return json({ ok: out.ok, ms: out.ms, model: out.model || cfg.model, answer: out.text || '', error: out.error || '', status: out.status || 200 }, cors);
  }

  // /admin/config
  if (!env.CONFIG) return json({ ok: false, error: 'kv_ausente' }, cors, 501);
  const next = { ...cfg.raw };
  if (typeof body.anthropicKey === 'string' && body.anthropicKey.trim()) {
    const k = body.anthropicKey.trim();
    if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(k)) return json({ ok: false, error: 'chave_claude_invalida' }, cors, 400);
    next.anthropicKey = k;
  }
  if (body.clearAnthropic) delete next.anthropicKey;
  if (typeof body.openaiKey === 'string' && body.openaiKey.trim()) {
    const k = body.openaiKey.trim();
    if (!/^sk-[A-Za-z0-9_-]{20,}$/.test(k)) return json({ ok: false, error: 'chave_openai_invalida' }, cors, 400);
    next.openaiKey = k;
  }
  if (body.clearOpenai) delete next.openaiKey;
  if (body.model !== undefined) {
    if (!MODELS.includes(body.model)) return json({ ok: false, error: 'modelo_invalido' }, cors, 400);
    next.model = body.model;
  }
  if (body.voice !== undefined) {
    if (!VOICES.includes(body.voice)) return json({ ok: false, error: 'voz_invalida' }, cors, 400);
    next.voice = body.voice;
  }
  next.updatedAt = new Date().toISOString();
  await env.CONFIG.put('config', JSON.stringify(next));
  return json({ ok: true, ...publicStatus(env, await readConfig(env)) }, cors);
}

/** O que o painel pode ver: se está configurado e de onde veio. As chaves nunca voltam. */
function publicStatus(env, cfg) {
  const tail = (k) => (k ? '…' + k.slice(-4) : '');
  return {
    kv: !!env.CONFIG,
    claude: { configured: !!cfg.anthropicKey, from: cfg.anthropicFrom, hint: tail(cfg.anthropicKey) },
    voice: { configured: !!cfg.openaiKey, from: cfg.openaiFrom, hint: tail(cfg.openaiKey) },
    model: cfg.model,
    voiceName: cfg.voice,
    models: MODELS,
    voices: VOICES,
    allowedOrigin: env.ALLOWED_ORIGIN || '*',
    updatedAt: cfg.updatedAt,
  };
}

/** Compara a senha em tempo constante (pelo hash), para não vazar informação pelo tempo de resposta. */
async function sameSecret(a, b) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  const x = new Uint8Array(ha), y = new Uint8Array(hb);
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0 && a.length > 0;
}

function json(o, cors, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
