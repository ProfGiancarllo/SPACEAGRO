import { FarmData, Talhao } from '../types';
import { calculateTalhaoCropStatus, diffDays } from '../utils/cropCalendar';
import { cropKey } from '../utils/forecast';

export type PendKind = 'crop' | 'planting' | 'harvest' | 'cultivar' | 'diary';
export interface Pending { kind: PendKind; talhaoId: string; days?: number }

const ORDER: Record<PendKind, number> = { crop: 0, planting: 1, harvest: 2, cultivar: 3, diary: 4 };
export const DIARY_STALE_DAYS = 7;

/** Lista, de forma determinística, o que falta informar em cada talhão. */
export function computePending(farm: FarmData, ref: string, skipped: Set<string> = new Set()): Pending[] {
  const out: Pending[] = [];
  for (const tl of farm.talhoes) {
    const add = (p: Pending) => { if (!skipped.has(`${p.kind}:${p.talhaoId}`)) out.push(p); };
    if (!tl.crop) { add({ kind: 'crop', talhaoId: tl.id }); continue; }
    const k = cropKey(tl.crop);
    if (k === 'pasto') continue; // perene, sem plantio/colheita
    if (!tl.plantingDate) { add({ kind: 'planting', talhaoId: tl.id }); continue; }
    const st = calculateTalhaoCropStatus(tl, ref);
    const diary = tl.diary || [];
    const harvested = diary.some((d) => d.type === 'colheita' && d.date >= tl.plantingDate!);
    if (tl.cycleDays && st.daysPassed >= tl.cycleDays && !harvested) { add({ kind: 'harvest', talhaoId: tl.id, days: st.daysPassed - tl.cycleDays }); continue; }
    if (!tl.cultivar) add({ kind: 'cultivar', talhaoId: tl.id });
    if (!harvested && st.daysPassed >= 0) {
      const last = diary.filter((d) => d.date <= ref).map((d) => d.date).sort().pop();
      const gap = last ? diffDays(last, ref) : 9999;
      if (gap >= DIARY_STALE_DAYS) add({ kind: 'diary', talhaoId: tl.id, days: gap === 9999 ? undefined : gap });
    }
  }
  return out.sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
}
export type { Talhao };

/** Problemas nos registros do diário que o produtor precisa corrigir (verificação simples e determinística). */
export interface DiaryIssue { talhaoId: string; entryId?: string; date?: string; code: string; detail: string }
const HARVEST_RANGE: Record<string, [number, number]> = { soja: [20, 100], milho: [40, 250], feijao: [10, 80], sorgo: [20, 150], trigo: [15, 120], algodao: [100, 450] };
const NEEDS_AMOUNT = new Set(['adubacao', 'aplicacao', 'calagem', 'foliar', 'irrigacao', 'chuva', 'colheita']);

export function auditDiary(farm: FarmData, today: string): DiaryIssue[] {
  const out: DiaryIssue[] = [];
  for (const tl of farm.talhoes) {
    const diary = tl.diary || [];
    const k = tl.crop ? cropKey(tl.crop) : '';
    const seen = new Set<string>();
    for (const d of diary) {
      const add = (code: string, detail: string) => out.push({ talhaoId: tl.id, entryId: d.id, date: d.date, code, detail });
      if (d.date > today) add('data_futura', `registro de ${d.type} com data depois de hoje (${d.date})`);
      if (NEEDS_AMOUNT.has(d.type) && !(typeof d.amount === 'number' && d.amount > 0)) add('sem_quantidade', `${d.type} em ${d.date} sem quantidade/dose`);
      if (d.type === 'colheita' && typeof d.amount === 'number' && d.amount > 0 && HARVEST_RANGE[k]) {
        const [lo, hi] = HARVEST_RANGE[k];
        if (d.amount < lo || d.amount > hi) add('valor_improvavel', `colheita de ${d.amount} ${d.unit || 'sc/ha'} em ${d.date} parece fora do normal para ${k} (esperado ${lo} a ${hi})`);
      }
      if (['plantio', 'adubacao', 'aplicacao', 'foliar'].includes(d.type) && !d.product) add('sem_produto', `${d.type} em ${d.date} sem produto/cultivar`);
      const key = `${d.date}|${d.type}|${d.amount ?? ''}|${d.product ?? ''}`;
      if (seen.has(key)) add('duplicado', `registro repetido de ${d.type} em ${d.date}`); else seen.add(key);
    }
    if (tl.plantingDate && !diary.some((d) => d.type === 'plantio')) out.push({ talhaoId: tl.id, code: 'plantio_fora_do_diario', detail: `plantio em ${tl.plantingDate} ainda não está registrado no diário` });
    if (tl.plantingDate && tl.plantingDate > today) out.push({ talhaoId: tl.id, code: 'data_futura', detail: `data de plantio (${tl.plantingDate}) é depois de hoje` });
  }
  return out;
}
