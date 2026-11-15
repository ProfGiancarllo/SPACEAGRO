import './landing.css';

/** O que o visitante escolheu na página inicial. */
export type LandingChoice = 'login' | 'signup' | 'guest';

const IMG = './assets/landing/';

const html = () => `
<header class="lp-header">
  <div class="lp-wrap lp-header-in">
    <a class="lp-brand" href="#lp-top" data-scroll aria-label="SpaceAgro, início">
      <span class="brand-mark brand-mark-nav" role="img" aria-hidden="true"><img src="./assets/brand/spaceagro-logo.svg" alt="" /></span>
    </a>
    <nav class="lp-nav" aria-label="Seções">
      <a href="#lp-problema" data-scroll>Problema</a>
      <a href="#lp-solucao" data-scroll>Solução</a>
      <a href="#lp-como" data-scroll>Da NASA ao talhão</a>
      <a href="#lp-mercado" data-scroll>Modelo de negócio</a>
    </nav>
    <div class="lp-header-act">
      <button type="button" class="lp-btn lp-btn-text" data-go="login">Entrar</button>
      <button type="button" class="lp-btn lp-btn-primary" data-go="signup">Criar conta</button>
    </div>
  </div>
</header>

<main>
  <section class="lp-hero" id="lp-top">
    <div class="lp-wrap lp-hero-in">
      <div class="lp-hero-text">
        <h1>A próxima safra começa com uma decisão.</h1>
        <p class="lp-lead">Dados da Terra e inteligência para o campo. O SpaceAgro junta imagens de satélite da NASA, clima, dados de cada talhão e mercado em um só lugar, e a assistente Estrela transforma isso em recomendação: o que plantar, quando plantar e quanto produzir.</p>
        <div class="lp-cta-row">
          <button type="button" class="lp-btn lp-btn-light" data-go="guest">Conhecer sem conta (demonstração)</button>
          <button type="button" class="lp-btn lp-btn-outline-light" data-go="signup">Criar conta</button>
        </div>
        <p class="lp-hero-note">A demonstração abre uma fazenda de exemplo em Rio Verde (GO), sem cadastro.</p>
      </div>
      <figure class="lp-hero-fig">
        <img fetchpriority="high" src="${IMG}equipe-astronautas.jpg" width="875" height="1568" alt="Equipe SpaceAgro em uma lavoura de soja, em montagem com trajes de astronauta" />
      </figure>
    </div>
    <div class="lp-wrap lp-hero-foot">
      <p class="lp-challenge"><strong>Desafio:</strong> como adaptar as fazendas às constantes mudanças do campo com informações confiáveis.</p>
      <ul class="lp-sources-bar" aria-label="Fontes de dados usadas pelo SpaceAgro">
        <li>NASA Landsat 8/9</li><li>HLS</li><li>NASA POWER</li><li>ECOSTRESS</li><li>FIRMS</li><li>Esri World Imagery</li>
      </ul>
    </div>
  </section>

  <section class="lp-sec" id="lp-problema">
    <div class="lp-wrap lp-split">
      <div>
        <h2>Uma decisão errada na data de plantio pode custar centenas de milhares de reais.</h2>
        <p class="lp-body">Na safra 2025/2026 em Goiás, o atraso de até 2 semanas no plantio e a irregularidade das chuvas reduziram a produtividade da soja.</p>
        <table class="lp-figs">
          <caption class="lp-sr">Impacto do atraso no plantio da soja, safra 2025/2026, Goiás</caption>
          <tbody>
            <tr><th scope="row">Produtividade da safra anterior</th><td>~70 sc/ha</td></tr>
            <tr><th scope="row">Estimativa da safra 2025/2026</th><td>66,5 sc/ha</td></tr>
            <tr class="lp-neg"><th scope="row">Queda de produtividade</th><td>−3,5 sc/ha (−5%)</td></tr>
            <tr><th scope="row">Receita não realizada por hectare<span>3,5 sacas × R$ 120,00</span></th><td>R$ 420/ha</td></tr>
            <tr><th scope="row">Em uma propriedade de 1.000 hectares</th><td>R$ 420.000</td></tr>
            <tr><th scope="row">Se houver replantio<span>custo adicional de até 5,9 sacas/ha em Rio Verde (GO), com nova adubação</span></th><td>≈ R$ 708/ha</td></tr>
          </tbody>
        </table>
        <p class="lp-src">Fontes: FAEG, Expedição Safra Goiás 2025/26 (23/01/2026), queda de 70 para 66,5 sc/ha e atraso de até 2 semanas · CNA, replantio da soja (16/01/2026), custo adicional em Rio Verde (GO) · IFAG/DadoAgro, preço médio da soja em Rio Verde (GO), R$ 120/saca (nov/2025).</p>
      </div>
      <figure class="lp-photo lp-photo-tall">
        <img src="${IMG}produtor-talhao.jpg" width="900" height="1200" loading="lazy" alt="Produtor consultando o celular no meio da lavoura de soja" />
      </figure>
    </div>
  </section>

  <section class="lp-sec lp-sec-alt">
    <div class="lp-wrap">
      <h2>Decidir sem enxergar o cenário completo.</h2>
      <p class="lp-body">Toda safra começa com três perguntas fundamentais.</p>
      <ol class="lp-questions">
        <li><span class="lp-qn">01</span><h3>O que plantar?</h3><p>Culturas, oferta e demanda.</p></li>
        <li><span class="lp-qn">02</span><h3>Quando plantar?</h3><p>Clima e janela de plantio.</p></li>
        <li><span class="lp-qn">03</span><h3>Quanto produzir?</h3><p>Área, custo e risco de mercado.</p></li>
      </ol>
      <p class="lp-statement">O problema não é a falta de dados. É a falta de integração.</p>
    </div>
  </section>

  <section class="lp-sec" id="lp-solucao">
    <div class="lp-wrap lp-split lp-split-rev">
      <figure class="lp-photo">
        <img src="${IMG}equipe-notebook.jpg" width="900" height="1200" loading="lazy" alt="Integrante da equipe SpaceAgro mostrando o aplicativo aberto em um notebook" />
      </figure>
      <div>
        <h2>Todos os dados. Uma decisão mais inteligente.</h2>
        <p class="lp-body">Uma plataforma digital que integra, organiza e analisa, em um só lugar, dados de satélite, clima, dados do campo e mercado, e usa a assistente Estrela para indicar a melhor decisão para a sua safra.</p>
        <div class="lp-flow">
          <ul class="lp-inputs">
            <li><strong>Satélite</strong>Imagens e saúde da lavoura</li>
            <li><strong>Clima</strong>Previsão, chuva e riscos</li>
            <li><strong>Dados do campo</strong>Talhões, plantio e operações</li>
            <li><strong>Mercado</strong>Preços, demanda e tendências</li>
          </ul>
          <div class="lp-flow-step">Análise integrada + Estrela</div>
          <div class="lp-flow-out">Recomenda o que plantar, quando plantar, quanto produzir e como melhorar o resultado.</div>
        </div>
      </div>
    </div>
  </section>

  <section class="lp-sec lp-sec-alt">
    <div class="lp-wrap">
      <div class="lp-feature">
        <div class="lp-feature-text">
          <h2>Saúde da lavoura por satélite da NASA, talhão por talhão.</h2>
          <p class="lp-body">O SpaceAgro busca a imagem Landsat 8/9 mais recente de cada talhão, analisa pixel a pixel e mostra o estágio e a saúde da lavoura em cada área, com alerta para os talhões que merecem uma visita.</p>
          <ul class="lp-list">
            <li>Vigor da planta (NDVI) e água na folha (NDMI)</li>
            <li>Fase da lavoura e dias após o plantio</li>
            <li>Chuva dos últimos 14 dias na fazenda</li>
          </ul>
        </div>
        <figure class="lp-shot">
          <button type="button" class="lp-zoom-btn" data-zoom="${IMG}app-saude.jpg" aria-label="Ampliar: Tela do SpaceAgro com o mapa de talhões e o painel de saúde da lavoura">
            <img src="${IMG}app-saude.jpg" width="1600" height="1000" loading="lazy" alt="Tela do SpaceAgro com o mapa de talhões e o painel de saúde da lavoura" />
            <span class="lp-zoom-hint" aria-hidden="true">Ampliar</span>
          </button>
          <figcaption>Tela real do aplicativo com a fazenda de demonstração. Clique para ampliar.</figcaption>
        </figure>
      </div>

      <div class="lp-feature lp-feature-rev">
        <div class="lp-feature-text">
          <h2>Safra e decisões: qual cultura deixa mais dinheiro e por quê.</h2>
          <p class="lp-body">Para cada talhão, o planejamento de safra compara culturas, cruza clima e mercado e mostra a estimativa de lucro e os riscos de cada opção.</p>
          <ul class="lp-list">
            <li>Comparação de culturas por talhão</li>
            <li>Clima e preços considerados juntos</li>
            <li>Indicação da opção com melhor retorno e o porquê</li>
          </ul>
        </div>
        <figure class="lp-shot">
          <button type="button" class="lp-zoom-btn" data-zoom="${IMG}app-safra.jpg" aria-label="Ampliar: Tela de planejamento de safra do SpaceAgro comparando culturas para um talhão">
            <img src="${IMG}app-safra.jpg" width="1600" height="1000" loading="lazy" alt="Tela de planejamento de safra do SpaceAgro comparando culturas para um talhão" />
            <span class="lp-zoom-hint" aria-hidden="true">Ampliar</span>
          </button>
          <figcaption>Tela real do aplicativo com a fazenda de demonstração. Clique para ampliar.</figcaption>
        </figure>
      </div>

      <div class="lp-feature lp-feature-photo">
        <div class="lp-feature-text">
          <h2>Estrela, a assistente do produtor rural.</h2>
          <p class="lp-body">A Estrela analisa os dados da sua lavoura e responde em linguagem simples, direto do celular. Pergunte, por exemplo, “Posso plantar no talhão 2?” ou “Como está o clima?”.</p>
          <ul class="lp-list">
            <li>Respostas com base nos dados da sua fazenda</li>
            <li>Acompanha a fazenda e avisa sobre clima e risco de plantio</li>
            <li>Funciona no celular, no meio da lavoura</li>
          </ul>
        </div>
        <figure class="lp-photo lp-photo-feature">
          <img src="${IMG}produtor-celular.jpg" width="900" height="1200" loading="lazy" alt="Produtor na lavoura de soja mostrando o SpaceAgro aberto no celular" />
        </figure>
      </div>
    </div>
  </section>

  <section class="lp-sec" id="lp-como">
    <div class="lp-wrap">
      <h2>Da NASA ao talhão: como funciona.</h2>
      <p class="lp-body">Da coleta de dados espaciais à recomendação prática para o produtor.</p>
      <ol class="lp-steps">
        <li>
          <h3><span>1</span>Dados da NASA</h3>
          <dl class="lp-sources">
            <div><dt>Landsat 8/9 e HLS L30</dt><dd>Saúde da lavoura com resolução de 30 m</dd></div>
            <div><dt>NASA POWER</dt><dd>Chuva, temperatura, radiação e umidade</dd></div>
            <div><dt>ECOSTRESS</dt><dd>Estresse hídrico da vegetação</dd></div>
            <div><dt>FIRMS</dt><dd>Focos de fogo próximos à fazenda</dd></div>
            <div><dt>GIBS e MODIS</dt><dd>Imagens diárias e séries de vegetação</dd></div>
          </dl>
        </li>
        <li>
          <h3><span>2</span>Integração e análise</h3>
          <p>Os dados de satélite são cruzados com o clima, o mercado e o histórico de cada talhão: plantio, cultura e operações.</p>
          <p>A partir disso, o sistema identifica padrões, tendências e riscos por talhão.</p>
        </li>
        <li>
          <h3><span>3</span>Recomendação para o produtor</h3>
          <p>O resultado chega como decisão simples e prática: o que plantar, quando plantar e quanto produzir, com a assistente Estrela para tirar dúvidas.</p>
        </li>
      </ol>
    </div>
  </section>

  <section class="lp-sec lp-sec-alt" id="lp-impacto">
    <div class="lp-wrap">
      <h2>O impacto que buscamos no campo.</h2>
      <p class="lp-body">Transformar dados em decisões que gerem mais produtividade, rentabilidade e sustentabilidade.</p>
      <dl class="lp-impact">
        <div><dt>Produtividade</dt><dd><strong>até 20%</strong> de aumento na produtividade por talhão</dd></div>
        <div><dt>Rentabilidade</dt><dd><strong>até 15%</strong> de redução de custos operacionais e de insumos</dd></div>
        <div><dt>Riscos</dt><dd><strong>até 40%</strong> menos perdas por clima e escolha de cultura</dd></div>
        <div><dt>Sustentabilidade</dt><dd>Uso mais eficiente de água, solo e insumos, com menor impacto ambiental</dd></div>
      </dl>
      <p class="lp-src">Potencial estimado pela equipe SpaceAgro. Ainda não são resultados medidos em fazendas clientes.</p>
    </div>
  </section>

  <section class="lp-sec" id="lp-mercado">
    <div class="lp-wrap lp-market">
      <div>
        <h2>Modelo de negócio.</h2>
        <p class="lp-price"><strong>R$ 6,00</strong> por hectare por ano</p>
        <p class="lp-body">Assinatura (SaaS) cobrada pela área monitorada.</p>
        <h3 class="lp-h3">Próximos passos</h3>
        <ol class="lp-next">
          <li><strong>Escalar a solução.</strong> Evoluir o MVP e validar com mais produtores.</li>
          <li><strong>Expandir o mercado.</strong> Conquistar novas regiões e culturas.</li>
          <li><strong>Consolidar a startup.</strong> Estruturar operações, parcerias estratégicas e captação de investimento.</li>
        </ol>
      </div>
      <div>
        <h3 class="lp-h3">Tamanho do mercado</h3>
        <table class="lp-table">
          <caption class="lp-sr">Tamanho do mercado em área e receita anual a R$ 6,00 por hectare</caption>
          <thead><tr><th scope="col"></th><th scope="col">Área</th><th scope="col">Receita/ano</th></tr></thead>
          <tbody>
            <tr><th scope="row">TAM<span>mercado total</span></th><td>85,3 milhões ha</td><td>R$ 511,8 mi</td></tr>
            <tr><th scope="row">SAM<span>mercado endereçável</span></th><td>47,62 milhões ha</td><td>R$ 285,7 mi</td></tr>
            <tr><th scope="row">SOM<span>meta inicial</span></th><td>476 mil ha</td><td>R$ 2,86 mi</td></tr>
          </tbody>
        </table>
        <p class="lp-src">Receita calculada a R$ 6,00 por hectare por ano.</p>
      </div>
    </div>
  </section>

  <section class="lp-final">
    <div class="lp-wrap lp-final-in">
      <h2>Somos a equipe SpaceAgro e estamos prontos para conectar a tecnologia da NASA ao futuro da agricultura.</h2>
      <div class="lp-cta-row">
        <button type="button" class="lp-btn lp-btn-light" data-go="guest">Conhecer sem conta (demonstração)</button>
        <button type="button" class="lp-btn lp-btn-outline-light" data-go="signup">Criar conta</button>
        <button type="button" class="lp-btn lp-btn-text-light" data-go="login">Já tenho conta</button>
      </div>
    </div>
  </section>
</main>

<footer class="lp-footer">
  <div class="lp-wrap lp-footer-in">
    <span class="brand-mark brand-mark-sm" role="img" aria-label="SpaceAgro"><img src="./assets/brand/spaceagro-logo.svg" alt="" /></span>
    <p>Dados: NASA Landsat, HLS, POWER, ECOSTRESS, FIRMS e GIBS · Imagem de base: Esri World Imagery</p>
    <p>© ${new Date().getFullYear()} SpaceAgro · spaceagro.pro</p>
  </div>
</footer>

<dialog class="lp-zoom" aria-label="Tela ampliada">
  <form method="dialog"><button class="lp-zoom-close" aria-label="Fechar">Fechar</button></form>
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
    root.innerHTML = html();
    document.body.appendChild(root);
    const prevTitle = document.title;
    document.title = 'SpaceAgro - Dados da NASA para decidir a safra';

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
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) if (en.isIntersecting) {
        links.forEach((l) => l.toggleAttribute('aria-current', l.getAttribute('href') === '#' + en.target.id));
      }
    }, { root, rootMargin: '-40% 0px -55% 0px' });
    links.forEach((l) => { const t = root.querySelector(l.getAttribute('href') || ''); if (t) io.observe(t); });

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
        io.disconnect();
        root.remove();
        document.title = prevTitle;
        resolve(b.dataset.go as LandingChoice);
      });
    });
  });
}
