/**
 * Endereços do app (sem framework de rotas): o último trecho do caminho escolhe a tela inicial.
 *
 *   /         página inicial para quem não tem sessão; o app para quem já entrou
 *   /home     página inicial sempre (mesmo com sessão)
 *   /login    tela de acesso, aba Entrar
 *   /signup   tela de acesso, aba Criar conta
 *   /demo     fazenda de demonstração, sem cadastro
 *
 * Nomes antigos continuam funcionando e são trocados pelo nome em inglês na barra de endereço:
 * /inicio, /entrar, /criar-conta, /demonstracao e os atalhos #inicio, #entrar, #criar-conta, #demonstracao.
 * Funciona também com o app num subcaminho (ex.: GitHub Pages em /SPACEAGRO/).
 */
export type Route = 'root' | 'home' | 'login' | 'signup' | 'demo';

const ALIASES: Record<string, Exclude<Route, 'root'>> = {
  home: 'home', inicio: 'home',
  login: 'login', entrar: 'login',
  signup: 'signup', 'criar-conta': 'signup',
  demo: 'demo', demonstracao: 'demo',
};

/** Pasta do app (termina em "/") e trecho de rota do caminho atual, se houver. */
function split(): { base: string; seg: string } {
  const p = location.pathname.replace(/\/+$/, '');
  const i = p.lastIndexOf('/');
  const seg = p.slice(i + 1).toLowerCase();
  if (ALIASES[seg]) return { base: p.slice(0, i + 1) || '/', seg };
  return { base: p + '/', seg: '' };
}

/** Endereço base do app (a página inicial). */
export function appBase(): string {
  return split().base;
}

/** Rota pedida pelo endereço atual (caminho ou atalho #). */
export function currentRoute(): Route {
  const { seg } = split();
  if (seg) return ALIASES[seg];
  const h = location.hash.replace(/^#/, '').toLowerCase();
  return ALIASES[h] || 'root';
}

/** Mostra a rota na barra de endereço (sem recarregar). */
export function setRoute(route: Route, push = false): void {
  const url = appBase() + (route === 'root' ? '' : route) + location.search;
  if (url === location.pathname + location.search && !location.hash) return;
  if (push) history.pushState(null, '', url);
  else history.replaceState(null, '', url);
}
