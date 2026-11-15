import { getCurrentLanguage } from './index';
type D = Record<string, string>;
const pt: D = {
  clear: 'Céu limpo', partly: 'Parcialmente nublado', cloudy: 'Nublado', rain: 'Chuva', storm: 'Tempestade',
  light: 'fraca', moderate: 'moderada', heavy: 'forte',
  srcOpenMeteo: 'Fonte: Open-Meteo, agora', srcNasa: 'Fonte: NASA POWER, último dado ({d})', srcEstimate: 'Estimado pela época do ano (sem dados no momento)', srcManual: 'Corrigido por você',
  fix: 'Corrigir o clima', auto: 'Voltar ao automático', fixTitle: 'Como está o tempo aí agora?',
  rainLbl: 'Chuva', humLbl: 'Umidade', windLbl: 'Vento',
};
const en: D = {
  clear: 'Clear sky', partly: 'Partly cloudy', cloudy: 'Cloudy', rain: 'Rain', storm: 'Thunderstorm',
  light: 'light', moderate: 'moderate', heavy: 'heavy',
  srcOpenMeteo: 'Source: Open-Meteo, now', srcNasa: 'Source: NASA POWER, latest data ({d})', srcEstimate: 'Estimated from the time of year (no data right now)', srcManual: 'Set by you',
  fix: 'Correct the weather', auto: 'Back to automatic', fixTitle: 'What is the weather like there now?',
  rainLbl: 'Rain', humLbl: 'Humidity', windLbl: 'Wind',
};
const es: D = {
  clear: 'Cielo despejado', partly: 'Parcialmente nublado', cloudy: 'Nublado', rain: 'Lluvia', storm: 'Tormenta',
  light: 'débil', moderate: 'moderada', heavy: 'fuerte',
  srcOpenMeteo: 'Fuente: Open-Meteo, ahora', srcNasa: 'Fuente: NASA POWER, último dato ({d})', srcEstimate: 'Estimado según la época del año (sin datos por ahora)', srcManual: 'Corregido por ti',
  fix: 'Corregir el clima', auto: 'Volver al automático', fixTitle: '¿Cómo está el tiempo ahí ahora?',
  rainLbl: 'Lluvia', humLbl: 'Humedad', windLbl: 'Viento',
};
const de: D = {
  clear: 'Klarer Himmel', partly: 'Teilweise bewölkt', cloudy: 'Bewölkt', rain: 'Regen', storm: 'Gewitter',
  light: 'leicht', moderate: 'mäßig', heavy: 'stark',
  srcOpenMeteo: 'Quelle: Open-Meteo, jetzt', srcNasa: 'Quelle: NASA POWER, letzter Wert ({d})', srcEstimate: 'Nach Jahreszeit geschätzt (derzeit keine Daten)', srcManual: 'Von Ihnen korrigiert',
  fix: 'Wetter korrigieren', auto: 'Zurück zu automatisch', fixTitle: 'Wie ist das Wetter dort gerade?',
  rainLbl: 'Regen', humLbl: 'Feuchte', windLbl: 'Wind',
};
const fr: D = {
  clear: 'Ciel dégagé', partly: 'Partiellement nuageux', cloudy: 'Nuageux', rain: 'Pluie', storm: 'Orage',
  light: 'faible', moderate: 'modérée', heavy: 'forte',
  srcOpenMeteo: 'Source : Open-Meteo, maintenant', srcNasa: 'Source : NASA POWER, dernière donnée ({d})', srcEstimate: "Estimé selon la période de l'année (pas de données pour l'instant)", srcManual: 'Corrigé par vous',
  fix: 'Corriger la météo', auto: 'Revenir en automatique', fixTitle: 'Quel temps fait-il là-bas maintenant ?',
  rainLbl: 'Pluie', humLbl: 'Humidité', windLbl: 'Vent',
};
const ALL: Record<string, D> = { pt, en, es, de, fr };
export function wt(key: string, params?: Record<string, string | number>): string {
  let s = (ALL[getCurrentLanguage()] || en)[key] ?? en[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
}
