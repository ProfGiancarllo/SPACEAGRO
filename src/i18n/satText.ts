import { getCurrentLanguage } from './index';
type D = Record<string, string>;
const pt: D = {
  rain: 'Chuva em 14 dias (NASA POWER)', srcNasa: 'Chuva medida pela NASA POWER no período; use junto com o vigor.', dry: 'dias secos',
  btn: 'Saúde por satélite', btnOn: 'Ocultar satélite', loading: 'Lendo análise de satélite…',
  pillSome: 'Satélite NASA (Landsat): {n} talhão(ões) em atenção · imagem de {d}',
  pillNone: 'Satélite NASA (Landsat): nenhum talhão com sinal de problema · imagem de {d}',
  pillNoMatch: 'Satélite: ainda não há análise de satélite para os talhões desta fazenda.',
  pillOff: 'Análise de satélite indisponível agora.',
  lvAtencao: 'Atenção', lvOk: 'Sem sinal de problema', lvSem: 'Sem imagem útil',
  title: 'Saúde da lavoura por satélite', close: 'Fechar',
  img: 'Última imagem útil', ndvi: 'Vigor (NDVI)', esp: 'NDVI esperado para a fase', ndmi: 'Água na folha (NDMI)', pares: 'Mediana dos talhões parecidos', zona: 'Zona fraca no talhão', dap: 'Dias após o plantio', fase: 'Fase estimada',
  whatT: 'Como ler', what: 'O satélite Landsat 8/9 da NASA (30 m por pixel, passa a cada ~8 dias) mede o verde e a água na folha. O alerta compara o talhão com a curva esperada para a cultura e a fase, com talhões parecidos da fazenda e com o próprio histórico. É triagem ("vá conferir aqui"), não diagnóstico: o satélite mostra que algo está diferente, não a causa. A curva esperada é aproximada.',
  src: 'Fonte: Landsat 8/9 Collection 2 Nível-2 (NASA/USGS) via Microsoft Planetary Computer. Análise gerada em {g}; verificada a cada 2 dias.',
};
const en: D = {
  rain: 'Rain in 14 days (NASA POWER)', srcNasa: 'Rain from NASA POWER over the period; read it together with vigor.', dry: 'dry days',
  btn: 'Satellite health', btnOn: 'Hide satellite', loading: 'Reading satellite analysis…',
  pillSome: 'NASA satellite (Landsat): {n} field(s) need attention · image of {d}',
  pillNone: 'NASA satellite (Landsat): no field with a warning sign · image of {d}',
  pillNoMatch: 'Satellite: no satellite analysis yet for this farm\'s fields.',
  pillOff: 'Satellite analysis unavailable right now.',
  lvAtencao: 'Attention', lvOk: 'No sign of a problem', lvSem: 'No usable image',
  title: 'Crop health by satellite', close: 'Close',
  img: 'Latest usable image', ndvi: 'Vigor (NDVI)', esp: 'Expected NDVI for the stage', ndmi: 'Leaf water (NDMI)', pares: 'Median of similar fields', zona: 'Weak zone in the field', dap: 'Days after planting', fase: 'Estimated stage',
  whatT: 'How to read it', what: 'NASA\'s Landsat 8/9 satellite (30 m per pixel, passes about every 8 days) measures greenness and leaf water. The alert compares the field with the curve expected for the crop and stage, with similar fields on the farm and with its own history. It is triage ("go check here"), not a diagnosis: the satellite shows something is different, not the cause. The expected curve is approximate.',
  src: 'Source: Landsat 8/9 Collection 2 Level-2 (NASA/USGS) via Microsoft Planetary Computer. Analysis generated on {g}; checked every 2 days.',
};
const es: D = {
  rain: 'Lluvia en 14 días (NASA POWER)', srcNasa: 'Lluvia de NASA POWER en el período; úsela junto con el vigor.', dry: 'días secos',
  btn: 'Salud por satélite', btnOn: 'Ocultar satélite', loading: 'Leyendo análisis de satélite…',
  pillSome: 'Satélite NASA (Landsat): {n} parcela(s) en atención · imagen del {d}',
  pillNone: 'Satélite NASA (Landsat): ninguna parcela con señal de problema · imagen del {d}',
  pillNoMatch: 'Satélite: aún no hay análisis de satélite para las parcelas de esta finca.',
  pillOff: 'Análisis de satélite no disponible ahora.',
  lvAtencao: 'Atención', lvOk: 'Sin señal de problema', lvSem: 'Sin imagen útil',
  title: 'Salud del cultivo por satélite', close: 'Cerrar',
  img: 'Última imagen útil', ndvi: 'Vigor (NDVI)', esp: 'NDVI esperado para la fase', ndmi: 'Agua en la hoja (NDMI)', pares: 'Mediana de parcelas parecidas', zona: 'Zona débil en la parcela', dap: 'Días tras la siembra', fase: 'Fase estimada',
  whatT: 'Cómo leerlo', what: 'El satélite Landsat 8/9 de la NASA (30 m por píxel, pasa cada ~8 días) mide el verdor y el agua en la hoja. La alerta compara la parcela con la curva esperada para el cultivo y la fase, con parcelas parecidas de la finca y con su propio historial. Es triaje ("vaya a revisar aquí"), no diagnóstico: el satélite muestra que algo es distinto, no la causa. La curva esperada es aproximada.',
  src: 'Fuente: Landsat 8/9 Collection 2 Nivel-2 (NASA/USGS) vía Microsoft Planetary Computer. Análisis generado el {g}; verificado cada 2 días.',
};
const ALL: Record<string, D> = { pt, en, es };
export function st(key: string, params?: Record<string, string | number>): string {
  let s = (ALL[getCurrentLanguage()] || en)[key] ?? en[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
}
