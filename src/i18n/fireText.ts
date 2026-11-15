import { getCurrentLanguage } from './index';
type D = Record<string, string>;

const pt: D = {
  bannerNear: 'Alerta de queimada: {n} foco(s) de calor a {km} km de {field}.',
  bannerIn: 'Alerta de queimada: foco de calor DENTRO de {field}.',
  see: 'Ver no mapa', mute: 'Silenciar som', unmute: 'Ativar som', dismiss: 'Fechar aviso',
  pillNone: 'Focos de calor (NASA FIRMS): nenhum perto da fazenda nas últimas 48 h · atualizado {t}',
  pillSome: 'Focos de calor (NASA FIRMS): {n} na região nas últimas 48 h · atualizado {t}',
  pillOff: 'Alerta de queimadas indisponível agora',
  pillNotSetUp: 'Alerta de queimadas ainda não configurado neste servidor',
  title: 'Foco de calor detectado por satélite', close: 'Fechar',
  when: 'Detectado em', sat: 'Satélite', conf: 'Confiança', frp: 'Potência do fogo (FRP)', where: 'Posição',
  dist: 'Distância da fazenda', inside: 'dentro do talhão {field}', away: '{km} km de {field}, direção {dir}',
  confh: 'alta', confn: 'nominal', confl: 'baixa',
  whatT: 'O que é este alerta',
  what: 'O satélite NASA/NOAA (sensor VIIRS, pixel de 375 m) viu uma área bem mais quente que o entorno. Costuma ser fogo ativo: queimada, incêndio ou queima de resteva. Não é confirmação: pode ser uma fonte de calor industrial, e um fogo pequeno pode passar despercebido. Há atraso de cerca de 3 horas entre a passagem do satélite e o aviso.',
  doT: 'O que fazer',
  do: 'Confirme no local ou por telefone com quem está perto.|Se houver fogo perto de lavoura, pasto ou mata, ligue para o Corpo de Bombeiros: 193.|Proteja aceiros, máquinas e paiol; avise vizinhos e funcionários.|Registre no diário de safra se a lavoura foi atingida (seguro e laudo agrícola).',
  src: 'Fonte: NASA FIRMS (LANCE), satélites NOAA-20 e NOAA-21. Dados abertos.',
  dirs: 'N|NE|L|SE|S|SO|O|NO',
};
const en: D = {
  bannerNear: 'Fire alert: {n} heat hotspot(s) {km} km from {field}.',
  bannerIn: 'Fire alert: heat hotspot INSIDE {field}.',
  see: 'Show on map', mute: 'Mute sound', unmute: 'Turn sound on', dismiss: 'Dismiss',
  pillNone: 'Heat hotspots (NASA FIRMS): none near the farm in the last 48 h · updated {t}',
  pillSome: 'Heat hotspots (NASA FIRMS): {n} in the region in the last 48 h · updated {t}',
  pillOff: 'Fire alert unavailable right now',
  pillNotSetUp: 'Fire alert not set up on this server yet',
  title: 'Heat hotspot detected by satellite', close: 'Close',
  when: 'Detected at', sat: 'Satellite', conf: 'Confidence', frp: 'Fire radiative power (FRP)', where: 'Position',
  dist: 'Distance from the farm', inside: 'inside field {field}', away: '{km} km from {field}, direction {dir}',
  confh: 'high', confn: 'nominal', confl: 'low',
  whatT: 'What this alert is',
  what: 'A NASA/NOAA satellite (VIIRS sensor, 375 m pixel) saw an area much hotter than its surroundings. It is usually an active fire: a wildfire, a burn-off or stubble burning. It is not a confirmation: it can be an industrial heat source, and a small fire can go unseen. There is a delay of about 3 hours between the satellite pass and the alert.',
  doT: 'What to do',
  do: 'Confirm on site or by phone with someone nearby.|If there is fire near crops, pasture or forest, call the fire brigade (Brazil: 193).|Protect firebreaks, machinery and storage; warn neighbours and staff.|Log in the crop diary if the field was hit (insurance and agronomic report).',
  src: 'Source: NASA FIRMS (LANCE), NOAA-20 and NOAA-21 satellites. Open data.',
  dirs: 'N|NE|E|SE|S|SW|W|NW',
};
const es: D = {
  bannerNear: 'Alerta de quema: {n} foco(s) de calor a {km} km de {field}.',
  bannerIn: 'Alerta de quema: foco de calor DENTRO de {field}.',
  see: 'Ver en el mapa', mute: 'Silenciar sonido', unmute: 'Activar sonido', dismiss: 'Cerrar aviso',
  pillNone: 'Focos de calor (NASA FIRMS): ninguno cerca de la finca en las últimas 48 h · actualizado {t}',
  pillSome: 'Focos de calor (NASA FIRMS): {n} en la región en las últimas 48 h · actualizado {t}',
  pillOff: 'Alerta de quemas no disponible ahora',
  pillNotSetUp: 'Alerta de quemas aún no configurado en este servidor',
  title: 'Foco de calor detectado por satélite', close: 'Cerrar',
  when: 'Detectado el', sat: 'Satélite', conf: 'Confianza', frp: 'Potencia del fuego (FRP)', where: 'Posición',
  dist: 'Distancia de la finca', inside: 'dentro de la parcela {field}', away: '{km} km de {field}, dirección {dir}',
  confh: 'alta', confn: 'nominal', confl: 'baja',
  whatT: 'Qué es esta alerta',
  what: 'Un satélite NASA/NOAA (sensor VIIRS, píxel de 375 m) vio un área mucho más caliente que su entorno. Suele ser fuego activo: incendio, quema o quema de rastrojo. No es una confirmación: puede ser una fuente de calor industrial, y un fuego pequeño puede pasar inadvertido. Hay un retraso de unas 3 horas entre el paso del satélite y el aviso.',
  doT: 'Qué hacer',
  do: 'Confirme en el lugar o por teléfono con alguien cercano.|Si hay fuego cerca de cultivo, pasto o monte, llame a los bomberos (Brasil: 193).|Proteja cortafuegos, máquinas y depósito; avise a vecinos y empleados.|Registre en el diario si la parcela fue afectada (seguro e informe agronómico).',
  src: 'Fuente: NASA FIRMS (LANCE), satélites NOAA-20 y NOAA-21. Datos abiertos.',
  dirs: 'N|NE|E|SE|S|SO|O|NO',
};
const ALL: Record<string, D> = { pt, en, es };
export function ft(key: string, params?: Record<string, string | number>): string {
  let s = (ALL[getCurrentLanguage()] || en)[key] ?? en[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
}
