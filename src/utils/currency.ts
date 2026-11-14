/**
 * Moeda de exibição dos preços de mercado conforme o idioma do app.
 *
 * Os dados (mercado.json, valores digitados pelo produtor, margens) ficam sempre em reais (R$).
 * Na hora de mostrar, o valor é convertido para a moeda do idioma: português → R$, inglês e espanhol → US$,
 * alemão e francês → €, chinês → ¥ (yuan). O câmbio vem do mercado.json (FRED: DEXBZUS, DEXUSEU, DEXCHUS);
 * sem ele, usa um câmbio aproximado de referência.
 */
import { getCurrentLanguage } from '../i18n';
import { currentMarket } from './market';

export type Currency = 'BRL' | 'USD' | 'EUR' | 'CNY';

const BY_LANG: Record<string, Currency> = { pt: 'BRL', en: 'USD', es: 'USD', de: 'EUR', fr: 'EUR', zh: 'CNY' };
const LOCALES: Record<string, string> = { pt: 'pt-BR', es: 'es', en: 'en-US', de: 'de-DE', zh: 'zh-CN', fr: 'fr-FR' };

/** Câmbio de referência (FRED, 06/11/2026), usado só quando o mercado.json não traz a cotação. */
const FALLBACK = { brlPerUsd: 5.49, perUsd: { EUR: 0.9, CNY: 6.68 } as Record<'EUR' | 'CNY', number> };

const locale = (): string => LOCALES[getCurrentLanguage()] || 'pt-BR';

export function currency(): Currency {
  return BY_LANG[getCurrentLanguage()] || 'BRL';
}

/** true quando a conversão usa o câmbio aproximado (sem cotação carregada). */
export function rateIsApprox(): boolean {
  const c = currency();
  if (c === 'BRL') return false;
  const fx = currentMarket().fx;
  if (!fx?.last) return true;
  return c !== 'USD' && !fx.usd?.[c];
}

/** Quantas unidades da moeda de exibição vale 1 real. */
export function rate(): number {
  const c = currency();
  if (c === 'BRL') return 1;
  const fx = currentMarket().fx;
  const brlPerUsd = fx?.last && fx.last > 0 ? fx.last : FALLBACK.brlPerUsd;
  if (c === 'USD') return 1 / brlPerUsd;
  const perUsd = fx?.usd?.[c] && fx.usd[c]! > 0 ? fx.usd[c]! : FALLBACK.perUsd[c];
  return perUsd / brlPerUsd;
}

/** Converte um valor em reais para a moeda de exibição. */
export const toCur = (brl: number): number => brl * rate();
/** Converte um valor digitado na moeda de exibição de volta para reais. */
export const fromCur = (v: number): number => v / rate();

/** Valor em reais formatado na moeda do idioma (ex.: R$ 120,00 · $22.22 · 20,51 €). */
export function money(brl: number, digits?: number): string {
  const v = toCur(brl);
  const d = digits ?? (Math.abs(v) >= 100 ? 0 : 2);
  return new Intl.NumberFormat(locale(), { style: 'currency', currency: currency(), minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
}

/** Símbolo da moeda no idioma atual (R$, $, US$, €, ¥). */
export function curSymbol(): string {
  const parts = new Intl.NumberFormat(locale(), { style: 'currency', currency: currency() }).formatToParts(0);
  return parts.find((p) => p.type === 'currency')?.value || currency();
}
