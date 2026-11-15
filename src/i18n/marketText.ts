import { curSymbol } from '../utils/currency';
import { getCurrentLanguage } from './index';

type D = Record<string, string>;

const pt: D = {
  exTag: 'exemplo', realTag: 'real', partialNote: 'Culturas marcadas "exemplo" ainda usam valores ilustrativos. O preço real é a referência internacional convertida pelo dólar; o preço na sua praça pode ser diferente, por isso você pode ajustar.',
  decisionLoss: 'Com estes preços nenhuma estratégia cobre o custo. A menos negativa é {name}: margem base de {m} por hectare. Revise custos e culturas.',
  title: 'Mercado e margem estimada', exampleBadge: 'Dados de exemplo', realBadge: 'Dados de mercado',
  exampleNote: 'Preços, tendências e custos abaixo são ilustrativos até a série real ser carregada. Você pode digitar o seu preço e o seu custo.',
  realNote: 'Fonte: {src} ({date}).',
  crop: 'Cultura', price: 'Preço', trend: '12 meses', cost: 'Custo ({cur}/ha)', yourValue: 'edite com o seu valor', reset: 'Restaurar valores',
  stress: 'Teste de preço', stressHelp: 'Simule uma queda ou alta de preço em todas as culturas e veja a decisão mudar.', stressNow: 'Preços {v}',
  margin: 'Margem estimada', perHa: 'por hectare', total: 'no talhão ({ha} ha)', pess: 'Pessimista', base: 'Base', opt: 'Otimista',
  best: 'Melhor margem com o risco considerado', loss: 'No cenário pessimista esta estratégia dá prejuízo.', yieldAdj: 'Produtividade usada: {v} {u}/ha (ajustada pelo risco)',
  decision: 'Melhor opção, olhando clima, lavoura e mercado', decisionText: '{name}. Deve sobrar cerca de {m} por hectare ({t} no talhão inteiro). Risco {risk}.',
  decisionNone: 'Nenhuma estratégia tem risco aceitável com os dados atuais; revise as datas ou as culturas.',
  foot: 'Estimativa para planejamento, não é recomendação de compra ou venda. Margem = produtividade × preço − custo. O preço base aplica metade da variação dos últimos 12 meses (no máximo ±10%); os cenários usam a volatilidade de cada cultura e produtividade de −15% a +10%. A produtividade cai com o risco da estratégia.',
  noMarket: 'Sem dado de mercado para esta cultura.', cover: 'Cobertura sem venda: só o custo entra na conta; o ganho vem do solo.',
  up: 'alta', down: 'queda', cmp: 'Comparar margens',
};

const en: D = {
  exTag: 'example', realTag: 'real', partialNote: 'Crops tagged "example" still use illustrative values. The real price is the international reference converted by the dollar; your local price may differ, so you can adjust it.',
  decisionLoss: 'At these prices no strategy covers its cost. The least negative is {name}: base margin of {m} per hectare. Review costs and crops.',
  title: 'Market and estimated margin', exampleBadge: 'Example data', realBadge: 'Market data',
  exampleNote: 'Prices, trends and costs below are illustrative until the real series is loaded. You can type your own price and cost.',
  realNote: 'Source: {src} ({date}).',
  crop: 'Crop', price: 'Price', trend: '12 months', cost: 'Cost ({cur}/ha)', yourValue: 'edit with your value', reset: 'Reset values',
  stress: 'Price test', stressHelp: 'Simulate a price drop or rise for all crops and watch the decision change.', stressNow: 'Prices {v}',
  margin: 'Estimated margin', perHa: 'per hectare', total: 'on the field ({ha} ha)', pess: 'Pessimistic', base: 'Base', opt: 'Optimistic',
  best: 'Best margin with risk considered', loss: 'In the pessimistic scenario this strategy loses money.', yieldAdj: 'Yield used: {v} {u}/ha (risk-adjusted)',
  decision: 'Combined decision: weather, crop and market', decisionText: 'Best option for this field: {name}, with a base margin of {m} per hectare and {risk} risk. Field margin: {t}.',
  decisionNone: 'No strategy has acceptable risk with the current data; review the dates or crops.',
  foot: 'Planning estimate, not a recommendation to buy or sell. Margin = yield × price − cost. The base price applies half of the last 12 months change (capped at ±10%); scenarios use each crop volatility and yield from −15% to +10%. Yield drops with the strategy risk.',
  noMarket: 'No market data for this crop.', cover: 'Cover crop with no sale: only the cost counts; the gain comes from the soil.',
  up: 'up', down: 'down', cmp: 'Compare margins',
};

const es: D = {
  exTag: 'ejemplo', realTag: 'real', partialNote: 'Los cultivos marcados "ejemplo" aún usan valores ilustrativos. El precio real es la referencia internacional convertida por el dólar; su precio local puede diferir, por eso puede ajustarlo.',
  decisionLoss: 'Con estos precios ninguna estrategia cubre el costo. La menos negativa es {name}: margen base de {m} por hectárea. Revise costos y cultivos.',
  title: 'Mercado y margen estimado', exampleBadge: 'Datos de ejemplo', realBadge: 'Datos de mercado',
  exampleNote: 'Los precios, tendencias y costos de abajo son ilustrativos hasta cargar la serie real. Puede escribir su precio y su costo.',
  realNote: 'Fuente: {src} ({date}).',
  crop: 'Cultivo', price: 'Precio', trend: '12 meses', cost: 'Costo ({cur}/ha)', yourValue: 'edite con su valor', reset: 'Restaurar valores',
  stress: 'Prueba de precio', stressHelp: 'Simule una caída o alza de precio en todos los cultivos y vea cambiar la decisión.', stressNow: 'Precios {v}',
  margin: 'Margen estimado', perHa: 'por hectárea', total: 'en el lote ({ha} ha)', pess: 'Pesimista', base: 'Base', opt: 'Optimista',
  best: 'Mejor margen considerando el riesgo', loss: 'En el escenario pesimista esta estrategia da pérdida.', yieldAdj: 'Rendimiento usado: {v} {u}/ha (ajustado por riesgo)',
  decision: 'Decisión combinada: clima, cultivo y mercado', decisionText: 'Mejor opción para este lote: {name}, con margen base de {m} por hectárea y riesgo {risk}. Margen en el lote: {t}.',
  decisionNone: 'Ninguna estrategia tiene riesgo aceptable con los datos actuales; revise las fechas o los cultivos.',
  foot: 'Estimación para planificación, no es recomendación de compra o venta. Margen = rendimiento × precio − costo. El precio base aplica la mitad de la variación de los últimos 12 meses (máximo ±10%); los escenarios usan la volatilidad de cada cultivo y rendimiento de −15% a +10%. El rendimiento baja con el riesgo de la estrategia.',
  noMarket: 'Sin datos de mercado para este cultivo.', cover: 'Cobertura sin venta: solo cuenta el costo; la ganancia viene del suelo.',
  up: 'alza', down: 'caída', cmp: 'Comparar márgenes',
};

const de: D = {
  exTag: 'Beispiel', realTag: 'echt', partialNote: 'Mit "Beispiel" markierte Kulturen verwenden noch Beispielwerte. Der echte Preis ist die internationale Referenz, umgerechnet mit dem Dollar; Ihr lokaler Preis kann abweichen, daher können Sie ihn anpassen.',
  decisionLoss: 'Bei diesen Preisen deckt keine Strategie die Kosten. Am wenigsten negativ ist {name}: Basismarge von {m} pro Hektar. Prüfen Sie Kosten und Kulturen.',
  title: 'Markt und geschätzte Marge', exampleBadge: 'Beispieldaten', realBadge: 'Marktdaten',
  exampleNote: 'Preise, Trends und Kosten unten sind Beispiele, bis die echte Reihe geladen ist. Sie können Ihren eigenen Preis und Ihre Kosten eingeben.',
  realNote: 'Quelle: {src} ({date}).',
  crop: 'Kultur', price: 'Preis', trend: '12 Monate', cost: 'Kosten ({cur}/ha)', yourValue: 'mit Ihrem Wert bearbeiten', reset: 'Werte zurücksetzen',
  stress: 'Preistest', stressHelp: 'Simulieren Sie einen Preisrückgang oder -anstieg für alle Kulturen und sehen Sie, wie sich die Entscheidung ändert.', stressNow: 'Preise {v}',
  margin: 'Geschätzte Marge', perHa: 'pro Hektar', total: 'auf dem Schlag ({ha} ha)', pess: 'Pessimistisch', base: 'Basis', opt: 'Optimistisch',
  best: 'Beste Marge unter Berücksichtigung des Risikos', loss: 'Im pessimistischen Szenario macht diese Strategie Verlust.', yieldAdj: 'Verwendeter Ertrag: {v} {u}/ha (risikoangepasst)',
  decision: 'Gemeinsame Entscheidung: Wetter, Kultur und Markt', decisionText: 'Beste Option für diesen Schlag: {name}, mit Basismarge von {m} pro Hektar und {risk} Risiko. Marge auf dem Schlag: {t}.',
  decisionNone: 'Keine Strategie hat mit den aktuellen Daten ein akzeptables Risiko; prüfen Sie Daten oder Kulturen.',
  foot: 'Planungsschätzung, keine Kauf- oder Verkaufsempfehlung. Marge = Ertrag × Preis − Kosten. Der Basispreis berücksichtigt die Hälfte der Veränderung der letzten 12 Monate (maximal ±10 %); die Szenarien nutzen die Volatilität jeder Kultur und Erträge von −15 % bis +10 %. Der Ertrag sinkt mit dem Risiko der Strategie.',
  noMarket: 'Keine Marktdaten für diese Kultur.', cover: 'Zwischenfrucht ohne Verkauf: nur die Kosten zählen; der Nutzen liegt im Boden.',
  up: 'Anstieg', down: 'Rückgang', cmp: 'Margen vergleichen',
};


const fr: D = {
  exTag: 'exemple', realTag: 'réel', partialNote: 'Les cultures marquées « exemple » utilisent encore des valeurs illustratives. Le prix réel est la référence internationale convertie par le dollar ; votre prix local peut différer, vous pouvez donc l’ajuster.',
  decisionLoss: 'À ces prix, aucune stratégie ne couvre son coût. La moins négative est {name} : marge de base de {m} par hectare. Revoyez coûts et cultures.',
  title: 'Marché et marge estimée', exampleBadge: 'Données d’exemple', realBadge: 'Données de marché',
  exampleNote: 'Les prix, tendances et coûts ci-dessous sont illustratifs jusqu’au chargement de la série réelle. Vous pouvez saisir votre prix et votre coût.',
  realNote: 'Source : {src} ({date}).',
  crop: 'Culture', price: 'Prix', trend: '12 mois', cost: 'Coût ({cur}/ha)', yourValue: 'modifiez avec votre valeur', reset: 'Rétablir les valeurs',
  stress: 'Test de prix', stressHelp: 'Simulez une baisse ou une hausse de prix pour toutes les cultures et voyez la décision changer.', stressNow: 'Prix {v}',
  margin: 'Marge estimée', perHa: 'par hectare', total: 'sur la parcelle ({ha} ha)', pess: 'Pessimiste', base: 'Base', opt: 'Optimiste',
  best: 'Meilleure marge en tenant compte du risque', loss: 'Dans le scénario pessimiste, cette stratégie est déficitaire.', yieldAdj: 'Rendement utilisé : {v} {u}/ha (ajusté au risque)',
  decision: 'Décision combinée : climat, culture et marché', decisionText: 'Meilleure option pour cette parcelle : {name}, avec une marge de base de {m} par hectare et un risque {risk}. Marge sur la parcelle : {t}.',
  decisionNone: 'Aucune stratégie n’a un risque acceptable avec les données actuelles ; revoyez les dates ou les cultures.',
  foot: 'Estimation de planification, pas une recommandation d’achat ou de vente. Marge = rendement × prix − coût. Le prix de base applique la moitié de la variation des 12 derniers mois (plafonnée à ±10 %) ; les scénarios utilisent la volatilité de chaque culture et un rendement de −15 % à +10 %. Le rendement baisse avec le risque de la stratégie.',
  noMarket: 'Pas de données de marché pour cette culture.', cover: 'Couvert sans vente : seul le coût compte ; le gain vient du sol.',
  up: 'hausse', down: 'baisse', cmp: 'Comparer les marges',
};

const ALL: Record<string, D> = { pt, en, es, de, fr };

export function mt(key: string, params?: Record<string, string | number>): string {
  let s = (ALL[getCurrentLanguage()] || en)[key] ?? en[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  if (s.includes("{cur}")) s = s.split("{cur}").join(curSymbol());
  return s;
}
