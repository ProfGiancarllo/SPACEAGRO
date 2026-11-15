import './landing.css';
import { getCurrentLanguage, setLanguage } from '../i18n';
import { LANDING_TEXT, LandingDict, LandingLang } from './landingText';
import { mountGlobe, GlobeHandle, GlobeView, FireSnapshot, FarmStats, NEAR_KM } from './globe';

/** O que o visitante escolheu na página inicial. */
export type LandingChoice = 'login' | 'signup' | 'guest';

const IMG = './assets/landing/';
const STAR = './assets/brand/spaceagro-icon.png';
// Versão do logo para fundo escuro (gerada a partir de spaceagro-logo.png).
const LOGO = './assets/brand/spaceagro-logo-escuro.png';
const LANGS: [LandingLang, string, string][] = [['pt', 'PT', 'Português'], ['en', 'EN', 'English'], ['es', 'ES', 'Español']];

/** Idioma da página: o mesmo do sistema; alemão e francês caem para inglês. */
const landingLang = (): LandingLang => {
  const l = getCurrentLanguage();
  return l === 'pt' || l === 'es' ? l : 'en';
};

const html = (t: LandingDict, lang: LandingLang) => `
<header class="lp-header">
  <div class="lp-wrap lp-header-in">
    <a class="lp-brand" href="#lp-top" data-scroll aria-label="${t.homeAria}">
      <span class="lp-logo"><img src="${LOGO}" width="1460" height="384" alt="SpaceAgro" /></span>
    </a>
    <nav class="lp-nav" aria-label="${t.navAria}">
      <a href="#lp-problema" data-scroll>${t.navProblem}</a>
      <a href="#lp-solucao" data-scroll>${t.navSolution}</a>
      <a href="#lp-previsoes" data-scroll>${t.navForecast}</a>
      <a href="#lp-como" data-scroll>${t.navHow}</a>
      <a href="#lp-mercado" data-scroll>${t.navMarket}</a>
    </nav>
    <div class="lp-header-act">
      <label class="lp-lang"><span class="lp-sr">${t.langLabel}</span>
        <select id="lp-lang" aria-label="${t.langLabel}">
          ${LANGS.map(([c, short, name]) => `<option value="${c}" ${c === lang ? 'selected' : ''} title="${name}">${short}</option>`).join('')}
        </select>
      </label>
    </div>
  </div>
</header>

<main>
  <section class="lp-hero" id="lp-top">
    <div class="lp-wrap lp-hero-in">
      <div class="lp-hero-text">
        <p class="lp-mono lp-kicker">${t.kicker}</p>
        <h1>${t.h1a} <em>${t.h1b}</em></h1>
        <p class="lp-lead">${t.lead}</p>
        <div class="lp-cta-row">
          <button type="button" class="lp-btn lp-btn-accent lp-btn-lg" data-go="guest">${t.demo}</button>
          <button type="button" class="lp-btn lp-btn-outline lp-btn-lg" data-go="signup">${t.signup}</button>
        </div>
        <p class="lp-hero-note">${t.heroNote}</p>
      </div>

      <div class="lp-globe-wrap">
        <div class="lp-globe" id="lp-globe" role="img" aria-label="${t.globeAria}"></div>
        <div class="lp-globe-bar">
          <p class="lp-globe-status" id="lp-globe-status" aria-live="polite">${t.globeLoading}</p>
          <div class="lp-globe-btns">
            <button type="button" class="lp-chip" id="lp-fly">${t.globeFly}</button>
            <button type="button" class="lp-chip" id="lp-pause">${t.btnPause}</button>
            <button type="button" class="lp-chip" id="lp-replay">${t.btnReplay}</button>
            <button type="button" class="lp-chip" id="lp-planet">${t.globePlanet}</button>
          </div>
        </div>
        <ul class="lp-globe-legend">
          <li><span class="lp-dot lp-dot-fire" aria-hidden="true"></span><span id="lp-fire-legend">${t.globeLoading}</span></li>
          <li><span class="lp-dot lp-dot-farm" aria-hidden="true"></span>${t.legendFarm}</li>
          <li><span class="lp-dot lp-dot-field" aria-hidden="true"></span>${t.legendFields}</li>
        </ul>
      </div>
    </div>
    <div class="lp-wrap">
      <dl class="lp-facts" aria-label="${t.missionAria}">
        <div><dt>${t.missionKicker}</dt><dd>Rio Verde (GO) · ${t.mCoordsV}</dd></div>
        <div><dt>${t.mArea}</dt><dd>${t.mAreaV}</dd></div>
        <div><dt>${t.mImg}</dt><dd>${t.mImgV}</dd></div>
        <div><dt>${t.mRain}</dt><dd>${t.mRainV}</dd></div>
        <div><dt>${t.mFire}</dt><dd>NASA FIRMS · VIIRS 375 m</dd></div>
      </dl>
      <p class="lp-challenge"><span class="lp-mono">${t.challengeK}</span> ${t.challenge}</p>
    </div>
  </section>

  <section class="lp-sec" id="lp-problema">
    <div class="lp-wrap lp-split">
      <div>
        <p class="lp-mono lp-idx">${t.pIdx}</p>
        <h2>${t.pTitle}</h2>
        <p class="lp-body">${t.pBody}</p>
        <table class="lp-figs">
          <caption class="lp-sr">${t.pCaption}</caption>
          <tbody>
            <tr><th scope="row">${t.f1}</th><td>${t.f1v}</td></tr>
            <tr><th scope="row">${t.f2}</th><td>${t.f2v}</td></tr>
            <tr class="lp-neg"><th scope="row">${t.f3}</th><td>${t.f3v}</td></tr>
            <tr><th scope="row">${t.f4}<span>${t.f4s}</span></th><td>${t.f4v}</td></tr>
            <tr class="lp-total"><th scope="row">${t.f5}</th><td>${t.f5v}</td></tr>
            <tr><th scope="row">${t.f6}<span>${t.f6s}</span></th><td>${t.f6v}</td></tr>
          </tbody>
        </table>
        <p class="lp-src">${t.pSrc}</p>
      </div>
      <figure class="lp-photo lp-photo-tall">
        <img src="${IMG}produtor-talhao.jpg" width="900" height="1200" loading="lazy" alt="${t.pAlt}" />
      </figure>
    </div>
  </section>

  <section class="lp-sec lp-dark lp-questions-sec">
    <div class="lp-wrap">
      <p class="lp-mono lp-idx">${t.qIdx}</p>
      <h2>${t.qTitle}</h2>
      <p class="lp-body">${t.qBody}</p>
      <ol class="lp-questions">
        <li><span class="lp-qn">01</span><h3>${t.q1}</h3><p>${t.q1s}</p></li>
        <li><span class="lp-qn">02</span><h3>${t.q2}</h3><p>${t.q2s}</p></li>
        <li><span class="lp-qn">03</span><h3>${t.q3}</h3><p>${t.q3s}</p></li>
      </ol>
      <p class="lp-statement">${t.qStatementA} <strong>${t.qStatementB}</strong></p>
    </div>
  </section>

  <section class="lp-sec" id="lp-solucao">
    <div class="lp-wrap lp-split lp-split-rev">
      <figure class="lp-photo">
        <img src="${IMG}equipe-notebook.jpg" width="900" height="1200" loading="lazy" alt="${t.sAlt}" />
      </figure>
      <div>
        <p class="lp-mono lp-idx">${t.sIdx}</p>
        <h2>${t.sTitle}</h2>
        <p class="lp-body">${t.sBody}</p>
        <div class="lp-flow">
          <ul class="lp-inputs">
            <li><strong>${t.in1}</strong>${t.in1s}</li>
            <li><strong>${t.in2}</strong>${t.in2s}</li>
            <li><strong>${t.in3}</strong>${t.in3s}</li>
            <li><strong>${t.in4}</strong>${t.in4s}</li>
          </ul>
          <div class="lp-flow-step"><img src="${STAR}" width="32" height="32" alt="" />${t.flowStep}</div>
          <div class="lp-flow-out">${t.flowOut}</div>
        </div>
      </div>
    </div>
  </section>

  <section class="lp-sec lp-sec-alt">
    <div class="lp-wrap">
      <div class="lp-feature">
        <div class="lp-feature-text">
          <p class="lp-mono lp-idx">${t.satIdx}</p>
          <h2>${t.satTitle}</h2>
          <p class="lp-body">${t.satBody}</p>
          <ul class="lp-list"><li>${t.sat1}</li><li>${t.sat2}</li><li>${t.sat3}</li></ul>
        </div>
        <figure class="lp-shot">
          <button type="button" class="lp-zoom-btn" data-zoom="${IMG}app-saude.jpg" aria-label="${t.satZoom}">
            <img src="${IMG}app-saude.jpg" width="1600" height="1000" loading="lazy" alt="${t.satAlt}" />
            <span class="lp-zoom-hint" aria-hidden="true">${t.zoomHint}</span>
          </button>
          <figcaption>${t.shotCaption}</figcaption>
        </figure>
      </div>

      <div class="lp-feature lp-feature-rev">
        <div class="lp-feature-text">
          <p class="lp-mono lp-idx">${t.cropIdx}</p>
          <h2>${t.cropTitle}</h2>
          <p class="lp-body">${t.cropBody}</p>
          <ul class="lp-list"><li>${t.crop1}</li><li>${t.crop2}</li><li>${t.crop3}</li></ul>
        </div>
        <figure class="lp-shot">
          <button type="button" class="lp-zoom-btn" data-zoom="${IMG}app-safra.jpg" aria-label="${t.cropZoom}">
            <img src="${IMG}app-safra.jpg" width="1600" height="1000" loading="lazy" alt="${t.cropAlt}" />
            <span class="lp-zoom-hint" aria-hidden="true">${t.zoomHint}</span>
          </button>
          <figcaption>${t.shotCaption}</figcaption>
        </figure>
      </div>
    </div>
  </section>

  <section class="lp-sec" id="lp-previsoes">
    <div class="lp-wrap">
      <p class="lp-mono lp-idx">${t.fcIdx}</p>
      <h2>${t.fcTitle}</h2>
      <p class="lp-body">${t.fcBody}</p>
      <div class="lp-forecast">
        <article class="lp-fc-card">
          <figure class="lp-shot">
            <button type="button" class="lp-zoom-btn" data-zoom="${IMG}app-previsao.jpg" aria-label="${t.zoomHint}: ${t.wxT}">
              <img src="${IMG}app-previsao.jpg" width="1200" height="896" loading="lazy" alt="${t.wxAlt}" />
              <span class="lp-zoom-hint" aria-hidden="true">${t.zoomHint}</span>
            </button>
          </figure>
          <h3>${t.wxT}</h3>
          <p class="lp-fc-lead">${t.wxB}</p>
          <ul class="lp-list"><li>${t.wx1}</li><li>${t.wx2}</li></ul>
          <p class="lp-src">${t.wxSrc}</p>
        </article>
        <article class="lp-fc-card">
          <figure class="lp-shot">
            <button type="button" class="lp-zoom-btn" data-zoom="${IMG}app-tempo.jpg" aria-label="${t.zoomHint}: ${t.wkT}">
              <img src="${IMG}app-tempo.jpg" width="1524" height="1366" loading="lazy" alt="${t.wkAlt}" />
              <span class="lp-zoom-hint" aria-hidden="true">${t.zoomHint}</span>
            </button>
          </figure>
          <h3>${t.wkT}</h3>
          <p class="lp-fc-lead">${t.wkB}</p>
          <ol class="lp-steps-mini"><li>${t.wk1}</li><li>${t.wk2}</li><li>${t.wk3}</li><li>${t.wk4}</li></ol>
          <p class="lp-src">${t.wkNote}</p>
        </article>
      </div>
      <p class="lp-src lp-fc-caption">${t.shotCaptionDay}</p>
    </div>
  </section>

  <section class="lp-sec lp-dark lp-estrela">
    <div class="lp-wrap lp-feature lp-feature-photo">
      <div class="lp-feature-text">
        <div class="lp-estrela-id">
          <img src="${STAR}" width="80" height="80" alt="" />
          <div>
            <h2>Estrela</h2>
            <p class="lp-mono">${t.estSub}</p>
          </div>
        </div>
        <p class="lp-body">${t.estBody}</p>
        <div class="lp-chat" aria-label="${t.estChatAria}">
          <p class="lp-chat-q">${t.estQ1}</p>
          <p class="lp-chat-q">${t.estQ2}</p>
        </div>
        <ul class="lp-list"><li>${t.est1}</li><li>${t.est2}</li><li>${t.est3}</li></ul>
      </div>
      <figure class="lp-photo lp-photo-feature">
        <img src="${IMG}produtor-celular.jpg" width="900" height="1200" loading="lazy" alt="${t.estAlt}" />
      </figure>
    </div>
  </section>

  <section class="lp-sec lp-space" id="lp-como">
    <div class="lp-wrap">
      <p class="lp-mono lp-idx">${t.hIdx}</p>
      <h2>${t.hTitle}</h2>
      <p class="lp-body">${t.hBody}</p>
      <ol class="lp-pipeline">
        <li>
          <span class="lp-node" aria-hidden="true"></span>
          <p class="lp-mono">${t.h1k}</p>
          <h3>${t.h1t}</h3>
          <table class="lp-spec">
            <caption class="lp-sr">${t.hSpecCaption}</caption>
            <tbody>
              <tr><th scope="row">Landsat 8/9 · HLS</th><td>${t.sp1}</td></tr>
              <tr><th scope="row">NASA POWER</th><td>${t.sp2}</td></tr>
              <tr><th scope="row">ECOSTRESS</th><td>${t.sp3}</td></tr>
              <tr><th scope="row">FIRMS</th><td>${t.sp4}</td></tr>
              <tr><th scope="row">GIBS · MODIS</th><td>${t.sp5}</td></tr>
            </tbody>
          </table>
        </li>
        <li>
          <span class="lp-node" aria-hidden="true"></span>
          <p class="lp-mono">${t.h2k}</p>
          <h3>${t.h2t}</h3>
          <p>${t.h2p1}</p>
          <p>${t.h2p2}</p>
        </li>
        <li>
          <span class="lp-node" aria-hidden="true"></span>
          <p class="lp-mono">${t.h3k}</p>
          <h3>${t.h3t}</h3>
          <p>${t.h3p}</p>
        </li>
      </ol>
    </div>
  </section>

  <section class="lp-sec" id="lp-impacto">
    <div class="lp-wrap">
      <p class="lp-mono lp-idx">${t.iIdx}</p>
      <h2>${t.iTitle}</h2>
      <p class="lp-body">${t.iBody}</p>
      <dl class="lp-impact">
        <div><dt>${t.i1}</dt><dd><strong>${t.i1v}</strong> ${t.i1s}</dd></div>
        <div><dt>${t.i2}</dt><dd><strong>${t.i2v}</strong> ${t.i2s}</dd></div>
        <div><dt>${t.i3}</dt><dd><strong>${t.i3v}</strong> ${t.i3s}</dd></div>
        <div><dt>${t.i4}</dt><dd><strong class="lp-impact-word">${t.i4v}</strong> ${t.i4s}</dd></div>
      </dl>
      <p class="lp-src">${t.iSrc}</p>
    </div>
  </section>

  <section class="lp-sec lp-sec-alt" id="lp-mercado">
    <div class="lp-wrap lp-market">
      <div>
        <p class="lp-mono lp-idx">${t.mIdx}</p>
        <h2>${t.mTitle}</h2>
        <p class="lp-price"><strong>${t.priceV}</strong> ${t.priceUnit}</p>
        <p class="lp-body">${t.priceBody}</p>
        <h3 class="lp-h3">${t.nextTitle}</h3>
        <ol class="lp-next">
          <li><strong>${t.n1a}</strong> ${t.n1b}</li>
          <li><strong>${t.n2a}</strong> ${t.n2b}</li>
          <li><strong>${t.n3a}</strong> ${t.n3b}</li>
        </ol>
      </div>
      <div class="lp-market-card">
        <h3 class="lp-h3">${t.mkTitle}</h3>
        <table class="lp-table">
          <caption class="lp-sr">${t.mkCaption}</caption>
          <thead><tr><th scope="col"></th><th scope="col">${t.mkArea}</th><th scope="col">${t.mkRev}</th></tr></thead>
          <tbody>
            <tr><th scope="row">TAM<span>${t.tam}</span></th><td>${t.tamA}</td><td>${t.tamR}</td></tr>
            <tr><th scope="row">SAM<span>${t.sam}</span></th><td>${t.samA}</td><td>${t.samR}</td></tr>
            <tr><th scope="row">SOM<span>${t.som}</span></th><td>${t.somA}</td><td>${t.somR}</td></tr>
          </tbody>
        </table>
        <p class="lp-src">${t.mkSrc}</p>
      </div>
    </div>
  </section>

  <section class="lp-final lp-space">
    <div class="lp-wrap lp-final-in">
      <div>
        <span class="lp-logo lp-logo-lg"><img src="${LOGO}" width="1460" height="384" alt="SpaceAgro" /></span>
        <h2>${t.finA} <em>${t.finB}</em></h2>
        <div class="lp-cta-row">
          <button type="button" class="lp-btn lp-btn-accent lp-btn-lg" data-go="guest">${t.demo}</button>
          <button type="button" class="lp-btn lp-btn-outline lp-btn-lg" data-go="signup">${t.signup}</button>
        </div>
      </div>
      <figure class="lp-final-fig">
        <img src="${IMG}equipe-astronautas.jpg" width="875" height="1568" loading="lazy" alt="${t.finAlt}" />
      </figure>
    </div>
  </section>
</main>

<footer class="lp-footer">
  <div class="lp-wrap lp-footer-in">
    <span class="lp-logo lp-logo-sm"><img src="${LOGO}" width="1460" height="384" alt="SpaceAgro" /></span>
    <p>${t.footData}</p>
    <p>© ${new Date().getFullYear()} SpaceAgro · spaceagro.pro</p>
  </div>
</footer>

<dialog class="lp-zoom" aria-label="${t.zoomAria}">
  <form method="dialog"><button class="lp-zoom-close">${t.close}</button></form>
  <img alt="" />
</dialog>`;

/**
 * Página inicial comercial, mostrada a quem chega sem sessão.
 * Resolve com a escolha do visitante (entrar, criar conta ou demonstração).
 */
export function showLanding(): Promise<LandingChoice> {
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.id = 'landing';
    document.body.appendChild(root);
    const prevTitle = document.title;
    let io: IntersectionObserver | null = null;
    let globe: GlobeHandle | null = null;
    let snap: FireSnapshot | null = null;
    let farmStats: FarmStats | null = null;
    let view: GlobeView = 'planet';

    const render = () => {
      const lang = landingLang();
      const t = LANDING_TEXT[lang];
      io?.disconnect();
      root.innerHTML = html(t, lang);
      root.lang = lang === 'pt' ? 'pt-BR' : lang;
      document.title = t.docTitle;

      // Globo
      const locale = lang === 'pt' ? 'pt-BR' : lang === 'es' ? 'es' : 'en-US';
      const fmt = (iso: string) => new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date(iso));
      const nf = new Intl.NumberFormat(locale);
      const fill = (tpl: string, v: Record<string, string>) => tpl.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
      const statusEl = root.querySelector<HTMLElement>('#lp-globe-status')!;
      const legendEl = root.querySelector<HTMLElement>('#lp-fire-legend')!;
      const paint = () => {
        if (snap) legendEl.textContent = snap.total
          ? fill(t.legendFires, { n: nf.format(snap.total), a: fmt(snap.primeiraDeteccao), b: fmt(snap.ultimaDeteccao) })
          : t.legendFiresNone;
        if (view === 'flying') statusEl.textContent = t.stFlying;
        else if (view === 'tour') statusEl.textContent = t.stTour;
        else if (view === 'paused') statusEl.textContent = t.stPaused;
        else if (view === 'done' && farmStats) {
          const d = farmStats.nearestKm === null ? '—' : nf.format(Math.round(farmStats.nearestKm));
          statusEl.textContent = fill(farmStats.nearCount ? t.stFarm : t.stFarmNone, { n: nf.format(farmStats.nearCount), r: String(NEAR_KM), d });
        } else if (snap) statusEl.textContent = t.stPlanet;
        const show = (id: string, on: boolean) => root.querySelector('#' + id)?.toggleAttribute('hidden', !on);
        show('lp-fly', view === 'planet');
        show('lp-pause', view === 'tour' || view === 'paused');
        show('lp-replay', view === 'done' || view === 'paused');
        show('lp-planet', view === 'tour' || view === 'paused' || view === 'done');
        const pb = root.querySelector('#lp-pause');
        if (pb) pb.textContent = view === 'paused' ? t.btnResume : t.btnPause;
      };
      globe?.destroy();
      view = 'planet';
      globe = mountGlobe(root.querySelector<HTMLElement>('#lp-globe')!, {
        cooperative: { windows: t.coopWin, mac: t.coopMac, mobile: t.coopMobile },
        labels: { locale, ha: t.gmHa, step: t.tStep, crop: t.tCrop, area: t.tArea, phase: t.tPhase, harvest: t.tHarvest, water: t.tWater, struct: t.tStruct, fireTitle: t.tFireTitle, fireBody: t.tFireBody, nearestFire: t.gmNearest, cardTitle: t.gmCardTitle, cardFields: t.gmFields, cardArea: t.gmArea, cardWater: t.gmWater, cardFire: t.gmFire },
        onFires: (s) => { snap = s; paint(); },
        onFarm: (f) => { farmStats = f; paint(); },
        onView: (v) => { view = v; paint(); },
        onError: () => { statusEl.textContent = t.globeError; root.querySelector('.lp-globe-wrap')?.classList.add('lp-globe-failed'); },
      });
      root.querySelector('#lp-fly')!.addEventListener('click', () => globe?.flyToFarm());
      root.querySelector('#lp-planet')!.addEventListener('click', () => globe?.flyToPlanet());
      root.querySelector('#lp-pause')!.addEventListener('click', () => globe?.togglePause());
      root.querySelector('#lp-replay')!.addEventListener('click', () => globe?.replay());
      paint();

      root.querySelector<HTMLSelectElement>('#lp-lang')!.addEventListener('change', (e) => {
        const top = root.scrollTop;
        setLanguage((e.target as HTMLSelectElement).value as LandingLang);
        render();
        root.scrollTop = top;
        root.querySelector<HTMLSelectElement>('#lp-lang')?.focus();
      });

      root.querySelectorAll<HTMLAnchorElement>('a[data-scroll]').forEach((a) => {
        a.addEventListener('click', (e) => {
          const target = root.querySelector(a.getAttribute('href') || '');
          if (!target) return;
          e.preventDefault();
          const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
        });
      });

      // Destaca no menu a seção visível.
      const links = [...root.querySelectorAll<HTMLAnchorElement>('.lp-nav a')];
      io = new IntersectionObserver((entries) => {
        for (const en of entries) if (en.isIntersecting) {
          links.forEach((l) => l.toggleAttribute('aria-current', l.getAttribute('href') === '#' + en.target.id));
        }
      }, { root, rootMargin: '-40% 0px -55% 0px' });
      links.forEach((l) => { const tg = root.querySelector(l.getAttribute('href') || ''); if (tg) io!.observe(tg); });

      // Ampliar as telas do aplicativo.
      const zoom = root.querySelector<HTMLDialogElement>('.lp-zoom')!;
      const zoomImg = zoom.querySelector('img')!;
      root.querySelectorAll<HTMLButtonElement>('[data-zoom]').forEach((b) => {
        b.addEventListener('click', () => {
          zoomImg.src = b.dataset.zoom!;
          zoomImg.alt = b.querySelector('img')?.alt || '';
          zoom.showModal();
        });
      });
      zoom.addEventListener('click', (e) => { if (e.target === zoom) zoom.close(); });

      root.querySelectorAll<HTMLButtonElement>('[data-go]').forEach((b) => {
        b.addEventListener('click', () => {
          io?.disconnect();
          globe?.destroy();
          root.remove();
          document.title = prevTitle;
          resolve(b.dataset.go as LandingChoice);
        });
      });
    };
    render();
  });
}
