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
// <<< CONAB

const SYSTEM =
  'Você é a Estrela, engenheira agrônoma virtual do app SpaceAgro (Rio Verde-GO). ' +
  'Responda de forma curta, simples e prática para o produtor rural, no idioma da pergunta. ' +
  'Use os dados da fazenda fornecidos. Não invente números; se não souber, diga que falta informação ' +
  'e sugira consultar o agrônomo responsável. Não dê receita de defensivos nem dose. ' +
  'Para perguntas sobre época de plantio, use SOMENTE a tabela do ZARC abaixo (Ministério da Agricultura), cite "ZARC/MAPA" como fonte, ' +
  'explique que o risco depende do solo e do ciclo da cultivar e que a janela vale para o município, ' +
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

// ---------------- Pergunta para a Estrela (API do Claude)
async function ask(req, env, cors, key) {
  const n = (hits.get(key) || 0) + 1;
  hits.set(key, n);
  if (n > MAX_PER_IP_PER_DAY) return json({ answer: 'Limite diário de perguntas atingido. Tente amanhã.' }, cors);

  let body;
  try { body = await req.json(); } catch { return json({ answer: '' }, cors, 400); }
  const question = String(body.question || '').slice(0, 800);
  const ctx = JSON.stringify(body.context || {}).slice(0, 4000);
  if (!question) return json({ answer: '' }, cors, 400);

  const cfg = await readConfig(env);
  if (!cfg.anthropicKey) return json({ answer: '', error: 'claude_nao_configurado' }, cors, 503);
  const out = await callClaude(cfg, `Dados da fazenda: ${ctx}\n\nPergunta: ${question}`);
  if (!out.ok) return json({ answer: '' }, cors, 502);
  return json({ answer: out.text }, cors);
}

/** Uma chamada à API de Mensagens do Claude. Respostas curtas de chat: esforço baixo. */
async function callClaude(cfg, userText) {
  const fallbackOk = cfg.model !== 'claude-haiku-5-5'; // o Haiku 5.5 não tem fallback no servidor
  const headers = { 'content-type': 'application/json', 'x-api-key': cfg.anthropicKey, 'anthropic-version': '2023-06-01' };
  if (fallbackOk) headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
  const payload = {
    model: cfg.model,
    max_tokens: 16000,
    system: SYSTEM,
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
  if (!r.ok) return new Response('', { status: 502, headers: cors });
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
