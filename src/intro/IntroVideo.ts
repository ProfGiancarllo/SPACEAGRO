/**
 * Abertura animada do SpaceAgro com a Estrela (logo: estrela verde com anel de órbita).
 * Tudo desenhado em canvas, sem arquivo de vídeo:
 *  1) céu estrelado e um ponto de luz        2) o ponto percorre a órbita e a Estrela nasce
 *  3) a Estrela orbita a Terra e manda dados 4) mergulho até a fazenda, varredura dos talhões
 *  5) logo final com a chamada e o botão Entrar
 * "Pular" encerra a qualquer momento. Com "reduzir movimento", vai direto para o final.
 */
import { getCurrentLanguage } from '../i18n';

type L = 'pt' | 'es' | 'en' | 'de' | 'zh' | 'fr';
const TXT: Record<string, Record<L, string>> = {
  c1: { pt: 'Toda boa colheita começa olhando para o céu.', en: 'Every good harvest starts by looking at the sky.', es: 'Toda buena cosecha empieza mirando al cielo.', de: 'Jede gute Ernte beginnt mit einem Blick zum Himmel.', zh: '每一次丰收，都从仰望天空开始。', fr: 'Toute bonne récolte commence en regardant le ciel.' },
  c2: { pt: 'Esta é a Estrela.', en: 'This is Estrela.', es: 'Esta es Estrela.', de: 'Das ist Estrela.', zh: '这是 Estrela。', fr: 'Voici Estrela.' },
  c3: { pt: 'Lá de cima, ela acompanha a sua terra com dados da NASA.', en: 'From above, she follows your land with NASA data.', es: 'Desde arriba, sigue tu tierra con datos de la NASA.', de: 'Von oben begleitet sie Ihr Land mit NASA-Daten.', zh: '她在高空，用 NASA 数据守护你的土地。', fr: 'D’en haut, elle suit votre terre avec les données de la NASA.' },
  c4: { pt: 'Chuva, clima e cada talhão: tudo no mesmo lugar.', en: 'Rain, weather and every field: all in one place.', es: 'Lluvia, clima y cada lote: todo en un mismo lugar.', de: 'Regen, Wetter und jedes Feld: alles an einem Ort.', zh: '降雨、天气和每一块地：尽在一处。', fr: 'Pluie, météo et chaque parcelle : tout au même endroit.' },
  title: { pt: 'Estrela', en: 'Estrela', es: 'Estrela', de: 'Estrela', zh: 'Estrela', fr: 'Estrela' },
  cta: { pt: 'Sua agrônoma virtual, de olho na lavoura.', en: 'Your virtual agronomist, watching over the field.', es: 'Tu agrónoma virtual, atenta al cultivo.', de: 'Ihre virtuelle Agronomin, mit Blick auf das Feld.', zh: '你的虚拟农艺师，时刻关注农田。', fr: 'Votre agronome virtuelle, attentive à la parcelle.' },
  enter: { pt: 'Entrar', en: 'Enter', es: 'Entrar', de: 'Starten', zh: '进入', fr: 'Entrer' },
  skip: { pt: 'Pular', en: 'Skip', es: 'Saltar', de: 'Überspringen', zh: '跳过', fr: 'Passer' },
};
const tx = (k: string): string => TXT[k][(getCurrentLanguage() as L)] || TXT[k].en;

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (v: number) => { v = clamp(v); return v * v * (3 - 2 * v); };
const easeOut = (v: number) => 1 - (1 - clamp(v)) ** 3;
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

// Linha do tempo (segundos, antes do ajuste de velocidade)
const T = { sky: 0, birth: 2.2, orbit: 5.0, farm: 7.8, end: 10.4 };
// Anel do logo no PNG 512x512: centro, raios e inclinação aproximados
const RING = { cx: 260, cy: 236, rx: 222, ry: 66, rot: -0.33 };
const GREEN = '#7ed321', GREEN_DARK = '#1e6b25';

export function playIntro(): Promise<void> {
  const q = new URLSearchParams(location.search);
  if (q.get('intro') === '0') return Promise.resolve();
  let seen = false;
  try { seen = sessionStorage.getItem('myroca_intro_seen') === '1'; sessionStorage.setItem('myroca_intro_seen', '1'); } catch { /* ignora */ }
  const reduce = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const speed = seen ? 1.6 : 1; // reabertura mais rápida

  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.id = 'intro-video';
    root.innerHTML = `<canvas aria-hidden="true"></canvas><div class="iv-cap" id="iv-cap" aria-live="polite"></div>
      <div class="iv-end iv-end-star" id="iv-end">
        <div class="iv-logo-slot" aria-hidden="true"></div>
        <div class="iv-title">${tx('title')}</div>
        <div class="iv-tagline">${tx('cta')}</div>
        <div class="iv-sub">SpaceAgro · NASA Space Apps Challenge 2026</div>
        <button type="button" id="iv-enter">${tx('enter')}</button>
      </div>
      <button type="button" class="iv-skip" id="iv-skip">${tx('skip')}</button>`;
    document.body.appendChild(root);
    const cv = root.querySelector('canvas') as HTMLCanvasElement;
    const ctx = cv.getContext('2d')!;
    const cap = root.querySelector('#iv-cap') as HTMLElement;
    const end = root.querySelector('#iv-end') as HTMLElement;
    let W = 0, H = 0, dpr = 1;
    const resize = () => { dpr = Math.min(2, window.devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px'; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    resize(); addEventListener('resize', resize);

    let done = false, raf = 0;
    const finish = () => { if (done) return; done = true; cancelAnimationFrame(raf); removeEventListener('resize', resize); removeEventListener('keydown', onKey); root.classList.add('iv-out'); setTimeout(() => { root.remove(); resolve(); }, 450); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') finish(); };
    addEventListener('keydown', onKey);
    (root.querySelector('#iv-skip') as HTMLElement).onclick = finish;
    (root.querySelector('#iv-enter') as HTMLElement).onclick = finish;
    (window as unknown as { __introDone?: () => void }).__introDone = finish;

    // ---------- imagens ----------
    const base = (import.meta as unknown as { env: { BASE_URL: string } }).env.BASE_URL || './';
    const files: Record<string, string> = { logo: 'assets/brand/spaceagro-icon.png', earth: 'intro/earth.jpg', farm: 'intro/farm.jpg' };
    const imgs: Record<string, HTMLImageElement> = {};
    let loaded = 0, started = false, start = 0;
    const begin = () => { if (done || started) return; started = true; start = performance.now(); raf = requestAnimationFrame(frame); };
    Object.entries(files).forEach(([k, f], _i, all) => {
      const im = new Image(); im.onload = im.onerror = () => { if (++loaded === all.length) begin(); };
      im.src = base + f; imgs[k] = im;
    });
    setTimeout(begin, 4000); // não trava se a rede estiver lenta

    // ---------- céu estrelado (3 camadas para dar profundidade) ----------
    const rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
    const stars = Array.from({ length: 420 }, () => ({ x: rnd(), y: rnd(), z: 0.2 + rnd() * 0.8, tw: rnd() * 6.28 }));
    const drawSky = (t: number, warp: number) => {
      const g = ctx.createRadialGradient(W * 0.5, H * 0.55, 0, W * 0.5, H * 0.55, Math.max(W, H) * 0.8);
      g.addColorStop(0, '#0b1a2c'); g.addColorStop(0.55, '#050b16'); g.addColorStop(1, '#02040a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const cx = W / 2, cy = H / 2;
      for (const s of stars) {
        // "warp": as estrelas correm para fora do centro (sensação de avançar)
        const k = 1 + warp * s.z * 2.2;
        const x = cx + (s.x * W - cx) * k, y = cy + (s.y * H - cy) * k;
        if (x < -10 || x > W + 10 || y < -10 || y > H + 10) continue;
        const a = (0.35 + 0.65 * s.z) * (0.6 + 0.4 * Math.sin(t * 2.2 + s.tw));
        ctx.fillStyle = `rgba(220,235,255,${a})`;
        const r = 0.4 + s.z * 1.3;
        if (warp > 0.02) {
          ctx.strokeStyle = `rgba(200,225,255,${a * 0.8})`; ctx.lineWidth = r;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(cx + (x - cx) * (1 - 0.06 * warp * s.z), cy + (y - cy) * (1 - 0.06 * warp * s.z)); ctx.stroke();
        } else { ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill(); }
      }
    };

    // ponto no anel (coordenadas do logo → tela)
    const ringPt = (a: number, ox: number, oy: number, sc: number) => {
      const x = RING.rx * Math.cos(a), y = RING.ry * Math.sin(a);
      const c = Math.cos(RING.rot), s = Math.sin(RING.rot);
      return [ox + (RING.cx + x * c - y * s - 256) * sc, oy + (RING.cy + x * s + y * c - 256) * sc] as const;
    };

    const glowDot = (x: number, y: number, r: number, a: number, color = '170,255,120') => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.25, `rgba(${color},${a * 0.85})`); g.addColorStop(1, `rgba(${color},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
    };

    /** Desenha o logo centrado em (ox,oy) com escala sc; reveal 0..1 abre o logo em leque, seguindo o cometa. */
    const drawLogo = (ox: number, oy: number, sc: number, alpha: number, reveal = 1, glow = 0) => {
      const im = imgs.logo; if (!im?.naturalWidth || alpha <= 0) return;
      const sz = 512 * sc;
      ctx.save();
      ctx.globalAlpha = alpha;
      if (reveal < 1) {
        ctx.beginPath(); ctx.moveTo(ox, oy);
        ctx.arc(ox, oy, sz, -Math.PI / 2, -Math.PI / 2 + reveal * Math.PI * 2); ctx.closePath(); ctx.clip();
      }
      if (glow > 0) { ctx.shadowColor = `rgba(126,211,33,${0.9 * glow})`; ctx.shadowBlur = 40 * glow * Math.max(0.5, sc); }
      ctx.drawImage(im, ox - sz / 2, oy - sz / 2, sz, sz);
      ctx.restore();
    };

    const cover = (name: string, alpha: number, zoom: number, fx = 0.5, fy = 0.5) => {
      const im = imgs[name]; if (!im?.naturalWidth || alpha <= 0) return;
      const iw = im.naturalWidth, ih = im.naturalHeight, b = Math.max(W / iw, H / ih), sc = b * zoom;
      ctx.globalAlpha = alpha;
      ctx.drawImage(im, W * fx - fx * iw * sc, H * fy - fy * ih * sc, iw * sc, ih * sc);
      ctx.globalAlpha = 1;
    };

    // contornos de talhões (grade irregular) para a varredura sobre a fazenda
    const fields = Array.from({ length: 9 }, (_, i) => {
      const col = i % 3, row = Math.floor(i / 3);
      const x = 0.12 + col * 0.27 + (rnd() - 0.5) * 0.03, y = 0.16 + row * 0.25 + (rnd() - 0.5) * 0.03;
      return [[x, y], [x + 0.22 + rnd() * 0.03, y + (rnd() - 0.5) * 0.02], [x + 0.21 + rnd() * 0.03, y + 0.2 + rnd() * 0.02], [x - 0.01, y + 0.19 + rnd() * 0.02]];
    });

    const trail: [number, number][] = [];

    const frame = (now: number) => {
      const dbg = (window as unknown as { __introT?: number }).__introT;
      let t = dbg !== undefined ? dbg : ((now - start) / 1000) * speed;
      if (reduce) t = Math.max(t, T.end);
      const S = Math.min(W, H);
      const cx = W / 2, cy = H * 0.47;

      // ---------- 1) céu + ponto de luz ----------
      const warp = ease(seg(t, T.orbit - 0.6, T.orbit + 0.4)) * (1 - ease(seg(t, T.orbit + 0.4, T.orbit + 1.2)));
      drawSky(t, warp);

      // ---------- 3) Terra entra por baixo enquanto a Estrela se afasta ----------
      const earthIn = ease(seg(t, T.orbit, T.orbit + 1.2));
      const toFarm = ease(seg(t, T.farm - 0.4, T.farm + 0.8));
      if (earthIn > 0 && toFarm < 1) {
        const z = lerp(1.15, 1.0, earthIn) * (1 + 3.5 * toFarm * toFarm);
        cover('earth', earthIn * (1 - toFarm), z, 0.56, lerp(0.95, 0.62, earthIn));
        // brilho das nuvens no mergulho
        ctx.fillStyle = `rgba(255,255,255,${0.6 * Math.sin(clamp(seg(t, T.farm - 0.2, T.farm + 0.9)) * Math.PI)})`; ctx.fillRect(0, 0, W, H);
      }

      // ---------- 4) fazenda + varredura dos talhões ----------
      const farmIn = ease(seg(t, T.farm + 0.2, T.farm + 0.9));
      if (farmIn > 0) {
        const z = 1 + 0.9 * (1 - easeOut(seg(t, T.farm + 0.2, T.farm + 2.2))) + 0.04 * seg(t, T.farm + 2.2, T.end + 3);
        cover('farm', farmIn, z);
        const shade = ease(seg(t, T.end - 0.4, T.end + 0.8));
        // varredura: linha de luz que desce e acende os contornos
        const sweep = easeOut(seg(t, T.farm + 0.9, T.end - 0.3));
        if (sweep > 0 && shade < 1) {
          const y = H * sweep;
          const lg = ctx.createLinearGradient(0, y - 90, 0, y + 4);
          lg.addColorStop(0, 'rgba(126,211,33,0)'); lg.addColorStop(1, `rgba(190,255,140,${0.55 * (1 - shade)})`);
          ctx.fillStyle = lg; ctx.fillRect(0, y - 90, W, 94);
          ctx.lineWidth = 2; ctx.lineJoin = 'round';
          fields.forEach((f, i) => {
            const fy = Math.min(...f.map((p) => p[1]));
            const on = clamp((sweep - fy) * 6) * (1 - shade);
            if (on <= 0) return;
            ctx.strokeStyle = `rgba(210,255,170,${0.9 * on})`;
            ctx.fillStyle = `rgba(126,211,33,${0.16 * on})`;
            ctx.beginPath(); f.forEach(([x, yy], j) => (j ? ctx.lineTo(x * W, yy * H) : ctx.moveTo(x * W, yy * H))); ctx.closePath(); ctx.fill(); ctx.stroke();
            // marcador no centro do talhão
            const mx = f.reduce((s, p) => s + p[0], 0) / 4 * W, my = f.reduce((s, p) => s + p[1], 0) / 4 * H;
            glowDot(mx, my, 10 + 4 * Math.sin(t * 4 + i), 0.8 * on);
          });
        }
        // escurece para o final
        if (shade > 0) { ctx.fillStyle = `rgba(3,10,18,${0.78 * shade})`; ctx.fillRect(0, 0, W, H); }
      }

      // ---------- 2) nascimento da Estrela: cometa percorre a órbita e revela o logo ----------
      const birth = seg(t, T.birth, T.birth + 2.2);
      const logoScaleBig = (S * 0.62) / 512;
      // posição/escala do logo ao longo da história
      const toOrbit = ease(seg(t, T.orbit - 0.2, T.orbit + 1.1));
      const toEnd = ease(seg(t, T.end - 0.2, T.end + 0.9));
      let ox = cx, oy = cy, sc = logoScaleBig;
      if (toOrbit > 0) {
        // na órbita: pequena, girando ao redor da Terra pelo alto da tela
        const a = (t - T.orbit) * 1.1;
        const px = cx + Math.cos(a) * W * 0.32, py = H * 0.3 + Math.sin(a) * H * 0.08;
        ox = lerp(cx, px, toOrbit); oy = lerp(cy, py, toOrbit); sc = lerp(logoScaleBig, (S * 0.12) / 512, toOrbit);
      }
      const leaveFarm = ease(seg(t, T.farm - 0.2, T.farm + 0.6)) * (1 - toEnd);
      const endScale = (S * (W < 700 ? 0.42 : 0.3)) / 512;
      if (toEnd > 0) { ox = lerp(ox, cx, toEnd); oy = lerp(oy, H * (W < 700 ? 0.42 : 0.39), toEnd); sc = lerp(sc, endScale, toEnd); }

      // ponto inicial pulsando
      if (t < T.birth + 0.3) {
        const p = ease(seg(t, 0.2, 1.2));
        glowDot(cx, cy, S * (0.03 + 0.012 * Math.sin(t * 5)), p);
        glowDot(cx, cy, S * 0.12, 0.25 * p);
      }
      if (birth > 0) {
        // cometa percorrendo o anel (uma volta e meia) com rastro
        const ang = -Math.PI * 0.9 + birth * Math.PI * 3;
        const [hx, hy] = ringPt(ang, ox, oy, sc);
        if (birth < 1) { trail.push([hx, hy]); if (trail.length > 42) trail.shift(); }
        else if (trail.length) trail.shift();
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        trail.forEach(([x, y], i) => glowDot(x, y, S * 0.02 * (i / trail.length), 0.5 * (i / trail.length)));
        if (birth < 1) glowDot(hx, hy, S * 0.045, 1);
        ctx.restore();
        // a Estrela aparece em leque acompanhando o cometa, com brilho que acalma
        const reveal = easeOut(seg(t, T.birth + 0.3, T.birth + 2.0));
        const glow = 1 - 0.7 * ease(seg(t, T.birth + 2.0, T.birth + 2.8));
        const alpha = 1 - leaveFarm;
        drawLogo(ox, oy, sc, alpha, reveal, glow);
        // brilho de "nascimento"
        const flash = Math.sin(clamp(seg(t, T.birth + 1.7, T.birth + 2.5)) * Math.PI);
        if (flash > 0) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glowDot(ox, oy, 512 * sc * 0.75, 0.45 * flash); ctx.restore(); }
      }

      // pulsos de dados da Estrela até a Terra
      if (toOrbit > 0.6 && leaveFarm < 0.9) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 4; i++) {
          const k = ((t * 0.9 + i / 4) % 1);
          const x = lerp(ox, cx + (i - 1.5) * W * 0.08, k), y = lerp(oy, H * 0.9, k);
          glowDot(x, y, S * 0.012, 0.9 * (1 - k) * (1 - leaveFarm));
        }
        ctx.restore();
      }

      // final: anel de luz suave em volta do logo
      if (toEnd > 0) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        glowDot(ox, oy, 512 * sc * 0.7, 0.18 * toEnd * (0.8 + 0.2 * Math.sin(t * 2)));
        ctx.restore();
        drawLogo(ox, oy, sc, toEnd, 1, 0.35 + 0.15 * Math.sin(t * 2));
      }
      end.classList.toggle('show', toEnd > 0.6);

      // ---------- legendas ----------
      const cur = t < T.birth + 0.2 ? 'c1' : t < T.orbit ? 'c2' : t < T.farm ? 'c3' : t < T.end - 0.3 ? 'c4' : '';
      const st = { c1: 0.4, c2: T.birth + 1.6, c3: T.orbit + 0.6, c4: T.farm + 0.6 }[cur as 'c1'] ?? 0;
      if (cap.dataset.k !== cur) { cap.dataset.k = cur; cap.textContent = cur ? tx(cur) : ''; }
      cap.style.opacity = cur ? String(clamp((t - st) / 0.5)) : '0';
      raf = requestAnimationFrame(frame);
    };
  });
}
