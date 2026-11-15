/**
 * Resultado dos testes de modelos de produtividade (Colab MyRoca_passo4_COMPLETO, 15/11/2026).
 * Dados: IBGE (produtividade 2016-2025, 28 municípios do Sudoeste de Goiás) cruzados com NASA POWER,
 * MODIS, SRTM e SoilGrids. Erro = erro médio absoluto em sc/ha.
 */
export type ModelFamily = 'stat' | 'ml';
export interface ModelRow { id: string; family: ModelFamily; soy: number; maize: number; }

/** Teste 1: prever o ano seguinte em municípios já conhecidos (um ano inteiro escondido). */
export const KNOWN_MUNICIPALITY: ModelRow[] = [
  { id: 'M0', family: 'stat', soy: 4.79, maize: 13.79 },
  { id: 'M1', family: 'stat', soy: 6.25, maize: 20.47 },
  { id: 'M2', family: 'stat', soy: 5.89, maize: 16.30 },
  { id: 'M3', family: 'stat', soy: 6.24, maize: 15.30 },
  { id: 'M4', family: 'stat', soy: 6.31, maize: 22.10 },
  { id: 'M5', family: 'ml', soy: 6.28, maize: 14.81 },
  { id: 'M6', family: 'ml', soy: 6.54, maize: 15.22 },
];

/** Teste 2: fazenda nova, sem histórico (um município inteiro escondido). */
export const NEW_FARM = {
  soy: { mean: 5.42, nasa: 4.73 },
  maize: { mean: 13.23, nasa: 10.03 },
};

/** Teste 3: simulação do diário em Rio Verde; erro por número de colheitas registradas (0 a 4). */
export const DIARY_SOY = [5.91, 5.97, 5.48, 5.04, 4.26];
