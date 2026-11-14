import { getCurrentLanguage } from './index';
type D = Record<string, string>;
const pt: D = {
  btn: 'Estresse hídrico', btnOn: 'Ocultar estresse hídrico', loading: 'Lendo imagens do ECOSTRESS…',
  pillSome: 'ECOSTRESS (NASA): {n} talhão(ões) com sinal de falta d\'água · imagem mais recente de {d}',
  pillNone: 'ECOSTRESS (NASA): nenhum talhão com sinal de falta d\'água · imagem mais recente de {d}',
  pillNoMatch: 'ECOSTRESS: ainda não há análise para os talhões desta fazenda.',
  pillOff: 'Análise de estresse hídrico indisponível agora.',
  lvAtencao: 'Sinal de falta d\'água', lvOk: 'Sem sinal de falta d\'água', lvSem: 'Sem imagem útil',
  title: 'Estresse hídrico por satélite', close: 'Fechar',
  imgDay: 'Dia da imagem', imgAge: 'Idade da imagem', ageVal: 'há {n} dia(s)', esi: 'Índice ESI na imagem', esiPrev: 'ESI na imagem anterior', zona: 'Parte do talhão abaixo do limite', valid: 'Área do talhão com leitura válida',
  rainAfter: 'Chuva depois da imagem (NASA POWER)', rainLoading: '…', rainNone: 'sem chuva registrada', rainPending: 'ainda sem dado da NASA', rainVal: '{mm} mm em {n} dia(s) até {d}',
  rainWarn: 'Choveu {mm} mm depois do dia da imagem. A planta pode já ter se recuperado: o estresse mostrado pode ser de antes da chuva. Confira no talhão.',
  rainLag: 'A NASA ainda não publicou a chuva dos últimos {n} dia(s); pode ter chovido depois de {d}.',
  banner: 'Esta é a foto de {d}',
  whatT: 'Como ler', what: 'O ECOSTRESS é um sensor da NASA na Estação Espacial Internacional que mede a temperatura da planta. O índice ESI compara quanta água a planta está transpirando com quanto ela poderia transpirar: perto de 1, ela tem água; perto de 0, ela está sofrendo. Cada imagem vale só para o dia em que foi tirada. O satélite não passa todo dia e nuvem esconde o talhão, por isso a tela mostra sempre o dia da imagem e a chuva que veio depois. É triagem ("vá conferir aqui"), não diagnóstico. O limite de 0,50 é uma referência aproximada.',
  src: 'Fonte: ECOSTRESS L4T ESI v002 (NASA/LP DAAC), 70 m. Análise gerada em {g}; os dados da NASA chegam com atraso de algumas semanas.',
};
const en: D = {
  btn: 'Water stress', btnOn: 'Hide water stress', loading: 'Reading ECOSTRESS images…',
  pillSome: 'ECOSTRESS (NASA): {n} field(s) with a water stress sign · latest image of {d}',
  pillNone: 'ECOSTRESS (NASA): no field with a water stress sign · latest image of {d}',
  pillNoMatch: 'ECOSTRESS: no analysis yet for this farm\'s fields.',
  pillOff: 'Water stress analysis unavailable right now.',
  lvAtencao: 'Water stress sign', lvOk: 'No water stress sign', lvSem: 'No usable image',
  title: 'Water stress by satellite', close: 'Close',
  imgDay: 'Image date', imgAge: 'Image age', ageVal: '{n} day(s) ago', esi: 'ESI in the image', esiPrev: 'ESI in the previous image', zona: 'Share of the field below the limit', valid: 'Field area with a valid reading',
  rainAfter: 'Rain after the image (NASA POWER)', rainLoading: '…', rainNone: 'no rain recorded', rainPending: 'no NASA data yet', rainVal: '{mm} mm over {n} day(s) up to {d}',
  rainWarn: 'It rained {mm} mm after the image date. The crop may already have recovered: the stress shown may predate the rain. Check the field.',
  rainLag: 'NASA has not yet published rain for the last {n} day(s); it may have rained after {d}.',
  banner: 'This is the picture of {d}',
  whatT: 'How to read it', what: 'ECOSTRESS is a NASA sensor on the International Space Station that measures plant temperature. The ESI index compares how much water the plant is transpiring with how much it could: near 1 it has water; near 0 it is suffering. Each image is valid only for the day it was taken. The satellite does not pass every day and clouds hide the field, so the screen always shows the image date and the rain that came after. It is triage ("go check here"), not a diagnosis. The 0.50 limit is an approximate reference.',
  src: 'Source: ECOSTRESS L4T ESI v002 (NASA/LP DAAC), 70 m. Analysis generated on {g}; NASA data arrives with a delay of a few weeks.',
};
const es: D = {
  btn: 'Estrés hídrico', btnOn: 'Ocultar estrés hídrico', loading: 'Leyendo imágenes de ECOSTRESS…',
  pillSome: 'ECOSTRESS (NASA): {n} parcela(s) con señal de falta de agua · imagen más reciente del {d}',
  pillNone: 'ECOSTRESS (NASA): ninguna parcela con señal de falta de agua · imagen más reciente del {d}',
  pillNoMatch: 'ECOSTRESS: aún no hay análisis para las parcelas de esta finca.',
  pillOff: 'Análisis de estrés hídrico no disponible ahora.',
  lvAtencao: 'Señal de falta de agua', lvOk: 'Sin señal de falta de agua', lvSem: 'Sin imagen útil',
  title: 'Estrés hídrico por satélite', close: 'Cerrar',
  imgDay: 'Día de la imagen', imgAge: 'Antigüedad de la imagen', ageVal: 'hace {n} día(s)', esi: 'Índice ESI en la imagen', esiPrev: 'ESI en la imagen anterior', zona: 'Parte de la parcela bajo el límite', valid: 'Área de la parcela con lectura válida',
  rainAfter: 'Lluvia después de la imagen (NASA POWER)', rainLoading: '…', rainNone: 'sin lluvia registrada', rainPending: 'aún sin dato de la NASA', rainVal: '{mm} mm en {n} día(s) hasta {d}',
  rainWarn: 'Llovió {mm} mm después del día de la imagen. El cultivo puede haberse recuperado: el estrés mostrado puede ser anterior a la lluvia. Revise la parcela.',
  rainLag: 'La NASA aún no publicó la lluvia de los últimos {n} día(s); puede haber llovido después del {d}.',
  banner: 'Esta es la foto del {d}',
  whatT: 'Cómo leerlo', what: 'ECOSTRESS es un sensor de la NASA en la Estación Espacial Internacional que mide la temperatura de la planta. El índice ESI compara cuánta agua transpira la planta con cuánta podría transpirar: cerca de 1 tiene agua; cerca de 0 sufre. Cada imagen vale solo para el día en que fue tomada. El satélite no pasa todos los días y las nubes ocultan la parcela, por eso la pantalla muestra siempre el día de la imagen y la lluvia posterior. Es triaje ("vaya a revisar aquí"), no diagnóstico. El límite de 0,50 es una referencia aproximada.',
  src: 'Fuente: ECOSTRESS L4T ESI v002 (NASA/LP DAAC), 70 m. Análisis generado el {g}; los datos de la NASA llegan con unas semanas de retraso.',
};
const ALL: Record<string, D> = { pt, en, es };
export function wt(key: string, params?: Record<string, string | number>): string {
  let s = (ALL[getCurrentLanguage()] || en)[key] ?? en[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
}
