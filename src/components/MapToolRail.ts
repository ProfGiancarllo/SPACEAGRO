/**
 * Barra de ferramentas do mapa (canto superior esquerdo).
 *
 * Uma coluna de botões com ícone, agrupados por intenção (Criar · Medir · Analisar). Cada botão tem nome,
 * explicação curta e atalho de teclado (mostrados ao passar o mouse ou com "Mostrar nomes"). Quando uma
 * ferramenta de modo está ligada, um cartão no rodapé do mapa diz o que fazer e oferece "Sair" (ou Esc).
 */
import { tt } from '../i18n/toolsText';

export type ToolGroup = 'criar' | 'medir' | 'analisar';
export interface ToolSpec {
  id: string; group: ToolGroup; order: number; icon: string;
  label: string; desc: string; key?: string;
  onClick: () => void;
}
interface Ctx { tool: string; onExit: () => void; }

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const svg = (d: string) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export const ICONS = {
  draw: svg('<path d="M5 18 4 8l8-4.5L20 9l-3 9Z"/><circle cx="5" cy="18" r="1.6" fill="currentColor"/><circle cx="4" cy="8" r="1.6" fill="currentColor"/><circle cx="12" cy="3.5" r="1.6" fill="currentColor"/><circle cx="20" cy="9" r="1.6" fill="currentColor"/>'),
  wand: svg('<path d="M9 13V5.5a1.5 1.5 0 0 1 3 0V11"/><path d="M12 10.5a1.5 1.5 0 0 1 3 0V12"/><path d="M15 11.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-.6a5 5 0 0 1-4-2L5 15.6a1.5 1.5 0 0 1 2.3-1.9L9 15.5"/><path d="M4 4.5 5.5 6M3 9h2M14.5 3.5 13.5 5"/>'),
  adjust: svg('<path d="M6 6h12v12H6z" stroke-dasharray="2.5 2.5"/><rect x="3.5" y="3.5" width="5" height="5" rx="1" fill="#fff"/><rect x="15.5" y="3.5" width="5" height="5" rx="1" fill="#fff"/><rect x="3.5" y="15.5" width="5" height="5" rx="1" fill="#fff"/><rect x="15.5" y="15.5" width="5" height="5" rx="1" fill="currentColor"/>'),
  measure: svg('<path d="M3.5 16.5 16.5 3.5l4 4-13 13Z"/><path d="m7.5 12.5 1.8 1.8M10.5 9.5l1.8 1.8M13.5 6.5l1.8 1.8"/>'),
  find: svg('<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5.5 5.5"/>'),
  sat: svg('<path d="M4.5 19.5c0-8 5.5-14 15-15-.8 9.5-7 15-15 15Z"/><path d="M4.5 19.5 13 11"/>'),
  water: svg('<path d="M12 3.5s6 6.4 6 10.8a6 6 0 0 1-12 0c0-4.4 6-10.8 6-10.8Z"/><path d="M9.2 14.5a2.8 2.8 0 0 0 2.8 2.8"/>'),
  names: svg('<path d="M4 6h3M4 12h3M4 18h3M11 6h9M11 12h9M11 18h9"/>'),
};

const GROUPS: ToolGroup[] = ['criar', 'medir', 'analisar'];
const GROUP_LABEL: Record<ToolGroup, string> = { criar: 'gCreate', medir: 'gMeasure', analisar: 'gAnalyze' };
const LS_KEY = 'sa-tools-names';

export class MapToolRail {
  readonly el: HTMLElement;
  private groups = {} as Record<ToolGroup, HTMLElement>;
  private btns = new Map<string, HTMLButtonElement>();
  private specs = new Map<string, ToolSpec>();
  private card: HTMLElement;
  private ctx: Ctx | null = null;

  constructor(private host: HTMLElement) {
    const el = document.createElement('div');
    el.className = 'maplibregl-ctrl map-rail';
    el.setAttribute('role', 'toolbar'); el.setAttribute('aria-label', tt('rail')); el.setAttribute('aria-orientation', 'vertical');
    GROUPS.forEach((g) => {
      const box = document.createElement('div');
      box.className = 'map-rail-group'; box.setAttribute('role', 'group'); box.setAttribute('aria-label', tt(GROUP_LABEL[g]));
      box.innerHTML = `<div class="map-rail-head" aria-hidden="true">${esc(tt(GROUP_LABEL[g]))}</div>`;
      box.hidden = true;
      this.groups[g] = box; el.appendChild(box);
    });
    // mostrar/ocultar os nomes ao lado dos ícones (lembrado neste navegador)
    const names = document.createElement('button');
    names.type = 'button'; names.className = 'map-rail-btn map-rail-names';
    const setNames = (on: boolean, remember = false) => {
      el.classList.toggle('named', on);
      names.setAttribute('aria-pressed', String(on));
      names.innerHTML = `${ICONS.names}<span class="map-rail-label">${esc(tt(on ? 'hideNames' : 'showNames'))}</span>`;
      names.setAttribute('aria-label', tt(on ? 'hideNames' : 'showNames'));
      if (remember) try { localStorage.setItem(LS_KEY, on ? '1' : '0'); } catch { /* sem armazenamento: só não lembra */ }
    };
    let saved: string | null = null;
    try { saved = localStorage.getItem(LS_KEY); } catch { /* idem */ }
    // nomes à vista na primeira vez só em tela larga (o mapa sobra); no resto, ícones com dica
    setNames(saved === null ? window.innerWidth >= 1500 : saved === '1');
    names.onclick = (e) => { e.stopPropagation(); setNames(!el.classList.contains('named'), true); };
    el.appendChild(names);
    this.el = el;

    // cartão de instruções da ferramenta ligada (rodapé do mapa)
    const card = document.createElement('div');
    card.className = 'map-tool-card'; card.hidden = true; card.setAttribute('role', 'status'); card.setAttribute('aria-live', 'polite');
    card.addEventListener('click', (e) => e.stopPropagation());
    host.appendChild(card);
    this.card = card;

    // atalhos: letra da ferramenta liga/desliga; Esc sai da ferramenta ligada (antes dos outros usos do Esc)
    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tg = e.target as HTMLElement | null;
      const typing = !!tg && (tg.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName));
      if (e.key === 'Escape' && this.ctx && (!typing || this.card.contains(tg))) {
        e.preventDefault(); e.stopImmediatePropagation(); this.ctx.onExit(); return;
      }
      if (typing || !this.host.offsetParent) return;
      if (document.querySelector('.modal-overlay.show, .mkp-overlay[style*="flex"], .wx-overlay[style*="flex"], .sat-modal')) return;
      const k = e.key.toLowerCase();
      const spec = [...this.specs.values()].find((s) => s.key && s.key.toLowerCase() === k);
      if (!spec) return;
      e.preventDefault();
      spec.onClick();
    }, true);
  }

  add(spec: ToolSpec): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'map-rail-btn'; b.dataset.tool = spec.id; b.dataset.order = String(spec.order);
    b.setAttribute('aria-pressed', 'false');
    if (spec.key) b.setAttribute('aria-keyshortcuts', spec.key.toUpperCase());
    b.onclick = (e) => { e.stopPropagation(); spec.onClick(); };
    this.specs.set(spec.id, spec);
    this.btns.set(spec.id, b);
    this.paint(spec.id, spec.label);
    const box = this.groups[spec.group];
    const after = [...box.querySelectorAll<HTMLButtonElement>('.map-rail-btn')].find((x) => Number(x.dataset.order) > spec.order);
    box.insertBefore(b, after || null);
    box.hidden = false;
    return b;
  }

  private paint(id: string, label: string): void {
    const b = this.btns.get(id), s = this.specs.get(id);
    if (!b || !s) return;
    const key = s.key ? `<kbd>${esc(s.key.toUpperCase())}</kbd>` : '';
    b.setAttribute('aria-label', label);
    b.innerHTML = `${s.icon}<span class="map-rail-label">${esc(label)}</span>`
      + `<span class="map-rail-tip" role="tooltip"><strong>${esc(label)}${key}</strong><span>${esc(s.desc)}</span></span>`;
  }

  /** Estado visual do botão: ligado, carregando e (opcional) outro nome. */
  setState(id: string, st: { on?: boolean; busy?: boolean; label?: string }): void {
    const b = this.btns.get(id);
    if (!b) return;
    if (st.label !== undefined) this.paint(id, st.label);
    if (st.on !== undefined) { b.classList.toggle('on', st.on); b.setAttribute('aria-pressed', String(st.on)); }
    if (st.busy !== undefined) { b.classList.toggle('busy', st.busy); b.setAttribute('aria-busy', String(st.busy)); }
  }

  /** Abre o cartão de instruções da ferramenta (substitui o de outra ferramenta). */
  showContext(tool: string, title: string, onExit: () => void): HTMLElement {
    this.ctx = { tool, onExit };
    const c = this.card;
    c.innerHTML = '';
    const head = document.createElement('div'); head.className = 'map-tool-card-head';
    const ic = document.createElement('span'); ic.className = 'map-tool-card-ic'; ic.innerHTML = this.specs.get(tool)?.icon || '';
    const h = document.createElement('strong'); h.textContent = title;
    const hint = document.createElement('span'); hint.className = 'map-tool-card-esc'; hint.textContent = tt('escHint');
    const x = document.createElement('button'); x.type = 'button'; x.className = 'map-tool-card-exit'; x.textContent = tt('exit');
    x.onclick = () => onExit();
    head.append(ic, h, hint, x);
    const body = document.createElement('div'); body.className = 'map-tool-card-body';
    c.append(head, body);
    c.hidden = false;
    return body;
  }

  /** Fecha o cartão, se for da ferramenta indicada. */
  hideContext(tool: string): void {
    if (this.ctx?.tool !== tool) return;
    this.ctx = null;
    this.card.hidden = true;
    this.card.innerHTML = '';
  }

  contextBody(tool: string): HTMLElement | null {
    return this.ctx?.tool === tool ? this.card.querySelector<HTMLElement>('.map-tool-card-body') : null;
  }
}
