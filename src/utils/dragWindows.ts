/**
 * Janelas arrastáveis: toda janela do app (painel que abre à direita) pode ser movida pelo cabeçalho.
 * A posição escolhida vale para aquela janela enquanto a página estiver aberta; duplo toque no cabeçalho volta ao lugar de origem.
 */
const CARDS: [string, string, string][] = [
  ['.mkp-card', '.mkp-head', '.mkp-overlay'],
  ['.modal-card', '.modal-header', '.modal-overlay'],
  ['.wx-dialog', '.panelhead', '.wx-overlay'],
  ['.rot-card', '.rot-head', '.rot-overlay'],
  ['.game-talhao-sheet-card', '.sheet-header', '.game-talhao-sheet-overlay'],
];
const saved = new WeakMap<Element, { x: number; y: number }>();
const keepOf = (w: number) => Math.min(w * 0.5, 220);

function place(card: HTMLElement, x: number, y: number): void {
  const w = card.offsetWidth;
  const cx = Math.min(Math.max(x, keepOf(w) - w), window.innerWidth - keepOf(w));
  const cy = Math.min(Math.max(y, 0), window.innerHeight - 48);
  card.classList.add('dragged');
  card.style.left = cx + 'px'; card.style.top = cy + 'px';
}

function reset(card: HTMLElement): void {
  card.classList.remove('dragged');
  card.style.left = ''; card.style.top = '';
}

export function enableDraggableWindows(): void {
  let drag: { card: HTMLElement; overlay: Element | null; dx: number; dy: number } | null = null;

  document.addEventListener('pointerdown', (e) => {
    const t = e.target as HTMLElement;
    if (!t.closest || t.closest('button, input, select, textarea, a')) return;
    for (const [cardSel, headSel, ovSel] of CARDS) {
      const head = t.closest<HTMLElement>(headSel);
      const card = head?.closest<HTMLElement>(cardSel);
      if (!head || !card) continue;
      const r = card.getBoundingClientRect();
      if (!card.classList.contains('dragged')) place(card, r.left, r.top);
      drag = { card, overlay: card.closest(ovSel), dx: e.clientX - r.left, dy: e.clientY - r.top };
      head.setPointerCapture?.(e.pointerId);
      e.preventDefault();
      return;
    }
  });
  document.addEventListener('pointermove', (e) => {
    if (!drag) return;
    place(drag.card, e.clientX - drag.dx, e.clientY - drag.dy);
  });
  const end = () => {
    if (!drag) return;
    if (drag.overlay) saved.set(drag.overlay, { x: parseFloat(drag.card.style.left), y: parseFloat(drag.card.style.top) });
    drag = null;
  };
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);
  document.addEventListener('dblclick', (e) => {
    const t = e.target as HTMLElement;
    for (const [cardSel, headSel, ovSel] of CARDS) {
      const card = t.closest(headSel)?.closest<HTMLElement>(cardSel);
      if (card) { reset(card); const ov = card.closest(ovSel); if (ov) saved.delete(ov); return; }
    }
  });
  // Janela recriada (conteúdo trocado): reaplica a posição que o usuário escolheu
  new MutationObserver((muts) => {
    for (const m of muts) m.addedNodes.forEach((n) => {
      if (!(n instanceof HTMLElement)) return;
      for (const [cardSel, , ovSel] of CARDS) {
        const card = n.matches(cardSel) ? n : n.querySelector<HTMLElement>(cardSel);
        const ov = card?.closest(ovSel);
        const p = ov ? saved.get(ov) : undefined;
        if (card && p) place(card, p.x, p.y);
      }
    });
  }).observe(document.body, { childList: true, subtree: true });
}
