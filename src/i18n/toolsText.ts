import { getCurrentLanguage } from './index';
type D = Record<string, string>;
const pt: D = {
  rail: 'Ferramentas do mapa', gCreate: 'Criar', gMeasure: 'Medir', gAnalyze: 'Analisar',
  showNames: 'Mostrar nomes', hideNames: 'Só ícones', exit: 'Sair', escHint: 'Esc para sair',
  drawL: 'Desenhar talhão', drawD: 'Clique nos cantos da lavoura; clique no primeiro ponto para fechar.',
  wandL: 'Marcar com um toque', wandD: 'Toque dentro de uma lavoura e o contorno é traçado pela cor da imagem.',
  adjL: 'Ajustar cantos', adjD: 'Arraste os cantos dos talhões até a borda real da lavoura.',
  measL: 'Medir distância e área', measD: 'Clique pontos no mapa para medir em metros, km e hectares.',
  measHint: 'Clique no mapa para marcar pontos. Com 3 pontos ou mais aparece a área.',
  measDist: 'Distância', measArea: 'Área', measUndo: 'Desfazer ponto', measClear: 'Limpar', measSave: 'Salvar como talhão',
  findL: 'Ir para talhão', findD: 'Digite o nome ou a cultura e o mapa leva você até lá.',
  findPh: 'Nome ou cultura (ex.: T12, soja)', findNone: 'Nenhum talhão com esse nome ou cultura.', findEmpty: 'Esta fazenda ainda não tem talhões.',
  satD: 'Mostra os talhões com sinal de problema na última imagem do Landsat (NASA).',
  waterD: 'Mostra os talhões com sinal de falta de água pelo ECOSTRESS (NASA).',
};
const en: D = {
  rail: 'Map tools', gCreate: 'Create', gMeasure: 'Measure', gAnalyze: 'Analyze',
  showNames: 'Show names', hideNames: 'Icons only', exit: 'Exit', escHint: 'Esc to exit',
  drawL: 'Draw field', drawD: 'Click the field corners; click the first point to close.',
  wandL: 'Mark with one tap', wandD: 'Tap inside a field and its outline is traced from the image colors.',
  adjL: 'Adjust corners', adjD: 'Drag field corners to the real edge of the crop.',
  measL: 'Measure distance and area', measD: 'Click points on the map to measure in meters, km and hectares.',
  measHint: 'Click the map to add points. With 3 or more points the area appears.',
  measDist: 'Distance', measArea: 'Area', measUndo: 'Undo point', measClear: 'Clear', measSave: 'Save as field',
  findL: 'Go to field', findD: 'Type the name or crop and the map takes you there.',
  findPh: 'Name or crop (e.g. T12, soy)', findNone: 'No field with that name or crop.', findEmpty: 'This farm has no fields yet.',
  satD: 'Shows fields with a warning sign in the latest Landsat image (NASA).',
  waterD: 'Shows fields with signs of water shortage from ECOSTRESS (NASA).',
};
const es: D = {
  rail: 'Herramientas del mapa', gCreate: 'Crear', gMeasure: 'Medir', gAnalyze: 'Analizar',
  showNames: 'Mostrar nombres', hideNames: 'Solo íconos', exit: 'Salir', escHint: 'Esc para salir',
  drawL: 'Dibujar lote', drawD: 'Haga clic en las esquinas; clic en el primer punto para cerrar.',
  wandL: 'Marcar con un toque', wandD: 'Toque dentro de un lote y el contorno se traza por el color de la imagen.',
  adjL: 'Ajustar esquinas', adjD: 'Arrastre las esquinas hasta el borde real del cultivo.',
  measL: 'Medir distancia y área', measD: 'Haga clic en el mapa para medir en metros, km y hectáreas.',
  measHint: 'Haga clic en el mapa para marcar puntos. Con 3 o más aparece el área.',
  measDist: 'Distancia', measArea: 'Área', measUndo: 'Deshacer punto', measClear: 'Limpiar', measSave: 'Guardar como lote',
  findL: 'Ir al lote', findD: 'Escriba el nombre o el cultivo y el mapa lo lleva allí.',
  findPh: 'Nombre o cultivo (ej.: T12, soja)', findNone: 'Ningún lote con ese nombre o cultivo.', findEmpty: 'Esta finca aún no tiene lotes.',
  satD: 'Muestra los lotes con señal de problema en la última imagen Landsat (NASA).',
  waterD: 'Muestra los lotes con señal de falta de agua según ECOSTRESS (NASA).',
};
const de: D = {
  ...en, rail: 'Kartenwerkzeuge', gCreate: 'Erstellen', gMeasure: 'Messen', gAnalyze: 'Analysieren',
  showNames: 'Namen zeigen', hideNames: 'Nur Symbole', exit: 'Beenden', escHint: 'Esc zum Beenden',
  drawL: 'Feld zeichnen', wandL: 'Mit einem Tipp markieren', adjL: 'Ecken anpassen', measL: 'Strecke und Fläche messen',
  measDist: 'Strecke', measArea: 'Fläche', measUndo: 'Punkt zurück', measClear: 'Leeren', measSave: 'Als Feld speichern', findL: 'Zum Feld',
};
const fr: D = {
  ...en, rail: 'Outils de la carte', gCreate: 'Créer', gMeasure: 'Mesurer', gAnalyze: 'Analyser',
  showNames: 'Afficher les noms', hideNames: 'Icônes seules', exit: 'Quitter', escHint: 'Échap pour quitter',
  drawL: 'Dessiner une parcelle', wandL: 'Marquer d’un toucher', adjL: 'Ajuster les coins', measL: 'Mesurer distance et surface',
  measDist: 'Distance', measArea: 'Surface', measUndo: 'Annuler le point', measClear: 'Effacer', measSave: 'Enregistrer comme parcelle', findL: 'Aller à la parcelle',
};
const ALL: Record<string, D> = { pt, en, es, de, fr };
export function tt(key: string): string {
  return (ALL[getCurrentLanguage()] || pt)[key] ?? pt[key] ?? key;
}
