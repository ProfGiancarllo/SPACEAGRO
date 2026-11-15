import { getCurrentLanguage } from './index';

type D = Record<string, string>;

const pt: D = {
  mapMax: 'Maximizar', mapRestore: 'Sair da tela cheia',
  advShort: '+1 semana', subShort: '{farm} · {n} talhões · {ha}',
  wxMore: 'Ver previsão completa', close: 'Fechar',
  navSafra: 'Safra', navFields: 'Talhões', navStruct: 'Estruturas e água', navFarm: 'Fazenda', secPlan: 'Planejamento', secRecords: 'Registros', secCoords: 'Por coordenadas', secFiles: 'Arquivos', secView: 'Visualizar',
  wxTitle: 'Clima na fazenda', subStruct: '{n} estruturas e pontos de água', updated: 'Atualizado às {t}', now: 'Agora', tomorrow: 'Amanhã', tomorrowLc: 'amanhã', today: 'hoje', tempLine: 'Temperatura prevista por hora', hoursAria: 'Previsão por hora', sprayOk: 'Hora boa para pulverizar', pop: 'Chance de chuva', feels: 'Sensação', sunrise: 'Nascer do sol', sunset: 'Pôr do sol', spray: 'Pulverizar', sprayNone: 'sem janela boa nas próximas 24 h', sprayRule: 'Janela de pelo menos 2 h com chance de chuva abaixo de 30%, vento de 3 a 10 km/h, temperatura abaixo de 30 °C e umidade a partir de 55%.', h48: 'Previsão para 48 horas', h12: 'Próximas 12 horas', noHourly: 'Previsão por hora indisponível agora (sem conexão com o Open-Meteo)', simNote: 'Previsão real de hoje; a data de referência do app está simulada.', rainAt: 'Chuva provável {p}.', morning: 'pela manhã', afternoon: 'à tarde', night: 'à noite', maxmin: 'Máxima de {max}°C e mínima de {min}°C.',
  play: 'Continuar', pause: 'Pausar', base12: 'variação em 12 meses', cmTitle: 'Commodities do agro', cmNone: 'Sem cotações carregadas.', cmHist: 'Preço nos últimos meses', per: 'por',
  onFarm: 'na fazenda', prev: 'Anteriores', next: 'Próximos', fxNote: 'cotação comercial',
  title: 'Visão geral da fazenda', sub: '{farm} · {n} talhões · {ha} · Data de referência {d}',
  mapTitle: 'Mapa da propriedade', mapSub: 'Imagem de satélite com os talhões cadastrados', center: 'Centralizar',
  wxLoading: 'Carregando clima…', wxFix: 'Corrigir', wxAuto: 'Voltar ao automático', wxPick: 'Como está o tempo agora?',
  hum: 'Umidade', wind: 'Vento', rain: 'Chuva',
  mkTitle: 'Mercado agrícola', mkOpen: 'Abrir painel de mercado', mk12: '12 meses', fx: 'Dólar',
};
const en: D = {
  mapMax: 'Maximize', mapRestore: 'Exit full screen',
  advShort: '+1 week', subShort: '{farm} · {n} fields · {ha}',
  wxMore: 'See full forecast', close: 'Close',
  navSafra: 'Season', navFields: 'Fields', navStruct: 'Structures and water', navFarm: 'Farm', secPlan: 'Planning', secRecords: 'Records', secCoords: 'By coordinates', secFiles: 'Files', secView: 'View',
  wxTitle: 'Weather on the farm', subStruct: '{n} structures and water points', updated: 'Updated at {t}', now: 'Now', tomorrow: 'Tomorrow', tomorrowLc: 'tomorrow', today: 'today', tempLine: 'Hourly forecast temperature', hoursAria: 'Hourly forecast', sprayOk: 'Good hour for spraying', pop: 'Chance of rain', feels: 'Feels like', sunrise: 'Sunrise', sunset: 'Sunset', spray: 'Spray', sprayNone: 'no good window in the next 24 h', sprayRule: 'Window of at least 2 h with rain chance below 30%, wind 3 to 10 km/h, temperature below 30 °C and humidity of 55% or more.', h48: '48-hour forecast', h12: 'Next 12 hours', noHourly: 'Hourly forecast unavailable right now (no connection to Open-Meteo)', simNote: 'Real forecast for today; the app reference date is simulated.', rainAt: 'Rain likely {p}.', morning: 'in the morning', afternoon: 'in the afternoon', night: 'at night', maxmin: 'High of {max}°C and low of {min}°C.',
  play: 'Resume', pause: 'Pause', base12: '12-month change', cmTitle: 'Farm commodities', cmNone: 'No prices loaded.', cmHist: 'Price over recent months', per: 'per',
  onFarm: 'on your farm', prev: 'Previous', next: 'Next', fxNote: 'commercial rate',
  title: 'Farm overview', sub: '{farm} · {n} fields · {ha} · Reference date {d}',
  mapTitle: 'Property map', mapSub: 'Satellite image with the registered fields', center: 'Center',
  wxLoading: 'Loading weather…', wxFix: 'Correct', wxAuto: 'Back to automatic', wxPick: 'What is the weather like now?',
  hum: 'Humidity', wind: 'Wind', rain: 'Rain',
  mkTitle: 'Farm market', mkOpen: 'Open market panel', mk12: '12 months', fx: 'US dollar',
};
const es: D = {
  mapMax: 'Maximizar', mapRestore: 'Salir de pantalla completa',
  advShort: '+1 semana', subShort: '{farm} · {n} lotes · {ha}',
  wxMore: 'Ver pronóstico completo', close: 'Cerrar',
  navSafra: 'Cosecha', navFields: 'Lotes', navStruct: 'Estructuras y agua', navFarm: 'Finca', secPlan: 'Planificación', secRecords: 'Registros', secCoords: 'Por coordenadas', secFiles: 'Archivos', secView: 'Ver',
  wxTitle: 'Clima en la finca', subStruct: '{n} estructuras y puntos de agua', updated: 'Actualizado a las {t}', now: 'Ahora', tomorrow: 'Mañana', tomorrowLc: 'mañana', today: 'hoy', tempLine: 'Temperatura prevista por hora', hoursAria: 'Pronóstico por hora', sprayOk: 'Buena hora para pulverizar', pop: 'Probabilidad de lluvia', feels: 'Sensación', sunrise: 'Amanecer', sunset: 'Atardecer', spray: 'Pulverizar', sprayNone: 'sin ventana buena en las próximas 24 h', sprayRule: 'Ventana de al menos 2 h con probabilidad de lluvia menor al 30%, viento de 3 a 10 km/h, temperatura menor a 30 °C y humedad desde 55%.', h48: 'Pronóstico de 48 horas', h12: 'Próximas 12 horas', noHourly: 'Pronóstico por hora no disponible ahora (sin conexión con Open-Meteo)', simNote: 'Pronóstico real de hoy; la fecha de referencia de la app está simulada.', rainAt: 'Lluvia probable {p}.', morning: 'por la mañana', afternoon: 'por la tarde', night: 'por la noche', maxmin: 'Máxima de {max}°C y mínima de {min}°C.',
  play: 'Continuar', pause: 'Pausar', base12: 'variación en 12 meses', cmTitle: 'Commodities agrícolas', cmNone: 'Sin cotizaciones cargadas.', cmHist: 'Precio en los últimos meses', per: 'por',
  onFarm: 'en la finca', prev: 'Anteriores', next: 'Siguientes', fxNote: 'tipo comercial',
  title: 'Resumen de la finca', sub: '{farm} · {n} lotes · {ha} · Fecha de referencia {d}',
  mapTitle: 'Mapa de la propiedad', mapSub: 'Imagen satelital con los lotes registrados', center: 'Centrar',
  wxLoading: 'Cargando clima…', wxFix: 'Corregir', wxAuto: 'Volver al automático', wxPick: '¿Cómo está el tiempo ahora?',
  hum: 'Humedad', wind: 'Viento', rain: 'Lluvia',
  mkTitle: 'Mercado agrícola', mkOpen: 'Abrir panel de mercado', mk12: '12 meses', fx: 'Dólar',
};
const de: D = {
  mapMax: 'Maximieren', mapRestore: 'Vollbild beenden',
  advShort: '+1 Woche', subShort: '{farm} · {n} Schläge · {ha}',
  wxMore: 'Vollständige Vorhersage', close: 'Schließen',
  navSafra: 'Saison', navFields: 'Schläge', navStruct: 'Bauten und Wasser', navFarm: 'Farm', secPlan: 'Planung', secRecords: 'Aufzeichnungen', secCoords: 'Per Koordinaten', secFiles: 'Dateien', secView: 'Ansicht',
  wxTitle: 'Wetter auf der Farm', subStruct: '{n} Bauten und Wasserstellen', updated: 'Aktualisiert um {t}', now: 'Jetzt', tomorrow: 'Morgen', tomorrowLc: 'morgen', today: 'heute', tempLine: 'Vorhergesagte Temperatur pro Stunde', hoursAria: 'Stündliche Vorhersage', sprayOk: 'Gute Stunde zum Spritzen', pop: 'Regenwahrscheinlichkeit', feels: 'Gefühlt', sunrise: 'Sonnenaufgang', sunset: 'Sonnenuntergang', spray: 'Spritzen', sprayNone: 'kein gutes Fenster in den nächsten 24 h', sprayRule: 'Fenster von mindestens 2 h mit Regenwahrscheinlichkeit unter 30 %, Wind 3 bis 10 km/h, Temperatur unter 30 °C und Luftfeuchte ab 55 %.', h48: 'Vorhersage für 48 Stunden', h12: 'Nächste 12 Stunden', noHourly: 'Stündliche Vorhersage gerade nicht verfügbar (keine Verbindung zu Open-Meteo)', simNote: 'Echte Vorhersage für heute; der Stichtag der App ist simuliert.', rainAt: 'Regen wahrscheinlich {p}.', morning: 'am Vormittag', afternoon: 'am Nachmittag', night: 'in der Nacht', maxmin: 'Höchstwert {max}°C, Tiefstwert {min}°C.',
  play: 'Fortsetzen', pause: 'Pausieren', base12: 'Veränderung in 12 Monaten', cmTitle: 'Agrar-Rohstoffe', cmNone: 'Keine Kurse geladen.', cmHist: 'Preis der letzten Monate', per: 'pro',
  onFarm: 'auf der Farm', prev: 'Zurück', next: 'Weiter', fxNote: 'Handelskurs',
  title: 'Überblick über die Farm', sub: '{farm} · {n} Schläge · {ha} · Stichtag {d}',
  mapTitle: 'Karte des Betriebs', mapSub: 'Satellitenbild mit den erfassten Schlägen', center: 'Zentrieren',
  wxLoading: 'Wetter wird geladen…', wxFix: 'Korrigieren', wxAuto: 'Zurück zu automatisch', wxPick: 'Wie ist das Wetter gerade?',
  hum: 'Luftfeuchte', wind: 'Wind', rain: 'Regen',
  mkTitle: 'Agrarmarkt', mkOpen: 'Marktübersicht öffnen', mk12: '12 Monate', fx: 'US-Dollar',
};
const fr: D = {
  mapMax: 'Agrandir', mapRestore: 'Quitter le plein écran',
  advShort: '+1 semaine', subShort: '{farm} · {n} parcelles · {ha}',
  wxMore: 'Voir la prévision complète', close: 'Fermer',
  navSafra: 'Saison', navFields: 'Parcelles', navStruct: 'Structures et eau', navFarm: 'Ferme', secPlan: 'Planification', secRecords: 'Registres', secCoords: 'Par coordonnées', secFiles: 'Fichiers', secView: 'Afficher',
  wxTitle: 'Météo à la ferme', subStruct: '{n} structures et points d’eau', updated: 'Mis à jour à {t}', now: 'Maintenant', tomorrow: 'Demain', tomorrowLc: 'demain', today: 'aujourd’hui', tempLine: 'Température prévue par heure', hoursAria: 'Prévision horaire', sprayOk: 'Bonne heure pour pulvériser', pop: 'Risque de pluie', feels: 'Ressenti', sunrise: 'Lever du soleil', sunset: 'Coucher du soleil', spray: 'Pulvériser', sprayNone: 'aucune bonne fenêtre dans les prochaines 24 h', sprayRule: 'Fenêtre d’au moins 2 h avec risque de pluie sous 30 %, vent de 3 à 10 km/h, température sous 30 °C et humidité d’au moins 55 %.', h48: 'Prévision sur 48 heures', h12: 'Prochaines 12 heures', noHourly: 'Prévision horaire indisponible pour le moment (pas de connexion à Open-Meteo)', simNote: 'Prévision réelle du jour ; la date de référence de l’app est simulée.', rainAt: 'Pluie probable {p}.', morning: 'le matin', afternoon: 'l’après-midi', night: 'la nuit', maxmin: 'Maximale de {max}°C et minimale de {min}°C.',
  play: 'Reprendre', pause: 'Pause', base12: 'variation sur 12 mois', cmTitle: 'Matières premières agricoles', cmNone: 'Aucun cours chargé.', cmHist: 'Prix des derniers mois', per: 'par',
  onFarm: 'sur la ferme', prev: 'Précédents', next: 'Suivants', fxNote: 'cours commercial',
  title: 'Vue d’ensemble de la ferme', sub: '{farm} · {n} parcelles · {ha} · Date de référence {d}',
  mapTitle: 'Carte de la propriété', mapSub: 'Image satellite avec les parcelles enregistrées', center: 'Centrer',
  wxLoading: 'Chargement de la météo…', wxFix: 'Corriger', wxAuto: 'Revenir à l’automatique', wxPick: 'Quel temps fait-il maintenant ?',
  hum: 'Humidité', wind: 'Vent', rain: 'Pluie',
  mkTitle: 'Marché agricole', mkOpen: 'Ouvrir le panneau du marché', mk12: '12 mois', fx: 'Dollar',
};
const ALL: Record<string, D> = { pt, en, es, de, fr };

export function ht(key: string, params?: Record<string, string | number>): string {
  let s = (ALL[getCurrentLanguage()] || en)[key] ?? en[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
}
